'use strict';

const db = require('../config/database');
const { NotFoundError } = require('../utils/errorHandler');
const { evaluateSignal } = require('../domain/signalEvaluator');
const watchlistService = require('./watchlistService');
const { config } = require('../config');

/**
 * Signals: evaluation orchestration + explainable signal cards.
 * The heavy lifting is in domain/signalEvaluator.js (pure, unit-tested);
 * this service gathers the data and persists results.
 */

/**
 * Evaluate all enabled rules for a watch item against the freshest available
 * offers for that product. Called after fixture ingestion (and later, adapters).
 * @returns {Array} newly created signal events
 */
async function evaluateWatchItem(watchItemId, now = new Date()) {
  const [item] = await db.query(
    `SELECT w.*, p.canonical_name, p.brand, p.variant
     FROM watch_items w JOIN products p ON p.id = w.product_id
     WHERE w.id = $1`,
    [watchItemId],
  );
  if (!item) throw new NotFoundError('Watch item not found');

  const rule = await watchlistService.getRuleForWatchItem(watchItemId);
  if (!rule) return [];

  // Latest observation per mapped retailer listing (portable correlated form).
  const offers = await db.query(
    `SELECT rp.id AS retailer_product_id, rp.retailer_id, rp.retailer_title,
            rp.match_confidence, rp.match_method,
            po.id AS observation_id, po.observed_price, po.member_price,
            po.multi_buy_quantity, po.multi_buy_total, po.promotion_type,
            po.availability_status, po.observed_at
     FROM retailer_products rp
     LEFT JOIN price_observations po
       ON po.id = (
         SELECT po2.id FROM price_observations po2
         WHERE po2.retailer_product_id = rp.id
         ORDER BY po2.observed_at DESC LIMIT 1
       )
     WHERE rp.product_id = $1`,
    [item.product_id],
  );

  const historyRows = await db.query(
    `SELECT po.observed_price AS price
     FROM price_observations po
     JOIN retailer_products rp ON rp.id = po.retailer_product_id
     WHERE rp.product_id = $1
     ORDER BY po.observed_at DESC
     LIMIT 200`,
    [item.product_id],
  );
  const history = historyRows.map((h) => ({ price: Number(h.price) }));

  // Dedup/cooldown: most recent active signal for this watch item.
  const [lastSignal] = await db.query(
    `SELECT triggered_at FROM signal_events
     WHERE watch_item_id = $1 ORDER BY triggered_at DESC LIMIT 1`,
    [watchItemId],
  );
  const lastSignalAt = lastSignal ? lastSignal.triggered_at : null;

  const created = [];
  for (const offer of offers) {
    const signal = evaluateSignal({
      watchItem: item,
      rule,
      offer: {
        matchConfidence: Number(offer.match_confidence),
        price: Number(offer.observed_price),
        memberPrice: offer.member_price != null ? Number(offer.member_price) : null,
        multiBuyQuantity: offer.multi_buy_quantity,
        multiBuyTotal: offer.multi_buy_total,
        promotionType: offer.promotion_type,
        availabilityStatus: offer.availability_status,
        observedAt: offer.observed_at,
      },
      history,
      retailerId: offer.retailer_id,
      lastSignalAt,
      now,
      config: config.signals,
    });

    if (!signal) continue;

    const [retailer] = await db.query('SELECT slug, name FROM retailers WHERE id = $1', [offer.retailer_id]);
    const [event] = await db.query(
      `INSERT INTO signal_events
         (watch_item_id, price_observation_id, retailer_product_id, rule_id, rule_type,
          current_price, baseline_price, historical_low, difference_amount, difference_percent,
          explanation, label, confidence, conditions, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        watchItemId,
        offer.observation_id,
        offer.retailer_product_id,
        rule.id,
        signal.ruleType,
        signal.currentPrice,
        signal.baselinePrice,
        signal.historicalLow,
        signal.differenceAmount,
        signal.differencePercent,
        signal.explanation,
        signal.label,
        signal.confidence,
        JSON.stringify({ ...signal.conditions, retailer: retailer ? retailer.slug : null, retailer_name: retailer ? retailer.name : null }),
        signal.observedAt,
      ],
    );
    created.push(event);
  }
  return created;
}

/** Active signals across the user's watch items (the "Active Signals" screen). */
async function listSignals(userId, { includeDismissed = false } = {}) {
  const statusFilter = includeDismissed ? '' : `AND se.status = 'active'`;
  return db.query(
    `SELECT
       se.id, se.watch_item_id, se.rule_type, se.current_price, se.baseline_price,
       se.historical_low, se.difference_amount, se.difference_percent,
       se.explanation, se.label, se.confidence, se.conditions, se.status,
       se.triggered_at, se.observed_at,
       p.canonical_name, p.brand, p.variant, p.unit, p.net_quantity,
       (SELECT pb.barcode FROM product_barcodes pb WHERE pb.product_id = p.id LIMIT 1) AS barcode
     FROM signal_events se
     JOIN watch_items w ON w.id = se.watch_item_id
     JOIN products p ON p.id = w.product_id
     WHERE w.owner_user_id = $1 ${statusFilter}
     ORDER BY se.triggered_at DESC
     LIMIT 100`,
    [userId],
  );
}

async function dismissSignal(userId, signalId) {
  const result = await db.query(
    `UPDATE signal_events se SET status = 'dismissed'
     FROM watch_items w
     WHERE se.watch_item_id = w.id AND se.id = $1 AND w.owner_user_id = $2
     RETURNING se.id`,
    [signalId, userId],
  );
  if (result.length === 0) throw new NotFoundError('Signal not found');
  return { dismissed: true };
}

/** Snooze per watch item — future observations are suppressed until then. */
async function snoozeSignal(userId, signalId, until) {
  const result = await db.query(
    `UPDATE watch_items
     SET snoozed_until = $3, updated_at = NOW()
     WHERE id = (SELECT se.watch_item_id FROM signal_events se WHERE se.id = $1)
       AND owner_user_id = $2
     RETURNING id`,
    [signalId, userId, until || new Date(Date.now() + 7 * 24 * 3600 * 1000)],
  );
  if (result.length === 0) throw new NotFoundError('Signal not found');
  return { snoozed: true };
}

/** Mark as bought: closes the loop and snoozes briefly (spec section 9.8). */
async function markBought(userId, signalId) {
  const result = await db.query(
    `UPDATE watch_items
     SET last_bought_at = NOW(), snoozed_until = NOW() + INTERVAL '48 hours', updated_at = NOW()
     WHERE id = (SELECT se.watch_item_id FROM signal_events se WHERE se.id = $1)
       AND owner_user_id = $2
     RETURNING id`,
    [signalId, userId],
  );
  if (result.length === 0) throw new NotFoundError('Signal not found');
  await db.query(`UPDATE signal_events SET status = 'acted' WHERE id = $1`, [signalId]);
  return { bought: true };
}

module.exports = { evaluateWatchItem, listSignals, dismissSignal, snoozeSignal, markBought };

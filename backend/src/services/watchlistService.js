'use strict';

const db = require('../config/database');
const { AppError, NotFoundError, ValidationError } = require('../utils/errorHandler');

const RULE_TYPES = new Set(['target_price', 'discount_percent', 'near_historical_low', 'any_price_drop']);

/**
 * Watch items ("My Watchlist") and per-product signal rules.
 */

async function listWatchItems(userId) {
  return db.query(
    `SELECT
       w.id, w.product_id, w.visibility, w.desired_quantity, w.status,
       w.snoozed_until, w.last_bought_at, w.created_at,
       p.canonical_name, p.brand, p.variant, p.category, p.unit,
       p.net_quantity, p.pack_count, p.verification_status,
       (SELECT pb.barcode FROM product_barcodes pb WHERE pb.product_id = p.id LIMIT 1) AS barcode,
       (SELECT po.observed_price
          FROM price_observations po
          JOIN retailer_products rp ON rp.id = po.retailer_product_id
          WHERE rp.product_id = w.product_id AND po.availability_status = 'available'
          ORDER BY po.observed_at DESC LIMIT 1) AS current_price,
       (SELECT po.observed_at
          FROM price_observations po
          JOIN retailer_products rp ON rp.id = po.retailer_product_id
          WHERE rp.product_id = w.product_id AND po.availability_status = 'available'
          ORDER BY po.observed_at DESC LIMIT 1) AS last_checked_at,
       rule.id AS rule_id, rule.rule_type, rule.target_price,
       rule.minimum_discount_percent, rule.near_low_percent,
       rule.include_member_prices, rule.include_multi_buy, rule.cooldown_hours,
       (SELECT COUNT(*) FROM signal_events se
          WHERE se.watch_item_id = w.id AND se.status = 'active') AS active_signal_count
     FROM watch_items w
     JOIN products p ON p.id = w.product_id
     LEFT JOIN (
       SELECT sr.* FROM signal_rules sr
       WHERE sr.enabled
       ORDER BY sr.created_at
     ) rule ON rule.watch_item_id = w.id
     WHERE w.owner_user_id = $1
     ORDER BY w.created_at DESC`,
    [userId],
  );
}

/** Alcohol products need explicit adult confirmation (spec 9.12). */
function isAlcoholProduct(product) {
  return product.category === 'liquor' || (product.alcohol_abv != null && Number(product.alcohol_abv) > 0);
}

async function createWatchItem(userId, { productId, visibility = 'private', desiredQuantity = null }) {
  if (!productId) throw new ValidationError('productId is required');

  const [product] = await db.query('SELECT id, category, alcohol_abv FROM products WHERE id = $1', [productId]);
  if (!product) throw new NotFoundError('Product not found');

  if (isAlcoholProduct(product)) {
    const [user] = await db.query('SELECT is_adult FROM users WHERE id = $1', [userId]);
    if (!user || !user.is_adult) {
      throw new AppError(
        'Confirm you are 18 or over in your profile to track alcohol products',
        403,
        'adult_confirmation_required',
      );
    }
  }

  const [item] = await db.query(
    `INSERT INTO watch_items (owner_user_id, product_id, visibility, desired_quantity)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_user_id, product_id) DO UPDATE
       SET visibility = EXCLUDED.visibility, updated_at = NOW()
     RETURNING *`,
    [userId, productId, visibility, desiredQuantity],
  );
  return item;
}

async function updateWatchItem(userId, watchItemId, updates) {
  const allowed = ['visibility', 'desired_quantity', 'status', 'snoozed_until', 'last_bought_at'];
  const sets = [];
  const params = [userId, watchItemId];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      params.push(updates[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) throw new ValidationError('No valid fields to update');

  const [item] = await db.query(
    `UPDATE watch_items SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $2 AND owner_user_id = $1 RETURNING *`,
    params,
  );
  if (!item) throw new NotFoundError('Watch item not found');
  return item;
}

async function deleteWatchItem(userId, watchItemId) {
  const result = await db.query(
    'DELETE FROM watch_items WHERE id = $2 AND owner_user_id = $1 RETURNING id',
    [userId, watchItemId],
  );
  if (result.length === 0) throw new NotFoundError('Watch item not found');
  return { deleted: true };
}

async function getWatchItem(userId, watchItemId) {
  const [item] = await db.query(
    'SELECT * FROM watch_items WHERE id = $1 AND owner_user_id = $2',
    [watchItemId, userId],
  );
  if (!item) throw new NotFoundError('Watch item not found');
  return item;
}

/** Create the single editable rule for a watch item (spec section 9.6). */
async function createRule(userId, watchItemId, rule) {
  await getWatchItem(userId, watchItemId); // ownership check

  if (!RULE_TYPES.has(rule.ruleType)) {
    throw new ValidationError(`ruleType must be one of: ${[...RULE_TYPES].join(', ')}`);
  }

  const [row] = await db.query(
    `INSERT INTO signal_rules
       (watch_item_id, rule_type, target_price, minimum_discount_percent,
        near_low_percent, include_member_prices, include_multi_buy, cooldown_hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      watchItemId,
      rule.ruleType,
      rule.targetPrice ?? null,
      rule.minimumDiscountPercent ?? null,
      rule.nearLowPercent ?? null,
      rule.includeMemberPrices ?? true,
      rule.includeMultiBuy ?? true,
      rule.cooldownHours ?? 24,
    ],
  );
  return row;
}

async function updateRule(userId, ruleId, updates) {
  const [ownership] = await db.query(
    `SELECT sr.id FROM signal_rules sr
     JOIN watch_items w ON w.id = sr.watch_item_id
     WHERE sr.id = $1 AND w.owner_user_id = $2`,
    [ruleId, userId],
  );
  if (!ownership) throw new NotFoundError('Rule not found');

  const allowed = ['target_price', 'minimum_discount_percent', 'near_low_percent', 'include_member_prices', 'include_multi_buy', 'cooldown_hours', 'enabled'];
  const sets = [];
  const params = [ruleId];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      params.push(updates[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) throw new ValidationError('No valid fields to update');

  const [row] = await db.query(
    `UPDATE signal_rules SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    params,
  );
  return row;
}

async function deleteRule(userId, ruleId) {
  const result = await db.query(
    `DELETE FROM signal_rules sr USING watch_items w
     WHERE sr.watch_item_id = w.id AND sr.id = $1 AND w.owner_user_id = $2 RETURNING sr.id`,
    [ruleId, userId],
  );
  if (result.length === 0) throw new NotFoundError('Rule not found');
  return { deleted: true };
}

async function getRuleForWatchItem(watchItemId) {
  const [rule] = await db.query(
    'SELECT * FROM signal_rules WHERE watch_item_id = $1 AND enabled ORDER BY created_at LIMIT 1',
    [watchItemId],
  );
  return rule || null;
}

module.exports = {
  isAlcoholProduct,
  listWatchItems,
  createWatchItem,
  updateWatchItem,
  deleteWatchItem,
  getWatchItem,
  createRule,
  updateRule,
  deleteRule,
  getRuleForWatchItem,
};

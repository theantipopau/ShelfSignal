'use strict';

const db = require('../config/database');
const productService = require('./productService');
const signalService = require('./signalService');
const { NotFoundError, ValidationError } = require('../utils/errorHandler');

/**
 * Ingestion pipeline (prototype stage).
 * Currently accepts *fixture* observations — explicitly not live retailer data.
 * When a lawful authorised adapter exists (spec section 15), it will write
 * observations through the same append-only productService.recordObservation
 * and then trigger evaluation here.
 */

async function ingestFixtureOffer({ barcode, retailerSlug, price, observedAt, memberPrice = null, promotionType = null }) {
  if (!barcode || !retailerSlug || price == null) {
    throw new ValidationError('barcode, retailerSlug and price are required');
  }

  const resolution = await productService.resolveBarcode(barcode);
  if (!resolution.found) {
    throw new NotFoundError(`No product mapped to barcode ${barcode}`);
  }

  const [row] = await db.query(
    `SELECT rp.id, rp.product_id
     FROM retailer_products rp
     JOIN retailers r ON r.id = rp.retailer_id
     WHERE r.slug = $1 AND rp.product_id = $2
     LIMIT 1`,
    [retailerSlug, resolution.product.id],
  );
  if (!row) throw new NotFoundError(`No retailer product mapping for ${retailerSlug} / this product`);

  const observation = await productService.recordObservation({
    retailerProductId: row.id,
    price,
    observedAt,
    sourceMethod: 'fixture',
    sourceReference: 'api:fixture-ingest',
    confidence: 1.0,
    memberPrice,
    promotionType,
  });

  // Evaluate every watch item watching this product.
  const watchers = await db.query('SELECT id FROM watch_items WHERE product_id = $1', [resolution.product.id]);
  const created = [];
  for (const w of watchers) {
    created.push(...(await signalService.evaluateWatchItem(w.id)));
  }

  return { observation, signalsCreated: created.length, signals: created };
}

/** Retailer catalogue for the app + diagnostics. */
async function listRetailers() {
  return db.query(
    `SELECT r.id, r.slug, r.name, r.website, r.is_active,
       (SELECT MAX(po.observed_at) FROM price_observations po
        JOIN retailer_products rp ON rp.id = po.retailer_product_id
        WHERE rp.retailer_id = r.id) AS last_observation_at,
       (SELECT COUNT(*) FROM retailer_products rp WHERE rp.retailer_id = r.id) AS listing_count
     FROM retailers r ORDER BY r.name`,
  );
}

module.exports = { ingestFixtureOffer, listRetailers };

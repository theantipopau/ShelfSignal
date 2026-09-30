'use strict';

const db = require('../config/database');
const { NotFoundError, ValidationError } = require('../utils/errorHandler');
const { validateBarcode } = require('../utils/barcode');

/**
 * Canonical product catalogue + barcode resolution.
 * Canonical products and retailer listings are separate entities (spec section 12).
 */

async function resolveBarcode(rawBarcode) {
  const check = validateBarcode(rawBarcode);
  if (!check.valid) {
    throw new ValidationError(`Invalid barcode: ${check.reason}`);
  }
  const barcode = check.normalized;

  const rows = await db.query(
    `SELECT
       p.id, p.canonical_name, p.brand, p.variant, p.category,
       p.net_quantity, p.unit, p.pack_count, p.packaging,
       p.alcohol_abv, p.alcohol_vintage, p.verification_status,
       pb.barcode, pb.barcode_type
     FROM product_barcodes pb
     JOIN products p ON p.id = pb.product_id
     WHERE pb.barcode = $1`,
    [barcode],
  );

  if (rows.length === 0) {
    // Unknown barcode: caller may submit it for moderation (spec section 9.3).
    return { found: false, barcode, barcodeType: check.type };
  }

  return { found: true, barcode, barcodeType: check.type, product: rows[0] };
}

async function getProduct(productId) {
  const [product] = await db.query(
    `SELECT id, canonical_name, brand, variant, category, net_quantity, unit,
            pack_count, packaging, alcohol_abv, alcohol_vintage, verification_status
     FROM products WHERE id = $1`,
    [productId],
  );
  if (!product) throw new NotFoundError('Product not found');

  const barcodes = await db.query(
    'SELECT barcode, barcode_type FROM product_barcodes WHERE product_id = $1',
    [productId],
  );
  product.barcodes = barcodes;
  return product;
}

async function searchProducts({ q, category, limit = 20 }) {
  const params = [];
  const clauses = [];

  if (q) {
    params.push(`%${String(q).trim()}%`);
    clauses.push(`(p.canonical_name ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR p.variant ILIKE $${params.length})`);
  }
  if (category) {
    params.push(String(category));
    clauses.push(`p.category = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(parseInt(limit, 10) || 20, 100));

  return db.query(
    `SELECT p.id, p.canonical_name, p.brand, p.variant, p.category,
            p.net_quantity, p.unit, p.pack_count, p.verification_status,
            (SELECT pb.barcode FROM product_barcodes pb WHERE pb.product_id = p.id LIMIT 1) AS barcode
     FROM products p
     ${where}
     ORDER BY p.canonical_name
     LIMIT $${params.length}`,
    params,
  );
}

/**
 * Unknown-barcode submission: create an unverified product for local tracking,
 * pending moderation. Deliberately minimal — details are curated by admins.
 */
async function submitUnknownBarcode({ barcode, suggestedName, brand }) {
  const check = validateBarcode(barcode);
  if (!check.valid) throw new ValidationError(`Invalid barcode: ${check.reason}`);

  const [existing] = await db.query(
    `SELECT p.id FROM product_barcodes pb JOIN products p ON p.id = pb.product_id WHERE pb.barcode = $1`,
    [check.normalized],
  );
  if (existing) {
    return { created: false, productId: existing.id };
  }

  return db.withTransaction(async (client) => {
    const [product] = await client.query(
      `INSERT INTO products (canonical_name, brand, verification_status)
       VALUES ($1, $2, 'unverified') RETURNING id`,
      [suggestedName || 'Unverified product', brand || null],
    );
    await client.query(
      `INSERT INTO product_barcodes (barcode, product_id, barcode_type) VALUES ($1, $2, $3)`,
      [check.normalized, product.id, check.type],
    );
    return { created: true, productId: product.id, barcode: check.normalized };
  });
}

/** Append-only price observation ingestion (fixture or authorised adapter). */
async function recordObservation({ retailerProductId, price, observedAt, sourceMethod = 'fixture', sourceReference = null, confidence = 1.0, memberPrice = null, promotionType = null, availabilityStatus = 'available' }) {
  if (!(Number(price) > 0)) throw new ValidationError('Price must be a positive number');

  const [row] = await db.query(
    `INSERT INTO price_observations
       (retailer_product_id, observed_price, member_price, promotion_type,
        availability_status, source_method, source_reference, confidence, observed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
     RETURNING *`,
    [
      retailerProductId,
      price,
      memberPrice,
      promotionType,
      availabilityStatus,
      sourceMethod,
      sourceReference,
      confidence,
      observedAt || null,
    ],
  );
  return row;
}

/** Append-only scan history for the signed-in user. */
async function recordScan(userId, barcode) {
  const check = validateBarcode(barcode);
  if (!check.valid) throw new ValidationError(`Invalid barcode: ${check.reason}`);
  await db.query('INSERT INTO scan_history (user_id, barcode) VALUES ($1, $2)', [userId, check.normalized]);
}

async function getScanHistory(userId, { limit = 20 } = {}) {
  return db.query(
    `SELECT id, barcode, scanned_at FROM scan_history
     WHERE user_id = $1 ORDER BY scanned_at DESC LIMIT $2`,
    [userId, Math.min(parseInt(limit, 10) || 20, 100)],
  );
}

module.exports = {
  resolveBarcode,
  getProduct,
  searchProducts,
  submitUnknownBarcode,
  recordObservation,
  recordScan,
  getScanHistory,
};

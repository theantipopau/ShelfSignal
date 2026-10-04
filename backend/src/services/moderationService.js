'use strict';

const db = require('../config/database');
const audit = require('./auditService');
const { NotFoundError, ValidationError } = require('../utils/errorHandler');

/**
 * Moderation (spec 9.3 unknown barcodes, 13 matching, 18 admin portal).
 * User-facing: file a report. Admin-facing: review the unverified queue,
 * verify / reject products, resolve reports (optionally unmapping a bad
 * retailer match). Every admin action writes an audit event.
 */

const REPORT_KINDS = new Set(['mismatch', 'wrong_details', 'other']);
const EDITABLE_FIELDS = {
  canonicalName: 'canonical_name',
  brand: 'brand',
  variant: 'variant',
  category: 'category',
  netQuantity: 'net_quantity',
  unit: 'unit',
  packCount: 'pack_count',
  packaging: 'packaging',
  alcoholAbv: 'alcohol_abv',
  alcoholVintage: 'alcohol_vintage',
};

// ---- User-facing ----------------------------------------------------------

async function fileReport(userId, productId, { kind = 'mismatch', retailerProductId = null, note = null } = {}) {
  if (!REPORT_KINDS.has(kind)) throw new ValidationError('kind must be mismatch, wrong_details or other');
  if (note && String(note).length > 1000) throw new ValidationError('note must be 1000 characters or fewer');

  const [product] = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
  if (!product) throw new NotFoundError('Product not found');

  if (retailerProductId) {
    const [rp] = await db.query('SELECT id FROM retailer_products WHERE id = $1 AND product_id = $2', [
      retailerProductId,
      productId,
    ]);
    if (!rp) throw new ValidationError('retailerProductId does not belong to this product');
  }

  // One open report per reporter/product/kind — repeat taps are idempotent.
  const [existing] = await db.query(
    `SELECT id, status, created_at FROM product_reports
     WHERE reporter_user_id = $1 AND product_id = $2 AND kind = $3 AND status = 'open'`,
    [userId, productId, kind],
  );
  if (existing) return { ...existing, already_reported: true };

  const [row] = await db.query(
    `INSERT INTO product_reports (product_id, retailer_product_id, reporter_user_id, kind, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, product_id, retailer_product_id, kind, note, status, created_at`,
    [productId, retailerProductId, userId, kind, note || null],
  );
  return { ...row, already_reported: false };
}

// ---- Admin ----------------------------------------------------------------

/** Unverified products awaiting review, with barcodes and watcher counts. */
async function listQueue({ limit = 50 } = {}) {
  return db.query(
    `SELECT p.id, p.canonical_name, p.brand, p.variant, p.category, p.net_quantity, p.unit,
            p.verification_status, p.created_at,
            (SELECT pb.barcode FROM product_barcodes pb WHERE pb.product_id = p.id LIMIT 1) AS barcode,
            (SELECT COUNT(*) FROM watch_items w WHERE w.product_id = p.id) AS watcher_count
     FROM products p
     WHERE p.verification_status = 'unverified'
     ORDER BY p.created_at ASC
     LIMIT $1`,
    [Math.min(parseInt(limit, 10) || 50, 200)],
  );
}

function buildEdits(fields = {}) {
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
    if (fields[key] === undefined) continue;
    values.push(fields[key] === '' ? null : fields[key]);
    sets.push(`${column} = $${values.length + 2}`);
  }
  return { sets, values };
}

async function decideProduct(adminId, productId, decision, fields = {}, note = null) {
  const status = decision === 'verify' ? 'verified' : 'rejected';
  const { sets, values } = buildEdits(fields);
  if (fields.canonicalName !== undefined && !String(fields.canonicalName).trim()) {
    throw new ValidationError('canonicalName cannot be empty');
  }
  const assignments = [`verification_status = $2`, ...sets.map((s) => s), 'updated_at = NOW()'];
  // $1 = id, $2 = status, edits start at $3 (buildEdits indexes from 3).
  const [row] = await db.query(
    `UPDATE products SET ${assignments.join(', ')} WHERE id = $1
     RETURNING id, canonical_name, brand, variant, category, net_quantity, unit, verification_status`,
    [productId, status, ...values],
  );
  if (!row) throw new NotFoundError('Product not found');
  await audit.record(adminId, `product.${decision}`, {
    targetType: 'product',
    targetId: productId,
    detail: { edited: Object.keys(fields).filter((k) => EDITABLE_FIELDS[k]), note },
  });
  return row;
}

const verifyProduct = (adminId, productId, fields, note) => decideProduct(adminId, productId, 'verify', fields, note);
const rejectProduct = (adminId, productId, note) => decideProduct(adminId, productId, 'reject', {}, note);

async function listReports({ status = 'open', limit = 50 } = {}) {
  const wanted = ['open', 'resolved', 'dismissed'].includes(status) ? status : 'open';
  return db.query(
    `SELECT r.id, r.product_id, r.retailer_product_id, r.kind, r.note, r.status, r.created_at,
            r.resolution_note, r.resolved_at,
            p.canonical_name, p.brand, rp.retailer_title
     FROM product_reports r
     JOIN products p ON p.id = r.product_id
     LEFT JOIN retailer_products rp ON rp.id = r.retailer_product_id
     WHERE r.status = $1
     ORDER BY r.created_at ASC
     LIMIT $2`,
    [wanted, Math.min(parseInt(limit, 10) || 50, 200)],
  );
}

/**
 * Resolve or dismiss a report. `unmap: true` detaches the reported retailer
 * listing from the product (confidence 0) so it can no longer raise signals.
 */
async function resolveReport(adminId, reportId, { resolution = 'resolved', note = null, unmap = false } = {}) {
  if (!['resolved', 'dismissed'].includes(resolution)) {
    throw new ValidationError("resolution must be 'resolved' or 'dismissed'");
  }
  return db.withTransaction(async (client) => {
    const found = (await client.query('SELECT * FROM product_reports WHERE id = $1', [reportId])).rows[0];
    if (!found) throw new NotFoundError('Report not found');
    if (found.status !== 'open') throw new ValidationError('Report is already closed');

    let unmapped = false;
    if (unmap && resolution === 'resolved' && found.retailer_product_id) {
      await client.query(
        `UPDATE retailer_products SET product_id = NULL, match_confidence = 0, match_method = 'unmapped_by_report'
         WHERE id = $1`,
        [found.retailer_product_id],
      );
      unmapped = true;
    }
    const updated = (
      await client.query(
        `UPDATE product_reports
         SET status = $2, resolution_note = $3, resolved_by = $4, resolved_at = NOW()
         WHERE id = $1
         RETURNING id, product_id, kind, status, resolution_note, resolved_at`,
        [reportId, resolution, note || null, adminId],
      )
    ).rows[0];
    await audit.record(
      adminId,
      `report.${resolution}`,
      { targetType: 'product_report', targetId: reportId, detail: { unmapped, note } },
      client,
    );
    return { ...updated, unmapped };
  });
}

module.exports = { fileReport, listQueue, verifyProduct, rejectProduct, listReports, resolveReport };

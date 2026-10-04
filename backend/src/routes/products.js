'use strict';

const express = require('express');
const productService = require('../services/productService');
const { authenticateToken } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

/**
 * GET /api/products/search?q=&category=&limit=
 * Static segment — must be declared before parameterised product routes.
 */
router.get('/search', async (req, res, next) => {
  try {
    const products = await productService.searchProducts({
      q: req.query.q,
      category: req.query.category,
      limit: req.query.limit,
    });
    res.json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/products/resolve-barcode
 * Body: { barcode }. Returns the canonical product for a GTIN, or found:false
 * when unknown (the app then offers the unknown-barcode flow). Unknown
 * barcodes are enriched server-side with a free Open Food Facts identity
 * candidate (`data.external`) — unverified, never persisted (Phase 0).
 */
router.post('/resolve-barcode', authenticateToken, async (req, res, next) => {
  try {
    const result = await productService.resolveBarcode(req.body ? req.body.barcode : null, { lookupExternal: true });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/products/submissions
 * Body: { barcode, suggestedName?, brand? } — unknown barcode flow
 * (spec section 9.3). Creates an unverified product pending moderation.
 */
router.post('/submissions', authenticateToken, async (req, res, next) => {
  try {
    const { barcode, suggestedName, brand, category, netQuantity, unit } = req.body || {};
    const result = await productService.submitUnknownBarcode({ barcode, suggestedName, brand, category, netQuantity, unit });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** POST /api/products/scan-history — record a scan (authenticated). */
router.post('/scan-history', authenticateToken, async (req, res, next) => {
  try {
    await productService.recordScan(req.user.id, req.body ? req.body.barcode : null);
    res.status(201).json({ success: true, data: { recorded: true } });
  } catch (err) {
    next(err);
  }
});

/** GET /api/products/scan-history — recent scans (authenticated). */
router.get('/scan-history', authenticateToken, async (req, res, next) => {
  try {
    const rows = await productService.getScanHistory(req.user.id, { limit: req.query.limit });
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

/** GET /api/products/:id — canonical product with its barcodes. */
router.get('/:id', async (req, res, next) => {
  try {
    const product = await productService.getProduct(req.params.id);
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

/** GET /api/products/:id/price-history — append-only observations. */
router.get('/:id/price-history', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT po.observed_price, po.unit_price, po.member_price, po.promotion_type,
              po.availability_status, po.observed_at, po.source_method, po.source_reference,
              po.confidence, r.slug AS retailer_slug, r.name AS retailer_name
       FROM price_observations po
       JOIN retailer_products rp ON rp.id = po.retailer_product_id
       JOIN retailers r ON r.id = rp.retailer_id
       WHERE rp.product_id = $1
       ORDER BY po.observed_at DESC
       LIMIT 500`,
      [req.params.id],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

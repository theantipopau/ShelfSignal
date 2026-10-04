'use strict';

const express = require('express');
const ingestService = require('../services/ingestService');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { config } = require('../config');
const { ForbiddenError } = require('../utils/errorHandler');

const router = express.Router();

/** GET /api/retailers — supported retailers with freshness diagnostics. */
router.get('/', async (req, res, next) => {
  try {
    const retailers = await ingestService.listRetailers();
    res.json({ success: true, data: retailers });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/retailers/ingest-fixture
 * Admin-only fixture ingestion for the vertical slice (disabled in production
 * unless ALLOW_FIXTURE_INGEST=true).
 * Body: { barcode, retailerSlug, price, observedAt?, memberPrice?, promotionType? }
 * This is explicitly a *fixture* pathway — never live retailer scraping.
 */
router.post('/ingest-fixture', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    if (config.isProduction && process.env.ALLOW_FIXTURE_INGEST !== 'true') {
      throw new ForbiddenError('Fixture ingestion is disabled in production');
    }
    const result = await ingestService.ingestFixtureOffer(req.body || {});
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/retailers/ingest-open-prices (admin only)
 * Phase 3 pathway (Docs/retailer-api-research.md): pull crowdsourced Open
 * Prices observations for a barcode, server-side. Only AUD prices confirmed
 * to an Australian store of a configured retailer are ingested; every other
 * item is counted in `skipped` with a reason. Provenance is recorded on each
 * observation (source_method='open_prices').
 * Body: { barcode, limit? }
 */
router.post('/ingest-open-prices', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const result = await ingestService.ingestOpenPrices(req.body || {});
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/retailers/diagnostics
 * Phase 3 diagnostics (Master Prompt section 24): catalog of lawful data
 * sources with live adapter enablement, plus per-source observation counts
 * and staleness. Aggregate, non-personal, safe for status surfaces.
 */
router.get('/diagnostics', async (req, res, next) => {
  try {
    const data = await ingestService.sourceDiagnostics();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

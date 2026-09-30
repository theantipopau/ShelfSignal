'use strict';

const express = require('express');
const ingestService = require('../services/ingestService');
const { authenticateToken } = require('../middleware/auth');

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
 * Authenticated fixture ingestion for the vertical slice.
 * Body: { barcode, retailerSlug, price, observedAt?, memberPrice?, promotionType? }
 * This is explicitly a *fixture* pathway — never live retailer scraping.
 */
router.post('/ingest-fixture', authenticateToken, async (req, res, next) => {
  try {
    const result = await ingestService.ingestFixtureOffer(req.body || {});
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

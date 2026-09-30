'use strict';

const express = require('express');
const watchlistService = require('../services/watchlistService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/** GET /api/watchlist — My Watchlist with latest price + active rule. */
router.get('/', async (req, res, next) => {
  try {
    const items = await watchlistService.listWatchItems(req.user.id);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

/** POST /api/watchlist — add a product to the watchlist. */
router.post('/', async (req, res, next) => {
  try {
    const { productId, visibility, desiredQuantity } = req.body || {};
    const item = await watchlistService.createWatchItem(req.user.id, { productId, visibility, desiredQuantity });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/watchlist/:id — snooze, mark bought, change quantity/visibility. */
router.patch('/:id', async (req, res, next) => {
  try {
    const item = await watchlistService.updateWatchItem(req.user.id, req.params.id, req.body || {});
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/watchlist/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await watchlistService.deleteWatchItem(req.user.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** POST /api/watchlist/:id/rules — create the signal rule for a watch item. */
router.post('/:id/rules', async (req, res, next) => {
  try {
    const rule = await watchlistService.createRule(req.user.id, req.params.id, req.body || {});
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/watchlist/:id/rules/:ruleId — edit the rule. */
router.patch('/:id/rules/:ruleId', async (req, res, next) => {
  try {
    const rule = await watchlistService.updateRule(req.user.id, req.params.ruleId, req.body || {});
    res.json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/watchlist/:id/rules/:ruleId */
router.delete('/:id/rules/:ruleId', async (req, res, next) => {
  try {
    const result = await watchlistService.deleteRule(req.user.id, req.params.ruleId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

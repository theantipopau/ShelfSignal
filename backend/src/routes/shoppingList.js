'use strict';

const express = require('express');
const shoppingListService = require('../services/shoppingListService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/** GET /api/shopping-list?status=open|done — own items plus household-shared items. */
router.get('/', async (req, res, next) => {
  try {
    res.json({ success: true, data: await shoppingListService.list(req.user.id, { status: req.query.status }) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/shopping-list — { productId? | title, quantity?, retailerSlug?, note?, shared? } */
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await shoppingListService.create(req.user.id, req.body || {}) });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/shopping-list/:id — quantity, note, retailerSlug, shared, status (open|done). */
router.patch('/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: await shoppingListService.update(req.user.id, req.params.id, req.body || {}) });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/shopping-list/:id — owner only. */
router.delete('/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: await shoppingListService.remove(req.user.id, req.params.id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

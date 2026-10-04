'use strict';

const express = require('express');
const moderationService = require('../services/moderationService');
const auditService = require('../services/auditService');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

/** GET /api/admin/moderation/queue — unverified products awaiting review. */
router.get('/moderation/queue', async (req, res, next) => {
  try {
    res.json({ success: true, data: await moderationService.listQueue({ limit: req.query.limit }) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/products/:id/verify — optional identity corrections in the body. */
router.post('/products/:id/verify', async (req, res, next) => {
  try {
    const { note, ...fields } = req.body || {};
    res.json({ success: true, data: await moderationService.verifyProduct(req.user.id, req.params.id, fields, note) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/products/:id/reject */
router.post('/products/:id/reject', async (req, res, next) => {
  try {
    res.json({ success: true, data: await moderationService.rejectProduct(req.user.id, req.params.id, (req.body || {}).note) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/reports?status=open|resolved|dismissed */
router.get('/reports', async (req, res, next) => {
  try {
    res.json({ success: true, data: await moderationService.listReports({ status: req.query.status, limit: req.query.limit }) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/reports/:id/resolve — { resolution: resolved|dismissed, note?, unmap? } */
router.post('/reports/:id/resolve', async (req, res, next) => {
  try {
    res.json({ success: true, data: await moderationService.resolveReport(req.user.id, req.params.id, req.body || {}) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/audit — recent privileged actions. */
router.get('/audit', async (req, res, next) => {
  try {
    res.json({ success: true, data: await auditService.list({ limit: req.query.limit }) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

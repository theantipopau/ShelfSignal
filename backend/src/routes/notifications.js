'use strict';

const express = require('express');
const prefsService = require('../services/notificationPreferencesService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/** GET /api/notifications/preferences — current preferences (defaults when unset). */
router.get('/preferences', async (req, res, next) => {
  try {
    const prefs = await prefsService.getPreferences(req.user.id);
    res.json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/notifications/preferences — partial update, validated field-by-field. */
router.patch('/preferences', async (req, res, next) => {
  try {
    const prefs = await prefsService.updatePreferences(req.user.id, req.body || {});
    res.json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/preview — dry-run the delivery decision so the app
 * can explain *why* a notification would or would not reach the user right now.
 * Body: { isHighValue?, isHouseholdActivity?, category?, retailer? }
 */
router.post('/preview', async (req, res, next) => {
  try {
    const body = req.body || {};
    const now = new Date();
    const prefs = await prefsService.getPreferences(req.user.id);
    const decision = prefsService.shouldDeliver(
      prefs,
      {
        isHighValue: Boolean(body.isHighValue),
        isHouseholdActivity: Boolean(body.isHouseholdActivity),
        category: body.category || null,
        retailer: body.retailer || null,
      },
      now,
    );
    res.json({ success: true, data: { ...decision, evaluated_at: now.toISOString() } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

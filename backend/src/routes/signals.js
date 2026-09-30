'use strict';

const express = require('express');
const signalService = require('../services/signalService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/** GET /api/signals — Active Signals feed. */
router.get('/', async (req, res, next) => {
  try {
    const signals = await signalService.listSignals(req.user.id, {
      includeDismissed: req.query.includeDismissed === 'true',
    });
    res.json({ success: true, data: signals });
  } catch (err) {
    next(err);
  }
});

/** POST /api/signals/:id/dismiss */
router.post('/:id/dismiss', async (req, res, next) => {
  try {
    const result = await signalService.dismissSignal(req.user.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** POST /api/signals/:id/snooze — body: { until?: ISO date } */
router.post('/:id/snooze', async (req, res, next) => {
  try {
    const result = await signalService.snoozeSignal(req.user.id, req.params.id, req.body ? req.body.until : null);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** POST /api/signals/:id/mark-bought */
router.post('/:id/mark-bought', async (req, res, next) => {
  try {
    const result = await signalService.markBought(req.user.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

'use strict';

const express = require('express');
const householdService = require('../services/householdService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/** POST /api/households — create a household (caller becomes owner). */
router.post('/', async (req, res, next) => {
  try {
    const household = await householdService.createHousehold(req.user.id, req.body || {});
    res.status(201).json({ success: true, data: household });
  } catch (err) {
    next(err);
  }
});

/** GET /api/households — households the caller belongs to. */
router.get('/', async (req, res, next) => {
  try {
    const households = await householdService.listHouseholds(req.user.id);
    res.json({ success: true, data: households });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/households/invites/accept — accept an invite by raw token.
 * Declared before /:id so "invites" is never read as a household id.
 */
router.post('/invites/accept', async (req, res, next) => {
  try {
    const result = await householdService.acceptInvite(req.user.id, (req.body || {}).token);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** GET /api/households/:id — detail with members (and invites for the owner). */
router.get('/:id', async (req, res, next) => {
  try {
    const household = await householdService.getHousehold(req.user.id, req.params.id);
    res.json({ success: true, data: household });
  } catch (err) {
    next(err);
  }
});

/** POST /api/households/:id/invites — owner issues an invite (token returned once). */
router.post('/:id/invites', async (req, res, next) => {
  try {
    const invite = await householdService.createInvite(req.user.id, req.params.id, req.body || {});
    res.status(201).json({ success: true, data: invite });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/households/:id/invites/:inviteId — owner revokes an invite. */
router.delete('/:id/invites/:inviteId', async (req, res, next) => {
  try {
    const result = await householdService.revokeInvite(req.user.id, req.params.id, req.params.inviteId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/households/:id/members/:userId — owner removes, or a member leaves. */
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const result = await householdService.removeMember(
      req.user.id,
      req.params.id,
      req.params.userId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/households/:id/transfer-owner — owner hands ownership to a member.
 * Body: { userId } — the member who becomes the new owner.
 */
router.post('/:id/transfer-owner', async (req, res, next) => {
  try {
    const household = await householdService.transferOwnership(
      req.user.id,
      req.params.id,
      (req.body || {}).userId,
    );
    res.json({ success: true, data: household });
  } catch (err) {
    next(err);
  }
});

/** GET /api/households/shared-items — shared watchlist across the household. */
router.get('/-/shared-items', async (req, res, next) => {
  try {
    const items = await householdService.listSharedItems(req.user.id);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

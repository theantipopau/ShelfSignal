'use strict';

const express = require('express');
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Create an account. Returns a JWT.
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body || {};
    const result = await authService.register({ email, password, displayName });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Sign in with email + password. Returns a JWT.
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.login({ email, password });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me — current user profile. */
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.id);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/auth/me — update profile (display name, postcode, adult confirmation). */
router.patch('/me', authenticateToken, async (req, res, next) => {
  try {
    const { displayName, postcode, isAdult } = req.body || {};
    const user = await authService.updateMe(req.user.id, { displayName, postcode, isAdult });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/auth/me — account deletion with cascade (privacy foundation). */
router.delete('/me', authenticateToken, async (req, res, next) => {
  try {
    const result = await authService.deleteMe(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

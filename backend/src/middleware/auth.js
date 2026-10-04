'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config');
const db = require('../config/database');
const { UnauthorizedError, ForbiddenError } = require('../utils/errorHandler');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Strict authentication middleware. 401 without a valid token. */
function authenticateToken(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next(new UnauthorizedError('Access token required'));
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch (err) {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}

/** Soft authentication: attaches req.user when a valid token is present. */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      req.user = { id: decoded.sub, email: decoded.email };
    } catch (err) {
      // Invalid token on an optional route: proceed anonymously.
    }
  }
  next();
}

/**
 * Requires an authenticated user whose *current* database role is 'admin'.
 * Must run after authenticateToken. The role is looked up per request so a
 * demoted admin loses access immediately.
 */
async function requireAdmin(req, res, next) {
  try {
    const rows = await db.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || rows[0].role !== 'admin') {
      return next(new ForbiddenError('Administrator access required'));
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticateToken, optionalAuth, requireAdmin };

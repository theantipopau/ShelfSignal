'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { UnauthorizedError } = require('../utils/errorHandler');

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

module.exports = { authenticateToken, optionalAuth };

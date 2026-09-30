'use strict';

const { AppError } = require('../utils/errorHandler');

// Express error middleware requires the 4-arg signature even when `next` is unused.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Default fields, then let known error types override.
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'internal_error';

  // PostgreSQL unique violation.
  if (err.code === '23505') {
    statusCode = 409;
    message = 'Resource already exists';
    code = 'conflict';
  }
  // PostgreSQL foreign key violation.
  if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced resource does not exist';
    code = 'invalid_reference';
  }
  // Invalid UUID parameter.
  if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid identifier format';
    code = 'invalid_id';
  }

  if (!(err instanceof AppError) && statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    message = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    error: { code, message },
    requestId: req.id || null,
  });
};

module.exports = errorHandler;

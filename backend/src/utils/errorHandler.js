'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'app_error') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'validation_error');
  }
}

class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404, 'not_found');
  }
}

class UnauthorizedError extends AppError {
  constructor(message) {
    super(message, 401, 'unauthorized');
  }
}

class ForbiddenError extends AppError {
  constructor(message) {
    super(message, 403, 'forbidden');
  }
}

module.exports = { AppError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError };

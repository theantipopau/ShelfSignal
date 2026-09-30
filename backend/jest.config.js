'use strict';

/**
 * The API contract tests use Node's built-in `node:sqlite` module,
 * which requires Node 22.5+ (recommended: 22 LTS or 24).
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  maxWorkers: 1,
};

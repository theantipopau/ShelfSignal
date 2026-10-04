'use strict';

/**
 * Centralised runtime configuration.
 * Fails fast when a required secret is missing in production.
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  isProduction: process.env.NODE_ENV === 'production',

  jwt: {
    // In non-production we allow a deterministic dev secret so the API runs out of the box.
    get secret() {
      return process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'shelfsignal-dev-secret-do-not-use-in-production');
    },
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cors: {
    // Native apps do not need CORS. Browsers get access only from listed origins
    // (CORS_ORIGINS, comma-separated); outside production any origin is allowed
    // so the web sample and local tooling work.
    origins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  },

  signals: {
    // Master Prompt §14: only Verified / High-confidence offers may push alerts.
    minimumPushMatchConfidence: parseFloat(process.env.MINIMUM_PUSH_MATCH_CONFIDENCE || '0.75'),
    defaultCooldownHours: parseInt(process.env.DEFAULT_COOLDOWN_HOURS || '24', 10),
    baselineWindow: parseInt(process.env.BASELINE_WINDOW || '30', 10),
    freshnessHours: parseInt(process.env.FRESHNESS_HOURS || '48', 10),
  },
};

function validate() {
  if (config.isProduction && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production');
  }
  if (config.isProduction && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set in production');
  }
  if (!config.jwt.secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return config;
}

module.exports = { config, requireEnv, validate };

'use strict';

/**
 * Phase 4 continuation — category and retailer notification controls
 * (Master Prompt section 9.11 "category and retailer controls").
 *
 * Stored as JSON arrays in TEXT columns rather than child tables:
 *   - both Postgres and SQLite (test driver) return them as strings, so the
 *     service parses/serialises them and the API contract stays identical;
 *   - the list is small (categories and retailer slugs, capped at 50 entries)
 *     and always read and written as a whole;
 *   - one row per user keeps preference reads a single query.
 *
 * Absent column value or empty array = nothing muted (the default).
 */

const db = require('../config/database');

async function up(client) {
  const q = (text, params) => (client ? client.query(text, params) : db.query(text, params));

  await q(`ALTER TABLE notification_preferences ADD COLUMN muted_categories TEXT NOT NULL DEFAULT '[]'`);
  await q(`ALTER TABLE notification_preferences ADD COLUMN muted_retailers TEXT NOT NULL DEFAULT '[]'`);
}

async function down(client) {
  const q = (text) => (client ? client.query(text) : db.query(text));
  await q('ALTER TABLE notification_preferences DROP COLUMN muted_retailers');
  await q('ALTER TABLE notification_preferences DROP COLUMN muted_categories');
}

module.exports = { up, down };

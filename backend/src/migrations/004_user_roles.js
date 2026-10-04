'use strict';

/**
 * Adds a coarse role to users so privileged endpoints (price ingestion,
 * moderation) can be restricted. Default is 'user'; promote with
 * `npm run make-admin -- <email>`. Roles are read from the database on each
 * privileged request, never from the JWT, so demotion takes effect immediately.
 */

const db = require('../config/database');

async function up(client) {
  const q = (text, params) => (client ? client.query(text, params) : db.query(text, params));
  await q(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  await q(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'))`);
}

async function down(client) {
  const q = (text) => (client ? client.query(text) : db.query(text));
  await q('ALTER TABLE users DROP CONSTRAINT users_role_check');
  await q('ALTER TABLE users DROP COLUMN role');
}

module.exports = { up, down };

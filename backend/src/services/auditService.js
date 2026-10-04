'use strict';

const db = require('../config/database');

/**
 * Append-only audit trail for privileged actions (spec 17/18). Pass a
 * transaction client to make the audit row atomic with the action it records.
 * `detail` must never contain private watchlist contents.
 */
async function record(actorUserId, action, { targetType = null, targetId = null, detail = {} } = {}, client = null) {
  const sql = `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, detail)
               VALUES ($1, $2, $3, $4, $5)`;
  const params = [actorUserId, action, targetType, targetId ? String(targetId) : null, JSON.stringify(detail)];
  if (client) await client.query(sql, params);
  else await db.query(sql, params);
}

async function list({ limit = 50 } = {}) {
  return db.query(
    `SELECT id, actor_user_id, action, target_type, target_id, detail, created_at
     FROM audit_events ORDER BY created_at DESC LIMIT $1`,
    [Math.min(parseInt(limit, 10) || 50, 200)],
  );
}

module.exports = { record, list };

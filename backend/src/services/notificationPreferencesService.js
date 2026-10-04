'use strict';

const db = require('../config/database');
const { ValidationError } = require('../utils/errorHandler');

/**
 * Notification preferences (Master Prompt section 9.11):
 *   global switch, quiet hours, category/retailer controls, per-product
 *   cooldown, digest mode, immediate high-value signals, household activity.
 *
 * Absent row = all defaults. Preferences are per-user and stored as one row;
 * every update is validated before it touches the database.
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_CHANNEL_ENTRIES = 50;

const DEFAULTS = Object.freeze({
  global_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  digest_mode: false,
  per_product_cooldown_hours: 24,
  household_activity_enabled: true,
  immediate_high_value_enabled: true,
  alcohol_alerts_enabled: true,
  muted_categories: Object.freeze([]),
  muted_retailers: Object.freeze([]),
});

const UPDATABLE = Object.keys(DEFAULTS);

/** Columns stored as JSON arrays in a TEXT column (see migration 003). */
const JSON_FIELDS = ['muted_categories', 'muted_retailers'];

const BOOLEAN_FIELDS = [
  'global_enabled',
  'quiet_hours_enabled',
  'digest_mode',
  'household_activity_enabled',
  'immediate_high_value_enabled',
  'alcohol_alerts_enabled',
];

/**
 * Coerce a stored row into API-shaped values. Postgres returns native booleans,
 * SQLite (tests) returns 0/1 — normalise so the contract is driver-independent.
 */
function toApiRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const field of BOOLEAN_FIELDS) {
    if (out[field] !== undefined && out[field] !== null) out[field] = Boolean(Number(out[field]));
  }
  if (out.per_product_cooldown_hours !== undefined && out.per_product_cooldown_hours !== null) {
    out.per_product_cooldown_hours = Number(out.per_product_cooldown_hours);
  }
  for (const field of JSON_FIELDS) out[field] = toArray(out[field]);
  return out;
}

/** Read a stored JSON-array column back into a string array (never throws). */
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return []; // corrupt stored value behaves like "nothing muted"
    }
  }
  return [];
}

/** Validate a whole-list replacement: array of unique lowercase slugs. */
function normaliseList(value, field) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array of slugs`);
  if (value.length > MAX_CHANNEL_ENTRIES) {
    throw new ValidationError(`${field} holds at most ${MAX_CHANNEL_ENTRIES} entries`);
  }
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string' || !SLUG_RE.test(raw)) {
      throw new ValidationError(`${field} entries must be lowercase slugs (a-z, 0-9, - or _)`);
    }
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}

function toBool(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ValidationError(`${field} must be true or false`);
  return value;
}

/** Merge stored row (or defaults) with validated updates. */
function normalise(row, body = {}) {
  const current = { ...DEFAULTS, ...(row || {}) };
  const next = { ...current };

  for (const field of ['global_enabled', 'quiet_hours_enabled', 'digest_mode', 'household_activity_enabled', 'immediate_high_value_enabled', 'alcohol_alerts_enabled']) {
    const value = toBool(body[field], field);
    if (value !== undefined) next[field] = value;
  }

  if (body.quiet_hours_start !== undefined) {
    if (!TIME_RE.test(String(body.quiet_hours_start))) {
      throw new ValidationError('quiet_hours_start must be HH:MM (24-hour)');
    }
    next.quiet_hours_start = body.quiet_hours_start;
  }
  if (body.quiet_hours_end !== undefined) {
    if (!TIME_RE.test(String(body.quiet_hours_end))) {
      throw new ValidationError('quiet_hours_end must be HH:MM (24-hour)');
    }
    next.quiet_hours_end = body.quiet_hours_end;
  }

  if (body.per_product_cooldown_hours !== undefined) {
    const hours = Number(body.per_product_cooldown_hours);
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) {
      throw new ValidationError('per_product_cooldown_hours must be an integer between 0 and 168');
    }
    next.per_product_cooldown_hours = hours;
  }

  // Category and retailer controls (spec 9.11): whole-list replacement.
  for (const field of JSON_FIELDS) {
    const list = normaliseList(body[field], field);
    next[field] = list !== undefined ? list : toArray(current[field]);
  }

  return next;
}

async function getPreferences(userId) {
  const [row] = await db.query(
    'SELECT * FROM notification_preferences WHERE user_id = $1',
    [userId],
  );
  if (!row) return { ...DEFAULTS, muted_categories: [], muted_retailers: [], user_id: userId, updated_at: null };
  return toApiRow(row);
}

async function updatePreferences(userId, body) {
  const [existing] = await db.query(
    'SELECT * FROM notification_preferences WHERE user_id = $1',
    [userId],
  );
  const next = normalise(existing, body || {});

  const fields = UPDATABLE.map((f) => `${f} = $${UPDATABLE.indexOf(f) + 2}`).join(', ');
  const params = [
    userId,
    ...UPDATABLE.map((f) => (JSON_FIELDS.includes(f) ? JSON.stringify(next[f]) : next[f])),
  ];

  const [row] = await db.query(
    `INSERT INTO notification_preferences (user_id, ${UPDATABLE.join(', ')})
     VALUES ($1, ${UPDATABLE.map((_, i) => `$${i + 2}`).join(', ')})
     ON CONFLICT (user_id) DO UPDATE SET ${fields}, updated_at = NOW()
     RETURNING *`,
    params,
  );
  return toApiRow(row);
}

/** Minutes from local midnight for an HH:MM string. */
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Is `at` inside the quiet-hours window? Windows may wrap midnight
 * (22:00 -> 07:00). Equal boundaries are excluded so a window of
 * 07:00-07:00 never suppresses anything.
 */
function isWithinQuietHours(at, start, end) {
  const mins = at.getHours() * 60 + at.getMinutes();
  const startM = toMinutes(start);
  const endM = toMinutes(end);
  if (startM === endM) return false;
  return startM < endM ? mins >= startM && mins < endM : mins >= startM || mins < endM;
}

/**
 * Pure delivery decision for one signal notification (spec section 9.11).
 * Returns { deliver, reason } — never a boolean — so suppression is auditable.
 *
 * @param {object} prefs   row from getPreferences()
 * @param {object} event   { isHighValue, isHouseholdActivity, category, retailer }
 * @param {Date}   now     evaluation time (injectable for tests)
 */
function shouldDeliver(prefs, event = {}, now = new Date()) {
  const p = { ...DEFAULTS, ...(prefs || {}) };

  if (!p.global_enabled) return { deliver: false, reason: 'global_off' };

  if (event.isHouseholdActivity && !p.household_activity_enabled) {
    return { deliver: false, reason: 'household_activity_off' };
  }

  if (event.category === 'liquor' && !p.alcohol_alerts_enabled) {
    return { deliver: false, reason: 'alcohol_off' };
  }

  // Category and retailer controls are hard opt-outs: they beat quiet hours,
  // the digest and the high-value override, because the user muted the channel.
  if (event.category && toArray(p.muted_categories).includes(event.category)) {
    return { deliver: false, reason: 'category_muted' };
  }
  if (event.retailer && toArray(p.muted_retailers).includes(event.retailer)) {
    return { deliver: false, reason: 'retailer_muted' };
  }

  // Immediate high-value signals bypass quiet hours; everything else waits.
  const immediate = Boolean(event.isHighValue) && p.immediate_high_value_enabled;

  if (p.quiet_hours_enabled && !immediate && isWithinQuietHours(now, p.quiet_hours_start, p.quiet_hours_end)) {
    return { deliver: false, reason: 'quiet_hours', resume_at: nextWakeUp(now, p.quiet_hours_end) };
  }

  if (p.digest_mode && !immediate) {
    return { deliver: false, reason: 'digest_queued' };
  }

  return { deliver: true, reason: immediate && p.quiet_hours_enabled ? 'high_value_override' : 'ok' };
}

/** Next occurrence of the quiet-hours end time (ISO string). */
function nextWakeUp(now, end) {
  const [h, m] = String(end).split(':').map(Number);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

module.exports = {
  DEFAULTS,
  getPreferences,
  updatePreferences,
  normalise,
  normaliseList,
  toArray,
  isWithinQuietHours,
  shouldDeliver,
  nextWakeUp,
};

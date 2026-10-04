'use strict';

const db = require('../config/database');
const { NotFoundError } = require('../utils/errorHandler');

/**
 * Personal data export (spec 17 "deletion and export workflows").
 * Returns everything ShelfSignal holds about the user. Excludes the password
 * hash and raw push tokens, and other people's data (only the household's
 * name and the user's role in it).
 */
async function exportUserData(userId) {
  const [user] = await db.query(
    'SELECT id, email, display_name, postcode, is_adult, role, created_at FROM users WHERE id = $1',
    [userId],
  );
  if (!user) throw new NotFoundError('User not found');

  const watchItems = await db.query(
    `SELECT w.id, w.product_id, w.visibility, w.desired_quantity, w.status, w.snoozed_until,
            w.last_bought_at, w.created_at, p.canonical_name, p.brand
     FROM watch_items w JOIN products p ON p.id = w.product_id
     WHERE w.owner_user_id = $1 ORDER BY w.created_at`,
    [userId],
  );
  const rules = await db.query(
    `SELECT sr.id, sr.watch_item_id, sr.rule_type, sr.target_price, sr.minimum_discount_percent,
            sr.near_low_percent, sr.include_member_prices, sr.include_multi_buy, sr.cooldown_hours, sr.enabled
     FROM signal_rules sr JOIN watch_items w ON w.id = sr.watch_item_id
     WHERE w.owner_user_id = $1`,
    [userId],
  );
  const signals = await db.query(
    `SELECT se.id, se.watch_item_id, se.rule_type, se.current_price, se.baseline_price, se.label,
            se.explanation, se.status, se.triggered_at
     FROM signal_events se JOIN watch_items w ON w.id = se.watch_item_id
     WHERE w.owner_user_id = $1 ORDER BY se.triggered_at DESC`,
    [userId],
  );
  const scans = await db.query('SELECT barcode, scanned_at FROM scan_history WHERE user_id = $1 ORDER BY scanned_at', [
    userId,
  ]);
  const shoppingList = await db.query(
    `SELECT id, title, quantity, retailer_slug, note, status, household_id, created_at, completed_at
     FROM shopping_list_items WHERE owner_user_id = $1 ORDER BY created_at`,
    [userId],
  );
  const devices = await db.query('SELECT platform, created_at, last_seen_at FROM device_tokens WHERE user_id = $1', [userId]);
  const [preferences] = await db.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
  const [household] = await db.query(
    `SELECT h.name, hm.role, hm.joined_at FROM household_members hm
     JOIN households h ON h.id = hm.household_id WHERE hm.user_id = $1 LIMIT 1`,
    [userId],
  );
  const reports = await db.query(
    'SELECT product_id, kind, note, status, created_at FROM product_reports WHERE reporter_user_id = $1 ORDER BY created_at',
    [userId],
  );

  return {
    exported_at: new Date().toISOString(),
    format_version: 1,
    user,
    watch_items: watchItems,
    signal_rules: rules,
    signals,
    scan_history: scans,
    shopping_list: shoppingList,
    notification_preferences: preferences || null,
    household: household || null,
    devices,
    reports,
  };
}

module.exports = { exportUserData };

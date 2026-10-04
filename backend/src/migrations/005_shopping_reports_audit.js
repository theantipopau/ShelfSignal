'use strict';

/**
 * Shopping list (spec 9.10), mismatch/data reports (spec 9.8, 13) and the audit
 * trail for privileged actions (spec 17, 18).
 *
 * - shopping_list_items: owned by one user; `household_id` set means the whole
 *   household can see and complete it. Private items never leave their owner.
 * - product_reports: user-reported mismatches, resolved by moderators.
 * - audit_events: append-only; the actor reference is nulled (not cascaded) when
 *   an account is deleted so the trail survives.
 */

const db = require('../config/database');

async function up(client) {
  const q = (text, params) => (client ? client.query(text, params) : db.query(text, params));

  await q(`
    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      household_id UUID REFERENCES households(id) ON DELETE CASCADE,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
      retailer_slug VARCHAR(64),
      note VARCHAR(500),
      status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
      completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q('CREATE INDEX IF NOT EXISTS idx_shopping_owner ON shopping_list_items (owner_user_id, status)');
  await q('CREATE INDEX IF NOT EXISTS idx_shopping_household ON shopping_list_items (household_id, status)');

  await q(`
    CREATE TABLE IF NOT EXISTS product_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      retailer_product_id UUID REFERENCES retailer_products(id) ON DELETE SET NULL,
      reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      kind VARCHAR(32) NOT NULL CHECK (kind IN ('mismatch', 'wrong_details', 'other')),
      note VARCHAR(1000),
      status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
      resolution_note VARCHAR(1000),
      resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q('CREATE INDEX IF NOT EXISTS idx_reports_status ON product_reports (status, created_at)');

  await q(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(64) NOT NULL,
      target_type VARCHAR(32),
      target_id VARCHAR(64),
      detail TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events (created_at DESC)');
}

async function down(client) {
  const q = (text) => (client ? client.query(text) : db.query(text));
  await q('DROP TABLE IF EXISTS audit_events');
  await q('DROP TABLE IF EXISTS product_reports');
  await q('DROP TABLE IF EXISTS shopping_list_items');
}

module.exports = { up, down };

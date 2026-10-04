'use strict';

/**
 * Phase 4 — Household sharing and premium UX (Master Prompt section 9.9, 9.11).
 *
 * Key modelling decisions:
 * - `households` are owned by exactly one user; every other member joins as
 *   `member`. Roles are enforced in the service layer (spec: owner/member).
 * - Invite tokens are stored only as a SHA-256 hash — the raw token is returned
 *   once at creation and never retrievable again (spec: "secure invites").
 * - A member may only be in a household once; leaving and re-inviting is allowed.
 * - `notification_preferences` is one row per user with spec section 9.11 controls:
 *   global switch, quiet hours, digest mode, per-product cooldown, household
 *   activity and immediate high-value signals. Absent row = all defaults.
 */

const db = require('../config/database');

async function up(client) {
  const q = (text, params) => (client ? client.query(text, params) : db.query(text, params));

  await q(`
    CREATE TABLE IF NOT EXISTS households (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(128) NOT NULL,
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS household_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(16) NOT NULL DEFAULT 'member',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (household_id, user_id)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS household_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) UNIQUE NOT NULL,
      invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_email VARCHAR(255),
      role VARCHAR(16) NOT NULL DEFAULT 'member',
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      quiet_hours_start VARCHAR(5) NOT NULL DEFAULT '22:00',
      quiet_hours_end VARCHAR(5) NOT NULL DEFAULT '07:00',
      digest_mode BOOLEAN NOT NULL DEFAULT FALSE,
      per_product_cooldown_hours INTEGER NOT NULL DEFAULT 24,
      household_activity_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      immediate_high_value_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      alcohol_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_household_invites_household ON household_invites(household_id)`);
}

async function down(client) {
  const q = (text) => (client ? client.query(text) : db.query(text));
  await q('DROP TABLE IF EXISTS notification_preferences CASCADE');
  await q('DROP TABLE IF EXISTS household_invites CASCADE');
  await q('DROP TABLE IF EXISTS household_members CASCADE');
  await q('DROP TABLE IF EXISTS households CASCADE');
}

module.exports = { up, down };

'use strict';

/**
 * Initial ShelfSignal schema (Master Prompt section 12).
 *
 * Key modelling decisions:
 * - Canonical `products` are separate from `retailer_products` (a product is not a listing).
 * - `price_observations` is append-only (never UPDATE price history).
 * - `watch_items` + `signal_rules` separate "what I watch" from "when to tell me".
 * - `signal_events` stores explainable signals including the triggered rule.
 */

const db = require('../config/database');

async function up(client) {
  const q = (text, params) => (client ? client.query(text, params) : db.query(text, params));

  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email CITEXT UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      postcode VARCHAR(8),
      is_adult BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS retailers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(64) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      website VARCHAR(500),
      adapter VARCHAR(64),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_name VARCHAR(500) NOT NULL,
      brand VARCHAR(255),
      variant VARCHAR(255),
      category VARCHAR(100),
      net_quantity NUMERIC(10, 3),
      unit VARCHAR(16),
      pack_count INTEGER DEFAULT 1,
      packaging VARCHAR(64),
      alcohol_abv NUMERIC(4, 1),
      alcohol_vintage INTEGER,
      verification_status VARCHAR(32) NOT NULL DEFAULT 'unverified',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS product_barcodes (
      barcode VARCHAR(32) PRIMARY KEY,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      barcode_type VARCHAR(16) NOT NULL DEFAULT 'EAN13',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS retailer_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      retailer_external_id VARCHAR(255) NOT NULL,
      retailer_title VARCHAR(500) NOT NULL,
      retailer_url VARCHAR(1000),
      match_confidence NUMERIC(3, 2) NOT NULL DEFAULT 0,
      match_method VARCHAR(32) NOT NULL DEFAULT 'unknown',
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (retailer_id, retailer_external_id)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS price_observations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      retailer_product_id UUID NOT NULL REFERENCES retailer_products(id) ON DELETE CASCADE,
      store_id UUID,
      observed_price NUMERIC(10, 2) NOT NULL,
      unit_price NUMERIC(10, 4),
      comparison_price NUMERIC(10, 2),
      member_price NUMERIC(10, 2),
      promotion_type VARCHAR(32),
      multi_buy_quantity INTEGER,
      multi_buy_total NUMERIC(10, 2),
      availability_status VARCHAR(32) NOT NULL DEFAULT 'available',
      valid_from TIMESTAMPTZ,
      valid_to TIMESTAMPTZ,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_method VARCHAR(32) NOT NULL,
      source_reference VARCHAR(255),
      confidence NUMERIC(3, 2) NOT NULL DEFAULT 0
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS watch_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      visibility VARCHAR(16) NOT NULL DEFAULT 'private',
      desired_quantity INTEGER,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      snoozed_until TIMESTAMPTZ,
      last_bought_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (owner_user_id, product_id)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS signal_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      watch_item_id UUID NOT NULL REFERENCES watch_items(id) ON DELETE CASCADE,
      rule_type VARCHAR(32) NOT NULL,
      target_price NUMERIC(10, 2),
      minimum_discount_percent NUMERIC(5, 2),
      near_low_percent NUMERIC(5, 2),
      include_member_prices BOOLEAN NOT NULL DEFAULT TRUE,
      include_multi_buy BOOLEAN NOT NULL DEFAULT TRUE,
      allowed_retailers UUID[],
      excluded_retailers UUID[],
      cooldown_hours INTEGER NOT NULL DEFAULT 24,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS signal_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      watch_item_id UUID NOT NULL REFERENCES watch_items(id) ON DELETE CASCADE,
      price_observation_id UUID REFERENCES price_observations(id) ON DELETE SET NULL,
      retailer_product_id UUID REFERENCES retailer_products(id) ON DELETE SET NULL,
      rule_id UUID REFERENCES signal_rules(id) ON DELETE SET NULL,
      rule_type VARCHAR(32) NOT NULL,
      current_price NUMERIC(10, 2) NOT NULL,
      baseline_price NUMERIC(10, 2),
      historical_low NUMERIC(10, 2),
      difference_amount NUMERIC(10, 2),
      difference_percent NUMERIC(6, 2),
      explanation TEXT NOT NULL,
      label VARCHAR(32) NOT NULL,
      confidence NUMERIC(3, 2) NOT NULL,
      conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      observed_at TIMESTAMPTZ NOT NULL
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS scan_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      barcode VARCHAR(32) NOT NULL,
      scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS device_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform VARCHAR(16) NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes for hot paths.
  await q(`CREATE INDEX IF NOT EXISTS idx_product_barcodes_product ON product_barcodes(product_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_retailer_products_product ON retailer_products(product_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_retailer_products_retailer ON retailer_products(retailer_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_price_obs_rp_time ON price_observations(retailer_product_id, observed_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_watch_items_owner ON watch_items(owner_user_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_signal_rules_watch_item ON signal_rules(watch_item_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_signal_events_watch_item ON signal_events(watch_item_id, triggered_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_signal_events_status ON signal_events(status)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_scan_history_user ON scan_history(user_id, scanned_at DESC)`);
}

async function down(client) {
  const q = (text) => (client ? client.query(text) : db.query(text));
  await q('DROP TABLE IF EXISTS device_tokens CASCADE');
  await q('DROP TABLE IF EXISTS scan_history CASCADE');
  await q('DROP TABLE IF EXISTS signal_events CASCADE');
  await q('DROP TABLE IF EXISTS signal_rules CASCADE');
  await q('DROP TABLE IF EXISTS watch_items CASCADE');
  await q('DROP TABLE IF EXISTS price_observations CASCADE');
  await q('DROP TABLE IF EXISTS retailer_products CASCADE');
  await q('DROP TABLE IF EXISTS product_barcodes CASCADE');
  await q('DROP TABLE IF EXISTS products CASCADE');
  await q('DROP TABLE IF EXISTS retailers CASCADE');
  await q('DROP TABLE IF EXISTS users CASCADE');
}

module.exports = { up, down };

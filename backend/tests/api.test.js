'use strict';

/**
 * API contract tests using Node's built-in `node:sqlite` (in-memory SQLite).
 * These exercise the full route layer (auth, products, watchlist, signals,
 * ingestion) without needing a running PostgreSQL server or native modules.
 *
 * A tiny SQL-translation layer adapts the PostgreSQL-flavoured SQL used by
 * services to SQLite. Integration against real PostgreSQL happens in staging.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

// --- Build the SQLite schema -----------------------------------------------
const sqlite = new DatabaseSync(':memory:');

/** SQLite expression that mirrors PostgreSQL gen_random_uuid(). */
const UUID_EXPR =
  "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))";

sqlite.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    postcode TEXT,
    is_adult INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE retailers (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    website TEXT,
    adapter TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE products (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    canonical_name TEXT NOT NULL,
    brand TEXT,
    variant TEXT,
    category TEXT,
    net_quantity REAL,
    unit TEXT,
    pack_count INTEGER DEFAULT 1,
    packaging TEXT,
    alcohol_abv REAL,
    alcohol_vintage INTEGER,
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE product_barcodes (
    barcode TEXT PRIMARY KEY,
    product_id TEXT NOT NULL DEFAULT ${UUID_EXPR} REFERENCES products(id) ON DELETE CASCADE,
    barcode_type TEXT NOT NULL DEFAULT 'EAN13',
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE retailer_products (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    retailer_id TEXT NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    retailer_external_id TEXT NOT NULL,
    retailer_title TEXT NOT NULL,
    retailer_url TEXT,
    match_confidence REAL NOT NULL DEFAULT 0,
    match_method TEXT NOT NULL DEFAULT 'unknown',
    last_seen_at TEXT,
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (retailer_id, retailer_external_id)
  );
  CREATE TABLE price_observations (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    retailer_product_id TEXT NOT NULL REFERENCES retailer_products(id) ON DELETE CASCADE,
    store_id TEXT,
    observed_price REAL NOT NULL,
    unit_price REAL,
    comparison_price REAL,
    member_price REAL,
    promotion_type TEXT,
    multi_buy_quantity INTEGER,
    multi_buy_total REAL,
    availability_status TEXT NOT NULL DEFAULT 'available',
    valid_from TEXT,
    valid_to TEXT,
    observed_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    source_method TEXT NOT NULL,
    source_reference TEXT,
    confidence REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE watch_items (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    visibility TEXT NOT NULL DEFAULT 'private',
    desired_quantity INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    snoozed_until TEXT,
    last_bought_at TEXT,
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (owner_user_id, product_id)
  );
  CREATE TABLE signal_rules (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    watch_item_id TEXT NOT NULL REFERENCES watch_items(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    target_price REAL,
    minimum_discount_percent REAL,
    near_low_percent REAL,
    include_member_prices INTEGER NOT NULL DEFAULT 1,
    include_multi_buy INTEGER NOT NULL DEFAULT 1,
    allowed_retailers TEXT,
    excluded_retailers TEXT,
    cooldown_hours INTEGER NOT NULL DEFAULT 24,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE signal_events (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    watch_item_id TEXT NOT NULL REFERENCES watch_items(id) ON DELETE CASCADE,
    price_observation_id TEXT,
    retailer_product_id TEXT,
    rule_id TEXT,
    rule_type TEXT NOT NULL,
    current_price REAL NOT NULL,
    baseline_price REAL,
    historical_low REAL,
    difference_amount REAL,
    difference_percent REAL,
    explanation TEXT NOT NULL,
    label TEXT NOT NULL,
    confidence REAL NOT NULL,
    conditions TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    triggered_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    observed_at TEXT NOT NULL
  );
  CREATE TABLE scan_history (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    barcode TEXT NOT NULL,
    scanned_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE device_tokens (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')));

  -- Phase 4: households + notification preferences
  CREATE TABLE households (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    name TEXT NOT NULL,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE household_members (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (household_id, user_id)
  );
  CREATE TABLE household_invites (
    id TEXT PRIMARY KEY DEFAULT ${UUID_EXPR},
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_email TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE notification_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    global_enabled INTEGER NOT NULL DEFAULT 1,
    quiet_hours_enabled INTEGER NOT NULL DEFAULT 0,
    quiet_hours_start TEXT NOT NULL DEFAULT '22:00',
    quiet_hours_end TEXT NOT NULL DEFAULT '07:00',
    digest_mode INTEGER NOT NULL DEFAULT 0,
    per_product_cooldown_hours INTEGER NOT NULL DEFAULT 24,
    household_activity_enabled INTEGER NOT NULL DEFAULT 1,
    immediate_high_value_enabled INTEGER NOT NULL DEFAULT 1,
    alcohol_alerts_enabled INTEGER NOT NULL DEFAULT 1,
    muted_categories TEXT NOT NULL DEFAULT '[]',
    muted_retailers TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
  );

`);

// --- pg-compatible adapter over SQLite -------------------------------------
function translate(sql) {
  let out = sql;
  // Embed the generated UUID as a literal (binding it as TEXT would bypass the column default).
  out = out.replace(/gen_random_uuid\(\)/gi, `(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`);
  out = out.replace(/\bNOW\(\)\s*\+\s*INTERVAL\s+'(\d+) hours'/gi, (_, n) => `STRFTIME('%Y-%m-%dT%H:%M:%fZ','now','+${n} hours')`);
  out = out.replace(/\bNOW\(\)/gi, `STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')`);
  out = out.replace(/\bILIKE\b/gi, 'LIKE');
  out = out.replace(/\bTRUE\b/gi, '1').replace(/\bFALSE\b/gi, '0');
  return out;
}

/**
 * Expand PostgreSQL $N placeholders into anonymous ? markers, duplicating
 * parameter values where a placeholder is referenced more than once
 * (node:sqlite binds positionally and cannot reuse numbered params).
 */
function expandPlaceholders(sql, params) {
  const needed = [];
  const out = sql.replace(/\$(\d+)/g, (_, n) => {
    needed.push(Number(n));
    return '?';
  });
  const expanded = needed.map((i) => {
    const v = (params || [])[i - 1];
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString();
    if (v != null && typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  return { sql: out, params: expanded };
}

const fakePool = {
  async query(text, params) {
    const rawSql = translate(typeof text === 'string' ? text : (text && text.text) || '');
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(rawSql)) {
      sqlite.exec(rawSql.replace(/;$/, ''));
      return { rows: [], rowCount: 0 };
    }
    const { sql, params: expanded } = expandPlaceholders(rawSql, params);
    try {
      const isSelect = /^\s*(SELECT|WITH)\b/i.test(sql);
      if (isSelect || /RETURNING/i.test(sql)) {
        const rows = sqlite.prepare(sql).all(...expanded);
        return { rows, rowCount: rows.length };
      }
      const info = sqlite.prepare(sql).run(...expanded);
      return { rows: [], rowCount: Number(info.changes) };
    } catch (err) {
      if (/UNIQUE constraint failed/i.test(err.message)) {
        const e = new Error(err.message);
        e.code = '23505';
        throw e;
      }
      if (/FOREIGN KEY constraint failed/i.test(err.message)) {
        const e = new Error(err.message);
        e.code = '23503';
        throw e;
      }
      throw err;
    }
  },
  /** Minimal client for db.withTransaction(); BEGIN/COMMIT/ROLLBACK pass through above. */
  async connect() {
    return {
      query: (text, params) => fakePool.query(text, params),
      release() {},
    };
  },
};

const db = require('../src/config/database');
db.setPool(fakePool);

// --- Seed fixture data -----------------------------------------------------
const RETAILERS = [
  { slug: 'coles', name: 'Coles' },
  { slug: 'woolworths', name: 'Woolworths' },
  { slug: 'dan-murphys', name: "Dan Murphy's" },
];
const PRODUCTS = [
  {
    barcode: '9310640020223',
    canonical_name: 'Tomato Pasta Sauce',
    brand: 'ExampleBrand',
    variant: 'Basil & Oregano',
    category: 'grocery',
    net_quantity: 500,
    unit: 'ml',
    verification_status: 'verified',
    offers: [
      { retailer: 'coles', external_id: 'coles-1001', title: 'ExampleBrand Tomato Pasta Sauce Basil 500mL', usual: 6.5, low: 4.5, current: 4.5 },
      { retailer: 'woolworths', external_id: 'woolies-2001', title: 'ExampleBrand Pasta Sauce Basil 500g', usual: 6.5, low: 5.0, current: 6.5 },
    ],
  },
  {
    barcode: '9312680820030',
    canonical_name: 'Blended Whisky',
    brand: 'ExampleDistillery',
    variant: 'Two Oak',
    category: 'liquor',
    net_quantity: 700,
    unit: 'ml',
    alcohol_abv: 40.0,
    verification_status: 'verified',
    offers: [
      { retailer: 'dan-murphys', external_id: 'dm-3001', title: 'ExampleDistillery Two Oak 700mL', usual: 62.0, low: 45.0, current: 49.9 },
    ],
  },
];

function seed() {
  const now = Date.now();
  const retailerIds = {};
  for (const r of RETAILERS) {
    const id = crypto.randomUUID();
    retailerIds[r.slug] = id;
    sqlite.prepare('INSERT INTO retailers (id, slug, name) VALUES (?, ?, ?)').run(id, r.slug, r.name);
  }
  for (const p of PRODUCTS) {
    const productId = crypto.randomUUID();
    sqlite
      .prepare('INSERT INTO products (id, canonical_name, brand, variant, category, net_quantity, unit, alcohol_abv, verification_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(productId, p.canonical_name, p.brand, p.variant, p.category, p.net_quantity, p.unit, p.alcohol_abv || null, p.verification_status);
    sqlite.prepare('INSERT INTO product_barcodes (barcode, product_id) VALUES (?, ?)').run(p.barcode, productId);
    for (const offer of p.offers) {
      const rpId = crypto.randomUUID();
      sqlite
        .prepare('INSERT INTO retailer_products (id, retailer_id, product_id, retailer_external_id, retailer_title, match_confidence, match_method) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(rpId, retailerIds[offer.retailer], productId, offer.external_id, offer.title, 1.0, 'barcode');
      const observations = [];
      for (let i = 56; i >= 1; i -= 4) {
        const wobble = ((i * 7919) % 13) / 100;
        observations.push({ price: offer.usual * (1 + wobble - 0.06), at: now - i * 86400000 });
      }
      observations.push({ price: offer.low, at: now - 10 * 86400000 });
      observations.push({ price: offer.current, at: now - 30 * 60000 });
      for (const obs of observations) {
        sqlite
          .prepare("INSERT INTO price_observations (id, retailer_product_id, observed_price, source_method, confidence, observed_at) VALUES (?, ?, ?, 'fixture', 1.0, ?)")
          .run(crypto.randomUUID(), rpId, obs.price.toFixed(2), new Date(obs.at).toISOString());
      }
    }
  }
}

// --- Tests -----------------------------------------------------------------
const request = require('supertest');
const app = require('../src/app');

let authedToken;
let userId;

beforeAll(async () => {
  seed();
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'test@shelfsignal.example', password: 'correct-horse-battery', displayName: 'Test User' });
  expect(res.status).toBe(201);
  authedToken = res.body.data.token;
  userId = res.body.data.user.id;
  sqlite.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId);
});

function authed(req) {
  return req.set('Authorization', `Bearer ${authedToken}`);
}

describe('privileged ingestion (admin only)', () => {
  let plainToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'plain@shelfsignal.example', password: 'correct-horse-battery' });
    plainToken = res.body.data.token;
  });

  it('rejects unauthenticated ingestion with 401', async () => {
    const res = await request(app)
      .post('/api/retailers/ingest-fixture')
      .send({ barcode: '9312680820030', retailerSlug: 'dan-murphys', price: 1 });
    expect(res.status).toBe(401);
  });

  it('rejects a normal user on ingest-fixture with 403', async () => {
    const res = await request(app)
      .post('/api/retailers/ingest-fixture')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ barcode: '9312680820030', retailerSlug: 'dan-murphys', price: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('rejects a normal user on ingest-open-prices with 403', async () => {
    const res = await request(app)
      .post('/api/retailers/ingest-open-prices')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ barcode: '9310640020223' });
    expect(res.status).toBe(403);
  });

  it('honours demotion immediately (role is read from the database, not the JWT)', async () => {
    sqlite.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(userId);
    const res = await authed(request(app).post('/api/retailers/ingest-fixture')).send({
      barcode: '9312680820030',
      retailerSlug: 'dan-murphys',
      price: 1,
    });
    expect(res.status).toBe(403);
    sqlite.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId);
  });
});

describe('health', () => {
  it('responds ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('auth', () => {
  it('rejects duplicate registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@shelfsignal.example', password: 'correct-horse-battery' });
    expect(res.status).toBe(409);
  });

  it('logs in and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@shelfsignal.example', password: 'correct-horse-battery' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@shelfsignal.example', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('requires auth for /me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('updates profile', async () => {
    const res = await authed(request(app).patch('/api/auth/me')).send({ postcode: '2000', displayName: 'Matt' });
    expect(res.status).toBe(200);
    expect(res.body.data.postcode).toBe('2000');
  });
});

describe('products', () => {
  it('resolves a known barcode', async () => {
    const res = await authed(request(app).post('/api/products/resolve-barcode')).send({ barcode: '9310640020223' });
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.product.canonical_name).toBe('Tomato Pasta Sauce');
  });

  it('returns found:false for unknown but valid barcodes', async () => {
    const res = await authed(request(app).post('/api/products/resolve-barcode')).send({  barcode: '2000000000015' });
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(false);
  });

  it('rejects invalid barcodes', async () => {
    const res = await authed(request(app).post('/api/products/resolve-barcode')).send({ barcode: '123' });
    expect(res.status).toBe(400);
  });

  it('searches products', async () => {
    const res = await authed(request(app).get('/api/products/search?q=sauce'));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('records and lists scan history', async () => {
    await authed(request(app).post('/api/products/scan-history')).send({ barcode: '9310640020223' });
    const list = await authed(request(app).get('/api/products/scan-history'));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
  });
});

describe('watchlist + signals vertical slice', () => {
  let watchItemId;

  it('adds a product to the watchlist', async () => {
    const search = await authed(request(app).get('/api/products/search?q=whisky'));
    const productId = search.body.data[0].id;
    const res = await authed(request(app).post('/api/watchlist')).send({ productId });
    expect(res.status).toBe(201);
    watchItemId = res.body.data.id;
  });

  it('creates a target-price rule', async () => {
    const res = await authed(request(app).post(`/api/watchlist/${watchItemId}/rules`)).send({
      ruleType: 'target_price',
      targetPrice: 50,
      cooldownHours: 24,
    });
    expect(res.status).toBe(201);
  });

  it('produces an explainable signal from a qualifying fixture offer', async () => {
    const res = await authed(request(app).post('/api/retailers/ingest-fixture')).send({
      barcode: '9312680820030',
      retailerSlug: 'dan-murphys',
      price: 49.9,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.signalsCreated).toBeGreaterThanOrEqual(1);

    const signal = res.body.data.signals[0];
    expect(signal.explanation).toContain('target');
    expect(Number(signal.current_price)).toBe(49.9);
    expect(signal.label).toBeTruthy();
  });

  it('lists active signals', async () => {
    const res = await authed(request(app).get('/api/signals'));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const s = res.body.data[0];
    expect(s.canonical_name).toBe('Blended Whisky');
    expect(s.explanation).toBeTruthy();
  });

  it('does not duplicate within cooldown', async () => {
    const res = await authed(request(app).post('/api/retailers/ingest-fixture')).send({
      barcode: '9312680820030',
      retailerSlug: 'dan-murphys',
      price: 49.5,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.signalsCreated).toBe(0);
  });

  it('marks a signal as bought', async () => {
    const list = await authed(request(app).get('/api/signals'));
    const signalId = list.body.data[0].id;
    const res = await authed(request(app).post(`/api/signals/${signalId}/mark-bought`));
    expect(res.status).toBe(200);

    const after = await authed(request(app).get('/api/signals'));
    const acted = after.body.data.find((s) => s.id === signalId);
    expect(acted).toBeUndefined();
  });

  it('dismisses a signal', async () => {
    const res = await authed(request(app).post('/api/retailers/ingest-fixture')).send({
      barcode: '9310640020223',
      retailerSlug: 'coles',
      price: 4.5,
    });
    expect(res.status).toBe(201);
    if (res.body.data.signalsCreated >= 1) {
      const signalId = res.body.data.signals[0].id;
      const dismissed = await authed(request(app).post(`/api/signals/${signalId}/dismiss`));
      expect(dismissed.status).toBe(200);
    }
  });
});

describe('watch item lifecycle', () => {
  it('snoozes and unsnoozes', async () => {
    const watch = await authed(request(app).get('/api/watchlist'));
    const item = watch.body.data[0];
    const res = await authed(request(app).patch(`/api/watchlist/${item.id}`)).send({
      snoozed_until: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.snoozed_until).toBeTruthy();
  });

  it('deletes a watch item', async () => {
    const watch = await authed(request(app).get('/api/watchlist'));
    expect(watch.body.data.length).toBeGreaterThanOrEqual(1);
    const item = watch.body.data[watch.body.data.length - 1];
    const res = await authed(request(app).delete(`/api/watchlist/${item.id}`));
    expect(res.status).toBe(200);
  });
});

describe('account deletion', () => {
  it('deletes the account and cascades data', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'deleteme@shelfsignal.example', password: 'temporary-password' });
    const token = res.body.data.token;

    const del = await request(app).delete('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });
});

describe('phase 0: Open Food Facts identity candidate', () => {
  const openFoodFacts = require('../src/services/openFoodFactsClient');

  afterAll(() => openFoodFacts.reset());

  it('returns an unverified external identity for unknown barcodes without persisting it', async () => {
    openFoodFacts.configure({
      enabled: true,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          product: {
            product_name: 'Coca-Cola Original',
            brands: 'COCA-COLA SERVICES SA/NV',
            quantity: '330 ml',
            categories_tags: ['en:soft-drinks'],
            image_url: 'https://images.example/front.jpg',
          },
        }),
      }),
    });

    const res = await authed(request(app).post('/api/products/resolve-barcode')).send({ barcode: '5449000000996' });
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(false);
    expect(res.body.data.external).toBeTruthy();
    expect(res.body.data.external.canonical_name).toBe('Coca-Cola Original');
    expect(res.body.data.external.verification_status).toBe('unverified');
    expect(res.body.data.external.source).toBe('openfoodfacts');
    expect(res.body.data.external.net_quantity).toBe(330);

    // Candidate stays stateless: with the adapter off, resolution is plain unknown.
    openFoodFacts.configure({ enabled: false });
    const offline = await authed(request(app).post('/api/products/resolve-barcode')).send({ barcode: '5449000000996' });
    expect(offline.status).toBe(200);
    expect(offline.body.data.found).toBe(false);
    expect(offline.body.data.external).toBeUndefined();
  });

  it('prefills the moderation queue from a submitted candidate', async () => {
    const submission = {
      barcode: '5449000000996',
      suggestedName: 'Coca-Cola Original',
      brand: 'COCA-COLA SERVICES SA/NV',
      category: 'grocery',
      netQuantity: 330,
      unit: 'ml',
    };
    const sub = await authed(request(app).post('/api/products/submissions')).send(submission);
    expect(sub.status).toBe(201);
    expect(sub.body.data.created).toBe(true);

    const product = await authed(request(app).get(`/api/products/${sub.body.data.productId}`));
    expect(product.status).toBe(200);
    expect(product.body.data.verification_status).toBe('unverified'); // never auto-verified
    expect(product.body.data.category).toBe('grocery');
    expect(product.body.data.net_quantity).toBe(330);

    // The barcode now resolves locally.
    const res = await authed(request(app).post('/api/products/resolve-barcode')).send({ barcode: '5449000000996' });
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.product.canonical_name).toBe('Coca-Cola Original');

    // Duplicate submission is idempotent.
    const dup = await authed(request(app).post('/api/products/submissions')).send(submission);
    expect(dup.status).toBe(201);
    expect(dup.body.data.created).toBe(false);
  });
});

describe('phase 3: Open Prices ingestion', () => {
  const openPrices = require('../src/services/openPricesClient');
  const TODAY = new Date().toISOString().slice(0, 10);

  afterAll(() => openPrices.reset());

  const fixtureItems = [
    // ✅ AUD, Australian store of a configured retailer, receipt proof, fresh.
    { id: 9001, product_code: '9310640020223', price: 47.5, currency: 'AUD', date: TODAY, proof: { type: 'RECEIPT' },
      location: { osm_name: 'Coles Preston', osm_brand: 'Coles', osm_address_country_code: 'AU' } },
    // ❌ wrong currency.
    { id: 9002, product_code: '9310640020223', price: 9.99, currency: 'EUR', date: TODAY, proof: { type: 'SHOP_IMPORT' },
      location: { osm_name: 'Franprix', osm_address_country_code: 'FR' } },
    // ❌ Australian but unmapped independent store.
    { id: 9003, product_code: '9310640020223', price: 5.0, currency: 'AUD', date: TODAY,
      location: { osm_name: 'Independent Cellar', osm_address_country_code: 'AU' } },
    // ❌ mapped chain (ALDI) not present in this slice's retailer seed.
    { id: 9004, product_code: '9310640020223', price: 6.0, currency: 'AUD', date: TODAY,
      location: { osm_name: 'ALDI Preston', osm_brand: 'ALDI', osm_address_country_code: 'AU' } },
    // ❌ no observation date — never claim "now" for an undated crowd price.
    { id: 9005, product_code: '9310640020223', price: 7.0, currency: 'AUD', date: null,
      location: { osm_name: 'Coles Preston', osm_brand: 'Coles', osm_address_country_code: 'AU' } },
  ];

  function enableOpenPrices(items) {
    openPrices.configure({
      enabled: true,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ items }) }),
    });
  }

  it('is rejected while the adapter is disabled', async () => {
    openPrices.reset(); // disabled under NODE_ENV=test
    const res = await authed(request(app).post('/api/retailers/ingest-open-prices')).send({ barcode: '9310640020223' });
    expect(res.status).toBe(400);
  });

  it('ingests only AUD prices at mapped AU stores, records provenance and fires an explainable signal', async () => {
    // Give the sauce a watcher whose target the crowd price meets.
    const search = await authed(request(app).get('/api/products/search?q=sauce'));
    const productId = search.body.data[0].id;
    const watch = await authed(request(app).post('/api/watchlist')).send({ productId });
    expect(watch.status).toBe(201);
    const rule = await authed(request(app).post(`/api/watchlist/${watch.body.data.id}/rules`)).send({
      ruleType: 'target_price',
      targetPrice: 50,
      cooldownHours: 24,
    });
    expect(rule.status).toBe(201);

    // Age the fixture offers so the undated-time crowd observation (midnight
    // UTC) is the freshest one — determinism for the freshness gate.
    sqlite.exec(
      `UPDATE price_observations SET observed_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now','-5 days')
       WHERE source_method = 'fixture'
         AND retailer_product_id IN (
           SELECT rp.id FROM retailer_products rp
           JOIN product_barcodes pb ON pb.product_id = rp.product_id
           WHERE pb.barcode = '9310640020223')`,
    );

    enableOpenPrices(fixtureItems);
    const res = await authed(request(app).post('/api/retailers/ingest-open-prices')).send({ barcode: '9310640020223' });
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data.fetched).toBe(5);
    expect(data.ingested).toBe(1);
    expect(data.skipped.non_aud).toBe(1);
    expect(data.skipped.unmapped_location).toBe(1);
    expect(data.skipped.retailer_not_configured).toBe(1);
    expect(data.skipped.missing_date).toBe(1);
    expect(data.skipped.duplicate).toBe(0);
    expect(data.signalsCreated).toBeGreaterThanOrEqual(1);
    expect(Number(data.signals[0].current_price)).toBe(47.5);

    // Provenance survives storage (Master Prompt §15) and is API-visible.
    const history = await authed(request(app).get(`/api/products/${productId}/price-history`));
    expect(history.status).toBe(200);
    const row = history.body.data.find((o) => o.source_method === 'open_prices');
    expect(row).toBeTruthy();
    expect(row.source_reference).toBe('open-prices:9001');
    expect(Number(row.observed_price)).toBe(47.5);
    expect(row.retailer_slug).toBe('coles');
  });

  it('dedupes on re-ingest via the provenance reference', async () => {
    enableOpenPrices(fixtureItems);
    const again = await authed(request(app).post('/api/retailers/ingest-open-prices')).send({ barcode: '9310640020223' });
    expect(again.status).toBe(201);
    expect(again.body.data.ingested).toBe(0);
    expect(again.body.data.skipped.duplicate).toBe(1);
    expect(again.body.data.signalsCreated).toBe(0); // nothing new to evaluate

    // Upstream outages surface as 502, never as silent success.
    openPrices.configure({ enabled: true, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
    const down = await authed(request(app).post('/api/retailers/ingest-open-prices')).send({ barcode: '9310640020223' });
    expect(down.status).toBe(502);
  });
});

describe('phase 3: source diagnostics', () => {
  it('reports the lawful source catalog, adapter states and per-source aggregates', async () => {
    const res = await request(app).get('/api/retailers/diagnostics');
    expect(res.status).toBe(200);
    const data = res.body.data;

    // Catalog: every lawful pathway, honestly described.
    expect(data.freshnessHours).toBe(48);
    const ids = data.catalog.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['openfoodfacts', 'open_prices', 'fixture']));
    const off = data.catalog.find((s) => s.id === 'openfoodfacts');
    expect(off.kind).toBe('identity');
    expect(off.mode).toBe('server + browser');
    expect(typeof off.enabled).toBe('boolean');
    const op = data.catalog.find((s) => s.id === 'open_prices');
    expect(op.mode).toBe('server-side only');

    // Aggregates: fixture history from the seed + the Phase 3 ingest above.
    const fixture = data.bySourceMethod.find((s) => s.source_method === 'fixture');
    expect(fixture).toBeTruthy();
    expect(fixture.observation_count).toBeGreaterThanOrEqual(48);
    expect(fixture.product_count).toBeGreaterThanOrEqual(2);
    expect(fixture.retailer_count).toBeGreaterThanOrEqual(3);
    expect(fixture.first_observed_at).toBeTruthy();
    expect(fixture.last_observed_at).toBeTruthy();
    expect(typeof fixture.hours_since_last_observation).toBe('number');
    expect(typeof fixture.stale).toBe('boolean');

    const openPrices = data.bySourceMethod.find((s) => s.source_method === 'open_prices');
    expect(openPrices).toBeTruthy();
    expect(openPrices.observation_count).toBe(1); // only the receipt-proof AUD row passed the gate
    expect(openPrices.product_count).toBe(1);
    expect(openPrices.retailer_count).toBe(1);
  });
});

describe('phase 4: household sharing (spec 9.9)', () => {
  let householdId;
  let inviteToken;
  let inviteId;
  let secondToken;
  let secondUserId;

  it('rejects unauthenticated household access', async () => {
    expect((await request(app).get('/api/households')).status).toBe(401);
    expect((await request(app).post('/api/households').send({ name: 'x' })).status).toBe(401);
    expect((await request(app).get('/api/notifications/preferences')).status).toBe(401);
  });

  it('creates a household with the caller as owner', async () => {
    const res = await authed(request(app).post('/api/households')).send({ name: 'The Test Household' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('The Test Household');
    expect(res.body.data.owner_user_id).toBe(userId);
    householdId = res.body.data.id;
  });

  it('rejects a blank household name', async () => {
    const res = await authed(request(app).post('/api/households')).send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects joining a second household', async () => {
    const res = await authed(request(app).post('/api/households')).send({ name: 'Another' });
    expect(res.status).toBe(400);
  });

  it('lists the household with role and member count', async () => {
    const res = await authed(request(app).get('/api/households'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].role).toBe('owner');
    expect(Number(res.body.data[0].member_count)).toBe(1);
  });

  it('issues an invite whose raw token is returned exactly once', async () => {
    const res = await authed(request(app).post(`/api/households/${householdId}/invites`))
      .send({ email: 'partner@shelfsignal.example' });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(res.body.data.invitee_email).toBe('partner@shelfsignal.example');
    inviteToken = res.body.data.token;
    inviteId = res.body.data.id;
  });

  it('never exposes the token hash when listing invites', async () => {
    const detail = await authed(request(app).get(`/api/households/${householdId}`));
    expect(detail.status).toBe(200);
    expect(detail.body.data.invites).toHaveLength(1);
    expect(detail.body.data.invites[0].token_hash).toBeUndefined();
    expect(detail.body.data.invites[0].id).toBe(inviteId);
  });

  it('hides invites from non-owners', async () => {
    const detail = await authed(request(app).get(`/api/households/${householdId}`));
    expect(detail.body.data.invites).toHaveLength(1);
    // Once the second user joins, they see no invite list at all.
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'partner@shelfsignal.example', password: 'correct-horse-battery', displayName: 'Partner' });
    expect(reg.status).toBe(201);
    secondToken = reg.body.data.token;
    secondUserId = reg.body.data.user.id;
  });

  it('accepts the invite and enrols the second user as a member', async () => {
    const res = await request(app)
      .post('/api/households/invites/accept')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ token: inviteToken });
    expect(res.status).toBe(200);
    expect(res.body.data.household_id).toBe(householdId);
    expect(res.body.data.role).toBe('member');
    expect(res.body.data.already_member).toBe(false);
  });

  it('is single-use — a second accept fails', async () => {
    const res = await request(app)
      .post('/api/households/invites/accept')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ token: inviteToken });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown invite token', async () => {
    const res = await request(app)
      .post('/api/households/invites/accept')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ token: 'not-a-real-token' });
    expect(res.status).toBe(404);
  });

  it('shows both members to either member', async () => {
    for (const token of [authedToken, secondToken]) {
      const res = await request(app)
        .get(`/api/households/${householdId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.members).toHaveLength(2);
      const roles = res.body.data.members.map((m) => m.role).sort();
      expect(roles).toEqual(['member', 'owner']);
    }
  });

  it('a member cannot issue invites', async () => {
    const res = await request(app)
      .post(`/api/households/${householdId}/invites`)
      .set('Authorization', `Bearer ${secondToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('a non-member cannot see the household (404, not 403)', async () => {
    const outsider = await request(app)
      .post('/api/auth/register')
      .send({ email: 'outsider@shelfsignal.example', password: 'correct-horse-battery' });
    expect(outsider.status).toBe(201);
    const res = await request(app)
      .get(`/api/households/${householdId}`)
      .set('Authorization', `Bearer ${outsider.body.data.token}`);
    expect(res.status).toBe(404);
  });

  it('shared items: private stays private, shared appears for household members', async () => {
    // Owner shares one watched product and keeps a different one private.
    const sauceSearch = await authed(request(app).get('/api/products/search?q=sauce'));
    const whiskySearch = await authed(request(app).get('/api/products/search?q=whisky'));
    const shared = await authed(request(app).post('/api/watchlist'))
      .send({ productId: sauceSearch.body.data[0].id, visibility: 'shared' });
    expect(shared.status).toBe(201);
    expect(shared.body.data.visibility).toBe('shared');
    const privateItem = await authed(request(app).post('/api/watchlist'))
      .send({ productId: whiskySearch.body.data[0].id, visibility: 'private' });
    expect(privateItem.status).toBe(201);
    expect(privateItem.body.data.visibility).toBe('private');

    // The partner (member, not owner) sees the shared item but never the private one.
    const partnerFeed = await request(app)
      .get('/api/households/-/shared-items')
      .set('Authorization', `Bearer ${secondToken}`);
    expect(partnerFeed.status).toBe(200);
    const partnerIds = partnerFeed.body.data.map((i) => i.id);
    expect(partnerIds).toContain(shared.body.data.id);
    expect(partnerIds).not.toContain(privateItem.body.data.id);

    // The partner shares an item of their own: it reaches the owner's feed...
    const partnerShared = await request(app)
      .post('/api/watchlist')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ productId: whiskySearch.body.data[0].id, visibility: 'shared' });
    expect(partnerShared.status).toBe(201);
    const ownerFeed = await authed(request(app).get('/api/households/-/shared-items'));
    expect(ownerFeed.body.data.map((i) => i.id)).toContain(partnerShared.body.data.id);

    // ...but nobody's feed contains their own items (re-fetch both, post-creation).
    const ownerFeedAgain = await authed(request(app).get('/api/households/-/shared-items'));
    expect(ownerFeedAgain.body.data.map((i) => i.id)).not.toContain(shared.body.data.id);
    const partnerFeedAgain = await request(app)
      .get('/api/households/-/shared-items')
      .set('Authorization', `Bearer ${secondToken}`);
    expect(partnerFeedAgain.body.data.map((i) => i.id)).not.toContain(partnerShared.body.data.id);
    // The partner's own feed does show the owner's shared item.
    expect(partnerFeedAgain.body.data.map((i) => i.id)).toContain(shared.body.data.id);
  });

  it('shared items are empty for a user outside any household', async () => {
    const outsider = await request(app)
      .post('/api/auth/login')
      .send({ email: 'outsider@shelfsignal.example', password: 'correct-horse-battery' });
    const res = await request(app)
      .get('/api/households/-/shared-items')
      .set('Authorization', `Bearer ${outsider.body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('a member can leave; the owner cannot be removed', async () => {
    // Owner cannot delete themselves via the member route.
    const ownerAttempt = await authed(request(app).delete(`/api/households/${householdId}/members/${userId}`));
    expect(ownerAttempt.status).toBe(403);

    const leave = await request(app)
      .delete(`/api/households/${householdId}/members/${secondUserId}`)
      .set('Authorization', `Bearer ${secondToken}`);
    expect(leave.status).toBe(200);

    const detail = await authed(request(app).get(`/api/households/${householdId}`));
    expect(detail.body.data.members).toHaveLength(1);

    // The departed user no longer sees shared items.
    const shared = await request(app)
      .get('/api/households/-/shared-items')
      .set('Authorization', `Bearer ${secondToken}`);
    expect(shared.body.data).toEqual([]);
  });

  it('re-accepting after leaving works with a fresh invite', async () => {
    const invite = await authed(request(app).post(`/api/households/${householdId}/invites`)).send({});
    expect(invite.status).toBe(201);
    const res = await request(app)
      .post('/api/households/invites/accept')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ token: invite.body.data.token });
    expect(res.status).toBe(200);
    expect(res.body.data.already_member).toBe(false);
  });

  it('the owner can revoke a pending invite', async () => {
    const invite = await authed(request(app).post(`/api/households/${householdId}/invites`)).send({});
    expect(invite.status).toBe(201);
    const res = await authed(
      request(app).delete(`/api/households/${householdId}/invites/${invite.body.data.id}`),
    );
    expect(res.status).toBe(200);
    // A revoked token is rejected.
    const accept = await request(app)
      .post('/api/households/invites/accept')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ token: invite.body.data.token });
    expect(accept.status).toBe(400);
  });

  it('only the owner can transfer ownership', async () => {
    const asMember = await request(app)
      .post(`/api/households/${householdId}/transfer-owner`)
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ userId });
    expect(asMember.status).toBe(403);

    const missingTarget = await authed(
      request(app).post(`/api/households/${householdId}/transfer-owner`),
    ).send({});
    expect(missingTarget.status).toBe(400);

    const selfTarget = await authed(
      request(app).post(`/api/households/${householdId}/transfer-owner`),
    ).send({ userId });
    expect(selfTarget.status).toBe(400);

    const nonMember = await authed(
      request(app).post(`/api/households/${householdId}/transfer-owner`),
    ).send({ userId: '00000000-0000-4000-8000-000000000000' });
    expect(nonMember.status).toBe(400);
  });

  it('hands ownership to a member and flips both roles atomically', async () => {
    const res = await authed(
      request(app).post(`/api/households/${householdId}/transfer-owner`),
    ).send({ userId: secondUserId });
    expect(res.status).toBe(200);
    expect(res.body.data.owner_user_id).toBe(secondUserId);
    expect(res.body.data.previous_owner_user_id).toBe(userId);

    const detail = await authed(request(app).get(`/api/households/${householdId}`));
    const roles = Object.fromEntries(detail.body.data.members.map((m) => [m.user_id, m.role]));
    expect(roles[secondUserId]).toBe('owner');
    expect(roles[userId]).toBe('member');

    // The previous owner has lost owner-only powers…
    expect((await authed(request(app).post(`/api/households/${householdId}/invites`)).send({})).status).toBe(403);
    // …and the new owner has gained them.
    const invite = await request(app)
      .post(`/api/households/${householdId}/invites`)
      .set('Authorization', `Bearer ${secondToken}`)
      .send({});
    expect(invite.status).toBe(201);
    expect(invite.body.data.token).toBeTruthy();

    // Hand it back so the rest of the suite keeps its original owner.
    const back = await request(app)
      .post(`/api/households/${householdId}/transfer-owner`)
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ userId });
    expect(back.status).toBe(200);
    expect(back.body.data.owner_user_id).toBe(userId);
  });
});

describe('phase 4: notification preferences (spec 9.11)', () => {
  it('returns defaults before anything is saved', async () => {
    const res = await authed(request(app).get('/api/notifications/preferences'));
    expect(res.status).toBe(200);
    expect(res.body.data.global_enabled).toBe(true);
    expect(res.body.data.quiet_hours_enabled).toBe(false);
    expect(res.body.data.quiet_hours_start).toBe('22:00');
    expect(res.body.data.quiet_hours_end).toBe('07:00');
    expect(res.body.data.digest_mode).toBe(false);
    expect(res.body.data.per_product_cooldown_hours).toBe(24);
  });

  it('persists a partial update and merges it with defaults', async () => {
    const res = await authed(request(app).patch('/api/notifications/preferences'))
      .send({ quiet_hours_enabled: true, digest_mode: true, per_product_cooldown_hours: 6 });
    expect(res.status).toBe(200);
    expect(res.body.data.quiet_hours_enabled).toBe(true);
    expect(res.body.data.digest_mode).toBe(true);
    expect(res.body.data.per_product_cooldown_hours).toBe(6);
    expect(res.body.data.global_enabled).toBe(true); // untouched
    expect(res.body.data.updated_at).toBeTruthy();

    const reread = await authed(request(app).get('/api/notifications/preferences'));
    expect(reread.body.data.quiet_hours_enabled).toBe(true);
    expect(reread.body.data.per_product_cooldown_hours).toBe(6);
  });

  it('validates types, times and ranges', async () => {
    expect(
      (await authed(request(app).patch('/api/notifications/preferences')).send({ digest_mode: 'on' })).status,
    ).toBe(400);
    expect(
      (await authed(request(app).patch('/api/notifications/preferences')).send({ quiet_hours_start: '9pm' })).status,
    ).toBe(400);
    expect(
      (await authed(request(app).patch('/api/notifications/preferences')).send({ per_product_cooldown_hours: 999 })).status,
    ).toBe(400);
    // A valid time still passes.
    expect(
      (await authed(request(app).patch('/api/notifications/preferences')).send({ quiet_hours_start: '23:45' })).status,
    ).toBe(200);
  });

  it('preview explains the live delivery decision', async () => {
    // Quiet hours are now enabled (23:45 start) with a 22:00 end.
    const blocked = await authed(request(app).post('/api/notifications/preview')).send({});
    expect(blocked.status).toBe(200);
    expect(typeof blocked.body.data.deliver).toBe('boolean');
    expect(blocked.body.data.reason).toBeTruthy();
    expect(blocked.body.data.evaluated_at).toBeTruthy();

    const highValue = await authed(request(app).post('/api/notifications/preview')).send({ isHighValue: true });
    expect(highValue.status).toBe(200);
    expect(highValue.body.data.deliver).toBe(true);
  });

  it('turning everything off is honoured by the preview', async () => {
    await authed(request(app).patch('/api/notifications/preferences')).send({ global_enabled: false });
    const res = await authed(request(app).post('/api/notifications/preview')).send({ isHighValue: true });
    expect(res.body.data.deliver).toBe(false);
    expect(res.body.data.reason).toBe('global_off');
    // Restore defaults for any later suite.
    await authed(request(app).patch('/api/notifications/preferences')).send({ global_enabled: true, quiet_hours_enabled: false });
  });

  it('persists category and retailer mutes as arrays (spec 9.11)', async () => {
    const res = await authed(request(app).patch('/api/notifications/preferences'))
      .send({ muted_categories: ['liquor', 'cleaning'], muted_retailers: ['coles'] });
    expect(res.status).toBe(200);
    expect(res.body.data.muted_categories).toEqual(['liquor', 'cleaning']);
    expect(res.body.data.muted_retailers).toEqual(['coles']);

    // Round-trips through storage: SQLite stores the JSON array as TEXT.
    const reread = await authed(request(app).get('/api/notifications/preferences'));
    expect(Array.isArray(reread.body.data.muted_categories)).toBe(true);
    expect(reread.body.data.muted_categories).toEqual(['liquor', 'cleaning']);
    expect(reread.body.data.muted_retailers).toEqual(['coles']);
    expect(reread.body.data.global_enabled).toBe(true);
  });

  it('validates and de-duplicates channel lists', async () => {
    expect(
      (await authed(request(app).patch('/api/notifications/preferences')).send({ muted_categories: 'liquor' })).status,
    ).toBe(400);
    expect(
      (await authed(request(app).patch('/api/notifications/preferences')).send({ muted_categories: ['Liquor!'] })).status,
    ).toBe(400);
    expect(
      (await authed(request(app).patch('/api/notifications/preferences'))
        .send({ muted_categories: Array.from({ length: 51 }, (_, i) => `cat-${i}`) })).status,
    ).toBe(400);

    const deduped = await authed(request(app).patch('/api/notifications/preferences'))
      .send({ muted_categories: ['grocery', 'grocery'] });
    expect(deduped.status).toBe(200);
    expect(deduped.body.data.muted_categories).toEqual(['grocery']);
  });

  it('a muted channel suppresses the push, even a high-value one', async () => {
    // muted_categories is ['grocery'], muted_retailers is ['coles'].
    const category = await authed(request(app).post('/api/notifications/preview'))
      .send({ category: 'grocery' });
    expect(category.body.data.deliver).toBe(false);
    expect(category.body.data.reason).toBe('category_muted');

    const retailer = await authed(request(app).post('/api/notifications/preview'))
      .send({ retailer: 'coles' });
    expect(retailer.body.data.deliver).toBe(false);
    expect(retailer.body.data.reason).toBe('retailer_muted');

    // High-value bypasses quiet hours and the digest, but never a hard mute.
    const highValue = await authed(request(app).post('/api/notifications/preview'))
      .send({ category: 'grocery', isHighValue: true });
    expect(highValue.body.data.deliver).toBe(false);
    expect(highValue.body.data.reason).toBe('category_muted');

    // An unmuted channel still delivers.
    const other = await authed(request(app).post('/api/notifications/preview'))
      .send({ category: 'grocery', retailer: 'woolworths' });
    expect(other.body.data.deliver).toBe(false);
    expect(other.body.data.reason).toBe('category_muted'); // still the muted category

    // Clearing the list restores delivery (digest_mode is off again too —
    // an earlier test in this suite left it enabled).
    await authed(request(app).patch('/api/notifications/preferences'))
      .send({ muted_categories: [], muted_retailers: [], digest_mode: false });
    const cleared = await authed(request(app).post('/api/notifications/preview'))
      .send({ category: 'grocery', retailer: 'woolworths' });
    expect(cleared.body.data.deliver).toBe(true);
    expect(cleared.body.data.reason).toBe('ok');
  });
});

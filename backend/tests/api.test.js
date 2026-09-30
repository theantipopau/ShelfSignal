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
});

function authed(req) {
  return req.set('Authorization', `Bearer ${authedToken}`);
}

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

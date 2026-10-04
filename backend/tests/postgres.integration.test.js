/**
 * Real-PostgreSQL integration test (closes the ADR-0006 gap: the contract tests
 * in api.test.js run on SQLite through a translation layer).
 *
 * Runs the real migrations + seeds and walks the critical path from Master
 * Prompt §20: register → scan → watch → rule → qualifying offer → signal →
 * mark bought → household share → preferences → account deletion.
 *
 *   - PG_INTEGRATION=1 + DATABASE_URL  → a real PostgreSQL server (CI service).
 *   - otherwise                         → PGlite (PostgreSQL compiled to WASM,
 *                                         in-process, so it runs anywhere).
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const useRealServer = process.env.PG_INTEGRATION === '1' && !!process.env.DATABASE_URL;
const db = require('../src/config/database');

let pglite = null;

async function setupDatabase() {
  if (useRealServer) return; // db.getPool() builds a pg Pool from DATABASE_URL
  const { PGlite } = require('@electric-sql/pglite');
  const { citext } = require('@electric-sql/pglite/contrib/citext');
  pglite = new PGlite({ extensions: { citext } });
  await pglite.exec('CREATE EXTENSION IF NOT EXISTS citext');
  const run = async (text, params) => {
    const r = await pglite.query(text, params);
    return { rows: r.rows, rowCount: r.affectedRows };
  };
  db.setPool({
    query: run,
    connect: async () => ({ query: run, release() {} }),
    end: async () => pglite.close(),
  });
}

const request = require('supertest');
let app;
const stamp = Date.now();
const email = (n) => `${n}-${stamp}@shelfsignal.example`;

let token;
let userId;
let secondToken;
let productId;
let watchId;
let signalId;

beforeAll(async () => {
  await setupDatabase();
  const { runMigrations, runSeeds } = require('../src/migrations/run');
  await runMigrations({ log: () => {} });
  await runSeeds({ log: () => {} });
  app = require('../src/app');
}, 120000);

afterAll(async () => {
  await db.close();
});

const as = (t, req) => req.set('Authorization', `Bearer ${t}`);

describe('PostgreSQL: migrations and critical path', () => {
  it('applied every migration exactly once and is idempotent', async () => {
    const { runMigrations } = require('../src/migrations/run');
    await runMigrations({ log: () => {} }); // second run is a no-op
    const rows = await db.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        '001_initial_schema.js',
        '002_household_and_preferences.js',
        '003_notification_channel_controls.js',
        '004_user_roles.js',
        '005_shopping_reports_audit.js',
      ]),
    );
    expect(new Set(rows.map((r) => r.name)).size).toBe(rows.length);
  });

  it('registers two users (case-insensitive email via CITEXT)', async () => {
    const a = await request(app).post('/api/auth/register').send({ email: email('Owner'), password: 'correct-horse-battery' });
    expect(a.status).toBe(201);
    token = a.body.data.token;
    userId = a.body.data.user.id;
    const dup = await request(app)
      .post('/api/auth/register')
      .send({ email: email('owner').toUpperCase(), password: 'correct-horse-battery' });
    expect(dup.status).toBe(409);
    const b = await request(app).post('/api/auth/register').send({ email: email('partner'), password: 'correct-horse-battery' });
    secondToken = b.body.data.token;
  });

  it('keeps ingestion admin-only, then allows it after promotion', async () => {
    const body = { barcode: '9312680820030', retailerSlug: 'dan-murphys', price: 49.9 };
    expect((await as(token, request(app).post('/api/retailers/ingest-fixture')).send(body)).status).toBe(403);
    await db.query("UPDATE users SET role = 'admin', is_adult = TRUE WHERE id = $1", [userId]);
  });

  it('resolves a seeded barcode and rejects a bad check digit', async () => {
    const ok = await as(token, request(app).post('/api/products/resolve-barcode')).send({ barcode: '9312680820030' });
    expect(ok.status).toBe(200);
    productId = ok.body.data.product.id;
    const bad = await as(token, request(app).post('/api/products/resolve-barcode')).send({ barcode: '9312680820031' });
    expect(bad.status).toBe(400);
  });

  it('watches the product, adds a rule, and a qualifying offer yields one explainable signal', async () => {
    const w = await as(token, request(app).post('/api/watchlist')).send({ productId });
    expect(w.status).toBe(201);
    watchId = w.body.data.id;
    const rule = await as(token, request(app).post(`/api/watchlist/${watchId}/rules`)).send({
      ruleType: 'target_price',
      targetPrice: 50,
      cooldownHours: 24,
    });
    expect(rule.status).toBe(201);

    const ingest = await as(token, request(app).post('/api/retailers/ingest-fixture')).send({
      barcode: '9312680820030',
      retailerSlug: 'dan-murphys',
      price: 41.5,
    });
    expect(ingest.status).toBe(201);
    expect(ingest.body.data.signalsCreated).toBe(1);

    const again = await as(token, request(app).post('/api/retailers/ingest-fixture')).send({
      barcode: '9312680820030',
      retailerSlug: 'dan-murphys',
      price: 41.0,
    });
    expect(again.body.data.signalsCreated).toBe(0); // cooldown / dedupe

    const list = await as(token, request(app).get('/api/signals'));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    signalId = list.body.data[0].id;
    expect(list.body.data[0].explanation).toBeTruthy();
  });

  it('serves price history with provenance', async () => {
    const h = await as(token, request(app).get(`/api/products/${productId}/price-history`));
    expect(h.status).toBe(200);
    expect(h.body.data.length).toBeGreaterThan(5);
  });

  it('marks the signal bought', async () => {
    const r = await as(token, request(app).post(`/api/signals/${signalId}/mark-bought`));
    expect(r.status).toBe(200);
  });

  it('shares a watch item with a household member but never leaks private ones', async () => {
    const hh = await as(token, request(app).post('/api/households')).send({ name: 'PG Household' });
    expect(hh.status).toBe(201);
    const inv = await as(token, request(app).post(`/api/households/${hh.body.data.id}/invites`)).send({});
    const accept = await as(secondToken, request(app).post('/api/households/invites/accept')).send({ token: inv.body.data.token });
    expect(accept.status).toBe(200);

    await as(token, request(app).patch(`/api/watchlist/${watchId}`)).send({ visibility: 'shared' });
    const shared = await as(secondToken, request(app).get('/api/households/-/shared-items'));
    expect(shared.status).toBe(200);
    expect(shared.body.data.length).toBe(1);

    await as(token, request(app).patch(`/api/watchlist/${watchId}`)).send({ visibility: 'private' });
    const hidden = await as(secondToken, request(app).get('/api/households/-/shared-items'));
    expect(hidden.body.data.length).toBe(0);
  });

  it('stores notification preferences (JSON-in-TEXT mute lists)', async () => {
    const p = await as(token, request(app).patch('/api/notifications/preferences')).send({ muted_categories: ['liquor'] });
    expect(p.status).toBe(200);
    const g = await as(token, request(app).get('/api/notifications/preferences'));
    expect(g.body.data.muted_categories).toEqual(['liquor']);
  });

  it('runs the shopping list, reports, moderation, audit and export on real Postgres', async () => {
    const item = await as(token, request(app).post('/api/shopping-list')).send({ productId, quantity: 2, retailerSlug: 'dan-murphys' });
    expect(item.status).toBe(201);
    const done = await as(token, request(app).patch(`/api/shopping-list/${item.body.data.id}`)).send({ status: 'done' });
    expect(done.body.data.status).toBe('done');
    expect(done.body.data.completed_by).toBe(userId);
    const open = await as(token, request(app).get('/api/shopping-list?status=open'));
    expect(open.body.data.length).toBe(0);
    const shared = await as(token, request(app).post('/api/shopping-list')).send({ title: 'Milk', shared: true });
    expect(shared.status).toBe(201);
    const seen = await as(secondToken, request(app).get('/api/shopping-list'));
    expect(seen.body.data.map((i) => i.title)).toContain('Milk');

    const report = await as(secondToken, request(app).post(`/api/products/${productId}/reports`)).send({ kind: 'mismatch', note: 'wrong size' });
    expect(report.status).toBe(201);
    const reports = await as(token, request(app).get('/api/admin/reports'));
    expect(reports.body.data.length).toBe(1);
    const resolved = await as(token, request(app).post(`/api/admin/reports/${report.body.data.id}/resolve`)).send({ resolution: 'resolved' });
    expect(resolved.status).toBe(200);

    const sub = await as(token, request(app).post('/api/products/submissions')).send({ barcode: '9310072011097', suggestedName: 'unknown thing' });
    const queue = await as(token, request(app).get('/api/admin/moderation/queue'));
    expect(queue.body.data.some((p) => p.barcode === '9310072011097')).toBe(true);
    const verified = await as(token, request(app).post(`/api/admin/products/${sub.body.data.productId}/verify`)).send({ canonicalName: 'Verified Thing', netQuantity: 3, unit: 'kg' });
    expect(verified.status).toBe(200);
    expect(verified.body.data.verification_status).toBe('verified');

    const audit = await as(token, request(app).get('/api/admin/audit'));
    expect(audit.body.data.map((e) => e.action)).toEqual(expect.arrayContaining(['report.resolved', 'product.verify']));

    const exp = await as(token, request(app).get('/api/auth/export'));
    expect(exp.status).toBe(200);
    expect(exp.body.data.shopping_list.length).toBe(2);
    expect(JSON.stringify(exp.body.data)).not.toContain('password_hash');
  });

  it('reports retailer diagnostics', async () => {
    const d = await request(app).get('/api/retailers/diagnostics');
    expect(d.status).toBe(200);
  });

  it('deletes the account and cascades its data', async () => {
    const del = await as(token, request(app).delete('/api/auth/me'));
    expect(del.status).toBe(200);
    const left = await db.query('SELECT COUNT(*)::int AS n FROM watch_items WHERE owner_user_id = $1', [userId]);
    expect(left[0].n).toBe(0);
  });
});

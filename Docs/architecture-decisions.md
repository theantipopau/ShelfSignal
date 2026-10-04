# Architecture Decision Records — ShelfSignal

Status: Accepted | Superseded | Deprecated

## ADR-0001 — Keep Express + PostgreSQL backend; do not rewrite to FastAPI (yet)

**Status:** Accepted (2026-10-01)

**Context:** Master Prompt section 11.1 recommends "FastAPI or NestJS" for the
prototype/beta platform. The initial generated backend used Express + pg, and
the mobile app is Dart/Flutter either way.

**Decision:** Keep Node.js + Express + PostgreSQL for the vertical slice. The
spec's own acceptance criterion is working, tested behaviour, not a specific
framework. Revisit only if the ingestion pipeline (Phase 3) outgrows Node.

**Consequences:** Services are written in dependency-injectable classes/functions
so the core logic can move to another framework without a rewrite.

## ADR-0002 — Canonical products are separate from retailer listings

**Status:** Accepted (2026-10-01)

**Context:** Master Prompt section 12 mandates `Product` ≠ `RetailerProduct`.

**Decision:** `products` + `product_barcodes` are canonical identity.
`retailer_products` maps listings with `match_confidence` and `match_method`.
Prices live only in append-only `price_observations` per retailer listing.

**Consequences:** Product history survives retailer listing churn; confidence
is per-mapping, not per-product.

## ADR-0003 — Signal evaluation is a pure domain module

**Status:** Accepted (2026-10-01)

**Context:** The signal engine is the product's core and must be regression-safe.

**Decision:** `backend/src/domain/signalEvaluator.js` contains only pure
functions (baseline, historical low, gates, rule evaluation). I/O lives in
`signalService.js`. The same logic is mirrored (fixture-for-fixture) in the
Flutter `DemoBackend` and in the single-file web sample (`web/index.html`) so the app's demo mode behaves like production.

**Consequences:** 30+ unit tests cover the engine without a database; any
change to signal semantics must update both implementations.

## ADR-0004 — Bcrypt+JWT sessions now; federated sign-in later

**Status:** Accepted (2026-10-01)

**Context:** Spec section 9.1 wants Apple/Google/email. Firebase was referenced
but never configured (no google-services.json / service account).

**Decision:** Email+password with bcrypt (cost 12) and 7-day JWTs for the
vertical slice. Firebase/Apple/Google are deferred until the mobile Firebase
project exists; `mobile/pubspec.yaml` comments mark the re-entry points.

**Consequences:** `users` table carries `is_adult` and `postcode` now so the
alcohol opt-in and store-context features do not need a migration later.

## ADR-0005 — Demo mode in the app instead of fake live data

**Status:** Accepted (2026-10-01)

**Context:** The app must demonstrate the Shelf-to-Signal loop without a
deployed backend, and the spec forbids fake live prices.

**Decision:** `ApiClient` has explicit `ApiMode.demo | live`. Demo mode is the
default and clearly labelled in the UI; it reads only fixture data identical
to the backend seed. Live mode points at `API base URL` with JWT auth.

**Consequences:** No misleading "live prices" claim; store reviewers see
honest fixture data.

## ADR-0006 — Tests run on node:sqlite, not better-sqlite3

**Status:** Accepted (2026-10-01)

**Context:** `better-sqlite3` needs a native build; this Windows machine has a
broken PATH entry (`nodejs":`) that breaks npm-spawned native builds.

**Decision:** API contract tests use Node's built-in `node:sqlite` with a small
PostgreSQL→SQLite translation layer (UUID exprs, NOW(), ILIKE, INTERVAL,
$N params). Real-PostgreSQL integration remains a staging task.

**Consequences:** `npm test` is hermetic and dependency-free; the translation
layer must keep pace with new SQL constructs (documented in the test header).

**Update (2026-10-04):** partly superseded by ADR-0008 — the critical path is now
also exercised on real PostgreSQL semantics.

## ADR-0007 — Privileged actions are admin-only, role read from the database

**Status:** Accepted (2026-10-04)

**Context:** `POST /api/retailers/ingest-fixture` and `/ingest-open-prices` only
required a valid token, so any user could inject prices that fire signals for every
watcher of a product — violating the spec's trust principle. There were no roles.

**Decision:** `users.role` (`user` | `admin`, migration 004). `requireAdmin`
middleware looks the role up in the database on every privileged request (never from
the JWT) so demotion is immediate. Fixture ingestion is additionally disabled in
production unless `ALLOW_FIXTURE_INGEST=true`. Admins are created with
`npm run make-admin -- <email>`. All admin decisions (verify / reject / resolve) write
an append-only `audit_events` row; the actor FK is `ON DELETE SET NULL` so the trail
survives account deletion.

**Consequences:** moderation and ingestion have one auth path; a future admin UI and
MFA hang off the same guard. Roles are coarse — finer permissions (support staff who
cannot browse private watchlists, spec §18) will need a richer model.

## ADR-0008 — Real-Postgres integration test via PGlite locally, a service container in CI

**Status:** Accepted (2026-10-04)

**Context:** ADR-0006 left real-Postgres coverage as "a staging task"; there is no
Docker on the dev machine. Real Postgres is stricter than SQLite (parameter type
inference, constraints, `ALTER ... ADD CONSTRAINT`), so SQLite-only coverage hides bugs.

**Decision:** `tests/postgres.integration.test.js` runs the real migrations and seeds
and walks the spec §20 critical path. Locally it uses `@electric-sql/pglite` (PostgreSQL
compiled to WASM, with `citext`); with `PG_INTEGRATION=1` and `DATABASE_URL` it targets
a real server, which CI provides as a `postgres:16` service container. The npm `test`
script passes `--experimental-vm-modules` because PGlite uses dynamic import.

**Consequences:** migrations 001–005 are validated on every push. The SQLite contract
suite stays for breadth and speed. PGlite is a dev dependency only.

## ADR-0009 — Session token in platform secure storage

**Status:** Accepted (2026-10-04)

**Context:** The mobile app kept the JWT in plain `shared_preferences`; spec §17
requires secure token storage.

**Decision:** `TokenStore` abstraction; `SecureTokenStore` uses `flutter_secure_storage`
(Keychain / Keystore-backed). A token left in preferences by an older build is migrated
and deleted. If secure storage fails the session lives in memory only — it never falls
back to plain preferences.

**Consequences:** non-secret settings (API base URL, demo flag) stay in preferences.
Refresh-token rotation (spec §17) is still open.

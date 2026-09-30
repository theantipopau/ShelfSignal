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
Flutter `DemoBackend` so the app's demo mode behaves like production.

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

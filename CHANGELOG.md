# ShelfSignal — Rolling Changelog

## 2026-10-01 — Camera Barcode Scanning (spec §9.2/§9.3)

- **mobile_scanner 7.4.2** added; GTIN-only detection (EAN-8, UPC-A/UPC-E,
  EAN-13) with the backend's GS1 mod-10 check digit as a second gate.
- **Permission timing**: the OS camera prompt fires only when the user taps
  "Start camera"; a rationale card explains the on-device-only frame
  processing first (no frames stored or uploaded). Permission-denied and
  start failures degrade gracefully to manual entry with explicit messaging.
- **Spec §9.3 behaviours**: haptic + visual confirmation (scan reticle and
  resolved product card), duplicate suppression (same code ignored for 4s
  and while a resolve is in flight), torch control on the preview, stop-camera
  control, and manual entry always available as the accessible fallback.
- **Platform declarations**: `android.permission.CAMERA` plus
  `uses-feature camera.any required=false` (tablets without a camera can
  still install); iOS `NSCameraUsageDescription` states the barcode-only
  purpose for App Store review.
- **Tests**: 3 new widget tests (camera stays off until opt-in, manual
  resolve of a fixture barcode, GTIN check-digit rejection) — mobile suite
  now 7/7; `flutter analyze` clean.
- **Repo**: GitHub repo description + topics set; CI badge added to README.

## 2026-10-01 — Vertical Slice Rebuild (backend + mobile)

### Review of 2026-09-30 baseline
The initial generated implementation was non-functional and has been rebuilt.
Key defects found and fixed:

- **Backend**: MySQL-style `?` placeholders and array destructuring against
  `pg` (which needs `$1..$n` and returns `{rows}`) — no endpoint could run.
  Routes called service methods that did not exist; classes were never
  instantiated; error middleware handled MongoDB errors; scanner/retailers
  routes were never mounted; schema did not match the spec data model.
- **Mobile**: `firebase_options.dart` recursed infinitely; `firebase_auth` was
  used but not declared; `package:provider` and Riverpod were mixed; `ref` was
  referenced inside plain classes; two conflicting GoRouters existed; the
  scanner provider referenced a non-existent controller type.
- **Missing entirely**: tests, migration runner, docker-compose, admin portal,
  and the signal evaluation engine (the actual product).

### Backend (Express + PostgreSQL)
- **Data layer**: proper pg pool, `query()` returning rows, `withTransaction()`.
- **Schema `001_initial_schema.js`** rewritten to the spec (§12): users,
  retailers, products, product_barcodes, retailer_products, price_observations
  (append-only), watch_items, signal_rules, signal_events, scan_history,
  device_tokens + hot-path indexes.
- **Migration runner** (`npm run migrate`) with `schema_migrations` ledger and
  transactional apply; fixture seeds (`npm run migrate:seed`) with three
  synthetic products across Coles/Woolworths/Dan Murphy's (56 days of history).
- **Auth**: bcrypt + JWT register/login/me/patch/delete (cascading account
  deletion). Constant-shape login failures; CITEXT case-insensitive emails.
- **Barcode**: GS1 mod-10 validation for EAN-8/UPC-A/EAN-13/GTIN-14 with
  normalisation; `POST /api/products/resolve-barcode`; unknown-barcode
  submission creating unverified products for moderation.
- **Watchlist + rules**: watch items CRUD with latest-price join, single
  editable signal rule per item (target / discount% / near-low / any-drop,
  member & multi-buy toggles, cooldown).
- **Signal engine** (`src/domain/signalEvaluator.js`, pure): observed-usual
  median baseline, historical low, freshness, availability, retailer filters,
  snooze, cooldown/dedup, confidence gate (never push on weak matches), and
  explainable output (label + explanation + deltas). Mirror-tested: 30+ unit
  tests.
- **Ingestion + signals**: `POST /api/retailers/ingest-fixture` (explicitly
  fixture, not live scraping) evaluates every watcher; `GET /api/signals` with
  dismiss / snooze / mark-bought closing the loop.
- **API surface**: helmet, CORS, rate limiting, request IDs (`X-Request-Id`),
  JSON error envelope with pg error mapping, `/health` + `/health/ready`,
  device token registration, graceful shutdown. Config fails fast in
  production without JWT_SECRET/DATABASE_URL.
- **Tests**: 52/52 passing via `node:sqlite` contract tests + pure domain unit
  tests (no native modules, no running PostgreSQL required).
- **docker-compose.yml** for local PostgreSQL (Redis omitted until justified).

### Mobile (Flutter)
- **Architecture**: Riverpod-only state management, feature-first layout
  (`core/` + `features/`), GoRouter with a bottom-navigation shell
  (Signals / Watchlist / Scan / Profile).
- **Design tokens** (`core/theme.dart`): deep-charcoal dark, warm off-white
  light, signal green/amber/red semantics per spec §10; M3 components themed.
- **Demo mode**: `ApiClient` with explicit demo/live modes; `DemoBackend`
  mirrors the backend fixtures and signal logic so the full loop
  (scan → watch → rule → offer → explainable signal → mark-bought) works
  offline and is honestly labelled. Live mode speaks the real API with JWT.
- **Screens**: sign in/up, Active Signals cards (label colour, observed-usual
  baseline, explanation, checked-time, mark-bought/dismiss), My Watchlist
  (rule state, snooze, remove, entry to rule editor), manual barcode entry
  with GS1 validation + fixture list, product detail (identity, verification),
  profile (demo toggle, delete account).
- **Camera scanning + Firebase**: deliberately deferred (commented pubspec
  re-entry points) until platform credentials exist; manual entry is the
  accessible fallback.
- **Quality**: `flutter analyze` — no issues; 4 model tests passing; default
  counter test removed.

### Docs
- **Docs/architecture-decisions.md**: ADR-0001..0006 (Express stay-of-execution,
  canonical product separation, pure signal domain, auth staging, demo mode,
  node:sqlite test harness).

### Next steps
1. Run `docker-compose up -d postgres && npm run migrate:seed && npm run dev`
   and point a device/emulator at the LAN URL with demo mode off.
2. Household model + shared watchlist (Phase 4 spec section 9.9).
3. Push pipeline skeleton: device tokens exist; wire FCM once Firebase exists.
4. Admin portal scaffold (Next.js) with moderation queue.
5. Real-PostgreSQL integration job in staging (contract tests already mirror it).

### Repository & CI (2026-10-01)
- Public GitHub repository: https://github.com/theantipopau/ShelfSignal
- GitHub Actions CI (`.github/workflows/ci.yml`): backend lint + jest on
  Node 22 (tests require `node:sqlite`, Node 22.5+), mobile flutter analyze
  + test on stable Flutter. Note: `node:sqlite` does not exist on Node 20 —
  the CI failure on the first push was this exact issue, fixed by pinning Node 22.

## 2026-09-30 — Initial Setup & Scaffolding (historical)

Initial scaffolding by generated agent: Flutter pubspec/providers/screens
(non-compiling), Express backend (MySQL-style SQL, unreachable), Master Prompt
and backlog docs. Superseded by the rebuild above; preserved for provenance.

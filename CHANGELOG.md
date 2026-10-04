# ShelfSignal — Rolling Changelog

## 2026-10-04 — Review fixes: trust, correctness, CI, then moderation and shopping list

Driven by a full review of the spec, docs and code (see Docs/repository-assessment.md).

**Fixed**
- **Anyone could inject prices.** `ingest-fixture` / `ingest-open-prices` are now admin-only
  (`users.role`, migration 004; role read from the DB per request). Fixture ingest is off in
  production unless `ALLOW_FIXTURE_INGEST=true`. Promote with `npm run make-admin -- <email>`.
- **Flaky signals = a real bug.** `isFresh` rejected observations stamped 1 ms ahead of the app
  clock, so DB/app clock skew could silently drop a fresh offer (4 of 8 test runs failed).
  Now tolerates 5 minutes of skew; far-future stamps still fail. Mirrored in the web sample.
- **Invalid evidence withdrawn.** The "Open Food Facts has poor AU coverage (0/6)" finding used
  synthetic and check-digit-invalid barcodes. Re-measured with real codes: 82,035 AU products;
  Vegemite / Weet-Bix / Corn Thins resolve. Liquor is thin (0 whiskies). Probe script fixed.
- **Mobile session token** moved from plain `shared_preferences` to secure storage, with
  migration of legacy tokens (ADR-0009).
- CORS no longer wide open in production (`CORS_ORIGINS` allow-list).
- Removed a scratch debug script that had been committed with the web sample.

**Added**
- Real-PostgreSQL integration test (PGlite locally; `postgres:16` service container in CI),
  covering migrations 001–005 and the §20 critical path (ADR-0008).
- CI: dependency audit and gitleaks secret scan.
- Shopping list (`/api/shopping-list`, spec 9.10): private or household-shared; members can
  complete shared items, only the owner edits or deletes.
- Mismatch/data reports (`POST /api/products/:id/reports`, idempotent) and a moderation API
  (`/api/admin/*`): unverified-product queue, verify with corrections / reject, resolve report
  with optional unmap of the bad retailer listing, append-only audit trail (migration 005).
- Personal data export (`GET /api/auth/export`); `role` exposed on `/me`.
- Docs reconciled: backlog rewritten against reality, assessment refreshed, ADR-0007..0009.

**Tests:** backend 125 → **159** (incl. 12 real-Postgres); mobile 7 → **10**.

## 2026-10-04 — Phase 4: household sharing, notification controls, sample polish

Phase 4 ("Household and Premium UX", spec §24) is now implemented end to end:
invites, shared lists, privacy, motion, accessibility, dark mode, notification
controls and polished states.

- **Households (backend, spec §9.9)** — migration `002_household_and_preferences.js`
  adds `households`, `household_members`, `household_invites` (invite tokens stored
  only as a SHA-256 hash) and `notification_preferences`.
  `householdService.js` + `/api/households` cover create (one household per user),
  member list, invites returned **once**, single-use/expiry/revocation, accept
  (idempotent), owner-only removal, member leave (owner protected), and the shared
  watchlist. Privacy rule enforced in SQL: only `visibility = 'shared'` rows from
  other household members are returned — private items never leave their owner.
- **Notification preferences (backend, spec §9.11)** — `GET`/`PATCH
  /api/notifications/preferences` (global switch, quiet hours incl. midnight wrap,
  digest, per-product cooldown 0–168 h, household activity, high-value override,
  alcohol) plus `POST /api/notifications/preview`, which returns the *reason* for a
  delivery decision instead of a boolean so suppression is auditable.
- **Category and retailer controls (spec §9.11)** — new migration
  `003_notification_channel_controls.js` adds `muted_categories` / `muted_retailers`
  (JSON arrays in TEXT, so Postgres and the SQLite test driver behave identically).
  `shouldDeliver` treats a muted channel as a **hard opt-out**: it beats quiet hours,
  the digest and the high-value override, and reports `category_muted` /
  `retailer_muted`.
- **Ownership transfer (spec §9.9)** — `POST /api/households/:id/transfer-owner`
  (owner only, target must already be a member) flips both roles and
  `owner_user_id` inside one transaction, so a household never has zero or two
  owners.
- **Web sample — notification screen**: all §9.11 controls as real toggles with
  disabled states, quiet-hours time inputs, cooldown clamping, category/retailer
  mute chips, and a delivery dry-run (routine, high-value, and a pickable
  category × retailer signal) driven by the same `shouldDeliver` logic as the
  backend.
- **Web sample — household screen**: create/join, members with role tags, invites
  with a one-time token box + copy, "simulate someone joining" for demo purposes,
  member removal, ownership transfer, and a shared-watchlist card split into
  *shared by you* / *shared with you*. Watch items gained a **Share with household**
  switch (default private) with a `Shared` badge on the watchlist.
- **Web sample — polish**: `.view-enter` transition on every route change (respects
  `prefers-reduced-motion`), focus moves to the new screen for keyboard/screen-reader
  users, skeleton placeholder while an Open Food Facts lookup is in flight, and
  `h4`/small-caps typography for card sub-sections.
- **Verification harness (`web/verify.js`)**: serves the sample on a random port and
  drives headless Chrome across 14 routes, asserting on each — zero uncaught JS
  errors, no horizontal overflow or elements wider than the phone viewport, plus
  three scripted end-to-end flows (create household → share an item → badge →
  shared list; preferences → quiet hours → cooldown → channel mutes; theme × palette
  switching). It immediately caught three real bugs, all fixed: a temporal-dead-zone
  crash (`state = loadState()` before `DEFAULT_PREFS`) that blanked every screen, the
  `#/history/:barcode` route silently rendering the product page, and the offers
  table dragging the whole page sideways on a phone (now scrolls inside its card).
- **Tests**: 115 → **125 passing** (5 suites) — +2 ownership-transfer API tests,
  +3 channel-control API tests, and +5 pure `shouldDeliver` / `normaliseList` /
  `toArray` unit tests.

## 2026-10-03 — Mobile shell + palette alternatives (web sample)

- **Phone-frame restructure** ([web/index.html](web/index.html)): the sample now
  mirrors the Flutter app — 430px app column, sticky app bar, and a bottom
  NavigationBar with the real tab set (Signals, Watchlist, Scan, Profile — same
  icons, order and Material-style active pill). Root route lands on `#/signals`
  like the app's `initialLocation`; product detail is pushed outside the shell
  (bottom bar hides), matching the GoRouter structure.
- **New Profile tab** mirroring the Flutter `ProfileScreen`: account card,
  settings tiles with snackbar-style toasts, red delete-account row, About
  shortcuts — plus an **Appearance picker**: three curated palettes with
  light/dark each (6 looks), persisted to localStorage.
- **Colour system rework**: tokens split into `--accent` (interactive/brand)
  and `--signal` (semantic positive), with `--on-accent` for accessible text on
  filled buttons. Three palettes: **Premium Calm** (now exactly matches the
  Flutter `SsColors`: #2FBF9B / #E8A33D / #D65A4A, charcoal #121417, warm
  #FAF8F5 — the web sample previously used drifted values), **Midnight Indigo**
  (blue-black + violet accent, per 2026 dark-with-bold-accent trend), **Deep
  Ocean** (slate teal + sky accent). Semantic colours are fixed across every
  palette per §10: green = verified positive, amber = conditional, red = errors.
- **Verified at 390×844**: all four tabs, palette × theme switching (calm/indigo/
  ocean × light/dark), scan → product → watch → signal loop, tab bar hidden on
  product detail, zero console errors; demo state reset for handover.

## 2026-10-03 — Source diagnostics, live coverage probe, Data sources panel

- **Phase 3 diagnostics endpoint** (`GET /api/retailers/diagnostics`): catalog
  of lawful data sources (Open Food Facts / Open Prices / fixtures) with live
  adapter enablement, plus per-source observation aggregates — counts, first/last
  observed, hours since, and a staleness flag against the 48-hour freshness gate
  (spec §24 "stale-data controls, and diagnostics"). Aggregate and non-personal.
- **Live coverage probe** (`backend/scripts/probe-open-data.js`, real network,
  no DB): measured the actual limits of the free sources — Open Prices holds
  **exactly 10 AUD rows in total** (paginated to exhaustion; North Canberra,
  Coffs Harbour, Adelaide, all 2024), and Open Food Facts returns
  `status: failure` for AU GTINs (0/6 sample) while an EU control barcode
  resolves — coverage, not the pipeline, is the limiter. Evidence log updated
  in [Docs/retailer-api-research.md](Docs/retailer-api-research.md).
- **Web sample — Data sources panel**: Home now lists every source with honest
  labels (identity/prices, browser/server, status pill) and a **live** browser
  probe of Open Food Facts (`reachable · N ms`, shown red if unreachable).
  Verified in dark and light themes.
- **Tests**: +1 (diagnostics contract) — backend now **73/73 passing**.

## 2026-10-03 — Phase 0 + Phase 3 data pathways (backend)

- **Phase 0 — Open Food Facts identity, server-side** (`openFoodFactsClient.js`):
  `POST /api/products/resolve-barcode` now enriches unknown barcodes with an
  unverified `external` identity candidate (never persisted, never auto-verified);
  `POST /api/products/submissions` prefills category/quantity/unit from the candidate
  into the moderation queue (spec §9.3). Off by default in tests; gated by
  `OPEN_FOOD_FACTS_ENABLED`. Failure policy: network problems degrade to "unknown".
- **Phase 3 — Open Prices ingest, server-side** (`openPricesClient.js` +
  `POST /api/retailers/ingest-open-prices`): only AUD prices confirmed to an
  Australian store of a configured retailer are accepted; provenance per §15
  (`source_method='open_prices'`, `source_reference='open-prices:<id>'`), dedupe on
  price id, every skip counted with a reason. Proof-based confidence: RECEIPT 0.85
  (clears the §14 0.75 push gate), shop import 0.65 (never notifies). Live-probed
  the API: the filter parameter is `product_code=` — `gtin=` is silently ignored
  (corrected in Docs/retailer-api-research.md).
- **Retailers seed**: all seven spec retailers now seed — added ALDI, BWS, Liquorland,
  Bottle Mart alongside Coles, Woolworths, Dan Murphy's.
- **Bugs found and fixed along the way**:
  - web sample: OFF response parse checked the v2 `status === 1` shape but the v3
    API returns `"success"`, so every live identity lookup silently rendered
    "not found" — now accepts both (verified live: Coca-Cola 5449000000996 resolves);
  - `submitUnknownBarcode` destructured the raw pg result inside `withTransaction`
    without `.rows` — the endpoint 500'd in production, untested until now;
  - test harness `fakePool` had no `connect()`, so transactions were never exercised;
  - `GET /api/products/:id/price-history` now returns `source_reference` so
    provenance is API-visible.
- **Tests**: +20 (OFF/Open Prices client parsing, Australian classification, OFF
  candidate + moderation prefill, Open Prices ingest/provenance/dedupe/502) —
  backend now **72/72 passing**.

## 2026-10-02 — Retailer API research + self-contained web sample

- **Retailer API research** ([Docs/retailer-api-research.md](Docs/retailer-api-research.md)):
  no free official API exists for Woolworths, Coles, ALDI, Dan Murphy's,
  BWS, Liquorland or Bottle Mart. RapidAPI/Apify listings are paid
  reverse-engineered scrapes — rejected per spec §15 (no uncontrolled
  scraping, no live prices without evidence). Lawful free sources identified:
  Open Food Facts product identity (free, no key, CORS-enabled, browser-safe;
  partial AU coverage, ODbL) and Open Prices (free, no key, **no CORS** so
  server-side only; EU-heavy, cannot back AU price claims yet). Ownership
  mapped: Dan Murphy's/BWS = Endeavour Group; Liquorland = Coles Group
  liquor arm; Bottle Mart = independent/regional (VIC).
- **Web sample** ([web/index.html](web/index.html)): single-file,
  self-contained demo for consulting walkthroughs — GS1 mod-10 barcode
  validation, the full signal engine (median baseline, historical low,
  confidence gate, freshness, snooze/cooldown), all four rule types,
  Open Food Facts identity lookup for non-fixture barcodes (marked
  unverified), hash router (home/scan/product/watchlist/signals/history),
  light/dark themes, sparkline price history, localStorage state.
  Fixture data is honestly labelled throughout; no live retailer prices
  are claimed anywhere.
- **Fixture barcode fix**: the laundry-liquid fixture had an invalid GS1
  check digit (…46254/…46257); corrected to 9300675046251 across web
  fixtures, backend seed and mobile demo fixtures. Backend suite re-run:
  52/52 passing.
- Removed the superseded multi-file web sample (web/styles.css,
  web/fixtures.js, web/app.js).

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

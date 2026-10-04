# Implementation Backlog

**Product:** ShelfSignal
**Last reconciled:** 2026-10-04 (against code, tests and CI — every `[x]` below is backed by a test or a runnable artefact)

Legend: `[x]` done and tested · `[~]` partly done (note says what is missing) · `[ ]` not started.

---

## Where we are

| Spec phase (§24) | State |
|---|---|
| 0 Feasibility | **Open.** Non-code gates not done: trade mark search, retailer data rights, willingness-to-pay. Identity data is solved for grocery (Open Food Facts, 82k AU products); **price data is the blocker** — see [retailer-api-research.md](retailer-api-research.md). |
| 1 Foundation | Done (Express + Postgres per ADR-0001). |
| 2 Vertical slice | Done end to end in the backend; mobile runs the full loop in demo mode. |
| 3 Retailers & history | Partial: provenance-tracked ingest + diagnostics + Open Prices path exist; **no real retailer adapter**. |
| 4 Household & premium UX | Backend and web sample done. **Flutter screens for households, notification preferences, shopping list and reports are not built.** |
| 5 Closed beta | Not started (no deployment, backups, push, store pipeline). |

Quality gates today: backend 159 tests (147 contract + 12 real-Postgres integration) (PGlite locally, Postgres 16 service in CI), `eslint` clean, `npm audit` 0 high, gitleaks in CI; mobile `flutter analyze` clean + 10 tests.

---

## P0 — critical path to a usable beta

### Data & trust (the real blocker)
- [ ] **Decide the price-data strategy** (business decision, see research doc). Options: partnership/authorised feed, affiliate product feeds (availability unverified), user-contributed prices with provenance + moderation, or launch as scan-and-target tracker while pursuing a feed.
- [ ] Phase 0 gates: Australian trade mark search, retailer data rights, willingness-to-pay validation.
- [x] Provenance on every observation (`source_method`, `source_reference`); append-only `price_observations`
- [x] Freshness gate (48 h, configurable) with clock-skew tolerance; confidence gate (0.75) before push-worthy signals
- [x] Price ingestion is **admin-only**; fixture ingest disabled in production unless `ALLOW_FIXTURE_INGEST=true`
- [x] Open Prices server-side ingest (AUD + AU-store only, dedupe, proof-based confidence)
- [x] Open Food Facts identity enrichment on unknown barcodes (unverified, never auto-verified)

### Backend
- [x] Express app, health + readiness, request IDs, rate limiting, CORS allow-list (`CORS_ORIGINS`), docker-compose Postgres
- [x] Migrations 001–005 + runner + seeds; validated on real PostgreSQL semantics
- [x] Auth: register / login / me / patch / delete (cascade) / **data export**; roles (`users.role`), `make-admin` script
- [x] Barcode validation (GS1), resolve-barcode, unknown-barcode submission, search, product detail, scan history, price history
- [x] Watchlist CRUD, one editable rule per item (target / discount % / near-low / any-drop), member & multi-buy toggles, cooldown
- [x] Pure signal engine + explainable signals; dismiss / snooze / mark-bought
- [x] Households: create, one-time hashed invites, roles, removal, leave, ownership transfer, shared items (private never leak)
- [x] Notification preferences + dry-run preview (quiet hours, digest, cooldown, high-value override, category/retailer mutes)
- [x] Shopping list (private + household-shared; members may complete, only owner edits/deletes)
- [x] Mismatch / data reports (idempotent) and **moderation API**: unverified queue, verify (with corrections) / reject, resolve report with optional unmap, audit trail
- [ ] Device registration is stored; **FCM send pipeline not built** (needs a Firebase project)
- [ ] Refresh-token rotation (currently a single 7-day JWT), Sign in with Apple / Google, password reset
- [ ] OpenAPI document, `/v1` versioning, idempotency keys, cursor pagination
- [ ] Alcohol: `is_adult` stored, but no opt-in enforcement on alcohol watch items / alerts yet
- [ ] Multiple rules per watch item (spec §9.6 lists several rule types per product)
- [ ] Unknown-barcode photo upload (object storage)

### Mobile (Flutter)
- [x] Riverpod + GoRouter shell, design tokens (light/dark), demo mode (honestly labelled), five tabs
- [x] Camera scanning with opt-in permission timing, GS1 gate, haptics, duplicate suppression, torch, manual fallback
- [x] Session token in platform secure storage (legacy plain-prefs token migrated)
- [ ] Live-mode screens: households, notification preferences, shopping list, report mismatch, data export, admin tools
- [ ] Continuous Scan mode, offline scan queue, Drift local-first cache + sync
- [ ] Price-history chart, signal card parity with spec §9.8 actions (add to list, change rule, report mismatch)
- [ ] Onboarding flow (§9.2), alcohol opt-in, accessibility audit (TalkBack / VoiceOver, large text)
- [ ] FCM client + notification permission timing

### Operations
- [x] CI: backend lint + tests, real-Postgres job, dependency audit, secret scan; mobile analyze + test
- [ ] Deployment (Dockerfile, Caddy, VPS), staging, protected production release
- [ ] Encrypted backups + restore test, structured logging, error tracking, crash reporting
- [ ] Privacy-safe analytics events (§19), cost-per-active-user telemetry
- [ ] Admin web portal (Next.js) on top of the moderation API; admin MFA

---

## P1 — beta

- [ ] Retailer adapter contract (§15) with health, circuit breaker, stale controls — first adapter only once a lawful source exists
- [ ] Deal-confidence labels surfaced in the app; observed-usual-price display with data gaps
- [ ] Notification delivery: dedupe, digest, quiet hours applied on send (preference logic exists in `shouldDeliver`)
- [ ] Member-program preferences, multi-buy economics
- [ ] Operational dashboard (stale retailers, notification failures, schema warnings)

## P2 — post-beta

- [ ] Second retailer, radius controls, richer household coordination, product merge/split, signal diagnostics, TestFlight / closed-testing pipeline, international groundwork

---

## Known debt (tracked, not yet scheduled)

- Signal logic exists in three places: `backend/src/domain/signalEvaluator.js`, Dart `DemoBackend`, and `web/index.html`. Any semantic change must touch all three (ADR-0003). The 2026-10-04 clock-skew tolerance in `isFresh` is mirrored in the web copy; the Dart demo has no freshness gate at all (demo offers are always ingested "now").
- Contract tests (`api.test.js`) run on SQLite through a translation layer; the Postgres integration test covers the critical path only.
- `npm test` fails on this Windows machine because of a quoted `"node"` PATH entry (ADR-0006); run `node --experimental-vm-modules node_modules/jest/bin/jest.js` directly or fix the PATH.

---

## Definition of Done

Implementation · unit + integration tests · lint + format · loading and error states · privacy-safe telemetry · docs updated · regression tests · accessibility checked · mobile offline safety checked.

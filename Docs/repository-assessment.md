# Repository Assessment

**Last updated:** 2026-10-04 (supersedes the 2026-09-30 "no codebase" baseline)
**Method:** read every document, ran the test suites, linted, probed the live data sources, and traced the code against the Master Prompt.

## Summary

ShelfSignal is a well-engineered vertical slice with a sound, tested signal engine and a broad backend. It cannot yet answer its core question for **real Australian prices**, because no lawful price source has been secured. Everything else is comparatively close to beta-ready on the backend and well behind on the mobile client.

## Component status

| Area | State | Evidence |
|---|---|---|
| Backend API (Express + Postgres) | Strong. Auth, products, watchlist, signals, households, notification prefs, shopping list, reports, moderation, audit, export. | 163 tests (151 contract + 12 real-Postgres), lint clean, `npm audit` 0 high |
| Database | Migrations 001–005, validated on real Postgres semantics (PGlite locally, Postgres 16 service in CI) | `tests/postgres.integration.test.js` |
| Signal engine | Pure module, mirrored in Dart demo and web sample; freshness gate tolerates clock skew | `signalEvaluator.test.js` |
| Mobile (Flutter) | Shell, theme, demo mode, camera scanning, secure token storage. **No live-mode screens for households / notification prefs / shopping list / reports; no offline cache.** | `flutter analyze` clean, 10 tests |
| Web sample | Self-contained demo with a headless verification harness | `web/verify.js` |
| Admin portal | API only (`/api/admin/*`); no UI | `moderationService.js` |
| Auth | Email + password, 7-day JWT. No refresh rotation, no Apple/Google, no password reset | — |
| Retailer data | **Blocked.** No free official API for any of the seven retailers. Open Food Facts gives identity (82k AU products); Open Prices has ~10 AUD rows | `retailer-api-research.md` |
| Push | Device tokens stored; no sender (needs a Firebase project) | — |
| Security | Admin-gated ingestion/moderation, DB-read roles, audit log, CORS allow-list, rate limit, helmet, secret + dependency scanning in CI. CSP disabled (API only). | CI workflow |
| Privacy | Cascade deletion, personal data export, private watch/list items never leak to households | tests |
| Accessibility | Not audited. Manual-entry scan fallback exists; no screen-reader / large-text pass | — |
| Deployment / backups / observability | None yet | — |
| Branding | No visible StapleWatch / PricePilot strings; they appear only in the spec and this history | grep |

## Corrections to earlier findings

- **Open Food Facts coverage.** The 2026-10-03 probe concluded Australian coverage was poor (0/6). That probe used synthetic and check-digit-invalid codes. Re-measured with real codes: OFF holds 82,035 Australian products and resolves Vegemite, Weet-Bix and Corn Thins through our client. Liquor is thin (605 alcoholic beverages, 0 whiskies).
- **Flaky signal tests.** Intermittent failures were a real bug, not test noise: `isFresh` rejected observations stamped even 1 ms ahead of the app clock, so DB/app clock skew could silently drop a fresh offer. Fixed with a 5-minute tolerance (still rejects genuinely future-dated data).

## Risks

| Risk | Impact | Mitigation / status |
|---|---|---|
| No lawful price source | Critical — product has no value without prices | Strategy decision needed (see backlog "Data & trust") |
| Trade mark conflict | High | Search not yet done |
| Signal logic in three copies | Medium | ADR-0003; keep behaviour tests per copy |
| SQLite-based contract tests diverge from Postgres | Medium | Postgres integration test now covers the critical path; extend over time |
| Mobile far behind backend | Medium | Next engineering focus after the data decision |
| One-time-purchase economics | Medium | Batching, shared observations, cost telemetry (not yet built) |

## Next ten tasks

1. Decide the price-data strategy (partnership, feeds, or crowdsourced prices with provenance) and run the Phase 0 gates (trade mark, data rights, willingness-to-pay).
2. Mobile live-mode screens: household, notification preferences, shopping list, report mismatch.
3. Mobile offline: Drift cache, scan queue, Continuous Scan.
4. FCM push pipeline (create Firebase project; sender behind the existing `shouldDeliver` rules).
5. Auth hardening: refresh-token rotation, password reset, Sign in with Apple / Google.
6. Alcohol: in-app opt-in UI and responsible-service messaging (backend enforcement is done).
7. Multiple rules per watch item.
8. OpenAPI + `/v1` versioning + idempotency keys.
9. Deployment: Dockerfile, Caddy, staging, encrypted backups with a restore test, structured logging.
10. Admin web UI over `/api/admin/*`, then the accessibility audit.

## Success metrics (Phase 1) — status

- [x] Repository builds on Windows (tests run via node directly; `npm` scripts hit the PATH issue in ADR-0006)
- [x] CI runs lint, tests, Postgres integration, audit and secret scan
- [~] Authentication: email works; Apple and Google not built
- [x] PostgreSQL migrations apply and are idempotent
- [~] Flutter app runs (demo mode); iOS simulator untested on this machine
- [x] Design tokens in light and dark

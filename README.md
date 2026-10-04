<p align="center">
  <img src="logo.png" alt="ShelfSignal logo" width="140" />
</p>

<h1 align="center">ShelfSignal</h1>

<p align="center">
  <strong>Scan what you buy. Get the signal when the price is right.</strong><br/>
  Premium iOS &amp; Android price monitoring for Australian households.
</p>

<p align="center">
  <a href="https://github.com/theantipopau/ShelfSignal/actions/workflows/ci.yml">
    <img src="https://github.com/theantipopau/ShelfSignal/actions/workflows/ci.yml/badge.svg" alt="CI status" />
  </a>
</p>

## Project Structure

```
ShelfSignal/
├── mobile/          # Flutter iOS & Android app (Riverpod + GoRouter)
├── backend/         # Express + PostgreSQL API with signal engine
├── web/             # Self-contained single-file web sample (demo)
├── admin/           # (planned) Next.js admin UI over the /api/admin moderation API
└── Docs/            # Master Prompt, backlog, ADRs
```

## The Shelf-to-Signal Loop

1. **Scan the shelf** — enter/scan a barcode (GS1-validated)
2. **Confirm the match** — canonical product identity, verification status
3. **Set the signal** — target price / discount % / near-low / any drop
4. **ShelfSignal watches** — append-only price observations per retailer
5. **Receive a meaningful alert** — explainable: what, where, why, how confident
6. **Act or snooze** — mark bought, dismiss, snooze, adjust the rule

## Quick Start

### Backend

```bash
cd backend
npm install
docker-compose up -d postgres   # local PostgreSQL
cp .env.example .env            # defaults match docker-compose
npm run migrate:seed            # schema + fixture data
npm run dev                     # http://localhost:3000
npm run make-admin -- you@example.com   # price ingestion + moderation are admin-only
npm test                        # 151 contract tests + 12 real-Postgres tests (163 total);
                                # no database server needed (in-process PGlite)
```

### Mobile

```bash
cd mobile
flutter pub get
flutter run                     # demo mode: full loop, no backend needed
flutter analyze && flutter test
```

The app starts in **demo mode** (clearly labelled) using the same fixtures as
the backend seed. To go live: run the backend, then set the API base URL in
Profile → and toggle demo mode off.

### Camera scanning

The Scan tab uses the device camera (mobile_scanner) for EAN-8, UPC-A/UPC-E
and EAN-13, gated by the same GS1 check-digit rule as the backend. Per spec
§9.2/§9.3 the permission prompt appears only when you tap **Start camera** —
a rationale card explains first that frames are analysed on-device and never
stored. Torch control, duplicate suppression and manual entry (always
available) round out the flow. On a desktop dev machine without a camera,
manual entry and the demo fixtures still exercise the full loop.

### Web sample

Open `web/index.html` in any browser — double-click the file, no server or
build step needed. It is a self-contained demo of the full Shelf-to-Signal
loop: GS1 barcode validation (try a typo'd check digit), three fixture
products with 56 days of deterministic price history, all four signal rule
types with explainable alerts, and live Open Food Facts identity lookups for
any non-fixture barcode. Prices are clearly-labelled fixture data; it is the
quickest way to walk a stakeholder through the product.

It also carries the Phase 4 screens: **Profile → Notification preferences** (every
spec §9.11 control, category/retailer mute chips and a live delivery dry-run) and
**Profile → Household** (create or join, one-time invite token, roles, ownership
transfer, and watch items you can share or keep private). `node web/verify.js`
re-checks all of it headless: 14 routes for JS errors and viewport overflow, plus
scripted share / preferences / theme flows.

## Documentation

- [Docs/Master Prompt.md](Docs/Master%20Prompt.md) — product & technical spec
- [Docs/retailer-api-research.md](Docs/retailer-api-research.md) — free-data research for the seven retailers
- [Docs/repository-assessment.md](Docs/repository-assessment.md) — current-state assessment and next steps
- [Docs/implementation-backlog.md](Docs/implementation-backlog.md) — reconciled backlog (what is done vs open)
- [Docs/architecture-decisions.md](Docs/architecture-decisions.md) — ADRs
- [CHANGELOG.md](CHANGELOG.md) — rolling changelog

## Principles (from the spec)

- Exact product identity: barcode-first, pack-size aware, canonical product ≠ listing
- A signal, not just a drop: every alert explains its trigger and shows freshness
- No live prices without evidence: fixtures until a lawful retailer pathway exists
- Privacy: cascade account deletion, personal data export (`GET /api/auth/export`), minimal collection, no secrets in source
- Trust: price ingestion and moderation are admin-only and audited

## License

© 2026 ShelfSignal. All rights reserved.

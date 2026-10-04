# Retailer API Research — Australian Product & Price Data

**Date:** 2026-10-02
**Question:** Are there free APIs for products at Woolworths, Coles, ALDI, Dan Murphy's,
BWS, Liquorland, Bottle Mart?
**Constraint (Master Prompt §15):** prefer authorised APIs/feeds; review terms before
automated collection; never scrape from the app; do not call prices live without
evidence. Findings below drive what the demo may and may not claim.

## TL;DR

- **None of the seven retailers publishes a free public product or price API.**
- The only **lawful, free, developer-accessible** sources are open databases:
  **Open Food Facts** (product identity by GTIN) and **Open Prices** (crowdsourced
  prices). Neither has complete Australian coverage today.
- Third-party "Woolworths/Coles/ALDI APIs" on RapidAPI/Apify are paid, reverse-engineered
  scrapes — legally and contractually risky for a commercial product. **Do not use.**
- **Demo consequence:** the web sample uses honest fixture prices plus live Open Food
  Facts identity lookup. No live retailer prices are claimed anywhere.

## Retailer-by-retailer findings

| Retailer | Owner | Free public API? | Notes |
|---|---|---|---|
| Woolworths | Woolworths Group | ❌ No | Private endpoints power the app/site only. Community confirms no open API; official access is partnership-based. |
| Coles | Coles Group | ❌ No | Same posture. Public developer API does not exist. |
| ALDI | ALDI Australia | ❌ No | No documented developer API or data feed (confirmed by multiple 2024–2026 sources). |
| Dan Murphy's | Endeavour Group | ❌ No | Endeavour runs a supplier insights program (wholesale data for FMCG suppliers), not a developer API. |
| BWS | Endeavour Group | ❌ No | Same platform as Dan Murphy's. |
| Liquorland | Coles Group (liquor arm) | ❌ No | Coles liquor division (Liquorland, Vintage Cellars, First Choice Liquor Market) shares Coles' closed posture. |
| Bottle Mart | Independent / regional (VIC) | ❌ No | Small independent chain; no developer resources. |

### Grey-area options (rejected)

- **RapidAPI "Woolworths/Coles Products API" (data-holdings-group)** — paid plans
  (US$10–99/mo), reverse-engineered, no retailer authorisation.
- **Apify scrapers** (Woolworths, Coles, ALDI, Dan Murphy's) — paid scraping, ToS risk.
- **drkno/au-supermarket-apis** — community OpenAPI specs reverse-engineered from the
  apps/web clients. Useful as *reference for endpoint shapes only*; using them in
  production would breach retailer terms.
- Master Prompt §15 explicitly forbids uncontrolled scraping, so all of the above are
  out for the product, and none is used in the demo.

## Lawful free sources (usable now)

### Open Food Facts — product identity by GTIN ✅ (used in the web demo)

- REST: `GET https://world.openfoodfacts.org/api/v3/product/{barcode}.json`
- **100% free, no key, CORS `*`** — callable straight from a browser.
- Returns brand, product name, quantity, categories, nutrition, images where known.
- Australian coverage: **substantial for packaged grocery** — 82,035 products
  tagged to Australia (measured 2026-10-04 via `au.openfoodfacts.org/api/v2/search`;
  Vegemite, Weet-Bix, Corn Thins etc. all resolve through the project client).
  Liquor is thin: 605 alcoholic-beverage products in total, 142 beers, 0 whiskies —
  spirits will mostly fall through to the moderation queue. A lookup can still
  legitimately return "not found" (the "unverified barcode" state in the spec).
- License: ODbL (attribute "Open Food Facts" when reusing data).
- **Role in ShelfSignal:** the "confirm the match" step for unknown barcodes and
  candidate identity for moderation — not prices.

### Open Prices — crowdsourced prices ✅ (Phase 3 adapter, server-side — implemented)

- REST: `GET https://prices.openfoodfacts.org/api/v1/prices?product_code={gtin}&limit={n}`
  (also `/products`, `/locations`, `/proofs`; Swagger at `/api/docs`).
  **Correction (verified live 2026-10-03): the parameter is `product_code=` —
  `gtin=` is silently IGNORED and returns unrelated rows.**
- **Free, no key** — but **no CORS headers**, so it must be called from the backend,
  not the browser.
- Data shape: `{items: [{id, price, currency, date, proof:{type}, location:{osm_brand,
  osm_name, osm_address_country_code}, ...}]}` (verified live 2026-10-03).
- Coverage is **EU-heavy; Australian observations are rare** today — cannot back any
  "observed usual price" claim for AU shoppers yet. Implemented as
  `POST /api/retailers/ingest-open-prices`: accepts **only AUD prices confirmed to an
  Australian store** of a configured retailer, records provenance per §15
  (`source_method='open_prices'`, `source_reference='open-prices:<id>'`), dedupes on
  price id, and counts every skip with a reason. Receipt-proof observations carry
  match confidence 0.85 (clears the §14 0.75 push gate); shop imports 0.65 (never
  notify).

### Barcode metadata (secondary)

- **UPCitemdb** (`devs.upcitemdb.com`) — free tier ~100 req/day, no signup; US-centric.
- **BarcodeNest** — free tier 250 calls/month; generic GTIN metadata.
- Neither is AU-retailer aware; optional enrichment only.

## Recommended pathway (spec Phase 0/3) — status

1. **Now (demo + MVP) ✅ implemented:** Open Food Facts for identity; fixture prices
   only; unknown barcodes enter the moderation queue — exactly what the spec's §9.3
   "Unknown Barcode" flow prescribes.
   - Server: `POST /api/products/resolve-barcode` enriches unknown barcodes with an
     unverified `external` identity candidate (`openFoodFactsClient`), never persisted
     until submitted; `POST /api/products/submissions` prefills the unverified product
     from the candidate.
   - Web sample: browser-side OFF lookup (CORS `*`), product shown as UNVERIFIED with
     "no monitored offers" until a lawful price source exists.
2. **Phase 3 adapters ⏳ partially implemented:** Open Prices ingest now works
   server-side with provenance (`POST /api/retailers/ingest-open-prices`); AU coverage
   remains the limiter, not the pipeline. The partnership path (approach
   Woolworths/Coles for authorised access) is business development, not code.
3. **Never:** scrape retailer sites/apps, use the grey-area scraper APIs, or display
   "live" prices without a lawful source. Every observation keeps `source_method`
   and `source_reference` provenance in `price_observations`.

## Evidence log

- Woolworths/Coles/ALDI: no official API — Reddit r/woolworths & r/coles (2025),
  parse.bot market listing ("ALDI does not publish a public developer API"),
  Apify/RapidAPI listings (all paid scrapers), drkno/au-supermarket-apis (reverse-engineered).
- Endeavour Group (Dan Murphy's/BWS): supplier-insights programs only (AFR 2026,
  endeavourgroup.com.au); no public developer API found.
- Liquorland = Coles Group liquor arm; Bottle Mart = independent/regional (VIC).
- Open Food Facts: world.openfoodfacts.org/data ("database and API 100% free"),
  live test `api/v3/product/737628064502.json` → 200, `access-control-allow-origin: *`.
- Open Prices: github.com/openfoodfacts/open-prices, live test
  `prices.openfoodfacts.org/api/v1/prices?gtin=...` → 200 JSON, no CORS header.
- Open Prices live probes 2026-10-03: `?gtin=` ignored (returns unrelated rows),
  `?product_code=5449000000996` returns the correct product's prices with
  `location.osm_*`, `proof.type` and `currency` fields — drives the adapter shape.
- Open Prices filter probe 2026-10-03: `currency=` works (EUR/AUD each return
  matching rows), `country=` is silently ignored (returns unrelated rows) — same
  trap as `gtin=`; the adapter filters region client-side.
- **AUD corpus measured to exhaustion** (`backend/scripts/probe-open-data.js`,
  paginating `?currency=AUD&limit=100`): **10 rows total** — e.g. North Canberra
  $4.99 (2024-03-21), Coffs Harbour $2.65 (2024-07-19), Adelaide $1.60
  (2024-09-22). The whole Australian slice is single-digit; this is why no live
  AU price claims are made.
- **CORRECTION (2026-10-04): the 2026-10-03 OFF coverage probe was invalid.** It tested
  six codes, but three were this project's own synthetic fixtures and the other three
  (`9300654001577`, `9310072011095`, `9311959001016`) fail the GS1 check digit, so none
  could exist in any database. The "0/6 AU hit, coverage is poor" conclusion is
  withdrawn. Re-measured with real codes from OFF's own AU listing:
  `9352042000342` (Vegemite), `9300652010794` (Weet-Bix) and `9322969000015`
  (Corn Thins) all resolve; OFF holds 82,035 AU products. Identity is therefore a
  strong Phase 0 source for grocery; **prices remain the blocker** (Open Prices AUD
  corpus is still ~10 rows). `backend/scripts/probe-open-data.js` now uses real codes
  and reports the OFF AU corpus size.

'use strict';

const db = require('../config/database');
const { config } = require('../config');
const productService = require('./productService');
const signalService = require('./signalService');
const openPricesClient = require('./openPricesClient');
const openFoodFactsClient = require('./openFoodFactsClient');
const { AppError, NotFoundError, ValidationError } = require('../utils/errorHandler');
const { validateBarcode } = require('../utils/barcode');

/**
 * Ingestion pipeline (prototype stage).
 * Currently accepts *fixture* observations — explicitly not live retailer data.
 * When a lawful authorised adapter exists (spec section 15), it will write
 * observations through the same append-only productService.recordObservation
 * and then trigger evaluation here.
 *
 * Phase 3 pathway (Docs/retailer-api-research.md): Open Prices — a free,
 * crowdsourced price database — is the one lawful source ingestable today.
 * It is server-side only (no CORS), EU-heavy, so we accept ONLY AUD prices
 * confirmed to an Australian store, keep per-observation provenance
 * (source_method='open_prices', source_reference='open-prices:<id>'), and
 * count every skip. Nothing else is ever ingested.
 */

async function ingestFixtureOffer({ barcode, retailerSlug, price, observedAt, memberPrice = null, promotionType = null }) {
  if (!barcode || !retailerSlug || price == null) {
    throw new ValidationError('barcode, retailerSlug and price are required');
  }

  const resolution = await productService.resolveBarcode(barcode);
  if (!resolution.found) {
    throw new NotFoundError(`No product mapped to barcode ${barcode}`);
  }

  const [row] = await db.query(
    `SELECT rp.id, rp.product_id
     FROM retailer_products rp
     JOIN retailers r ON r.id = rp.retailer_id
     WHERE r.slug = $1 AND rp.product_id = $2
     LIMIT 1`,
    [retailerSlug, resolution.product.id],
  );
  if (!row) throw new NotFoundError(`No retailer product mapping for ${retailerSlug} / this product`);

  const observation = await productService.recordObservation({
    retailerProductId: row.id,
    price,
    observedAt,
    sourceMethod: 'fixture',
    sourceReference: 'api:fixture-ingest',
    confidence: 1.0,
    memberPrice,
    promotionType,
  });

  // Evaluate every watch item watching this product.
  const watchers = await db.query('SELECT id FROM watch_items WHERE product_id = $1', [resolution.product.id]);
  const created = [];
  for (const w of watchers) {
    created.push(...(await signalService.evaluateWatchItem(w.id)));
  }

  return { observation, signalsCreated: created.length, signals: created };
}

/** Retailer catalogue for the app + diagnostics. */
async function listRetailers() {
  return db.query(
    `SELECT r.id, r.slug, r.name, r.website, r.is_active,
       (SELECT MAX(po.observed_at) FROM price_observations po
        JOIN retailer_products rp ON rp.id = po.retailer_product_id
        WHERE rp.retailer_id = r.id) AS last_observation_at,
       (SELECT COUNT(*) FROM retailer_products rp WHERE rp.retailer_id = r.id) AS listing_count
     FROM retailers r ORDER BY r.name`,
  );
}

/**
 * The seven spec retailers we can honestly map an Open Prices OSM store onto.
 * Matched case-insensitively against the store's brand/name label.
 */
const AU_CHAIN_PATTERNS = [
  { slug: 'coles', pattern: /\bcoles\b/i },
  { slug: 'woolworths', pattern: /woolworths/i },
  { slug: 'aldi', pattern: /\baldi\b/i },
  { slug: 'dan-murphys', pattern: /dan\s*murphy'?s?/i },
  { slug: 'bws', pattern: /\bbws\b/i },
  { slug: 'liquorland', pattern: /liquorland/i },
  { slug: 'bottle-mart', pattern: /bottle\s*-?\s*mart/i },
];

/** Map an Open Prices OSM location to a retailer slug, or null when unmappable. */
function matchAustralianRetailer(location) {
  const label = [location && location.brand, location && location.name].filter(Boolean).join(' ');
  if (!label) return null;
  const hit = AU_CHAIN_PATTERNS.find((c) => c.pattern.test(label));
  return hit ? hit.slug : null;
}

/**
 * Gate a normalised Open Prices item: ingest, or say precisely why not.
 * @returns {null|'non_aud'|'unconfirmed_region'|'missing_date'} null = ingestable.
 */
function classifyPriceItem(item) {
  if (item.currency !== 'AUD') return 'non_aud';
  if (!item.location || item.location.countryCode !== 'AU') return 'unconfirmed_region';
  if (!item.date) return 'missing_date';
  return null;
}

const SKIP_REASONS = ['non_aud', 'unconfirmed_region', 'unmapped_location', 'retailer_not_configured', 'missing_date', 'duplicate', 'unknown_product'];

/**
 * Phase 3: ingest crowdsourced Open Prices observations for a locally known
 * barcode. Only AUD prices at mapped Australian stores of the seven spec
 * retailers are accepted; everything else is counted in `skipped`.
 * Re-ingesting the same feed is a no-op (provenance dedupe on price id).
 */
async function ingestOpenPrices({ barcode, limit = 25 } = {}) {
  const check = validateBarcode(barcode);
  if (!check.valid) throw new ValidationError(`Invalid barcode: ${check.reason}`);
  if (!openPricesClient.isEnabled()) {
    throw new ValidationError('Open Prices ingestion is disabled (set OPEN_PRICES_ENABLED=1 to enable)');
  }

  const gtin = check.normalized;
  const items = await openPricesClient.fetchPricesForProductCode(gtin, { limit });
  if (items === null) {
    throw new AppError('Open Prices is unavailable', 502, 'upstream_unavailable');
  }

  const summary = {
    barcode: gtin,
    fetched: items.length,
    ingested: 0,
    skipped: Object.fromEntries(SKIP_REASONS.map((r) => [r, 0])),
    signalsCreated: 0,
    signals: [],
  };
  if (items.length === 0) return summary;

  // Observations attach to the local canonical catalogue only.
  const [product] = await db.query(
    `SELECT p.id, p.canonical_name FROM product_barcodes pb
     JOIN products p ON p.id = pb.product_id WHERE pb.barcode = $1`,
    [gtin],
  );
  if (!product) {
    summary.skipped.unknown_product = items.length;
    return summary;
  }

  const retailers = await db.query('SELECT id, slug FROM retailers');
  const bySlug = Object.fromEntries(retailers.map((r) => [r.slug, r]));
  const affectedProducts = new Set();

  for (const item of items) {
    const reason = classifyPriceItem(item);
    if (reason) {
      summary.skipped[reason] += 1;
      continue;
    }
    const slug = matchAustralianRetailer(item.location);
    if (!slug) {
      summary.skipped.unmapped_location += 1;
      continue;
    }
    const retailer = bySlug[slug];
    if (!retailer) {
      summary.skipped.retailer_not_configured += 1;
      continue;
    }

    const reference = openPricesClient.sourceReference(item.priceId);
    const [dupe] = await db.query(
      `SELECT id FROM price_observations WHERE source_method = 'open_prices' AND source_reference = $1`,
      [reference],
    );
    if (dupe) {
      summary.skipped.duplicate += 1;
      continue;
    }

    // Listing: exact GTIN at a crowd-observed store. Proof quality decides the
    // match confidence — a receipt photo clears the §14 push gate (0.75), a
    // shop import does not (never notify on weak evidence).
    const receipt = item.proofType === 'RECEIPT';
    const matchConfidence = receipt ? 0.85 : 0.65;
    let [listing] = await db.query(
      'SELECT id FROM retailer_products WHERE retailer_id = $1 AND product_id = $2',
      [retailer.id, product.id],
    );
    if (!listing) {
      [listing] = await db.query(
        `INSERT INTO retailer_products
           (retailer_id, product_id, retailer_external_id, retailer_title, match_confidence, match_method)
         VALUES ($1, $2, $3, $4, $5, 'open_prices')
         ON CONFLICT (retailer_id, retailer_external_id) DO UPDATE SET product_id = EXCLUDED.product_id
         RETURNING id`,
        [retailer.id, product.id, `open-prices:${gtin}`, product.canonical_name, matchConfidence],
      );
    }

    await productService.recordObservation({
      retailerProductId: listing.id,
      price: item.price,
      observedAt: item.date,
      sourceMethod: 'open_prices',
      sourceReference: reference,
      confidence: receipt ? 0.75 : 0.6,
      promotionType: item.isDiscounted ? 'crowd_discount' : null,
    });
    summary.ingested += 1;
    affectedProducts.add(product.id);
  }

  // Re-evaluate watchers of every product that gained an observation.
  for (const productId of affectedProducts) {
    const watchers = await db.query('SELECT id FROM watch_items WHERE product_id = $1', [productId]);
    for (const w of watchers) {
      const created = await signalService.evaluateWatchItem(w.id);
      summary.signalsCreated += created.length;
      summary.signals.push(...created);
    }
  }

  return summary;
}

/**
 * Phase 3 diagnostics (Master Prompt section 24): which lawful sources exist,
 * whether each adapter is enabled right now, and per-source observation
 * aggregates with a staleness flag (stale-data controls). No secrets, no
 * personal data — safe to expose to authenticated dashboards and honest
 * status surfaces in the app.
 */
async function sourceDiagnostics() {
  const rows = await db.query(
    `SELECT po.source_method,
            COUNT(*) AS observation_count,
            MIN(po.observed_at) AS first_observed_at,
            MAX(po.observed_at) AS last_observed_at,
            COUNT(DISTINCT rp.product_id) AS product_count,
            COUNT(DISTINCT rp.retailer_id) AS retailer_count
       FROM price_observations po
       JOIN retailer_products rp ON rp.id = po.retailer_product_id
      GROUP BY po.source_method
      ORDER BY po.source_method`,
  );

  const freshnessHours = config.signals.freshnessHours;
  const now = Date.now();
  const bySourceMethod = rows.map((r) => {
    const lastMs = r.last_observed_at ? Date.parse(r.last_observed_at) : NaN;
    const ageHours = Number.isFinite(lastMs) ? Math.round((now - lastMs) / 3600000) : null;
    return {
      source_method: r.source_method,
      observation_count: Number(r.observation_count),
      product_count: Number(r.product_count),
      retailer_count: Number(r.retailer_count),
      first_observed_at: r.first_observed_at,
      last_observed_at: r.last_observed_at,
      hours_since_last_observation: ageHours,
      stale: ageHours !== null && ageHours > freshnessHours,
    };
  });

  const catalog = [
    {
      id: 'openfoodfacts',
      kind: 'identity',
      mode: 'server + browser',
      enabled: openFoodFactsClient.isEnabled(),
      note: 'Free, no key, CORS enabled. Identity only, never prices. Coverage is sparse for AU GTINs; unknown barcodes stay unverified until moderation.',
    },
    {
      id: 'open_prices',
      kind: 'prices',
      mode: 'server-side only',
      enabled: openPricesClient.isEnabled(),
      note: 'Free, no key, no CORS — ingested server-side only. AUD prices at mapped AU stores only; coverage is the limiter (see Docs/retailer-api-research.md).',
    },
    {
      id: 'fixture',
      kind: 'prices',
      mode: 'demo',
      enabled: true,
      note: 'Deterministic demo data, clearly labelled — never presented as live retailer prices.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    freshnessHours,
    catalog,
    bySourceMethod,
  };
}

module.exports = { ingestFixtureOffer, listRetailers, ingestOpenPrices, sourceDiagnostics, matchAustralianRetailer, classifyPriceItem };

'use strict';

/**
 * Open Prices client — Phase 3 data path (Docs/retailer-api-research.md,
 * Master Prompt section 15).
 *
 * Open Prices (prices.openfoodfacts.org) is a free, no-key crowdsourced price
 * database. It has NO CORS headers, so it is ingested server-side only, and its
 * coverage is EU-heavy — Australian observations are rare but growing. Every
 * price carries a proof (receipt photo / shop import) and an OSM store, which
 * lets us keep per-observation provenance (price_observations.source_method =
 * 'open_prices', source_reference = open-prices:<id>).
 *
 * Query note (verified live 2026-10-03): the filter parameter is
 * `product_code=`; `gtin=` is silently IGNORED and returns unrelated rows.
 *
 * Failure policy: any network/HTTP/parse problem resolves to `null`
 * (upstream unavailable), never an exception.
 *
 * Disabled by default in tests; override with OPEN_PRICES_ENABLED=1|0.
 */

const SOURCE = 'openprices';
const API_BASE = 'https://prices.openfoodfacts.org';
const USER_AGENT = 'ShelfSignal/1.0 (https://github.com/theantipopau/ShelfSignal)';

function defaultEnabled() {
  const raw = process.env.OPEN_PRICES_ENABLED;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

const state = {
  enabled: defaultEnabled(),
  fetchImpl: null,
  timeoutMs: 6000,
};

/** Enable/disable and optionally inject a fetch implementation (tests). */
function configure({ enabled, fetchImpl, timeoutMs } = {}) {
  if (enabled !== undefined) state.enabled = Boolean(enabled);
  if (fetchImpl !== undefined) state.fetchImpl = fetchImpl;
  if (timeoutMs !== undefined) state.timeoutMs = timeoutMs;
}

/** Restore defaults (used by tests between cases). */
function reset() {
  state.enabled = defaultEnabled();
  state.fetchImpl = null;
  state.timeoutMs = 6000;
}

function isEnabled() {
  return state.enabled;
}

/** Stable provenance reference for one Open Prices row. */
function sourceReference(priceId) {
  return `open-prices:${priceId}`;
}

/** Normalise one Open Prices item into a flat, provenance-rich observation. */
function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const price = Number(item.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (item.id == null) return null;

  const loc = item.location || {};
  const proof = item.proof || {};
  return {
    priceId: item.id,
    price,
    currency: typeof item.currency === 'string' ? item.currency.toUpperCase() : '',
    date: item.date || null,
    isDiscounted: Boolean(item.price_is_discounted),
    priceWithoutDiscount: item.price_without_discount != null ? Number(item.price_without_discount) : null,
    productCode: item.product_code != null ? String(item.product_code) : null,
    productName: (item.product && item.product.product_name) || null,
    brands: (item.product && item.product.brands) || null,
    location: {
      name: loc.osm_name || null,
      brand: loc.osm_brand || null,
      city: loc.osm_address_city || null,
      countryCode: loc.osm_address_country_code ? String(loc.osm_address_country_code).toUpperCase() : null,
      displayName: loc.osm_display_name || null,
    },
    proofId: item.proof_id != null ? item.proof_id : (proof.id != null ? proof.id : null),
    proofType: proof.type || null,
    sourceUrl: `${API_BASE}/api/v1/prices?product_code=${encodeURIComponent(item.product_code || '')}`,
  };
}

/**
 * Fetch crowdsourced prices for a product code (GTIN).
 * @returns {Promise<Array|null>} normalised items, or null when unavailable.
 */
async function fetchPricesForProductCode(productCode, opts = {}) {
  const enabled = opts.enabled !== undefined ? opts.enabled : state.enabled;
  if (!enabled || !productCode) return null;

  const fetchImpl = opts.fetchImpl || state.fetchImpl || globalThis.fetch;
  const timeoutMs = opts.timeoutMs || state.timeoutMs;
  if (typeof fetchImpl !== 'function') return null;

  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 25, 1), 100);
  try {
    const url = `${API_BASE}/api/v1/prices?product_code=${encodeURIComponent(productCode)}&limit=${limit}`;
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (!res || !res.ok) return null;
    const json = await res.json();
    if (!json || !Array.isArray(json.items)) return null;
    return json.items.map(normalizeItem).filter(Boolean);
  } catch (_err) {
    return null;
  }
}

module.exports = {
  SOURCE,
  configure,
  reset,
  isEnabled,
  sourceReference,
  normalizeItem,
  fetchPricesForProductCode,
};

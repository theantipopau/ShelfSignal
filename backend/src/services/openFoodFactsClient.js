'use strict';

/**
 * Open Food Facts identity client — Phase 0 data path (Docs/retailer-api-research.md,
 * Master Prompt section 15).
 *
 * Open Food Facts is 100% free, needs no API key and publishes its data as ODbL.
 * We use it ONLY for product identity by GTIN (brand, name, quantity, category) —
 * never prices. It backs the "confirm the match" candidate for barcodes unknown
 * to the local catalogue; the product stays `unverified` until moderation.
 *
 * Failure policy: any network/HTTP/parse problem resolves to `null` (unknown),
 * never an exception — identity enrichment must not break barcode resolution.
 *
 * Enabled by default everywhere except tests (no network in unit tests).
 * Override with OPEN_FOOD_FACTS_ENABLED=1|0.
 */

const SOURCE = 'openfoodfacts';
const API_BASE = 'https://world.openfoodfacts.org';
const USER_AGENT = 'ShelfSignal/1.0 (https://github.com/theantipopau/ShelfSignal)';

function defaultEnabled() {
  const raw = process.env.OPEN_FOOD_FACTS_ENABLED;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

const state = {
  enabled: defaultEnabled(),
  fetchImpl: null,
  timeoutMs: 4000,
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
  state.timeoutMs = 4000;
}

function isEnabled() {
  return state.enabled;
}

/**
 * Parse an OFF quantity string like "330 ml", "1.5 L", "6 x 330 ml".
 * @returns {{netQuantity: number|null, unit: string, packCount: number}}
 */
function parseQuantity(quantity) {
  const result = { netQuantity: null, unit: '', packCount: 1 };
  if (typeof quantity !== 'string') return result;
  const s = quantity.trim().toLowerCase();
  const pack = s.match(/^(\d+)\s*[x×]\s*/);
  if (pack) {
    const n = parseInt(pack[1], 10);
    if (n > 0 && n <= 999) result.packCount = n;
  }
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|kg|g|mg)\b/);
  if (m) {
    const value = parseFloat(m[1].replace(',', '.'));
    if (Number.isFinite(value) && value > 0) result.netQuantity = value;
    result.unit = m[2];
  }
  return result;
}

/**
 * Coarse ShelfSignal category from OFF categories tags.
 * Our taxonomy is small (grocery/cleaning/liquor/...) — this is a prefill
 * hint for moderation, not a canonical classification.
 */
function mapCategory(categoriesTags) {
  const tags = (Array.isArray(categoriesTags) ? categoriesTags : [])
    .map((t) => String(t).toLowerCase())
    .join(' ');
  if (/\balcohol|alcoholic|wines|beers|spirits|whisk|vodka|gin\b/.test(tags)) return 'liquor';
  if (/\bcleaning|detergent|laundry|household|bleach\b/.test(tags)) return 'cleaning';
  return 'grocery';
}

/** Normalise an OFF v3 (or v2-style) payload into ShelfSignal identity fields. */
function normalize(json, barcode) {
  if (!json || !json.product) return null;
  // v3 responds {status:'success'}; older payloads use numeric 1.
  if (!(json.status === 'success' || json.status === 1)) return null;
  const p = json.product;
  const name = String(p.product_name || p.generic_name || '').trim();
  if (!name) return null;

  const { netQuantity, unit, packCount } = parseQuantity(p.quantity);
  const brands = p.brands ? String(p.brands).split(',')[0].trim() : '';

  return {
    source: SOURCE,
    sourceUrl: `${API_BASE}/api/v3/product/${barcode}.json`,
    webUrl: `${API_BASE}/product/${barcode}`,
    barcode,
    canonical_name: name,
    brand: brands || null,
    category: mapCategory(p.categories_tags),
    net_quantity: netQuantity,
    unit,
    pack_count: packCount,
    image_url: p.image_url || p.image_front_url || null,
    verification_status: 'unverified', // never auto-verified (spec section 9.3)
  };
}

/**
 * Fetch candidate identity for a (normalised, valid) barcode.
 * @returns {Promise<object|null>} normalised identity, or null when unknown/unavailable.
 */
async function fetchIdentity(rawBarcode, opts = {}) {
  const enabled = opts.enabled !== undefined ? opts.enabled : state.enabled;
  if (!enabled || !rawBarcode) return null;

  const fetchImpl = opts.fetchImpl || state.fetchImpl || globalThis.fetch;
  const timeoutMs = opts.timeoutMs || state.timeoutMs;
  if (typeof fetchImpl !== 'function') return null;

  try {
    const res = await fetchImpl(`${API_BASE}/api/v3/product/${encodeURIComponent(rawBarcode)}.json`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (!res || !res.ok) return null;
    const json = await res.json();
    return normalize(json, rawBarcode);
  } catch (_err) {
    return null;
  }
}

module.exports = {
  SOURCE,
  configure,
  reset,
  isEnabled,
  fetchIdentity,
  parseQuantity,
  mapCategory,
  normalize,
};

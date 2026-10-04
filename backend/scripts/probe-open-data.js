'use strict';

/**
 * Live coverage probe for the lawful free data sources
 * (Docs/retailer-api-research.md). Run: node scripts/probe-open-data.js
 *
 * Uses the production clients with the real network — no database involved.
 * Prints one JSON report: OFF identity hits per barcode, Open Prices hits per
 * barcode, and the AUD/AU slice of the Open Prices corpus.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const off = require('../src/services/openFoodFactsClient');
const openPrices = require('../src/services/openPricesClient');

const FIXTURE_BARCODES = ['9310640020223', '9300675046251', '9312680820030'];
// Real Australian grocery GTINs (taken from Open Food Facts' own AU listing, all
// GS1-valid). NOTE: an earlier version of this probe used made-up codes with bad
// check digits, which made OFF coverage look like 0% — see retailer-api-research.md.
const AU_HOUSEHOLD_BARCODES = ['9352042000342', '9300652010794', '9322969000015'];

async function probeIdentity(barcode) {
  const identity = await off.fetchIdentity(barcode);
  return identity
    ? { barcode, found: true, name: identity.canonical_name, brand: identity.brand, category: identity.category }
    : { barcode, found: false };
}

async function probePrices(barcode) {
  const items = await openPrices.fetchPricesForProductCode(barcode, { limit: 100 });
  if (items === null) return { barcode, unavailable: true };
  const aud = items.filter((i) => i.currency === 'AUD');
  const au = items.filter((i) => i.location.countryCode === 'AU');
  return { barcode, total: items.length, aud: aud.length, au: au.length };
}

/** How many AUD rows does the whole Open Prices corpus hold? */
async function probeAudCorpus() {
  const res = await globalThis.fetch(
    'https://prices.openfoodfacts.org/api/v1/prices?currency=AUD&limit=1',
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) return { available: false, status: res.status };
  const json = await res.json();
  return { available: true, count: json.count ?? (Array.isArray(json.items) ? json.items.length : null) };
}

/** How many Australian products does Open Food Facts hold in total? */
async function probeOffAuCorpus() {
  const res = await globalThis.fetch(
    'https://au.openfoodfacts.org/api/v2/search?page_size=1&fields=code',
    { headers: { Accept: 'application/json', 'User-Agent': 'ShelfSignal/1.0 (coverage probe)' } }
  );
  if (!res.ok) return { available: false, status: res.status };
  const json = await res.json();
  return { available: true, count: json.count ?? null };
}

async function main() {
  const report = { probedAt: new Date().toISOString(), identity: [], prices: [], audCorpus: null, offAuCorpus: null };
  const barcodes = [...FIXTURE_BARCODES, ...AU_HOUSEHOLD_BARCODES];

  for (const b of barcodes) report.identity.push(await probeIdentity(b));
  for (const b of barcodes) report.prices.push(await probePrices(b));
  report.audCorpus = await probeAudCorpus();
  report.offAuCorpus = await probeOffAuCorpus();

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

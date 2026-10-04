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
// Well-known AU grocery GTINs for a realistic coverage read.
const AU_HOUSEHOLD_BARCODES = ['9300654001577', '9310072011095', '9311959001016'];

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

async function main() {
  const report = { probedAt: new Date().toISOString(), identity: [], prices: [], audCorpus: null };
  const barcodes = [...FIXTURE_BARCODES, ...AU_HOUSEHOLD_BARCODES];

  for (const b of barcodes) report.identity.push(await probeIdentity(b));
  for (const b of barcodes) report.prices.push(await probePrices(b));
  report.audCorpus = await probeAudCorpus();

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

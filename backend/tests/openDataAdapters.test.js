'use strict';

/**
 * Unit tests for the lawful free data adapters (Docs/retailer-api-research.md):
 *  - Phase 0: Open Food Facts identity client (browser-safe, no key)
 *  - Phase 3: Open Prices client + Australian ingest classification
 * All network access is injected — no test ever touches the internet.
 */

process.env.NODE_ENV = 'test';

const off = require('../src/services/openFoodFactsClient');
const openPrices = require('../src/services/openPricesClient');
const { matchAustralianRetailer, classifyPriceItem } = require('../src/services/ingestService');

/** Build a minimal fetch stub resolving with a JSON body. */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return async () => ({ ok, status, json: async () => body });
}

afterEach(() => {
  off.reset();
  openPrices.reset();
});

describe('Open Food Facts client (Phase 0)', () => {
  it('is disabled by default under NODE_ENV=test', () => {
    expect(off.isEnabled()).toBe(false);
  });

  it('normalises a v3 success payload into identity fields', async () => {
    const fetchImpl = jsonResponse({
      status: 'success',
      product: {
        product_name: 'Coca-Cola Original',
        brands: 'COCA-COLA SERVICES SA/NV, Other',
        quantity: '330 ml',
        categories_tags: ['en:beverages', 'en:soft-drinks'],
        image_url: 'https://images.example/front.jpg',
      },
    });
    const identity = await off.fetchIdentity('5449000000996', { enabled: true, fetchImpl });
    expect(identity).toBeTruthy();
    expect(identity.source).toBe('openfoodfacts');
    expect(identity.barcode).toBe('5449000000996');
    expect(identity.canonical_name).toBe('Coca-Cola Original');
    expect(identity.brand).toBe('COCA-COLA SERVICES SA/NV'); // first brand only
    expect(identity.net_quantity).toBe(330);
    expect(identity.unit).toBe('ml');
    expect(identity.category).toBe('grocery');
    expect(identity.image_url).toBe('https://images.example/front.jpg');
    expect(identity.verification_status).toBe('unverified'); // never auto-verified
  });

  it('accepts legacy numeric status 1 payloads', async () => {
    const fetchImpl = jsonResponse({ status: 1, product: { product_name: 'Legacy Item', quantity: '1 kg' } });
    const identity = await off.fetchIdentity('9310640020223', { enabled: true, fetchImpl });
    expect(identity.canonical_name).toBe('Legacy Item');
    expect(identity.net_quantity).toBe(1);
    expect(identity.unit).toBe('kg');
  });

  it('returns null for not-found and nameless payloads', async () => {
    expect(await off.fetchIdentity('1', { enabled: true, fetchImpl: jsonResponse({ status: 0 }) })).toBeNull();
    expect(await off.fetchIdentity('2', { enabled: true, fetchImpl: jsonResponse({ status: 'success' }) })).toBeNull();
    expect(
      await off.fetchIdentity('3', { enabled: true, fetchImpl: jsonResponse({ status: 'success', product: { product_name: '' } }) }),
    ).toBeNull();
  });

  it('returns null on HTTP errors, network failures and when disabled', async () => {
    expect(await off.fetchIdentity('4', { enabled: true, fetchImpl: jsonResponse({}, { ok: false, status: 503 }) })).toBeNull();
    expect(
      await off.fetchIdentity('5', {
        enabled: true,
        fetchImpl: async () => {
          throw new Error('offline');
        },
      }),
    ).toBeNull();

    let called = false;
    const spy = async () => {
      called = true;
      return jsonResponse({ status: 'success', product: { product_name: 'x' } })();
    };
    expect(await off.fetchIdentity('6', { enabled: false, fetchImpl: spy })).toBeNull();
    expect(called).toBe(false); // disabled must not even hit the network
  });

  it('parses quantities including pack multipliers', () => {
    expect(off.parseQuantity('330 ml')).toEqual({ netQuantity: 330, unit: 'ml', packCount: 1 });
    expect(off.parseQuantity('1.5 L')).toEqual({ netQuantity: 1.5, unit: 'l', packCount: 1 });
    expect(off.parseQuantity('6 x 330 ml')).toEqual({ netQuantity: 330, unit: 'ml', packCount: 6 });
    expect(off.parseQuantity('no quantity')).toEqual({ netQuantity: null, unit: '', packCount: 1 });
    expect(off.parseQuantity(undefined)).toEqual({ netQuantity: null, unit: '', packCount: 1 });
  });

  it('maps categories coarsely to the ShelfSignal taxonomy', () => {
    expect(off.mapCategory(['en:whiskies', 'en:alcoholic-beverages'])).toBe('liquor');
    expect(off.mapCategory(['en:laundry-detergents'])).toBe('cleaning');
    expect(off.mapCategory(['en:breads'])).toBe('grocery');
    expect(off.mapCategory([])).toBe('grocery');
  });
});

describe('Open Prices client (Phase 3)', () => {
  const sampleItem = {
    id: 45309,
    product_code: '5449000000996',
    price: 47.5,
    currency: 'AUD',
    date: '2026-10-03',
    price_is_discounted: true,
    price_without_discount: 52.0,
    proof_id: 13414,
    proof: { id: 13414, type: 'RECEIPT' },
    product: { product_name: 'Coca-Cola Original', brands: 'COCA-COLA' },
    location: {
      osm_name: 'Coles Preston',
      osm_brand: 'Coles',
      osm_address_city: 'Preston',
      osm_address_country_code: 'AU',
      osm_display_name: 'Coles Preston, Preston, Victoria, Australia',
    },
  };

  it('is disabled by default under NODE_ENV=test', () => {
    expect(openPrices.isEnabled()).toBe(false);
  });

  it('normalises a price item with provenance and store context', () => {
    const item = openPrices.normalizeItem(sampleItem);
    expect(item.priceId).toBe(45309);
    expect(item.price).toBe(47.5);
    expect(item.currency).toBe('AUD');
    expect(item.date).toBe('2026-10-03');
    expect(item.isDiscounted).toBe(true);
    expect(item.location.brand).toBe('Coles');
    expect(item.location.countryCode).toBe('AU');
    expect(item.proofType).toBe('RECEIPT');
    expect(openPrices.sourceReference(item.priceId)).toBe('open-prices:45309');
  });

  it('rejects unusable items (bad price, missing id)', () => {
    expect(openPrices.normalizeItem({ ...sampleItem, price: -1 })).toBeNull();
    expect(openPrices.normalizeItem({ ...sampleItem, price: 'abc' })).toBeNull();
    expect(openPrices.normalizeItem({ id: null, price: 1 })).toBeNull();
    expect(openPrices.normalizeItem(null)).toBeNull();
  });

  it('fetches by product_code and maps items', async () => {
    const fetchImpl = jsonResponse({ items: [sampleItem] });
    const items = await openPrices.fetchPricesForProductCode('5449000000996', { enabled: true, fetchImpl, limit: 5 });
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(47.5);
  });

  it('returns null on HTTP errors, malformed bodies, network failures and when disabled', async () => {
    expect(
      await openPrices.fetchPricesForProductCode('1', { enabled: true, fetchImpl: jsonResponse({}, { ok: false, status: 500 }) }),
    ).toBeNull();
    expect(await openPrices.fetchPricesForProductCode('2', { enabled: true, fetchImpl: jsonResponse({ nope: [] }) })).toBeNull();
    expect(
      await openPrices.fetchPricesForProductCode('3', {
        enabled: true,
        fetchImpl: async () => {
          throw new Error('offline');
        },
      }),
    ).toBeNull();

    let called = false;
    expect(
      await openPrices.fetchPricesForProductCode('4', {
        enabled: false,
        fetchImpl: async () => {
          called = true;
          return jsonResponse({ items: [] })();
        },
      }),
    ).toBeNull();
    expect(called).toBe(false);
  });
});

describe('Australian ingest classification', () => {
  it('maps the seven spec chains to retailer slugs', () => {
    expect(matchAustralianRetailer({ brand: 'Coles', name: 'Coles Preston' })).toBe('coles');
    expect(matchAustralianRetailer({ brand: null, name: 'Woolworths Metro' })).toBe('woolworths');
    expect(matchAustralianRetailer({ brand: 'ALDI', name: 'ALDI Ascot Park' })).toBe('aldi');
    expect(matchAustralianRetailer({ brand: "Dan Murphy's", name: "Dan Murphy's Carlton" })).toBe('dan-murphys');
    expect(matchAustralianRetailer({ brand: null, name: 'BWS Chapel St' })).toBe('bws');
    expect(matchAustralianRetailer({ brand: 'Liquorland', name: 'Liquorland Fitzroy' })).toBe('liquorland');
    expect(matchAustralianRetailer({ brand: null, name: 'Bottle Mart Cranbourne' })).toBe('bottle-mart');
  });

  it('does not force unknown stores onto a chain', () => {
    expect(matchAustralianRetailer({ brand: null, name: "L'Éléfàn" })).toBeNull();
    expect(matchAustralianRetailer({ brand: 'Franprix', name: 'Franprix' })).toBeNull();
    expect(matchAustralianRetailer({ brand: null, name: null })).toBeNull();
    expect(matchAustralianRetailer(null)).toBeNull();
  });

  it('only accepts AUD prices confirmed to an Australian store with a date', () => {
    const au = { currency: 'AUD', date: '2026-10-03', location: { countryCode: 'AU' } };
    expect(classifyPriceItem(au)).toBeNull();
    expect(classifyPriceItem({ ...au, currency: 'EUR' })).toBe('non_aud');
    expect(classifyPriceItem({ ...au, location: { countryCode: 'FR' } })).toBe('unconfirmed_region');
    expect(classifyPriceItem({ ...au, location: null })).toBe('unconfirmed_region');
    expect(classifyPriceItem({ ...au, date: null })).toBe('missing_date');
  });
});

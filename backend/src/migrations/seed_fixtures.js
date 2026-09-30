'use strict';

/**
 * Fixture seed data for local development and the offline mobile demo.
 * These are synthetic products — no live retailer data is used or implied
 * (Master Prompt section 15: do not call prices live without evidence).
 */

const db = require('../config/database');

const RETAILERS = [
  { slug: 'coles', name: 'Coles', website: 'https://www.coles.com.au', adapter: null },
  { slug: 'woolworths', name: 'Woolworths', website: 'https://www.woolworths.com.au', adapter: null },
  { slug: 'dan-murphys', name: "Dan Murphy's", website: 'https://www.danmurphys.com.au', adapter: null },
];

const PRODUCTS = [
  {
    barcode: '9310640020223',
    canonical_name: 'Tomato Pasta Sauce',
    brand: 'ExampleBrand',
    variant: 'Basil & Oregano',
    category: 'grocery',
    net_quantity: 500,
    unit: 'ml',
    pack_count: 1,
    verification_status: 'verified',
    offers: [
      { retailer: 'coles', external_id: 'coles-1001', title: 'ExampleBrand Tomato Pasta Sauce Basil 500mL', usual: 6.5, low: 4.5, current: 4.5 },
      { retailer: 'woolworths', external_id: 'woolies-2001', title: 'ExampleBrand Pasta Sauce Basil 500g', usual: 6.5, low: 5.0, current: 6.5 },
    ],
  },
  {
    barcode: '9300675046254',
    canonical_name: 'Laundry Liquid',
    brand: 'ExampleHome',
    variant: 'Fresh Sensitive',
    category: 'cleaning',
    net_quantity: 2000,
    unit: 'ml',
    pack_count: 1,
    verification_status: 'verified',
    offers: [
      { retailer: 'coles', external_id: 'coles-1002', title: 'ExampleHome Laundry Liquid 2L', usual: 18.0, low: 9.0, current: 12.0 },
      { retailer: 'woolworths', external_id: 'woolies-2002', title: 'ExampleHome Sensitive Liquid 2L', usual: 18.0, low: 10.0, current: 17.0 },
    ],
  },
  {
    barcode: '9312680820030',
    canonical_name: 'Blended Whisky',
    brand: 'ExampleDistillery',
    variant: 'Two Oak',
    category: 'liquor',
    net_quantity: 700,
    unit: 'ml',
    pack_count: 1,
    alcohol_abv: 40.0,
    verification_status: 'verified',
    offers: [
      { retailer: 'dan-murphys', external_id: 'dm-3001', title: 'ExampleDistillery Two Oak 700mL', usual: 62.0, low: 45.0, current: 49.9 },
      { retailer: 'woolworths', external_id: 'woolies-2003', title: 'ExampleDistillery Two Oak 700mL', usual: 65.0, low: 48.0, current: 65.0 },
    ],
  },
];

async function up() {
  for (const retailer of RETAILERS) {
    await db.query(
      `INSERT INTO retailers (slug, name, website, adapter)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
      [retailer.slug, retailer.name, retailer.website, retailer.adapter],
    );
  }
  const retailers = await db.query('SELECT id, slug FROM retailers');
  const retailerIds = Object.fromEntries(retailers.map((r) => [r.slug, r.id]));

  for (const p of PRODUCTS) {
    const [product] = await db.query(
      `INSERT INTO products (canonical_name, brand, variant, category, net_quantity, unit, pack_count, alcohol_abv, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [p.canonical_name, p.brand, p.variant, p.category, p.net_quantity, p.unit, p.pack_count, p.alcohol_abv, p.verification_status],
    );
    if (!product) continue;

    await db.query(
      `INSERT INTO product_barcodes (barcode, product_id, barcode_type) VALUES ($1, $2, 'EAN13')
       ON CONFLICT (barcode) DO NOTHING`,
      [p.barcode, product.id],
    );

    // Append-only history: seed ~60 days of observations around the usual price.
    for (const offer of p.offers) {
      const [rp] = await db.query(
        `INSERT INTO retailer_products (retailer_id, product_id, retailer_external_id, retailer_title, retailer_url, match_confidence, match_method)
         VALUES ($1, $2, $3, $4, NULL, 1.0, 'barcode')
         ON CONFLICT (retailer_id, retailer_external_id) DO UPDATE SET product_id = EXCLUDED.product_id
         RETURNING id`,
        [retailerIds[offer.retailer], product.id, offer.external_id, offer.title],
      );

      const now = Date.now();
      const observations = [];
      for (let i = 56; i >= 1; i -= 4) {
        const wobble = ((i * 7919) % 13) / 100; // deterministic pseudo-noise
        observations.push({
          price: offer.usual * (1 + wobble - 0.06),
          at: new Date(now - i * 24 * 60 * 60 * 1000),
        });
      }
      // Historical low + current offer.
      observations.push({ price: offer.low, at: new Date(now - 10 * 24 * 60 * 60 * 1000) });
      observations.push({ price: offer.current, at: new Date(now - 30 * 60 * 1000) });

      for (const obs of observations) {
        await db.query(
          `INSERT INTO price_observations
             (retailer_product_id, observed_price, availability_status, source_method, source_reference, confidence, observed_at)
           VALUES ($1, $2, 'available', 'fixture', 'seed', 1.0, $3)`,
          [rp.id, obs.price.toFixed(2), obs.at.toISOString()],
        );
      }
    }
  }
  console.log('Seed data inserted.');
}

module.exports = { up };

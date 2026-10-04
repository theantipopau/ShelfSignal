'use strict';

const {
  calculateObservedBaseline,
  calculateHistoricalLow,
  effectiveOfferPrice,
  isFresh,
  isInCooldown,
  isSnoozed,
  isRetailerAllowed,
  evaluateRule,
  evaluateSignal,
  SIGNAL_LABELS,
} = require('../src/domain/signalEvaluator');

const NOW = new Date('2026-10-01T00:00:00Z');

function historyWith(...prices) {
  return prices.map((price) => ({ price }));
}

describe('calculateObservedBaseline', () => {
  test('returns median of window', () => {
    const history = historyWith(10, 12, 14, 100, 11);
    expect(calculateObservedBaseline(history)).toBe(12);
  });

  test('ignores extreme outlier medians robustly', () => {
    const history = historyWith(6.0, 6.5, 6.4, 6.6, 6.2, 60.0);
    // median of [6.0, 6.2, 6.4, 6.5, 6.6, 60]
    expect(calculateObservedBaseline(history)).toBeCloseTo(6.45, 2);
  });

  test('returns null when insufficient data', () => {
    expect(calculateObservedBaseline(historyWith(5, 6))).toBeNull();
    expect(calculateObservedBaseline([])).toBeNull();
  });
});

describe('calculateHistoricalLow', () => {
  test('returns minimum observed price', () => {
    expect(calculateHistoricalLow(historyWith(9.9, 4.5, 7.2))).toBe(4.5);
  });

  test('returns null for empty history', () => {
    expect(calculateHistoricalLow([])).toBeNull();
  });
});

describe('effectiveOfferPrice', () => {
  test('uses member price only when lower and included', () => {
    const offer = { price: 10, memberPrice: 8 };
    expect(effectiveOfferPrice(offer, { includeMemberPrices: true })).toBe(8);
    expect(effectiveOfferPrice(offer, { includeMemberPrices: false })).toBe(10);
  });

  test('derives per-unit price from multi-buy totals', () => {
    const offer = { price: 10, multiBuyQuantity: 2, multiBuyTotal: 15 };
    expect(effectiveOfferPrice(offer)).toBe(7.5);
  });

  test('falls back to base price', () => {
    expect(effectiveOfferPrice({ price: 10 })).toBe(10);
    expect(effectiveOfferPrice({})).toBeNull();
  });
});

describe('gates', () => {
  test('freshness', () => {
    expect(isFresh(new Date(NOW.getTime() - 3600 * 1000), NOW, { maxAgeHours: 48 })).toBe(true);
    expect(isFresh(new Date(NOW.getTime() - 72 * 3600 * 1000), NOW, { maxAgeHours: 48 })).toBe(false);
    expect(isFresh(null, NOW)).toBe(false);
  });

  it('tolerates small clock skew but rejects genuinely future-dated observations', () => {
    expect(isFresh(new Date(NOW.getTime() + 1), NOW)).toBe(true); // 1 ms ahead (DB rounding)
    expect(isFresh(new Date(NOW.getTime() + 60 * 1000), NOW)).toBe(true); // 1 min of skew
    expect(isFresh(new Date(NOW.getTime() + 60 * 60 * 1000), NOW)).toBe(false); // 1 h ahead = anomaly
  });

  test('cooldown', () => {
    const lastSignal = new Date(NOW.getTime() - 10 * 3600 * 1000);
    expect(isInCooldown(lastSignal, NOW, 24)).toBe(true);
    expect(isInCooldown(lastSignal, NOW, 8)).toBe(false);
    expect(isInCooldown(null, NOW, 24)).toBe(false);
  });

  test('snooze', () => {
    const item = { snoozed_until: new Date(NOW.getTime() + 86400000) };
    expect(isSnoozed(item, NOW)).toBe(true);
    expect(isSnoozed({}, NOW)).toBe(false);
  });

  test('retailer filters', () => {
    const r1 = '11111111-1111-1111-1111-111111111111';
    const r2 = '22222222-2222-2222-2222-222222222222';
    expect(isRetailerAllowed(r1, {})).toBe(true);
    expect(isRetailerAllowed(r2, { excludedRetailers: [r2] })).toBe(false);
    expect(isRetailerAllowed(r2, { allowedRetailers: [r1] })).toBe(false);
    expect(isRetailerAllowed(r1, { allowedRetailers: [r1, r2] })).toBe(true);
  });
});

describe('evaluateRule', () => {
  test('target_price triggers when price at or below target', () => {
    const rule = { rule_type: 'target_price', target_price: 50 };
    const result = evaluateRule(rule, 49.9, 62, 45);
    expect(result.triggered).toBe(true);
    expect(result.explanation).toContain('target');
  });

  test('target_price within 10% is labelled near, not triggered', () => {
    const rule = { rule_type: 'target_price', target_price: 50 };
    const result = evaluateRule(rule, 54, 62, 45);
    expect(result.triggered).toBe(false);
    expect(result.label).toBe(SIGNAL_LABELS.NEAR);
  });

  test('discount_percent compares against observed baseline', () => {
    const rule = { rule_type: 'discount_percent', minimum_discount_percent: 20 };
    const triggered = evaluateRule(rule, 8, 10, 7);
    expect(triggered.triggered).toBe(true);
    const notTriggered = evaluateRule(rule, 9.5, 10, 7);
    expect(notTriggered.triggered).toBe(false);
  });

  test('near_historical_low triggers within tolerance', () => {
    const rule = { rule_type: 'near_historical_low', near_low_percent: 5 };
    expect(evaluateRule(rule, 46, 62, 45).triggered).toBe(true);
    expect(evaluateRule(rule, 50, 62, 45).triggered).toBe(false);
  });

  test('any_price_drop triggers on any decrease from baseline', () => {
    const rule = { rule_type: 'any_price_drop' };
    expect(evaluateRule(rule, 9.99, 10, 8).triggered).toBe(true);
    expect(evaluateRule(rule, 10, 10, 8).triggered).toBe(false);
  });
});

describe('evaluateSignal (full pipeline)', () => {
  const baseOffer = {
    matchConfidence: 1.0,
    price: 49.9,
    observedAt: new Date(NOW.getTime() - 30 * 60 * 1000),
    availabilityStatus: 'available',
  };
  const history = historyWith(62, 61.5, 62.5, 62, 61.8);

  test('creates an explainable signal when everything passes', () => {
    const signal = evaluateSignal({
      watchItem: {},
      rule: { rule_type: 'target_price', target_price: 50, cooldown_hours: 24 },
      offer: baseOffer,
      history,
      retailerId: 'r1',
      lastSignalAt: null,
      now: NOW,
      config: { minimumPushMatchConfidence: 0.75 },
    });
    expect(signal).not.toBeNull();
    expect(signal.explanation).toBeTruthy();
    expect(signal.currentPrice).toBe(49.9);
    expect(signal.baselinePrice).toBeCloseTo(62, 0);
    // Savings below the observed usual price are positive.
    expect(signal.differenceAmount).toBeGreaterThan(0);
    expect(signal.differencePercent).toBeGreaterThan(0);
  });

  test('suppresses low-confidence matches (never notify on weak match)', () => {
    const signal = evaluateSignal({
      watchItem: {},
      rule: { rule_type: 'target_price', target_price: 50, cooldown_hours: 24 },
      offer: { ...baseOffer, matchConfidence: 0.5 },
      history,
      retailerId: 'r1',
      lastSignalAt: null,
      now: NOW,
      config: { minimumPushMatchConfidence: 0.75 },
    });
    expect(signal).toBeNull();
  });

  test('suppresses stale offers', () => {
    const signal = evaluateSignal({
      watchItem: {},
      rule: { rule_type: 'target_price', target_price: 50, cooldown_hours: 24 },
      offer: { ...baseOffer, observedAt: new Date(NOW.getTime() - 96 * 3600 * 1000) },
      history,
      retailerId: 'r1',
      lastSignalAt: null,
      now: NOW,
      config: {},
    });
    expect(signal).toBeNull();
  });

  test('suppresses during cooldown', () => {
    const signal = evaluateSignal({
      watchItem: {},
      rule: { rule_type: 'target_price', target_price: 50, cooldown_hours: 24 },
      offer: baseOffer,
      history,
      retailerId: 'r1',
      lastSignalAt: new Date(NOW.getTime() - 2 * 3600 * 1000),
      now: NOW,
      config: {},
    });
    expect(signal).toBeNull();
  });

  test('suppresses snoozed items', () => {
    const signal = evaluateSignal({
      watchItem: { snoozed_until: new Date(NOW.getTime() + 86400000) },
      rule: { rule_type: 'target_price', target_price: 50, cooldown_hours: 24 },
      offer: baseOffer,
      history,
      retailerId: 'r1',
      lastSignalAt: null,
      now: NOW,
      config: {},
    });
    expect(signal).toBeNull();
  });

  test('excludes retailers per rule', () => {
    const signal = evaluateSignal({
      watchItem: {},
      rule: { rule_type: 'target_price', target_price: 50, cooldown_hours: 24, excluded_retailers: ['r1'] },
      offer: baseOffer,
      history,
      retailerId: 'r1',
      lastSignalAt: null,
      now: NOW,
      config: {},
    });
    expect(signal).toBeNull();
  });

  test('out-of-stock offers never signal', () => {
    const signal = evaluateSignal({
      watchItem: {},
      rule: { rule_type: 'target_price', target_price: 50, cooldown_hours: 24 },
      offer: { ...baseOffer, availabilityStatus: 'out_of_stock' },
      history,
      retailerId: 'r1',
      lastSignalAt: null,
      now: NOW,
      config: {},
    });
    expect(signal).toBeNull();
  });
});

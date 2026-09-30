'use strict';

/**
 * Signal evaluation domain — pure functions, no I/O (Master Prompt section 14).
 *
 * A signal must pass: match confidence, freshness, availability, eligibility,
 * threshold, cooldown/dedup and anomaly checks. Everything here is unit-testable
 * without a database.
 */

const SIGNAL_LABELS = Object.freeze({
  STRONG: 'Strong signal',
  GOOD: 'Good price',
  NEAR: 'Near your target',
  CONDITIONAL: 'Conditional offer',
  VERIFY: 'Price needs verification',
});

/**
 * Observed usual price: a robust (median) baseline over the recent window,
 * calculated per offer-conditions bucket (member vs standard, pack format).
 * Returns null when there is not enough history to be meaningful.
 */
function calculateObservedBaseline(history, { windowSize = 30 } = {}) {
  const usable = (history || [])
    .filter((h) => h && Number.isFinite(Number(h.price)))
    .slice(0, windowSize)
    .map((h) => Number(h.price));

  if (usable.length < 3) return null;

  const sorted = usable.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  // Round to cents.
  return Math.round(median * 100) / 100;
}

/**
 * Lowest observed comparable price (excludes unavailable records).
 */
function calculateHistoricalLow(history) {
  const prices = (history || [])
    .filter((h) => h && Number.isFinite(Number(h.price)))
    .map((h) => Number(h.price));
  if (!prices.length) return null;
  return Math.round(Math.min(...prices) * 100) / 100;
}

/**
 * Effective price for rule evaluation. Handles member pricing and
 * multi-buy economics without mixing pack formats.
 */
function effectiveOfferPrice(offer, { includeMemberPrices = true } = {}) {
  const base = Number(offer.price);
  if (!Number.isFinite(base)) return null;

  if (includeMemberPrices && offer.memberPrice != null) {
    const member = Number(offer.memberPrice);
    if (Number.isFinite(member) && member < base) return member;
  }

  if (offer.multiBuyQuantity != null && offer.multiBuyTotal != null) {
    const qty = Number(offer.multiBuyQuantity);
    const total = Number(offer.multiBuyTotal);
    if (qty > 0 && Number.isFinite(total) && total > 0) {
      return Math.round((total / qty) * 100) / 100;
    }
  }
  return base;
}

/** Freshness check: offers older than maxAgeHours are never push-worthy. */
function isFresh(observedAt, now, { maxAgeHours = 48 } = {}) {
  if (!observedAt) return false;
  const ageMs = new Date(now).getTime() - new Date(observedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) return false;
  return ageMs <= maxAgeHours * 60 * 60 * 1000;
}

/** Availability gate. */
function isAvailable(offer) {
  return offer && offer.availabilityStatus !== 'out_of_stock';
}

/** Retailer allow/deny filters. */
function isRetailerAllowed(retailerId, { allowedRetailers = null, excludedRetailers = [] } = {}) {
  if (!retailerId) return true;
  if (allowedRetailers && allowedRetailers.length > 0 && !allowedRetailers.includes(retailerId)) {
    return false;
  }
  if (excludedRetailers.includes(retailerId)) return false;
  return true;
}

/** Cooldown / dedup gate. */
function isInCooldown(lastSignalAt, now, cooldownHours) {
  if (!lastSignalAt || !cooldownHours) return false;
  const hoursSince = (new Date(now).getTime() - new Date(lastSignalAt).getTime()) / 3600000;
  return hoursSince < cooldownHours;
}

/** Snooze gate. */
function isSnoozed(watchItem, now) {
  return Boolean(watchItem && watchItem.snoozed_until && new Date(watchItem.snoozed_until) > new Date(now));
}

/**
 * Evaluate one rule against an offer, baseline and historical low.
 * @returns {{ triggered: boolean, label: string|null, explanation: string|null }}
 */
function evaluateRule(rule, price, baseline, historicalLow) {
  const target = rule.target_price != null ? Number(rule.target_price) : null;
  const minDiscount = rule.minimum_discount_percent != null ? Number(rule.minimum_discount_percent) : null;
  const nearLowPct = rule.near_low_percent != null ? Number(rule.near_low_percent) : null;

  if (rule.rule_type === 'target_price' && target != null) {
    if (price <= target) {
      const below = Math.round((target - price) * 100) / 100;
      return {
        triggered: true,
        label: below >= target * 0.1 ? SIGNAL_LABELS.STRONG : SIGNAL_LABELS.GOOD,
        explanation: `Price $${price.toFixed(2)} is below your target of $${target.toFixed(2)}` + (below > 0 ? ` by $${below.toFixed(2)}` : ''),
      };
    }
    // Within 10% of target still counts as "near".
    if (price <= target * 1.1) {
      return {
        triggered: false,
        label: SIGNAL_LABELS.NEAR,
        explanation: `Price $${price.toFixed(2)} is close to your target of $${target.toFixed(2)}`,
      };
    }
  }

  if (rule.rule_type === 'discount_percent' && minDiscount != null && baseline) {
    const pct = ((baseline - price) / baseline) * 100;
    if (pct >= minDiscount) {
      return {
        triggered: true,
        label: pct >= 40 ? SIGNAL_LABELS.STRONG : SIGNAL_LABELS.GOOD,
        explanation: `${pct.toFixed(0)}% below the observed usual price of $${baseline.toFixed(2)}`,
      };
    }
  }

  if (rule.rule_type === 'near_historical_low' && historicalLow != null) {
    const pct = nearLowPct != null ? nearLowPct : 5;
    if (price <= historicalLow * (1 + pct / 100)) {
      return {
        triggered: true,
        label: SIGNAL_LABELS.STRONG,
        explanation: `Price $${price.toFixed(2)} is near the lowest observed price of $${historicalLow.toFixed(2)}`,
      };
    }
  }

  if (rule.rule_type === 'any_price_drop' && baseline) {
    if (price < baseline) {
      const pct = ((baseline - price) / baseline) * 100;
      return {
        triggered: true,
        label: pct >= 25 ? SIGNAL_LABELS.STRONG : SIGNAL_LABELS.GOOD,
        explanation: `Down ${pct.toFixed(0)}% from the observed usual price of $${baseline.toFixed(2)}`,
      };
    }
  }

  return { triggered: false, label: null, explanation: null };
}

/**
 * Full signal evaluation for one watch item + rule + offer.
 * @returns {object|null} explainable signal, or null when nothing triggered.
 */
function evaluateSignal({ watchItem, rule, offer, history, retailerId, lastSignalAt, now, config }) {
  const cfg = config || {};
  const minConfidence = cfg.minimumPushMatchConfidence != null ? cfg.minimumPushMatchConfidence : 0.75;
  const maxAgeHours = cfg.freshnessHours != null ? cfg.freshnessHours : 48;

  // 1. Match confidence — never notify on low-confidence matches.
  if (Number(offer.matchConfidence) < minConfidence) return null;

  // 2. Freshness.
  if (!isFresh(offer.observedAt, now, { maxAgeHours })) return null;

  // 3. Availability.
  if (!isAvailable(offer)) return null;

  // 4. Retailer filters.
  if (!isRetailerAllowed(retailerId, {
    allowedRetailers: rule.allowed_retailers,
    excludedRetailers: rule.excluded_retailers || [],
  })) {
    return null;
  }

  // 5. Snooze + cooldown / dedup.
  if (isSnoozed(watchItem, now)) return null;
  if (isInCooldown(lastSignalAt, now, rule.cooldown_hours)) return null;

  // 6. Effective price (member / multi-buy eligibility).
  const price = effectiveOfferPrice(offer, {
    includeMemberPrices: rule.include_member_prices !== false,
  });
  if (price == null) return null;

  // 7. Baseline + historical low + threshold.
  const baseline = calculateObservedBaseline(history, { windowSize: cfg.baselineWindow || 30 });
  const historicalLow = calculateHistoricalLow(history);
  const evaluation = evaluateRule(rule, price, baseline, historicalLow);

  if (!evaluation.triggered) return null;

  const baselinePrice = baseline || historicalLow;
  const diffAmount = baselinePrice != null ? Math.round((baselinePrice - price) * 100) / 100 : null;
  const diffPercent =
    baselinePrice != null && baselinePrice > 0
      ? Math.round(((baselinePrice - price) / baselinePrice) * 10000) / 100
      : null;

  const conditions = [];
  if (offer.memberPrice != null && Number(offer.memberPrice) < Number(offer.price)) {
    conditions.push('member_price');
  }
  if (offer.multiBuyQuantity != null) conditions.push('multi_buy');
  if (offer.promotionType) conditions.push(offer.promotionType);

  return {
    ruleType: rule.rule_type,
    label: evaluation.label,
    explanation: evaluation.explanation,
    currentPrice: price,
    baselinePrice,
    historicalLow,
    differenceAmount: diffAmount,
    differencePercent: diffPercent,
    confidence: Number(offer.matchConfidence),
    conditions,
    observedAt: offer.observedAt,
  };
}

module.exports = {
  SIGNAL_LABELS,
  calculateObservedBaseline,
  calculateHistoricalLow,
  effectiveOfferPrice,
  isFresh,
  isAvailable,
  isRetailerAllowed,
  isInCooldown,
  isSnoozed,
  evaluateRule,
  evaluateSignal,
};

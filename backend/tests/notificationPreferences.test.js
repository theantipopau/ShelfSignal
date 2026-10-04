'use strict';

/**
 * Unit tests for notification preference semantics (Master Prompt section 9.11).
 * Pure functions only — no database, no HTTP, no network.
 */

process.env.NODE_ENV = 'test';

const {
  DEFAULTS,
  isWithinQuietHours,
  shouldDeliver,
  normalise,
  normaliseList,
  toArray,
  nextWakeUp,
} = require('../src/services/notificationPreferencesService');
const { ValidationError } = require('../src/utils/errorHandler');

function at(hh, mm) {
  const d = new Date('2026-10-07T00:00:00');
  d.setHours(hh, mm, 0, 0);
  return d;
}

describe('isWithinQuietHours', () => {
  it('handles a window that wraps midnight', () => {
    expect(isWithinQuietHours(at(23, 0), '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(at(3, 0), '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(at(6, 59), '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(at(7, 0), '22:00', '07:00')).toBe(false);
    expect(isWithinQuietHours(at(12, 0), '22:00', '07:00')).toBe(false);
    expect(isWithinQuietHours(at(21, 59), '22:00', '07:00')).toBe(false);
    expect(isWithinQuietHours(at(22, 0), '22:00', '07:00')).toBe(true);
  });

  it('handles a same-day window', () => {
    expect(isWithinQuietHours(at(9, 0), '08:00', '18:00')).toBe(true);
    expect(isWithinQuietHours(at(7, 59), '08:00', '18:00')).toBe(false);
    expect(isWithinQuietHours(at(18, 0), '08:00', '18:00')).toBe(false);
  });

  it('a zero-length window never suppresses', () => {
    expect(isWithinQuietHours(at(7, 0), '07:00', '07:00')).toBe(false);
    expect(isWithinQuietHours(at(23, 0), '23:00', '23:00')).toBe(false);
  });
});

describe('shouldDeliver (spec 9.11 controls)', () => {
  it('delivers by default', () => {
    expect(shouldDeliver({}, {}, at(12, 0))).toEqual({ deliver: true, reason: 'ok' });
  });

  it('respects the global switch', () => {
    const r = shouldDeliver({ global_enabled: false }, {}, at(12, 0));
    expect(r.deliver).toBe(false);
    expect(r.reason).toBe('global_off');
  });

  it('suppresses in quiet hours and reports when it resumes', () => {
    const r = shouldDeliver(
      { quiet_hours_enabled: true, quiet_hours_start: '22:00', quiet_hours_end: '07:00' },
      {},
      at(23, 30),
    );
    expect(r.deliver).toBe(false);
    expect(r.reason).toBe('quiet_hours');
    expect(r.resume_at).toBeTruthy();
    expect(new Date(r.resume_at).getHours()).toBe(7);
  });

  it('high-value signals bypass quiet hours when allowed', () => {
    const prefs = {
      quiet_hours_enabled: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      immediate_high_value_enabled: true,
    };
    const r = shouldDeliver(prefs, { isHighValue: true }, at(23, 30));
    expect(r.deliver).toBe(true);
    expect(r.reason).toBe('high_value_override');
  });

  it('high-value override can be turned off', () => {
    const prefs = {
      quiet_hours_enabled: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      immediate_high_value_enabled: false,
    };
    expect(shouldDeliver(prefs, { isHighValue: true }, at(23, 30)).deliver).toBe(false);
  });

  it('digest mode queues non-urgent notifications', () => {
    const r = shouldDeliver({ digest_mode: true }, {}, at(12, 0));
    expect(r.deliver).toBe(false);
    expect(r.reason).toBe('digest_queued');
    // Digest never delays an immediate high-value signal.
    expect(shouldDeliver({ digest_mode: true }, { isHighValue: true }, at(12, 0)).deliver).toBe(true);
  });

  it('household activity has its own control', () => {
    const r = shouldDeliver({ household_activity_enabled: false }, { isHouseholdActivity: true }, at(12, 0));
    expect(r.deliver).toBe(false);
    expect(r.reason).toBe('household_activity_off');
  });

  it('alcohol alerts can be disabled entirely', () => {
    const r = shouldDeliver({ alcohol_alerts_enabled: false }, { category: 'liquor' }, at(12, 0));
    expect(r.deliver).toBe(false);
    expect(r.reason).toBe('alcohol_off');
    // Non-alcohol categories are unaffected.
    expect(shouldDeliver({ alcohol_alerts_enabled: false }, { category: 'grocery' }, at(12, 0)).deliver).toBe(true);
  });

  it('uses defaults for a missing or partial preferences row', () => {
    expect(shouldDeliver(null, {}, at(12, 0)).deliver).toBe(true);
    expect(shouldDeliver({ global_enabled: true }, {}, at(12, 0)).deliver).toBe(true);
    expect(DEFAULTS.global_enabled).toBe(true);
  });
});

describe('preference validation (normalise)', () => {
  it('accepts a valid partial update', () => {
    const next = normalise(null, { digest_mode: true, per_product_cooldown_hours: 6 });
    expect(next.digest_mode).toBe(true);
    expect(next.per_product_cooldown_hours).toBe(6);
    expect(next.global_enabled).toBe(true); // untouched default preserved
  });

  it('rejects non-boolean toggles', () => {
    expect(() => normalise(null, { digest_mode: 'yes' })).toThrow(ValidationError);
  });

  it('rejects malformed times', () => {
    expect(() => normalise(null, { quiet_hours_start: '25:00' })).toThrow(ValidationError);
    expect(() => normalise(null, { quiet_hours_end: '7am' })).toThrow(ValidationError);
    expect(() => normalise(null, { quiet_hours_end: '24:61' })).toThrow(ValidationError);
  });

  it('rejects out-of-range cooldowns', () => {
    expect(() => normalise(null, { per_product_cooldown_hours: -1 })).toThrow(ValidationError);
    expect(() => normalise(null, { per_product_cooldown_hours: 200 })).toThrow(ValidationError);
    expect(() => normalise(null, { per_product_cooldown_hours: 2.5 })).toThrow(ValidationError);
    expect(() => normalise(null, { per_product_cooldown_hours: 0 })).not.toThrow();
  });
});

describe('category and retailer controls (spec 9.11)', () => {
  it('a muted category or retailer suppresses the push', () => {
    const prefs = { muted_categories: ['liquor'], muted_retailers: ['coles'] };
    expect(shouldDeliver(prefs, { category: 'liquor' }, at(12, 0)))
      .toEqual({ deliver: false, reason: 'category_muted' });
    expect(shouldDeliver(prefs, { retailer: 'coles' }, at(12, 0)))
      .toEqual({ deliver: false, reason: 'retailer_muted' });
    expect(shouldDeliver(prefs, { category: 'grocery', retailer: 'woolworths' }, at(12, 0)))
      .toEqual({ deliver: true, reason: 'ok' });
  });

  it('a mute beats quiet hours, the digest and the high-value override', () => {
    const prefs = {
      muted_categories: ['grocery'],
      quiet_hours_enabled: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      digest_mode: true,
      immediate_high_value_enabled: true,
    };
    // Inside quiet hours, with digest on, high value on — still muted.
    expect(shouldDeliver(prefs, { category: 'grocery' }, at(23, 30)))
      .toEqual({ deliver: false, reason: 'category_muted' });
    expect(shouldDeliver(prefs, { category: 'grocery', isHighValue: true }, at(23, 30)))
      .toEqual({ deliver: false, reason: 'category_muted' });
    // Quiet hours still apply to an unmuted category at the same time.
    expect(shouldDeliver(prefs, { category: 'cleaning' }, at(23, 30)).reason).toBe('quiet_hours');
  });

  it('reads JSON-array columns back as arrays and tolerates corruption', () => {
    expect(toArray('["coles","bws"]')).toEqual(['coles', 'bws']);
    expect(toArray('[]')).toEqual([]);
    expect(toArray(null)).toEqual([]);
    expect(toArray('not json')).toEqual([]);
    expect(toArray('{"a":1}')).toEqual([]);
    expect(toArray(['already'])).toEqual(['already']);
  });

  it('validates channel lists as unique lowercase slugs', () => {
    expect(normaliseList(undefined, 'muted_categories')).toBeUndefined();
    expect(normaliseList(['grocery', 'grocery'], 'muted_categories')).toEqual(['grocery']);
    expect(() => normaliseList('grocery', 'muted_categories')).toThrow(ValidationError);
    expect(() => normaliseList([123], 'muted_categories')).toThrow(ValidationError);
    expect(() => normaliseList(['Grocery'], 'muted_categories')).toThrow(ValidationError);
    expect(() => normaliseList(['bad slug'], 'muted_retailers')).toThrow(ValidationError);
    expect(() => normaliseList([''], 'muted_retailers')).toThrow(ValidationError);
    expect(() => normaliseList(Array.from({ length: 51 }, (_, i) => `c${i}`), 'muted_retailers'))
      .toThrow(ValidationError);
  });

  it('normalise merges stored TEXT columns with a list replacement', () => {
    // A stored row carries JSON text, not arrays — normalise must still work.
    const stored = { muted_categories: '["liquor"]', muted_retailers: '[]' };
    const keep = normalise(stored, {});
    expect(keep.muted_categories).toEqual(['liquor']);
    expect(keep.muted_retailers).toEqual([]);

    const replaced = normalise(stored, { muted_categories: ['cleaning'] });
    expect(replaced.muted_categories).toEqual(['cleaning']);
    expect(replaced.muted_retailers).toEqual([]);

    expect(DEFAULTS.muted_categories).toEqual([]);
    expect(Object.isFrozen(DEFAULTS.muted_categories)).toBe(true);
  });
});

describe('nextWakeUp', () => {
  it('returns the next occurrence of the end time', () => {
    const wake = nextWakeUp(at(23, 30), '07:00');
    const d = new Date(wake);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(0);
    expect(d.getTime()).toBeGreaterThan(at(23, 30).getTime());
  });

  it('rolls to the following day when the end time already passed', () => {
    const wake = nextWakeUp(at(8, 0), '07:00');
    const d = new Date(wake);
    expect(d.getHours()).toBe(7);
    expect(d.getTime()).toBeGreaterThan(at(8, 0).getTime());
  });
});

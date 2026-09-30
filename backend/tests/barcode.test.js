'use strict';

const { validateBarcode } = require('../src/utils/barcode');

describe('validateBarcode', () => {
  test('accepts a valid EAN-13', () => {
    const result = validateBarcode('9310640020223');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('EAN13');
    expect(result.normalized).toBe('9310640020223');
  });

  test('accepts a valid UPC-A and normalises to 13 digits', () => {
    // Valid UPC-A: 012345678905
    const result = validateBarcode('012345678905');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('UPCA');
    expect(result.normalized).toBe('0012345678905');
  });

  test('accepts a valid EAN-8', () => {
    const result = validateBarcode('96385074');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('EAN8');
  });

  test('rejects a bad check digit', () => {
    const result = validateBarcode('9310640020224');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('bad_check_digit');
  });

  test('rejects unsupported lengths', () => {
    expect(validateBarcode('12345').valid).toBe(false);
    expect(validateBarcode('12345678901234567890').valid).toBe(false);
  });

  test('rejects empty input', () => {
    expect(validateBarcode('').valid).toBe(false);
    expect(validateBarcode(null).valid).toBe(false);
  });

  test('tolerates surrounding whitespace and dashes', () => {
    const result = validateBarcode(' 931-06400-20223 ');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('9310640020223');
  });
});

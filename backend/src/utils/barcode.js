'use strict';

/**
 * GTIN / EAN / UPC barcode validation (Master Prompt section 9.3).
 * Supports EAN-8, EAN-13, UPC-A (12-digit) and GTIN-14.
 */

const SUPPORTED_LENGTHS = new Set([8, 12, 13, 14]);

function digitsOnly(raw) {
  return String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
}

/** Standard GS1 modulo-10 check digit algorithm. */
function checkDigit(values) {
  let sum = 0;
  const reversed = values.slice().reverse();
  for (let i = 0; i < reversed.length; i++) {
    sum += reversed[i] * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * @returns {{ valid: boolean, normalized: string|null, type: string|null, reason?: string }}
 */
function validateBarcode(raw) {
  const digits = digitsOnly(raw);

  if (!digits) {
    return { valid: false, normalized: null, type: null, reason: 'empty' };
  }
  if (!SUPPORTED_LENGTHS.has(digits.length)) {
    return { valid: false, normalized: null, type: null, reason: 'unsupported_length' };
  }

  const body = digits.slice(0, -1).split('').map(Number);
  const expected = checkDigit(body);
  const actual = Number(digits.slice(-1));

  if (expected !== actual) {
    return { valid: false, normalized: null, type: null, reason: 'bad_check_digit' };
  }

  let type;
  switch (digits.length) {
    case 8:
      type = 'EAN8';
      break;
    case 12:
      type = 'UPCA';
      break;
    case 13:
      type = 'EAN13';
      break;
    case 14:
      type = 'GTIN14';
      break;
    default:
      type = 'UNKNOWN';
  }

  // Normalise: UPC-A is canonically a 13-digit GTIN with a leading zero.
  const normalized = digits.length === 12 ? '0' + digits : digits;

  return { valid: true, normalized, type };
}

module.exports = { validateBarcode, checkDigit, digitsOnly };

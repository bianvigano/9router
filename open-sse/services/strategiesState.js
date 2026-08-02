/**
 * Tiny shared helpers used by both `strategies.js` and `combo.js`.
 * Extracted here so `strategies.js` doesn't circularly import `combo.js`.
 * Both modules can import from this file safely.
 */

/**
 * Normalize stickyLimit to a positive integer. Accepts number or string.
 * Defaults to 1 when input is invalid or <= 0.
 * @param {number|string} [val]
 * @returns {number}
 */
export function normalizeStickyLimit(val) {
  const parsed = Number.parseInt(val, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

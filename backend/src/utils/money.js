/**
 * Precision-safe money arithmetic.
 *
 * Every rupee figure the farmer sees passes through here. Binary floating point
 * cannot represent decimal currency exactly (0.1 + 0.2 !== 0.3), and these
 * numbers drive a real selling decision, so all arithmetic is done on integer
 * paise and only converted back to rupees at the boundary.
 *
 * node-postgres returns NUMERIC columns as strings precisely to avoid float
 * damage; `toPaise` accepts those strings directly.
 *
 * No external decimal library is used: integer paise covers every operation
 * this system needs (add, subtract, multiply by a quantity or a percentage).
 */

/** Paise in one rupee. */
const PAISE_PER_RUPEE = 100;

/**
 * Converts a rupee value to integer paise.
 * @param {number|string|null|undefined} value - rupees, or a pg NUMERIC string
 * @returns {number} integer paise (0 for null/invalid)
 */
const toPaise = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * PAISE_PER_RUPEE);
};

/**
 * Converts integer paise back to a rupee number.
 * @param {number} paise
 * @returns {number} rupees, at most 2 decimal places
 */
const toRupees = (paise) => {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(paise) / PAISE_PER_RUPEE;
};

/**
 * Converts integer paise to whole rupees, for display-level figures where
 * paise precision is noise (a mandi does not pay out fractions of a rupee).
 * @param {number} paise
 * @returns {number} integer rupees
 */
const toWholeRupees = (paise) => Math.round(toRupees(paise));

/**
 * Adds any number of paise amounts.
 * @param {...number} amounts
 * @returns {number} paise
 */
const add = (...amounts) => amounts.reduce((sum, a) => sum + Math.round(a || 0), 0);

/**
 * Subtracts every subsequent amount from the first.
 * @param {number} base - paise
 * @param {...number} amounts - paise
 * @returns {number} paise
 */
const subtract = (base, ...amounts) =>
  amounts.reduce((acc, a) => acc - Math.round(a || 0), Math.round(base || 0));

/**
 * Multiplies a paise amount by a unitless quantity (kg, quintals, count).
 * @param {number} paise
 * @param {number} quantity
 * @returns {number} paise
 */
const multiply = (paise, quantity) => {
  if (!Number.isFinite(paise) || !Number.isFinite(quantity)) return 0;
  return Math.round(paise * quantity);
};

/**
 * Takes a percentage of a paise amount.
 * @param {number} paise
 * @param {number} percent - e.g. 8.5 for 8.5%
 * @returns {number} paise
 */
const percentOf = (paise, percent) => {
  if (!Number.isFinite(paise) || !Number.isFinite(percent)) return 0;
  return Math.round((paise * percent) / 100);
};

/**
 * Converts a per-quintal rate to a per-kg rate, both in paise.
 * One quintal is 100 kg - the unit Indian mandi prices are quoted in.
 * @param {number} paisePerQuintal
 * @returns {number} paise per kg
 */
const perQuintalToPerKg = (paisePerQuintal) => Math.round((paisePerQuintal || 0) / 100);

/**
 * Formats paise as Indian rupees for logs and human-readable output.
 * @param {number} paise
 * @returns {string} e.g. "₹12,520"
 */
const format = (paise) => {
  const rupees = toWholeRupees(paise);
  const sign = rupees < 0 ? '-' : '';
  const body = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
    .format(Math.abs(rupees));
  return `${sign}₹${body}`;
};

module.exports = {
  PAISE_PER_RUPEE,
  toPaise,
  toRupees,
  toWholeRupees,
  add,
  subtract,
  multiply,
  percentOf,
  perQuintalToPerKg,
  format
};

/**
 * Selling-cost configuration for APMC mandi sales.
 *
 * Kept as version-controlled configuration rather than being scattered through
 * the engines, so a rate can be corrected in one reviewed place. Everything here
 * is deliberately overridable by environment variable, because these charges
 * differ by APMC committee and by commodity.
 *
 * PROVENANCE WARNING
 * ------------------
 * These are INDICATIVE defaults for Vidarbha APMC yards, not verified statutory
 * rates for any specific market committee, and they are labelled
 * `CONFIGURED_ESTIMATE` wherever they surface in an API response. Maharashtra
 * deregulated fruit and vegetable trade from APMC compulsion (2016 onward) and
 * who bears the commission varies by yard and by buyer, so a farmer must confirm
 * the actual deductions with their own mandi.
 *
 * To reflect a specific mandi, set the environment variables below; to model "no
 * deductions", set MARKET_APPLY_SELLING_COSTS=false and the engine reports zero
 * other-costs with that fact visible in the response.
 */

/**
 * Reads a numeric env override, falling back to the documented default.
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
const envNumber = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

/**
 * Whether statutory/market deductions are applied at all.
 * @returns {boolean}
 */
const applySellingCosts = () => process.env.MARKET_APPLY_SELLING_COSTS !== 'false';

/**
 * Current selling-cost configuration.
 *
 * commissionPercent  - arhatiya/trader commission, % of realised sale value
 * marketCessPercent  - APMC market fee / user cess, % of realised sale value
 * hamaliPerQuintal   - loading-unloading labour inside the yard, per quintal
 * weighingPerQuintal - weighing and grading charge, per quintal
 * @returns {object}
 */
const getSellingCostConfig = () => ({
  commissionPercent: envNumber('MARKET_COMMISSION_PERCENT', 4),
  marketCessPercent: envNumber('MARKET_CESS_PERCENT', 1.05),
  hamaliPerQuintal: envNumber('MARKET_HAMALI_PER_QUINTAL', 15),
  weighingPerQuintal: envNumber('MARKET_WEIGHING_PER_QUINTAL', 5),
  applied: applySellingCosts(),
  source: 'CONFIGURED_ESTIMATE',
  configVersion: 'selling_costs_v1',
  note:
    'Indicative Vidarbha APMC deductions, overridable per deployment. Not ' +
    'verified statutory rates for any one market committee.'
});

module.exports = {
  getSellingCostConfig,
  applySellingCosts
};

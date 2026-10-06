/**
 * Market module helpers.
 *
 * All rupee arithmetic for the Market page lives here so the page, the
 * comparison cards and the ledger can never disagree with each other.
 *
 * The economics model is deliberately explicit: a farmer is shown every
 * deduction, so every deduction has to come from a formula we can point at.
 */

/** Average achievable speed on Vidarbha district roads, km/h. */
const AVERAGE_ROAD_SPEED_KMPH = 35;

/** Mini-truck (Tata Ace class) freight: fixed hire + per-km running. */
const FREIGHT_BASE_FEE = 400;
const FREIGHT_PER_KM = 22.5;

/** Ambient temperature the spoilage curve was calibrated against. */
const SPOILAGE_BASELINE_TEMP_C = 33;

/**
 * Formats a number as Indian rupees, e.g. 12500 -> "₹12,500".
 * @param {number} value
 * @param {object} [options]
 * @param {boolean} [options.signed] - Prefix a "+"/"-" for deltas.
 * @returns {string}
 */
export const formatINR = (value, { signed = false } = {}) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value);
  const sign = signed && rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  const body = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(
    Math.abs(rounded)
  );
  return `${sign}₹${body}`;
};

/**
 * Formats a per-kg or per-quintal rate, e.g. 16 -> "₹16.00".
 * @param {number} value
 * @returns {string}
 */
export const formatRate = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `₹${value.toFixed(2)}`;
};

/**
 * Formats minutes as human travel time, e.g. 132 -> "2 hr 12 min".
 * @param {number} minutes
 * @returns {string}
 */
export const formatDuration = (minutes) => {
  if (!minutes || minutes < 0) return '—';
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins} min`;
  if (!mins) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
};

/**
 * Estimated one-way travel time for a district road trip.
 * @param {number} distanceKm
 * @returns {number} minutes
 */
export const estimateTravelMinutes = (distanceKm) =>
  Math.round((distanceKm / AVERAGE_ROAD_SPEED_KMPH) * 60);

/**
 * Mini-truck freight for a loaded one-way haul, rounded to the nearest ₹50
 * because that is how transporters actually quote.
 * @param {number} distanceKm
 * @returns {number} rupees
 */
export const estimateFreight = (distanceKm) => {
  const raw = FREIGHT_BASE_FEE + distanceKm * FREIGHT_PER_KM;
  return Math.round(raw / 50) * 50;
};

/**
 * Expected transit spoilage for a perishable load.
 *
 * Calibrated against observed Vidarbha tomato losses: roughly 2% at one hour
 * and 6% at 2.2 hours in 33°C ambient heat, rising linearly in between. Heat
 * above the baseline accelerates it, cooler mornings slow it down.
 *
 * @param {number} travelMinutes
 * @param {number} [ambientTempC]
 * @param {number} [perishabilityFactor] - 1.0 = tomato-class perishable.
 * @returns {number} percentage of the load lost, e.g. 2.4
 */
export const estimateSpoilagePct = (
  travelMinutes,
  ambientTempC = SPOILAGE_BASELINE_TEMP_C,
  perishabilityFactor = 1
) => {
  const hours = travelMinutes / 60;
  const base = 3.33 * hours - 1.33;
  const heatFactor = 1 + (ambientTempC - SPOILAGE_BASELINE_TEMP_C) * 0.03;
  const pct = base * Math.max(0.5, heatFactor) * perishabilityFactor;
  return Math.max(0, Math.round(pct * 10) / 10);
};

/**
 * Derives the full cash-in-hand breakdown for selling one batch at one market.
 *
 * This is the single source of truth for "net return" on the page. Any field
 * the caller supplies (a real freight quote, a real spoilage reading) wins
 * over the estimate, so live backend data flows straight through.
 *
 * @param {object} market - { pricePerQuintal, distanceKm, ...overrides }
 * @param {object} batch - { quintals, perishabilityFactor }
 * @param {object} [context] - { ambientTempC }
 * @returns {object} market enriched with the derived economics
 */
export const computeMarketEconomics = (market, batch, context = {}) => {
  const quintals = batch?.quintals ?? 0;
  const travelMinutes =
    market.travelMinutes ?? estimateTravelMinutes(market.distanceKm);
  const grossSale = quintals * market.pricePerQuintal;
  const transportCost = market.transportCost ?? estimateFreight(market.distanceKm);
  const spoilagePct =
    market.spoilagePct ??
    estimateSpoilagePct(
      travelMinutes,
      context.ambientTempC,
      batch?.perishabilityFactor
    );
  const spoilageCost = Math.round((grossSale * spoilagePct) / 100);
  const feesCost = market.feesCost ?? 0;
  const netReturn = grossSale - transportCost - spoilageCost - feesCost;

  return {
    ...market,
    travelMinutes,
    grossSale,
    transportCost,
    spoilagePct,
    spoilageCost,
    feesCost,
    netReturn,
    spoilageKg: Math.round(((batch?.quantityKg ?? 0) * spoilagePct) / 100)
  };
};

/**
 * Ranks markets by net cash in hand and flags the winner.
 * @param {Array} markets
 * @param {object} batch
 * @param {object} [context]
 * @returns {Array} sorted best-first, each with `recommended` and `deltaVsBest`
 */
export const rankMarkets = (markets, batch, context = {}) => {
  const priced = (markets || []).map((m) => computeMarketEconomics(m, batch, context));
  const sorted = [...priced].sort((a, b) => b.netReturn - a.netReturn);
  const best = sorted[0]?.netReturn ?? 0;
  return sorted.map((m, index) => ({
    ...m,
    rank: index + 1,
    recommended: index === 0,
    deltaVsBest: m.netReturn - best
  }));
};

/**
 * Cultivation breakeven for the batch against what it will actually realise.
 * @param {object} batch - { quantityKg, totalInputCost }
 * @param {number} netReturn
 * @returns {object}
 */
export const computeBreakeven = (batch, netReturn) => {
  const quantityKg = batch?.quantityKg ?? 0;
  const totalSpent = batch?.totalInputCost ?? 0;
  if (!quantityKg) return null;
  const costPerKg = totalSpent / quantityKg;
  const realizedPerKg = netReturn / quantityKg;
  const marginPerKg = realizedPerKg - costPerKg;
  return {
    totalSpent,
    costPerKg,
    costPerQuintal: costPerKg * 100,
    realizedPerKg,
    marginPerKg,
    netMargin: netReturn - totalSpent,
    roiPct: totalSpent ? ((netReturn - totalSpent) / totalSpent) * 100 : 0,
    profitable: marginPerKg > 0,
    /** Share of the realised price that is pure cost, for the split bar. */
    costSharePct: realizedPerKg > 0
      ? Math.min(100, Math.max(0, (costPerKg / realizedPerKg) * 100))
      : 100
  };
};

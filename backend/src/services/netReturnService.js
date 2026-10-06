/**
 * Net Realizable Return engine.
 *
 * The heart of AgriChain. Everything else - routing, freight rates, the price
 * model, the spoilage baseline - exists to feed this one calculation:
 *
 *   gross sale value            price x the whole load
 *   - spoilage loss value       the part that never gets sold
 *   = expected sale value       what the buyer actually pays for
 *   - transport cost            getting it there (and the truck back)
 *   - other selling costs       commission, cess, hamali, weighing
 *   = EXPECTED MONEY            what the farmer walks home with
 *
 * That last line, not the board price, is what markets are ranked by.
 *
 * PRECISION
 * ---------
 * Every intermediate value is integer paise (see utils/money). Rupees appear
 * only at the boundary. A cascade of eight float operations across a dozen
 * markets drifts, and drift here reorders the ranking - it changes which mandi a
 * farmer drives to.
 *
 * DETERMINISM
 * -----------
 * No ML, no LLM, no randomness. Same inputs, same rupees, every time. The engine
 * returns a full itemisation so every deduction shown to a farmer is traceable
 * to a number this function produced.
 */

const money = require('../utils/money');
const { getSellingCostConfig } = require('../constants/marketCosts');

/** Engine identity, recorded on stored recommendations for traceability. */
const ENGINE_VERSION = 'net_return_v1';

/**
 * Computes the statutory/market deductions on a sale.
 *
 * Percentage charges apply to the value actually realised (you are not charged
 * commission on produce that rotted), while per-quintal charges apply to the
 * quantity actually handled in the yard.
 *
 * @param {object} input
 * @param {number} input.expectedSaleValuePaise
 * @param {number} input.saleableQuantityKg
 * @param {object} [input.config] - injected config (tests)
 * @returns {object} itemised other-costs in paise and rupees
 */
const calculateSellingCosts = ({
  expectedSaleValuePaise,
  saleableQuantityKg,
  config = null
} = {}) => {
  const settings = config || getSellingCostConfig();

  if (!settings.applied) {
    return {
      totalPaise: 0,
      total: 0,
      breakdown: { commission: 0, marketCess: 0, hamali: 0, weighing: 0 },
      applied: false,
      source: settings.source,
      configVersion: settings.configVersion
    };
  }

  const saleableQuintals = (Number(saleableQuantityKg) || 0) / 100;

  const commissionPaise = money.percentOf(expectedSaleValuePaise, settings.commissionPercent);
  const cessPaise = money.percentOf(expectedSaleValuePaise, settings.marketCessPercent);
  const hamaliPaise = money.multiply(money.toPaise(settings.hamaliPerQuintal), saleableQuintals);
  const weighingPaise = money.multiply(money.toPaise(settings.weighingPerQuintal), saleableQuintals);

  const totalPaise = money.add(commissionPaise, cessPaise, hamaliPaise, weighingPaise);

  return {
    totalPaise,
    total: money.toWholeRupees(totalPaise),
    breakdown: {
      commission: money.toWholeRupees(commissionPaise),
      marketCess: money.toWholeRupees(cessPaise),
      hamali: money.toWholeRupees(hamaliPaise),
      weighing: money.toWholeRupees(weighingPaise)
    },
    rates: {
      commissionPercent: settings.commissionPercent,
      marketCessPercent: settings.marketCessPercent,
      hamaliPerQuintal: settings.hamaliPerQuintal,
      weighingPerQuintal: settings.weighingPerQuintal
    },
    applied: true,
    source: settings.source,
    configVersion: settings.configVersion,
    note: settings.note
  };
};

/**
 * Computes expected money for selling one load at one market.
 *
 * @param {object} input
 * @param {number} input.quantityKg - harvested quantity
 * @param {number|string} input.pricePerQuintal - the rate used for valuation
 * @param {number} input.spoilageLossPercent - expected % of the load lost
 * @param {number} input.transportCost - rupees, from transportCostService
 * @param {object} [input.sellingCostConfig] - injected config (tests)
 * @returns {object} full ledger, rupees at the boundary
 * @throws {Error} INVALID_QUANTITY / INVALID_PRICE for unusable inputs
 */
const calculateNetReturn = ({
  quantityKg,
  pricePerQuintal,
  spoilageLossPercent = 0,
  transportCost = 0,
  sellingCostConfig = null
} = {}) => {
  const quantity = Number(quantityKg);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const err = new Error('quantityKg must be a positive number');
    err.code = 'INVALID_QUANTITY';
    throw err;
  }

  // pricePerQuintal may arrive as a pg NUMERIC string; toPaise handles both.
  const pricePerQuintalPaise = money.toPaise(pricePerQuintal);
  if (pricePerQuintalPaise <= 0) {
    const err = new Error('pricePerQuintal must be a positive number');
    err.code = 'INVALID_PRICE';
    throw err;
  }

  const lossPercent = Math.min(100, Math.max(0, Number(spoilageLossPercent) || 0));
  const pricePerKgPaise = money.perQuintalToPerKg(pricePerQuintalPaise);

  // 1. Gross sale value - the whole load, valued at the mandi rate.
  const grossSalePaise = money.multiply(pricePerKgPaise, quantity);

  // 2. Expected spoilage loss, in produce and in rupees.
  const lossQuantityKg = Math.round(((quantity * lossPercent) / 100) * 10) / 10;
  const spoilageLossPaise = money.multiply(pricePerKgPaise, lossQuantityKg);

  // 3. Saleable quantity.
  const saleableQuantityKg = Math.round((quantity - lossQuantityKg) * 10) / 10;

  // 4. Expected sale value: what the buyer actually pays for.
  const expectedSaleValuePaise = money.multiply(pricePerKgPaise, saleableQuantityKg);

  // 5. Transport cost.
  const transportPaise = money.toPaise(transportCost);

  // 6. Other selling costs.
  const sellingCosts = calculateSellingCosts({
    expectedSaleValuePaise,
    saleableQuantityKg,
    config: sellingCostConfig
  });

  // 7. Expected money - the ranking key.
  const expectedMoneyPaise = money.subtract(
    expectedSaleValuePaise,
    transportPaise,
    sellingCosts.totalPaise
  );

  const totalDeductionsPaise = money.add(
    spoilageLossPaise,
    transportPaise,
    sellingCosts.totalPaise
  );

  return {
    // --- inputs, echoed so a stored ledger is self-describing ---
    quantityKg: quantity,
    pricePerQuintal: money.toRupees(pricePerQuintalPaise),
    pricePerKg: money.toRupees(pricePerKgPaise),
    spoilageLossPercent: lossPercent,

    // --- the waterfall, in rupees ---
    grossSaleValue: money.toWholeRupees(grossSalePaise),
    spoilageLossValue: money.toWholeRupees(spoilageLossPaise),
    estimatedLossKg: lossQuantityKg,
    saleableQuantityKg,
    expectedSaleValue: money.toWholeRupees(expectedSaleValuePaise),
    transportCost: money.toWholeRupees(transportPaise),
    otherCosts: sellingCosts.total,
    otherCostsBreakdown: sellingCosts.breakdown,
    sellingCostRates: sellingCosts.rates || null,
    sellingCostsApplied: sellingCosts.applied,
    sellingCostSource: sellingCosts.source,
    totalDeductions: money.toWholeRupees(totalDeductionsPaise),

    // --- the answer ---
    expectedMoney: money.toWholeRupees(expectedMoneyPaise),
    /** Realised rupees per kg harvested - comparable against cost per kg. */
    realizedPricePerKg: money.toRupees(Math.round(expectedMoneyPaise / quantity)),
    /**
     * Share of the gross sale value the farmer keeps. Makes the "high price,
     * low take-home" case legible at a glance.
     */
    retentionPercent: grossSalePaise > 0
      ? Math.round((expectedMoneyPaise / grossSalePaise) * 1000) / 10
      : 0,

    // --- exact paise, for any downstream arithmetic ---
    paise: {
      grossSale: grossSalePaise,
      spoilageLoss: spoilageLossPaise,
      expectedSaleValue: expectedSaleValuePaise,
      transport: transportPaise,
      otherCosts: sellingCosts.totalPaise,
      expectedMoney: expectedMoneyPaise
    },

    engine: 'DETERMINISTIC',
    engineVersion: ENGINE_VERSION
  };
};

/**
 * Breakeven and profit against what the farmer actually spent growing the crop.
 *
 * Returns available:false when production cost is unknown. A profit figure
 * derived from a guessed input cost would be worse than no figure at all, so
 * none is produced - the API reports productionCostAvailable: false instead.
 *
 * @param {object} input
 * @param {number} input.quantityKg
 * @param {number|null} [input.productionCost] - total rupees spent on the crop
 * @param {number} input.expectedMoney - from calculateNetReturn
 * @returns {object}
 */
const calculateBreakeven = ({ quantityKg, productionCost, expectedMoney } = {}) => {
  const quantity = Number(quantityKg);
  const cost = Number(productionCost);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      available: false,
      reason: 'INVALID_QUANTITY',
      message: 'Quantity is required to compute a break-even price.'
    };
  }

  if (!Number.isFinite(cost) || cost <= 0) {
    return {
      available: false,
      reason: 'PRODUCTION_COST_MISSING',
      message:
        'Enter what you spent growing this crop (seed, fertiliser, labour, ' +
        'irrigation) to see break-even and profit.'
    };
  }

  const costPaise = money.toPaise(cost);
  const expectedMoneyPaise = money.toPaise(expectedMoney);

  // Break-even is per kg HARVESTED: that is the quantity the money was spent on.
  const breakEvenPerKgPaise = Math.round(costPaise / quantity);
  const profitPaise = money.subtract(expectedMoneyPaise, costPaise);

  return {
    available: true,
    productionCost: money.toWholeRupees(costPaise),
    quantityKg: quantity,
    breakEvenPricePerKg: money.toRupees(breakEvenPerKgPaise),
    breakEvenPricePerQuintal: money.toRupees(breakEvenPerKgPaise * 100),
    expectedProfit: money.toWholeRupees(profitPaise),
    profitable: profitPaise > 0,
    roiPercent: costPaise > 0
      ? Math.round((profitPaise / costPaise) * 1000) / 10
      : 0,
    costPerKg: money.toRupees(breakEvenPerKgPaise),
    engineVersion: ENGINE_VERSION
  };
};

module.exports = {
  calculateNetReturn,
  calculateBreakeven,
  calculateSellingCosts,
  ENGINE_VERSION
};

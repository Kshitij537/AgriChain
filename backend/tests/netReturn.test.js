/**
 * Net Realizable Return engine tests.
 *
 * The most important suite in the project: these assert the arithmetic that
 * decides which mandi a farmer drives to.
 *
 * Selling-cost configuration is injected everywhere so the tests assert the
 * formula, not the currently configured commission rates.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const netReturn = require('../src/services/netReturnService');

/** No market deductions: isolates the gross/spoilage/transport waterfall. */
const NO_COSTS = {
  applied: false,
  source: 'TEST',
  configVersion: 'test_v1'
};

/** A simple 4% commission and nothing else, for exact hand-checkable numbers. */
const COMMISSION_ONLY = {
  applied: true,
  commissionPercent: 4,
  marketCessPercent: 0,
  hamaliPerQuintal: 0,
  weighingPerQuintal: 0,
  source: 'TEST',
  configVersion: 'test_v1'
};

test('netReturn: the full waterfall with no market deductions', () => {
  const result = netReturn.calculateNetReturn({
    quantityKg: 500,
    pricePerQuintal: 3000,       // = ₹30/kg
    spoilageLossPercent: 10,
    transportCost: 1000,
    sellingCostConfig: NO_COSTS
  });

  assert.equal(result.grossSaleValue, 15000);      // 500 kg x ₹30
  assert.equal(result.estimatedLossKg, 50);        // 10% of 500
  assert.equal(result.spoilageLossValue, 1500);    // 50 kg x ₹30
  assert.equal(result.saleableQuantityKg, 450);
  assert.equal(result.expectedSaleValue, 13500);   // 450 kg x ₹30
  assert.equal(result.transportCost, 1000);
  assert.equal(result.otherCosts, 0);
  assert.equal(result.expectedMoney, 12500);       // 13500 - 1000
  assert.equal(result.totalDeductions, 2500);      // 1500 spoilage + 1000 freight
});

test('netReturn: gross minus every deduction equals expected money', () => {
  // The identity the whole product rests on:
  //   gross - spoilage - transport - other = expected money
  const result = netReturn.calculateNetReturn({
    quantityKg: 780,
    pricePerQuintal: 2345,
    spoilageLossPercent: 7.3,
    transportCost: 1675,
    sellingCostConfig: COMMISSION_ONLY
  });

  const reconstructed =
    result.grossSaleValue
    - result.spoilageLossValue
    - result.transportCost
    - result.otherCosts;

  // Within ₹1: the itemised lines are rounded to whole rupees for display.
  assert.ok(
    Math.abs(reconstructed - result.expectedMoney) <= 1,
    `waterfall must reconcile: ${reconstructed} vs ${result.expectedMoney}`
  );
});

test('netReturn: commission applies to the realised sale, not the spoiled load', () => {
  const result = netReturn.calculateNetReturn({
    quantityKg: 500,
    pricePerQuintal: 3000,
    spoilageLossPercent: 10,
    transportCost: 0,
    sellingCostConfig: COMMISSION_ONLY
  });
  // 4% of the ₹13,500 actually sold, not of the ₹15,000 gross.
  assert.equal(result.otherCostsBreakdown.commission, 540);
  assert.notEqual(result.otherCostsBreakdown.commission, 600);
});

test('netReturn: zero spoilage leaves the whole load saleable', () => {
  const result = netReturn.calculateNetReturn({
    quantityKg: 500,
    pricePerQuintal: 3000,
    spoilageLossPercent: 0,
    transportCost: 800,
    sellingCostConfig: NO_COSTS
  });
  assert.equal(result.estimatedLossKg, 0);
  assert.equal(result.spoilageLossValue, 0);
  assert.equal(result.saleableQuantityKg, 500);
  assert.equal(result.expectedMoney, 14200);
});

test('netReturn: total spoilage leaves nothing but still costs the freight', () => {
  // The honest worst case: the trip was made and paid for, and nothing sold.
  const result = netReturn.calculateNetReturn({
    quantityKg: 500,
    pricePerQuintal: 3000,
    spoilageLossPercent: 100,
    transportCost: 800,
    sellingCostConfig: NO_COSTS
  });
  assert.equal(result.saleableQuantityKg, 0);
  assert.equal(result.expectedSaleValue, 0);
  assert.equal(result.expectedMoney, -800);
});

test('netReturn: expected money can be negative and is not clamped', () => {
  const result = netReturn.calculateNetReturn({
    quantityKg: 100,
    pricePerQuintal: 1000,       // ₹1,000 gross
    spoilageLossPercent: 20,
    transportCost: 2500,         // freight exceeds the sale
    sellingCostConfig: NO_COSTS
  });
  assert.ok(result.expectedMoney < 0, 'a loss-making trip must report a loss');
  assert.equal(result.expectedMoney, -1700); // 800 - 2500
});

test('netReturn: a fractional spoilage percentage is not rounded away', () => {
  // 8.5% must not be treated as 9%: on this load that is a ₹70 difference.
  const precise = netReturn.calculateNetReturn({
    quantityKg: 500, pricePerQuintal: 3200, spoilageLossPercent: 8.5,
    transportCost: 0, sellingCostConfig: NO_COSTS
  });
  const rounded = netReturn.calculateNetReturn({
    quantityKg: 500, pricePerQuintal: 3200, spoilageLossPercent: 9,
    transportCost: 0, sellingCostConfig: NO_COSTS
  });
  assert.equal(precise.estimatedLossKg, 42.5);
  assert.equal(precise.spoilageLossValue, 1360);
  assert.notEqual(precise.expectedMoney, rounded.expectedMoney);
  assert.equal(precise.expectedMoney - rounded.expectedMoney, 80);
});

test('netReturn: a pg NUMERIC price string is handled without float damage', () => {
  const result = netReturn.calculateNetReturn({
    quantityKg: 500,
    pricePerQuintal: '2800.00',
    spoilageLossPercent: 3,
    transportCost: '1200',
    sellingCostConfig: NO_COSTS
  });
  assert.equal(result.grossSaleValue, 14000);
  assert.equal(result.expectedMoney, 12380); // 13580 - 1200
});

test('netReturn: retention percent exposes the high-price low-take-home case', () => {
  const nearby = netReturn.calculateNetReturn({
    quantityKg: 500, pricePerQuintal: 3000, spoilageLossPercent: 3,
    transportCost: 800, sellingCostConfig: NO_COSTS
  });
  const distant = netReturn.calculateNetReturn({
    quantityKg: 500, pricePerQuintal: 3200, spoilageLossPercent: 8,
    transportCost: 2000, sellingCostConfig: NO_COSTS
  });
  assert.ok(
    nearby.retentionPercent > distant.retentionPercent,
    'the nearer market must retain a larger share of gross'
  );
});

test('netReturn: invalid quantity is rejected', () => {
  for (const quantityKg of [0, -5, null, undefined, 'abc', NaN]) {
    assert.throws(
      () => netReturn.calculateNetReturn({ quantityKg, pricePerQuintal: 3000 }),
      (error) => error.code === 'INVALID_QUANTITY',
      `quantityKg=${quantityKg} must be rejected`
    );
  }
});

test('netReturn: invalid price is rejected', () => {
  for (const pricePerQuintal of [0, -100, null, undefined, 'abc']) {
    assert.throws(
      () => netReturn.calculateNetReturn({ quantityKg: 500, pricePerQuintal }),
      (error) => error.code === 'INVALID_PRICE',
      `pricePerQuintal=${pricePerQuintal} must be rejected`
    );
  }
});

test('netReturn: a spoilage percentage outside 0-100 is clamped', () => {
  const over = netReturn.calculateNetReturn({
    quantityKg: 500, pricePerQuintal: 3000, spoilageLossPercent: 150,
    transportCost: 0, sellingCostConfig: NO_COSTS
  });
  assert.equal(over.spoilageLossPercent, 100);
  assert.equal(over.saleableQuantityKg, 0);

  const under = netReturn.calculateNetReturn({
    quantityKg: 500, pricePerQuintal: 3000, spoilageLossPercent: -10,
    transportCost: 0, sellingCostConfig: NO_COSTS
  });
  assert.equal(under.spoilageLossPercent, 0);
  assert.equal(under.saleableQuantityKg, 500);
});

test('netReturn: the engine declares itself deterministic', () => {
  const result = netReturn.calculateNetReturn({
    quantityKg: 500, pricePerQuintal: 3000, sellingCostConfig: NO_COSTS
  });
  assert.equal(result.engine, 'DETERMINISTIC');
  assert.equal(result.engineVersion, netReturn.ENGINE_VERSION);
});

// ---------------------------------------------------------------------------
// Breakeven
// ---------------------------------------------------------------------------

test('breakeven: break-even price and profit from production cost', () => {
  const result = netReturn.calculateBreakeven({
    quantityKg: 500,
    productionCost: 8000,
    expectedMoney: 12500
  });
  assert.equal(result.available, true);
  assert.equal(result.breakEvenPricePerKg, 16);       // 8000 / 500
  assert.equal(result.breakEvenPricePerQuintal, 1600);
  assert.equal(result.expectedProfit, 4500);          // 12500 - 8000
  assert.equal(result.profitable, true);
  assert.equal(result.roiPercent, 56.3);
});

test('breakeven: a loss is reported as a loss', () => {
  const result = netReturn.calculateBreakeven({
    quantityKg: 500,
    productionCost: 16000,
    expectedMoney: 12500
  });
  assert.equal(result.profitable, false);
  assert.equal(result.expectedProfit, -3500);
  assert.ok(result.roiPercent < 0);
});

test('breakeven: no profit figure is invented when production cost is missing', () => {
  // The rule from the brief: never present expected profit without a real cost.
  for (const productionCost of [null, undefined, 0, '']) {
    const result = netReturn.calculateBreakeven({
      quantityKg: 500, productionCost, expectedMoney: 12500
    });
    assert.equal(result.available, false, `productionCost=${productionCost}`);
    assert.equal(result.reason, 'PRODUCTION_COST_MISSING');
    assert.equal(result.expectedProfit, undefined);
    assert.equal(result.breakEvenPricePerKg, undefined);
  }
});

test('breakeven: invalid quantity is reported, not thrown', () => {
  const result = netReturn.calculateBreakeven({
    quantityKg: 0, productionCost: 8000, expectedMoney: 12500
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'INVALID_QUANTITY');
});

// ---------------------------------------------------------------------------
// Selling costs
// ---------------------------------------------------------------------------

test('sellingCosts: every component is itemised', () => {
  const result = netReturn.calculateSellingCosts({
    expectedSaleValuePaise: 1000000, // ₹10,000
    saleableQuantityKg: 500,
    config: {
      applied: true,
      commissionPercent: 4,
      marketCessPercent: 1,
      hamaliPerQuintal: 15,
      weighingPerQuintal: 5,
      source: 'TEST',
      configVersion: 'test_v1'
    }
  });
  assert.equal(result.breakdown.commission, 400);  // 4% of 10000
  assert.equal(result.breakdown.marketCess, 100);  // 1% of 10000
  assert.equal(result.breakdown.hamali, 75);       // ₹15 x 5 quintals
  assert.equal(result.breakdown.weighing, 25);     // ₹5 x 5 quintals
  assert.equal(result.total, 600);
});

test('sellingCosts: deductions can be switched off entirely', () => {
  const result = netReturn.calculateSellingCosts({
    expectedSaleValuePaise: 1000000,
    saleableQuantityKg: 500,
    config: NO_COSTS
  });
  assert.equal(result.total, 0);
  assert.equal(result.applied, false);
});

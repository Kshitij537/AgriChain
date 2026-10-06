/**
 * Market ranking tests.
 *
 * The product's central claim is that the ranking is by EXPECTED MONEY, not by
 * price, distance or spoilage. These tests are written so that they fail if
 * anyone ever "simplifies" the ranking back to highest price.
 *
 * rankMarkets is pure - it sorts already-evaluated market rows - so no database,
 * routing or ML service is involved.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const marketService = require('../src/services/marketService');
const netReturn = require('../src/services/netReturnService');

const NO_COSTS = { applied: false, source: 'TEST', configVersion: 'test_v1' };

/**
 * Builds an evaluated market row the way marketService.evaluateMarket would,
 * with the money computed by the real engine rather than by hand.
 *
 * @param {object} spec - { id, name, pricePerQuintal, distanceKm, spoilagePercent,
 *   transportCost, quantityKg }
 * @returns {object}
 */
const makeMarket = ({
  id,
  name,
  pricePerQuintal,
  distanceKm,
  spoilagePercent,
  transportCost,
  quantityKg = 500
}) => {
  const ledger = netReturn.calculateNetReturn({
    quantityKg,
    pricePerQuintal,
    spoilageLossPercent: spoilagePercent,
    transportCost,
    sellingCostConfig: NO_COSTS
  });

  return {
    marketId: id,
    marketName: name,
    district: 'Test',
    evaluated: true,
    currentPrice: pricePerQuintal,
    distanceKm,
    travelTimeMinutes: Math.round((distanceKm / 35) * 60),
    transportCost,
    estimatedLossPercent: spoilagePercent,
    estimatedLossKg: ledger.estimatedLossKg,
    estimatedLossValue: ledger.spoilageLossValue,
    saleableQuantityKg: ledger.saleableQuantityKg,
    grossSaleValue: ledger.grossSaleValue,
    expectedSaleValue: ledger.expectedSaleValue,
    otherCosts: ledger.otherCosts,
    expectedMoney: ledger.expectedMoney,
    spoilageRisk: spoilagePercent > 15 ? 'high' : spoilagePercent > 5 ? 'moderate' : 'low',
    safeDays: 2
  };
};

test('ranking: THE CORE CASE - the lower-priced nearer mandi wins', () => {
  // The exact scenario from the project brief.
  // Market A: ₹3,200/qtl, 100 km, ₹2,000 freight, high spoilage
  // Market B: ₹3,000/qtl,  35 km,   ₹800 freight, low spoilage
  const marketA = makeMarket({
    id: 1, name: 'Market A (far, high price)',
    pricePerQuintal: 3200, distanceKm: 100, spoilagePercent: 8, transportCost: 2000
  });
  const marketB = makeMarket({
    id: 2, name: 'Market B (near, lower price)',
    pricePerQuintal: 3000, distanceKm: 35, spoilagePercent: 3, transportCost: 800
  });

  // Deliberately pass A first, so a "return input order" bug cannot pass.
  const ranked = marketService.rankMarkets([marketA, marketB]);

  assert.equal(ranked[0].marketId, 2, 'Market B must rank first');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].recommended, true);
  assert.equal(ranked[1].marketId, 1);
  assert.equal(ranked[1].recommended, false);

  // And the reason it won must be true: it pays less per quintal.
  assert.ok(
    ranked[0].currentPrice < ranked[1].currentPrice,
    'the winner must be the CHEAPER market, which is the whole point'
  );
  assert.ok(ranked[0].expectedMoney > ranked[1].expectedMoney);
});

test('ranking: the highest-price market is flagged when it does not win', () => {
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'Far', pricePerQuintal: 3200, distanceKm: 100, spoilagePercent: 8, transportCost: 2000 }),
    makeMarket({ id: 2, name: 'Near', pricePerQuintal: 3000, distanceKm: 35, spoilagePercent: 3, transportCost: 800 })
  ]);

  const loser = ranked.find((m) => m.marketId === 1);
  assert.equal(loser.isHighestPriceButNotBest, true);
  assert.equal(ranked[0].isHighestPriceButNotBest, false);
});

test('ranking: NOT by price', () => {
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'Highest price', pricePerQuintal: 4000, distanceKm: 200, spoilagePercent: 20, transportCost: 5000 }),
    makeMarket({ id: 2, name: 'Middle', pricePerQuintal: 3000, distanceKm: 40, spoilagePercent: 4, transportCost: 900 }),
    makeMarket({ id: 3, name: 'Lowest price', pricePerQuintal: 2800, distanceKm: 20, spoilagePercent: 2, transportCost: 600 })
  ]);
  assert.notEqual(ranked[0].currentPrice, 4000, 'must not simply pick the highest price');
});

test('ranking: NOT by distance', () => {
  // The nearest market pays so little that a slightly further one wins.
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'Nearest but cheap', pricePerQuintal: 1500, distanceKm: 10, spoilagePercent: 1, transportCost: 500 }),
    makeMarket({ id: 2, name: 'Further but good', pricePerQuintal: 3000, distanceKm: 45, spoilagePercent: 3, transportCost: 1100 })
  ]);
  assert.equal(ranked[0].marketId, 2, 'must not simply pick the nearest market');
});

test('ranking: NOT by lowest spoilage', () => {
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'Zero spoilage, terrible price', pricePerQuintal: 1200, distanceKm: 15, spoilagePercent: 0, transportCost: 500 }),
    makeMarket({ id: 2, name: 'Some spoilage, good price', pricePerQuintal: 3000, distanceKm: 50, spoilagePercent: 6, transportCost: 1200 })
  ]);
  assert.equal(ranked[0].marketId, 2, 'must not simply pick the lowest spoilage');
});

test('ranking: ordered strictly by expected money, descending', () => {
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'A', pricePerQuintal: 2900, distanceKm: 60, spoilagePercent: 5, transportCost: 1500 }),
    makeMarket({ id: 2, name: 'B', pricePerQuintal: 3100, distanceKm: 90, spoilagePercent: 7, transportCost: 2100 }),
    makeMarket({ id: 3, name: 'C', pricePerQuintal: 2800, distanceKm: 25, spoilagePercent: 2, transportCost: 700 }),
    makeMarket({ id: 4, name: 'D', pricePerQuintal: 3300, distanceKm: 140, spoilagePercent: 12, transportCost: 3200 })
  ]);

  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(
      ranked[i - 1].expectedMoney >= ranked[i].expectedMoney,
      `rank ${i} must not out-earn rank ${i - 1}`
    );
    assert.equal(ranked[i].rank, i + 1);
  }
});

test('ranking: deltaVsBest quantifies the cost of the wrong choice', () => {
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'Far', pricePerQuintal: 3200, distanceKm: 100, spoilagePercent: 8, transportCost: 2000 }),
    makeMarket({ id: 2, name: 'Near', pricePerQuintal: 3000, distanceKm: 35, spoilagePercent: 3, transportCost: 800 })
  ]);
  assert.equal(ranked[0].deltaVsBest, 0, 'the winner loses nothing versus itself');
  assert.ok(ranked[1].deltaVsBest < 0, 'every other market must show a negative delta');
  assert.equal(ranked[1].deltaVsBest, ranked[1].expectedMoney - ranked[0].expectedMoney);
});

test('ranking: a tie breaks toward the nearer market', () => {
  // Same expected money, different distance: the shorter trip is less risk.
  const near = makeMarket({ id: 1, name: 'Near', pricePerQuintal: 3000, distanceKm: 30, spoilagePercent: 4, transportCost: 1000 });
  const far = { ...near, marketId: 2, marketName: 'Far', distanceKm: 90 };

  const ranked = marketService.rankMarkets([far, near]);
  assert.equal(ranked[0].expectedMoney, ranked[1].expectedMoney, 'precondition: a genuine tie');
  assert.equal(ranked[0].marketId, 1, 'the nearer market must win a tie');
});

test('ranking: unevaluable markets are kept but never ranked', () => {
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'Good', pricePerQuintal: 3000, distanceKm: 35, spoilagePercent: 3, transportCost: 800 }),
    { marketId: 9, marketName: 'Unroutable', evaluated: false, unavailableReason: 'ROUTING_FAILED' }
  ]);

  assert.equal(ranked.length, 2, 'the failed market must still be reported');
  assert.equal(ranked[0].rank, 1);

  const failed = ranked.find((m) => m.marketId === 9);
  assert.equal(failed.rank, null);
  assert.equal(failed.recommended, false);
  assert.equal(failed.unavailableReason, 'ROUTING_FAILED');
});

test('ranking: an empty list does not throw', () => {
  assert.deepEqual(marketService.rankMarkets([]), []);
});

test('ranking: a single market is the winner', () => {
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'Only', pricePerQuintal: 3000, distanceKm: 35, spoilagePercent: 3, transportCost: 800 })
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].recommended, true);
  assert.equal(ranked[0].deltaVsBest, 0);
});

test('ranking: the ranking is stable across repeated calls', () => {
  const markets = [
    makeMarket({ id: 1, name: 'A', pricePerQuintal: 2900, distanceKm: 60, spoilagePercent: 5, transportCost: 1500 }),
    makeMarket({ id: 2, name: 'B', pricePerQuintal: 3100, distanceKm: 90, spoilagePercent: 7, transportCost: 2100 }),
    makeMarket({ id: 3, name: 'C', pricePerQuintal: 2800, distanceKm: 25, spoilagePercent: 2, transportCost: 700 })
  ];
  const first = marketService.rankMarkets(markets).map((m) => m.marketId);
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(marketService.rankMarkets(markets).map((m) => m.marketId), first);
  }
});

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

test('explanation: names the specific trade-off that decided it', () => {
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'Wardha Mandi', pricePerQuintal: 3200, distanceKm: 100, spoilagePercent: 8, transportCost: 2000 }),
    makeMarket({ id: 2, name: 'Nagpur Mandi', pricePerQuintal: 3000, distanceKm: 35, spoilagePercent: 3, transportCost: 800 })
  ]);
  const highestPrice = ranked.reduce((b, m) => (!b || m.currentPrice > b.currentPrice ? m : b), null);
  const reason = marketService.buildRecommendationReason(ranked[0], ranked[1], highestPrice);

  assert.match(reason, /Wardha Mandi/, 'must name the market that looked better');
  assert.match(reason, /Nagpur Mandi/, 'must name the winner');
  assert.match(reason, /more/, 'must explain what the extra distance costs');
  assert.match(reason, /₹/, 'must be denominated in rupees');
});

test('explanation: handles the single-market case without inventing a comparison', () => {
  const ranked = marketService.rankMarkets([
    makeMarket({ id: 1, name: 'Only Mandi', pricePerQuintal: 3000, distanceKm: 35, spoilagePercent: 3, transportCost: 800 })
  ]);
  const reason = marketService.buildRecommendationReason(ranked[0], null, ranked[0]);
  assert.match(reason, /only market/i);
});

test('explanation: no winner yields no claim', () => {
  const reason = marketService.buildRecommendationReason(null, null, null);
  assert.match(reason, /No market could be evaluated/);
});

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

test('confidence: clean inputs give high confidence with no caveats', () => {
  const winner = {
    freshness: 'FRESH', priceAgeInDays: 0, pricePredictionAvailable: true
  };
  const result = marketService.assessConfidence({
    winner, ambient: { available: true }, usedDemoData: false, routeDegraded: false
  });
  assert.equal(result.level, 'high');
  assert.deepEqual(result.factors, []);
});

test('confidence: demo data is always disclosed', () => {
  const result = marketService.assessConfidence({
    winner: { freshness: 'FRESH', priceAgeInDays: 0, pricePredictionAvailable: true },
    ambient: { available: true }, usedDemoData: true, routeDegraded: false
  });
  assert.notEqual(result.level, 'high');
  assert.ok(
    result.factors.some((f) => /DEMO_SEED|demonstration/i.test(f)),
    'demo data must be named in the confidence factors'
  );
});

test('confidence: stacked degradations drive confidence to low', () => {
  const result = marketService.assessConfidence({
    winner: { freshness: 'STALE', priceAgeInDays: 21, pricePredictionAvailable: false },
    ambient: { available: false }, usedDemoData: true, routeDegraded: true
  });
  assert.equal(result.level, 'low');
  assert.ok(result.factors.length >= 4);
});

test('confidence: no winner means no confidence', () => {
  const result = marketService.assessConfidence({
    winner: null, ambient: { available: true }, usedDemoData: false, routeDegraded: false
  });
  assert.equal(result.level, 'none');
});

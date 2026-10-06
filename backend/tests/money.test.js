/**
 * Money arithmetic tests.
 *
 * These guard the foundation: if paise arithmetic drifts, every rupee figure a
 * farmer sees drifts with it, and the market ranking can silently reorder.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const money = require('../src/utils/money');

test('money: rupees convert to integer paise', () => {
  assert.equal(money.toPaise(1), 100);
  assert.equal(money.toPaise(28.5), 2850);
  assert.equal(money.toPaise(0.01), 1);
});

test('money: accepts pg NUMERIC strings without float damage', () => {
  // node-postgres returns NUMERIC as a string precisely to avoid float loss.
  assert.equal(money.toPaise('2800.00'), 280000);
  assert.equal(money.toPaise('1823.50'), 182350);
});

test('money: null, undefined and empty are zero, not NaN', () => {
  assert.equal(money.toPaise(null), 0);
  assert.equal(money.toPaise(undefined), 0);
  assert.equal(money.toPaise(''), 0);
  assert.equal(money.toPaise('not a number'), 0);
});

test('money: the classic float failure does not occur', () => {
  // 0.1 + 0.2 !== 0.3 in binary floating point. In paise it is exact.
  const sum = money.add(money.toPaise(0.1), money.toPaise(0.2));
  assert.equal(sum, 30);
  assert.equal(money.toRupees(sum), 0.3);
});

test('money: repeated additions do not accumulate error', () => {
  // 100 additions of 0.07 is 7.00 exactly. In floats this drifts.
  let total = 0;
  for (let i = 0; i < 100; i += 1) total = money.add(total, money.toPaise(0.07));
  assert.equal(money.toRupees(total), 7);
});

test('money: subtract chains from the base', () => {
  const result = money.subtract(money.toPaise(1000), money.toPaise(250), money.toPaise(100));
  assert.equal(money.toRupees(result), 650);
});

test('money: subtract can go negative (a loss-making market is valid)', () => {
  const result = money.subtract(money.toPaise(100), money.toPaise(500));
  assert.equal(money.toRupees(result), -400);
});

test('money: multiply by a fractional quantity rounds to whole paise', () => {
  // 28 rupees/kg x 493.5 kg
  assert.equal(money.toRupees(money.multiply(money.toPaise(28), 493.5)), 13818);
});

test('money: percentOf computes a share', () => {
  assert.equal(money.toRupees(money.percentOf(money.toPaise(10000), 4)), 400);
  assert.equal(money.toRupees(money.percentOf(money.toPaise(14550), 1.05)), 152.78);
});

test('money: percentOf handles a fractional percentage exactly', () => {
  // 8.5% of 16000 is 1360 - the spoilage case from the brief.
  assert.equal(money.toRupees(money.percentOf(money.toPaise(16000), 8.5)), 1360);
});

test('money: per-quintal converts to per-kg (1 quintal = 100 kg)', () => {
  assert.equal(money.toRupees(money.perQuintalToPerKg(money.toPaise(2800))), 28);
  assert.equal(money.toRupees(money.perQuintalToPerKg(money.toPaise(1823))), 18.23);
});

test('money: toWholeRupees rounds for display', () => {
  assert.equal(money.toWholeRupees(182350), 1824);
  assert.equal(money.toWholeRupees(182349), 1823);
});

test('money: format renders Indian digit grouping', () => {
  assert.equal(money.format(money.toPaise(1250000)), '₹12,50,000');
  assert.equal(money.format(money.toPaise(-500)), '-₹500');
});

test('money: non-finite inputs never produce NaN output', () => {
  assert.equal(money.toRupees(NaN), 0);
  assert.equal(money.multiply(NaN, 5), 0);
  assert.equal(money.multiply(100, Infinity), 0);
  assert.equal(money.percentOf(100, NaN), 0);
});

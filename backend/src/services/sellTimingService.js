/**
 * Sell-now vs wait decision engine.
 *
 * Answers the second half of the farmer's question: not just *where* to sell,
 * but *when*. Rule-based and deterministic in V1 - deliberately.
 *
 * HOW THE DECISION IS MADE
 * ------------------------
 * Waiting is only worth it if the extra rupees from a higher price outweigh the
 * extra produce lost to rot in the meantime. So rather than reasoning about
 * "trend" in the abstract, this engine prices both branches with the same
 * Net Realizable Return engine used for the ranking:
 *
 *   sell today  -> expected money at today's price, at today's spoilage
 *   hold N days -> expected money at the forecast price, at the spoilage the
 *                  load will have accumulated by then
 *
 * The difference is the real cost or benefit of waiting, in rupees. A ₹120/qtl
 * forecast rise on 500 kg is ₹600; if three more days in 33 C heat destroys
 * ₹1,400 of tomatoes, waiting loses money, and the engine says so.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It never recommends waiting without a model forecast to justify it, and it
 * never promises a price. The output is a recommendation with its reasoning and
 * the numbers behind it, so a farmer can disagree with it knowingly.
 */

const spoilageService = require('./spoilageService');
const netReturnService = require('./netReturnService');

const ENGINE_VERSION = 'sell_timing_v1';

const DECISION = {
  SELL_NOW: 'SELL_NOW',
  SELL_SOON: 'SELL_SOON',
  WAIT: 'WAIT'
};

/**
 * Waiting must beat selling now by BOTH a minimum rupee amount and a minimum
 * share of the sale, or it is not worth the risk of a forecast being wrong.
 * A ₹40 edge on a ₹13,000 sale is noise, not a reason to hold a perishable crop.
 */
const minGainRupees = () => {
  const value = Number(process.env.SELL_WAIT_MIN_GAIN_RUPEES);
  return Number.isFinite(value) && value >= 0 ? value : 250;
};

const minGainPercent = () => {
  const value = Number(process.env.SELL_WAIT_MIN_GAIN_PERCENT);
  return Number.isFinite(value) && value >= 0 ? value : 2;
};

/**
 * Decides whether to sell now or hold, for the winning market.
 *
 * @param {object} input
 * @param {object} input.market - the ranked winner, as built by marketService
 * @param {object} input.prediction - pricePredictionService result
 * @param {object} input.spoilageInput - the shared assessSpoilageRisk input
 *   (cropType, quantityKg, harvestDate, storageType, temperatureC, humidity)
 * @param {number} input.quantityKg
 * @returns {object} { decision, reason, recommendedWindow, ... }
 */
const decideSellTiming = ({ market, prediction, spoilageInput, quantityKg } = {}) => {
  if (!market) {
    return {
      decision: DECISION.SELL_SOON,
      reason: 'No market could be evaluated, so no timing advice is possible.',
      recommendedWindow: null,
      confidence: 'low',
      priceForecastAvailable: false,
      engine: 'RULE_BASED',
      engineVersion: ENGINE_VERSION
    };
  }

  const safeDays = Number.isFinite(market.safeDays) ? market.safeDays : 0;
  const riskLevel = market.spoilageRisk || 'moderate';
  const holdDays = prediction && prediction.available ? prediction.horizonDays : 0;

  // --- Branch 1: the crop cannot safely wait -------------------------------
  // Spoilage overrides any forecast. A price that rises after the produce has
  // rotted is worth nothing.
  if (riskLevel === 'high' || safeDays < 1) {
    return {
      decision: DECISION.SELL_NOW,
      reason:
        `This ${spoilageInput?.cropType || 'crop'} is already close to the end of its safe ` +
        `selling window (${safeDays} day${safeDays === 1 ? '' : 's'} left at ` +
        `${market.spoilageRisk} spoilage risk). Move it to ${market.marketName} today - ` +
        'any price gain from waiting would be wiped out by further loss.',
      recommendedWindow: 'Today',
      recommendedWindowDays: { from: 0, to: 1 },
      confidence: 'high',
      basis: 'SPOILAGE_CONSTRAINT',
      priceForecastAvailable: Boolean(prediction && prediction.available),
      holdComparison: null,
      engine: 'RULE_BASED',
      engineVersion: ENGINE_VERSION
    };
  }

  // --- Branch 2: no forecast, so no case for waiting -----------------------
  if (!prediction || !prediction.available) {
    return {
      decision: DECISION.SELL_SOON,
      reason:
        'No price forecast is available for this market right now, so there is no ' +
        `evidence that waiting would pay. With ${safeDays} day` +
        `${safeDays === 1 ? '' : 's'} of safe selling time left, sell within the next ` +
        'day or two at the current rate.',
      recommendedWindow: '1-2 days',
      recommendedWindowDays: { from: 1, to: 2 },
      confidence: 'low',
      basis: 'NO_FORECAST',
      priceForecastAvailable: false,
      unavailableReason: prediction ? prediction.reason : 'PREDICTION_NOT_REQUESTED',
      holdComparison: null,
      engine: 'RULE_BASED',
      engineVersion: ENGINE_VERSION
    };
  }

  // --- Branch 3: price both branches and compare ---------------------------
  //
  // BOTH branches are computed here, by the same engine, from the same inputs.
  // Comparing a locally computed hold value against the caller's precomputed
  // expectedMoney would risk mixing two bases - a different selling-cost config,
  // a different rounding path - and a mixed-basis subtraction produces a
  // difference that is not the cost of waiting at all. The only thing that may
  // differ between the two branches is the price and the spoilage, which is
  // exactly what waiting changes.
  const journey = {
    name: market.marketName,
    distanceKm: market.distanceKm,
    travelHours: market.travelTimeMinutes ? market.travelTimeMinutes / 60 : undefined
  };

  // Holding means the produce is holdDays older when it finally travels, so the
  // spoilage baseline is re-run with the harvest pushed further into the past.
  const heldSpoilage = spoilageService.estimateSpoilageLossForMarket(
    {
      ...spoilageInput,
      harvestDate: shiftHarvestDateEarlier(spoilageInput?.harvestDate, holdDays)
    },
    { ...journey, pricePerQuintal: prediction.predictedPrice }
  );

  let sellNowReturn = null;
  let heldReturn = null;
  try {
    sellNowReturn = netReturnService.calculateNetReturn({
      quantityKg,
      pricePerQuintal: prediction.currentPrice,
      spoilageLossPercent: market.estimatedLossPercent,
      transportCost: market.transportCost
    });
    heldReturn = netReturnService.calculateNetReturn({
      quantityKg,
      pricePerQuintal: prediction.predictedPrice,
      spoilageLossPercent: heldSpoilage.estimatedLossPercent,
      transportCost: market.transportCost
    });
  } catch (error) {
    // An unusable forecast or current price should not break the recommendation.
    sellNowReturn = null;
    heldReturn = null;
  }

  if (!heldReturn || !sellNowReturn) {
    return {
      decision: DECISION.SELL_SOON,
      reason:
        'The forecast for this market could not be valued reliably, so sell at the ' +
        'current rate within the next day or two.',
      recommendedWindow: '1-2 days',
      recommendedWindowDays: { from: 1, to: 2 },
      confidence: 'low',
      basis: 'FORECAST_NOT_VALUABLE',
      priceForecastAvailable: true,
      holdComparison: null,
      engine: 'RULE_BASED',
      engineVersion: ENGINE_VERSION
    };
  }

  const gain = heldReturn.expectedMoney - sellNowReturn.expectedMoney;
  const gainPercent = sellNowReturn.expectedMoney > 0
    ? Math.round((gain / sellNowReturn.expectedMoney) * 1000) / 10
    : 0;

  const extraSpoilagePercent =
    Math.round((heldSpoilage.estimatedLossPercent - market.estimatedLossPercent) * 10) / 10;
  const priceChange = Math.round((prediction.predictedPrice - prediction.currentPrice) * 10) / 10;

  const holdComparison = {
    holdDays,
    sellNowExpectedMoney: sellNowReturn.expectedMoney,
    holdExpectedMoney: heldReturn.expectedMoney,
    netGainFromWaiting: gain,
    netGainPercent: gainPercent,
    forecastPriceChangePerQuintal: priceChange,
    additionalSpoilagePercent: extraSpoilagePercent,
    additionalSpoilageValue: heldReturn.spoilageLossValue - sellNowReturn.spoilageLossValue,
    safeDaysRemaining: safeDays,
    modelVersion: prediction.modelVersion,
    forecastConfidence: prediction.confidence,
    // Both branches priced by the same engine, so the difference above is
    // genuinely the cost of waiting and nothing else.
    comparisonBasis: 'BOTH_BRANCHES_REPRICED'
  };

  const canHoldSafely = safeDays >= holdDays;
  const meetsThreshold = gain >= minGainRupees() && gainPercent >= minGainPercent();

  if (canHoldSafely && meetsThreshold) {
    return {
      decision: DECISION.WAIT,
      reason:
        `Holding for ${holdDays} more day${holdDays === 1 ? '' : 's'} is worth about ` +
        `₹${gain.toLocaleString('en-IN')} more: the forecast rate at ${market.marketName} is ` +
        `₹${Math.round(prediction.predictedPrice)}/quintal against ₹${Math.round(prediction.currentPrice)} today, ` +
        `and that gain is larger than the extra ${extraSpoilagePercent}% of the load you would lose ` +
        `by waiting. You have ${safeDays} safe day${safeDays === 1 ? '' : 's'} in hand.`,
      recommendedWindow: `${holdDays}-${holdDays + 1} days`,
      recommendedWindowDays: { from: holdDays, to: holdDays + 1 },
      confidence: prediction.confidence || 'low',
      basis: 'FORECAST_EXCEEDS_SPOILAGE',
      priceForecastAvailable: true,
      holdComparison,
      engine: 'RULE_BASED',
      engineVersion: ENGINE_VERSION
    };
  }

  // Waiting does not pay. Name the actual cause rather than a generic one: a
  // message blaming spoilage when spoilage did not change would be wrong, and a
  // farmer comparing it against the figures would rightly stop trusting the app.
  const days = `${holdDays} day${holdDays === 1 ? '' : 's'}`;
  const shortfall = `₹${Math.abs(gain).toLocaleString('en-IN')}`;

  let reason;
  if (!canHoldSafely) {
    reason =
      `The forecast points ${priceChange >= 0 ? 'up' : 'down'}, but this load only has ` +
      `${safeDays} safe day${safeDays === 1 ? '' : 's'} left - not enough to wait ${days} ` +
      'for it. Sell at the current rate.';
  } else if (gain <= 0 && extraSpoilagePercent > 0) {
    reason =
      `Waiting ${days} would leave you about ${shortfall} worse off: the extra ` +
      `${extraSpoilagePercent}% of the load lost to spoilage is more than the forecast price ` +
      'movement is worth.';
  } else if (gain <= 0) {
    // No extra spoilage, so the forecast itself is the problem.
    reason =
      `Waiting ${days} would leave you about ${shortfall} worse off, because the forecast rate at ` +
      `${market.marketName} is ₹${Math.round(prediction.predictedPrice)}/quintal against ` +
      `₹${Math.round(prediction.currentPrice)} today. Sell at the current rate.`;
  } else {
    reason =
      `Waiting ${days} would only add about ₹${gain.toLocaleString('en-IN')} (${gainPercent}%), which is ` +
      'too small to justify the risk of holding harvested produce. Sell at the current rate.';
  }

  return {
    decision: DECISION.SELL_SOON,
    reason,
    recommendedWindow: '1-2 days',
    recommendedWindowDays: { from: 1, to: 2 },
    confidence: prediction.confidence || 'low',
    basis: !canHoldSafely ? 'SPOILAGE_CONSTRAINT' : 'GAIN_BELOW_THRESHOLD',
    priceForecastAvailable: true,
    holdComparison,
    engine: 'RULE_BASED',
    engineVersion: ENGINE_VERSION
  };
};

/**
 * Moves a harvest date further into the past, which is how "the crop is N days
 * older" is expressed to the spoilage engine.
 *
 * @param {string|Date|null} harvestDate
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
const shiftHarvestDateEarlier = (harvestDate, days) => {
  const base = harvestDate ? new Date(harvestDate) : new Date();
  const date = Number.isNaN(base.getTime()) ? new Date() : base;
  const shifted = new Date(date.getTime() - days * 86400000);
  return shifted.toISOString().slice(0, 10);
};

module.exports = {
  decideSellTiming,
  shiftHarvestDateEarlier,
  DECISION,
  ENGINE_VERSION
};

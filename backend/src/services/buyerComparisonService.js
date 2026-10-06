/**
 * Buyer comparison and unified selling options.
 *
 * Answers the marketplace equivalent of the mandi question: of the buyers who
 * want my crop, which one leaves me with the most money?
 *
 * REUSE, NOT REIMPLEMENTATION
 * ---------------------------
 * Every rupee here comes from the SAME engines the mandi recommendation uses:
 *
 *   routingService        farm -> destination road distance
 *   transportCostService  freight, the single source of truth for it
 *   spoilageService       expected crop loss (RULE_BASED_BASELINE)
 *   netReturnService      the gross - spoilage - transport - fees waterfall
 *
 * Nothing is recomputed locally. That is what makes a direct-buyer figure
 * genuinely comparable with a mandi figure instead of merely similar-looking.
 *
 * THE FOUR CALCULATION RULES FROM THE BRIEF, AND HOW EACH IS HONOURED
 * ------------------------------------------------------------------
 * 1. Use the MATCHED quantity, not the buyer's whole requirement. A buyer wanting
 *    1,000 kg from a farmer with 500 kg is valued on 500 kg.
 * 2. Do not subtract crop loss twice. netReturnService already reduces the
 *    saleable quantity by the spoilage percentage and prices the shortfall once;
 *    this module passes the percentage in and never subtracts a loss itself.
 * 3. Buyer pickup means the farmer pays no freight. transportCost is zero and
 *    `whoPaysTransport` says 'buyer', so the comparison is not silently charging
 *    a farmer for a trip they will not make.
 * 4. Missing cost data makes the result INCOMPLETE, never zero. A null distance
 *    yields isComplete:false with a stated reason, because a free trip is a much
 *    more attractive lie than an unknown one.
 *
 * ADVERTISED vs AGREED
 * --------------------
 * Every price in a comparison is `offeredPricePerKg` - what the buyer advertised.
 * `isAdvertisedPrice: true` travels with each option so no caller can render it as
 * a settled figure. Only marketplace_deals holds an agreed price.
 */

const routingService = require('./routingService');
const transportCostService = require('./transportCostService');
const spoilageService = require('./spoilageService');
const netReturnService = require('./netReturnService');
const marketService = require('./marketService');
const matchingService = require('./matchingService');
const availabilityService = require('./availabilityService');

const ENGINE_VERSION = 'buyer_comparison_v1';

/**
 * Who bears the freight for a given arrangement.
 *
 * A requirement with pickup_available means the buyer collects at their own
 * expense, so the farmer's transport cost is genuinely zero - not "assumed zero".
 *
 * @param {object} requirement
 * @returns {object} { whoPays, farmerPaysFreight, label }
 */
const resolveTransportResponsibility = (requirement) => {
  if (requirement.pickupAvailable) {
    return {
      whoPays: 'buyer',
      farmerPaysFreight: false,
      label: 'Buyer collects from your farm'
    };
  }
  return {
    whoPays: 'farmer',
    farmerPaysFreight: true,
    label: 'You deliver to the buyer'
  };
};

/**
 * Prices one buyer option for a farmer's crop.
 *
 * Never throws for a missing input. An unroutable destination or an unpriceable
 * trip produces isComplete:false with the reason attached, so the option is still
 * shown - with its gap visible - rather than silently dropped or silently costed
 * at zero.
 *
 * @param {object} input
 * @param {object} input.match - a matchingService match
 * @param {object} input.farmOrigin - { latitude, longitude }
 * @param {object} input.spoilageInput - shared assessSpoilageRisk input
 * @param {string} [input.vehicleType]
 * @returns {Promise<object>} priced option
 */
const priceBuyerOption = async ({ match, farmOrigin, spoilageInput, vehicleType = null }) => {
  const { requirement, matchedQuantityKg } = match;
  const responsibility = resolveTransportResponsibility(requirement);

  const incompleteReasons = [];

  // --- destination ------------------------------------------------------
  const destination = requirement.latitude !== null && requirement.longitude !== null
    ? { lat: requirement.latitude, lon: requirement.longitude }
    : requirement.buyer && requirement.buyer.latitude !== null
      ? { lat: requirement.buyer.latitude, lon: requirement.buyer.longitude }
      : null;

  // --- road distance ----------------------------------------------------
  let route = null;
  if (responsibility.farmerPaysFreight) {
    if (!destination || !routingService.isValidCoordinate(destination)
        || !routingService.isValidCoordinate({ lat: farmOrigin.latitude, lon: farmOrigin.longitude })) {
      incompleteReasons.push('The delivery distance could not be measured, so freight is unknown.');
    } else {
      try {
        route = await routingService.getRoute(
          { lat: farmOrigin.latitude, lon: farmOrigin.longitude },
          destination
        );
      } catch (error) {
        incompleteReasons.push('The delivery distance could not be measured, so freight is unknown.');
      }
    }
  }

  // --- freight ----------------------------------------------------------
  let transport = null;
  if (responsibility.farmerPaysFreight && route) {
    try {
      transport = await transportCostService.calculateTransportCost({
        distanceKm: route.distanceKm,
        quantityKg: matchedQuantityKg,
        vehicleType
      });
    } catch (error) {
      incompleteReasons.push('Freight could not be calculated for this trip.');
    }
  }

  // Rule 3: buyer pickup is a real zero, and it is labelled as such.
  const transportCost = responsibility.farmerPaysFreight
    ? (transport ? transport.totalCost : null)
    : 0;

  // --- expected crop loss ----------------------------------------------
  // Travel hours come from the route when the farmer travels. Under buyer pickup
  // the produce still waits and still deteriorates, but it does not spend hours on
  // the farmer's cart, so no transit stress is attributed.
  const travelHours = route && Number.isFinite(route.travelTimeMinutes)
    ? route.travelTimeMinutes / 60
    : undefined;

  const spoilage = spoilageService.estimateSpoilageLossForMarket(
    { ...spoilageInput, quantityKg: matchedQuantityKg },
    {
      name: requirement.buyer ? requirement.buyer.businessName : 'Buyer',
      distanceKm: route ? route.distanceKm : 0,
      travelHours,
      pricePerQuintal: requirement.offeredPricePerKg * 100
    }
  );

  // --- the money -------------------------------------------------------
  // Rule 1: matched quantity. Rule 2: the loss percentage goes IN; netReturnService
  // reduces the saleable quantity and prices the shortfall exactly once.
  let ledger = null;
  if (transportCost !== null) {
    try {
      ledger = netReturnService.calculateNetReturn({
        quantityKg: matchedQuantityKg,
        pricePerQuintal: requirement.offeredPricePerKg * 100,
        spoilageLossPercent: spoilage.estimatedLossPercent,
        transportCost
      });
    } catch (error) {
      incompleteReasons.push('The expected money could not be calculated for this option.');
    }
  }

  const isComplete = Boolean(ledger) && incompleteReasons.length === 0;

  return {
    channel: 'direct_buyer',

    // --- who ---
    requirementId: requirement.id,
    buyerId: requirement.buyerId,
    buyerName: requirement.buyer ? requirement.buyer.businessName : null,
    buyerType: requirement.buyer ? requirement.buyer.buyerType : null,
    buyerDistrict: requirement.buyer ? requirement.buyer.district : null,
    isVerifiedBuyer: Boolean(requirement.buyer && requirement.buyer.isVerified),
    verificationStatus: requirement.buyer ? requirement.buyer.verificationStatus : null,

    // --- what is on offer ---
    crop: requirement.crop,
    offeredPricePerKg: requirement.offeredPricePerKg,
    // The guard against a listing being read as a transaction.
    isAdvertisedPrice: true,
    priceNegotiable: requirement.priceNegotiable,
    requirementQuantityRemainingKg: requirement.quantityRemainingKg,
    matchedQuantityKg,
    isPartialFulfilment: match.isPartialFulfilment,
    requiredBy: requirement.requiredBy,
    expiresAt: requirement.expiresAt,

    // --- the journey ---
    distanceKm: route ? route.distanceKm : (responsibility.farmerPaysFreight ? null : 0),
    travelTimeMinutes: route ? route.travelTimeMinutes : null,
    routeMethod: route ? route.method : null,
    isRoadRoute: route ? route.isRoadRoute : null,
    straightLineKm: match.straightLineKm ?? null,

    // --- freight ---
    transportCost,
    whoPaysTransport: responsibility.whoPays,
    transportArrangement: responsibility.label,
    vehicle: transport ? transport.vehicle : null,
    trips: transport ? transport.trips : null,

    // --- expected crop loss ---
    spoilageRisk: spoilage.riskLevel,
    estimatedLossPercent: spoilage.estimatedLossPercent,
    estimatedLossKg: spoilage.estimatedLossKg,
    estimatedLossValue: spoilage.estimatedLossValue,
    spoilageFactors: spoilage.factors,
    spoilageEngine: spoilage.engine,
    spoilageIsMachineLearning: spoilage.isMachineLearning,

    // --- the money ---
    grossSaleValue: ledger ? ledger.grossSaleValue : null,
    expectedSaleValue: ledger ? ledger.expectedSaleValue : null,
    otherCosts: ledger ? ledger.otherCosts : null,
    otherCostsBreakdown: ledger ? ledger.otherCostsBreakdown : null,
    saleableQuantityKg: ledger ? ledger.saleableQuantityKg : null,
    expectedMoney: ledger ? ledger.expectedMoney : null,
    retentionPercent: ledger ? ledger.retentionPercent : null,

    // Rule 4: incomplete is stated, never papered over with a zero.
    isComplete,
    incompleteReasons,

    // The assumptions the farmer is entitled to see behind the number.
    assumptions: buildAssumptions({ responsibility, route, transport, spoilage, requirement }),

    engineVersion: ENGINE_VERSION
  };
};

/**
 * Plain-language assumptions behind one option's figures.
 * @returns {Array<string>}
 */
const buildAssumptions = ({ responsibility, route, transport, spoilage, requirement }) => {
  const list = [];

  list.push(
    `Price of ₹${requirement.offeredPricePerKg}/kg is what this buyer advertised` +
    `${requirement.priceNegotiable ? ' and is negotiable' : ''} — not an agreed price.`
  );

  if (!responsibility.farmerPaysFreight) {
    list.push('The buyer collects from your farm, so no transport cost is charged to you.');
  } else if (route && transport) {
    list.push(
      `Transport assumes ${route.distanceKm} km by ${route.isRoadRoute ? 'road' : 'estimated distance'} ` +
      `in a ${transport.vehicle.label} at ₹${transport.vehicle.ratePerKm}/km` +
      `${transport.trips > 1 ? `, over ${transport.trips} trips` : ''}.`
    );
    if (!route.isRoadRoute) {
      list.push('Road routing was unavailable, so the distance is a straight-line estimate.');
    }
  }

  list.push(
    `Expected crop loss of ${spoilage.estimatedLossPercent}% comes from AgriChain's ` +
    'rule-based spoilage estimate, not a trained model.'
  );
  list.push('Mandi-style selling charges are applied for comparability; a direct buyer may deduct less.');

  return list;
};

/**
 * Ranks buyers for one of a farmer's crop listings.
 *
 * Ordered by expected money — the figure the farmer actually receives — with
 * incomplete options placed last, because an option whose cost is unknown cannot
 * honestly be claimed to beat one that is fully costed.
 *
 * @param {object} input
 * @param {number} input.userId
 * @param {number} input.availabilityId
 * @param {object} [input.filters]
 * @param {number} [input.limit]
 * @returns {Promise<object>}
 */
const getTopBuyers = async ({ userId, availabilityId, filters = {}, limit = 10 } = {}) => {
  const listing = await availabilityService.getById(availabilityId);
  if (!listing) {
    const err = new Error(`No crop listing found with id ${availabilityId}.`);
    err.code = 'AVAILABILITY_NOT_FOUND';
    throw err;
  }
  // Ownership: a farmer may only compare buyers for their own crop.
  if (listing.userId !== parseInt(userId, 10)) {
    const err = new Error('This crop listing belongs to a different farmer.');
    err.code = 'AVAILABILITY_FORBIDDEN';
    throw err;
  }

  const { matches, diagnostics } = await matchingService.findMatchesForFarmer({
    userId,
    availabilityId,
    filters,
    limit: 50
  });

  if (!matches.length) {
    return {
      availability: listing,
      buyers: [],
      diagnostics,
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString()
    };
  }

  // Ambient conditions once for the whole comparison, so every buyer is judged
  // against identical weather - otherwise ordering could shift on a cache miss.
  const ambient = await marketService.getAmbientConditions(
    listing.latitude, listing.longitude
  );

  const spoilageInput = {
    cropType: listing.crop,
    quantityKg: listing.availableKg,
    harvestDate: listing.harvestDate || new Date().toISOString().slice(0, 10),
    storageType: listing.storageType || 'open',
    temperatureC: ambient.available ? ambient.temperatureC : undefined,
    humidity: ambient.available ? ambient.humidity : undefined
  };

  const priced = [];
  for (const match of matches.slice(0, Math.min(limit * 2, 20))) {
    priced.push(await priceBuyerOption({
      match,
      farmOrigin: listing,
      spoilageInput,
      vehicleType: filters.vehicleType || null
    }));
  }

  // Complete options first, ordered by money in hand. Incomplete ones follow,
  // visible but never outranking a figure we can actually stand behind.
  priced.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
    if (!a.isComplete) return 0;
    return b.expectedMoney - a.expectedMoney;
  });

  const best = priced.find((p) => p.isComplete) || null;

  const ranked = priced.map((option, index) => ({
    ...option,
    rank: index + 1,
    recommended: Boolean(best) && option === best,
    deltaVsBest: option.isComplete && best ? option.expectedMoney - best.expectedMoney : null,
    // The case worth surfacing: a higher advertised price that loses on net.
    isHighestPriceButNotBest: Boolean(
      best && option !== best
      && option.offeredPricePerKg > best.offeredPricePerKg
      && option.isComplete
    ),
    // Comparability warning. Two options for different quantities are NOT
    // directly comparable on total money, and the UI must say so.
    quantityComparable: Boolean(best) && option.matchedQuantityKg === best.matchedQuantityKg
  }));

  return {
    availability: listing,
    buyers: ranked,
    conditions: ambient,
    comparison: {
      rankedBy: 'expectedMoney',
      note:
        'Ordered by the money you would keep after transport, expected crop loss and ' +
        'selling charges — not by the advertised price.',
      quantityWarning: ranked.some((r) => !r.quantityComparable)
        ? 'Some buyers can take a different quantity. Compare the money against the quantity shown for each.'
        : null
    },
    diagnostics,
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString()
  };
};

/**
 * Unified selling options: mandis AND direct buyers, side by side.
 *
 * The mandi side is delegated wholesale to marketService.recommendMarkets - its
 * calculations are not touched or duplicated, only mapped into a shared option
 * shape. Both channels therefore arrive from the same net-return engine.
 *
 * @param {object} input - { userId, availabilityId, farm, filters }
 * @returns {Promise<object>}
 */
const getSellingOptions = async ({ userId, availabilityId, filters = {} } = {}) => {
  const listing = await availabilityService.getById(availabilityId);
  if (!listing) {
    const err = new Error(`No crop listing found with id ${availabilityId}.`);
    err.code = 'AVAILABILITY_NOT_FOUND';
    throw err;
  }
  if (listing.userId !== parseInt(userId, 10)) {
    const err = new Error('This crop listing belongs to a different farmer.');
    err.code = 'AVAILABILITY_FORBIDDEN';
    throw err;
  }

  // --- direct buyers ---
  const buyerResult = await getTopBuyers({ userId, availabilityId, filters, limit: 10 });

  // --- mandis, via the existing engine, unmodified ---
  let mandiResult = null;
  let mandiError = null;

  if (listing.farmId || (listing.latitude !== null && listing.longitude !== null)) {
    try {
      mandiResult = await marketService.recommendMarkets({
        crop: listing.crop,
        quantityKg: listing.availableKg,
        farm: {
          id: listing.farmId,
          name: listing.farmName,
          latitude: listing.latitude,
          longitude: listing.longitude
        },
        harvestDate: listing.harvestDate,
        storageType: listing.storageType,
        requestId: `sell-opts-${availabilityId}`
      });
    } catch (error) {
      // A mandi-side failure must not remove the buyer options, and vice versa.
      mandiError = { code: error.code || 'MANDI_COMPARISON_FAILED', message: error.message };
      console.warn(`[Selling Options] mandi channel unavailable: ${error.code}`);
    }
  } else {
    mandiError = {
      code: 'MISSING_FARM_COORDINATES',
      message: 'This crop listing has no location, so mandi distances cannot be measured.'
    };
  }

  const mandiOptions = mandiResult
    ? mandiResult.markets.filter((m) => m.evaluated).map((m) => ({
      channel: 'mandi',
      marketId: m.marketId,
      marketCode: m.marketCode,
      name: m.marketName,
      district: m.district,

      pricePerKg: Math.round((m.currentPrice / 100) * 100) / 100,
      pricePerQuintal: m.currentPrice,
      // Mandi prices carry provenance and age; a buyer's advertised price does not.
      priceSource: m.priceSource,
      priceObservationDate: m.observationDate,
      priceFreshness: m.freshness,
      priceAgeInDays: m.priceAgeInDays,
      isDemoData: m.isDemoData,
      predictedPricePerQuintal: m.predictedPrice,

      quantityKg: m.quantityKg,
      matchedQuantityKg: m.quantityKg,
      distanceKm: m.distanceKm,
      travelTimeMinutes: m.travelTimeMinutes,
      routeMethod: m.routeMethod,
      isRoadRoute: m.isRoadRoute,

      transportCost: m.transportCost,
      whoPaysTransport: 'farmer',
      transportArrangement: 'You transport to the mandi',

      spoilageRisk: m.spoilageRisk,
      estimatedLossPercent: m.estimatedLossPercent,
      estimatedLossKg: m.estimatedLossKg,
      estimatedLossValue: m.estimatedLossValue,

      grossSaleValue: m.grossSaleValue,
      expectedSaleValue: m.expectedSaleValue,
      otherCosts: m.otherCosts,
      saleableQuantityKg: m.saleableQuantityKg,
      expectedMoney: m.expectedMoney,
      retentionPercent: m.retentionPercent,

      isComplete: true,
      incompleteReasons: [],
      isAdvertisedPrice: false
    }))
    : [];

  // --- one combined ranking, with the channel always visible ---
  const combined = [...mandiOptions, ...buyerResult.buyers]
    .filter((o) => o.isComplete)
    .sort((a, b) => b.expectedMoney - a.expectedMoney)
    .map((option, index) => ({
      channel: option.channel,
      rank: index + 1,
      name: option.name || option.buyerName,
      expectedMoney: option.expectedMoney,
      matchedQuantityKg: option.matchedQuantityKg,
      pricePerKg: option.pricePerKg ?? option.offeredPricePerKg,
      isAdvertisedPrice: Boolean(option.isAdvertisedPrice),
      distanceKm: option.distanceKm,
      transportCost: option.transportCost,
      whoPaysTransport: option.whoPaysTransport,
      estimatedLossValue: option.estimatedLossValue,
      requirementId: option.requirementId ?? null,
      marketId: option.marketId ?? null
    }));

  return {
    availability: listing,

    mandiChannel: {
      available: Boolean(mandiResult),
      unavailableReason: mandiError,
      options: mandiOptions,
      recommended: mandiResult ? mandiResult.recommendation : null,
      dataQuality: mandiResult ? mandiResult.dataQuality : null
    },

    directBuyerChannel: {
      available: true,
      options: buyerResult.buyers,
      recommended: buyerResult.buyers.find((b) => b.recommended) || null,
      note:
        'Direct-buyer figures are estimates based on advertised offers. Nothing is ' +
        'agreed until an offer is accepted.'
    },

    combined,
    bestOverall: combined[0] || null,

    disclaimer:
      'All figures are estimates. Mandi prices are observed market data with the date ' +
      'shown; direct-buyer prices are what the buyer advertised and are not agreed sales. ' +
      'Payment and handover happen outside AgriChain.',

    conditions: buyerResult.conditions,
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString()
  };
};

module.exports = {
  ENGINE_VERSION,
  priceBuyerOption,
  resolveTransportResponsibility,
  getTopBuyers,
  getSellingOptions,
  buildAssumptions
};

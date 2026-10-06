/**
 * Buyer–farmer matching engine.
 *
 * Decides which buyer requirements a farmer's crop can actually fill, and vice
 * versa.
 *
 * DELIBERATELY NOT MACHINE LEARNING
 * ---------------------------------
 * This is a filter with a quantity calculation. Every exclusion is a hard rule a
 * farmer can be told in one sentence ("that buyer needs the crop by 2 October and
 * yours is not harvested until the 8th"). An ML model here would make the feature
 * *look* clever while making it impossible to explain a rejection, which is the
 * opposite of useful.
 *
 * NO INVENTED MATCH PERCENTAGE
 * ----------------------------
 * There is no "94% match". A requirement either qualifies or it does not, and
 * qualifying ones carry `reasons` - plain statements of why. Ordering is by
 * something real: the money the farmer would end up with (Stage 3), or the
 * advertised price as a fallback here.
 *
 * CROP COMPARISON
 * ---------------
 * Both sides store a normalised crop_profiles key (via
 * spoilageService.resolveCropKey at write time), so this is an equality test on a
 * controlled vocabulary - never a LIKE against user-typed text where "Tomatoes"
 * and "tamatar" would silently fail to match.
 */

const { query } = require('../config/db');
const routingService = require('./routingService');
const requirementService = require('./requirementService');
const availabilityService = require('./availabilityService');
const spoilageService = require('./spoilageService');

/** Bumped when the eligibility rules change; returned with every result set. */
const ENGINE_VERSION = 'marketplace_matching_v1';

/**
 * Why a requirement was excluded. Returned in diagnostics so a farmer seeing an
 * empty list can be told what to change, rather than just "no results".
 */
const EXCLUSION = {
  CROP_MISMATCH: 'crop_mismatch',
  NOT_OPEN: 'requirement_not_open',
  EXPIRED: 'requirement_expired',
  NO_QUANTITY_LEFT: 'no_quantity_remaining',
  PARTIAL_NOT_ALLOWED: 'partial_fulfilment_not_allowed',
  BELOW_MINIMUM_LOT: 'below_minimum_lot',
  HARVEST_TOO_LATE: 'harvest_after_required_date',
  VARIETY_MISMATCH: 'variety_mismatch',
  GRADE_MISMATCH: 'quality_grade_mismatch',
  OUTSIDE_SERVICE_AREA: 'outside_buyer_service_area',
  NO_ARRANGEMENT: 'no_compatible_delivery_arrangement',
  BUYER_SUSPENDED: 'buyer_suspended'
};

/** Quality grades ordered worst to best, for "at least Grade B" comparisons. */
const GRADE_ORDER = ['c', 'b', 'a', 'a+'];

/**
 * Normalises a free-text grade to a comparable rank.
 *
 * Returns null for anything unrecognised, and an unrecognised grade is treated as
 * "unknown" rather than "fails" - excluding a farmer because they typed
 * "Premium" would lose them a real sale.
 *
 * @param {string|null} grade
 * @returns {number|null}
 */
const gradeRank = (grade) => {
  if (!grade) return null;
  const normalised = String(grade).trim().toLowerCase()
    .replace(/^grade\s*/, '').replace(/\s+/g, '');
  const index = GRADE_ORDER.indexOf(normalised);
  return index === -1 ? null : index;
};

/**
 * Decides whether a farmer's crop can fill a requirement, and why.
 *
 * Pure: takes two already-loaded records and returns a verdict. No I/O, so it is
 * directly unit-testable and is where every eligibility rule lives.
 *
 * @param {object} availability - decorated availabilityService record
 * @param {object} requirement - decorated requirementService record
 * @param {object} [options] - { straightLineKm }
 * @returns {object} { eligible, matchedQuantityKg, isPartial, reasons, exclusions }
 */
const evaluateMatch = (availability, requirement, { straightLineKm = null } = {}) => {
  const reasons = [];
  const exclusions = [];

  // --- 1. crop: normalised keys, plain equality --------------------------
  if (!availability.crop || !requirement.crop || availability.crop !== requirement.crop) {
    exclusions.push(EXCLUSION.CROP_MISMATCH);
    return { eligible: false, matchedQuantityKg: 0, isPartial: false, reasons, exclusions };
  }
  reasons.push(`Same crop (${availability.cropLabel || availability.crop})`);

  // --- 2. requirement must be open and unexpired -------------------------
  const openness = requirementService.assessOpenness(requirement);
  if (!openness.open) {
    exclusions.push(
      openness.reason === 'REQUIREMENT_EXPIRED' ? EXCLUSION.EXPIRED
        : openness.reason === 'REQUIREMENT_FULLY_COMMITTED' ? EXCLUSION.NO_QUANTITY_LEFT
          : EXCLUSION.NOT_OPEN
    );
    return { eligible: false, matchedQuantityKg: 0, isPartial: false, reasons, exclusions };
  }

  // A suspended buyer is one an admin has stopped farmers dealing with.
  if (requirement.buyer && requirement.buyer.isSuspended) {
    exclusions.push(EXCLUSION.BUYER_SUSPENDED);
    return { eligible: false, matchedQuantityKg: 0, isPartial: false, reasons, exclusions };
  }

  // --- 3. quantity -------------------------------------------------------
  const availableKg = Number(availability.availableKg) || 0;
  const remainingKg = Number(requirement.quantityRemainingKg) || 0;

  if (availableKg <= 0) {
    exclusions.push(EXCLUSION.NO_QUANTITY_LEFT);
    return { eligible: false, matchedQuantityKg: 0, isPartial: false, reasons, exclusions };
  }

  // The brief's formula: a farmer can supply no more than they have, and a buyer
  // needs no more than is outstanding.
  const matchedQuantityKg = Math.round(Math.min(availableKg, remainingKg) * 100) / 100;
  const isPartial = matchedQuantityKg < remainingKg;

  if (isPartial && !requirement.partialFulfillmentAllowed) {
    exclusions.push(EXCLUSION.PARTIAL_NOT_ALLOWED);
    return { eligible: false, matchedQuantityKg, isPartial, reasons, exclusions };
  }

  if (requirement.minimumAcceptableQuantityKg
      && matchedQuantityKg < requirement.minimumAcceptableQuantityKg) {
    exclusions.push(EXCLUSION.BELOW_MINIMUM_LOT);
    return { eligible: false, matchedQuantityKg, isPartial, reasons, exclusions };
  }

  reasons.push(
    isPartial
      ? `You can supply ${matchedQuantityKg} kg of the ${remainingKg} kg still needed`
      : `Your ${matchedQuantityKg} kg covers what they still need`
  );

  // --- 4. timing ---------------------------------------------------------
  // A crop that will not be harvested until after the buyer needs it cannot fill
  // the requirement, however well everything else lines up.
  if (availability.harvestDate && requirement.requiredBy) {
    if (availability.harvestDate > requirement.requiredBy) {
      exclusions.push(EXCLUSION.HARVEST_TOO_LATE);
      return { eligible: false, matchedQuantityKg, isPartial, reasons, exclusions };
    }
  }

  if (availability.isSellableNow) {
    reasons.push('Your crop is harvested and ready');
  } else if (availability.harvestDate && availability.harvestDate <= requirement.requiredBy) {
    reasons.push(`Harvest expected ${availability.harvestDate}, before they need it`);
  }

  // --- 5. variety and grade, only when the buyer specified them ----------
  if (requirement.variety && availability.variety) {
    const wanted = String(requirement.variety).trim().toLowerCase();
    const has = String(availability.variety).trim().toLowerCase();
    // Substring either way: "Hybrid" should match "Hybrid Nasik Red".
    if (!has.includes(wanted) && !wanted.includes(has)) {
      exclusions.push(EXCLUSION.VARIETY_MISMATCH);
      return { eligible: false, matchedQuantityKg, isPartial, reasons, exclusions };
    }
    reasons.push(`Variety matches (${availability.variety})`);
  }

  if (requirement.minimumQualityGrade) {
    const wantedRank = gradeRank(requirement.minimumQualityGrade);
    const hasRank = gradeRank(availability.qualityGrade);
    // Only exclude when BOTH grades are understood. An unknown grade on either
    // side is not evidence of failure.
    if (wantedRank !== null && hasRank !== null && hasRank < wantedRank) {
      exclusions.push(EXCLUSION.GRADE_MISMATCH);
      return { eligible: false, matchedQuantityKg, isPartial, reasons, exclusions };
    }
    if (hasRank !== null && wantedRank !== null) {
      reasons.push(`Quality meets their ${requirement.minimumQualityGrade} requirement`);
    }
  }

  // --- 6. fulfilment arrangement ----------------------------------------
  if (!requirement.pickupAvailable && !requirement.deliveryRequired) {
    exclusions.push(EXCLUSION.NO_ARRANGEMENT);
    return { eligible: false, matchedQuantityKg, isPartial, reasons, exclusions };
  }
  if (requirement.pickupAvailable) {
    reasons.push('Buyer collects from your farm');
  } else {
    reasons.push('You deliver to the buyer');
  }

  // --- 7. buyer's stated service area -----------------------------------
  if (straightLineKm !== null && requirement.buyer && requirement.buyer.serviceAreaKm) {
    if (straightLineKm > requirement.buyer.serviceAreaKm) {
      exclusions.push(EXCLUSION.OUTSIDE_SERVICE_AREA);
      return { eligible: false, matchedQuantityKg, isPartial, reasons, exclusions };
    }
    reasons.push(`Within the buyer's ${requirement.buyer.serviceAreaKm} km buying area`);
  }

  return { eligible: true, matchedQuantityKg, isPartial, reasons, exclusions };
};

/**
 * Straight-line distance between a farmer's crop and a requirement's destination.
 *
 * Straight-line on purpose: matching may consider dozens of requirements and road
 * routing costs an external call each. The road distance that money depends on is
 * fetched once, for the shortlist, in Stage 3's comparison. Labelled accordingly.
 *
 * @param {object} availability
 * @param {object} requirement
 * @returns {number|null} km
 */
const approximateDistanceKm = (availability, requirement) => {
  const from = { lat: availability.latitude, lon: availability.longitude };
  // Prefer the requirement's own delivery coordinates; fall back to the buyer's
  // registered business location.
  const to = requirement.latitude !== null && requirement.longitude !== null
    ? { lat: requirement.latitude, lon: requirement.longitude }
    : requirement.buyer
      ? { lat: requirement.buyer.latitude, lon: requirement.buyer.longitude }
      : null;

  if (!routingService.isValidCoordinate(from) || !to || !routingService.isValidCoordinate(to)) {
    return null;
  }
  return Math.round(routingService.haversineKm(from, to) * 10) / 10;
};

/**
 * Finds requirements a farmer's crops can fill.
 *
 * @param {object} input
 * @param {number} input.userId - authenticated farmer
 * @param {number} [input.availabilityId] - restrict to one crop listing
 * @param {object} [input.filters] - { crop, minPricePerKg, maxDistanceKm, requiredByBefore, buyerType, verifiedOnly }
 * @param {number} [input.limit]
 * @returns {Promise<object>} { matches, diagnostics }
 */
const findMatchesForFarmer = async ({
  userId,
  availabilityId = null,
  filters = {},
  limit = 50
} = {}) => {
  await requirementService.expireStale();

  // --- the farmer's sellable crop ---
  let listings = await availabilityService.listForUser(userId, {
    activeOnly: true,
    withStockOnly: true,
    crop: filters.crop || null
  });

  if (availabilityId) {
    listings = listings.filter((l) => l.id === parseInt(availabilityId, 10));
  }

  const diagnostics = {
    listingsConsidered: listings.length,
    requirementsConsidered: 0,
    excludedByReason: {},
    engineVersion: ENGINE_VERSION
  };

  if (!listings.length) {
    return {
      matches: [],
      diagnostics: {
        ...diagnostics,
        // The actionable reason for an empty list.
        hint: 'Add what you have to sell — crop and quantity — to see buyers looking for it.'
      }
    };
  }

  // --- candidate requirements: only crops this farmer actually has -------
  const crops = Array.from(new Set(listings.map((l) => l.crop)));

  const { requirements } = await requirementService.list({
    crop: null,
    statuses: requirementService.OPEN_STATUSES,
    minPricePerKg: filters.minPricePerKg ?? null,
    requiredByBefore: filters.requiredByBefore ?? null,
    buyerType: filters.buyerType ?? null,
    verifiedOnly: Boolean(filters.verifiedOnly),
    includeSuspended: false,
    limit: 200,
    offset: 0,
    sort: 'newest'
  });

  const candidates = requirements.filter((r) => crops.includes(r.crop));
  diagnostics.requirementsConsidered = candidates.length;

  // --- evaluate every (listing, requirement) pair -----------------------
  const matches = [];

  for (const listing of listings) {
    for (const requirement of candidates) {
      const straightLineKm = approximateDistanceKm(listing, requirement);

      // Farmer-supplied distance filter, applied before eligibility so the
      // exclusion reported is the one the farmer asked for.
      if (filters.maxDistanceKm && straightLineKm !== null
          && straightLineKm > filters.maxDistanceKm) {
        continue;
      }

      const verdict = evaluateMatch(listing, requirement, { straightLineKm });

      if (!verdict.eligible) {
        for (const reason of verdict.exclusions) {
          diagnostics.excludedByReason[reason] = (diagnostics.excludedByReason[reason] || 0) + 1;
        }
        continue;
      }

      matches.push({
        requirement,
        availability: {
          id: listing.id,
          farmId: listing.farmId,
          farmName: listing.farmName,
          crop: listing.crop,
          cropLabel: listing.cropLabel,
          variety: listing.variety,
          qualityGrade: listing.qualityGrade,
          availableKg: listing.availableKg,
          harvestStatus: listing.harvestStatus,
          harvestDate: listing.harvestDate,
          storageType: listing.storageType,
          latitude: listing.latitude,
          longitude: listing.longitude
        },
        matchedQuantityKg: verdict.matchedQuantityKg,
        isPartialFulfilment: verdict.isPartial,
        // Plain statements, not a score.
        reasons: verdict.reasons,
        straightLineKm,
        distanceBasis: straightLineKm === null ? null : 'STRAIGHT_LINE',
        // Advertised, not agreed. Stage 3 replaces the ordering with expected money.
        advertisedGrossValue: Math.round(
          verdict.matchedQuantityKg * requirement.offeredPricePerKg * 100
        ) / 100
      });
    }
  }

  // Highest advertised value first as a neutral default. Stage 3's top-buyers
  // endpoint re-ranks by expected money, which is the figure that actually
  // matters, and says so.
  matches.sort((a, b) => b.advertisedGrossValue - a.advertisedGrossValue);

  return {
    matches: matches.slice(0, Math.min(limit, 100)),
    diagnostics: {
      ...diagnostics,
      matchesFound: matches.length,
      note: 'Ordered by advertised value. Use /api/marketplace/farmer/top-buyers for money-in-hand ranking.'
    }
  };
};

/**
 * The buyer's side: which farmers can fill this requirement.
 *
 * Returns farmer identity deliberately thinly - crop, quantity, district,
 * distance. A buyer gets no phone number and no farm coordinates from a match;
 * contact happens through the in-app conversation.
 *
 * @param {object} input - { requirementId, buyerId, limit }
 * @returns {Promise<object>} { requirement, matches, diagnostics }
 */
const findFarmersForRequirement = async ({ requirementId, buyerId, limit = 50 } = {}) => {
  // Ownership: a buyer may only see matches for their own requirement.
  await requirementService.assertOwnedByBuyer(requirementId, buyerId);

  const requirement = await requirementService.getById(requirementId);
  const diagnostics = {
    excludedByReason: {},
    engineVersion: ENGINE_VERSION
  };

  const result = await query(
    `SELECT ${[
      'a.id', 'a.user_id', 'a.farm_id', 'a.crop', 'a.variety', 'a.quality_grade',
      'a.total_harvested_kg', 'a.available_kg', 'a.reserved_kg', 'a.sold_kg',
      'a.harvest_status', 'a.harvest_date', 'a.storage_type',
      'a.latitude', 'a.longitude', 'a.is_active', 'a.is_demo_data',
      'a.created_at', 'a.updated_at'
    ].join(', ')},
            u.full_name AS farmer_name, f.name AS farm_name, f.location AS farm_location
     FROM farmer_crop_availability a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN farms f ON f.id = a.farm_id
     WHERE a.crop = $1 AND a.is_active = TRUE AND a.available_kg > 0
     ORDER BY a.available_kg DESC
     LIMIT 200`,
    [requirement.crop]
  );

  const matches = [];
  for (const row of result.rows) {
    const listing = availabilityService.decorate(row);
    const straightLineKm = approximateDistanceKm(listing, requirement);
    const verdict = evaluateMatch(listing, requirement, { straightLineKm });

    if (!verdict.eligible) {
      for (const reason of verdict.exclusions) {
        diagnostics.excludedByReason[reason] = (diagnostics.excludedByReason[reason] || 0) + 1;
      }
      continue;
    }

    matches.push({
      availabilityId: listing.id,
      // Needed to open a conversation; no contact details accompany it.
      farmerUserId: listing.userId,
      farmerName: row.farmer_name,
      farmLocation: row.farm_location || null,
      crop: listing.crop,
      cropLabel: listing.cropLabel,
      variety: listing.variety,
      qualityGrade: listing.qualityGrade,
      availableKg: listing.availableKg,
      matchedQuantityKg: verdict.matchedQuantityKg,
      isPartialFulfilment: verdict.isPartial,
      harvestStatus: listing.harvestStatus,
      harvestStatusLabel: listing.harvestStatusLabel,
      harvestDate: listing.harvestDate,
      straightLineKm,
      distanceBasis: straightLineKm === null ? null : 'STRAIGHT_LINE',
      reasons: verdict.reasons,
      isDemoData: listing.isDemoData
    });
  }

  matches.sort((a, b) => {
    // Closest first: for a buyer, a nearer farmer is a cheaper and fresher load.
    const left = a.straightLineKm ?? Number.MAX_SAFE_INTEGER;
    const right = b.straightLineKm ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return b.matchedQuantityKg - a.matchedQuantityKg;
  });

  return {
    requirement,
    matches: matches.slice(0, Math.min(limit, 100)),
    diagnostics: { ...diagnostics, matchesFound: matches.length }
  };
};

module.exports = {
  ENGINE_VERSION,
  EXCLUSION,
  evaluateMatch,
  approximateDistanceKm,
  gradeRank,
  findMatchesForFarmer,
  findFarmersForRequirement
};

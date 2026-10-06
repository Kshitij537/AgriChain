/**
 * Marketplace Controller — requirements, availability, matching, comparison.
 *
 * Offers, deals, chat and notifications live in their own controllers; this one
 * covers the discovery half of the marketplace.
 *
 * IDENTITY IS NEVER TAKEN FROM THE BODY
 * -------------------------------------
 * `req.user.id` comes from a verified JWT and `req.buyerProfile` from
 * requireBuyer(). A `userId`, `farmerId` or `buyerId` in a request body is ignored
 * everywhere in this file - the brief requires that, and it is the difference
 * between a marketplace and an open database.
 */

const requirementService = require('../services/requirementService');
const availabilityService = require('../services/availabilityService');
const matchingService = require('../services/matchingService');
const buyerComparisonService = require('../services/buyerComparisonService');
const validator = require('../validators/marketplaceValidator');

const newRequestId = () => Math.random().toString(36).slice(2, 8);

const STATUS_BY_CODE = {
  REQUIREMENT_NOT_FOUND: 404,
  REQUIREMENT_FORBIDDEN: 403,
  REQUIREMENT_NOT_EDITABLE: 409,
  REQUIREMENT_ALREADY_CLOSED: 409,
  QUANTITY_BELOW_COMMITTED: 409,
  NOT_A_DRAFT: 409,
  INVALID_CLOSE_STATUS: 400,
  AVAILABILITY_NOT_FOUND: 404,
  AVAILABILITY_FORBIDDEN: 403,
  AVAILABILITY_HAS_COMMITMENTS: 409,
  TOTAL_BELOW_COMMITTED: 409,
  AVAILABLE_EXCEEDS_REMAINING: 409,
  FARM_NOT_FOUND: 404,
  FARM_FORBIDDEN: 403,
  NO_UPDATABLE_FIELDS: 400,

  // Derived by requirementService.assessOpenness from the requirement's status.
  REQUIREMENT_NOT_OPEN: 409,
  REQUIREMENT_EXPIRED: 409,
  REQUIREMENT_FULLY_COMMITTED: 409,
  REQUIREMENT_CLOSED: 409,
  REQUIREMENT_CANCELLED: 409,
  REQUIREMENT_FULFILLED: 409,
  REQUIREMENT_DRAFT: 409
};

const sendError = (res, error, requestId) => {
  const code = error.code || 'INTERNAL_ERROR';
  const status = STATUS_BY_CODE[code] || 500;
  if (status >= 500) console.error(`[Marketplace] [${requestId}] ${code}: ${error.message}`);
  else console.warn(`[Marketplace] [${requestId}] ${code}: ${error.message}`);
  return res.status(status).json({
    success: false,
    error: { code, message: error.message || 'Unexpected server error', requestId }
  });
};

const sendValidationError = (res, errors, requestId) =>
  res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_FAILED', message: errors[0].message, fields: errors, requestId }
  });

// ===========================================================================
// Requirements — buyer side
// ===========================================================================

/** POST /api/buyer-requirements */
const createRequirement = async (req, res) => {
  const requestId = newRequestId();
  try {
    const { valid, value, errors } = validator.validateRequirement(req.body, false);
    if (!valid) return sendValidationError(res, errors, requestId);

    console.log(
      `[Marketplace] [${requestId}] create requirement buyer=${req.buyerProfile.id} ` +
      `crop=${value.crop} qty=${value.quantityRequiredKg}kg @₹${value.offeredPricePerKg}/kg`
    );

    const requirement = await requirementService.create(
      req.buyerProfile.id,
      value,
      { publish: req.body.publish !== false }
    );

    return res.status(201).json({
      success: true,
      data: requirement,
      meta: {
        requestId,
        note: 'This is a posted requirement, not a confirmed purchase. Farmers may now send you offers.'
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * GET /api/buyer-requirements
 *
 * Serves three audiences from one handler, because they differ only by filter:
 *   ?mine=true   the buyer's own list, all statuses including drafts
 *   default      the open marketplace a farmer can browse
 */
const listRequirements = async (req, res) => {
  const requestId = newRequestId();
  try {
    const mine = req.query.mine === 'true';

    if (mine && !req.buyerProfile) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'BUYER_PROFILE_REQUIRED',
          message: 'Register a buyer profile to see your own requirements.',
          requestId
        }
      });
    }

    let crop = null;
    if (req.query.crop) {
      const resolved = validator.validateCrop(req.query.crop);
      if (!resolved.valid) return sendValidationError(res, [resolved.error], requestId);
      crop = resolved.value;
    }

    const statuses = req.query.status
      ? String(req.query.status).split(',').map((s) => s.trim())
      // Browsing farmers see only what they can act on; buyers see everything.
      : (mine ? null : requirementService.OPEN_STATUSES);

    const result = await requirementService.list({
      buyerId: mine ? req.buyerProfile.id : null,
      crop,
      statuses,
      minPricePerKg: req.query.minPricePerKg ? Number(req.query.minPricePerKg) : null,
      minQuantityKg: req.query.minQuantityKg ? Number(req.query.minQuantityKg) : null,
      maxQuantityKg: req.query.maxQuantityKg ? Number(req.query.maxQuantityKg) : null,
      requiredByBefore: req.query.requiredByBefore || null,
      buyerType: req.query.buyerType || null,
      verifiedOnly: req.query.verifiedOnly === 'true',
      // A buyer always sees their own suspended requirements; farmers never do.
      includeSuspended: mine,
      limit: req.query.limit,
      offset: req.query.offset,
      sort: req.query.sort
    });

    return res.json({
      success: true,
      data: result.requirements,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/buyer-requirements/:id */
const getRequirement = async (req, res) => {
  const requestId = newRequestId();
  try {
    await requirementService.expireStale();
    const requirement = await requirementService.getById(req.params.id);
    if (!requirement) {
      const err = new Error(`No requirement found with id ${req.params.id}.`);
      err.code = 'REQUIREMENT_NOT_FOUND';
      throw err;
    }

    const isOwner = Boolean(req.buyerProfile && req.buyerProfile.id === requirement.buyerId);

    // A draft is the buyer's private working copy - nobody else may read it.
    if (requirement.status === requirementService.STATUS.DRAFT && !isOwner) {
      const err = new Error(`No requirement found with id ${req.params.id}.`);
      err.code = 'REQUIREMENT_NOT_FOUND';
      throw err;
    }

    return res.json({ success: true, data: { ...requirement, isOwner }, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** PATCH /api/buyer-requirements/:id */
const updateRequirement = async (req, res) => {
  const requestId = newRequestId();
  try {
    const { valid, value, errors } = validator.validateRequirement(req.body, true);
    if (!valid) return sendValidationError(res, errors, requestId);

    const requirement = await requirementService.update({
      requirementId: req.params.id,
      buyerId: req.buyerProfile.id,
      changes: value
    });
    return res.json({ success: true, data: requirement, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/buyer-requirements/:id/publish */
const publishRequirement = async (req, res) => {
  const requestId = newRequestId();
  try {
    const requirement = await requirementService.publish({
      requirementId: req.params.id,
      buyerId: req.buyerProfile.id
    });
    return res.json({ success: true, data: requirement, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/buyer-requirements/:id/close  Body: { status?: 'closed'|'cancelled' } */
const closeRequirement = async (req, res) => {
  const requestId = newRequestId();
  try {
    const requirement = await requirementService.close({
      requirementId: req.params.id,
      buyerId: req.buyerProfile.id,
      status: (req.body && req.body.status) || requirementService.STATUS.CLOSED
    });
    return res.json({
      success: true,
      data: requirement,
      meta: {
        requestId,
        note: 'Closing stops new offers. Deals you have already agreed are unaffected.'
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/buyer-requirements/:id/matching-farmers */
const getMatchingFarmers = async (req, res) => {
  const requestId = newRequestId();
  try {
    const result = await matchingService.findFarmersForRequirement({
      requirementId: req.params.id,
      buyerId: req.buyerProfile.id,
      limit: parseInt(req.query.limit, 10) || 50
    });
    return res.json({
      success: true,
      data: result,
      meta: { count: result.matches.length, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ===========================================================================
// Farmer crop availability
// ===========================================================================

/** GET /api/marketplace/farmer/availability */
const listMyAvailability = async (req, res) => {
  const requestId = newRequestId();
  try {
    const listings = await availabilityService.listForUser(req.user.id, {
      activeOnly: req.query.includeInactive !== 'true',
      withStockOnly: req.query.withStockOnly === 'true'
    });
    const summary = await availabilityService.getFarmerSummary(req.user.id);
    return res.json({
      success: true,
      data: listings,
      meta: { count: listings.length, summary, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * GET /api/marketplace/availability
 *
 * The open marketplace from the buyer's side: every farmer's sellable crop.
 *
 * The farmer-facing counterpart of this listing is
 * GET /api/marketplace/buyer-requirements. Both halves of the market are now
 * browsable, which is what makes a buyer's first visit useful before they have
 * posted anything.
 *
 * Distance is measured from the caller's registered business location when they
 * have one. `optionalBuyer` resolves that profile without requiring it, so a
 * farmer checking what else is on the market still gets a list - just without
 * distances, since there is no buyer address to measure from.
 */
const browseAvailability = async (req, res) => {
  const requestId = newRequestId();
  try {
    let crop = null;
    if (req.query.crop) {
      const resolved = validator.validateCrop(req.query.crop);
      if (!resolved.valid) return sendValidationError(res, [resolved.error], requestId);
      crop = resolved.value;
    }

    let minQuantityKg = null;
    if (req.query.minQuantityKg) {
      const resolved = validator.validateQuantityKg(req.query.minQuantityKg, 'minQuantityKg');
      if (!resolved.valid) return sendValidationError(res, [resolved.error], requestId);
      minQuantityKg = resolved.value;
    }

    const profile = req.buyerProfile;
    const origin = profile && profile.latitude !== null && profile.longitude !== null
      ? { lat: Number(profile.latitude), lon: Number(profile.longitude) }
      : null;

    const maxDistanceKm = req.query.maxDistanceKm ? Number(req.query.maxDistanceKm) : null;
    if (maxDistanceKm !== null && (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0)) {
      return sendValidationError(res, [{
        field: 'maxDistanceKm',
        code: 'INVALID_DISTANCE',
        message: 'Maximum distance must be a positive number of kilometres.'
      }], requestId);
    }

    const result = await availabilityService.browse({
      crop,
      minQuantityKg,
      qualityGrade: req.query.qualityGrade || null,
      maxDistanceKm,
      origin,
      sellableOnly: req.query.sellableOnly === 'true',
      limit: parseInt(req.query.limit, 10) || 50,
      offset: parseInt(req.query.offset, 10) || 0
    });

    return res.json({
      success: true,
      data: result.listings,
      meta: {
        count: result.listings.length,
        total: result.total,
        // Says plainly why a distance filter returned less, and why distances are
        // absent when the caller has no registered location to measure from.
        filteredByDistance: result.filteredByDistance,
        distanceAvailable: Boolean(origin),
        distanceNote: origin
          ? 'Distances are straight-line estimates from your registered business location, not road distances.'
          : 'Add your business location to your buyer profile to see how far each farm is.',
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * GET /api/marketplace/farmer/availability/suggestions
 *
 * Pre-fills from the farmer's existing fields so nothing already in AgriChain has
 * to be typed again. Only the quantity is genuinely new information.
 */
const getAvailabilitySuggestions = async (req, res) => {
  const requestId = newRequestId();
  try {
    const suggestions = await availabilityService.suggestFromFarms(req.user.id);
    return res.json({
      success: true,
      data: suggestions,
      meta: {
        count: suggestions.length,
        note: 'Crop and location come from your saved fields. Only the quantity is needed.',
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/farmer/availability */
const createAvailability = async (req, res) => {
  const requestId = newRequestId();
  try {
    const { valid, value, errors } = validator.validateAvailability(req.body, false);
    if (!valid) return sendValidationError(res, errors, requestId);

    const listing = await availabilityService.create(req.user.id, value);
    return res.status(201).json({ success: true, data: listing, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** PATCH /api/marketplace/farmer/availability/:id */
const updateAvailability = async (req, res) => {
  const requestId = newRequestId();
  try {
    const { valid, value, errors } = validator.validateAvailability(req.body, true);
    if (!valid) return sendValidationError(res, errors, requestId);

    const listing = await availabilityService.update({
      availabilityId: req.params.id,
      userId: req.user.id,
      changes: value
    });
    return res.json({ success: true, data: listing, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * DELETE /api/marketplace/farmer/availability/:id
 *
 * Removes one crop listing. The listing is deactivated rather than erased, so the
 * offers and deals that point at it keep their crop context — see
 * availabilityService.remove. Refused with 409 while crop is promised to a deal.
 */
const deleteAvailability = async (req, res) => {
  const requestId = newRequestId();
  try {
    const listing = await availabilityService.remove({
      availabilityId: req.params.id,
      userId: req.user.id
    });
    return res.json({
      success: true,
      data: listing,
      meta: {
        requestId,
        note: 'The crop is no longer shown to buyers. Deals already agreed are unaffected.'
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ===========================================================================
// Matching and comparison — farmer side
// ===========================================================================

/** GET /api/marketplace/farmer/matches */
const getFarmerMatches = async (req, res) => {
  const requestId = newRequestId();
  try {
    let crop = null;
    if (req.query.crop) {
      const resolved = validator.validateCrop(req.query.crop);
      if (!resolved.valid) return sendValidationError(res, [resolved.error], requestId);
      crop = resolved.value;
    }

    const result = await matchingService.findMatchesForFarmer({
      userId: req.user.id,
      availabilityId: req.query.availabilityId || null,
      filters: {
        crop,
        minPricePerKg: req.query.minPricePerKg ? Number(req.query.minPricePerKg) : null,
        maxDistanceKm: req.query.maxDistanceKm ? Number(req.query.maxDistanceKm) : null,
        requiredByBefore: req.query.requiredByBefore || null,
        buyerType: req.query.buyerType || null,
        verifiedOnly: req.query.verifiedOnly === 'true'
      },
      limit: parseInt(req.query.limit, 10) || 50
    });

    return res.json({
      success: true,
      data: result.matches,
      meta: { count: result.matches.length, diagnostics: result.diagnostics, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/marketplace/farmer/top-buyers?availabilityId= */
const getTopBuyers = async (req, res) => {
  const requestId = newRequestId();
  try {
    if (!req.query.availabilityId) {
      return sendValidationError(res, [{
        field: 'availabilityId',
        code: 'AVAILABILITY_REQUIRED',
        message: 'Choose which crop you want to compare buyers for.'
      }], requestId);
    }

    const result = await buyerComparisonService.getTopBuyers({
      userId: req.user.id,
      availabilityId: req.query.availabilityId,
      filters: {
        verifiedOnly: req.query.verifiedOnly === 'true',
        maxDistanceKm: req.query.maxDistanceKm ? Number(req.query.maxDistanceKm) : null,
        vehicleType: req.query.vehicleType || null
      },
      limit: parseInt(req.query.limit, 10) || 10
    });

    return res.json({
      success: true,
      data: result,
      meta: { count: result.buyers.length, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/marketplace/selling-options?availabilityId= */
const getSellingOptions = async (req, res) => {
  const requestId = newRequestId();
  try {
    if (!req.query.availabilityId) {
      return sendValidationError(res, [{
        field: 'availabilityId',
        code: 'AVAILABILITY_REQUIRED',
        message: 'Choose which crop you want to see selling options for.'
      }], requestId);
    }

    console.log(
      `[Marketplace] [${requestId}] selling-options user=${req.user.id} ` +
      `availability=${req.query.availabilityId}`
    );

    const result = await buyerComparisonService.getSellingOptions({
      userId: req.user.id,
      availabilityId: req.query.availabilityId,
      filters: { verifiedOnly: req.query.verifiedOnly === 'true' }
    });

    return res.json({ success: true, data: result, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/marketplace/buyer/summary — buyer dashboard counters. */
const getBuyerSummary = async (req, res) => {
  const requestId = newRequestId();
  try {
    const summary = await requirementService.getBuyerSummary(req.buyerProfile.id);
    return res.json({ success: true, data: summary, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

module.exports = {
  createRequirement,
  listRequirements,
  getRequirement,
  updateRequirement,
  publishRequirement,
  closeRequirement,
  getMatchingFarmers,
  browseAvailability,
  listMyAvailability,
  getAvailabilitySuggestions,
  createAvailability,
  updateAvailability,
  deleteAvailability,
  getFarmerMatches,
  getTopBuyers,
  getSellingOptions,
  getBuyerSummary
};

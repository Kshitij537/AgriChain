/**
 * Request validation for the market module.
 *
 * Validation happens before any external call: a bad quantity should cost one
 * comparison, not a routing request, an ML inference and a weather lookup. Each
 * failure returns a machine-readable code plus a message written for a farmer,
 * not a stack trace.
 */

const spoilageService = require('../services/spoilageService');
const { SUPPORTED_HORIZONS } = require('../services/pricePredictionService');

/** Sanity ceiling on a single consignment. */
const MAX_QUANTITY_KG = 100000;

/** How far ahead a harvest may be scheduled and still be planned for. */
const MAX_FUTURE_HARVEST_DAYS = 30;

/** How far back a harvest date can be before it is almost certainly a typo. */
const MAX_PAST_HARVEST_DAYS = 365;

/**
 * Builds a validation failure.
 * @param {string} field
 * @param {string} code
 * @param {string} message
 * @returns {object}
 */
const fail = (field, code, message) => ({ field, code, message });

/**
 * Validates quantity in kilograms.
 * @param {*} value
 * @returns {object} { valid, value, error }
 */
const validateQuantity = (value) => {
  if (value === undefined || value === null || value === '') {
    return { valid: false, error: fail('quantityKg', 'QUANTITY_REQUIRED', 'How many kilograms are you selling?') };
  }

  const quantity = Number(value);

  if (!Number.isFinite(quantity)) {
    return { valid: false, error: fail('quantityKg', 'QUANTITY_INVALID', 'Quantity must be a number in kilograms.') };
  }
  if (quantity === 0) {
    return { valid: false, error: fail('quantityKg', 'QUANTITY_ZERO', 'Quantity cannot be zero.') };
  }
  if (quantity < 0) {
    return { valid: false, error: fail('quantityKg', 'QUANTITY_NEGATIVE', 'Quantity cannot be negative.') };
  }
  if (quantity > MAX_QUANTITY_KG) {
    return {
      valid: false,
      error: fail(
        'quantityKg',
        'QUANTITY_TOO_LARGE',
        `Quantity above ${MAX_QUANTITY_KG.toLocaleString('en-IN')} kg looks like an error. ` +
        'Enter kilograms, not grams.'
      )
    };
  }

  return { valid: true, value: quantity };
};

/**
 * Validates the crop and resolves it to a known crop profile key.
 *
 * A crop with no profile cannot have its spoilage estimated, so it is rejected
 * here rather than silently falling back to a generic profile that would produce
 * a plausible-looking but unfounded loss figure.
 *
 * @param {*} value
 * @returns {object} { valid, value, error }
 */
const validateCrop = (value) => {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return { valid: false, error: fail('crop', 'CROP_REQUIRED', 'Which crop are you selling?') };
  }

  const key = spoilageService.resolveCropKey(value.trim());
  const profile = spoilageService.CROP_PROFILES[key];

  if (!profile) {
    const supported = Object.keys(spoilageService.CROP_PROFILES).join(', ');
    return {
      valid: false,
      error: fail(
        'crop',
        'CROP_NOT_SUPPORTED',
        `"${value}" is not a supported crop yet. Supported crops: ${supported}.`
      )
    };
  }

  return { valid: true, value: key };
};

/**
 * Validates a harvest date.
 * @param {*} value
 * @returns {object} { valid, value, error }
 */
const validateHarvestDate = (value) => {
  if (value === undefined || value === null || value === '') {
    // Optional: the engine treats a missing date as "harvested today".
    return { valid: true, value: null };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      valid: false,
      error: fail('harvestDate', 'HARVEST_DATE_INVALID', 'Harvest date must be a date like 2026-09-21.')
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysFromToday = Math.round((date - today) / 86400000);

  if (daysFromToday > MAX_FUTURE_HARVEST_DAYS) {
    return {
      valid: false,
      error: fail(
        'harvestDate',
        'HARVEST_DATE_TOO_FAR_FUTURE',
        `Harvest dates more than ${MAX_FUTURE_HARVEST_DAYS} days ahead cannot be planned against ` +
        'current mandi prices.'
      )
    };
  }
  if (daysFromToday < -MAX_PAST_HARVEST_DAYS) {
    return {
      valid: false,
      error: fail('harvestDate', 'HARVEST_DATE_TOO_OLD', 'That harvest date is more than a year ago.')
    };
  }

  return { valid: true, value: date.toISOString().slice(0, 10) };
};

/**
 * Validates optional production cost.
 * @param {*} value
 * @returns {object} { valid, value, error }
 */
const validateProductionCost = (value) => {
  if (value === undefined || value === null || value === '') {
    // Optional by design: breakeven reports productionCostAvailable:false.
    return { valid: true, value: null };
  }

  const cost = Number(value);
  if (!Number.isFinite(cost)) {
    return {
      valid: false,
      error: fail('productionCost', 'PRODUCTION_COST_INVALID', 'Production cost must be an amount in rupees.')
    };
  }
  if (cost < 0) {
    return {
      valid: false,
      error: fail('productionCost', 'PRODUCTION_COST_NEGATIVE', 'Production cost cannot be negative.')
    };
  }

  return { valid: true, value: cost || null };
};

/**
 * Lowest believable cost of GROWING one kilogram, in rupees.
 *
 * Nothing AgriChain prices is produced for under a rupee a kilo - the cheapest
 * bulk crops here run to tens of rupees, and even a farmer who got free seed
 * spent something on labour. Set deliberately far below any real figure so this
 * can only ever catch an error, never a legitimate entry.
 */
const MIN_PLAUSIBLE_COST_PER_KG = 1;

/**
 * Cross-checks production cost against quantity.
 *
 * `productionCost` is the TOTAL spent on the batch, and the field that invites
 * being filled in with a PER-KILOGRAM figure instead - the same class of mistake
 * as quoting a mandi price per quintal. The consequence is not a slightly odd
 * number: ₹52 against 1,000 kg yields a ₹0.05/kg break-even, so the engine
 * reports almost the entire sale as profit and a four-figure ROI. A farmer could
 * plan a season on that.
 *
 * Rejected rather than silently corrected, because only the farmer knows whether
 * they meant ₹52 per kg or ₹52,000 for the lot - so the message names both and
 * does the arithmetic.
 *
 * @param {number|null} productionCost - total rupees, already validated
 * @param {number|null} quantityKg - already validated
 * @returns {object} { valid, error }
 */
const validateProductionCostPerKg = (productionCost, quantityKg) => {
  if (!productionCost || !quantityKg) return { valid: true };

  const perKg = productionCost / quantityKg;
  if (perKg >= MIN_PLAUSIBLE_COST_PER_KG) return { valid: true };

  const asTotal = Math.round(productionCost * quantityKg);
  return {
    valid: false,
    error: fail('productionCost', 'PRODUCTION_COST_IMPLAUSIBLE',
      `₹${productionCost} for ${quantityKg} kg works out to ₹${perKg.toFixed(2)} per kg to grow, ` +
      'which would make nearly the whole sale look like profit. Enter the TOTAL you spent on ' +
      `this batch — if you meant ₹${productionCost} per kg, that is ₹${asTotal.toLocaleString('en-IN')}.`)
  };
};

/**
 * Validates a farm id.
 * @param {*} value
 * @returns {object} { valid, value, error }
 */
const validateFarmId = (value) => {
  if (value === undefined || value === null || value === '') {
    return { valid: false, error: fail('farmId', 'FARM_ID_REQUIRED', 'Select which field this harvest came from.') };
  }

  // Accept the "farm_123" form the brief's example uses, alongside a plain id.
  const normalised = String(value).replace(/^farm[_-]?/i, '');
  const farmId = parseInt(normalised, 10);

  if (!Number.isFinite(farmId) || farmId <= 0) {
    return { valid: false, error: fail('farmId', 'FARM_ID_INVALID', 'Farm id must be a positive number.') };
  }

  return { valid: true, value: farmId };
};

/**
 * Validates the POST /api/market/recommend body.
 *
 * Collects ALL errors rather than stopping at the first, so a farmer fixing a
 * form sees everything wrong with it at once.
 *
 * @param {object} body
 * @returns {object} { valid, value, errors }
 */
const validateRecommendRequest = (body = {}) => {
  const errors = [];
  const value = {};

  const crop = validateCrop(body.crop);
  if (crop.valid) value.crop = crop.value; else errors.push(crop.error);

  const quantity = validateQuantity(body.quantityKg ?? body.quantity);
  if (quantity.valid) value.quantityKg = quantity.value; else errors.push(quantity.error);

  const farmId = validateFarmId(body.farmId ?? body.farm_id);
  if (farmId.valid) value.farmId = farmId.value; else errors.push(farmId.error);

  const harvestDate = validateHarvestDate(body.harvestDate ?? body.harvest_date);
  if (harvestDate.valid) value.harvestDate = harvestDate.value; else errors.push(harvestDate.error);

  const productionCost = validateProductionCost(body.productionCost ?? body.production_cost);
  if (productionCost.valid) value.productionCost = productionCost.value;
  else errors.push(productionCost.error);

  // Cross-field, so it runs only once both sides are known to be numbers.
  if (productionCost.valid && quantity.valid) {
    const perKg = validateProductionCostPerKg(productionCost.value, quantity.value);
    if (!perKg.valid) errors.push(perKg.error);
  }

  // --- optional refinements, defaulted rather than rejected -----------------
  const storageType = String(body.storageType || 'open').toLowerCase();
  value.storageType = spoilageService.STORAGE_TYPES[storageType] ? storageType : 'open';

  value.vehicleType = body.vehicleType ? String(body.vehicleType) : null;

  const horizon = parseInt(body.predictionDays, 10);
  value.predictionDays = SUPPORTED_HORIZONS.includes(horizon) ? horizon : 1;

  value.includeRouteGeometry = body.includeRouteGeometry === true;

  return { valid: errors.length === 0, value, errors };
};

/**
 * Validates the GET /api/market/prices query.
 * @param {object} queryParams
 * @returns {object} { valid, value, errors }
 */
const validatePriceQuery = (queryParams = {}) => {
  const errors = [];
  const value = {};

  const crop = validateCrop(queryParams.crop);
  if (crop.valid) value.crop = crop.value; else errors.push(crop.error);

  // Coordinates are optional: without them every market is returned unsorted;
  // with them the response is distance-ordered.
  const lat = Number(queryParams.lat ?? queryParams.latitude);
  const lon = Number(queryParams.lon ?? queryParams.longitude);
  const hasCoordinates =
    Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);

  if ((queryParams.lat || queryParams.latitude) && !hasCoordinates) {
    errors.push(fail('lat', 'COORDINATES_INVALID', 'Latitude and longitude must both be valid numbers.'));
  }

  value.latitude = hasCoordinates ? lat : null;
  value.longitude = hasCoordinates ? lon : null;

  const radius = Number(queryParams.radiusKm);
  value.radiusKm = Number.isFinite(radius) && radius > 0 ? radius : null;

  return { valid: errors.length === 0, value, errors };
};

module.exports = {
  validateRecommendRequest,
  validatePriceQuery,
  validateCrop,
  validateQuantity,
  validateHarvestDate,
  validateProductionCost,
  validateProductionCostPerKg,
  validateFarmId,
  MAX_QUANTITY_KG,
  MIN_PLAUSIBLE_COST_PER_KG
};

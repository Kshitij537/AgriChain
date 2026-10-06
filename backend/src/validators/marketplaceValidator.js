/**
 * Marketplace request validation.
 *
 * Mirrors the style of validators/marketValidator.js: every failure carries a
 * machine-readable code plus a message written for a farmer or a small business
 * owner, and ALL errors from one request are collected rather than stopping at
 * the first, so a form can be fixed in a single pass.
 *
 * These checks are the first line; the database CHECK constraints in
 * marketplace.sql are the second and cannot be bypassed. Both exist on purpose -
 * validation gives a good message, the constraint guarantees correctness.
 */

const spoilageService = require('../services/spoilageService');
const buyerService = require('../services/buyerService');

/** Sanity ceiling on a single requirement or availability record. */
const MAX_QUANTITY_KG = 1000000;
/**
 * Ceiling on a per-kilogram price.
 *
 * Set deliberately low at ₹2,000/kg. Every crop AgriChain supports trades far
 * below this - even dried chilli peaks in the low hundreds per kg - so anything
 * above it is a data-entry error, and specifically THE error this domain invites:
 * mandi rates are quoted per QUINTAL, so someone meaning ₹30/kg types 3000.
 * A generous ceiling would let that through and advertise a requirement at 100x
 * the intended price.
 */
const MAX_PRICE_PER_KG = 2000;

/**
 * Above this, the message names the quintal mistake explicitly rather than just
 * saying "too high", because that is almost always what happened.
 */
const LIKELY_QUINTAL_THRESHOLD = 500;
/** How far ahead a requirement may be dated. */
const MAX_FUTURE_DAYS = 365;

const fail = (field, code, message) => ({ field, code, message });

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

/**
 * Normalises a crop name to a crop_profiles key.
 *
 * The brief requires normalised crop identifiers rather than free-text equality,
 * and this is where that happens: 'Tomatoes', 'tamatar' and 'TOMATO' all become
 * 'tomato', so a buyer requirement and a farmer's availability can be compared
 * with a plain equality test.
 *
 * @param {*} value
 * @returns {object} { valid, value, error }
 */
const validateCrop = (value) => {
  if (isBlank(value)) {
    return { valid: false, error: fail('crop', 'CROP_REQUIRED', 'Which crop is this for?') };
  }
  const key = spoilageService.resolveCropKey(String(value).trim());
  if (!key) {
    const supported = Object.keys(spoilageService.CROP_PROFILES).slice(0, 8).join(', ');
    return {
      valid: false,
      error: fail('crop', 'CROP_NOT_SUPPORTED',
        `"${value}" is not a supported crop yet. Try one of: ${supported}...`)
    };
  }
  return { valid: true, value: key };
};

/**
 * Validates a quantity in kilograms.
 * @param {*} value
 * @param {string} [field]
 * @returns {object}
 */
const validateQuantityKg = (value, field = 'quantityKg') => {
  if (isBlank(value)) {
    return { valid: false, error: fail(field, 'QUANTITY_REQUIRED', 'How many kilograms?') };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { valid: false, error: fail(field, 'QUANTITY_INVALID', 'Quantity must be a number in kilograms.') };
  }
  if (n === 0) return { valid: false, error: fail(field, 'QUANTITY_ZERO', 'Quantity cannot be zero.') };
  if (n < 0) return { valid: false, error: fail(field, 'QUANTITY_NEGATIVE', 'Quantity cannot be negative.') };
  if (n > MAX_QUANTITY_KG) {
    return {
      valid: false,
      error: fail(field, 'QUANTITY_TOO_LARGE',
        `Quantity above ${MAX_QUANTITY_KG.toLocaleString('en-IN')} kg looks like an error. Enter kilograms.`)
    };
  }
  return { valid: true, value: Math.round(n * 100) / 100 };
};

/**
 * Validates a price per kilogram.
 * @param {*} value
 * @returns {object}
 */
const validatePricePerKg = (value) => {
  if (isBlank(value)) {
    return { valid: false, error: fail('offeredPricePerKg', 'PRICE_REQUIRED', 'What price per kg are you offering?') };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { valid: false, error: fail('offeredPricePerKg', 'PRICE_INVALID', 'Price must be a number in rupees per kg.') };
  }
  if (n <= 0) {
    return { valid: false, error: fail('offeredPricePerKg', 'PRICE_NOT_POSITIVE', 'Price must be more than zero.') };
  }
  if (n > MAX_PRICE_PER_KG) {
    // Name the likely cause and show the conversion, so the fix is obvious.
    const asPerKg = Math.round((n / 100) * 100) / 100;
    return {
      valid: false,
      error: fail('offeredPricePerKg', 'PRICE_TOO_HIGH',
        n >= LIKELY_QUINTAL_THRESHOLD
          ? `₹${n} per KILOGRAM is too high — did you mean ₹${n} per quintal, which is ₹${asPerKg}/kg?`
          : `₹${n}/kg is above the ₹${MAX_PRICE_PER_KG}/kg limit. Enter the price per kilogram.`)
    };
  }
  return { valid: true, value: Math.round(n * 100) / 100 };
};

/**
 * Validates a date, optionally requiring it to be in the future.
 * @param {*} value
 * @param {object} options - { field, label, required, mustBeFuture }
 * @returns {object}
 */
const validateDate = (value, { field, label, required = true, mustBeFuture = true } = {}) => {
  if (isBlank(value)) {
    if (!required) return { valid: true, value: null };
    return { valid: false, error: fail(field, 'DATE_REQUIRED', `${label} is required.`) };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: fail(field, 'DATE_INVALID', `${label} must be a date like 2026-10-05.`) };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);

  if (mustBeFuture && days < 0) {
    return { valid: false, error: fail(field, 'DATE_IN_PAST', `${label} cannot be in the past.`) };
  }
  if (days > MAX_FUTURE_DAYS) {
    return {
      valid: false,
      error: fail(field, 'DATE_TOO_FAR', `${label} cannot be more than a year ahead.`)
    };
  }
  return { valid: true, value: date.toISOString().slice(0, 10) };
};

// ---------------------------------------------------------------------------
// Buyer profile
// ---------------------------------------------------------------------------

/**
 * Validates a buyer profile create/update body.
 *
 * `verificationStatus`, `isSuspended` and document paths are NOT accepted here
 * under any name. buyerService writes only an explicit column allow-list, so even
 * if they appeared in the body they could not reach the database.
 *
 * @param {object} body
 * @param {boolean} [isUpdate] - update allows partial input
 * @returns {object} { valid, value, errors }
 */
const validateBuyerProfile = (body = {}, isUpdate = false) => {
  const errors = [];
  const value = {};

  if (!isUpdate || body.businessName !== undefined) {
    if (isBlank(body.businessName)) {
      errors.push(fail('businessName', 'BUSINESS_NAME_REQUIRED', 'What is your business called?'));
    } else if (String(body.businessName).trim().length < 2) {
      errors.push(fail('businessName', 'BUSINESS_NAME_TOO_SHORT', 'Business name is too short.'));
    } else {
      value.businessName = String(body.businessName).trim().slice(0, 255);
    }
  }

  if (!isUpdate || body.buyerType !== undefined) {
    const type = String(body.buyerType || '').trim().toLowerCase();
    if (!buyerService.BUYER_TYPES.includes(type)) {
      errors.push(fail('buyerType', 'BUYER_TYPE_INVALID',
        `Choose a business type: ${buyerService.BUYER_TYPES.join(', ')}.`));
    } else {
      value.buyerType = type;
    }
  }

  // --- optional text fields ---
  for (const [key, max] of [
    ['contactPerson', 255], ['address', 1000], ['villageCity', 255],
    ['district', 100], ['state', 100]
  ]) {
    if (body[key] !== undefined) {
      value[key] = isBlank(body[key]) ? null : String(body[key]).trim().slice(0, max);
    }
  }

  if (body.businessPhone !== undefined) {
    if (isBlank(body.businessPhone)) {
      value.businessPhone = null;
    } else {
      const digits = String(body.businessPhone).replace(/[^\d+]/g, '');
      if (digits.replace(/\D/g, '').length < 10) {
        errors.push(fail('businessPhone', 'PHONE_INVALID', 'Enter a 10-digit phone number.'));
      } else {
        value.businessPhone = digits.slice(0, 20);
      }
    }
  }

  if (body.businessEmail !== undefined) {
    if (isBlank(body.businessEmail)) {
      value.businessEmail = null;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.businessEmail).trim())) {
      errors.push(fail('businessEmail', 'EMAIL_INVALID', 'Enter a valid email address.'));
    } else {
      value.businessEmail = String(body.businessEmail).trim().toLowerCase().slice(0, 255);
    }
  }

  if (body.pinCode !== undefined) {
    if (isBlank(body.pinCode)) {
      value.pinCode = null;
    } else if (!/^\d{6}$/.test(String(body.pinCode).trim())) {
      errors.push(fail('pinCode', 'PIN_INVALID', 'PIN code must be 6 digits.'));
    } else {
      value.pinCode = String(body.pinCode).trim();
    }
  }

  // --- coordinates: both or neither ---
  if (body.latitude !== undefined || body.longitude !== undefined) {
    const lat = Number(body.latitude);
    const lon = Number(body.longitude);
    const bothBlank = isBlank(body.latitude) && isBlank(body.longitude);

    if (bothBlank) {
      value.latitude = null;
      value.longitude = null;
    } else if (!Number.isFinite(lat) || !Number.isFinite(lon)
               || Math.abs(lat) > 90 || Math.abs(lon) > 180
               || (lat === 0 && lon === 0)) {
      errors.push(fail('latitude', 'COORDINATES_INVALID',
        'Business location must be a valid latitude and longitude, or left blank.'));
    } else {
      value.latitude = lat;
      value.longitude = lon;
    }
  }

  // --- crops purchased: normalised, unknown entries reported not silently dropped ---
  if (body.cropsPurchased !== undefined) {
    const raw = Array.isArray(body.cropsPurchased)
      ? body.cropsPurchased
      : String(body.cropsPurchased || '').split(',');
    const resolved = [];
    const unknown = [];
    for (const entry of raw) {
      if (isBlank(entry)) continue;
      const key = spoilageService.resolveCropKey(String(entry).trim());
      if (key) { if (!resolved.includes(key)) resolved.push(key); }
      else unknown.push(String(entry).trim());
    }
    if (unknown.length) {
      errors.push(fail('cropsPurchased', 'CROPS_NOT_SUPPORTED',
        `These crops are not supported yet: ${unknown.join(', ')}.`));
    } else {
      value.cropsPurchased = resolved;
    }
  }

  if (body.typicalPurchaseQuantityKg !== undefined && !isBlank(body.typicalPurchaseQuantityKg)) {
    const q = validateQuantityKg(body.typicalPurchaseQuantityKg, 'typicalPurchaseQuantityKg');
    if (q.valid) value.typicalPurchaseQuantityKg = q.value; else errors.push(q.error);
  }

  if (body.serviceAreaKm !== undefined && !isBlank(body.serviceAreaKm)) {
    const km = Number(body.serviceAreaKm);
    if (!Number.isFinite(km) || km <= 0 || km > 2000) {
      errors.push(fail('serviceAreaKm', 'SERVICE_AREA_INVALID',
        'Service area must be between 1 and 2000 km.'));
    } else {
      value.serviceAreaKm = km;
    }
  }

  return { valid: errors.length === 0, value, errors };
};

// ---------------------------------------------------------------------------
// Buyer requirement
// ---------------------------------------------------------------------------

/**
 * Validates a requirement create/update body.
 *
 * Cross-field rules enforced here rather than left to the database, so the
 * message can explain the relationship rather than naming a constraint:
 *   - expiry cannot precede the required-by date
 *   - at least one of pickup/delivery must be possible
 *   - minimum acceptable quantity cannot exceed the total needed
 *
 * @param {object} body
 * @param {boolean} [isUpdate]
 * @returns {object} { valid, value, errors }
 */
const validateRequirement = (body = {}, isUpdate = false) => {
  const errors = [];
  const value = {};

  if (!isUpdate || body.crop !== undefined) {
    const crop = validateCrop(body.crop);
    if (crop.valid) value.crop = crop.value; else errors.push(crop.error);
  }

  if (!isUpdate || body.quantityRequiredKg !== undefined) {
    const q = validateQuantityKg(body.quantityRequiredKg, 'quantityRequiredKg');
    if (q.valid) value.quantityRequiredKg = q.value; else errors.push(q.error);
  }

  if (!isUpdate || body.offeredPricePerKg !== undefined) {
    const p = validatePricePerKg(body.offeredPricePerKg);
    if (p.valid) value.offeredPricePerKg = p.value; else errors.push(p.error);
  }

  if (!isUpdate || body.requiredBy !== undefined) {
    const d = validateDate(body.requiredBy, { field: 'requiredBy', label: 'Required-by date' });
    if (d.valid) value.requiredBy = d.value; else errors.push(d.error);
  }

  if (!isUpdate || body.expiresAt !== undefined) {
    const d = validateDate(body.expiresAt, { field: 'expiresAt', label: 'Requirement expiry date' });
    if (d.valid) value.expiresAt = d.value; else errors.push(d.error);
  }

  // Expiry before the crop is needed would make the requirement unusable the
  // moment it opened.
  if (value.requiredBy && value.expiresAt && value.expiresAt < value.requiredBy) {
    errors.push(fail('expiresAt', 'EXPIRY_BEFORE_REQUIRED_BY',
      'The requirement cannot expire before the date you need the crop.'));
  }

  if (!isUpdate || body.deliveryLocation !== undefined) {
    if (isBlank(body.deliveryLocation)) {
      if (!isUpdate) {
        errors.push(fail('deliveryLocation', 'LOCATION_REQUIRED',
          'Where should the crop be delivered or collected?'));
      }
    } else {
      value.deliveryLocation = String(body.deliveryLocation).trim().slice(0, 1000);
    }
  }

  // --- optional ---
  for (const [key, max] of [
    ['variety', 100], ['minimumQualityGrade', 32], ['deliveryDistrict', 100],
    ['specialRequirements', 2000], ['description', 4000]
  ]) {
    if (body[key] !== undefined) {
      value[key] = isBlank(body[key]) ? null : String(body[key]).trim().slice(0, max);
    }
  }

  for (const key of ['priceNegotiable', 'partialFulfillmentAllowed', 'pickupAvailable', 'deliveryRequired']) {
    if (body[key] !== undefined) value[key] = body[key] === true || body[key] === 'true';
  }

  // A requirement with neither arrangement can never be fulfilled.
  const pickup = value.pickupAvailable ?? false;
  const delivery = value.deliveryRequired ?? true;
  if (!isUpdate && !pickup && !delivery) {
    errors.push(fail('pickupAvailable', 'NO_FULFILMENT_ARRANGEMENT',
      'Choose at least one: you collect from the farm, or the farmer delivers.'));
  }

  if (body.minimumAcceptableQuantityKg !== undefined && !isBlank(body.minimumAcceptableQuantityKg)) {
    const q = validateQuantityKg(body.minimumAcceptableQuantityKg, 'minimumAcceptableQuantityKg');
    if (!q.valid) errors.push(q.error);
    else if (value.quantityRequiredKg && q.value > value.quantityRequiredKg) {
      errors.push(fail('minimumAcceptableQuantityKg', 'MIN_EXCEEDS_TOTAL',
        'The smallest acceptable lot cannot be more than the total quantity you need.'));
    } else {
      value.minimumAcceptableQuantityKg = q.value;
    }
  }

  if (body.latitude !== undefined || body.longitude !== undefined) {
    const lat = Number(body.latitude);
    const lon = Number(body.longitude);
    if (isBlank(body.latitude) && isBlank(body.longitude)) {
      value.latitude = null; value.longitude = null;
    } else if (!Number.isFinite(lat) || !Number.isFinite(lon)
               || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      errors.push(fail('latitude', 'COORDINATES_INVALID',
        'Delivery location coordinates are not valid.'));
    } else {
      value.latitude = lat; value.longitude = lon;
    }
  }

  return { valid: errors.length === 0, value, errors };
};

// ---------------------------------------------------------------------------
// Farmer crop availability
// ---------------------------------------------------------------------------

/**
 * Validates a farmer availability create/update body.
 * @param {object} body
 * @param {boolean} [isUpdate]
 * @returns {object}
 */
const validateAvailability = (body = {}, isUpdate = false) => {
  const errors = [];
  const value = {};

  if (!isUpdate || body.crop !== undefined) {
    const crop = validateCrop(body.crop);
    if (crop.valid) value.crop = crop.value; else errors.push(crop.error);
  }

  if (!isUpdate || body.totalHarvestedKg !== undefined) {
    const q = validateQuantityKg(body.totalHarvestedKg, 'totalHarvestedKg');
    if (q.valid) value.totalHarvestedKg = q.value; else errors.push(q.error);
  }

  if (body.availableKg !== undefined) {
    const q = validateQuantityKg(body.availableKg, 'availableKg');
    if (!q.valid) errors.push(q.error);
    else if (value.totalHarvestedKg !== undefined && q.value > value.totalHarvestedKg) {
      errors.push(fail('availableKg', 'AVAILABLE_EXCEEDS_HARVEST',
        'You cannot offer more than you harvested.'));
    } else {
      value.availableKg = q.value;
    }
  }

  if (body.farmId !== undefined && !isBlank(body.farmId)) {
    const farmId = parseInt(String(body.farmId).replace(/^farm[_-]?/i, ''), 10);
    if (!Number.isFinite(farmId) || farmId <= 0) {
      errors.push(fail('farmId', 'FARM_ID_INVALID', 'Select a valid field.'));
    } else {
      value.farmId = farmId;
    }
  }

  if (body.harvestStatus !== undefined) {
    const status = String(body.harvestStatus).trim().toLowerCase();
    if (!['expected', 'harvesting', 'harvested', 'stored'].includes(status)) {
      errors.push(fail('harvestStatus', 'HARVEST_STATUS_INVALID',
        'Harvest status must be: expected, harvesting, harvested or stored.'));
    } else {
      value.harvestStatus = status;
    }
  }

  if (body.harvestDate !== undefined) {
    // A harvest may legitimately be in the past, unlike a requirement date.
    const d = validateDate(body.harvestDate, {
      field: 'harvestDate', label: 'Harvest date', required: false, mustBeFuture: false
    });
    if (d.valid) value.harvestDate = d.value; else errors.push(d.error);
  }

  for (const [key, max] of [['variety', 100], ['qualityGrade', 32]]) {
    if (body[key] !== undefined) {
      value[key] = isBlank(body[key]) ? null : String(body[key]).trim().slice(0, max);
    }
  }

  if (body.storageType !== undefined) {
    const s = String(body.storageType).trim().toLowerCase();
    value.storageType = spoilageService.STORAGE_TYPES[s] ? s : 'open';
  }

  return { valid: errors.length === 0, value, errors };
};

module.exports = {
  MAX_QUANTITY_KG,
  MAX_PRICE_PER_KG,
  LIKELY_QUINTAL_THRESHOLD,
  validateCrop,
  validateQuantityKg,
  validatePricePerKg,
  validateDate,
  validateBuyerProfile,
  validateRequirement,
  validateAvailability
};

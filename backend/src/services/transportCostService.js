/**
 * Transport cost engine.
 *
 * The single place in the codebase where freight is priced. Nothing else may
 * compute a transport cost: if a second formula existed, the ledger the farmer
 * sees and the ranking that chose the mandi could disagree, and the farmer would
 * have no way to tell which was wrong.
 *
 * Deterministic and configuration-driven - no ML. Rates live in the
 * transport_config table so they can be corrected for a district or a fuel-price
 * change without a code deploy.
 *
 *   cost = max(minimum_charge,
 *              distance_km x rate_per_km x return_trip_factor x trips)
 *        + (loading_cost + unloading_cost) x trips
 *
 * WHY return_trip_factor
 * ----------------------
 * A transporter charges for the empty trip home. Quoting only the loaded leg
 * under-states freight by roughly a quarter, which is exactly the size of the
 * gap that decides between a near and a far mandi. The factor is per-vehicle
 * configuration, not a constant.
 *
 * WHY trips
 * ---------
 * A 4 t load in a 3 t vehicle is two hires, not one. Quantity therefore changes
 * cost even at a fixed distance.
 *
 * All arithmetic is in integer paise (utils/money) - never binary floats.
 */

const { query } = require('../config/db');
const money = require('../utils/money');
const freightRateService = require('./freightRateService');

/**
 * Fallback vehicle used only when transport_config is empty or unreachable.
 *
 * This mirrors the 'small_truck' row seeded by scripts/seedMarketData.js. It
 * exists so a database hiccup degrades to a documented default instead of a
 * crash, and any result using it is flagged with configSource='FALLBACK_DEFAULT'.
 */
const FALLBACK_VEHICLE = {
  vehicle_type: 'small_truck',
  label: 'Mini Truck (Tata Ace class)',
  rate_per_km: '25',
  loading_cost: '300',
  unloading_cost: '200',
  minimum_charge: '900',
  capacity_kg: '3000',
  return_trip_factor: '1.30',
  config_version: 'transport_v1_fallback'
};

/** Vehicle config cache: rates change rarely, and every market reuses them. */
let _vehicleCache = null;
let _vehicleCacheAt = 0;
const VEHICLE_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Loads active vehicle configurations, cheapest per-km first.
 * @returns {Promise<Array>} transport_config rows
 */
const loadVehicles = async () => {
  if (_vehicleCache && Date.now() - _vehicleCacheAt < VEHICLE_CACHE_TTL_MS) {
    return _vehicleCache;
  }

  try {
    const result = await query(
      `SELECT vehicle_type, label, rate_per_km, loading_cost, unloading_cost,
              minimum_charge, capacity_kg, return_trip_factor, config_version,
              mileage_kmpl, fixed_cost_per_km, rate_source, rate_source_note,
              baseline_diesel_price, baseline_set_on
       FROM transport_config
       WHERE active = TRUE
       ORDER BY capacity_kg ASC`
    );

    if (!result.rows.length) {
      console.warn('[Transport] transport_config is empty - using fallback vehicle. Run: npm run seed:market');
      return [FALLBACK_VEHICLE];
    }

    _vehicleCache = result.rows;
    _vehicleCacheAt = Date.now();
    return _vehicleCache;
  } catch (error) {
    console.warn(`[Transport] Could not read transport_config (${error.message}) - using fallback vehicle`);
    return [FALLBACK_VEHICLE];
  }
};

/** Clears the vehicle config cache. Exposed for tests and admin rate updates. */
const clearVehicleCache = () => {
  _vehicleCache = null;
  _vehicleCacheAt = 0;
};

/**
 * Picks the smallest vehicle that can carry the load in one trip.
 *
 * Smallest-that-fits is the cheapest real-world choice: a farmer with 500 kg
 * hires a tempo, not a 9-tonne truck. If the load exceeds every vehicle, the
 * largest is used and the trip count carries the excess.
 *
 * @param {Array} vehicles - config rows, ascending capacity
 * @param {number} quantityKg
 * @param {string} [preferredType] - force a specific vehicle_type
 * @returns {object} the chosen config row
 */
const selectVehicle = (vehicles, quantityKg, preferredType = null) => {
  if (preferredType) {
    const forced = vehicles.find((v) => v.vehicle_type === preferredType);
    if (forced) return forced;
  }

  const fits = vehicles.find((v) => {
    const capacity = Number(v.capacity_kg);
    return Number.isFinite(capacity) && capacity > 0 && quantityKg <= capacity;
  });

  return fits || vehicles[vehicles.length - 1];
};

/**
 * Trips needed to move the load with the chosen vehicle.
 * @param {number} quantityKg
 * @param {object} vehicle
 * @returns {number} at least 1
 */
const tripsRequired = (quantityKg, vehicle) => {
  const capacity = Number(vehicle.capacity_kg);
  if (!Number.isFinite(capacity) || capacity <= 0) return 1;
  return Math.max(1, Math.ceil(quantityKg / capacity));
};

/**
 * Prices a farm-to-market haul.
 *
 * @param {object} input
 * @param {number} input.distanceKm - road distance one way
 * @param {number} input.quantityKg
 * @param {string} [input.vehicleType] - force a vehicle_type
 * @param {Array} [input.vehicles] - injected config (tests)
 * @param {boolean} [input.includeReturnTrip] - default true
 * @returns {Promise<object>} full, itemised cost breakdown
 */
const calculateTransportCost = async ({
  distanceKm,
  quantityKg,
  vehicleType = null,
  vehicles = null,
  includeReturnTrip = true,
  // Location of the load, used to prefer a transporter quote or a diesel
  // observation for the farmer's own district over a state-wide one.
  state = 'Maharashtra',
  district = null,
  // Injected resolved rate (tests, and callers pricing many markets against one
  // already-resolved rate rather than re-querying per market).
  resolvedRate = null
} = {}) => {
  // Checked before Number(): Number(null) and Number('') are both 0, which would
  // turn "we could not measure this distance" into a free trip and make an
  // unroutable market look like the cheapest one on the board.
  if (distanceKm === null || distanceKm === undefined || distanceKm === '') {
    const err = new Error('distanceKm is required; an unknown distance cannot be priced');
    err.code = 'INVALID_DISTANCE';
    throw err;
  }

  const distance = Number(distanceKm);
  const quantity = Number(quantityKg);

  if (!Number.isFinite(distance) || distance < 0) {
    const err = new Error('distanceKm must be a non-negative number');
    err.code = 'INVALID_DISTANCE';
    throw err;
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const err = new Error('quantityKg must be a positive number');
    err.code = 'INVALID_QUANTITY';
    throw err;
  }

  const configs = vehicles || (await loadVehicles());
  const vehicle = selectVehicle(configs, quantity, vehicleType);
  const trips = tripsRequired(quantity, vehicle);

  // WHICH rate applies is an evidence question (a real transporter quote, a
  // diesel-indexed estimate, or the unsourced configured figure) and is answered
  // by freightRateService. This function stays the only place that does the
  // arithmetic, so the ledger and the ranking can never disagree.
  const rate = resolvedRate || await freightRateService.resolveRate({
    vehicle, state, district
  });

  const ratePerKmPaise = money.toPaise(rate.ratePerKm);
  const loadingPaise = money.toPaise(rate.loadingCost);
  const unloadingPaise = money.toPaise(rate.unloadingCost);
  const minimumPaise = money.toPaise(rate.minimumCharge);

  const returnFactor = includeReturnTrip
    ? Number(rate.returnTripFactor) || 1
    : 1;

  // Chargeable kilometres: the loaded leg, plus the transporter's return share,
  // multiplied by however many hires the load needs.
  const chargeableKm = distance * returnFactor * trips;
  const runningPaise = money.multiply(ratePerKmPaise, chargeableKm);

  // The minimum charge is a floor on the *running* component; handling charges
  // are additional, which is how transporters actually quote a short hop.
  const billedRunningPaise = Math.max(runningPaise, money.multiply(minimumPaise, trips));
  const minimumChargeApplied = billedRunningPaise > runningPaise;

  const handlingPaise = money.multiply(money.add(loadingPaise, unloadingPaise), trips);
  const totalPaise = money.add(billedRunningPaise, handlingPaise);

  return {
    // --- headline figure, rupees ---
    totalCost: money.toWholeRupees(totalPaise),
    totalCostPaise: totalPaise,

    // --- itemisation, so the ledger can show every rupee ---
    breakdown: {
      runningCost: money.toWholeRupees(billedRunningPaise),
      loadingCost: money.toWholeRupees(money.multiply(loadingPaise, trips)),
      unloadingCost: money.toWholeRupees(money.multiply(unloadingPaise, trips)),
      minimumChargeApplied,
      tollCost: 0 // Placeholder: no toll dataset wired yet; never invented.
    },

    // --- how the figure was reached ---
    vehicle: {
      type: vehicle.vehicle_type,
      label: vehicle.label,
      capacityKg: Number(vehicle.capacity_kg) || null,
      ratePerKm: Number(rate.ratePerKm),
      returnTripFactor: returnFactor,
      mileageKmpl: vehicle.mileage_kmpl === null || vehicle.mileage_kmpl === undefined
        ? null
        : Number(vehicle.mileage_kmpl)
    },

    // Where the ₹/km came from. The UI must never present an unsourced estimate
    // as a quoted rate, so this travels with every freight figure.
    rateSource: rate.rateSource,
    rateSourceNote: rate.rateSourceNote,
    /** True only when a named transporter actually quoted this rate. */
    isRealRate: rate.isRealRate === true,
    rateEvidence: rate.evidence || null,
    distanceKm: Math.round(distance * 10) / 10,
    chargeableKm: Math.round(chargeableKm * 10) / 10,
    trips,
    quantityKg: quantity,
    costPerKg: quantity > 0 ? money.toRupees(Math.round(totalPaise / quantity)) : 0,
    configVersion: vehicle.config_version || 'transport_v1',
    configSource: vehicle === FALLBACK_VEHICLE ? 'FALLBACK_DEFAULT' : 'transport_config',
    engine: 'DETERMINISTIC_CONFIG'
  };
};

/**
 * Lists vehicle options for the UI and for documentation.
 * @returns {Promise<Array>}
 */
const getVehicleOptions = async () => {
  const vehicles = await loadVehicles();
  return vehicles.map((v) => ({
    type: v.vehicle_type,
    label: v.label,
    ratePerKm: Number(v.rate_per_km),
    loadingCost: Number(v.loading_cost),
    unloadingCost: Number(v.unloading_cost),
    minimumCharge: Number(v.minimum_charge),
    capacityKg: Number(v.capacity_kg) || null,
    returnTripFactor: Number(v.return_trip_factor),
    configVersion: v.config_version
  }));
};

module.exports = {
  calculateTransportCost,
  getVehicleOptions,
  selectVehicle,
  tripsRequired,
  loadVehicles,
  clearVehicleCache,
  FALLBACK_VEHICLE
};

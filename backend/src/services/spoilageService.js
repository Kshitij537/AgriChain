/**
 * Spoilage Service
 * Post-harvest spoilage risk engine.
 *
 * Estimates how long harvested produce stays sellable given crop type, storage
 * conditions, ambient temperature/humidity and the journey to market, then
 * explains *why* the risk is what it is and what the farmer can cheaply do
 * about it.
 *
 * The model is deliberately simple and deterministic so it can run without any
 * external API and always produce an answer:
 *
 *   effectiveShelfLife = baseShelfLife x storageFactor x tempFactor x humidityFactor
 *   exposure           = daysSinceHarvest + transitDays
 *   riskScore          = (exposure / effectiveShelfLife) x 100
 *
 * tempFactor uses a Q10 respiration model (respiration roughly doubles for every
 * 10 degrees C above the crop's optimum), which is the standard first-order
 * approximation for post-harvest deterioration.
 */

const money = require('../utils/money');

const REFERENCE_Q10 = 2.0;

/**
 * ENGINE PROVENANCE - read this before describing this module anywhere.
 *
 * Every assessment this service returns is produced by the deterministic rule
 * set documented above. No model is fitted, no dataset is learned from, and no
 * statistical uncertainty is available. It is labelled RULE_BASED_BASELINE so
 * that an API response, a log line or a report can never imply otherwise.
 *
 * Why a baseline rather than a model: there is no labelled Indian post-harvest
 * spoilage dataset in this repository - no records of "this load travelled N
 * hours at T degrees and arrived X% spoiled". Fabricating one and fitting a
 * regressor to it would manufacture an accuracy figure that means nothing. The
 * physics-based rule set is honest about what it is and is auditable by an
 * agronomist, which a model trained on invented labels would not be.
 *
 * Replacing this with a real model: keep assessSpoilageRisk and
 * estimateSpoilageLossForMarket as the interface, swap the internals, and bump
 * SPOILAGE_MODEL_VERSION to e.g. 'spoilage_xgb_v1'. Callers need no change, and
 * every stored assessment stays traceable to the engine that produced it.
 */
const SPOILAGE_ENGINE = 'RULE_BASED_BASELINE';
const SPOILAGE_MODEL_VERSION = 'spoilage_baseline_v1';

/**
 * Fraction of a consignment that is unsellable once it has used up its entire
 * effective shelf life. See the derivation comment in assessSpoilageRisk.
 */
const LOSS_AT_FULL_EXPOSURE = 0.45;

/**
 * Curvature of the exposure -> loss relationship.
 *
 * Spoilage is not linear in elapsed life. Produce halfway through its shelf life
 * is not half spoiled; it is nearly intact, and then deteriorates sharply as the
 * window closes. An exponent of 2.2 reproduces that shape:
 *
 *   20% of shelf life used  ->  ~1.3% of the load lost
 *   45%                     ->  ~7.8%
 *   75%                     ->  ~24%
 *   100%                    ->  45%   (LOSS_AT_FULL_EXPOSURE)
 *
 * A linear conversion instead reports ~34% loss on a day-old tomato load
 * travelling 35 km, which no farmer would recognise as their experience.
 */
const LOSS_CURVE_EXPONENT = 2.2;

/**
 * Ceiling on estimated loss. Produce held well past its window is mostly refuse
 * but rarely literally worthless, and claiming 100% would overstate what this
 * rule set can know.
 */
const MAX_LOSS_FRACTION = 0.90;

/**
 * Per-crop post-harvest characteristics.
 * baseShelfLifeDays is measured at the crop's optimal storage temperature.
 */
const CROP_PROFILES = {
  tomato: { label: 'Tomato', baseShelfLifeDays: 12, optimalTempC: 13, optimalHumidity: 90, perishability: 'high', icon: 'nutrition' },
  onion: { label: 'Onion', baseShelfLifeDays: 90, optimalTempC: 4, optimalHumidity: 68, perishability: 'low', icon: 'nutrition' },
  potato: { label: 'Potato', baseShelfLifeDays: 70, optimalTempC: 8, optimalHumidity: 92, perishability: 'low', icon: 'nutrition' },
  banana: { label: 'Banana', baseShelfLifeDays: 10, optimalTempC: 14, optimalHumidity: 90, perishability: 'high', icon: 'nutrition' },
  mango: { label: 'Mango', baseShelfLifeDays: 14, optimalTempC: 13, optimalHumidity: 88, perishability: 'high', icon: 'nutrition' },
  grapes: { label: 'Grapes', baseShelfLifeDays: 14, optimalTempC: 1, optimalHumidity: 92, perishability: 'high', icon: 'nutrition' },
  spinach: { label: 'Spinach', baseShelfLifeDays: 5, optimalTempC: 1, optimalHumidity: 95, perishability: 'very_high', icon: 'grass' },
  okra: { label: 'Okra', baseShelfLifeDays: 8, optimalTempC: 10, optimalHumidity: 92, perishability: 'high', icon: 'grass' },
  cabbage: { label: 'Cabbage', baseShelfLifeDays: 30, optimalTempC: 1, optimalHumidity: 95, perishability: 'medium', icon: 'grass' },
  cauliflower: { label: 'Cauliflower', baseShelfLifeDays: 21, optimalTempC: 1, optimalHumidity: 95, perishability: 'medium', icon: 'grass' },
  brinjal: { label: 'Brinjal', baseShelfLifeDays: 12, optimalTempC: 11, optimalHumidity: 91, perishability: 'high', icon: 'nutrition' },
  chilli: { label: 'Chilli', baseShelfLifeDays: 16, optimalTempC: 8, optimalHumidity: 90, perishability: 'medium', icon: 'local_fire_department' },
  sugarcane: { label: 'Sugarcane', baseShelfLifeDays: 4, optimalTempC: 15, optimalHumidity: 85, perishability: 'very_high', icon: 'grass' },
  orange: { label: 'Orange', baseShelfLifeDays: 35, optimalTempC: 5, optimalHumidity: 88, perishability: 'medium', icon: 'nutrition' },
  wheat: { label: 'Wheat', baseShelfLifeDays: 240, optimalTempC: 20, optimalHumidity: 55, perishability: 'very_low', icon: 'grain', isGrain: true },
  rice: { label: 'Rice', baseShelfLifeDays: 240, optimalTempC: 20, optimalHumidity: 55, perishability: 'very_low', icon: 'grain', isGrain: true },
  soybean: { label: 'Soybean', baseShelfLifeDays: 200, optimalTempC: 20, optimalHumidity: 55, perishability: 'very_low', icon: 'grain', isGrain: true },
  cotton: { label: 'Cotton', baseShelfLifeDays: 300, optimalTempC: 22, optimalHumidity: 55, perishability: 'very_low', icon: 'grain', isGrain: true }
};

const DEFAULT_PROFILE = {
  label: 'Produce',
  baseShelfLifeDays: 14,
  optimalTempC: 12,
  optimalHumidity: 88,
  perishability: 'medium',
  icon: 'inventory_2'
};

/**
 * Storage type multipliers applied to base shelf life.
 * Cold storage also suppresses the temperature penalty (see resolveStorageTemp).
 */
const STORAGE_TYPES = {
  open: { label: 'Open Storage', multiplier: 0.9, icon: 'wb_sunny', controlsTemp: false },
  packed: { label: 'Packed Storage', multiplier: 1.05, icon: 'inventory_2', controlsTemp: false },
  warehouse: { label: 'Warehouse', multiplier: 1.25, icon: 'warehouse', controlsTemp: false },
  cold: { label: 'Cold Storage', multiplier: 2.6, icon: 'ac_unit', controlsTemp: true, maintainedTempC: 6, maintainedHumidity: 88 }
};

const DEFAULT_STORAGE_KEY = 'open';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Normalizes a free-text crop name to a known profile key.
 */
const resolveCropKey = (cropType) => {
  if (!cropType || typeof cropType !== 'string') return null;
  const normalized = cropType.trim().toLowerCase();
  if (CROP_PROFILES[normalized]) return normalized;

  // Tolerate plurals and descriptive names ("tomatoes", "red onion")
  for (const key of Object.keys(CROP_PROFILES)) {
    if (normalized.includes(key)) return key;
  }
  if (normalized.includes('paddy')) return 'rice';
  if (normalized.includes('leafy') || normalized.includes('methi') || normalized.includes('coriander')) return 'spinach';

  // Regional and dataset spellings that the substring pass above cannot catch,
  // because the profile key is not contained in them. 'soyabean' is how both
  // the provider and the existing farm records spell it (see
  // the provider commodity map in scripts/mapProviderMarkets.js, which maps it
  // the same way).
  if (normalized.includes('soya')) return 'soybean';
  if (normalized.includes('kapas')) return 'cotton';
  if (normalized.includes('bhindi') || normalized.includes('ladies finger')) return 'okra';
  if (normalized.includes('mirch') || normalized.includes('mirchi')) return 'chilli';
  if (normalized.includes('kanda')) return 'onion';
  if (normalized.includes('batata') || normalized.includes('aloo')) return 'potato';
  if (normalized.includes('tamatar')) return 'tomato';
  if (normalized.includes('gehu') || normalized.includes('gehun')) return 'wheat';
  if (normalized.includes('palak')) return 'spinach';

  return null;
};

const getCropProfile = (cropType) => {
  const key = resolveCropKey(cropType);
  if (!key) {
    return { ...DEFAULT_PROFILE, key: 'other', label: cropType || DEFAULT_PROFILE.label };
  }
  return { ...CROP_PROFILES[key], key };
};

const getStorageType = (storageType) => {
  const key = (storageType || '').toString().trim().toLowerCase();
  if (STORAGE_TYPES[key]) return { ...STORAGE_TYPES[key], key };
  return { ...STORAGE_TYPES[DEFAULT_STORAGE_KEY], key: DEFAULT_STORAGE_KEY };
};

/**
 * Cold storage holds its own climate, so ambient readings should not drive the
 * risk score while the produce is inside it.
 */
const resolveStorageTemp = (storage, ambientTempC, ambientHumidity) => {
  if (storage.controlsTemp) {
    return {
      effectiveTempC: storage.maintainedTempC,
      effectiveHumidity: storage.maintainedHumidity,
      climateControlled: true
    };
  }
  return {
    effectiveTempC: ambientTempC,
    effectiveHumidity: ambientHumidity,
    climateControlled: false
  };
};

/**
 * Q10 model: deterioration rate multiplies by REFERENCE_Q10 for every 10 degrees C
 * above the crop optimum. Returns a shelf-life multiplier (<1 shortens life).
 */
const computeTemperatureFactor = (tempC, optimalTempC) => {
  const delta = tempC - optimalTempC;
  if (delta <= 0) return 1.15; // cooler than optimum extends life modestly
  return 1 / Math.pow(REFERENCE_Q10, delta / 10);
};

/**
 * Humidity penalty. Produce wilts when too dry and moulds when too wet; grains
 * are the inverse and spoil chiefly from excess moisture.
 */
const computeHumidityFactor = (humidity, profile) => {
  const optimal = profile.optimalHumidity;
  const delta = humidity - optimal;

  if (profile.isGrain) {
    // Grain: only excess moisture matters, and it matters a lot
    if (delta <= 0) return 1.0;
    return clamp(1 - (delta / 100) * 1.8, 0.25, 1.0);
  }

  if (delta >= 0) {
    // Too humid -> fungal growth
    return clamp(1 - (delta / 100) * 1.1, 0.45, 1.0);
  }
  // Too dry -> moisture loss and wilting
  return clamp(1 - (Math.abs(delta) / 100) * 0.9, 0.45, 1.0);
};

/**
 * Long journeys without a cold chain cause mechanical and thermal damage beyond
 * simple elapsed time, so transit hours are weighted above storage hours.
 */
const computeTransitPenalty = (transitHours, storage, tempC) => {
  if (!transitHours || transitHours <= 0) return { transitDays: 0, stressMultiplier: 1 };

  const transitDays = transitHours / 24;
  const uncooled = !storage.controlsTemp;
  const hot = tempC >= 30;

  let stressMultiplier = 1;
  if (uncooled && transitHours > 2) stressMultiplier += 0.35;
  if (uncooled && hot && transitHours > 4) stressMultiplier += 0.4;

  return { transitDays: transitDays * stressMultiplier, stressMultiplier };
};

/**
 * Estimates travel time when the caller supplies distance but not duration.
 * Rural road speeds in India average well below highway figures.
 */
const estimateTravelHours = (distanceKm, transportMode = 'road') => {
  if (!distanceKm || distanceKm <= 0) return 0;
  const speeds = { road: 35, highway: 50, tractor: 20, cart: 10 };
  const speed = speeds[transportMode] || speeds.road;
  return distanceKm / speed;
};

const RISK_BANDS = [
  { max: 35, level: 'low', label: 'Low Risk', color: 'green', emoji: '🟢' },
  { max: 70, level: 'moderate', label: 'Moderate Risk', color: 'amber', emoji: '🟡' },
  { max: Infinity, level: 'high', label: 'High Risk', color: 'red', emoji: '🔴' }
];

const getRiskBand = (score) => RISK_BANDS.find((band) => score < band.max) || RISK_BANDS[RISK_BANDS.length - 1];

/**
 * Builds the ordered "Why is the risk high?" factor list. Only factors that
 * actually push risk upward are returned, strongest first.
 */
const buildRiskFactors = ({ profile, storage, effectiveTempC, effectiveHumidity, transitHours, daysSinceHarvest, climateControlled }) => {
  const factors = [];

  const tempDelta = effectiveTempC - profile.optimalTempC;
  if (tempDelta > 4) {
    factors.push({
      icon: 'thermostat',
      emoji: '🌡',
      label: 'High temperature',
      detail: `${round1(effectiveTempC)}°C is ${round1(tempDelta)}°C above the ideal ${profile.optimalTempC}°C for ${profile.label.toLowerCase()}`,
      severity: tempDelta > 15 ? 'high' : tempDelta > 8 ? 'moderate' : 'low',
      impact: clamp(tempDelta * 2.4, 0, 40)
    });
  }

  const humidityDelta = effectiveHumidity - profile.optimalHumidity;
  if (profile.isGrain && humidityDelta > 5) {
    factors.push({
      icon: 'humidity_high',
      emoji: '💧',
      label: 'High humidity',
      detail: `${Math.round(effectiveHumidity)}% moisture encourages mould in stored grain`,
      severity: humidityDelta > 20 ? 'high' : 'moderate',
      impact: clamp(humidityDelta * 1.5, 0, 30)
    });
  } else if (!profile.isGrain && humidityDelta > 5) {
    factors.push({
      icon: 'humidity_high',
      emoji: '💧',
      label: 'High humidity',
      detail: `${Math.round(effectiveHumidity)}% humidity encourages fungal growth`,
      severity: humidityDelta > 15 ? 'high' : 'moderate',
      impact: clamp(humidityDelta * 1.2, 0, 25)
    });
  } else if (!profile.isGrain && humidityDelta < -20) {
    factors.push({
      icon: 'water_loss',
      emoji: '🏜',
      label: 'Air is too dry',
      detail: `${Math.round(effectiveHumidity)}% humidity will cause wilting and weight loss`,
      severity: humidityDelta < -35 ? 'high' : 'moderate',
      impact: clamp(Math.abs(humidityDelta) * 0.7, 0, 20)
    });
  }

  if (transitHours > 2) {
    factors.push({
      icon: 'local_shipping',
      emoji: '🚚',
      label: 'Long transportation time',
      detail: `${round1(transitHours)} hours on the road before the produce reaches the market`,
      severity: transitHours > 6 ? 'high' : transitHours > 4 ? 'moderate' : 'low',
      impact: clamp(transitHours * 3, 0, 30)
    });
  }

  if (!climateControlled && profile.perishability !== 'very_low') {
    factors.push({
      icon: 'ac_unit',
      emoji: '📦',
      label: 'No cold storage',
      detail: `${profile.label} is being held in ${storage.label.toLowerCase()} without cooling`,
      severity: profile.perishability === 'very_high' ? 'high' : 'moderate',
      impact: profile.perishability === 'very_high' ? 25 : 15
    });
  }

  if (daysSinceHarvest >= 2) {
    factors.push({
      icon: 'schedule',
      emoji: '📅',
      label: 'Already harvested some time ago',
      detail: `${Math.round(daysSinceHarvest)} days have passed since harvest`,
      severity: daysSinceHarvest > 5 ? 'high' : 'moderate',
      impact: clamp(daysSinceHarvest * 3, 0, 25)
    });
  }

  if (profile.perishability === 'very_high') {
    factors.push({
      icon: 'timer',
      emoji: '⏳',
      label: 'Highly perishable crop',
      detail: `${profile.label} deteriorates quickly even in good conditions`,
      severity: 'moderate',
      impact: 12
    });
  }

  return factors.sort((a, b) => b.impact - a.impact);
};

/**
 * Preservation actions ranked by effectiveness first, then by how little they
 * cost, so free high-impact advice always surfaces above paid options.
 */
const EFFECTIVENESS_RANK = { very_high: 4, high: 3, medium: 2, low: 1 };
const COST_RANK = { free: 0, low: 1, medium: 2, high: 3 };

const buildRecommendations = ({ profile, storage, effectiveTempC, effectiveHumidity, transitHours, riskLevel, climateControlled }) => {
  const actions = [];

  if (!climateControlled && effectiveTempC > profile.optimalTempC + 4) {
    actions.push({
      title: 'Keep produce in shade',
      detail: 'Move the harvest out of direct sunlight immediately. Even tree shade lowers produce temperature by 5-8°C.',
      cost: 'free', costLabel: '₹0', effectiveness: 'high', icon: 'wb_shade'
    });
  }

  if (!climateControlled) {
    actions.push({
      title: 'Harvest and move in early morning',
      detail: 'Produce picked before 9 AM starts several degrees cooler and lasts noticeably longer.',
      cost: 'free', costLabel: '₹0', effectiveness: 'medium', icon: 'wb_twilight'
    });
  }

  if (storage.key === 'open' || storage.key === 'packed') {
    actions.push({
      title: 'Improve ventilation',
      detail: 'Stack crates with gaps so trapped heat and moisture can escape. Avoid sealed plastic sacks.',
      cost: 'low', costLabel: 'Low', effectiveness: 'medium', icon: 'air'
    });
  }

  if (!profile.isGrain && effectiveHumidity > profile.optimalHumidity + 5) {
    actions.push({
      title: 'Keep the produce dry',
      detail: 'Wipe surface moisture and add dry straw or newspaper between layers to absorb dampness.',
      cost: 'free', costLabel: '₹0', effectiveness: 'medium', icon: 'dry'
    });
  }

  if (profile.isGrain && effectiveHumidity > profile.optimalHumidity) {
    actions.push({
      title: 'Sun-dry before storing',
      detail: 'Bring grain moisture below 12% before bagging, otherwise mould will set in within days.',
      cost: 'free', costLabel: '₹0', effectiveness: 'very_high', icon: 'sunny'
    });
  }

  if (!climateControlled && !profile.isGrain) {
    actions.push({
      title: 'Use an evaporative cool chamber',
      detail: 'A zero-energy brick and sand chamber kept wet holds produce 10-15°C below outside temperature.',
      cost: 'low', costLabel: '₹500-2,000', effectiveness: 'high', icon: 'water_drop'
    });
  }

  if (transitHours > 3 && !climateControlled) {
    actions.push({
      title: 'Cover the load during transport',
      detail: 'A wet jute sheet over the crates prevents sun and wind damage on the way to the mandi.',
      cost: 'low', costLabel: '₹100-300', effectiveness: 'medium', icon: 'local_shipping'
    });
  }

  if (!climateControlled && profile.perishability !== 'very_low') {
    actions.push({
      title: 'Use cold storage',
      detail: `Cold storage can extend ${profile.label.toLowerCase()} shelf life several times over if a facility is reachable.`,
      cost: 'high', costLabel: '₹2-4 / kg / day', effectiveness: 'very_high', icon: 'ac_unit'
    });
  }

  if (climateControlled) {
    actions.push({
      title: 'Check the cold room temperature daily',
      detail: 'A few hours of power failure undoes days of cold storage. Keep a thermometer inside and check it every morning.',
      cost: 'free', costLabel: '₹0', effectiveness: 'high', icon: 'thermostat'
    });
  }

  // Always leave the farmer with at least one thing to do
  if (actions.length === 0) {
    actions.push({
      title: 'Sort out damaged produce',
      detail: 'Remove bruised or cut pieces before storing. One rotting fruit spreads spoilage through the whole crate.',
      cost: 'free', costLabel: '₹0', effectiveness: 'high', icon: 'checklist'
    });
  }

  if (riskLevel === 'high') {
    actions.unshift({
      title: 'Sell as early as possible',
      detail: 'At this risk level the surest way to avoid loss is to reach a buyer within the next day or two.',
      cost: 'free', costLabel: '₹0', effectiveness: 'very_high', icon: 'storefront'
    });
  }

  // Value = effectiveness per unit of cost, so a free high-impact action outranks
  // an expensive one. Ties break toward the more effective action.
  const valueScore = (action) => EFFECTIVENESS_RANK[action.effectiveness] / (1 + COST_RANK[action.cost]);

  return actions
    .sort((a, b) => {
      const byValue = valueScore(b) - valueScore(a);
      if (Math.abs(byValue) > 0.001) return byValue;
      return EFFECTIVENESS_RANK[b.effectiveness] - EFFECTIVENESS_RANK[a.effectiveness];
    })
    .map((action, index) => ({ ...action, rank: index + 1 }));
};

/**
 * Day-by-day projection the farmer can read at a glance.
 */
const buildTimeline = ({ effectiveShelfLifeDays, exposureDays, days = 5 }) => {
  const timeline = [];
  for (let day = 0; day <= days; day += 1) {
    const projectedExposure = exposureDays + day;
    const ratio = effectiveShelfLifeDays > 0 ? projectedExposure / effectiveShelfLifeDays : 1;
    const score = clamp(Math.round(ratio * 100), 0, 100);
    const band = getRiskBand(score);

    let status;
    if (score < 35) status = 'Fresh';
    else if (score < 70) status = 'Risk increasing';
    else if (score < 100) status = 'High risk';
    else status = 'Spoilage likely';

    timeline.push({
      day,
      label: day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : `Day ${day}`,
      date: new Date(Date.now() + day * 86400000).toISOString().split('T')[0],
      riskScore: score,
      riskLevel: band.level,
      emoji: band.emoji,
      status
    });
  }
  return timeline;
};

/**
 * Pluralizes a day count so the farmer never reads "1 days".
 */
const pluralDays = (count) => (count === 1 ? '1 day' : `${count} days`);

/**
 * One-line verdict shown at the top of the page.
 */
const buildHeadline = (level, safeDays) => {
  if (level === 'low') {
    return `Your crop can likely be stored safely for the next ${pluralDays(safeDays)}.`;
  }
  if (level === 'moderate') {
    return safeDays >= 1
      ? `Sell within about ${pluralDays(safeDays)} to avoid losses.`
      : 'Sell today or tomorrow to avoid losses.';
  }
  return 'Sell as soon as possible to avoid heavy losses.';
};

/**
 * Number of whole days before the produce crosses into high risk.
 */
const computeSafeDays = (effectiveShelfLifeDays, exposureDays) => {
  const highRiskThreshold = 0.7 * effectiveShelfLifeDays;
  const remaining = highRiskThreshold - exposureDays;
  return Math.max(0, Math.floor(remaining));
};

const describeExpectedSpoilage = (effectiveShelfLifeDays, exposureDays) => {
  const remaining = effectiveShelfLifeDays - exposureDays;
  if (remaining <= 0) return 'Spoilage may already have started';
  if (remaining < 1) return 'Within 24 hours';
  if (remaining < 2) return 'Within 1-2 days';
  if (remaining < 4) return `Within ${Math.ceil(remaining)} days`;
  if (remaining < 8) return `About ${Math.round(remaining)} days from now`;
  return `More than a week away (about ${Math.round(remaining)} days)`;
};

/**
 * Core entry point. Every input is optional except cropType; sensible defaults
 * keep the engine answering rather than erroring.
 *
 * @param {Object} input
 * @param {string} input.cropType        - e.g. "tomato"
 * @param {number} [input.quantityKg]    - carried through for loss estimates
 * @param {string} [input.storageType]   - open | packed | warehouse | cold
 * @param {number} [input.temperatureC]  - ambient temperature
 * @param {number} [input.humidity]      - ambient relative humidity %
 * @param {string} [input.harvestDate]   - ISO date; defaults to today
 * @param {number} [input.distanceKm]    - distance to the destination market
 * @param {number} [input.travelHours]   - overrides the distance-based estimate
 * @param {string} [input.transportMode] - road | highway | tractor | cart
 * @returns {Object} full assessment
 */
const assessSpoilageRisk = (input = {}) => {
  const profile = getCropProfile(input.cropType);
  const storage = getStorageType(input.storageType);

  const ambientTempC = Number.isFinite(Number(input.temperatureC)) ? Number(input.temperatureC) : 28;
  const ambientHumidity = Number.isFinite(Number(input.humidity)) ? Number(input.humidity) : 70;

  const { effectiveTempC, effectiveHumidity, climateControlled } = resolveStorageTemp(storage, ambientTempC, ambientHumidity);

  const distanceKm = Number(input.distanceKm) || 0;
  const transportMode = input.transportMode || 'road';
  const transitHours = Number.isFinite(Number(input.travelHours)) && Number(input.travelHours) > 0
    ? Number(input.travelHours)
    : estimateTravelHours(distanceKm, transportMode);

  // Days elapsed since harvest (never negative; a future harvest date means 0)
  let daysSinceHarvest = 0;
  if (input.harvestDate) {
    const harvested = new Date(input.harvestDate);
    if (!Number.isNaN(harvested.getTime())) {
      daysSinceHarvest = Math.max(0, (Date.now() - harvested.getTime()) / 86400000);
    }
  }

  const tempFactor = computeTemperatureFactor(effectiveTempC, profile.optimalTempC);
  const humidityFactor = computeHumidityFactor(effectiveHumidity, profile);
  const effectiveShelfLifeDays = Math.max(
    0.25,
    profile.baseShelfLifeDays * storage.multiplier * tempFactor * humidityFactor
  );

  const { transitDays, stressMultiplier } = computeTransitPenalty(transitHours, storage, effectiveTempC);
  const exposureDays = daysSinceHarvest + transitDays;

  const riskScore = clamp(Math.round((exposureDays / effectiveShelfLifeDays) * 100), 0, 100);
  const band = getRiskBand(riskScore);

  const factors = buildRiskFactors({
    profile, storage, effectiveTempC, effectiveHumidity, transitHours, daysSinceHarvest, climateControlled
  });

  const recommendations = buildRecommendations({
    profile, storage, effectiveTempC, effectiveHumidity, transitHours, riskLevel: band.level, climateControlled
  });

  const safeDays = computeSafeDays(effectiveShelfLifeDays, exposureDays);
  const quantityKg = Number(input.quantityKg) || 0;

  /**
   * Exposure -> physical loss.
   *
   * exposureRatio is how much of the produce's usable life has been consumed by
   * the time it reaches the buyer. Reaching the end of that window does not mean
   * the whole load is refuse: a consignment arriving at the end of its window
   * typically has 40-50% downgraded or unsellable and the rest still saleable at
   * a lower grade, which is what LOSS_AT_FULL_EXPOSURE encodes. The exponent
   * gives the curve its real convex shape (see LOSS_CURVE_EXPONENT).
   *
   * Unlike riskScore, the ratio here is deliberately NOT clamped at 1.0: produce
   * held two shelf lives past harvest really is worse off than produce at exactly
   * its limit, and the ranking should be able to see that. MAX_LOSS_FRACTION caps
   * the result.
   *
   * These are documented rules of thumb inside a rule-based baseline, not
   * measured coefficients. They are the first thing a labelled post-harvest
   * dataset should replace.
   */
  const exposureRatio = exposureDays / effectiveShelfLifeDays;
  const lossFraction = Math.min(
    MAX_LOSS_FRACTION,
    LOSS_AT_FULL_EXPOSURE * Math.pow(Math.max(0, exposureRatio), LOSS_CURVE_EXPONENT)
  );
  const estimatedLossKg = quantityKg > 0 ? Math.round(quantityKg * lossFraction) : 0;

  return {
    risk: {
      score: riskScore,
      level: band.level,
      label: band.label,
      color: band.color,
      emoji: band.emoji,
      headline: buildHeadline(band.level, safeDays),
      expectedSpoilage: describeExpectedSpoilage(effectiveShelfLifeDays, exposureDays)
    },
    crop: {
      key: profile.key,
      label: profile.label,
      icon: profile.icon,
      perishability: profile.perishability,
      quantityKg,
      harvestDate: input.harvestDate || new Date().toISOString().split('T')[0],
      daysSinceHarvest: round1(daysSinceHarvest)
    },
    storage: {
      key: storage.key,
      label: storage.label,
      icon: storage.icon,
      climateControlled,
      temperatureC: round1(effectiveTempC),
      humidity: Math.round(effectiveHumidity),
      ambientTemperatureC: round1(ambientTempC),
      ambientHumidity: Math.round(ambientHumidity)
    },
    transport: {
      destination: input.destination || null,
      distanceKm: round1(distanceKm),
      travelHours: round1(transitHours),
      transportMode,
      stressMultiplier: round1(stressMultiplier)
    },
    shelfLife: {
      baseDays: profile.baseShelfLifeDays,
      effectiveDays: round1(effectiveShelfLifeDays),
      safeDays,
      exposureDays: round1(exposureDays),
      temperatureFactor: round1(tempFactor),
      humidityFactor: round1(humidityFactor),
      storageMultiplier: storage.multiplier
    },
    loss: {
      estimatedLossKg,
      estimatedLossPercent: quantityKg > 0 ? Math.round((estimatedLossKg / quantityKg) * 100) : 0,
      // Unrounded companion to estimatedLossPercent. The integer field above is
      // left byte-for-byte compatible for the existing SpoilageRisk page; money
      // arithmetic must use this one, because rounding 8.5% up to 9% on a 500 kg
      // tomato load shifts the answer by about ₹70 - enough to flip a ranking.
      estimatedLossPercentPrecise: round1(lossFraction * 100)
    },
    factors,
    recommendations,
    timeline: buildTimeline({ effectiveShelfLifeDays, exposureDays }),

    // --- Provenance ----------------------------------------------------------
    // This engine is a deterministic agronomic rule set: a Q10 respiration model
    // plus storage, humidity and transit factors. It is NOT a trained model, and
    // nothing in this system may present it as an ML prediction. The interface is
    // shaped so a trained regressor can replace the internals later while callers
    // keep reading the same fields - see docs/Market/README.md.
    engine: SPOILAGE_ENGINE,
    modelVersion: SPOILAGE_MODEL_VERSION,
    isMachineLearning: false,
    assessedAt: new Date().toISOString()
  };
};

/**
 * Expected spoilage loss for one candidate market, in produce and in rupees.
 *
 * This is the market engine's entry point into the spoilage baseline. It answers
 * "if this load travels to THIS mandi, how much of it arrives unsellable, and
 * what is that worth?" - the deduction that lets a nearer, cheaper mandi beat a
 * distant, higher-priced one.
 *
 * The lost value is priced at the destination mandi's own rate, because the
 * spoiled fraction is produce that would otherwise have sold there.
 *
 * @param {object} baseInput - shared assessSpoilageRisk input: cropType,
 *   quantityKg, harvestDate, storageType, temperatureC, humidity
 * @param {object} market - { name, distanceKm, travelHours, pricePerQuintal }
 * @returns {object} loss estimate with provenance attached
 */
const estimateSpoilageLossForMarket = (baseInput, market = {}) => {
  const assessment = assessSpoilageRisk({
    ...baseInput,
    distanceKm: market.distanceKm,
    travelHours: market.travelHours,
    destination: market.name
  });

  const quantityKg = Number(baseInput.quantityKg) || 0;
  const lossPercent = assessment.loss.estimatedLossPercentPrecise;
  const lossKg = Math.round(((quantityKg * lossPercent) / 100) * 10) / 10;

  // Price the loss only when the caller supplied a rate; never invent one.
  const pricePerQuintal = Number(market.pricePerQuintal);
  let lossValue = null;
  if (Number.isFinite(pricePerQuintal) && pricePerQuintal > 0) {
    const perKgPaise = money.perQuintalToPerKg(money.toPaise(pricePerQuintal));
    lossValue = money.toWholeRupees(money.multiply(perKgPaise, lossKg));
  }

  return {
    market: market.name || null,
    riskScore: assessment.risk.score,
    riskLevel: assessment.risk.level,
    estimatedLossPercent: lossPercent,
    estimatedLossKg: lossKg,
    estimatedLossValue: lossValue,
    saleableQuantityKg: Math.round((quantityKg - lossKg) * 10) / 10,
    safeDays: assessment.shelfLife.safeDays,
    effectiveShelfLifeDays: assessment.shelfLife.effectiveDays,
    travelHours: assessment.transport.travelHours,
    // Top three drivers; buildRiskFactors already sorts strongest-first.
    factors: assessment.factors.slice(0, 3).map((f) => f.label),
    factorDetails: assessment.factors.slice(0, 3),
    engine: SPOILAGE_ENGINE,
    modelVersion: SPOILAGE_MODEL_VERSION,
    isMachineLearning: false
  };
};

const getSupportedCrops = () => Object.entries(CROP_PROFILES).map(([key, profile]) => ({
  key,
  label: profile.label,
  icon: profile.icon,
  perishability: profile.perishability,
  baseShelfLifeDays: profile.baseShelfLifeDays
}));

const getStorageOptions = () => Object.entries(STORAGE_TYPES).map(([key, storage]) => ({
  key,
  label: storage.label,
  icon: storage.icon,
  climateControlled: !!storage.controlsTemp
}));

module.exports = {
  assessSpoilageRisk,
  estimateSpoilageLossForMarket,
  getSupportedCrops,
  getStorageOptions,
  getCropProfile,
  getStorageType,
  estimateTravelHours,
  resolveCropKey,
  CROP_PROFILES,
  STORAGE_TYPES,
  SPOILAGE_ENGINE,
  SPOILAGE_MODEL_VERSION,
  LOSS_AT_FULL_EXPOSURE
};

/**
 * Seeds market master data, crop profiles and transport configuration.
 *
 * This seeds CONFIGURATION and MASTER DATA only - real-world facts (where a
 * mandi is, how perishable a tomato is, what a tempo charges per km). It does
 * NOT seed market price observations; those come from the provider ingestion
 * job, or from the separately labelled demo seed.
 *
 * Idempotent: safe to run repeatedly.
 *
 * Usage:  npm run seed:market
 */

require('dotenv').config();
const { pool, query } = require('../config/db');
const { CROP_PROFILES } = require('../services/spoilageService');

/**
 * APMC markets across the Vidarbha region of Maharashtra.
 *
 * COORDINATE ACCURACY: these are town/city centroids, not surveyed APMC yard
 * gates. They are accurate to roughly a few kilometres, which is adequate for
 * ranking markets 30-150 km apart but is recorded honestly as CITY_CENTROID so
 * derived road distances carry the same caveat. Replace with surveyed yard
 * coordinates when available and set coordinate_source to 'SURVEYED'.
 *
 * agmarknet_market / agmarknet_district are LEGACY columns kept only as a record
 * of the data.gov.in spellings. Provider matching now lives in market_provider_map,
 * written by scripts/mapProviderMarkets.js.
 */
const VIDARBHA_MARKETS = [
  { code: 'nagpur',      name: 'Nagpur APMC (Kalamna)', district: 'Nagpur',     lat: 21.1500, lon: 79.1200, agName: 'Nagpur',      agDistrict: 'Nagpur' },
  { code: 'katol',       name: 'Katol APMC',            district: 'Nagpur',     lat: 21.2730, lon: 78.5860, agName: 'Katol',       agDistrict: 'Nagpur' },
  { code: 'kalmeshwar',  name: 'Kalmeshwar APMC',       district: 'Nagpur',     lat: 21.2320, lon: 78.9210, agName: 'Kalmeshwar',  agDistrict: 'Nagpur' },
  { code: 'savner',      name: 'Savner APMC',           district: 'Nagpur',     lat: 21.3880, lon: 78.9250, agName: 'Savner',      agDistrict: 'Nagpur' },
  { code: 'umred',       name: 'Umred APMC',            district: 'Nagpur',     lat: 20.8500, lon: 79.3300, agName: 'Umred',       agDistrict: 'Nagpur' },
  { code: 'wardha',      name: 'Wardha APMC',           district: 'Wardha',     lat: 20.7450, lon: 78.6020, agName: 'Wardha',      agDistrict: 'Wardha' },
  { code: 'hinganghat',  name: 'Hinganghat APMC',       district: 'Wardha',     lat: 20.5490, lon: 78.8390, agName: 'Hinganghat',  agDistrict: 'Wardha' },
  { code: 'amravati',    name: 'Amravati APMC',         district: 'Amravati',   lat: 20.9320, lon: 77.7520, agName: 'Amravati',    agDistrict: 'Amravati' },
  { code: 'achalpur',    name: 'Achalpur APMC',         district: 'Amravati',   lat: 21.2570, lon: 77.5100, agName: 'Achalpur',    agDistrict: 'Amravati' },
  { code: 'akola',       name: 'Akola APMC',            district: 'Akola',      lat: 20.7000, lon: 77.0080, agName: 'Akola',       agDistrict: 'Akola' },
  { code: 'yavatmal',    name: 'Yavatmal APMC',         district: 'Yavatmal',   lat: 20.3890, lon: 78.1310, agName: 'Yavatmal',    agDistrict: 'Yavatmal' },
  { code: 'bhandara',    name: 'Bhandara APMC',         district: 'Bhandara',   lat: 21.1700, lon: 79.6500, agName: 'Bhandara',    agDistrict: 'Bhandara' },
  { code: 'gondia',      name: 'Gondia APMC',           district: 'Gondia',     lat: 21.4600, lon: 80.1950, agName: 'Gondia',      agDistrict: 'Gondia' },
  { code: 'chandrapur',  name: 'Chandrapur APMC',       district: 'Chandrapur', lat: 19.9500, lon: 79.2960, agName: 'Chandrapur',  agDistrict: 'Chandrapur' },
  { code: 'washim',      name: 'Washim APMC',           district: 'Washim',     lat: 20.1100, lon: 77.1300, agName: 'Washim',      agDistrict: 'Washim' },
  { code: 'buldhana',    name: 'Buldhana APMC',         district: 'Buldhana',   lat: 20.5300, lon: 76.1800, agName: 'Buldhana',    agDistrict: 'Buldhana' }
];

/**
 * Vehicle freight configuration.
 *
 * Indicative Vidarbha hire rates. Held in the database precisely so they can be
 * corrected without a code change - transport cost must never be hardcoded into
 * business logic (see transportCostService).
 */
const TRANSPORT_VEHICLES = [
  { type: 'tempo',        label: 'Tempo / Pickup (up to 1 t)',  ratePerKm: 18, loading: 200, unloading: 150, minCharge: 600,  capacityKg: 1000,  returnFactor: 1.35 },
  { type: 'small_truck',  label: 'Mini Truck (Tata Ace class)', ratePerKm: 25, loading: 300, unloading: 200, minCharge: 900,  capacityKg: 3000,  returnFactor: 1.30 },
  { type: 'medium_truck', label: 'Medium Truck (up to 9 t)',    ratePerKm: 38, loading: 500, unloading: 400, minCharge: 2000, capacityKg: 9000,  returnFactor: 1.25 },
  { type: 'large_truck',  label: 'Large Truck (up to 16 t)',    ratePerKm: 52, loading: 800, unloading: 600, minCharge: 4000, capacityKg: 16000, returnFactor: 1.20 }
];

/**
 * Maps the qualitative perishability band already used by spoilageService onto
 * a temperature sensitivity band. Crops that rot fast are the same crops that
 * suffer most from heat, so this is a direct restatement rather than new data.
 */
const TEMPERATURE_SENSITIVITY = {
  very_high: 'high',
  high: 'high',
  medium: 'medium',
  low: 'low',
  very_low: 'low'
};

const seedMarkets = async () => {
  let inserted = 0;
  for (const m of VIDARBHA_MARKETS) {
    const result = await query(
      `INSERT INTO markets
         (market_code, name, state, district, latitude, longitude,
          coordinate_source, agmarknet_market, agmarknet_district, active)
       VALUES ($1, $2, 'Maharashtra', $3, $4, $5, 'CITY_CENTROID', $6, $7, TRUE)
       ON CONFLICT (market_code) DO UPDATE SET
         name = EXCLUDED.name,
         district = EXCLUDED.district,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         agmarknet_market = EXCLUDED.agmarknet_market,
         agmarknet_district = EXCLUDED.agmarknet_district,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [m.code, m.name, m.district, m.lat, m.lon, m.agName, m.agDistrict]
    );
    if (result.rowCount) inserted += 1;
  }
  return inserted;
};

const seedCropProfiles = async () => {
  let inserted = 0;
  for (const [key, profile] of Object.entries(CROP_PROFILES)) {
    await query(
      `INSERT INTO crop_profiles
         (crop_key, label, perishability, shelf_life_days, temperature_sensitivity,
          optimal_temp_c, optimal_humidity, is_grain, icon, config_version, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'crop_profiles_v1', TRUE)
       ON CONFLICT (crop_key) DO UPDATE SET
         label = EXCLUDED.label,
         perishability = EXCLUDED.perishability,
         shelf_life_days = EXCLUDED.shelf_life_days,
         temperature_sensitivity = EXCLUDED.temperature_sensitivity,
         optimal_temp_c = EXCLUDED.optimal_temp_c,
         optimal_humidity = EXCLUDED.optimal_humidity,
         is_grain = EXCLUDED.is_grain,
         icon = EXCLUDED.icon,
         updated_at = CURRENT_TIMESTAMP`,
      [
        key,
        profile.label,
        profile.perishability,
        profile.baseShelfLifeDays,
        TEMPERATURE_SENSITIVITY[profile.perishability] || 'medium',
        profile.optimalTempC,
        profile.optimalHumidity,
        !!profile.isGrain,
        profile.icon
      ]
    );
    inserted += 1;
  }
  return inserted;
};

const seedTransportConfig = async () => {
  let inserted = 0;
  for (const v of TRANSPORT_VEHICLES) {
    await query(
      `INSERT INTO transport_config
         (vehicle_type, label, rate_per_km, loading_cost, unloading_cost,
          minimum_charge, capacity_kg, return_trip_factor, active, config_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'transport_v1')
       ON CONFLICT (vehicle_type) DO UPDATE SET
         label = EXCLUDED.label,
         rate_per_km = EXCLUDED.rate_per_km,
         loading_cost = EXCLUDED.loading_cost,
         unloading_cost = EXCLUDED.unloading_cost,
         minimum_charge = EXCLUDED.minimum_charge,
         capacity_kg = EXCLUDED.capacity_kg,
         return_trip_factor = EXCLUDED.return_trip_factor,
         updated_at = CURRENT_TIMESTAMP`,
      [v.type, v.label, v.ratePerKm, v.loading, v.unloading, v.minCharge, v.capacityKg, v.returnFactor]
    );
    inserted += 1;
  }
  return inserted;
};

const run = async () => {
  console.log('[Seed] Seeding market master data...');
  const markets = await seedMarkets();
  console.log(`[Seed] ✅ markets: ${markets}`);

  const crops = await seedCropProfiles();
  console.log(`[Seed] ✅ crop_profiles: ${crops} (sourced from spoilageService.CROP_PROFILES)`);

  const vehicles = await seedTransportConfig();
  console.log(`[Seed] ✅ transport_config: ${vehicles}`);

  console.log('[Seed] Done. No price observations were seeded by this script.');
};

if (require.main === module) {
  run()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] ❌ Failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { run, VIDARBHA_MARKETS, TRANSPORT_VEHICLES };

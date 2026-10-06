/**
 * Builds the market and commodity mappings for a price provider.
 *
 *   npm run map:markets              # report + write EXACT matches
 *   npm run map:markets -- --dry-run # report only
 *
 * MATCHING DISCIPLINE
 * -------------------
 * Only names that agree after normalising case, punctuation and the boilerplate
 * words every APMC name carries ("APMC", "Agricultural Produce Market Committee")
 * are written as EXACT. Everything else is reported as a CANDIDATE for a human to
 * confirm, and is written only with --accept-fuzzy, as match_type FUZZY, which
 * ingestion deliberately ignores.
 *
 * This matters: mandi_api offers "Shetkari Krushi Utapanna Bazar Roshankheda Tal
 * Varud Dist Amravati" in Amravati district. That is NOT Amravati APMC. Mapping it
 * as one would attribute a different mandi's prices to Amravati and corrupt every
 * ranking Amravati appears in.
 */

require('dotenv').config();
const { query, pool } = require('../config/db');
const { getProvider } = require('../services/providers');
const spoilageService = require('../services/spoilageService');

/**
 * Strips the boilerplate that APMC names carry so two spellings of one mandi
 * compare equal. Used ONLY for comparison, never for storage or upstream queries.
 * @param {string} value
 * @returns {string}
 */
const normalise = (value) => String(value || '')
  .toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/\b(apmc|agricultural produce market committee|market committee|krushi utapanna bazar|shetkari|bazar samiti)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * Commodity spellings to try for each of our crops.
 *
 * Keyed by our crop_profiles key. Several crops appear upstream under more than
 * one name, and the provider's commodity list is truncated (only 7 entries), so
 * these are the spellings the dataset actually uses rather than a discovered list.
 */
const COMMODITY_SPELLINGS = {
  tomato: ['Tomato'],
  onion: ['Onion'],
  potato: ['Potato'],
  chilli: ['Green Chilli', 'Chilly Red', 'Dry Chillies'],
  spinach: ['Spinach'],
  okra: ['Bhindi(Ladies Finger)'],
  cabbage: ['Cabbage'],
  cauliflower: ['Cauliflower'],
  brinjal: ['Brinjal'],
  banana: ['Banana'],
  mango: ['Mango'],
  grapes: ['Grapes'],
  orange: ['Orange'],
  wheat: ['Wheat'],
  rice: ['Rice', 'Paddy(Dhan)(Common)'],
  soybean: ['Soyabean'],
  cotton: ['Cotton'],
  sugarcane: ['Sugarcane']
};

const run = async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const acceptFuzzy = args.includes('--accept-fuzzy');
  const state = process.env.MANDI_API_DEFAULT_STATE || 'Maharashtra';

  const provider = getProvider();
  console.log(`[Map] provider=${provider.id} state=${state}${dryRun ? ' (DRY RUN)' : ''}`);

  const upstream = await provider.getMarkets({ state });
  console.log(`[Map] provider offers ${upstream.length} markets in ${state}`);

  const ours = await query(
    'SELECT id, market_code, name, district FROM markets WHERE active = TRUE AND state = $1 ORDER BY name',
    [state]
  );
  console.log(`[Map] we have ${ours.rows.length} active markets in ${state}\n`);

  const exact = [];
  const candidates = [];
  const unmatched = [];

  for (const market of ours.rows) {
    const ourKey = normalise(market.name);
    const hits = upstream.filter((u) => normalise(u.market) === ourKey);

    if (hits.length) {
      // Several upstream spellings can normalise to the same mandi ("APMC Nagpur "
      // and "Nagpur APMC"). Prefer the one whose district also agrees.
      const best = hits.find((h) => normalise(h.district) === normalise(market.district)) || hits[0];
      exact.push({ market, upstream: best, alternatives: hits.length - 1 });
      continue;
    }

    // Same district, different name: a lead for a human, not a mapping.
    const sameDistrict = upstream.filter(
      (u) => normalise(u.district) === normalise(market.district)
    );
    if (sameDistrict.length) {
      candidates.push({ market, options: sameDistrict });
    } else {
      unmatched.push(market);
    }
  }

  console.log(`EXACT matches (${exact.length}):`);
  for (const e of exact) {
    console.log(`  ${e.market.name.padEnd(24)} -> "${e.upstream.market}" [${e.upstream.district}]`
      + (e.alternatives ? `  (+${e.alternatives} other spelling)` : ''));
  }

  console.log(`\nCANDIDATES needing human confirmation (${candidates.length}):`);
  for (const c of candidates) {
    console.log(`  ${c.market.name.padEnd(24)} district ${c.market.district}:`);
    for (const o of c.options) console.log(`      "${o.market}" [${o.district}]`);
  }

  console.log(`\nNO PROVIDER COVERAGE (${unmatched.length}):`);
  console.log('  ' + (unmatched.map((m) => m.name).join(', ') || '(none)'));

  if (dryRun) {
    console.log('\n[Map] dry run - nothing written.');
    return;
  }

  let written = 0;
  for (const e of exact) {
    await query(
      `INSERT INTO market_provider_map
         (market_id, provider, provider_market, provider_district, provider_state, match_type, match_note)
       VALUES ($1, $2, $3, $4, $5, 'EXACT', $6)
       ON CONFLICT (market_id, provider) DO UPDATE SET
         provider_market = EXCLUDED.provider_market,
         provider_district = EXCLUDED.provider_district,
         match_type = EXCLUDED.match_type,
         match_note = EXCLUDED.match_note,
         updated_at = CURRENT_TIMESTAMP`,
      [e.market.id, provider.id, e.upstream.market, e.upstream.district, state,
        'Names agree after normalising APMC boilerplate.']
    );
    written += 1;
  }

  if (acceptFuzzy) {
    for (const c of candidates) {
      const pick = c.options[0];
      await query(
        `INSERT INTO market_provider_map
           (market_id, provider, provider_market, provider_district, provider_state, match_type, match_note)
         VALUES ($1, $2, $3, $4, $5, 'FUZZY', $6)
         ON CONFLICT (market_id, provider) DO NOTHING`,
        [c.market.id, provider.id, pick.market, pick.district, state,
          'Same district, different market name. NOT ingested until verified.']
      );
    }
    console.log(`[Map] recorded ${candidates.length} FUZZY candidates (not ingested)`);
  }

  // Commodity mappings, restricted to crops we actually have profiles for.
  const knownCrops = new Set(Object.keys(spoilageService.CROP_PROFILES || {}));
  let commodityRows = 0;
  for (const [crop, spellings] of Object.entries(COMMODITY_SPELLINGS)) {
    if (knownCrops.size && !knownCrops.has(crop)) continue;
    for (const spelling of spellings) {
      await query(
        `INSERT INTO commodity_provider_map (crop, provider, provider_commodity)
         VALUES ($1, $2, $3)
         ON CONFLICT (provider, provider_commodity) DO UPDATE SET crop = EXCLUDED.crop`,
        [crop, provider.id, spelling]
      );
      commodityRows += 1;
    }
  }

  console.log(`\n[Map] wrote ${written} EXACT market mappings and ${commodityRows} commodity mappings.`);
  console.log(`[Map] ingestible coverage: ${written}/${ours.rows.length} markets `
    + `(${Math.round((written / ours.rows.length) * 1000) / 10}%)`);
};

if (require.main === module) {
  run()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Map] failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { run, normalise, COMMODITY_SPELLINGS };

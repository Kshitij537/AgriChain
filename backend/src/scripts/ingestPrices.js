/**
 * Ingests market prices through the configured provider.
 *
 *   npm run ingest:prices                    # full history for mapped markets
 *   npm run ingest:prices -- --latest        # latest day only
 *   npm run ingest:prices -- --crops tomato,onion
 *   npm run ingest:prices -- --coverage      # report coverage, ingest nothing
 */

require('dotenv').config();
const { pool } = require('../config/db');
const ingestService = require('../services/marketPriceIngestService');

const run = async () => {
  const args = process.argv.slice(2);
  const latestOnly = args.includes('--latest');
  const coverageOnly = args.includes('--coverage');

  const cropsArg = args.find((a) => a.startsWith('--crops'));
  const crops = cropsArg
    ? (cropsArg.includes('=') ? cropsArg.split('=')[1] : args[args.indexOf(cropsArg) + 1] || '')
      .split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
    : null;

  if (coverageOnly) {
    const coverage = await ingestService.getCoverage();
    console.log(`[Ingest] provider=${coverage.provider} state=${coverage.state}`);
    console.log(`[Ingest] ingestible ${coverage.ingestibleMarkets}/${coverage.totalMarkets} `
      + `markets (${coverage.coveragePercent}%), ${coverage.marketsWithProviderData} hold provider rows`);
    for (const m of coverage.markets) {
      const state = m.ingestible
        ? `${m.matchType} -> "${m.providerMarket}"`
        : m.mapped ? `${m.matchType} (not ingested)` : 'unmapped';
      console.log(`  ${m.name.padEnd(24)} ${String(m.providerRows).padStart(5)} rows  `
        + `${(m.latestObservation || '-').padEnd(11)} ${state}`);
    }
    if (coverage.unmapped.length) {
      console.log(`\n[Ingest] no provider coverage: ${coverage.unmapped.join(', ')}`);
    }
    return;
  }

  const summary = await ingestService.ingestPrices({
    history: !latestOnly,
    crops
  });

  console.log(`[Ingest] provider=${summary.provider} source=${summary.source} mode=${summary.mode}`);
  console.log(`[Ingest] markets ${summary.marketsWithData}/${summary.marketsAttempted} returned data, `
    + `crops ${summary.cropsAttempted}`);
  console.log(`[Ingest] requests ${summary.requestsMade} (${summary.requestsFailed} failed), `
    + `records ${summary.recordsFetched}`);
  console.log(`[Ingest] rows inserted ${summary.rowsInserted}, updated ${summary.rowsUpdated}, `
    + `skipped ${summary.rowsSkipped}`);
  console.log(`[Ingest] status ${summary.status}`);

  for (const m of summary.perMarket) {
    if (!m.records && !m.failures.length) continue;
    console.log(`   ${m.marketName.padEnd(24)} ${String(m.records).padStart(4)} records  `
      + `+${m.inserted}/~${m.updated}  crops: ${m.crops.join(', ') || '-'}`);
  }

  if (summary.errors.length) {
    console.log('\n[Ingest] first errors:');
    for (const e of summary.errors.slice(0, 8)) console.log('   -', e);
  }
};

if (require.main === module) {
  run()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Ingest] failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { run };

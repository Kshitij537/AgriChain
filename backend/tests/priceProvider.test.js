/**
 * Market price provider tests.
 *
 * NO NETWORK. The provider's HTTP layer is exercised by stubbing axios, and the
 * ingestion service is driven by a fake provider, so the suite stays fast and
 * cannot fail because an upstream free-tier host is asleep.
 */

const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');

const {
  MarketPriceProvider,
  ProviderNotImplementedError,
  CANONICAL_PRICE_UNIT
} = require('../src/services/providers/marketPriceProvider');
const {
  MandiApiProvider,
  namesMatch,
  normaliseMarketName,
  parseObservationDate,
  toPrice
} = require('../src/services/providers/mandiApiProvider');
const factory = require('../src/services/providers');

/** One upstream record, shaped exactly as the live API returns it. */
const upstreamRecord = (overrides = {}) => ({
  id: 253933,
  state: 'Maharashtra',
  district: 'Nagpur',
  market: 'APMC Nagpur ',
  commodity: 'Tomato',
  variety: 'Local',
  grade: 'Local',
  arrival_date: '2026-09-24',
  min_price: 1000,
  max_price: 2500,
  modal_price: 2125,
  fetched_at: '2026-09-24T18:43:10.059+00:00',
  ...overrides
});

/** Replaces axios.get for one call, restoring it afterwards. */
const withAxios = async (impl, fn) => {
  const original = axios.get;
  axios.get = impl;
  try {
    return await fn();
  } finally {
    axios.get = original;
  }
};

const ok = (data, meta = {}) => async () => ({
  status: 200,
  data: { success: true, data, meta }
});

// --- the abstraction -------------------------------------------------------

test('provider abstraction: an unimplemented method fails typed, not undefined', async () => {
  const bare = new MarketPriceProvider({ id: 'bare', sourceLabel: 'BARE' });

  await assert.rejects(() => bare.getPrices(), (err) => {
    assert.ok(err instanceof ProviderNotImplementedError);
    assert.equal(err.code, 'PROVIDER_NOT_IMPLEMENTED');
    return true;
  });
});

test('provider abstraction: provenance labelling is mandatory', () => {
  assert.throws(() => new MarketPriceProvider({ id: 'x' }), /sourceLabel/);
  assert.throws(() => new MarketPriceProvider({ sourceLabel: 'X' }), /id/);
});

test('provider factory: a typo in the env var fails loudly, never silently', () => {
  const previous = process.env.MARKET_PRICE_PROVIDER;
  try {
    process.env.MARKET_PRICE_PROVIDER = 'agmarknet_typo';
    factory.clearProviderCache();
    assert.throws(() => factory.getProvider(), (err) => err.code === 'UNKNOWN_PRICE_PROVIDER');
  } finally {
    process.env.MARKET_PRICE_PROVIDER = previous;
    factory.clearProviderCache();
  }
});

test('provider factory: mandi_api is the registered default', () => {
  factory.clearProviderCache();
  const provider = factory.getProvider('mandi_api');
  assert.equal(provider.id, 'mandi_api');
  // Names the provider we fetched from, NOT the upstream government dataset.
  assert.equal(provider.sourceLabel, 'MANDI_API');
  assert.notEqual(provider.sourceLabel, 'AGMARKNET');
});

// --- market name handling --------------------------------------------------

test('mandi_api: two upstream spellings of one mandi are recognised as the same', () => {
  // The upstream market filter is a partial match, so a query for one market
  // returns rows labelled both ways. Rejecting either loses real observations.
  assert.ok(namesMatch('Chandrapur(Ganjwad) ', 'Chandrapur(Ganjwad) APMC'));
  assert.ok(namesMatch('APMC Nagpur ', 'Nagpur APMC'));
  assert.ok(namesMatch('HINGNA - APMC', 'APMC Hingna'));
});

test('mandi_api: genuinely different markets are never conflated', () => {
  assert.ok(!namesMatch('APMC Hingna', 'APMC Nagpur '));
  assert.ok(!namesMatch('APMC Nagpur', 'APMC Nagpur Rural'));
  assert.ok(!namesMatch('Akola APMC', 'Wardha APMC'));
  // Stripping boilerplate must not reduce a name to nothing and then match.
  assert.ok(!namesMatch('APMC', 'Nagpur APMC'));
  assert.equal(normaliseMarketName('APMC'), '');
});

// --- record normalisation -------------------------------------------------

test('mandi_api: a record becomes a canonical observation', () => {
  const provider = new MandiApiProvider();
  const record = provider.normaliseRecord(upstreamRecord());

  assert.equal(record.providerMarket, 'APMC Nagpur ', 'stored verbatim so it can be replayed');
  assert.equal(record.observationDate, '2026-09-24');
  assert.equal(record.modalPrice, 2125);
  assert.equal(record.minPrice, 1000);
  assert.equal(record.maxPrice, 2500);
  assert.equal(record.variety, 'Local');
  assert.equal(record.priceUnit, CANONICAL_PRICE_UNIT);
  assert.equal(record.providerRecordId, '253933');
});

test('mandi_api: an unusable record is dropped, not passed on half-formed', () => {
  const provider = new MandiApiProvider();

  assert.equal(provider.normaliseRecord(upstreamRecord({ modal_price: 0 })), null,
    'a mandi does not trade at zero - that is a missing value, not a price');
  assert.equal(provider.normaliseRecord(upstreamRecord({ modal_price: null })), null);
  assert.equal(provider.normaliseRecord(upstreamRecord({ arrival_date: 'not-a-date' })), null);
  assert.equal(provider.normaliseRecord(upstreamRecord({ market: null })), null);
  assert.equal(provider.normaliseRecord(null), null);
});

test('mandi_api: a missing min/max does not become zero', () => {
  const provider = new MandiApiProvider();
  const record = provider.normaliseRecord(upstreamRecord({ min_price: 0, max_price: null }));
  assert.equal(record.minPrice, null);
  assert.equal(record.maxPrice, null);
  assert.equal(record.modalPrice, 2125, 'the modal price still stands on its own');
});

test('mandi_api: dates are parsed without a timezone shifting the day', () => {
  // new Date('2026-09-24') is UTC midnight = 23 Sep in IST, which would age every
  // observation by a day and make fresh prices look stale.
  assert.equal(parseObservationDate('2026-09-24'), '2026-09-24');
  assert.equal(parseObservationDate('2026-09-24T18:43:10Z'), '2026-09-24');
  assert.equal(parseObservationDate('2026-13-01'), null);
  assert.equal(parseObservationDate(''), null);
  assert.equal(parseObservationDate(null), null);
});

test('mandi_api: zero and negative prices are rejected by toPrice', () => {
  assert.equal(toPrice(1500), 1500);
  assert.equal(toPrice('1500'), 1500);
  assert.equal(toPrice(0), null);
  assert.equal(toPrice(-5), null);
  assert.equal(toPrice(''), null);
  assert.equal(toPrice(null), null);
});

// --- HTTP behaviour --------------------------------------------------------

test('mandi_api: a structured upstream error keeps its own code', async () => {
  const provider = new MandiApiProvider({ retries: 0 });

  await withAxios(async () => ({
    status: 404,
    data: { success: false, error: { code: 'INVALID_STATE', message: 'Unknown state "Kerala".' } }
  }), async () => {
    await assert.rejects(() => provider.getPrices({ state: 'Kerala' }), (err) => {
      assert.equal(err.code, 'INVALID_STATE', 'the provider code must survive');
      assert.equal(err.status, 404);
      assert.equal(err.retryable, false, 'a bad state will fail identically forever');
      return true;
    });
  });
});

test('mandi_api: a 5xx is retryable, a 4xx is not', async () => {
  let calls = 0;
  const provider = new MandiApiProvider({ retries: 1, timeoutMs: 50 });

  await withAxios(async () => {
    calls += 1;
    return { status: 503, data: { success: false, error: { code: 'UPSTREAM', message: 'down' } } };
  }, async () => {
    await assert.rejects(() => provider.getStates());
  });
  assert.equal(calls, 2, 'a 503 must be retried once');

  calls = 0;
  await withAxios(async () => {
    calls += 1;
    return { status: 400, data: { success: false, error: { code: 'INVALID_DATE', message: 'bad' } } };
  }, async () => {
    await assert.rejects(() => provider.getStates());
  });
  assert.equal(calls, 1, 'a 400 must not burn retries');
});

test('mandi_api: a success envelope without success:true is rejected', async () => {
  const provider = new MandiApiProvider({ retries: 0 });
  await withAxios(async () => ({ status: 200, data: { records: [] } }), async () => {
    await assert.rejects(() => provider.getStates(), (err) => err.code === 'PROVIDER_BAD_ENVELOPE');
  });
});

test('mandi_api: the date filter is enforced locally, not trusted upstream', async () => {
  // A market-scoped upstream query returns the market's WHOLE history regardless
  // of the date asked for, so the provider must filter it itself.
  const provider = new MandiApiProvider({ retries: 0 });
  const rows = [
    upstreamRecord({ id: 1, arrival_date: '2026-09-24' }),
    upstreamRecord({ id: 2, arrival_date: '2026-09-23' }),
    upstreamRecord({ id: 3, arrival_date: '2026-09-22' })
  ];

  await withAxios(ok(rows), async () => {
    const all = await provider.getPrices({ commodity: 'Tomato', market: 'APMC Nagpur ' });
    assert.equal(all.length, 3);

    const oneDay = await provider.getPrices({
      commodity: 'Tomato', market: 'APMC Nagpur ', date: '2026-09-23'
    });
    assert.equal(oneDay.length, 1);
    assert.equal(oneDay[0].observationDate, '2026-09-23');
  });
});

test('mandi_api: history comes back oldest first', async () => {
  const provider = new MandiApiProvider({ retries: 0 });
  const rows = [
    upstreamRecord({ id: 1, arrival_date: '2026-09-24' }),
    upstreamRecord({ id: 2, arrival_date: '2026-09-05' }),
    upstreamRecord({ id: 3, arrival_date: '2026-09-12' })
  ];

  await withAxios(ok(rows), async () => {
    const history = await provider.getPriceHistory({ commodity: 'Tomato', market: 'APMC Nagpur ' });
    assert.deepEqual(
      history.map((r) => r.observationDate),
      ['2026-09-05', '2026-09-12', '2026-09-24'],
      'the ML feature builder needs chronological order'
    );
  });
});

test('mandi_api: the 200-record ceiling is flagged, since upstream is silent about it', async () => {
  const provider = new MandiApiProvider({ retries: 0 });
  const rows = Array.from({ length: 200 }, (_, i) => upstreamRecord({ id: i }));

  await withAxios(ok(rows), async () => {
    const result = await provider.getPrices({ commodity: 'Tomato' });
    assert.equal(result.truncated, true, 'a silently truncated result must be visible');
  });
});

test('mandi_api: health reports unreachability instead of throwing', async () => {
  const provider = new MandiApiProvider({ retries: 0, timeoutMs: 50 });

  await withAxios(async () => {
    const err = new Error('socket hang up');
    err.code = 'ECONNRESET';
    throw err;
  }, async () => {
    const health = await provider.health();
    assert.equal(health.reachable, false, 'a sleeping provider is a fact, not an exception');
    assert.equal(health.requiresApiKey, false, 'this provider is keyless by design');
    assert.ok(health.reason);
  });
});

test('mandi_api: declares that it cannot bulk-pull a state', () => {
  const caps = new MandiApiProvider().capabilities();
  // /prices caps at 200 and ignores limit/offset/page, so ingestion must iterate
  // markets. Callers need to know that without discovering it by truncation.
  assert.equal(caps.bulkByState, false);
  assert.equal(caps.maxRecordsPerCall, 200);
  // /commodities is truncated upstream at 7 entries; the crop list must not come
  // from there.
  assert.equal(caps.commoditiesComplete, false);
});

// --- rate limiting ---------------------------------------------------------

test('mandi_api: a 429 is never retried, because the window is minutes long', async () => {
  let calls = 0;
  const provider = new MandiApiProvider({ retries: 2, timeoutMs: 50 });
  provider.minRequestIntervalMs = 0;

  await withAxios(async () => {
    calls += 1;
    return {
      status: 429,
      headers: { 'retry-after': '900' },
      data: {
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Maximum 100 requests per 15 minutes allowed per IP.' }
      }
    };
  }, async () => {
    await assert.rejects(() => provider.getStates(), (err) => {
      assert.equal(err.code, 'PROVIDER_RATE_LIMITED');
      assert.equal(err.rateLimited, true, 'the caller must be told to abandon the pass');
      assert.equal(err.retryAfterSeconds, 900);
      return true;
    });
  });

  // Retrying a rate limit spends budget a later legitimate request needs.
  assert.equal(calls, 1, 'exactly one attempt');
});

test('mandi_api: requests are paced against the documented budget', async () => {
  const provider = new MandiApiProvider({ retries: 0 });
  provider.minRequestIntervalMs = 120;

  await withAxios(ok(['Maharashtra']), async () => {
    const startedAt = Date.now();
    await provider.getStates();
    await provider.getStates();
    await provider.getStates();
    const elapsed = Date.now() - startedAt;
    // Two gaps of at least 120ms between three calls.
    assert.ok(elapsed >= 240, `three paced calls took ${elapsed}ms, expected >= 240ms`);
  });
});

test('mandi_api: the documented rate limit is declared, not discovered by failing', () => {
  const caps = new MandiApiProvider().capabilities();
  assert.equal(caps.rateLimitRequests, 100);
  assert.equal(caps.rateLimitWindowMs, 15 * 60 * 1000);
});

// --- ingestion, driven by a fake provider (no network) --------------------

const ingestService = require('../src/services/marketPriceIngestService');
const { query } = require('../src/config/db');

/** A provider that answers from a script, so ingestion logic is tested alone. */
const fakeProvider = ({ rows = [], failWith = null, rateLimitAfter = null } = {}) => {
  let calls = 0;
  return {
    id: 'mandi_api',
    sourceLabel: 'MANDI_API',
    capabilities: () => ({ rateLimitRequests: 100, rateLimitWindowMs: 900000 }),
    async getPriceHistory() {
      calls += 1;
      if (rateLimitAfter !== null && calls > rateLimitAfter) {
        const err = new Error('Rate limit exceeded.');
        err.code = 'PROVIDER_RATE_LIMITED';
        err.rateLimited = true;
        throw err;
      }
      if (failWith) {
        const err = new Error(failWith);
        err.code = failWith;
        throw err;
      }
      return rows;
    },
    async getPrices() { return this.getPriceHistory(); },
    get callCount() { return calls; }
  };
};

test('ingest: no mapping is reported as a reason, not a silent success', async () => {
  const summary = await ingestService.ingestPrices({
    provider: fakeProvider(),
    // A market id that cannot exist, so nothing is mapped to it.
    marketIds: [-1]
  });

  assert.equal(summary.status, 'FAILED');
  assert.equal(summary.rowsInserted, 0);
  assert.match(summary.errors[0], /mapping/i, 'it must say what is missing');
});

test('ingest: a rate limit stops the pass instead of hammering', async () => {
  const provider = fakeProvider({ rateLimitAfter: 1, rows: [] });
  const summary = await ingestService.ingestPrices({ provider });

  // One success then a rate limit: the pass must abandon, not keep trying every
  // remaining market and crop.
  assert.ok(provider.callCount <= 2, `made ${provider.callCount} calls, expected to stop at 2`);
  assert.equal(summary.rateLimited, true);
  assert.match(summary.errors[0], /rate limit/i);

  // price_ingest_runs is a real operational audit log an operator reads to answer
  // "why is there no price for this mandi". A test must not leave fake FAILED runs
  // in it, or the log stops being trustworthy evidence.
  if (summary.runId) {
    await query('DELETE FROM price_ingest_runs WHERE id = $1', [summary.runId]);
  }
});

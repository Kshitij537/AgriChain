/**
 * MandiApiProvider - price observations from the keyless Mandi Price API.
 *
 *   https://mandi-api.onrender.com/v1
 *
 * PROVENANCE - READ THIS BEFORE LABELLING ANYTHING
 * -----------------------------------------------
 * This provider aggregates data.gov.in. It is NOT an independent government
 * source and must never be presented to a farmer as one. Rows are stored with
 * source = 'MANDI_API' and the provider is identified internally as 'mandi_api',
 * so the thing we can actually vouch for - which service we fetched from - is
 * what gets recorded. Its freshness, coverage and errors are its own.
 *
 * MEASURED UPSTREAM BEHAVIOUR (verified against the live API, not assumed)
 * ----------------------------------------------------------------------
 * - Envelope: { success, data, meta }. Errors: { success:false, error:{code,message} }
 *   with real statuses (404 INVALID_STATE, 400 INVALID_DATE).
 * - `market` values carry TRAILING SPACES ("APMC Nagpur ") and near-duplicate
 *   spellings exist ("APMC Hingna" vs "HINGNA - APMC"). Names are stored exactly
 *   as returned so a lookup can be replayed, and compared only after normalising.
 * - `commodity` matching is case-insensitive. An unknown commodity is 200 with
 *   data: [] - absence of data, not an error.
 * - /prices is HARD-CAPPED AT 200 records and ignores limit/offset/page. There is
 *   no pagination, so a state-wide bulk pull is impossible; ingestion must query
 *   market by market. capabilities().bulkByState is false for this reason.
 * - A market-scoped /prices query returns that market's FULL history, which is
 *   why getPrices applies the date filter itself when one is asked for.
 * - /commodities?state=... returns only 7 entries, alphabetically truncated at
 *   "Bajra". That is an upstream defect; the crop list must come from our own
 *   crop_profiles instead. getCommodities still exposes it, flagged as unreliable.
 * - Hosted on a free tier that sleeps, so the first request after idle can take
 *   tens of seconds. Timeouts are generous and cold starts are retried.
 */

const axios = require('axios');
const {
  MarketPriceProvider,
  ProviderRequestError,
  CANONICAL_PRICE_UNIT
} = require('./marketPriceProvider');

const DEFAULT_BASE_URL = 'https://mandi-api.onrender.com/v1';

/** Generous because the upstream host sleeps when idle and must cold-start. */
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRIES = 2;

/**
 * Documented upstream budget: 100 requests / 15 minutes / IP. Recorded here so the
 * pacing default has a stated reason rather than being a magic number.
 */
const RATE_LIMIT_REQUESTS = 100;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
/** ~9s between requests keeps 100 calls inside the window with margin. */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 900;

/** States the API declared when this provider was written; refreshed by getStates. */
const DECLARED_STATES = [
  'Maharashtra', 'Uttar Pradesh', 'Punjab', 'Madhya Pradesh', 'Karnataka'
];

/**
 * Normalises a market or commodity name for COMPARISON only.
 *
 * Never use the result for storage or for an upstream query - the API's own
 * spelling, trailing spaces included, is what it will match on.
 *
 * @param {string} value
 * @returns {string}
 */
const normaliseName = (value) => String(value || '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Normalises a MARKET name for comparison, stripping the boilerplate every APMC
 * name carries and any parenthesised qualifier.
 *
 * This exists because the upstream market filter is a PARTIAL match: asking for
 * "Chandrapur(Ganjwad) " also returns rows labelled "Chandrapur(Ganjwad) APMC",
 * which is the same physical mandi spelled two ways. Comparing raw strings throws
 * those real observations away; comparing on this form keeps them while still
 * rejecting a genuinely different market ("APMC Hingna" -> "hingna").
 *
 * Comparison only - never store this or send it upstream.
 * @param {string} value
 * @returns {string}
 */
const normaliseMarketName = (value) => String(value || '')
  .toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/\b(apmc|agricultural produce market committee|market committee|krushi utapanna bazar|krushi utpanna bazar samiti|shetkari|bazar samiti)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * True when two market names refer to the same mandi.
 *
 * Strict on the stripped form: equality only, never substring or token matching,
 * so "nagpur" and "nagpur rural" stay distinct.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const namesMatch = (a, b) => {
  const left = normaliseMarketName(a);
  const right = normaliseMarketName(b);
  return Boolean(left) && left === right;
};

/**
 * Parses YYYY-MM-DD without letting a timezone shift the day.
 *
 * `new Date('2026-09-24')` is UTC midnight, which is the previous day in IST and
 * would age every observation by one.
 * @param {string} value
 * @returns {string|null}
 */
const parseObservationDate = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m}-${d}`;
};

/**
 * Converts a provider price field to a number, or null.
 *
 * Zero is rejected rather than stored: a mandi does not trade at ₹0, so a 0 is a
 * missing value, and storing it as a price would make a market look free.
 * @param {*} value
 * @returns {number|null}
 */
const toPrice = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

class MandiApiProvider extends MarketPriceProvider {
  constructor({ baseUrl = null, timeoutMs = null, retries = null } = {}) {
    super({
      id: 'mandi_api',
      sourceLabel: 'MANDI_API',
      // Operator-facing only. Deliberately not "AGMARKNET" or "data.gov.in".
      displayName: 'Mandi Price API (aggregator)'
    });

    this.baseUrl = (baseUrl || process.env.MANDI_API_BASE_URL || DEFAULT_BASE_URL)
      .replace(/\/+$/, '');
    this.timeoutMs = Number(timeoutMs || process.env.MANDI_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    this.retries = Number(retries ?? process.env.MANDI_API_RETRIES ?? DEFAULT_RETRIES);
    this.defaultState = process.env.MANDI_API_DEFAULT_STATE || 'Maharashtra';

    // Upstream allows 100 requests per 15 minutes per IP. Pacing requests keeps a
    // long ingestion pass inside that budget instead of tripping it halfway and
    // leaving a partially populated database.
    this.minRequestIntervalMs = Number(
      process.env.MANDI_API_MIN_REQUEST_INTERVAL_MS ?? DEFAULT_MIN_REQUEST_INTERVAL_MS
    );
    this._lastRequestAt = 0;
  }

  capabilities() {
    return {
      states: true,
      commodities: true,
      markets: true,
      prices: true,
      priceHistory: true,
      // /prices caps at 200 and ignores paging, so a state cannot be pulled whole.
      bulkByState: false,
      rateLimitRequests: RATE_LIMIT_REQUESTS,
      rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
      // /commodities is truncated upstream; do not rely on it to enumerate crops.
      commoditiesComplete: false,
      maxRecordsPerCall: 200
    };
  }

  /**
   * One GET against the provider, with retries for the conditions that a later
   * attempt can plausibly fix.
   *
   * @param {string} path - e.g. '/prices'
   * @param {object} [params]
   * @returns {Promise<object>} the parsed envelope's data + meta
   * @throws {ProviderRequestError}
   */
  async request(path, params = {}) {
    const url = `${this.baseUrl}${path}`;
    // Undefined/null params must not become "undefined" in the query string.
    const query = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') query[k] = v;
    }

    let lastError = null;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      // Pace against the upstream budget before every attempt.
      if (this.minRequestIntervalMs > 0) {
        const since = Date.now() - this._lastRequestAt;
        if (this._lastRequestAt && since < this.minRequestIntervalMs) {
          await new Promise((r) => setTimeout(r, this.minRequestIntervalMs - since));
        }
      }
      this._lastRequestAt = Date.now();

      try {
        const response = await axios.get(url, {
          params: query,
          timeout: this.timeoutMs,
          // Resolve every status so a 404 INVALID_STATE can carry the provider's
          // own error message instead of becoming a generic axios failure.
          validateStatus: () => true
        });

        const body = response.data;

        if (response.status >= 200 && response.status < 300) {
          if (!body || body.success !== true) {
            throw new ProviderRequestError(
              `Unexpected response envelope from ${this.id}${path}`,
              { provider: this.id, code: 'PROVIDER_BAD_ENVELOPE', status: response.status }
            );
          }
          return { data: body.data, meta: body.meta || {} };
        }

        // Structured upstream error: surface its own code and message.
        const upstream = body && body.error ? body.error : null;

        // A 429 is NOT retried here. The documented window is 100 requests per 15
        // minutes per IP, so retrying after a 2-second backoff cannot succeed and
        // only spends budget that a later, legitimate request needs. The caller is
        // told to stop instead.
        const rateLimited = response.status === 429
          || (upstream && upstream.code === 'TOO_MANY_REQUESTS');

        const error = new ProviderRequestError(
          upstream ? upstream.message : `${this.id}${path} returned HTTP ${response.status}`,
          {
            provider: this.id,
            code: rateLimited
              ? 'PROVIDER_RATE_LIMITED'
              : upstream && upstream.code ? upstream.code : 'PROVIDER_HTTP_ERROR',
            status: response.status,
            retryable: !rateLimited && response.status >= 500
          }
        );
        /** Signals the caller to abandon the whole pass, not just this request. */
        error.rateLimited = rateLimited;
        if (rateLimited) {
          const retryAfter = response.headers && response.headers['retry-after'];
          error.retryAfterSeconds = retryAfter ? Number(retryAfter) : null;
        }
        throw error;
      } catch (error) {
        // A typed non-retryable provider error is final - do not burn retries on
        // an INVALID_STATE that will fail identically every time.
        if (error instanceof ProviderRequestError && !error.retryable) throw error;

        const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
        const isNetwork = error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED'
          || error.code === 'ECONNRESET' || error.code === 'EAI_AGAIN';

        lastError = error instanceof ProviderRequestError ? error : new ProviderRequestError(
          isTimeout
            ? `${this.id} timed out after ${this.timeoutMs}ms (the host sleeps when idle and may be cold-starting)`
            : `${this.id} request failed: ${error.message}`,
          {
            provider: this.id,
            code: isTimeout ? 'PROVIDER_TIMEOUT' : isNetwork ? 'PROVIDER_UNREACHABLE' : 'PROVIDER_REQUEST_FAILED',
            retryable: isTimeout || isNetwork
          }
        );

        if (attempt === this.retries || !lastError.retryable) throw lastError;

        // Linear backoff: a cold start needs time, not hammering.
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      }
    }

    throw lastError;
  }

  /**
   * Translates one upstream record into the canonical observation shape.
   *
   * Returns null for anything that is not a usable observation. A record with no
   * positive modal price or no parseable date is dropped here rather than being
   * passed downstream for someone else to guess about.
   *
   * @param {object} record
   * @returns {object|null}
   */
  normaliseRecord(record) {
    if (!record || typeof record !== 'object') return null;

    const observationDate = parseObservationDate(record.arrival_date);
    const modalPrice = toPrice(record.modal_price);
    const market = record.market;

    if (!observationDate || !modalPrice || !market) return null;

    const minPrice = toPrice(record.min_price);
    const maxPrice = toPrice(record.max_price);

    return {
      providerState: record.state || null,
      providerDistrict: record.district || null,
      // Stored verbatim, trailing spaces included, so it can be replayed upstream.
      providerMarket: String(market),
      providerCommodity: record.commodity || null,
      variety: record.variety || 'Other',
      grade: record.grade || null,
      observationDate,
      minPrice,
      maxPrice,
      modalPrice,
      priceUnit: CANONICAL_PRICE_UNIT,
      fetchedAt: record.fetched_at || null,
      providerRecordId: record.id === undefined || record.id === null ? null : String(record.id)
    };
  }

  /** @returns {Promise<Array<string>>} */
  async getStates() {
    const { data } = await this.request('/states');
    return Array.isArray(data) ? data : DECLARED_STATES;
  }

  /**
   * @param {object} [filters] - { state, market }
   * @returns {Promise<Array<string>>} UNRELIABLE upstream - see class notes
   */
  async getCommodities({ state = null, market = null } = {}) {
    const { data } = await this.request('/commodities', {
      state: state || this.defaultState,
      market
    });
    return Array.isArray(data) ? data : [];
  }

  /**
   * @param {object} [filters] - { state }
   * @returns {Promise<Array<{market: string, district: string|null}>>}
   */
  async getMarkets({ state = null } = {}) {
    const { data } = await this.request('/markets', { state: state || this.defaultState });
    if (!Array.isArray(data)) return [];
    return data
      .filter((row) => row && row.market)
      .map((row) => ({ market: String(row.market), district: row.district || null }));
  }

  /**
   * Current observations.
   *
   * A market-scoped upstream query returns that market's whole history, so when a
   * date is requested it is also enforced here rather than trusted to the API.
   *
   * @param {object} filters - { state, commodity, market, date }
   * @returns {Promise<Array<object>>} canonical records
   */
  async getPrices({ state = null, commodity = null, market = null, date = null } = {}) {
    const { data, meta } = await this.request('/prices', {
      state: state || this.defaultState,
      commodity,
      market,
      date
    });

    const records = (Array.isArray(data) ? data : [])
      .map((r) => this.normaliseRecord(r))
      .filter(Boolean);

    const filtered = date
      ? records.filter((r) => r.observationDate === date)
      : records;

    // The 200-record ceiling is silent upstream: nothing in the payload says the
    // result was truncated, so flag it where a caller can see it.
    if (Array.isArray(data) && data.length >= this.capabilities().maxRecordsPerCall && !market) {
      filtered.truncated = true;
    }

    Object.defineProperty(filtered, 'providerMeta', { value: meta, enumerable: false });
    return filtered;
  }

  /**
   * Historical observations, oldest first.
   * @param {object} filters - { state, commodity, market }
   * @returns {Promise<Array<object>>}
   */
  async getPriceHistory({ state = null, commodity = null, market = null } = {}) {
    const { data, meta } = await this.request('/prices/history', {
      state: state || this.defaultState,
      commodity,
      market
    });

    const records = (Array.isArray(data) ? data : [])
      .map((r) => this.normaliseRecord(r))
      .filter(Boolean)
      .sort((a, b) => a.observationDate.localeCompare(b.observationDate));

    Object.defineProperty(records, 'providerMeta', { value: meta, enumerable: false });
    return records;
  }

  /**
   * Reachability. Never throws - a sleeping provider is a fact to report.
   * @returns {Promise<object>}
   */
  async health() {
    const startedAt = Date.now();
    try {
      const states = await this.getStates();
      return {
        provider: this.id,
        displayName: this.displayName,
        baseUrl: this.baseUrl,
        // Keyless by design: there is no credential to misconfigure or leak.
        requiresApiKey: false,
        configured: true,
        reachable: true,
        latencyMs: Date.now() - startedAt,
        supportedStates: states,
        capabilities: this.capabilities()
      };
    } catch (error) {
      return {
        provider: this.id,
        displayName: this.displayName,
        baseUrl: this.baseUrl,
        requiresApiKey: false,
        configured: true,
        reachable: false,
        latencyMs: Date.now() - startedAt,
        reason: error.code || 'PROVIDER_REQUEST_FAILED',
        message: error.message,
        retryable: error.retryable === true,
        capabilities: this.capabilities()
      };
    }
  }
}

module.exports = {
  MandiApiProvider,
  normaliseName,
  normaliseMarketName,
  namesMatch,
  parseObservationDate,
  toPrice,
  DEFAULT_BASE_URL,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS
};

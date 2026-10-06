/**
 * MarketPriceProvider - the contract every price source must satisfy.
 *
 * WHY AN ABSTRACTION
 * ------------------
 * The market recommendation engine must not know where prices come from. The old
 * design wired data.gov.in directly into ingestion, so swapping providers meant
 * editing the engine's neighbourhood. Adding MSAMB or CEDA later should be a new
 * file implementing this interface plus one row in the factory - nothing else.
 *
 * THE CANONICAL OBSERVATION
 * -------------------------
 * Providers differ in field names, price units, date formats and how they spell a
 * market. Each provider is responsible for translating its own payload into the
 * shape below, so everything downstream reads one vocabulary:
 *
 *   {
 *     providerState:     string        as the provider spells it
 *     providerDistrict:  string|null
 *     providerMarket:    string        EXACTLY as returned, spacing preserved
 *     providerCommodity: string
 *     variety:           string        'Other' when the provider omits it
 *     grade:             string|null
 *     observationDate:   'YYYY-MM-DD'
 *     minPrice:          number|null   rupees per quintal
 *     maxPrice:          number|null
 *     modalPrice:        number        rupees per quintal, REQUIRED
 *     priceUnit:         'INR_PER_QUINTAL'
 *     fetchedAt:         ISO string|null  when the PROVIDER captured it
 *     providerRecordId:  string|null
 *   }
 *
 * A record that cannot supply a positive modalPrice and a valid observationDate
 * is not an observation and must be dropped by the provider, not passed on for
 * someone downstream to guess about.
 *
 * PROVENANCE RULE
 * ---------------
 * `sourceLabel` is written to market_prices.source. It identifies the PROVIDER we
 * fetched from, never the ultimate origin of the data. A provider that itself
 * aggregates a government dataset must not be labelled as that government
 * dataset: the farmer's price came through the provider, and its freshness,
 * coverage and mistakes are the provider's.
 */

/** Unit every provider must normalise to, so no conversion is ever implicit. */
const CANONICAL_PRICE_UNIT = 'INR_PER_QUINTAL';

/**
 * Raised when a provider is asked for something it cannot do, so a caller gets a
 * typed failure instead of `undefined`.
 */
class ProviderNotImplementedError extends Error {
  constructor(provider, method) {
    super(`Provider "${provider}" does not implement ${method}().`);
    this.code = 'PROVIDER_NOT_IMPLEMENTED';
    this.provider = provider;
    this.method = method;
  }
}

/**
 * Raised when an upstream provider fails. Carries enough for the caller to decide
 * whether to retry, degrade, or surface the problem.
 */
class ProviderRequestError extends Error {
  constructor(message, { provider, code = 'PROVIDER_REQUEST_FAILED', status = null, retryable = false } = {}) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.status = status;
    /** True for timeouts, cold starts and 5xx - things a later run may succeed at. */
    this.retryable = retryable;
  }
}

class MarketPriceProvider {
  /**
   * @param {object} config
   * @param {string} config.id - internal identifier, e.g. 'mandi_api'
   * @param {string} config.sourceLabel - value written to market_prices.source
   * @param {string} [config.displayName] - operator-facing name, never presented
   *   to a farmer as a government source
   */
  constructor({ id, sourceLabel, displayName = null } = {}) {
    if (!id) throw new Error('a provider needs an id');
    if (!sourceLabel) throw new Error('a provider needs a sourceLabel for provenance');

    this.id = id;
    this.sourceLabel = sourceLabel;
    this.displayName = displayName || id;
  }

  /**
   * States the provider can answer for.
   * @returns {Promise<Array<string>>}
   */
  async getStates() {
    throw new ProviderNotImplementedError(this.id, 'getStates');
  }

  /**
   * Commodities the provider knows about.
   * @param {object} [filters] - { state, market }
   * @returns {Promise<Array<string>>}
   */
  async getCommodities() {
    throw new ProviderNotImplementedError(this.id, 'getCommodities');
  }

  /**
   * Markets the provider covers.
   * @param {object} [filters] - { state }
   * @returns {Promise<Array<{market: string, district: string|null}>>}
   */
  async getMarkets() {
    throw new ProviderNotImplementedError(this.id, 'getMarkets');
  }

  /**
   * Current price observations, as canonical records.
   * @param {object} filters - { state, commodity, market, date }
   * @returns {Promise<Array<object>>}
   */
  async getPrices() {
    throw new ProviderNotImplementedError(this.id, 'getPrices');
  }

  /**
   * Historical price observations, as canonical records, oldest first.
   * @param {object} filters - { state, commodity, market }
   * @returns {Promise<Array<object>>}
   */
  async getPriceHistory() {
    throw new ProviderNotImplementedError(this.id, 'getPriceHistory');
  }

  /**
   * Reachability and configuration, for /health. Must never throw: a provider
   * being down is information, not an error.
   * @returns {Promise<object>}
   */
  async health() {
    return { provider: this.id, configured: true, reachable: null, reason: 'NOT_IMPLEMENTED' };
  }

  /**
   * Declared capabilities, so callers can avoid asking for what a provider cannot
   * do rather than discovering it through an exception.
   * @returns {object}
   */
  capabilities() {
    return {
      states: false,
      commodities: false,
      markets: false,
      prices: false,
      priceHistory: false,
      /** True when the provider can return many markets in one call. */
      bulkByState: false
    };
  }
}

module.exports = {
  MarketPriceProvider,
  ProviderNotImplementedError,
  ProviderRequestError,
  CANONICAL_PRICE_UNIT
};

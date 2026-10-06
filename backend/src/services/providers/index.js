/**
 * Market price provider factory.
 *
 * The one place that knows which providers exist. Everything else asks for "the
 * provider" and gets whatever MARKET_PRICE_PROVIDER selects, mirroring how
 * routingService dispatches on ROUTING_PROVIDER.
 *
 * Adding MSAMB or CEDA later is a require plus one entry in PROVIDERS - the
 * recommendation engine and the ingestion service do not change.
 */

const { MandiApiProvider } = require('./mandiApiProvider');
const {
  MarketPriceProvider,
  ProviderRequestError,
  ProviderNotImplementedError
} = require('./marketPriceProvider');

/** Registered provider constructors, keyed by the MARKET_PRICE_PROVIDER value. */
const PROVIDERS = {
  mandi_api: MandiApiProvider
};

const DEFAULT_PROVIDER_ID = 'mandi_api';

/** Instances are cached: they hold only configuration, and re-creating them per
 *  request would discard nothing but waste allocations. */
const _cache = new Map();

/**
 * The configured provider id, normalised.
 * @returns {string}
 */
const configuredProviderId = () => (
  process.env.MARKET_PRICE_PROVIDER || DEFAULT_PROVIDER_ID
).trim().toLowerCase();

/**
 * Returns a provider instance.
 *
 * @param {string} [id] - defaults to MARKET_PRICE_PROVIDER
 * @returns {MarketPriceProvider}
 * @throws {Error} UNKNOWN_PRICE_PROVIDER when the configured id is not registered
 */
const getProvider = (id = null) => {
  const key = (id || configuredProviderId()).trim().toLowerCase();

  if (_cache.has(key)) return _cache.get(key);

  const Ctor = PROVIDERS[key];
  if (!Ctor) {
    // Explicit rather than silently falling back: a typo in the env var must not
    // quietly change where a farmer's prices come from.
    const error = new Error(
      `Unknown market price provider "${key}". Registered: ${Object.keys(PROVIDERS).join(', ')}.`
    );
    error.code = 'UNKNOWN_PRICE_PROVIDER';
    throw error;
  }

  const instance = new Ctor();
  _cache.set(key, instance);
  return instance;
};

/** Clears cached instances. For tests and for picking up env changes. */
const clearProviderCache = () => _cache.clear();

/** Ids of every registered provider. */
const listProviders = () => Object.keys(PROVIDERS);

module.exports = {
  getProvider,
  clearProviderCache,
  listProviders,
  configuredProviderId,
  DEFAULT_PROVIDER_ID,
  MarketPriceProvider,
  ProviderRequestError,
  ProviderNotImplementedError
};

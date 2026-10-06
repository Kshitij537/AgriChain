import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Transporter discovery service.
 *
 * Calls the AgriChain backend, never Google. The Google Places key lives only in
 * the backend environment; this module has no knowledge of it and there is no
 * VITE_-prefixed Google variable anywhere in the frontend. A key shipped to the
 * browser can be read straight out of the network tab and billed to the project.
 *
 *   React  ->  /api/transport/search  ->  Google Places API (New)
 *
 * The backend also filters, deduplicates, caps and caches results, which is not
 * possible if the browser calls Google directly.
 */

/**
 * The shape the Find Transport section works with when nothing has loaded.
 * @returns {object}
 */
export const emptyTransportState = () => ({
  loading: false,
  error: null,
  market: null,
  transporters: [],
  tripEstimate: null,
  available: null,
  reason: null,
  message: null,
  attribution: null,
  disclaimer: null
});

/**
 * Finds transport businesses near the market the recommendation engine chose.
 *
 * The farmer is never asked for mandi coordinates — the selected market's id and
 * the farm's id are enough, and the backend resolves both.
 *
 * Resolves to a state object rather than throwing, so a Google outage renders a
 * message inside the transport card and cannot take the Market page down.
 *
 * @param {object} input
 * @param {string|number} input.marketId - market code or id from the recommendation
 * @param {string|number} [input.farmId] - farm the trip is measured from
 * @param {number} [input.quantityKg] - drives vehicle selection for the estimate
 * @param {string} [input.vehicleType]
 * @returns {Promise<object>} transport state
 */
export const findTransporters = async ({
  marketId,
  farmId = null,
  quantityKg = null,
  vehicleType = null
} = {}) => {
  if (!marketId) {
    return {
      ...emptyTransportState(),
      available: false,
      reason: 'NO_MARKET_SELECTED',
      message: 'Select a market first to see transport options.'
    };
  }

  const params = new URLSearchParams({ marketId: String(marketId) });
  if (farmId) params.set('farmId', String(farmId));
  if (quantityKg) params.set('quantityKg', String(quantityKg));
  if (vehicleType) params.set('vehicleType', vehicleType);

  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/transport/search?${params.toString()}`,
      { timeout: 30000 }
    );

    if (!response.data || !response.data.success) {
      return {
        ...emptyTransportState(),
        available: false,
        reason: 'UNEXPECTED_RESPONSE',
        message: 'Transporter details are temporarily unavailable.'
      };
    }

    const data = response.data.data;
    return {
      loading: false,
      error: null,
      market: data.market || null,
      transporters: Array.isArray(data.transporters) ? data.transporters : [],
      // AgriChain's own figure, computed from the farm-to-mandi road distance.
      // Present even when Google failed, which is why the card can always show a
      // cost.
      tripEstimate: data.tripEstimate || null,
      available: data.available,
      reason: data.reason || null,
      message: data.message || null,
      attribution: data.attribution || null,
      disclaimer: data.disclaimer || null,
      fromCache: Boolean(data.fromCache)
    };
  } catch (error) {
    const detail = error.response?.data?.error;
    console.warn(
      `[Transport Service] Lookup failed: ${detail?.code || error.message}` +
      (detail?.message ? ` - ${detail.message}` : '')
    );
    return {
      ...emptyTransportState(),
      available: false,
      reason: detail?.code || 'REQUEST_FAILED',
      // Never surface a raw backend or Google message to a farmer.
      message:
        detail?.code === 'MISSING_MARKET_COORDINATES'
          ? 'This market has no saved location, so nearby transporters cannot be found.'
          : 'Transporter details are temporarily unavailable. Your estimated transport cost is still shown.'
    };
  }
};

/**
 * Builds a `tel:` href from a listed phone number.
 *
 * Returns null when there is no number, so the caller hides the Call button
 * rather than rendering one that does nothing.
 *
 * @param {object} transporter
 * @returns {string|null}
 */
export const buildTelHref = (transporter) => {
  const raw = transporter?.phoneInternational || transporter?.phone;
  if (!raw) return null;
  // Keep digits and a leading +; strip the spaces Google formats numbers with.
  const cleaned = String(raw).replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
};

export default { findTransporters, emptyTransportState, buildTelHref };

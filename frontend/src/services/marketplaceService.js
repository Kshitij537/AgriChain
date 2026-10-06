import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Buyer Marketplace service.
 *
 * Every marketplace endpoint requires a real JWT - unlike the older AgriChain
 * modules, which tolerate an anonymous caller resolved to a development user. That
 * is deliberate: this module holds private business-to-business conversations and
 * negotiated prices, so an anonymous session must not be able to read them.
 *
 * All calls therefore send the stored token, and a 401 means "sign in", not "try
 * again". Errors are returned as a { ok:false, code, message } shape rather than
 * thrown, so a page can render a specific message instead of a generic failure.
 */

/** Authorization header from the stored token, matching diseaseApi.js. */
const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * One request helper for the whole module.
 *
 * Normalises both success and failure into a discriminated result, so no caller
 * has to write a try/catch and none can accidentally treat an error body as data.
 *
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 * @param {object} [options] - { isMultipart }
 * @returns {Promise<object>} { ok, data, meta } | { ok:false, code, message, fields }
 */
const call = async (method, path, body = null, { isMultipart = false } = {}) => {
  try {
    const response = await axios({
      method,
      url: `${API_BASE_URL}${path}`,
      data: body || undefined,
      timeout: 30000,
      headers: {
        ...(body && !isMultipart ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders()
      }
    });

    if (response.data && response.data.success) {
      return { ok: true, data: response.data.data, meta: response.data.meta || {} };
    }
    return { ok: false, code: 'UNEXPECTED_RESPONSE', message: 'Something went wrong. Please try again.' };
  } catch (error) {
    const detail = error.response?.data?.error;
    const status = error.response?.status;

    if (status === 401) {
      return { ok: false, code: 'AUTH_REQUIRED', message: 'Please sign in to continue.', status };
    }
    if (!error.response) {
      return {
        ok: false,
        code: 'NETWORK_ERROR',
        message: 'Could not reach AgriChain. Check your connection and try again.'
      };
    }
    return {
      ok: false,
      status,
      code: detail?.code || 'REQUEST_FAILED',
      // The backend writes farmer-facing messages, so they are shown as-is.
      message: detail?.message || 'Something went wrong. Please try again.',
      fields: detail?.fields || null
    };
  }
};

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
};

// ---------------------------------------------------------------------------
// Roles and buyer profile
// ---------------------------------------------------------------------------

/** What the signed-in user may do. Drives every piece of UI gating. */
export const getMyRoles = () => call('get', '/api/buyers/me/roles');

export const getMyBuyerProfile = () => call('get', '/api/buyers/me');

export const registerBuyer = (profile) => call('post', '/api/buyers/profile', profile);

export const updateBuyerProfile = (changes) => call('patch', '/api/buyers/me', changes);

/** Submits the business for admin review. Reaches "pending" only. */
export const submitVerification = () => call('post', '/api/buyers/me/verification', {});

/** Public view of a buyer, as a farmer sees them (no phone or email). */
export const getBuyer = (buyerId) => call('get', `/api/buyers/${buyerId}`);

// ---------------------------------------------------------------------------
// Farmer crop availability
// ---------------------------------------------------------------------------

/**
 * Pre-filled suggestions from the farmer's saved fields.
 * Only the quantity is missing - everything else AgriChain already knows.
 */
export const getAvailabilitySuggestions = () =>
  call('get', '/api/marketplace/farmer/availability/suggestions');

export const getMyAvailability = (params) =>
  call('get', `/api/marketplace/farmer/availability${qs(params)}`);

/**
 * Browse every farmer's sellable crop - the buyer's side of the marketplace.
 *
 * Accepts { crop, minQuantityKg, qualityGrade, maxDistanceKm, sellableOnly,
 * limit, offset }. Distances come back only when the caller has a business
 * location saved on their buyer profile; `meta.distanceAvailable` says which,
 * so the page can explain an absent distance instead of showing a blank.
 *
 * Farm coordinates are deliberately absent from the response - the backend
 * measures distance server-side and sends only the number.
 */
export const browseAvailability = (params) =>
  call('get', `/api/marketplace/availability${qs(params)}`);

export const createAvailability = (listing) =>
  call('post', '/api/marketplace/farmer/availability', listing);

export const updateAvailability = (id, changes) =>
  call('patch', `/api/marketplace/farmer/availability/${id}`, changes);

/**
 * Removes one crop listing.
 *
 * The backend deactivates rather than erases, so agreed deals keep the crop they
 * were for. Refused with AVAILABILITY_HAS_COMMITMENTS while kg are promised.
 */
export const deleteAvailability = (id) =>
  call('delete', `/api/marketplace/farmer/availability/${id}`);

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export const postRequirement = (requirement) =>
  call('post', '/api/buyer-requirements', requirement);

/** Browse the open marketplace, or pass mine:true for the buyer's own list. */
export const listRequirements = (params) =>
  call('get', `/api/buyer-requirements${qs(params)}`);

export const getRequirement = (id) => call('get', `/api/buyer-requirements/${id}`);

export const updateRequirement = (id, changes) =>
  call('patch', `/api/buyer-requirements/${id}`, changes);

export const publishRequirement = (id) =>
  call('post', `/api/buyer-requirements/${id}/publish`, {});

export const closeRequirement = (id, status = 'closed') =>
  call('post', `/api/buyer-requirements/${id}/close`, { status });

/** Farmers who can fill one of the buyer's own requirements. */
export const getMatchingFarmers = (requirementId) =>
  call('get', `/api/buyer-requirements/${requirementId}/matching-farmers`);

// ---------------------------------------------------------------------------
// Matching and comparison
// ---------------------------------------------------------------------------

/** "Buyers Looking for Your Crop". */
export const getMyMatches = (params) =>
  call('get', `/api/marketplace/farmer/matches${qs(params)}`);

/** Buyers ranked by money in hand, not advertised price. */
export const getTopBuyers = (availabilityId, params) =>
  call('get', `/api/marketplace/farmer/top-buyers${qs({ availabilityId, ...params })}`);

/** Mandis and direct buyers in one comparison. */
export const getSellingOptions = (availabilityId, params) =>
  call('get', `/api/marketplace/selling-options${qs({ availabilityId, ...params })}`);

export const getBuyerSummary = () => call('get', '/api/marketplace/buyer/summary');

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** Opens or reuses the thread for a requirement. Never creates a duplicate. */
export const startConversation = ({ requirementId, availabilityId, farmerUserId }) =>
  call('post', '/api/marketplace/conversations', { requirementId, availabilityId, farmerUserId });

export const listConversations = (params) =>
  call('get', `/api/marketplace/conversations${qs(params)}`);

/** `before` is the cursor from a previous page, for loading older messages. */
export const getMessages = (conversationId, { limit, before } = {}) =>
  call('get', `/api/marketplace/conversations/${conversationId}/messages${qs({ limit, before })}`);

export const sendMessage = (conversationId, content) =>
  call('post', `/api/marketplace/conversations/${conversationId}/messages`, { content });

/**
 * Sends a photo. Uses FormData so the browser sets the multipart boundary.
 * @param {number} conversationId
 * @param {File} file
 * @param {string} [content]
 */
export const sendAttachment = (conversationId, file, content = '') => {
  const form = new FormData();
  form.append('attachment', file);
  if (content) form.append('content', content);
  return call('post', `/api/marketplace/conversations/${conversationId}/messages`, form,
    { isMultipart: true });
};

export const markConversationRead = (conversationId) =>
  call('post', `/api/marketplace/conversations/${conversationId}/read`, {});

export const blockConversation = (conversationId, blocked = true) =>
  call('post', `/api/marketplace/conversations/${conversationId}/block`, { blocked });

/**
 * Attachment URL.
 *
 * Needs the auth header, so it cannot be used directly as an <img src>. Callers
 * fetch it as a blob - see fetchAttachmentBlob.
 */
export const attachmentUrl = (messageId) =>
  `${API_BASE_URL}/api/marketplace/messages/${messageId}/attachment`;

/**
 * Loads an attachment as an object URL suitable for <img src>.
 *
 * Attachments are private and served only to conversation participants, so they
 * must be fetched with the token rather than linked directly.
 *
 * @param {number} messageId
 * @returns {Promise<string|null>} object URL, or null
 */
export const fetchAttachmentBlob = async (messageId) => {
  try {
    const response = await axios.get(attachmentUrl(messageId), {
      responseType: 'blob',
      headers: authHeaders(),
      timeout: 30000
    });
    return URL.createObjectURL(response.data);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export const sendOffer = (offer) => call('post', '/api/marketplace/offers', offer);

export const listOffers = (params) => call('get', `/api/marketplace/offers${qs(params)}`);

export const getOffer = (id) => call('get', `/api/marketplace/offers/${id}`);

/** Accepting creates the deal and reserves the crop, inside one transaction. */
export const acceptOffer = (id) => call('post', `/api/marketplace/offers/${id}/accept`, {});

export const rejectOffer = (id, reason) =>
  call('post', `/api/marketplace/offers/${id}/reject`, { reason });

export const counterOffer = (id, terms) =>
  call('post', `/api/marketplace/offers/${id}/counter`, terms);

export const withdrawOffer = (id) => call('post', `/api/marketplace/offers/${id}/withdraw`, {});

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export const listDeals = (params) => call('get', `/api/marketplace/deals${qs(params)}`);

export const getDeal = (id) => call('get', `/api/marketplace/deals/${id}`);

export const updateDealStatus = (id, status, note) =>
  call('patch', `/api/marketplace/deals/${id}/status`, { status, note });

// ---------------------------------------------------------------------------
// Notifications and reports
// ---------------------------------------------------------------------------

export const listNotifications = (params) =>
  call('get', `/api/marketplace/notifications${qs(params)}`);

export const markNotificationRead = (id) =>
  call('post', `/api/marketplace/notifications/${id}/read`, {});

export const markAllNotificationsRead = () =>
  call('post', '/api/marketplace/notifications/read-all', {});

export const reportEntity = (report) => call('post', '/api/marketplace/reports', report);

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** Formats rupees the Indian way, e.g. 12500 -> "₹12,500". */
export const formatRupees = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const rounded = Math.round(Number(value));
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(rounded))}`
    .replace('₹', rounded < 0 ? '-₹' : '₹');
};

/** Formats a quantity, e.g. 500 -> "500 kg (5 quintal)". */
export const formatQuantity = (kg) => {
  if (kg === null || kg === undefined) return '—';
  const quintals = Number(kg) / 100;
  return `${Number(kg)} kg${quintals >= 1 ? ` (${Math.round(quintals * 100) / 100} quintal)` : ''}`;
};

/** A short, plain date, e.g. "5 Oct". */
export const formatShortDate = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Tailwind classes for a verification badge. Never invents a "verified" state. */
export const verificationBadgeClass = (status) => ({
  verified: 'bg-primary/10 text-primary',
  verification_pending: 'bg-amber-500/15 text-amber-800',
  verification_rejected: 'bg-error-container text-on-error-container',
  unverified: 'bg-surface-container-high text-on-surface-variant'
}[status] || 'bg-surface-container-high text-on-surface-variant');

/** Tailwind classes for a deal or requirement status chip. */
export const statusChipClass = (status) => ({
  active: 'bg-primary/10 text-primary',
  agreed: 'bg-primary/10 text-primary',
  preparing: 'bg-secondary/10 text-secondary',
  ready_for_pickup: 'bg-secondary/10 text-secondary',
  completed: 'bg-primary-fixed/30 text-primary',
  partially_fulfilled: 'bg-amber-500/15 text-amber-800',
  pending: 'bg-amber-500/15 text-amber-800',
  cancelled: 'bg-error-container text-on-error-container',
  disputed: 'bg-error-container text-on-error-container',
  rejected: 'bg-error-container text-on-error-container',
  expired: 'bg-surface-container-high text-on-surface-variant',
  closed: 'bg-surface-container-high text-on-surface-variant',
  draft: 'bg-surface-container-high text-on-surface-variant'
}[status] || 'bg-surface-container-high text-on-surface-variant');

export default {
  getMyRoles, getMyBuyerProfile, registerBuyer, updateBuyerProfile, submitVerification, getBuyer,
  getAvailabilitySuggestions, getMyAvailability, browseAvailability, createAvailability,
  updateAvailability, deleteAvailability,
  postRequirement, listRequirements, getRequirement, updateRequirement, publishRequirement,
  closeRequirement, getMatchingFarmers,
  getMyMatches, getTopBuyers, getSellingOptions, getBuyerSummary,
  startConversation, listConversations, getMessages, sendMessage, sendAttachment,
  markConversationRead, blockConversation, attachmentUrl, fetchAttachmentBlob,
  sendOffer, listOffers, getOffer, acceptOffer, rejectOffer, counterOffer, withdrawOffer,
  listDeals, getDeal, updateDealStatus,
  listNotifications, markNotificationRead, markAllNotificationsRead, reportEntity,
  formatRupees, formatQuantity, formatShortDate, verificationBadgeClass, statusChipClass
};

/**
 * Chat, offers, deals and notification endpoints.
 *
 * Kept separate from marketplaceController (discovery) purely for file size; the
 * conventions are identical.
 *
 * AUTHORIZATION
 * -------------
 * No handler here takes a farmer or buyer id from the request. `req.user.id` comes
 * from a verified JWT, and each service re-derives the caller's side from the
 * record itself (conversation participants, offer sender/recipient, deal parties).
 * Changing an id in a URL therefore yields a not-found, not someone else's data.
 */

const conversationService = require('../services/conversationService');
const offerService = require('../services/offerService');
const notificationService = require('../services/notificationService');
const { query } = require('../config/db');
const fs = require('fs');
const path = require('path');

const newRequestId = () => Math.random().toString(36).slice(2, 8);

const STATUS_BY_CODE = {
  // Forbidden maps to 404 for conversations, offers and deals on purpose: a
  // caller probing ids must not be able to tell "exists but not yours" from
  // "does not exist".
  CONVERSATION_NOT_FOUND: 404,
  CONVERSATION_FORBIDDEN: 404,
  OFFER_NOT_FOUND: 404,
  OFFER_FORBIDDEN: 404,
  DEAL_NOT_FOUND: 404,
  DEAL_FORBIDDEN: 404,
  ATTACHMENT_NOT_FOUND: 404,
  REQUIREMENT_NOT_FOUND: 404,
  AVAILABILITY_NOT_FOUND: 404,

  CONVERSATION_BLOCKED: 403,
  NOT_OFFER_RECIPIENT: 403,
  AVAILABILITY_FORBIDDEN: 403,
  BUYER_SUSPENDED: 403,
  SELF_CONVERSATION: 400,
  SELF_OFFER: 400,
  FARMER_REQUIRED: 400,
  FARMER_NOT_OFFERING_CROP: 400,
  AVAILABILITY_REQUIRED: 400,
  EMPTY_MESSAGE: 400,
  MESSAGE_TOO_LONG: 400,
  INVALID_QUANTITY: 400,
  INVALID_PRICE: 400,
  CROP_MISMATCH: 400,
  NO_MATCHING_AVAILABILITY: 400,
  NO_ARRANGEMENT: 400,
  INVALID_DEAL_TRANSITION: 409,

  RATE_LIMITED: 429,

  // Nothing committed; the client may safely retry. 409 rather than 500 because
  // this is a contention outcome, not a server fault.
  CONCURRENT_UPDATE_RETRY: 409,

  OFFER_NOT_PENDING: 409,
  OFFER_EXPIRED: 409,
  OFFER_NOT_ACTIONABLE: 409,

  // requirementService.assessOpenness derives its code from the requirement's
  // status (`REQUIREMENT_${STATUS}`), so every terminal status needs an entry
  // here. Without them, offering against a closed requirement fell through to a
  // 500 - a client mistake reported as a server fault.
  REQUIREMENT_NOT_OPEN: 409,
  REQUIREMENT_EXPIRED: 409,
  REQUIREMENT_FULLY_COMMITTED: 409,
  REQUIREMENT_CLOSED: 409,
  REQUIREMENT_CANCELLED: 409,
  REQUIREMENT_FULFILLED: 409,
  REQUIREMENT_DRAFT: 409,
  REQUIREMENT_PARTIALLY_FULFILLED: 409,
  REQUIREMENT_ACTIVE: 409,
  INSUFFICIENT_BUYER_DEMAND: 409,
  INSUFFICIENT_AVAILABLE_QUANTITY: 409,
  QUANTITY_EXCEEDS_REQUIREMENT: 409,
  QUANTITY_EXCEEDS_AVAILABLE: 409,
  PARTIAL_NOT_ALLOWED: 409,
  BELOW_MINIMUM_LOT: 409,
  PICKUP_NOT_OFFERED: 409
};

/**
 * Rejects a non-numeric path id before it can reach SQL.
 *
 * `parseInt('undefined')` is NaN, which Postgres refuses with a type error and
 * which surfaced as a 500. A malformed id is a client mistake and the resource
 * genuinely does not exist, so 404 is both correct and consistent with the
 * "forbidden looks like not-found" policy above.
 *
 * @param {*} value
 * @returns {number|null}
 */
const numericId = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Express guard: 404s any route whose :id is not a positive integer.
 * @returns {Function}
 */
const requireNumericId = (paramName = 'id') => (req, res, next) => {
  if (numericId(req.params[paramName]) === null) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found.', requestId: newRequestId() }
    });
  }
  return next();
};

const sendError = (res, error, requestId) => {
  const code = error.code || 'INTERNAL_ERROR';
  const status = STATUS_BY_CODE[code] || 500;
  if (status >= 500) console.error(`[Marketplace Chat] [${requestId}] ${code}: ${error.message}`);
  else console.warn(`[Marketplace Chat] [${requestId}] ${code}: ${error.message}`);
  return res.status(status).json({
    success: false,
    error: { code, message: error.message || 'Unexpected server error', requestId }
  });
};

// ===========================================================================
// Conversations
// ===========================================================================

/** POST /api/marketplace/conversations  { requirementId, availabilityId?, farmerUserId? } */
const createConversation = async (req, res) => {
  const requestId = newRequestId();
  try {
    if (!req.body || !req.body.requirementId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REQUIREMENT_REQUIRED',
          message: 'Which requirement is this conversation about?',
          requestId
        }
      });
    }

    const conversation = await conversationService.findOrCreate({
      requirementId: req.body.requirementId,
      userId: req.user.id,
      availabilityId: req.body.availabilityId || null,
      farmerUserId: req.body.farmerUserId || null
    });

    return res.status(201).json({ success: true, data: conversation, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/marketplace/conversations */
const listConversations = async (req, res) => {
  const requestId = newRequestId();
  try {
    const result = await conversationService.listForUser(req.user.id, {
      limit: req.query.limit,
      offset: req.query.offset
    });
    return res.json({
      success: true,
      data: result.conversations,
      meta: {
        total: result.total,
        totalUnread: result.totalUnread,
        limit: result.limit,
        offset: result.offset,
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/marketplace/conversations/:id/messages?limit=&before= */
const getMessages = async (req, res) => {
  const requestId = newRequestId();
  try {
    const result = await conversationService.getMessages({
      conversationId: req.params.id,
      userId: req.user.id,
      limit: req.query.limit,
      before: req.query.before || null
    });
    return res.json({
      success: true,
      data: result.messages,
      meta: {
        conversation: result.conversation,
        hasMore: result.hasMore,
        nextBefore: result.nextBefore,
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/conversations/:id/messages  { content } or multipart image */
const sendMessage = async (req, res) => {
  const requestId = newRequestId();
  try {
    const message = await conversationService.sendMessage({
      conversationId: req.params.id,
      userId: req.user.id,
      content: req.body ? req.body.content : null,
      messageType: req.file
        ? conversationService.MESSAGE_TYPE.IMAGE
        : conversationService.MESSAGE_TYPE.TEXT,
      attachment: req.file || null
    });
    return res.status(201).json({ success: true, data: message, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/conversations/:id/read */
const markConversationRead = async (req, res) => {
  const requestId = newRequestId();
  try {
    const marked = await conversationService.markRead({
      conversationId: req.params.id,
      userId: req.user.id
    });
    return res.json({ success: true, data: { messagesMarkedRead: marked }, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/conversations/:id/block  { blocked } */
const blockConversation = async (req, res) => {
  const requestId = newRequestId();
  try {
    const conversation = await conversationService.setBlocked({
      conversationId: req.params.id,
      userId: req.user.id,
      blocked: !req.body || req.body.blocked !== false
    });
    return res.json({ success: true, data: conversation, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * GET /api/marketplace/messages/:id/attachment
 *
 * The ONLY route to attachment bytes. express.static is deliberately not used for
 * this directory, so guessing a filename gets a caller nothing.
 */
const getAttachment = async (req, res) => {
  const requestId = newRequestId();
  try {
    const attachment = await conversationService.getAttachment({
      messageId: req.params.id,
      userId: req.user.id
    });

    if (!fs.existsSync(attachment.path)) {
      const err = new Error('Attachment file is missing.');
      err.code = 'ATTACHMENT_NOT_FOUND';
      throw err;
    }

    res.setHeader('Content-Type', attachment.mime || 'application/octet-stream');
    // Never inline: an inlined SVG or HTML could execute in the viewer's origin.
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(attachment.path)}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return fs.createReadStream(attachment.path).pipe(res);
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ===========================================================================
// Offers
// ===========================================================================

/** POST /api/marketplace/offers */
const createOffer = async (req, res) => {
  const requestId = newRequestId();
  try {
    const body = req.body || {};
    console.log(
      `[Marketplace Chat] [${requestId}] offer user=${req.user.id} ` +
      `req=${body.requirementId} ${body.quantityKg}kg @₹${body.pricePerKg}/kg`
    );

    const offer = await offerService.create({
      requirementId: body.requirementId,
      senderId: req.user.id,
      availabilityId: body.availabilityId || null,
      quantityKg: Number(body.quantityKg),
      pricePerKg: Number(body.pricePerKg),
      deliveryTerms: body.deliveryTerms || offerService.DELIVERY_TERMS.FARMER_DELIVERS,
      proposedFulfillmentDate: body.proposedFulfillmentDate || null,
      expiresInHours: body.expiresInHours,
      conversationId: body.conversationId || null,
      message: body.message || null
    });

    return res.status(201).json({
      success: true,
      data: offer,
      meta: {
        requestId,
        note: 'This is a proposal. Nothing is agreed until the other side accepts.'
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/marketplace/offers?direction=sent|received&status=pending */
const listOffers = async (req, res) => {
  const requestId = newRequestId();
  try {
    const result = await offerService.list({
      userId: req.user.id,
      direction: req.query.direction || 'all',
      status: req.query.status ? String(req.query.status).split(',') : null,
      requirementId: req.query.requirementId || null,
      limit: req.query.limit,
      offset: req.query.offset
    });
    return res.json({
      success: true,
      data: result.offers,
      meta: { count: result.offers.length, limit: result.limit, offset: result.offset, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/marketplace/offers/:id */
const getOffer = async (req, res) => {
  const requestId = newRequestId();
  try {
    const offer = await offerService.getById(req.params.id, req.user.id);
    if (!offer) {
      const err = new Error('Offer not found.');
      err.code = 'OFFER_NOT_FOUND';
      throw err;
    }
    return res.json({ success: true, data: offer, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/offers/:id/accept — the transactional path. */
const acceptOffer = async (req, res) => {
  const requestId = newRequestId();
  try {
    console.log(`[Marketplace Chat] [${requestId}] ACCEPT offer=${req.params.id} user=${req.user.id}`);

    const result = await offerService.accept({ offerId: req.params.id, userId: req.user.id });

    console.log(
      `[Marketplace Chat] [${requestId}] deal=${result.deal.id} created; ` +
      `requirement remaining=${result.requirementRemainingKg}kg (${result.requirementStatus})`
    );

    return res.json({
      success: true,
      data: result,
      meta: {
        requestId,
        note: 'Deal agreed. Payment and handover happen outside AgriChain.'
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/offers/:id/reject  { reason } */
const rejectOffer = async (req, res) => {
  const requestId = newRequestId();
  try {
    const offer = await offerService.reject({
      offerId: req.params.id,
      userId: req.user.id,
      reason: (req.body && req.body.reason) || null
    });
    return res.json({ success: true, data: offer, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/offers/:id/counter  { quantityKg, pricePerKg, ... } */
const counterOffer = async (req, res) => {
  const requestId = newRequestId();
  try {
    const body = req.body || {};
    const offer = await offerService.counter({
      offerId: req.params.id,
      userId: req.user.id,
      quantityKg: body.quantityKg !== undefined ? Number(body.quantityKg) : null,
      pricePerKg: body.pricePerKg !== undefined ? Number(body.pricePerKg) : null,
      deliveryTerms: body.deliveryTerms || null,
      proposedFulfillmentDate: body.proposedFulfillmentDate || null,
      message: body.message || null
    });
    return res.status(201).json({ success: true, data: offer, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/offers/:id/withdraw */
const withdrawOffer = async (req, res) => {
  const requestId = newRequestId();
  try {
    const offer = await offerService.withdraw({ offerId: req.params.id, userId: req.user.id });
    return res.json({ success: true, data: offer, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ===========================================================================
// Deals
// ===========================================================================

/** GET /api/marketplace/deals?status= */
const listDeals = async (req, res) => {
  const requestId = newRequestId();
  try {
    const result = await offerService.listDeals({
      userId: req.user.id,
      status: req.query.status ? String(req.query.status).split(',') : null,
      limit: req.query.limit,
      offset: req.query.offset
    });
    return res.json({
      success: true,
      data: result.deals,
      meta: { count: result.deals.length, limit: result.limit, offset: result.offset, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/marketplace/deals/:id */
const getDeal = async (req, res) => {
  const requestId = newRequestId();
  try {
    const deal = await offerService.getDealById(req.params.id, req.user.id);
    if (!deal) {
      const err = new Error('Deal not found.');
      err.code = 'DEAL_NOT_FOUND';
      throw err;
    }
    return res.json({ success: true, data: deal, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** PATCH /api/marketplace/deals/:id/status  { status, note } */
const updateDealStatus = async (req, res) => {
  const requestId = newRequestId();
  try {
    if (!req.body || !req.body.status) {
      return res.status(400).json({
        success: false,
        error: { code: 'STATUS_REQUIRED', message: 'Which status should this deal move to?', requestId }
      });
    }
    const deal = await offerService.updateDealStatus({
      dealId: req.params.id,
      userId: req.user.id,
      status: req.body.status,
      note: req.body.note || null
    });
    return res.json({ success: true, data: deal, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ===========================================================================
// Notifications
// ===========================================================================

/** GET /api/marketplace/notifications?unreadOnly=true */
const listNotifications = async (req, res) => {
  const requestId = newRequestId();
  try {
    const result = await notificationService.list(req.user.id, {
      unreadOnly: req.query.unreadOnly === 'true',
      limit: req.query.limit,
      offset: req.query.offset
    });
    return res.json({
      success: true,
      data: result.notifications,
      meta: {
        total: result.total,
        unreadCount: result.unreadCount,
        limit: result.limit,
        offset: result.offset,
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/notifications/:id/read */
const markNotificationRead = async (req, res) => {
  const requestId = newRequestId();
  try {
    const updated = await notificationService.markRead(req.params.id, req.user.id);
    return res.json({ success: true, data: { updated }, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/marketplace/notifications/read-all */
const markAllNotificationsRead = async (req, res) => {
  const requestId = newRequestId();
  try {
    const count = await notificationService.markAllRead(req.user.id);
    return res.json({ success: true, data: { markedRead: count }, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ===========================================================================
// Reports
// ===========================================================================

/** POST /api/marketplace/reports  { reportedUserId, entityType, entityId, reason, details } */
const createReport = async (req, res) => {
  const requestId = newRequestId();
  try {
    const body = req.body || {};
    const VALID_ENTITIES = ['user', 'requirement', 'message', 'conversation', 'offer', 'buyer_profile'];

    if (!body.entityType || !VALID_ENTITIES.includes(body.entityType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ENTITY_TYPE_INVALID',
          message: `What are you reporting? One of: ${VALID_ENTITIES.join(', ')}.`,
          requestId
        }
      });
    }
    if (!body.reason) {
      return res.status(400).json({
        success: false,
        error: { code: 'REASON_REQUIRED', message: 'Tell us why you are reporting this.', requestId }
      });
    }
    if (body.reportedUserId && parseInt(body.reportedUserId, 10) === req.user.id) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_REPORT_SELF', message: 'You cannot report yourself.', requestId }
      });
    }

    const result = await query(
      `INSERT INTO marketplace_reports
         (reporter_id, reported_user_id, entity_type, entity_id, reason, details)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, created_at, status`,
      [
        req.user.id,
        body.reportedUserId ? parseInt(body.reportedUserId, 10) : null,
        body.entityType,
        body.entityId ? parseInt(body.entityId, 10) : null,
        String(body.reason).slice(0, 48),
        body.details ? String(body.details).slice(0, 2000) : null
      ]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      meta: { requestId, note: 'Thank you. An administrator will review this report.' }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

module.exports = {
  requireNumericId,
  numericId,
  createConversation,
  listConversations,
  getMessages,
  sendMessage,
  markConversationRead,
  blockConversation,
  getAttachment,
  createOffer,
  listOffers,
  getOffer,
  acceptOffer,
  rejectOffer,
  counterOffer,
  withdrawOffer,
  listDeals,
  getDeal,
  updateDealStatus,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createReport
};

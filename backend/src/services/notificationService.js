/**
 * Marketplace notification service.
 *
 * In-app only for V1. No SMS, no WhatsApp - the brief says not to add those
 * unless existing infrastructure supports them, and it does not.
 *
 * IDEMPOTENCY
 * -----------
 * Every notification carries a `dedupe_key` with a UNIQUE constraint, built from
 * the event, the entity and the recipient. Inserts use ON CONFLICT DO NOTHING, so
 * a retried request, a double-clicked button or a re-run transaction cannot
 * produce two identical alerts. The brief asks for exactly this, and it is
 * enforced by the database rather than by remembering to check first.
 *
 * TRANSACTION AWARENESS
 * ---------------------
 * `create` accepts an optional pg client. Offer acceptance creates several
 * notifications inside its transaction; passing the client means they commit or
 * roll back with the deal, so a farmer is never told a deal was agreed that then
 * failed to save.
 */

const { query, pool } = require('../config/db');

/** Event types, also used to build dedupe keys and pick wording. */
const EVENT = {
  // farmer-facing
  NEW_MATCHING_REQUIREMENT: 'new_matching_requirement',
  REQUIREMENT_CLOSED: 'requirement_closed',
  REQUIREMENT_EXPIRED: 'requirement_expired',
  // buyer-facing
  FARMER_RESPONDED: 'farmer_responded',
  REQUIREMENT_EXPIRING_SOON: 'requirement_expiring_soon',
  // both
  NEW_MESSAGE: 'new_message',
  NEW_OFFER: 'new_offer',
  COUNTER_OFFER: 'counter_offer',
  OFFER_ACCEPTED: 'offer_accepted',
  OFFER_REJECTED: 'offer_rejected',
  OFFER_WITHDRAWN: 'offer_withdrawn',
  OFFER_EXPIRED: 'offer_expired',
  DEAL_STATUS_UPDATED: 'deal_status_updated',
  // admin
  BUYER_VERIFICATION_SUBMITTED: 'buyer_verification_submitted'
};

const ENTITY = {
  REQUIREMENT: 'requirement',
  CONVERSATION: 'conversation',
  MESSAGE: 'message',
  OFFER: 'offer',
  DEAL: 'deal',
  BUYER_PROFILE: 'buyer_profile',
  AVAILABILITY: 'availability'
};

/**
 * Builds a dedupe key.
 *
 * Includes the recipient because the same event legitimately notifies two people
 * (an accepted offer tells both sides), and those are different notifications.
 *
 * @param {object} input - { eventType, entityType, entityId, recipientId, suffix }
 * @returns {string}
 */
const buildDedupeKey = ({ eventType, entityType, entityId, recipientId, suffix = null }) =>
  [eventType, entityType, entityId, 'user', recipientId, suffix].filter((p) => p !== null && p !== undefined).join(':');

/**
 * Creates a notification. Idempotent on dedupe_key.
 *
 * Never throws: a failed notification must not fail the action that caused it.
 * A farmer whose offer was accepted cares far more that the deal exists than that
 * the bell icon updated.
 *
 * @param {object} input
 * @param {number} input.recipientId
 * @param {string} input.eventType
 * @param {string} input.entityType
 * @param {number} input.entityId
 * @param {string} input.title
 * @param {string} [input.body]
 * @param {string} [input.linkPath] - frontend route to open
 * @param {string} [input.dedupeSuffix] - distinguishes repeatable events
 * @param {object} [client] - pg client, to enlist in a caller's transaction
 * @returns {Promise<object|null>}
 */
const create = async (input, client = null) => {
  const executor = client || { query: (text, params) => query(text, params) };

  const dedupeKey = buildDedupeKey({
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    recipientId: input.recipientId,
    suffix: input.dedupeSuffix ?? null
  });

  try {
    const result = await executor.query(
      `INSERT INTO marketplace_notifications
         (recipient_id, event_type, entity_type, entity_id, title, body, link_path,
          dedupe_key, is_demo_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id, created_at`,
      [
        parseInt(input.recipientId, 10),
        input.eventType,
        input.entityType,
        input.entityId ? parseInt(input.entityId, 10) : null,
        String(input.title).slice(0, 255),
        input.body ? String(input.body).slice(0, 2000) : null,
        input.linkPath || null,
        dedupeKey,
        Boolean(input.isDemoData)
      ]
    );
    // Empty rows means the conflict fired - already notified, which is success.
    return result.rows[0] || null;
  } catch (error) {
    if (client) {
      // Inside a caller's transaction a failed statement aborts it, so this must
      // propagate rather than leave the transaction in a broken state.
      throw error;
    }
    console.warn(`[Notifications] Could not create "${input.eventType}": ${error.message}`);
    return null;
  }
};

/**
 * Creates several notifications at once, stopping on the first hard error when
 * inside a transaction.
 *
 * @param {Array<object>} notifications
 * @param {object} [client]
 * @returns {Promise<number>} created
 */
const createMany = async (notifications, client = null) => {
  let created = 0;
  for (const notification of notifications) {
    const row = await create(notification, client);
    if (row) created += 1;
  }
  return created;
};

/**
 * Lists a user's notifications.
 * @param {number} userId
 * @param {object} [options] - { unreadOnly, limit, offset }
 * @returns {Promise<object>}
 */
const list = async (userId, { unreadOnly = false, limit = 30, offset = 0 } = {}) => {
  const id = parseInt(userId, 10);
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 30), 100);
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const clauses = ['recipient_id = $1'];
  if (unreadOnly) clauses.push('is_read = FALSE');

  const result = await query(
    `SELECT id, event_type, entity_type, entity_id, title, body, link_path,
            is_read, read_at, is_demo_data, created_at
     FROM marketplace_notifications
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [id, safeLimit, safeOffset]
  );

  const counts = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread
     FROM marketplace_notifications WHERE recipient_id = $1`,
    [id]
  );

  return {
    notifications: result.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      title: row.title,
      body: row.body,
      linkPath: row.link_path,
      isRead: row.is_read,
      readAt: row.read_at,
      isDemoData: row.is_demo_data,
      createdAt: row.created_at
    })),
    total: counts.rows[0].total,
    unreadCount: counts.rows[0].unread,
    limit: safeLimit,
    offset: safeOffset
  };
};

/**
 * Marks one notification read.
 *
 * Scoped to the recipient in the WHERE clause, so a user cannot mark someone
 * else's notification read by guessing an id.
 *
 * @param {number} notificationId
 * @param {number} userId
 * @returns {Promise<boolean>} whether a row was updated
 */
const markRead = async (notificationId, userId) => {
  const result = await query(
    `UPDATE marketplace_notifications
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND recipient_id = $2 AND is_read = FALSE`,
    [parseInt(notificationId, 10), parseInt(userId, 10)]
  );
  return result.rowCount > 0;
};

/** Marks every unread notification read for a user. */
const markAllRead = async (userId) => {
  const result = await query(
    `UPDATE marketplace_notifications
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE recipient_id = $1 AND is_read = FALSE`,
    [parseInt(userId, 10)]
  );
  return result.rowCount;
};

/** Unread count, for the bell badge. */
const getUnreadCount = async (userId) => {
  const result = await query(
    'SELECT COUNT(*)::int AS unread FROM marketplace_notifications WHERE recipient_id = $1 AND is_read = FALSE',
    [parseInt(userId, 10)]
  );
  return result.rows[0].unread;
};

/**
 * Notifies farmers whose crop matches a newly published requirement.
 *
 * Runs best-effort and outside the requirement's own transaction: a notification
 * fan-out problem must not prevent a buyer from posting.
 *
 * @param {object} requirement - decorated requirement
 * @returns {Promise<number>} notified
 */
const notifyMatchingFarmers = async (requirement) => {
  try {
    // Farmers holding this crop with stock to sell. The full eligibility check
    // happens when they open the match list; this is the "worth a look" signal.
    const result = await query(
      `SELECT DISTINCT a.user_id
       FROM farmer_crop_availability a
       WHERE a.crop = $1 AND a.is_active = TRUE AND a.available_kg > 0`,
      [requirement.crop]
    );

    const buyerName = requirement.buyer ? requirement.buyer.businessName : 'A buyer';

    return await createMany(result.rows.map((row) => ({
      recipientId: row.user_id,
      eventType: EVENT.NEW_MATCHING_REQUIREMENT,
      entityType: ENTITY.REQUIREMENT,
      entityId: requirement.id,
      title: `${buyerName} wants ${requirement.crop}`,
      body:
        `${requirement.quantityRemainingKg} kg needed at ₹${requirement.offeredPricePerKg}/kg, ` +
        `by ${requirement.requiredBy}. This is an advertised offer, not an agreed price.`,
      linkPath: `/marketplace/requirements/${requirement.id}`,
      isDemoData: requirement.isDemoData
    })));
  } catch (error) {
    console.warn(`[Notifications] Match fan-out failed: ${error.message}`);
    return 0;
  }
};

module.exports = {
  EVENT,
  ENTITY,
  buildDedupeKey,
  create,
  createMany,
  list,
  markRead,
  markAllRead,
  getUnreadCount,
  notifyMatchingFarmers
};

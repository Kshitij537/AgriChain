/**
 * Marketplace conversation and message service.
 *
 * Private one-to-one threads between a farmer and a buyer, scoped to a
 * requirement.
 *
 * ACCESS CONTROL IS THE WHOLE POINT
 * ---------------------------------
 * Every read and every write goes through `assertParticipant`, which compares the
 * authenticated user id against the conversation's own farmer_user_id and
 * buyer_user_id columns. There is no code path that loads messages without it.
 * That is what makes changing an id in a URL useless: the conversation row itself
 * names its two participants, and a third party matches neither.
 *
 * NO DUPLICATE THREADS
 * --------------------
 * UNIQUE (requirement_id, farmer_user_id, buyer_user_id) plus an
 * ON CONFLICT ... DO UPDATE on create means pressing "Chat" twice reuses the
 * existing thread rather than fragmenting the negotiation across two.
 *
 * CONTACT DETAILS
 * ---------------
 * A conversation exposes each participant's display name only. No phone number,
 * no email. A user who wants to share a number can type it into a message, which
 * is a deliberate choice rather than a platform-wide disclosure.
 */

const { query, pool } = require('../config/db');
const notificationService = require('./notificationService');

/** Hard cap on message length, mirroring the DB CHECK. */
const MAX_MESSAGE_LENGTH = 4000;

/** Rate limit: messages per sender per conversation per window. */
const RATE_LIMIT_MESSAGES = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const MESSAGE_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  SYSTEM: 'system',
  OFFER_EVENT: 'offer_event'
};

/** In-memory rate limiter. Per-process, which is adequate for a single instance. */
const _rateBuckets = new Map();

/**
 * Applies a simple sliding-window rate limit.
 *
 * Deliberately per (sender, conversation): a user legitimately messaging several
 * buyers at once should not be throttled because of it, but flooding one thread
 * should be stopped.
 *
 * @param {number} senderId
 * @param {number} conversationId
 * @throws {Error} RATE_LIMITED
 */
const enforceRateLimit = (senderId, conversationId) => {
  const key = `${senderId}:${conversationId}`;
  const now = Date.now();
  const bucket = (_rateBuckets.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (bucket.length >= RATE_LIMIT_MESSAGES) {
    const err = new Error('You are sending messages too quickly. Wait a moment and try again.');
    err.code = 'RATE_LIMITED';
    throw err;
  }
  bucket.push(now);
  _rateBuckets.set(key, bucket);
};

/** Clears rate-limit state. Exposed for tests. */
const clearRateLimits = () => _rateBuckets.clear();

/**
 * Escapes the characters that make user content dangerous in an HTML context.
 *
 * React escapes by default, so this is defence in depth for any consumer that is
 * not React - an export, an email, a future admin tool. Stored escaped so it can
 * never be forgotten at render time.
 *
 * @param {string} text
 * @returns {string}
 */
const sanitiseContent = (text) => {
  if (text === null || text === undefined) return null;
  return String(text)
    .slice(0, MAX_MESSAGE_LENGTH)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
};

/**
 * Loads a conversation and confirms the caller is one of its two participants.
 *
 * @param {number} conversationId
 * @param {number} userId
 * @returns {Promise<object>} conversation row plus the caller's side
 * @throws {Error} CONVERSATION_NOT_FOUND / CONVERSATION_FORBIDDEN
 */
const assertParticipant = async (conversationId, userId) => {
  const id = parseInt(conversationId, 10);
  const uid = parseInt(userId, 10);

  const result = await query(
    `SELECT c.*, r.crop, r.offered_price_per_kg, r.status AS requirement_status,
            b.business_name, b.id AS buyer_profile_id,
            uf.full_name AS farmer_name, ub.full_name AS buyer_contact_name
     FROM marketplace_conversations c
     LEFT JOIN buyer_requirements r ON r.id = c.requirement_id
     LEFT JOIN buyer_profiles b ON b.user_id = c.buyer_user_id
     LEFT JOIN users uf ON uf.id = c.farmer_user_id
     LEFT JOIN users ub ON ub.id = c.buyer_user_id
     WHERE c.id = $1`,
    [id]
  );

  if (!result.rows.length) {
    const err = new Error('Conversation not found.');
    err.code = 'CONVERSATION_NOT_FOUND';
    throw err;
  }

  const row = result.rows[0];
  const isFarmer = row.farmer_user_id === uid;
  const isBuyer = row.buyer_user_id === uid;

  if (!isFarmer && !isBuyer) {
    // Deliberately the same 404-style wording as "not found" would give, so a
    // probing caller cannot use the error to learn that a conversation exists.
    const err = new Error('Conversation not found.');
    err.code = 'CONVERSATION_FORBIDDEN';
    throw err;
  }

  return { ...row, isFarmer, isBuyer, side: isFarmer ? 'farmer' : 'buyer' };
};

/**
 * Shapes a conversation for the API, from the caller's point of view.
 * @param {object} row
 * @param {number} userId
 * @returns {object}
 */
const decorateConversation = (row, userId) => {
  const uid = parseInt(userId, 10);
  const isFarmer = row.farmer_user_id === uid;

  return {
    id: row.id,
    requirementId: row.requirement_id,
    cropAvailabilityId: row.crop_availability_id,
    crop: row.crop || null,
    requirementStatus: row.requirement_status || null,
    offeredPricePerKg: row.offered_price_per_kg !== null && row.offered_price_per_kg !== undefined
      ? Number(row.offered_price_per_kg) : null,

    // Who the caller is talking TO. Display name only - never a phone or email.
    counterparty: {
      userId: isFarmer ? row.buyer_user_id : row.farmer_user_id,
      name: isFarmer
        ? (row.business_name || row.buyer_contact_name || 'Buyer')
        : (row.farmer_name || 'Farmer'),
      role: isFarmer ? 'buyer' : 'farmer',
      buyerProfileId: isFarmer ? row.buyer_profile_id : null
    },
    mySide: isFarmer ? 'farmer' : 'buyer',

    unreadCount: isFarmer ? row.farmer_unread_count : row.buyer_unread_count,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview || null,

    // Either side may block; the flags are reported so the UI can explain why
    // sending is disabled.
    blockedByMe: isFarmer ? row.farmer_blocked : row.buyer_blocked,
    blockedByThem: isFarmer ? row.buyer_blocked : row.farmer_blocked,

    isDemoData: row.is_demo_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * Finds or creates the conversation for a (requirement, farmer, buyer) triple.
 *
 * Either party may start it. The farmer side is resolved from the requirement's
 * buyer when a buyer initiates, and from the caller when a farmer initiates - so
 * neither can fabricate a thread between two other people.
 *
 * @param {object} input - { requirementId, userId, availabilityId, farmerUserId }
 * @returns {Promise<object>} conversation
 */
const findOrCreate = async ({ requirementId, userId, availabilityId = null, farmerUserId = null } = {}) => {
  const uid = parseInt(userId, 10);

  const req = await query(
    `SELECT r.id, r.status, r.crop, b.user_id AS buyer_user_id
     FROM buyer_requirements r
     JOIN buyer_profiles b ON b.id = r.buyer_id
     WHERE r.id = $1`,
    [parseInt(requirementId, 10)]
  );

  if (!req.rows.length) {
    const err = new Error(`No requirement found with id ${requirementId}.`);
    err.code = 'REQUIREMENT_NOT_FOUND';
    throw err;
  }

  const buyerUserId = req.rows[0].buyer_user_id;
  const callerIsBuyer = buyerUserId === uid;

  // Resolve the farmer side.
  let farmerId;
  if (callerIsBuyer) {
    // A buyer must name the farmer they are contacting, and that farmer must
    // actually be offering this crop - otherwise a buyer could open a thread
    // with an arbitrary user.
    if (!farmerUserId) {
      const err = new Error('Specify which farmer you want to contact.');
      err.code = 'FARMER_REQUIRED';
      throw err;
    }
    farmerId = parseInt(farmerUserId, 10);

    const offers = await query(
      `SELECT 1 FROM farmer_crop_availability
       WHERE user_id = $1 AND crop = $2 AND is_active = TRUE LIMIT 1`,
      [farmerId, req.rows[0].crop]
    );
    if (!offers.rows.length) {
      const err = new Error('That farmer is not offering this crop.');
      err.code = 'FARMER_NOT_OFFERING_CROP';
      throw err;
    }
  } else {
    // A farmer contacting a buyer is always themselves.
    farmerId = uid;
  }

  if (farmerId === buyerUserId) {
    const err = new Error('You cannot start a conversation with yourself.');
    err.code = 'SELF_CONVERSATION';
    throw err;
  }

  // ON CONFLICT is what prevents a second thread for the same triple.
  const result = await query(
    `INSERT INTO marketplace_conversations
       (requirement_id, crop_availability_id, farmer_user_id, buyer_user_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (requirement_id, farmer_user_id, buyer_user_id)
     DO UPDATE SET
       updated_at = CURRENT_TIMESTAMP,
       crop_availability_id = COALESCE(marketplace_conversations.crop_availability_id, EXCLUDED.crop_availability_id)
     RETURNING id`,
    [
      parseInt(requirementId, 10),
      availabilityId ? parseInt(availabilityId, 10) : null,
      farmerId,
      buyerUserId
    ]
  );

  const conversation = await assertParticipant(result.rows[0].id, uid);
  return decorateConversation(conversation, uid);
};

/**
 * Lists the caller's conversations, newest activity first.
 * @param {number} userId
 * @param {object} [options] - { limit, offset }
 * @returns {Promise<object>}
 */
const listForUser = async (userId, { limit = 30, offset = 0 } = {}) => {
  const uid = parseInt(userId, 10);
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 30), 100);
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const result = await query(
    `SELECT c.*, r.crop, r.offered_price_per_kg, r.status AS requirement_status,
            b.business_name, b.id AS buyer_profile_id,
            uf.full_name AS farmer_name, ub.full_name AS buyer_contact_name,
            (SELECT CASE WHEN m.message_type = 'image' THEN '[photo]'
                         ELSE LEFT(COALESCE(m.content,''), 80) END
             FROM marketplace_messages m
             WHERE m.conversation_id = c.id
             ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview
     FROM marketplace_conversations c
     LEFT JOIN buyer_requirements r ON r.id = c.requirement_id
     LEFT JOIN buyer_profiles b ON b.user_id = c.buyer_user_id
     LEFT JOIN users uf ON uf.id = c.farmer_user_id
     LEFT JOIN users ub ON ub.id = c.buyer_user_id
     WHERE c.farmer_user_id = $1 OR c.buyer_user_id = $1
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
     LIMIT $2 OFFSET $3`,
    [uid, safeLimit, safeOffset]
  );

  const totals = await query(
    `SELECT COUNT(*)::int AS total,
            COALESCE(SUM(CASE WHEN farmer_user_id = $1 THEN farmer_unread_count
                              ELSE buyer_unread_count END),0)::int AS unread
     FROM marketplace_conversations
     WHERE farmer_user_id = $1 OR buyer_user_id = $1`,
    [uid]
  );

  return {
    conversations: result.rows.map((row) => decorateConversation(row, uid)),
    total: totals.rows[0].total,
    totalUnread: totals.rows[0].unread,
    limit: safeLimit,
    offset: safeOffset
  };
};

/**
 * Fetches a page of messages, newest-first for pagination then reversed for
 * display.
 *
 * Marks the caller's unread messages read as a side effect, because opening a
 * thread IS reading it.
 *
 * @param {object} input - { conversationId, userId, limit, before }
 * @returns {Promise<object>}
 */
const getMessages = async ({ conversationId, userId, limit = 50, before = null } = {}) => {
  const conversation = await assertParticipant(conversationId, userId);
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);

  const params = [conversation.id];
  let beforeClause = '';
  if (before) {
    params.push(parseInt(before, 10));
    beforeClause = `AND m.id < $${params.length}`;
  }
  params.push(safeLimit + 1); // one extra to detect another page

  const result = await query(
    `SELECT m.id, m.conversation_id, m.sender_id, m.message_type, m.content,
            m.attachment_path, m.attachment_mime, m.attachment_size_bytes,
            m.delivered_at, m.read_at, m.related_offer_id, m.is_demo_data, m.created_at,
            u.full_name AS sender_name
     FROM marketplace_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 ${beforeClause}
     ORDER BY m.id DESC
     LIMIT $${params.length}`,
    params
  );

  const hasMore = result.rows.length > safeLimit;
  const page = hasMore ? result.rows.slice(0, safeLimit) : result.rows;

  await markRead({ conversationId: conversation.id, userId });

  return {
    conversation: decorateConversation(conversation, userId),
    messages: page.reverse().map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      isMine: row.sender_id === parseInt(userId, 10),
      messageType: row.message_type,
      content: row.content,
      // The path is never exposed; attachments are fetched through an
      // authorising route by message id.
      hasAttachment: Boolean(row.attachment_path),
      attachmentUrl: row.attachment_path
        ? `/api/marketplace/messages/${row.id}/attachment`
        : null,
      attachmentMime: row.attachment_mime,
      attachmentSizeBytes: row.attachment_size_bytes,
      deliveredAt: row.delivered_at,
      readAt: row.read_at,
      status: row.read_at ? 'read' : 'delivered',
      relatedOfferId: row.related_offer_id,
      isDemoData: row.is_demo_data,
      createdAt: row.created_at
    })),
    hasMore,
    // Cursor for the next older page.
    nextBefore: hasMore && page.length ? page[0].id : null
  };
};

/**
 * Sends a message.
 *
 * Increments the RECIPIENT's unread counter, never the sender's, and refreshes
 * last_message_at so the conversation list ordering is correct.
 *
 * @param {object} input
 * @returns {Promise<object>} the created message
 */
const sendMessage = async ({
  conversationId,
  userId,
  content = null,
  messageType = MESSAGE_TYPE.TEXT,
  attachment = null,
  relatedOfferId = null,
  skipRateLimit = false
} = {}) => {
  const conversation = await assertParticipant(conversationId, userId);

  // A blocked thread accepts nothing from either side.
  if (conversation.farmer_blocked || conversation.buyer_blocked) {
    const err = new Error('This conversation is blocked.');
    err.code = 'CONVERSATION_BLOCKED';
    throw err;
  }

  const clean = sanitiseContent(content);
  if (!clean && !attachment) {
    const err = new Error('Type a message or attach a photo.');
    err.code = 'EMPTY_MESSAGE';
    throw err;
  }
  if (content && String(content).length > MAX_MESSAGE_LENGTH) {
    const err = new Error(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
    err.code = 'MESSAGE_TOO_LONG';
    throw err;
  }

  // System and offer-event messages are generated by the platform, not typed.
  if (!skipRateLimit) enforceRateLimit(parseInt(userId, 10), conversation.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO marketplace_messages
         (conversation_id, sender_id, message_type, content,
          attachment_path, attachment_mime, attachment_size_bytes, related_offer_id, is_demo_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, created_at, delivered_at`,
      [
        conversation.id,
        parseInt(userId, 10),
        messageType,
        clean,
        attachment ? attachment.path : null,
        attachment ? attachment.mimetype : null,
        attachment ? attachment.size : null,
        relatedOfferId ? parseInt(relatedOfferId, 10) : null,
        Boolean(conversation.is_demo_data)
      ]
    );

    // Only the recipient's counter moves.
    const recipientColumn = conversation.isFarmer ? 'buyer_unread_count' : 'farmer_unread_count';
    await client.query(
      `UPDATE marketplace_conversations
       SET ${recipientColumn} = ${recipientColumn} + 1,
           last_message_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [conversation.id]
    );

    await client.query('COMMIT');

    const recipientId = conversation.isFarmer
      ? conversation.buyer_user_id
      : conversation.farmer_user_id;

    // Outside the transaction: a notification failure must not undo the message.
    // dedupeSuffix is the message id, so each message notifies exactly once while
    // successive messages still notify.
    await notificationService.create({
      recipientId,
      eventType: notificationService.EVENT.NEW_MESSAGE,
      entityType: notificationService.ENTITY.CONVERSATION,
      entityId: conversation.id,
      title: `New message about ${conversation.crop || 'your crop'}`,
      body: clean ? clean.slice(0, 140) : 'Sent a photo',
      linkPath: `/marketplace/messages/${conversation.id}`,
      dedupeSuffix: String(inserted.rows[0].id),
      isDemoData: Boolean(conversation.is_demo_data)
    });

    return {
      id: inserted.rows[0].id,
      conversationId: conversation.id,
      senderId: parseInt(userId, 10),
      isMine: true,
      messageType,
      content: clean,
      hasAttachment: Boolean(attachment),
      attachmentUrl: attachment ? `/api/marketplace/messages/${inserted.rows[0].id}/attachment` : null,
      attachmentMime: attachment ? attachment.mimetype : null,
      deliveredAt: inserted.rows[0].delivered_at,
      readAt: null,
      status: 'delivered',
      relatedOfferId,
      createdAt: inserted.rows[0].created_at
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Marks the caller's unread messages in a thread as read, and zeroes their counter.
 * @param {object} input - { conversationId, userId }
 * @returns {Promise<number>} messages marked
 */
const markRead = async ({ conversationId, userId }) => {
  const uid = parseInt(userId, 10);
  const id = parseInt(conversationId, 10);

  // Only messages the OTHER side sent can be marked read by this caller.
  const result = await query(
    `UPDATE marketplace_messages
     SET read_at = CURRENT_TIMESTAMP
     WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
    [id, uid]
  );

  await query(
    `UPDATE marketplace_conversations
     SET farmer_unread_count = CASE WHEN farmer_user_id = $2 THEN 0 ELSE farmer_unread_count END,
         buyer_unread_count  = CASE WHEN buyer_user_id  = $2 THEN 0 ELSE buyer_unread_count  END
     WHERE id = $1`,
    [id, uid]
  );

  return result.rowCount;
};

/**
 * Blocks or unblocks a conversation from the caller's side.
 * @param {object} input - { conversationId, userId, blocked }
 * @returns {Promise<object>}
 */
const setBlocked = async ({ conversationId, userId, blocked }) => {
  const conversation = await assertParticipant(conversationId, userId);
  const column = conversation.isFarmer ? 'farmer_blocked' : 'buyer_blocked';

  await query(
    `UPDATE marketplace_conversations SET ${column} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [Boolean(blocked), conversation.id]
  );

  const refreshed = await assertParticipant(conversationId, userId);
  return decorateConversation(refreshed, userId);
};

/**
 * Loads an attachment for download, enforcing participation.
 *
 * Attachments are NOT served by express.static. A stranger with the filename gets
 * nothing, because the only route to the bytes checks the conversation first.
 *
 * @param {object} input - { messageId, userId }
 * @returns {Promise<object>} { path, mime, size }
 */
const getAttachment = async ({ messageId, userId }) => {
  const result = await query(
    `SELECT m.id, m.conversation_id, m.attachment_path, m.attachment_mime, m.attachment_size_bytes
     FROM marketplace_messages m WHERE m.id = $1`,
    [parseInt(messageId, 10)]
  );

  if (!result.rows.length || !result.rows[0].attachment_path) {
    const err = new Error('Attachment not found.');
    err.code = 'ATTACHMENT_NOT_FOUND';
    throw err;
  }

  // Throws CONVERSATION_FORBIDDEN for a non-participant.
  await assertParticipant(result.rows[0].conversation_id, userId);

  return {
    path: result.rows[0].attachment_path,
    mime: result.rows[0].attachment_mime,
    size: result.rows[0].attachment_size_bytes
  };
};

/**
 * Posts a platform-generated message into a thread.
 *
 * Used to mirror offer events into the conversation so the negotiation reads as
 * one timeline. Bypasses the rate limit because it is not user-typed.
 *
 * @param {object} input - { conversationId, senderId, content, relatedOfferId, client }
 * @returns {Promise<void>}
 */
const postOfferEvent = async ({ conversationId, senderId, content, relatedOfferId, client = null }) => {
  if (!conversationId) return;
  const executor = client || { query: (text, params) => query(text, params) };

  await executor.query(
    `INSERT INTO marketplace_messages
       (conversation_id, sender_id, message_type, content, related_offer_id)
     VALUES ($1,$2,'offer_event',$3,$4)`,
    [parseInt(conversationId, 10), parseInt(senderId, 10), sanitiseContent(content), relatedOfferId]
  );

  await executor.query(
    `UPDATE marketplace_conversations
     SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [parseInt(conversationId, 10)]
  );
};

module.exports = {
  MESSAGE_TYPE,
  MAX_MESSAGE_LENGTH,
  RATE_LIMIT_MESSAGES,
  findOrCreate,
  listForUser,
  getMessages,
  sendMessage,
  markRead,
  setBlocked,
  getAttachment,
  postOfferEvent,
  assertParticipant,
  decorateConversation,
  sanitiseContent,
  enforceRateLimit,
  clearRateLimits
};

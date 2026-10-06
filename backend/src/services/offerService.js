/**
 * Offer, counter-offer and deal service.
 *
 * The most safety-critical module in the marketplace. Accepting an offer moves
 * real crop into a real commitment, and getting it wrong means either a farmer
 * selling the same 500 kg twice or a buyer being told they have stock they do not.
 *
 * HOW DOUBLE-ACCEPTANCE IS MADE IMPOSSIBLE
 * ----------------------------------------
 * Four independent mechanisms, in order of who stops it first:
 *
 *   1. SELECT ... FOR UPDATE on the offer row. A second concurrent acceptance
 *      blocks here until the first commits, then re-reads status = 'accepted' and
 *      refuses.
 *   2. FOR UPDATE on the requirement and the availability rows, so quantity
 *      arithmetic cannot interleave.
 *   3. The conditional UPDATE in availabilityService.reserve() requires
 *      available_kg >= quantity, so it matches zero rows rather than going
 *      negative.
 *   4. marketplace_deals.accepted_offer_id is UNIQUE. Even if all of the above
 *      were defeated, the second INSERT violates the constraint and the whole
 *      transaction rolls back.
 *
 * Nothing is "checked then acted on" outside a transaction. Every guard is
 * re-verified INSIDE it, after the locks are held, because a check performed
 * before BEGIN is worthless by the time the write happens.
 */

const { query, pool } = require('../config/db');
const money = require('../utils/money');
const requirementService = require('./requirementService');
const availabilityService = require('./availabilityService');
const conversationService = require('./conversationService');
const notificationService = require('./notificationService');
const { toLocalDateString } = require('./marketPriceService');

const STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  COUNTERED: 'countered',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired'
};

const DELIVERY_TERMS = {
  FARMER_DELIVERS: 'farmer_delivers',
  BUYER_PICKUP: 'buyer_pickup'
};

const DEAL_STATUS = {
  AGREED: 'agreed',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed'
};

/** Legal deal transitions. A deal cannot jump straight to completed. */
const DEAL_TRANSITIONS = {
  agreed: ['preparing', 'ready_for_pickup', 'cancelled', 'disputed'],
  preparing: ['ready_for_pickup', 'cancelled', 'disputed'],
  ready_for_pickup: ['completed', 'cancelled', 'disputed'],
  completed: [],
  cancelled: [],
  disputed: ['cancelled', 'completed']
};

const STATUS_LABEL = {
  pending: 'Waiting for a reply',
  accepted: 'Accepted',
  rejected: 'Not accepted',
  countered: 'Countered',
  withdrawn: 'Withdrawn',
  expired: 'Expired'
};

const DEAL_STATUS_LABEL = {
  agreed: 'Agreed',
  preparing: 'Getting it ready',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Problem reported'
};

/** Default validity of an offer, if the sender names no expiry. */
const DEFAULT_OFFER_VALIDITY_HOURS = 72;


/**
 * Translates PostgreSQL concurrency failures into a retryable application error.
 *
 * Under genuine contention - several buyers racing for one farmer's stock -
 * Postgres may abort a transaction with 40P01 (deadlock detected) or 40001
 * (serialization failure). Both are normal and both are safely retryable: nothing
 * was committed. Surfacing the raw SQLSTATE would show a farmer "40P01", so it is
 * mapped to a clear message instead. The alternative - ordering every lock
 * globally to make deadlock impossible - would still leave 40001, so the retry
 * path is needed regardless.
 *
 * @param {Error} error
 * @returns {Error} the original, or a CONCURRENT_UPDATE_RETRY error
 */
const asRetryableError = (error) => {
  if (error && (error.code === '40P01' || error.code === '40001')) {
    const retryable = new Error(
      'Someone else was agreeing a deal for this crop at the same moment. Please try again.'
    );
    retryable.code = 'CONCURRENT_UPDATE_RETRY';
    retryable.retryable = true;
    retryable.pgCode = error.code;
    return retryable;
  }
  return error;
};

/**
 * Shapes an offer for the API.
 * @param {object} row
 * @param {number} [viewerId]
 * @returns {object|null}
 */
const decorateOffer = (row, viewerId = null) => {
  if (!row) return null;
  const vid = viewerId !== null ? parseInt(viewerId, 10) : null;
  const expired = row.expires_at && new Date(row.expires_at) < new Date();

  return {
    id: row.id,
    requirementId: row.requirement_id,
    cropAvailabilityId: row.crop_availability_id,
    conversationId: row.conversation_id,

    senderId: row.sender_id,
    senderName: row.sender_name || null,
    recipientId: row.recipient_id,
    recipientName: row.recipient_name || null,
    // Drives the UI: only the recipient may accept.
    isMine: vid !== null ? row.sender_id === vid : null,
    canRespond: vid !== null
      ? row.recipient_id === vid && row.status === STATUS.PENDING && !expired
      : null,

    crop: row.crop,
    quantityKg: Number(row.quantity_kg),
    pricePerKg: Number(row.price_per_kg),
    totalAmount: Number(row.total_amount),

    deliveryTerms: row.delivery_terms,
    deliveryTermsLabel: row.delivery_terms === DELIVERY_TERMS.BUYER_PICKUP
      ? 'Buyer collects from the farm'
      : 'Farmer delivers to the buyer',
    proposedFulfillmentDate: toLocalDateString(row.proposed_fulfillment_date),
    expiresAt: row.expires_at,

    // An offer past its expiry reads as expired even before the lazy sweep runs.
    status: expired && row.status === STATUS.PENDING ? STATUS.EXPIRED : row.status,
    statusLabel: expired && row.status === STATUS.PENDING
      ? STATUS_LABEL.expired
      : (STATUS_LABEL[row.status] || row.status),
    parentOfferId: row.parent_offer_id,
    respondedAt: row.responded_at,

    buyerBusinessName: row.business_name || null,
    isDemoData: row.is_demo_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const OFFER_SELECT = `
  o.*, us.full_name AS sender_name, ur.full_name AS recipient_name,
  b.business_name
`;
const OFFER_JOINS = `
  LEFT JOIN users us ON us.id = o.sender_id
  LEFT JOIN users ur ON ur.id = o.recipient_id
  LEFT JOIN buyer_requirements r2 ON r2.id = o.requirement_id
  LEFT JOIN buyer_profiles b ON b.id = r2.buyer_id
`;

/**
 * Marks pending offers past their expiry as expired.
 *
 * Lazy, like requirement expiry: an offer that lapsed overnight must not be
 * acceptable in the morning just because no cron ran.
 *
 * @returns {Promise<number>}
 */
const expireStale = async () => {
  const result = await query(
    `UPDATE marketplace_offers
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE status = $2 AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`,
    [STATUS.EXPIRED, STATUS.PENDING]
  );
  if (result.rowCount) console.log(`[Offers] expired ${result.rowCount} offer(s)`);
  return result.rowCount;
};

/**
 * Resolves the two parties and validates the whole context for a new offer.
 *
 * Shared by create() and counter() so both enforce identical rules.
 *
 * @param {object} input - { requirementId, senderId, availabilityId }
 * @returns {Promise<object>} context
 */
const resolveContext = async ({ requirementId, senderId, availabilityId = null }) => {
  const uid = parseInt(senderId, 10);

  const req = await query(
    `SELECT r.id, r.crop, r.status, r.expires_at, r.quantity_remaining_kg,
            r.partial_fulfillment_allowed, r.minimum_acceptable_quantity_kg,
            r.pickup_available, r.delivery_required, r.offered_price_per_kg,
            b.id AS buyer_profile_id, b.user_id AS buyer_user_id, b.business_name, b.is_suspended
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
  const requirement = req.rows[0];

  if (requirement.is_suspended) {
    const err = new Error('This buyer account is suspended.');
    err.code = 'BUYER_SUSPENDED';
    throw err;
  }

  // Requirement must still be open. Checked here for a fast, clear rejection and
  // AGAIN inside the acceptance transaction, where it actually matters.
  const openness = requirementService.assessOpenness({
    status: requirement.status,
    expires_at: requirement.expires_at,
    quantity_remaining_kg: requirement.quantity_remaining_kg
  });
  if (!openness.open) {
    const err = new Error('This requirement is no longer accepting offers.');
    err.code = openness.reason;
    throw err;
  }

  const senderIsBuyer = requirement.buyer_user_id === uid;

  // Resolve the farmer side and their crop listing.
  let availability = null;
  let farmerUserId;

  if (senderIsBuyer) {
    // A buyer offering must name the farmer's listing.
    if (!availabilityId) {
      const err = new Error("Specify which farmer's crop this offer is for.");
      err.code = 'AVAILABILITY_REQUIRED';
      throw err;
    }
    availability = await availabilityService.getById(availabilityId);
    if (!availability) {
      const err = new Error(`No crop listing found with id ${availabilityId}.`);
      err.code = 'AVAILABILITY_NOT_FOUND';
      throw err;
    }
    farmerUserId = availability.userId;
  } else {
    farmerUserId = uid;
    if (availabilityId) {
      availability = await availabilityService.getById(availabilityId);
      // A farmer may only offer their OWN crop.
      if (availability && availability.userId !== uid) {
        const err = new Error('That crop listing belongs to a different farmer.');
        err.code = 'AVAILABILITY_FORBIDDEN';
        throw err;
      }
    } else {
      // Pick the farmer's matching listing with the most stock.
      const listings = await availabilityService.listForUser(uid, {
        activeOnly: true, withStockOnly: true, crop: requirement.crop
      });
      availability = listings[0] || null;
      if (!availability) {
        const err = new Error(
          `Add your ${requirement.crop} quantity before making an offer.`
        );
        err.code = 'NO_MATCHING_AVAILABILITY';
        throw err;
      }
    }
  }

  if (availability && availability.crop !== requirement.crop) {
    const err = new Error('The crop does not match this requirement.');
    err.code = 'CROP_MISMATCH';
    throw err;
  }
  if (farmerUserId === requirement.buyer_user_id) {
    const err = new Error('You cannot make an offer on your own requirement.');
    err.code = 'SELF_OFFER';
    throw err;
  }

  return {
    requirement,
    availability,
    farmerUserId,
    buyerUserId: requirement.buyer_user_id,
    senderIsBuyer,
    recipientId: senderIsBuyer ? farmerUserId : requirement.buyer_user_id
  };
};

/**
 * Validates the commercial terms of an offer against the requirement.
 * @param {object} input
 * @throws {Error}
 */
const validateTerms = ({ quantityKg, pricePerKg, deliveryTerms, requirement, availability }) => {
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
    const err = new Error('Offer quantity must be more than zero.');
    err.code = 'INVALID_QUANTITY';
    throw err;
  }
  if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
    const err = new Error('Offer price must be more than zero.');
    err.code = 'INVALID_PRICE';
    throw err;
  }

  const remaining = Number(requirement.quantity_remaining_kg);
  if (quantityKg > remaining) {
    const err = new Error(`This buyer needs only ${remaining} kg more.`);
    err.code = 'QUANTITY_EXCEEDS_REQUIREMENT';
    throw err;
  }
  if (quantityKg < remaining && !requirement.partial_fulfillment_allowed) {
    const err = new Error(`This buyer needs the full ${remaining} kg in one lot.`);
    err.code = 'PARTIAL_NOT_ALLOWED';
    throw err;
  }
  if (requirement.minimum_acceptable_quantity_kg
      && quantityKg < Number(requirement.minimum_acceptable_quantity_kg)) {
    const err = new Error(
      `This buyer accepts lots of at least ${requirement.minimum_acceptable_quantity_kg} kg.`
    );
    err.code = 'BELOW_MINIMUM_LOT';
    throw err;
  }
  if (availability && quantityKg > availability.availableKg) {
    const err = new Error(`Only ${availability.availableKg} kg is available to sell.`);
    err.code = 'QUANTITY_EXCEEDS_AVAILABLE';
    throw err;
  }

  // The arrangement must be one the requirement actually permits.
  if (deliveryTerms === DELIVERY_TERMS.BUYER_PICKUP && !requirement.pickup_available) {
    const err = new Error('This buyer does not collect from the farm.');
    err.code = 'PICKUP_NOT_OFFERED';
    throw err;
  }
  if (deliveryTerms === DELIVERY_TERMS.FARMER_DELIVERS && !requirement.delivery_required
      && !requirement.pickup_available) {
    const err = new Error('This requirement has no valid delivery arrangement.');
    err.code = 'NO_ARRANGEMENT';
    throw err;
  }
};

/**
 * Creates an offer (or a counter-offer when parentOfferId is given).
 *
 * @param {object} input
 * @returns {Promise<object>}
 */
const create = async ({
  requirementId,
  senderId,
  availabilityId = null,
  quantityKg,
  pricePerKg,
  deliveryTerms = DELIVERY_TERMS.FARMER_DELIVERS,
  proposedFulfillmentDate = null,
  expiresInHours = DEFAULT_OFFER_VALIDITY_HOURS,
  parentOfferId = null,
  conversationId = null,
  message = null
} = {}) => {
  await expireStale();

  const ctx = await resolveContext({ requirementId, senderId, availabilityId });

  const qty = Number(quantityKg);
  const price = Number(pricePerKg);
  validateTerms({
    quantityKg: qty,
    pricePerKg: price,
    deliveryTerms,
    requirement: ctx.requirement,
    availability: ctx.availability
  });

  // Total is stored, not derived, so the figure a farmer agreed to can never be
  // recomputed differently later. Integer paise, then back to rupees.
  const totalAmount = money.toRupees(money.multiply(money.toPaise(price), qty));

  // Reuse or open the thread, so every offer has somewhere to be discussed.
  let convId = conversationId;
  if (!convId) {
    const conversation = await conversationService.findOrCreate({
      requirementId,
      userId: senderId,
      availabilityId: ctx.availability ? ctx.availability.id : null,
      farmerUserId: ctx.farmerUserId
    });
    convId = conversation.id;
  }

  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3600 * 1000)
    : null;

  const inserted = await query(
    `INSERT INTO marketplace_offers
       (requirement_id, crop_availability_id, conversation_id, sender_id, recipient_id,
        crop, quantity_kg, price_per_kg, total_amount, delivery_terms,
        proposed_fulfillment_date, expires_at, status, parent_offer_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      parseInt(requirementId, 10),
      ctx.availability ? ctx.availability.id : null,
      convId,
      parseInt(senderId, 10),
      ctx.recipientId,
      ctx.requirement.crop,
      qty,
      price,
      totalAmount,
      deliveryTerms,
      proposedFulfillmentDate || null,
      expiresAt,
      STATUS.PENDING,
      parentOfferId ? parseInt(parentOfferId, 10) : null
    ]
  );

  const offerId = inserted.rows[0].id;

  // Mirror into the thread so the negotiation reads as one timeline.
  await conversationService.postOfferEvent({
    conversationId: convId,
    senderId,
    content: parentOfferId
      ? `Counter-offer: ${qty} kg at ₹${price}/kg (₹${totalAmount} total).`
      : `Offer: ${qty} kg at ₹${price}/kg (₹${totalAmount} total).`,
    relatedOfferId: offerId
  });

  if (message) {
    await conversationService.sendMessage({
      conversationId: convId, userId: senderId, content: message
    }).catch(() => {});
  }

  await notificationService.create({
    recipientId: ctx.recipientId,
    eventType: parentOfferId
      ? notificationService.EVENT.COUNTER_OFFER
      : notificationService.EVENT.NEW_OFFER,
    entityType: notificationService.ENTITY.OFFER,
    entityId: offerId,
    title: parentOfferId
      ? `Counter-offer: ${qty} kg at ₹${price}/kg`
      : `New offer: ${qty} kg ${ctx.requirement.crop} at ₹${price}/kg`,
    body: `Total ₹${totalAmount}. ${deliveryTerms === DELIVERY_TERMS.BUYER_PICKUP
      ? 'Buyer collects from the farm.' : 'Farmer delivers.'}`,
    linkPath: `/marketplace/offers/${offerId}`
  });

  // A farmer responding is what the buyer wants to know about.
  if (!ctx.senderIsBuyer && !parentOfferId) {
    await notificationService.create({
      recipientId: ctx.buyerUserId,
      eventType: notificationService.EVENT.FARMER_RESPONDED,
      entityType: notificationService.ENTITY.REQUIREMENT,
      entityId: parseInt(requirementId, 10),
      title: 'A farmer responded to your requirement',
      body: `${qty} kg of ${ctx.requirement.crop} offered at ₹${price}/kg.`,
      linkPath: `/marketplace/requirements/${requirementId}/responses`,
      dedupeSuffix: String(offerId)
    });
  }

  return getById(offerId, senderId);
};

/**
 * Fetches one offer, enforcing that the viewer is a party to it.
 * @param {number} offerId
 * @param {number} [viewerId]
 * @returns {Promise<object|null>}
 */
const getById = async (offerId, viewerId = null) => {
  const result = await query(
    `SELECT ${OFFER_SELECT} FROM marketplace_offers o ${OFFER_JOINS} WHERE o.id = $1`,
    [parseInt(offerId, 10)]
  );
  if (!result.rows.length) return null;

  const row = result.rows[0];
  if (viewerId !== null) {
    const vid = parseInt(viewerId, 10);
    if (row.sender_id !== vid && row.recipient_id !== vid) {
      const err = new Error('Offer not found.');
      err.code = 'OFFER_FORBIDDEN';
      throw err;
    }
  }
  return decorateOffer(row, viewerId);
};

/**
 * Lists offers the caller is party to.
 * @param {object} input - { userId, direction, status, requirementId, limit, offset }
 * @returns {Promise<object>}
 */
const list = async ({
  userId, direction = 'all', status = null, requirementId = null, limit = 30, offset = 0
} = {}) => {
  await expireStale();
  const uid = parseInt(userId, 10);
  const params = [uid];
  const clauses = [];

  // Scoping to the caller is not a filter, it is the authorization boundary.
  if (direction === 'sent') clauses.push('o.sender_id = $1');
  else if (direction === 'received') clauses.push('o.recipient_id = $1');
  else clauses.push('(o.sender_id = $1 OR o.recipient_id = $1)');

  if (status) {
    params.push(Array.isArray(status) ? status : [status]);
    clauses.push(`o.status = ANY($${params.length}::text[])`);
  }
  if (requirementId) {
    params.push(parseInt(requirementId, 10));
    clauses.push(`o.requirement_id = $${params.length}`);
  }

  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 30), 100);
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  params.push(safeLimit, safeOffset);

  const result = await query(
    `SELECT ${OFFER_SELECT} FROM marketplace_offers o ${OFFER_JOINS}
     WHERE ${clauses.join(' AND ')}
     ORDER BY o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    offers: result.rows.map((row) => decorateOffer(row, uid)),
    limit: safeLimit,
    offset: safeOffset
  };
};

/**
 * ACCEPTS AN OFFER AND CREATES THE DEAL. The critical transaction.
 *
 * Every guard the brief lists is re-verified here, INSIDE the transaction, with
 * row locks held:
 *   1. offer still pending and unexpired      (FOR UPDATE on the offer)
 *   2. requirement still active               (FOR UPDATE on the requirement)
 *   3. enough farmer quantity                 (FOR UPDATE in reserve())
 *   4. enough buyer demand                    (remaining >= quantity)
 *   5. create the agreement
 *   6. reserve the crop
 *   7. decrement the remaining requirement
 *   8. cannot be accepted twice               (status guard + UNIQUE accepted_offer_id)
 *
 * @param {object} input - { offerId, userId }
 * @returns {Promise<object>} { offer, deal }
 */
const accept = async ({ offerId, userId }) => {
  const uid = parseInt(userId, 10);
  const id = parseInt(offerId, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // --- 1. lock the offer ------------------------------------------------
    const offerResult = await client.query(
      `SELECT * FROM marketplace_offers WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!offerResult.rows.length) {
      const err = new Error('Offer not found.');
      err.code = 'OFFER_NOT_FOUND';
      throw err;
    }
    const offer = offerResult.rows[0];

    // Only the RECIPIENT may accept. A sender accepting their own offer would be
    // a one-sided contract.
    if (offer.recipient_id !== uid) {
      const err = new Error('Only the person who received this offer can accept it.');
      err.code = 'NOT_OFFER_RECIPIENT';
      throw err;
    }
    // Re-read under the lock: this is what defeats concurrent acceptance.
    if (offer.status !== STATUS.PENDING) {
      const err = new Error(`This offer is already ${STATUS_LABEL[offer.status].toLowerCase()}.`);
      err.code = 'OFFER_NOT_PENDING';
      throw err;
    }
    if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
      const err = new Error('This offer has expired.');
      err.code = 'OFFER_EXPIRED';
      throw err;
    }

    const quantityKg = Number(offer.quantity_kg);

    // --- 2. lock the requirement and re-check demand ----------------------
    const reqResult = await client.query(
      `SELECT r.id, r.status, r.expires_at, r.quantity_required_kg, r.quantity_remaining_kg,
              b.user_id AS buyer_user_id, b.business_name, b.is_suspended
       FROM buyer_requirements r
       JOIN buyer_profiles b ON b.id = r.buyer_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [offer.requirement_id]
    );
    if (!reqResult.rows.length) {
      const err = new Error('The requirement for this offer no longer exists.');
      err.code = 'REQUIREMENT_NOT_FOUND';
      throw err;
    }
    const requirement = reqResult.rows[0];

    if (!requirementService.OPEN_STATUSES.includes(requirement.status)) {
      const err = new Error('This requirement is no longer open.');
      err.code = 'REQUIREMENT_NOT_OPEN';
      throw err;
    }
    if (requirement.expires_at && toLocalDateString(requirement.expires_at)
        < new Date().toISOString().slice(0, 10)) {
      const err = new Error('This requirement has expired.');
      err.code = 'REQUIREMENT_EXPIRED';
      throw err;
    }

    const remainingKg = Number(requirement.quantity_remaining_kg);
    if (remainingKg < quantityKg) {
      const err = new Error(
        `The buyer now needs only ${remainingKg} kg, so ${quantityKg} kg cannot be agreed.`
      );
      err.code = 'INSUFFICIENT_BUYER_DEMAND';
      throw err;
    }

    // --- 3. reserve the crop (locks the availability row) ------------------
    let reservation = null;
    if (offer.crop_availability_id) {
      reservation = await availabilityService.reserve(
        client, offer.crop_availability_id, quantityKg
      );
    }

    // --- 4. decrement the requirement ------------------------------------
    // The WHERE guard means a concurrent decrement cannot drive this negative;
    // the CHECK constraint is the backstop.
    const decremented = await client.query(
      `UPDATE buyer_requirements
       SET quantity_remaining_kg = quantity_remaining_kg - $1,
           status = CASE WHEN quantity_remaining_kg - $1 <= 0 THEN 'fulfilled'
                         ELSE 'partially_fulfilled' END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND quantity_remaining_kg >= $1
       RETURNING quantity_remaining_kg, status`,
      [quantityKg, offer.requirement_id]
    );
    if (!decremented.rows.length) {
      const err = new Error('The buyer\'s remaining quantity changed. Please try again.');
      err.code = 'INSUFFICIENT_BUYER_DEMAND';
      throw err;
    }

    // --- 5. mark the offer accepted --------------------------------------
    // The status guard in the WHERE makes this a compare-and-swap.
    const accepted = await client.query(
      `UPDATE marketplace_offers
       SET status = $1, responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = $3
       RETURNING id`,
      [STATUS.ACCEPTED, id, STATUS.PENDING]
    );
    if (!accepted.rows.length) {
      const err = new Error('This offer was just accepted by someone else.');
      err.code = 'OFFER_NOT_PENDING';
      throw err;
    }

    // Any sibling offers still pending on this requirement from the same farmer
    // listing are now superseded, so they cannot also be accepted.
    await client.query(
      `UPDATE marketplace_offers
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE requirement_id = $2 AND crop_availability_id = $3
         AND id <> $4 AND status = $5`,
      [STATUS.COUNTERED, offer.requirement_id, offer.crop_availability_id, id, STATUS.PENDING]
    );

    // --- 6. create the deal ----------------------------------------------
    // accepted_offer_id is UNIQUE: the final, database-level guarantee that one
    // offer yields at most one deal.
    const farmerUserId = offer.sender_id === requirement.buyer_user_id
      ? offer.recipient_id : offer.sender_id;

    const dealResult = await client.query(
      `INSERT INTO marketplace_deals
         (accepted_offer_id, requirement_id, crop_availability_id, conversation_id,
          farmer_user_id, buyer_user_id, crop, agreed_quantity_kg, agreed_price_per_kg,
          agreed_total, delivery_terms, fulfillment_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, created_at`,
      [
        id,
        offer.requirement_id,
        offer.crop_availability_id,
        offer.conversation_id,
        farmerUserId,
        requirement.buyer_user_id,
        offer.crop,
        quantityKg,
        Number(offer.price_per_kg),
        Number(offer.total_amount),
        offer.delivery_terms,
        offer.proposed_fulfillment_date,
        DEAL_STATUS.AGREED
      ]
    );
    const dealId = dealResult.rows[0].id;

    // --- 7. mirror into the thread and notify, inside the transaction -----
    // Enlisted in the transaction on purpose: a farmer must never be told a deal
    // was agreed if the deal then failed to save.
    await conversationService.postOfferEvent({
      conversationId: offer.conversation_id,
      senderId: uid,
      content:
        `Offer accepted: ${quantityKg} kg at ₹${Number(offer.price_per_kg)}/kg ` +
        `(₹${Number(offer.total_amount)} total). Deal #${dealId} created.`,
      relatedOfferId: id,
      client
    });

    for (const recipientId of [farmerUserId, requirement.buyer_user_id]) {
      await notificationService.create({
        recipientId,
        eventType: notificationService.EVENT.OFFER_ACCEPTED,
        entityType: notificationService.ENTITY.DEAL,
        entityId: dealId,
        title: `Deal agreed: ${quantityKg} kg ${offer.crop}`,
        body:
          `₹${Number(offer.price_per_kg)}/kg, ₹${Number(offer.total_amount)} total. ` +
          'Payment and handover happen outside AgriChain.',
        linkPath: `/marketplace/deals/${dealId}`
      }, client);
    }

    await client.query('COMMIT');

    return {
      offer: await getById(id, uid),
      deal: await getDealById(dealId, uid),
      reservation,
      requirementRemainingKg: Number(decremented.rows[0].quantity_remaining_kg),
      requirementStatus: decremented.rows[0].status
    };
  } catch (error) {
    await client.query('ROLLBACK');
    // A deadlock or serialization abort means nothing committed, so this is a
    // "try again", not a failure the farmer caused.
    throw asRetryableError(error);
  } finally {
    client.release();
  }
};

/**
 * Rejects a pending offer. Recipient only.
 * @param {object} input - { offerId, userId, reason }
 * @returns {Promise<object>}
 */
const reject = async ({ offerId, userId, reason = null }) => {
  const uid = parseInt(userId, 10);
  const result = await query(
    `UPDATE marketplace_offers
     SET status = $1, responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND recipient_id = $3 AND status = $4
     RETURNING id, sender_id, conversation_id, crop, quantity_kg, price_per_kg`,
    [STATUS.REJECTED, parseInt(offerId, 10), uid, STATUS.PENDING]
  );

  if (!result.rows.length) {
    // Covers all three cases without revealing which: not yours, not pending,
    // does not exist.
    const err = new Error('That offer cannot be rejected — it may already have been answered.');
    err.code = 'OFFER_NOT_ACTIONABLE';
    throw err;
  }
  const offer = result.rows[0];

  await conversationService.postOfferEvent({
    conversationId: offer.conversation_id,
    senderId: uid,
    content: `Offer not accepted${reason ? `: ${reason}` : '.'}`,
    relatedOfferId: offer.id
  });

  await notificationService.create({
    recipientId: offer.sender_id,
    eventType: notificationService.EVENT.OFFER_REJECTED,
    entityType: notificationService.ENTITY.OFFER,
    entityId: offer.id,
    title: 'Your offer was not accepted',
    body: `${Number(offer.quantity_kg)} kg ${offer.crop} at ₹${Number(offer.price_per_kg)}/kg.`,
    linkPath: `/marketplace/offers/${offer.id}`
  });

  return getById(offerId, uid);
};

/**
 * Withdraws a pending offer. Sender only.
 * @param {object} input - { offerId, userId }
 * @returns {Promise<object>}
 */
const withdraw = async ({ offerId, userId }) => {
  const uid = parseInt(userId, 10);
  const result = await query(
    `UPDATE marketplace_offers
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND sender_id = $3 AND status = $4
     RETURNING id, recipient_id, conversation_id, crop, quantity_kg`,
    [STATUS.WITHDRAWN, parseInt(offerId, 10), uid, STATUS.PENDING]
  );

  if (!result.rows.length) {
    const err = new Error('That offer cannot be withdrawn — it may already have been answered.');
    err.code = 'OFFER_NOT_ACTIONABLE';
    throw err;
  }
  const offer = result.rows[0];

  await conversationService.postOfferEvent({
    conversationId: offer.conversation_id,
    senderId: uid,
    content: 'Offer withdrawn.',
    relatedOfferId: offer.id
  });

  await notificationService.create({
    recipientId: offer.recipient_id,
    eventType: notificationService.EVENT.OFFER_WITHDRAWN,
    entityType: notificationService.ENTITY.OFFER,
    entityId: offer.id,
    title: 'An offer was withdrawn',
    body: `${Number(offer.quantity_kg)} kg ${offer.crop}.`,
    linkPath: `/marketplace/offers/${offer.id}`
  });

  return getById(offerId, uid);
};

/**
 * Counters an offer: marks the original countered and creates a linked new one.
 *
 * Only the recipient may counter, and the direction flips - so a negotiation is a
 * chain of offers each owned by the party who proposed it.
 *
 * @param {object} input
 * @returns {Promise<object>} the new offer
 */
const counter = async ({
  offerId, userId, quantityKg, pricePerKg, deliveryTerms = null,
  proposedFulfillmentDate = null, message = null
} = {}) => {
  const uid = parseInt(userId, 10);

  const original = await query(
    `SELECT * FROM marketplace_offers WHERE id = $1`,
    [parseInt(offerId, 10)]
  );
  if (!original.rows.length) {
    const err = new Error('Offer not found.');
    err.code = 'OFFER_NOT_FOUND';
    throw err;
  }
  const prev = original.rows[0];

  if (prev.recipient_id !== uid) {
    const err = new Error('Only the person who received this offer can counter it.');
    err.code = 'NOT_OFFER_RECIPIENT';
    throw err;
  }
  if (prev.status !== STATUS.PENDING) {
    const err = new Error(`This offer is already ${STATUS_LABEL[prev.status].toLowerCase()}.`);
    err.code = 'OFFER_NOT_PENDING';
    throw err;
  }

  await query(
    `UPDATE marketplace_offers SET status = $1, responded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [STATUS.COUNTERED, prev.id]
  );

  return create({
    requirementId: prev.requirement_id,
    senderId: uid,
    availabilityId: prev.crop_availability_id,
    quantityKg: quantityKg ?? Number(prev.quantity_kg),
    pricePerKg: pricePerKg ?? Number(prev.price_per_kg),
    deliveryTerms: deliveryTerms || prev.delivery_terms,
    proposedFulfillmentDate: proposedFulfillmentDate || prev.proposed_fulfillment_date,
    parentOfferId: prev.id,
    conversationId: prev.conversation_id,
    message
  });
};

// ===========================================================================
// Deals
// ===========================================================================

/**
 * Fetches a deal, enforcing that the viewer is a party to it.
 * @param {number} dealId
 * @param {number} [viewerId]
 * @returns {Promise<object|null>}
 */
const getDealById = async (dealId, viewerId = null) => {
  const result = await query(
    `SELECT d.*, uf.full_name AS farmer_name, ub.full_name AS buyer_contact_name,
            b.business_name, b.id AS buyer_profile_id, b.district AS buyer_district,
            r.delivery_location
     FROM marketplace_deals d
     LEFT JOIN users uf ON uf.id = d.farmer_user_id
     LEFT JOIN users ub ON ub.id = d.buyer_user_id
     LEFT JOIN buyer_profiles b ON b.user_id = d.buyer_user_id
     LEFT JOIN buyer_requirements r ON r.id = d.requirement_id
     WHERE d.id = $1`,
    [parseInt(dealId, 10)]
  );
  if (!result.rows.length) return null;

  const row = result.rows[0];
  if (viewerId !== null) {
    const vid = parseInt(viewerId, 10);
    if (row.farmer_user_id !== vid && row.buyer_user_id !== vid) {
      const err = new Error('Deal not found.');
      err.code = 'DEAL_FORBIDDEN';
      throw err;
    }
  }
  return decorateDeal(row, viewerId);
};

/**
 * Shapes a deal for the API.
 * @param {object} row
 * @param {number} [viewerId]
 * @returns {object}
 */
const decorateDeal = (row, viewerId = null) => {
  const vid = viewerId !== null ? parseInt(viewerId, 10) : null;
  const isFarmer = vid !== null ? row.farmer_user_id === vid : null;

  return {
    id: row.id,
    acceptedOfferId: row.accepted_offer_id,
    requirementId: row.requirement_id,
    cropAvailabilityId: row.crop_availability_id,
    conversationId: row.conversation_id,

    farmerUserId: row.farmer_user_id,
    farmerName: row.farmer_name,
    buyerUserId: row.buyer_user_id,
    buyerName: row.business_name || row.buyer_contact_name,
    buyerDistrict: row.buyer_district,
    myRole: vid === null ? null : (isFarmer ? 'farmer' : 'buyer'),

    crop: row.crop,
    // "agreed", not "offered": these ARE the settled terms.
    agreedQuantityKg: Number(row.agreed_quantity_kg),
    agreedPricePerKg: Number(row.agreed_price_per_kg),
    agreedTotal: Number(row.agreed_total),

    deliveryTerms: row.delivery_terms,
    deliveryTermsLabel: row.delivery_terms === DELIVERY_TERMS.BUYER_PICKUP
      ? 'Buyer collects from the farm'
      : 'Farmer delivers to the buyer',
    deliveryLocation: row.delivery_location,
    fulfillmentDate: toLocalDateString(row.fulfillment_date),

    status: row.status,
    statusLabel: DEAL_STATUS_LABEL[row.status] || row.status,
    allowedNextStatuses: DEAL_TRANSITIONS[row.status] || [],
    statusNote: row.status_note,
    statusChangedAt: row.status_changed_at,

    // Stated on every deal, because the platform does neither.
    paymentNote: 'Payment and physical handover happen outside AgriChain.',

    isDemoData: row.is_demo_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * Lists deals the caller is party to.
 * @param {object} input - { userId, status, limit, offset }
 * @returns {Promise<object>}
 */
const listDeals = async ({ userId, status = null, limit = 30, offset = 0 } = {}) => {
  const uid = parseInt(userId, 10);
  const params = [uid];
  const clauses = ['(d.farmer_user_id = $1 OR d.buyer_user_id = $1)'];

  if (status) {
    params.push(Array.isArray(status) ? status : [status]);
    clauses.push(`d.status = ANY($${params.length}::text[])`);
  }

  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 30), 100);
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  params.push(safeLimit, safeOffset);

  const result = await query(
    `SELECT d.*, uf.full_name AS farmer_name, ub.full_name AS buyer_contact_name,
            b.business_name, b.id AS buyer_profile_id, b.district AS buyer_district,
            r.delivery_location
     FROM marketplace_deals d
     LEFT JOIN users uf ON uf.id = d.farmer_user_id
     LEFT JOIN users ub ON ub.id = d.buyer_user_id
     LEFT JOIN buyer_profiles b ON b.user_id = d.buyer_user_id
     LEFT JOIN buyer_requirements r ON r.id = d.requirement_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY d.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    deals: result.rows.map((row) => decorateDeal(row, uid)),
    limit: safeLimit,
    offset: safeOffset
  };
};

/**
 * Advances a deal's status.
 *
 * Transitions are validated against DEAL_TRANSITIONS, so a deal cannot jump from
 * `agreed` straight to `completed` - the brief is explicit that acceptance must
 * not auto-complete a deal. Cancelling returns the reserved crop to available.
 *
 * @param {object} input - { dealId, userId, status, note }
 * @returns {Promise<object>}
 */
const updateDealStatus = async ({ dealId, userId, status, note = null } = {}) => {
  const uid = parseInt(userId, 10);
  const id = parseInt(dealId, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM marketplace_deals WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!result.rows.length) {
      const err = new Error('Deal not found.');
      err.code = 'DEAL_NOT_FOUND';
      throw err;
    }
    const deal = result.rows[0];

    if (deal.farmer_user_id !== uid && deal.buyer_user_id !== uid) {
      const err = new Error('Deal not found.');
      err.code = 'DEAL_FORBIDDEN';
      throw err;
    }

    const allowed = DEAL_TRANSITIONS[deal.status] || [];
    if (!allowed.includes(status)) {
      const err = new Error(
        `A ${DEAL_STATUS_LABEL[deal.status].toLowerCase()} deal cannot become ` +
        `"${DEAL_STATUS_LABEL[status] || status}". Allowed: ${allowed.join(', ') || 'none'}.`
      );
      err.code = 'INVALID_DEAL_TRANSITION';
      throw err;
    }

    await client.query(
      `UPDATE marketplace_deals
       SET status = $1, status_changed_by = $2, status_changed_at = CURRENT_TIMESTAMP,
           status_note = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [status, uid, note, id]
    );

    // Quantity bookkeeping follows the deal's fate.
    if (deal.crop_availability_id) {
      if (status === DEAL_STATUS.CANCELLED) {
        // The crop is free to sell again.
        await availabilityService.releaseReservation(
          client, deal.crop_availability_id, Number(deal.agreed_quantity_kg)
        );
        // And the buyer needs it again.
        await client.query(
          `UPDATE buyer_requirements
           SET quantity_remaining_kg = LEAST(quantity_required_kg, quantity_remaining_kg + $1),
               status = CASE WHEN status = 'fulfilled' THEN 'partially_fulfilled' ELSE status END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [Number(deal.agreed_quantity_kg), deal.requirement_id]
        );
      } else if (status === DEAL_STATUS.COMPLETED) {
        await availabilityService.markSold(
          client, deal.crop_availability_id, Number(deal.agreed_quantity_kg)
        );
      }
    }

    const other = deal.farmer_user_id === uid ? deal.buyer_user_id : deal.farmer_user_id;
    await notificationService.create({
      recipientId: other,
      eventType: notificationService.EVENT.DEAL_STATUS_UPDATED,
      entityType: notificationService.ENTITY.DEAL,
      entityId: id,
      title: `Deal #${id} is now ${DEAL_STATUS_LABEL[status]}`,
      body: note || `${Number(deal.agreed_quantity_kg)} kg ${deal.crop}.`,
      linkPath: `/marketplace/deals/${id}`,
      dedupeSuffix: status
    }, client);

    await client.query('COMMIT');
    return getDealById(id, uid);
  } catch (error) {
    await client.query('ROLLBACK');
    throw asRetryableError(error);
  } finally {
    client.release();
  }
};

module.exports = {
  STATUS,
  asRetryableError,
  STATUS_LABEL,
  DELIVERY_TERMS,
  DEAL_STATUS,
  DEAL_STATUS_LABEL,
  DEAL_TRANSITIONS,
  create,
  getById,
  list,
  accept,
  reject,
  withdraw,
  counter,
  expireStale,
  getDealById,
  listDeals,
  updateDealStatus,
  decorateOffer,
  decorateDeal,
  validateTerms,
  resolveContext
};

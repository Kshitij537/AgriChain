/**
 * Farmer crop availability service.
 *
 * Tracks what a farmer actually has to sell, and is the only module permitted to
 * move quantity between the four buckets.
 *
 * WHY FOUR QUANTITIES
 * -------------------
 *   total_harvested_kg  what came off the field
 *   available_kg        offered to buyers right now
 *   reserved_kg         locked by an accepted deal, not yet handed over
 *   sold_kg             handed over, deal completed
 *
 * Collapsing these into one "quantity" column is how a marketplace sells the same
 * 500 kg to two buyers. The database CHECK (available + reserved + sold <=
 * total_harvested) is the backstop; `reserve()` below is the only path that moves
 * available -> reserved, and it does so with a row lock inside the caller's
 * transaction.
 *
 * NO RE-ENTRY OF KNOWN DATA
 * -------------------------
 * The brief is explicit that a farmer must not re-type what AgriChain already
 * holds. `suggestFromFarms` reads the existing `farms` table - crop_type,
 * latitude, longitude, name - and pre-fills everything except the one thing no
 * existing table records: how many kilograms. `farms` has no quantity column at
 * all, which is why this table exists.
 */

const { query } = require('../config/db');
const spoilageService = require('./spoilageService');
const routingService = require('./routingService');
const { toLocalDateString } = require('./marketPriceService');

const HARVEST_STATUS = {
  EXPECTED: 'expected',
  HARVESTING: 'harvesting',
  HARVESTED: 'harvested',
  STORED: 'stored'
};

/** Harvest states whose crop can actually be delivered to a buyer now. */
const SELLABLE_STATUSES = [HARVEST_STATUS.HARVESTED, HARVEST_STATUS.STORED];

/**
 * Quality grades, worst to best. Kept in step with matchingService's identical
 * scale; it is duplicated rather than imported because matchingService requires
 * this module, and importing it back would be a cycle.
 */
const GRADE_ORDER = ['c', 'b', 'a', 'a+'];

/**
 * Normalises a free-text grade to a comparable rank, or null if unrecognised.
 * @param {string|null} grade
 * @returns {number|null}
 */
const gradeRank = (grade) => {
  if (!grade) return null;
  const normalised = String(grade).trim().toLowerCase()
    .replace(/^grade\s*/, '').replace(/\s+/g, '');
  const index = GRADE_ORDER.indexOf(normalised);
  return index === -1 ? null : index;
};

/**
 * True if `grade` is at least as good as `minimum`.
 *
 * An unrecognised or missing grade on either side passes. Excluding a farmer who
 * typed "Premium" would lose them a real sale, so the buyer sees the listing and
 * the ungraded label and decides for themselves.
 *
 * @param {string|null} grade
 * @param {string|null} minimum
 * @returns {boolean}
 */
const gradeAtLeast = (grade, minimum) => {
  const want = gradeRank(minimum);
  if (want === null) return true;
  const have = gradeRank(grade);
  if (have === null) return true;
  return have >= want;
};

const HARVEST_STATUS_LABEL = {
  expected: 'Not harvested yet',
  harvesting: 'Harvesting now',
  harvested: 'Harvested',
  stored: 'In storage'
};

const COLUMNS = `
  a.id, a.user_id, a.farm_id, a.crop, a.variety, a.quality_grade,
  a.total_harvested_kg, a.available_kg, a.reserved_kg, a.sold_kg,
  a.harvest_status, a.harvest_date, a.storage_type,
  a.latitude, a.longitude, a.is_active, a.is_demo_data,
  a.created_at, a.updated_at
`;

/**
 * Shapes an availability row for the API.
 * @param {object} row
 * @returns {object|null}
 */
const decorate = (row) => {
  if (!row) return null;
  const profile = spoilageService.getCropProfile(row.crop);

  return {
    id: row.id,
    userId: row.user_id,
    farmId: row.farm_id,
    farmName: row.farm_name || null,

    crop: row.crop,
    cropLabel: profile.label,
    variety: row.variety,
    qualityGrade: row.quality_grade,

    totalHarvestedKg: Number(row.total_harvested_kg),
    availableKg: Number(row.available_kg),
    reservedKg: Number(row.reserved_kg),
    soldKg: Number(row.sold_kg),
    // Surfaced explicitly so a farmer can see why their available figure dropped
    // after agreeing a deal, rather than thinking crop vanished.
    committedKg: Number(row.reserved_kg) + Number(row.sold_kg),

    harvestStatus: row.harvest_status,
    harvestStatusLabel: HARVEST_STATUS_LABEL[row.harvest_status] || row.harvest_status,
    isSellableNow: SELLABLE_STATUSES.includes(row.harvest_status),
    harvestDate: toLocalDateString(row.harvest_date),
    storageType: row.storage_type,

    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,

    perishability: profile.perishability,
    shelfLifeDays: profile.baseShelfLifeDays,

    isActive: row.is_active,
    isDemoData: row.is_demo_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * Lists a farmer's availability records.
 * @param {number} userId
 * @param {object} [options] - { activeOnly, withStockOnly, crop }
 * @returns {Promise<Array>}
 */
const listForUser = async (userId, { activeOnly = true, withStockOnly = false, crop = null } = {}) => {
  const clauses = ['a.user_id = $1'];
  const params = [parseInt(userId, 10)];

  if (activeOnly) clauses.push('a.is_active = TRUE');
  if (withStockOnly) clauses.push('a.available_kg > 0');
  if (crop) { params.push(crop); clauses.push(`a.crop = $${params.length}`); }

  const result = await query(
    `SELECT ${COLUMNS}, f.name AS farm_name
     FROM farmer_crop_availability a
     LEFT JOIN farms f ON f.id = a.farm_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY a.available_kg DESC, a.created_at DESC`,
    params
  );
  return result.rows.map(decorate);
};

/**
 * Shapes a listing for a buyer who is browsing, not for its owner.
 *
 * WHY A SECOND PROJECTION
 * -----------------------
 * `decorate` is the farmer's own view and includes the farm's exact latitude and
 * longitude. Handing those to any buyer who opens the browse page publishes the
 * location of every farm in the district, so this projection drops them and
 * returns a server-computed distance instead. The farmer's name and district are
 * included because a buyer cannot judge a load without knowing roughly where it
 * is; the phone number is not, because contact belongs in a conversation the
 * farmer can see and block.
 *
 * @param {object} listing - decorated listing (farmer's view)
 * @param {object} extra - { farmerName, farmLocation, straightLineKm }
 * @returns {object}
 */
const toPublicListing = (listing, { farmerName, farmLocation, straightLineKm }) => ({
  availabilityId: listing.id,
  // Enough to open a conversation, and nothing more.
  farmerUserId: listing.userId,
  farmerName: farmerName || 'Farmer',
  farmLocation: farmLocation || null,

  crop: listing.crop,
  cropLabel: listing.cropLabel,
  variety: listing.variety,
  qualityGrade: listing.qualityGrade,

  availableKg: listing.availableKg,

  harvestStatus: listing.harvestStatus,
  harvestStatusLabel: listing.harvestStatusLabel,
  isSellableNow: listing.isSellableNow,
  harvestDate: listing.harvestDate,
  storageType: listing.storageType,

  perishability: listing.perishability,
  shelfLifeDays: listing.shelfLifeDays,

  straightLineKm,
  distanceBasis: straightLineKm === null ? null : 'STRAIGHT_LINE',

  isDemoData: listing.isDemoData,
  listedAt: listing.createdAt
});

/**
 * Lists every farmer's sellable crop, for a buyer browsing the marketplace.
 *
 * This is the buyer-side counterpart to `listForUser`. It is deliberately
 * separate rather than a flag on that function: `listForUser` is scoped to one
 * owner and may return private fields, and a boolean that silently widens the
 * scope to every row in the table is the kind of thing that leaks a database.
 *
 * Only active listings with stock are ever returned. A listing whose crop is not
 * yet harvested is included but flagged `isSellableNow: false`, because a buyer
 * planning ahead still wants to see it; pass `sellableOnly` to drop those.
 *
 * Distance is computed here, server-side, from `origin` — the buyer's registered
 * business location — so that filtering by distance never requires sending farm
 * coordinates to the browser.
 *
 * @param {object} [options]
 * @param {string} [options.crop] - canonical crop key
 * @param {number} [options.minQuantityKg] - drop listings with less stock than this
 * @param {string} [options.qualityGrade] - minimum acceptable grade (A > B > C)
 * @param {number} [options.maxDistanceKm] - requires `origin`; listings of unknown distance are kept
 * @param {{lat: number, lon: number}} [options.origin] - buyer location for distance
 * @param {boolean} [options.sellableOnly] - only crop that can ship now
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @returns {Promise<{listings: Array, total: number, filteredByDistance: number}>}
 */
const browse = async ({
  crop = null,
  minQuantityKg = null,
  qualityGrade = null,
  maxDistanceKm = null,
  origin = null,
  sellableOnly = false,
  limit = 50,
  offset = 0
} = {}) => {
  const clauses = ['a.is_active = TRUE', 'a.available_kg > 0'];
  const params = [];

  if (crop) { params.push(crop); clauses.push(`a.crop = $${params.length}`); }
  if (minQuantityKg) { params.push(minQuantityKg); clauses.push(`a.available_kg >= $${params.length}`); }
  if (sellableOnly) {
    params.push(SELLABLE_STATUSES);
    clauses.push(`a.harvest_status = ANY($${params.length}::text[])`);
  }
  const where = clauses.join(' AND ');

  const totalResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM farmer_crop_availability a
     WHERE ${where}`,
    params
  );

  // Distance cannot be ordered or paged in SQL without the coordinates being in
  // the query, so rows are fetched by stock and ranked by distance below. The
  // cap keeps that in-memory pass bounded.
  const rowLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const rowOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const result = await query(
    `SELECT ${COLUMNS},
            u.full_name AS farmer_name,
            f.name AS farm_name,
            f.location AS farm_location
     FROM farmer_crop_availability a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN farms f ON f.id = a.farm_id
     WHERE ${where}
     ORDER BY a.available_kg DESC, a.created_at DESC
     LIMIT 500`,
    params
  );

  const hasOrigin = origin && routingService.isValidCoordinate(origin);
  let filteredByDistance = 0;

  const listings = [];
  for (const row of result.rows) {
    const listing = decorate(row);

    // Grade is filtered here rather than in SQL because the column is free text:
    // the forgiving comparison in `gradeAtLeast` is the same one the matching
    // engine applies, and SQL equality would silently drop "Grade A" and "a+".
    if (qualityGrade && !gradeAtLeast(listing.qualityGrade, qualityGrade)) continue;

    let straightLineKm = null;
    if (hasOrigin && routingService.isValidCoordinate({ lat: listing.latitude, lon: listing.longitude })) {
      straightLineKm = Math.round(
        routingService.haversineKm({ lat: listing.latitude, lon: listing.longitude }, origin) * 10
      ) / 10;
    }

    // A listing of unknown distance is kept rather than dropped: the farm simply
    // has no coordinates recorded, which is not the farmer's fault and not a
    // reason to hide real stock from a buyer.
    if (maxDistanceKm && straightLineKm !== null && straightLineKm > maxDistanceKm) {
      filteredByDistance += 1;
      continue;
    }

    listings.push(toPublicListing(listing, {
      farmerName: row.farmer_name,
      farmLocation: row.farm_location,
      straightLineKm
    }));
  }

  // Nearest first when distance is known, since a closer load is cheaper and
  // arrives fresher; unknown-distance listings sort last on stock.
  listings.sort((a, b) => {
    const left = a.straightLineKm ?? Number.MAX_SAFE_INTEGER;
    const right = b.straightLineKm ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return b.availableKg - a.availableKg;
  });

  return {
    listings: listings.slice(rowOffset, rowOffset + rowLimit),
    total: totalResult.rows[0].total,
    filteredByDistance
  };
};

/**
 * Fetches one record.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
const getById = async (id) => {
  const result = await query(
    `SELECT ${COLUMNS}, f.name AS farm_name
     FROM farmer_crop_availability a
     LEFT JOIN farms f ON f.id = a.farm_id
     WHERE a.id = $1 LIMIT 1`,
    [parseInt(id, 10)]
  );
  return decorate(result.rows[0]);
};

/**
 * Confirms a record belongs to this farmer before any mutation.
 *
 * A buyer must never be able to change a farmer's crop availability, which is
 * exactly what this guards.
 *
 * @param {number} availabilityId
 * @param {number} userId
 * @returns {Promise<object>} raw row
 * @throws {Error} AVAILABILITY_NOT_FOUND / AVAILABILITY_FORBIDDEN
 */
const assertOwnedByUser = async (availabilityId, userId) => {
  const result = await query(
    `SELECT id, user_id, total_harvested_kg, available_kg, reserved_kg, sold_kg
     FROM farmer_crop_availability WHERE id = $1`,
    [parseInt(availabilityId, 10)]
  );
  if (!result.rows.length) {
    const err = new Error(`No crop listing found with id ${availabilityId}.`);
    err.code = 'AVAILABILITY_NOT_FOUND';
    throw err;
  }
  if (result.rows[0].user_id !== parseInt(userId, 10)) {
    const err = new Error('This crop listing belongs to a different farmer.');
    err.code = 'AVAILABILITY_FORBIDDEN';
    throw err;
  }
  return result.rows[0];
};

/**
 * Pre-fills availability from the farmer's existing farm records.
 *
 * Returns SUGGESTIONS, not saved rows: everything AgriChain already knows is
 * filled in, and the farmer supplies only the quantity. A farm whose crop_type is
 * 'Unknown' or unresolvable is still returned, with crop null, so the farmer can
 * pick the crop rather than being silently dropped from the list.
 *
 * @param {number} userId
 * @returns {Promise<Array>} suggestions
 */
const suggestFromFarms = async (userId) => {
  const result = await query(
    `SELECT f.id, f.name, f.location, f.latitude, f.longitude, f.area_hectares, f.crop_type,
            EXISTS (
              SELECT 1 FROM farmer_crop_availability a
              WHERE a.farm_id = f.id AND a.is_active = TRUE
            ) AS already_listed
     FROM farms f
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [parseInt(userId, 10)]
  );

  return result.rows.map((row) => {
    const cropKey = spoilageService.resolveCropKey(row.crop_type);
    return {
      farmId: row.id,
      farmName: row.name,
      location: row.location,
      areaHectares: row.area_hectares !== null ? Number(row.area_hectares) : null,
      latitude: row.latitude !== null ? Number(row.latitude) : null,
      longitude: row.longitude !== null ? Number(row.longitude) : null,
      // null when the farm's crop_type cannot be resolved ('Unknown'); the UI then
      // asks for the crop instead of guessing one.
      crop: cropKey,
      cropLabel: cropKey ? spoilageService.getCropProfile(cropKey).label : null,
      rawCropType: row.crop_type,
      hasCoordinates: row.latitude !== null && row.longitude !== null,
      alreadyListed: row.already_listed,
      // The one thing no existing table holds.
      needsQuantity: true
    };
  });
};

/**
 * Creates an availability record, inheriting farm location when a farm is given.
 *
 * Ownership of the farm is verified here: a farmer cannot attach their crop
 * listing to someone else's field.
 *
 * @param {number} userId
 * @param {object} input - validated
 * @returns {Promise<object>}
 */
const create = async (userId, input) => {
  let latitude = input.latitude ?? null;
  let longitude = input.longitude ?? null;

  if (input.farmId) {
    const farm = await query(
      'SELECT id, user_id, latitude, longitude FROM farms WHERE id = $1',
      [input.farmId]
    );
    if (!farm.rows.length) {
      const err = new Error(`No field found with id ${input.farmId}.`);
      err.code = 'FARM_NOT_FOUND';
      throw err;
    }
    if (farm.rows[0].user_id !== parseInt(userId, 10)) {
      const err = new Error('This field belongs to a different account.');
      err.code = 'FARM_FORBIDDEN';
      throw err;
    }
    // Denormalised from the farm so matching can filter by distance without a
    // join, and so the listing survives the farm being deleted.
    if (latitude === null) latitude = farm.rows[0].latitude;
    if (longitude === null) longitude = farm.rows[0].longitude;
  }

  const total = input.totalHarvestedKg;
  // Default: everything harvested is on offer. Nothing is reserved or sold yet.
  const available = input.availableKg ?? total;

  const result = await query(
    `INSERT INTO farmer_crop_availability
       (user_id, farm_id, crop, variety, quality_grade,
        total_harvested_kg, available_kg, reserved_kg, sold_kg,
        harvest_status, harvest_date, storage_type, latitude, longitude, is_demo_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      parseInt(userId, 10),
      input.farmId || null,
      input.crop,
      input.variety || null,
      input.qualityGrade || null,
      total,
      available,
      input.harvestStatus || HARVEST_STATUS.HARVESTED,
      input.harvestDate || null,
      input.storageType || 'open',
      latitude,
      longitude,
      Boolean(input.isDemoData)
    ]
  );
  return getById(result.rows[0].id);
};

/**
 * Updates a listing the caller owns.
 *
 * `reserved_kg` and `sold_kg` are deliberately NOT writable here. They move only
 * through reserve()/releaseReservation()/markSold(), which run inside the offer
 * and deal transactions - otherwise a farmer could edit away a reservation that a
 * buyer is relying on.
 *
 * @param {object} input - { availabilityId, userId, changes }
 * @returns {Promise<object>}
 */
const update = async ({ availabilityId, userId, changes }) => {
  const current = await assertOwnedByUser(availabilityId, userId);

  const WRITABLE = {
    variety: 'variety',
    qualityGrade: 'quality_grade',
    harvestStatus: 'harvest_status',
    harvestDate: 'harvest_date',
    storageType: 'storage_type',
    latitude: 'latitude',
    longitude: 'longitude',
    isActive: 'is_active'
  };

  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(WRITABLE)) {
    if (changes[key] !== undefined) {
      params.push(changes[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  // Quantity changes must respect what is already committed.
  const committed = Number(current.reserved_kg) + Number(current.sold_kg);

  if (changes.totalHarvestedKg !== undefined) {
    if (changes.totalHarvestedKg < committed) {
      const err = new Error(
        `${committed} kg is already committed to agreed deals, so the total cannot be reduced below that.`
      );
      err.code = 'TOTAL_BELOW_COMMITTED';
      throw err;
    }
    params.push(changes.totalHarvestedKg);
    sets.push(`total_harvested_kg = $${params.length}`);
  }

  if (changes.availableKg !== undefined) {
    const total = changes.totalHarvestedKg ?? Number(current.total_harvested_kg);
    if (changes.availableKg + committed > total) {
      const err = new Error(
        `You can offer at most ${Math.round((total - committed) * 100) / 100} kg — ` +
        `${committed} kg is already committed.`
      );
      err.code = 'AVAILABLE_EXCEEDS_REMAINING';
      throw err;
    }
    params.push(changes.availableKg);
    sets.push(`available_kg = $${params.length}`);
  }

  if (!sets.length) {
    const err = new Error('No changes were provided.');
    err.code = 'NO_UPDATABLE_FIELDS';
    throw err;
  }

  params.push(parseInt(availabilityId, 10));
  await query(
    `UPDATE farmer_crop_availability SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${params.length}`,
    params
  );
  return getById(availabilityId);
};

/**
 * Removes a listing the caller owns, by deactivating it.
 *
 * WHY THIS IS NOT A DELETE
 * ------------------------
 * `marketplace_conversations`, `marketplace_offers` and `marketplace_deals` all
 * reference this row with ON DELETE SET NULL. A hard delete would therefore
 * silently detach a completed deal from the crop it was for, and the farmer would
 * lose the record of what they sold. Clearing `is_active` takes the listing out of
 * buyer discovery (matchingService requires `a.is_active = TRUE`) while keeping
 * that history intact.
 *
 * `available_kg` is zeroed in the same statement, because an open conversation
 * could otherwise still produce an offer against a listing the farmer has removed
 * — offerService validates against available_kg, not against is_active.
 *
 * Refused while crop is reserved: a buyer is relying on that quantity, so the deal
 * must be cancelled or completed first. Sold crop is history and does not block.
 *
 * @param {object} input - { availabilityId, userId }
 * @returns {Promise<object>} the deactivated listing
 * @throws {Error} AVAILABILITY_NOT_FOUND / AVAILABILITY_FORBIDDEN /
 *                 AVAILABILITY_HAS_COMMITMENTS
 */
const remove = async ({ availabilityId, userId }) => {
  const current = await assertOwnedByUser(availabilityId, userId);

  const reserved = Number(current.reserved_kg);
  if (reserved > 0) {
    const err = new Error(
      `${reserved} kg is promised to an agreed deal, so this crop cannot be removed. ` +
      'Cancel or complete that deal first.'
    );
    err.code = 'AVAILABILITY_HAS_COMMITMENTS';
    err.reservedKg = reserved;
    throw err;
  }

  await query(
    `UPDATE farmer_crop_availability
     SET is_active = FALSE, available_kg = 0, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [parseInt(availabilityId, 10)]
  );
  return getById(availabilityId);
};

/**
 * Moves quantity from available to reserved. THE critical concurrency path.
 *
 * Must be called with a client already inside a transaction (the offer-acceptance
 * transaction). Two things make double-reservation impossible:
 *
 *   1. FOR UPDATE takes a row lock, so a second concurrent acceptance blocks here
 *      until the first commits and then re-reads the decremented figure.
 *   2. The WHERE clause requires available_kg >= the amount. If the first
 *      transaction consumed the stock, this UPDATE matches zero rows and throws
 *      rather than driving the column negative.
 *
 * The database CHECK constraint is the third line of defence behind both.
 *
 * @param {object} client - pg client inside a transaction
 * @param {number} availabilityId
 * @param {number} quantityKg
 * @returns {Promise<object>} { availableKg, reservedKg }
 * @throws {Error} INSUFFICIENT_AVAILABLE_QUANTITY
 */
const reserve = async (client, availabilityId, quantityKg) => {
  const locked = await client.query(
    `SELECT id, available_kg, reserved_kg FROM farmer_crop_availability
     WHERE id = $1 FOR UPDATE`,
    [parseInt(availabilityId, 10)]
  );

  if (!locked.rows.length) {
    const err = new Error(`No crop listing found with id ${availabilityId}.`);
    err.code = 'AVAILABILITY_NOT_FOUND';
    throw err;
  }

  const availableKg = Number(locked.rows[0].available_kg);
  if (availableKg < quantityKg) {
    const err = new Error(
      `Only ${availableKg} kg is still available — the farmer cannot supply ${quantityKg} kg.`
    );
    err.code = 'INSUFFICIENT_AVAILABLE_QUANTITY';
    err.availableKg = availableKg;
    throw err;
  }

  const updated = await client.query(
    `UPDATE farmer_crop_availability
     SET available_kg = available_kg - $1,
         reserved_kg  = reserved_kg + $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND available_kg >= $1
     RETURNING available_kg, reserved_kg`,
    [quantityKg, parseInt(availabilityId, 10)]
  );

  if (!updated.rows.length) {
    // Reached only if the row changed between the lock and the update, which the
    // lock should prevent - kept as a hard stop rather than a silent no-op.
    const err = new Error('Crop quantity changed while reserving. Please try again.');
    err.code = 'INSUFFICIENT_AVAILABLE_QUANTITY';
    throw err;
  }

  return {
    availableKg: Number(updated.rows[0].available_kg),
    reservedKg: Number(updated.rows[0].reserved_kg)
  };
};

/**
 * Returns reserved quantity to available, when a deal is cancelled.
 * @param {object} client - pg client inside a transaction
 * @param {number} availabilityId
 * @param {number} quantityKg
 * @returns {Promise<void>}
 */
const releaseReservation = async (client, availabilityId, quantityKg) => {
  await client.query(
    `UPDATE farmer_crop_availability
     SET available_kg = available_kg + $1,
         reserved_kg  = GREATEST(0, reserved_kg - $1),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [quantityKg, parseInt(availabilityId, 10)]
  );
};

/**
 * Moves reserved quantity to sold, when a deal completes.
 * @param {object} client - pg client inside a transaction
 * @param {number} availabilityId
 * @param {number} quantityKg
 * @returns {Promise<void>}
 */
const markSold = async (client, availabilityId, quantityKg) => {
  await client.query(
    `UPDATE farmer_crop_availability
     SET reserved_kg = GREATEST(0, reserved_kg - $1),
         sold_kg     = sold_kg + $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [quantityKg, parseInt(availabilityId, 10)]
  );
};

/**
 * Farmer dashboard summary across all their listings.
 * @param {number} userId
 * @returns {Promise<object>}
 */
const getFarmerSummary = async (userId) => {
  const result = await query(
    `SELECT COUNT(*)::int AS listings,
            COALESCE(SUM(available_kg),0) AS available_kg,
            COALESCE(SUM(reserved_kg),0) AS reserved_kg,
            COALESCE(SUM(sold_kg),0) AS sold_kg,
            COUNT(DISTINCT crop)::int AS crops
     FROM farmer_crop_availability
     WHERE user_id = $1 AND is_active = TRUE`,
    [parseInt(userId, 10)]
  );
  const row = result.rows[0];
  return {
    listings: row.listings,
    crops: row.crops,
    availableKg: Number(row.available_kg),
    reservedKg: Number(row.reserved_kg),
    soldKg: Number(row.sold_kg)
  };
};

module.exports = {
  HARVEST_STATUS,
  HARVEST_STATUS_LABEL,
  SELLABLE_STATUSES,
  listForUser,
  getById,
  assertOwnedByUser,
  suggestFromFarms,
  create,
  update,
  remove,
  reserve,
  releaseReservation,
  markSold,
  getFarmerSummary,
  decorate,
  browse,
  toPublicListing,
  gradeAtLeast
};

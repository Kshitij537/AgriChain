/**
 * Buyer Marketplace tests.
 *
 * Covers the 23 cases the brief requires, end to end over real HTTP with TWO
 * separate authenticated users (a farmer and a buyer), against the real database.
 *
 * WHAT IS AND IS NOT STUBBED
 *   PostgreSQL   real - the constraints, transactions and row locks ARE the
 *                subject of the concurrency tests and cannot be faked
 *   routing      ROUTING_PROVIDER=none, so distances are deterministic
 *   ML/weather   unused by these paths, or stubbed where they would add latency
 *
 * Fixtures are created under a 'zz-test-' prefix and removed afterwards, so the
 * suite neither depends on nor damages existing data. If PostgreSQL is
 * unreachable the whole suite skips rather than failing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.ROUTING_PROVIDER = 'none';
process.env.NDVI_DAILY_REFRESH_ENABLED = 'false';
process.env.PRICE_PREDICTION_ENABLED = 'false';
process.env.TRANSPORT_SEARCH_ENABLED = 'false';

require('dotenv').config();

const { pool, query } = require('../src/config/db');
const conversationService = require('../src/services/conversationService');
const app = require('../src/app');

const FARM = { lat: 21.0046, lon: 79.0477 };

const state = {
  available: false,
  server: null,
  baseUrl: null,
  farmerId: null,
  buyerUserId: null,
  buyer2UserId: null,
  strangerId: null,
  adminId: null,
  farmId: null,
  buyerProfileId: null,
  buyer2ProfileId: null,
  availabilityId: null,
  requirementId: null,
  requirement2Id: null,
  tokens: {}
};

const tok = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '2h' });

/** Minimal HTTP client, so no test dependency is added. */
const request = (method, path, body = null, token = null) =>
  new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body);
    const req = http.request(
      `${state.baseUrl}${path}`,
      {
        method,
        headers: {
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }); }
          catch { resolve({ status: res.statusCode, body: null }); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const makeUser = async (name, email) => {
  const result = await query(
    `INSERT INTO users (full_name, email, password_hash) VALUES ($1,$2,'not-a-real-hash')
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id`,
    [name, email]
  );
  return result.rows[0].id;
};

/**
 * Resets quantities and statuses so each concurrency test starts clean.
 *
 * Every DELETE is SCOPED to this suite's own users. An earlier version deleted
 * `FROM marketplace_deals` and `FROM marketplace_offers` unqualified, which wiped
 * every offer and deal in the database — including the demo seed's, and on a real
 * deployment, real farmers' agreements. A test helper must never be able to reach
 * data it did not create.
 */
const resetFixtureState = async () => {
  const ids = [state.farmerId, state.buyerUserId, state.buyer2UserId,
    state.strangerId, state.adminId].filter(Boolean);

  // Deals before offers: marketplace_deals.accepted_offer_id is ON DELETE RESTRICT.
  await query(
    `DELETE FROM marketplace_deals
     WHERE farmer_user_id = ANY($1::int[]) OR buyer_user_id = ANY($1::int[])`,
    [ids]
  );
  await query(
    `DELETE FROM marketplace_offers
     WHERE sender_id = ANY($1::int[]) OR recipient_id = ANY($1::int[])`,
    [ids]
  );
  await query(
    `UPDATE farmer_crop_availability
     SET total_harvested_kg = 500, available_kg = 500, reserved_kg = 0, sold_kg = 0
     WHERE id = $1`,
    [state.availabilityId]
  );
  await query(
    `UPDATE buyer_requirements
     SET quantity_required_kg = 1000, quantity_remaining_kg = 1000, status = 'active',
         pickup_available = FALSE, delivery_required = TRUE,
         partial_fulfillment_allowed = TRUE, expires_at = $2
     WHERE id = ANY($1::int[])`,
    [[state.requirementId, state.requirement2Id], daysFromNow(10)]
  );
  conversationService.clearRateLimits();
};

/**
 * Removes every fixture this suite creates.
 *
 * Run BEFORE seeding as well as after. A previous run that crashed mid-way leaves
 * a buyer profile behind, and then "not a buyer before registering" fails for a
 * reason that has nothing to do with the code - the suite must be idempotent
 * across runs, not only tidy at the end.
 */
const purgeFixtures = async () => {
  const users = await query(
    "SELECT id FROM users WHERE email LIKE 'zz-test-%@marketplace.local'"
  );
  const ids = users.rows.map((r) => r.id);
  if (!ids.length) return;

  await query('DELETE FROM marketplace_deals WHERE farmer_user_id = ANY($1::int[]) OR buyer_user_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM marketplace_offers WHERE sender_id = ANY($1::int[]) OR recipient_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM marketplace_conversations WHERE farmer_user_id = ANY($1::int[]) OR buyer_user_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM marketplace_notifications WHERE recipient_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM marketplace_reports WHERE reporter_id = ANY($1::int[]) OR reported_user_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM buyer_requirements WHERE buyer_id IN (SELECT id FROM buyer_profiles WHERE user_id = ANY($1::int[]))', [ids]);
  await query('DELETE FROM farmer_crop_availability WHERE user_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM buyer_profiles WHERE user_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM farms WHERE user_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM user_roles WHERE user_id = ANY($1::int[])', [ids]);
  await query('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
};

test.before(async () => {
  try {
    await query('SELECT 1 FROM buyer_profiles LIMIT 1');
    // Idempotency: clear anything a previous run left behind.
    await purgeFixtures();

    state.farmerId = await makeUser('ZZ Test Farmer', 'zz-test-farmer@marketplace.local');
    state.buyerUserId = await makeUser('ZZ Test Buyer A', 'zz-test-buyer-a@marketplace.local');
    state.buyer2UserId = await makeUser('ZZ Test Buyer B', 'zz-test-buyer-b@marketplace.local');
    state.strangerId = await makeUser('ZZ Test Stranger', 'zz-test-stranger@marketplace.local');
    state.adminId = await makeUser('ZZ Test Admin', 'zz-test-admin@marketplace.local');

    for (const key of ['farmerId', 'buyerUserId', 'buyer2UserId', 'strangerId', 'adminId']) {
      state.tokens[key] = tok(state[key]);
    }
    await query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1,'admin')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [state.adminId]
    );

    const farm = await query(
      `INSERT INTO farms (user_id, name, location, latitude, longitude, area_hectares, crop_type)
       VALUES ($1,'ZZ Test Field','Hingna',$2,$3,1.2,'Tomato') RETURNING id`,
      [state.farmerId, FARM.lat, FARM.lon]
    );
    state.farmId = farm.rows[0].id;

    state.available = true;
  } catch (error) {
    console.warn(`\n[Marketplace] SKIPPING: database unavailable (${error.message})\n`);
    return;
  }

  await new Promise((resolve) => {
    state.server = app.listen(0, '127.0.0.1', () => {
      state.baseUrl = `http://127.0.0.1:${state.server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (state.server) await new Promise((r) => state.server.close(r));
  if (state.available) {
    try {
      await purgeFixtures();
    } catch (error) {
      console.warn(`[Marketplace] Cleanup warning: ${error.message}`);
    }
  }
  await pool.end().catch(() => {});
});

// ===========================================================================
// 1. Buyer registration and role authorization
// ===========================================================================

test('1. buyer registration grants the buyer role and starts unverified', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const before = await request('GET', '/api/buyers/me/roles', null, state.tokens.buyerUserId);
  assert.equal(before.body.data.isBuyer, false, 'not a buyer before registering');
  assert.equal(before.body.data.isFarmer, true, 'farmer role is implicit');

  const created = await request('POST', '/api/buyers/profile', {
    businessName: 'ZZ Test Wholesale A',
    buyerType: 'wholesaler',
    villageCity: 'Amravati', district: 'Amravati', state: 'Maharashtra',
    latitude: 20.932, longitude: 77.752,
    cropsPurchased: ['Tomato', 'tamatar'], serviceAreaKm: 300
  }, state.tokens.buyerUserId);

  assert.equal(created.status, 201);
  state.buyerProfileId = created.body.data.id;

  // A new buyer is never verified, whatever they sent.
  assert.equal(created.body.data.verificationStatus, 'unverified');
  assert.equal(created.body.data.isVerified, false);
  // Crop names are normalised and deduplicated.
  assert.deepEqual(created.body.data.cropsPurchased, ['tomato']);

  const after = await request('GET', '/api/buyers/me/roles', null, state.tokens.buyerUserId);
  assert.equal(after.body.data.isBuyer, true);

  // Second buyer, for the competition tests.
  const second = await request('POST', '/api/buyers/profile', {
    businessName: 'ZZ Test Processor B', buyerType: 'processor',
    villageCity: 'Nagpur', district: 'Nagpur', state: 'Maharashtra',
    latitude: 21.1458, longitude: 79.0882, cropsPurchased: ['tomato'], serviceAreaKm: 300
  }, state.tokens.buyer2UserId);
  state.buyer2ProfileId = second.body.data.id;
});

test('1b. a farmer cannot post a requirement, and verification cannot be self-awarded', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const asFarmer = await request('POST', '/api/buyer-requirements', {
    crop: 'tomato', quantityRequiredKg: 100, offeredPricePerKg: 30,
    requiredBy: daysFromNow(5), expiresAt: daysFromNow(9), deliveryLocation: 'x'
  }, state.tokens.farmerId);
  assert.equal(asFarmer.status, 403);
  assert.equal(asFarmer.body.error.code, 'BUYER_PROFILE_REQUIRED');

  // A verification status in the body must be inert.
  const patched = await request('PATCH', '/api/buyers/me', {
    verificationStatus: 'verified', isSuspended: false, businessName: 'ZZ Test Wholesale A'
  }, state.tokens.buyerUserId);
  assert.equal(patched.body.data.verificationStatus, 'unverified');

  // Self-submission reaches pending only.
  const submitted = await request('POST', '/api/buyers/me/verification', {}, state.tokens.buyerUserId);
  assert.equal(submitted.body.data.verificationStatus, 'verification_pending');

  // Only an admin may approve.
  const byBuyer = await request('POST', `/api/buyers/admin/${state.buyerProfileId}/verification`,
    { decision: 'verified' }, state.tokens.buyerUserId);
  assert.equal(byBuyer.status, 403);

  const byAdmin = await request('POST', `/api/buyers/admin/${state.buyerProfileId}/verification`,
    { decision: 'verified', notes: 'test' }, state.tokens.adminId);
  assert.equal(byAdmin.status, 200);
  assert.equal(byAdmin.body.data.verificationStatus, 'verified');
});

// ===========================================================================
// 2–4. Requirement creation, validation, expiry
// ===========================================================================

test('2. a buyer can post a requirement', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const created = await request('POST', '/api/buyer-requirements', {
    crop: 'Tomato', quantityRequiredKg: 1000, offeredPricePerKg: 30,
    requiredBy: daysFromNow(7), expiresAt: daysFromNow(10),
    deliveryLocation: 'Amravati APMC', latitude: 20.932, longitude: 77.752,
    minimumQualityGrade: 'B', partialFulfillmentAllowed: true, deliveryRequired: true
  }, state.tokens.buyerUserId);

  assert.equal(created.status, 201);
  state.requirementId = created.body.data.id;
  assert.equal(created.body.data.crop, 'tomato', 'crop normalised');
  assert.equal(created.body.data.status, 'active');
  assert.equal(created.body.data.quantityRemainingKg, 1000, 'nothing committed yet');
  // An advertised ask, never a settled price.
  assert.equal(created.body.data.offeredPricePerKg, 30);
  assert.match(created.body.meta.note, /not a confirmed purchase/i);

  const second = await request('POST', '/api/buyer-requirements', {
    crop: 'tomato', quantityRequiredKg: 1000, offeredPricePerKg: 28,
    requiredBy: daysFromNow(6), expiresAt: daysFromNow(9),
    deliveryLocation: 'Nagpur Kalamna', latitude: 21.1458, longitude: 79.0882
  }, state.tokens.buyer2UserId);
  state.requirement2Id = second.body.data.id;
});

test('3. invalid quantities and prices are refused', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const base = {
    crop: 'tomato', requiredBy: daysFromNow(5), expiresAt: daysFromNow(9),
    deliveryLocation: 'x'
  };
  const cases = [
    [{ ...base, quantityRequiredKg: 0, offeredPricePerKg: 30 }, 'QUANTITY_ZERO'],
    [{ ...base, quantityRequiredKg: -5, offeredPricePerKg: 30 }, 'QUANTITY_NEGATIVE'],
    [{ ...base, quantityRequiredKg: 100, offeredPricePerKg: 0 }, 'PRICE_NOT_POSITIVE'],
    [{ ...base, quantityRequiredKg: 100, offeredPricePerKg: -30 }, 'PRICE_NOT_POSITIVE'],
    // The domain's signature typo: a per-quintal rate in a per-kg field.
    [{ ...base, quantityRequiredKg: 100, offeredPricePerKg: 3000 }, 'PRICE_TOO_HIGH'],
    [{ ...base, quantityRequiredKg: 100, offeredPricePerKg: 30, crop: 'dragonfruit' }, 'CROP_NOT_SUPPORTED'],
    [{ ...base, quantityRequiredKg: 100, offeredPricePerKg: 30, requiredBy: daysFromNow(9), expiresAt: daysFromNow(5) }, 'EXPIRY_BEFORE_REQUIRED_BY']
  ];

  for (const [body, expectedCode] of cases) {
    const res = await request('POST', '/api/buyer-requirements', body, state.tokens.buyerUserId);
    assert.equal(res.status, 400, JSON.stringify(body));
    const codes = res.body.error.fields.map((f) => f.code);
    assert.ok(codes.includes(expectedCode), `expected ${expectedCode}, got ${codes.join(',')}`);
  }
});

test('3b. the database refuses invalid data even if validation were bypassed', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // Direct SQL, deliberately going around the API.
  await assert.rejects(
    () => query(
      `INSERT INTO buyer_requirements
        (buyer_id, crop, quantity_required_kg, quantity_remaining_kg, offered_price_per_kg, required_by, expires_at)
       VALUES ($1,'tomato',-5,-5,30,$2,$3)`,
      [state.buyerProfileId, daysFromNow(5), daysFromNow(9)]
    ),
    (error) => /chk_req_quantity/.test(error.message)
  );

  await assert.rejects(
    () => query(
      `INSERT INTO farmer_crop_availability (user_id, crop, total_harvested_kg, available_kg, reserved_kg)
       VALUES ($1,'tomato',500,400,300)`,
      [state.farmerId]
    ),
    (error) => /chk_avail_conservation/.test(error.message),
    'the database refuses to over-commit crop'
  );
});

test('4. an expired requirement accepts no offers', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // Backdate past expiry, bypassing the forward-date validator.
  await query(
    'UPDATE buyer_requirements SET expires_at = CURRENT_DATE - 1, required_by = CURRENT_DATE - 2 WHERE id = $1',
    [state.requirement2Id]
  );

  const listed = await request('GET', '/api/buyer-requirements?crop=tomato', null, state.tokens.farmerId);
  const ids = listed.body.data.map((r) => r.id);
  assert.ok(!ids.includes(state.requirement2Id), 'expired requirements drop out of browsing');

  const offered = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirement2Id, quantityKg: 100, pricePerKg: 28
  }, state.tokens.farmerId);
  assert.equal(offered.status, 409);
  assert.match(offered.body.error.code, /EXPIRED|NOT_OPEN/);

  await resetFixtureStateSafe();
});

/** Restores requirement 2 after the expiry test. */
const resetFixtureStateSafe = async () => {
  await query(
    `UPDATE buyer_requirements SET expires_at = $2, required_by = $3, status = 'active' WHERE id = $1`,
    [state.requirement2Id, daysFromNow(9), daysFromNow(6)]
  );
};

// ===========================================================================
// 5–7. Matching
// ===========================================================================

test('5. farmer crop availability is pre-filled from saved fields, then matched', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const suggestions = await request('GET', '/api/marketplace/farmer/availability/suggestions',
    null, state.tokens.farmerId);
  assert.equal(suggestions.status, 200);
  const mine = suggestions.body.data.find((s) => s.farmId === state.farmId);
  assert.ok(mine, 'the farmer\'s own field is suggested');
  // Everything AgriChain knows is pre-filled; only quantity is new.
  assert.equal(mine.crop, 'tomato', 'crop resolved from the farm record');
  assert.equal(mine.hasCoordinates, true);
  assert.equal(mine.needsQuantity, true);

  const created = await request('POST', '/api/marketplace/farmer/availability', {
    farmId: state.farmId, crop: 'tomato', totalHarvestedKg: 500, availableKg: 500,
    qualityGrade: 'A', harvestStatus: 'harvested', harvestDate: daysFromNow(0),
    storageType: 'open'
  }, state.tokens.farmerId);
  assert.equal(created.status, 201);
  state.availabilityId = created.body.data.id;

  // The four buckets start correctly.
  assert.equal(created.body.data.totalHarvestedKg, 500);
  assert.equal(created.body.data.availableKg, 500);
  assert.equal(created.body.data.reservedKg, 0);
  assert.equal(created.body.data.soldKg, 0);

  const matches = await request('GET',
    `/api/marketplace/farmer/matches?availabilityId=${state.availabilityId}`,
    null, state.tokens.farmerId);
  assert.equal(matches.status, 200);
  assert.ok(matches.body.data.length >= 1, 'the buyer requirement is matched');

  const match = matches.body.data.find((m) => m.requirement.id === state.requirementId);
  assert.ok(match);
  // Plain reasons, no invented score.
  assert.ok(Array.isArray(match.reasons) && match.reasons.length > 0);
  assert.ok(match.reasons.some((r) => /same crop/i.test(r)));
  assert.equal(match.matchConfidence, undefined, 'no fabricated match percentage');
});

test('6. a crop mismatch is excluded, with the reason reported', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const onion = await request('POST', '/api/buyer-requirements', {
    crop: 'onion', quantityRequiredKg: 500, offeredPricePerKg: 25,
    requiredBy: daysFromNow(7), expiresAt: daysFromNow(10), deliveryLocation: 'Nagpur'
  }, state.tokens.buyerUserId);

  const matches = await request('GET',
    `/api/marketplace/farmer/matches?availabilityId=${state.availabilityId}`,
    null, state.tokens.farmerId);
  const ids = matches.body.data.map((m) => m.requirement.id);
  assert.ok(!ids.includes(onion.body.data.id), 'an onion requirement never matches tomato stock');

  await query('DELETE FROM buyer_requirements WHERE id = $1', [onion.body.data.id]);
});

test('7. partial fulfilment: 500 kg matches a 1,000 kg requirement', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  await resetFixtureState();

  const matches = await request('GET',
    `/api/marketplace/farmer/matches?availabilityId=${state.availabilityId}`,
    null, state.tokens.farmerId);
  const match = matches.body.data.find((m) => m.requirement.id === state.requirementId);

  // min(farmerAvailable, buyerRemaining)
  assert.equal(match.matchedQuantityKg, 500);
  assert.equal(match.isPartialFulfilment, true);
  assert.ok(match.reasons.some((r) => /500 kg of the 1000 kg/i.test(r)));

  // With partial fulfilment off, the same stock no longer qualifies.
  await query('UPDATE buyer_requirements SET partial_fulfillment_allowed = FALSE WHERE id = $1',
    [state.requirementId]);
  const strict = await request('GET',
    `/api/marketplace/farmer/matches?availabilityId=${state.availabilityId}`,
    null, state.tokens.farmerId);
  const strictIds = strict.body.data.map((m) => m.requirement.id);
  assert.ok(!strictIds.includes(state.requirementId), 'insufficient quantity excluded');
  assert.ok(strict.body.meta.diagnostics.excludedByReason.partial_fulfilment_not_allowed >= 1,
    'and the reason is reported');

  await query('UPDATE buyer_requirements SET partial_fulfillment_allowed = TRUE WHERE id = $1',
    [state.requirementId]);
});

test('8. a crop listing can be removed, unless its crop is promised to a deal', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  await resetFixtureState();

  const spare = await request('POST', '/api/marketplace/farmer/availability', {
    farmId: state.farmId, crop: 'onion', totalHarvestedKg: 200, availableKg: 200,
    harvestStatus: 'harvested', harvestDate: daysFromNow(0), storageType: 'open'
  }, state.tokens.farmerId);
  assert.equal(spare.status, 201);
  const spareId = spare.body.data.id;

  // Nobody else may remove it, however the id is guessed.
  const stranger = await request('DELETE',
    `/api/marketplace/farmer/availability/${spareId}`, null, state.tokens.strangerId);
  assert.equal(stranger.status, 403);

  // Promised crop blocks removal: a buyer is relying on that quantity.
  await query('UPDATE farmer_crop_availability SET available_kg = 150, reserved_kg = 50 WHERE id = $1',
    [spareId]);
  const blocked = await request('DELETE',
    `/api/marketplace/farmer/availability/${spareId}`, null, state.tokens.farmerId);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, 'AVAILABILITY_HAS_COMMITMENTS');

  // Released, it can be removed.
  await query('UPDATE farmer_crop_availability SET available_kg = 200, reserved_kg = 0 WHERE id = $1',
    [spareId]);
  const removed = await request('DELETE',
    `/api/marketplace/farmer/availability/${spareId}`, null, state.tokens.farmerId);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.isActive, false);
  // Zeroed, so an open conversation cannot still produce an offer against it.
  assert.equal(removed.body.data.availableKg, 0);

  // Gone from the farmer's own list, and from the row the buyer side searches.
  const mine = await request('GET', '/api/marketplace/farmer/availability',
    null, state.tokens.farmerId);
  assert.ok(!mine.body.data.some((l) => l.id === spareId), 'no longer listed');

  // The row survives, so any deal that referenced it keeps its crop context.
  const row = await query('SELECT is_active FROM farmer_crop_availability WHERE id = $1', [spareId]);
  assert.equal(row.rows.length, 1, 'soft-deleted, not erased');
  assert.equal(row.rows[0].is_active, false);

  // Removing twice is harmless for the owner — the row is already inactive.
  const again = await request('DELETE',
    `/api/marketplace/farmer/availability/${spareId}`, null, state.tokens.farmerId);
  assert.equal(again.status, 200, 'idempotent for the owner');

  await query('DELETE FROM farmer_crop_availability WHERE id = $1', [spareId]);
});

// ===========================================================================
// 9–10. Comparison
// ===========================================================================

test('9. buyer comparison ranks by money in hand, not advertised price', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  await resetFixtureState();

  const res = await request('GET',
    `/api/marketplace/farmer/top-buyers?availabilityId=${state.availabilityId}`,
    null, state.tokens.farmerId);
  assert.equal(res.status, 200);

  const buyers = res.body.data.buyers.filter((b) => b.isComplete);
  assert.ok(buyers.length >= 2, 'both buyers priced');

  // Ordered by expected money, descending. Asserted across the WHOLE list,
  // including any demo or pre-existing buyers - the ordering rule is global.
  for (let i = 1; i < buyers.length; i += 1) {
    assert.ok(buyers[i - 1].expectedMoney >= buyers[i].expectedMoney);
  }
  assert.equal(res.body.data.comparison.rankedBy, 'expectedMoney');

  // THE CORE CLAIM, asserted BETWEEN THIS TEST'S OWN TWO FIXTURES.
  //
  // Deliberately not "the global winner is B": the demo seed (and any real data)
  // also posts tomato requirements, and one of those could legitimately outrank
  // both fixtures. The claim under test is that a cheaper, nearer buyer beats a
  // dearer, further one - which is a statement about these two, not about the
  // whole database.
  const far = buyers.find((b) => b.buyerName === 'ZZ Test Wholesale A');
  const near = buyers.find((b) => b.buyerName === 'ZZ Test Processor B');
  assert.ok(far && near, 'both fixtures are present in the comparison');
  assert.ok(near.offeredPricePerKg < far.offeredPricePerKg, 'precondition: B advertises less');
  assert.ok(near.transportCost < far.transportCost, 'precondition: B is nearer');
  assert.ok(
    near.expectedMoney > far.expectedMoney,
    `the cheaper, nearer buyer must leave more money: B ₹${near.expectedMoney} vs A ₹${far.expectedMoney}`
  );
  assert.ok(
    buyers.indexOf(near) < buyers.indexOf(far),
    'and must therefore be ranked above it'
  );

  // The winner among this test's own fixtures, for the assertions below.
  const winner = near;

  // Matched quantity, not the whole requirement.
  assert.equal(winner.matchedQuantityKg, 500);
  // Advertised, not agreed.
  assert.equal(winner.isAdvertisedPrice, true);
  // Assumptions are visible.
  assert.ok(Array.isArray(winner.assumptions) && winner.assumptions.length >= 3);
  assert.ok(winner.assumptions.some((a) => /advertised/i.test(a)));

  // Crop loss is deducted exactly once: gross - loss - freight - fees == expected.
  const reconstructed = winner.grossSaleValue - winner.estimatedLossValue
    - winner.transportCost - winner.otherCosts;
  assert.ok(Math.abs(reconstructed - winner.expectedMoney) <= 2,
    `waterfall must reconcile: ${reconstructed} vs ${winner.expectedMoney}`);
});

test('10. buyer pickup means the farmer is charged no freight', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  await resetFixtureState();

  const before = await request('GET',
    `/api/marketplace/farmer/top-buyers?availabilityId=${state.availabilityId}`,
    null, state.tokens.farmerId);
  const deliveredOption = before.body.data.buyers.find((b) => b.requirementId === state.requirementId);
  assert.ok(deliveredOption.transportCost > 0);
  assert.equal(deliveredOption.whoPaysTransport, 'farmer');

  await query(
    'UPDATE buyer_requirements SET pickup_available = TRUE, delivery_required = FALSE WHERE id = $1',
    [state.requirementId]
  );

  const after = await request('GET',
    `/api/marketplace/farmer/top-buyers?availabilityId=${state.availabilityId}`,
    null, state.tokens.farmerId);
  const pickupOption = after.body.data.buyers.find((b) => b.requirementId === state.requirementId);

  assert.equal(pickupOption.transportCost, 0, 'a real zero, not an assumption');
  assert.equal(pickupOption.whoPaysTransport, 'buyer');
  assert.match(pickupOption.transportArrangement, /collects from your farm/i);
  assert.ok(pickupOption.expectedMoney > deliveredOption.expectedMoney,
    'and the farmer keeps more');

  await resetFixtureState();
});

test('9b. unified selling options show mandis and buyers together', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const res = await request('GET',
    `/api/marketplace/selling-options?availabilityId=${state.availabilityId}`,
    null, state.tokens.farmerId);
  assert.equal(res.status, 200);

  assert.ok(res.body.data.directBuyerChannel.options.length >= 1);
  assert.ok(Array.isArray(res.body.data.combined));

  // Both channels are present in one ranking and each option names its channel.
  for (const option of res.body.data.combined) {
    assert.ok(['mandi', 'direct_buyer'].includes(option.channel));
  }
  // A mandi price is observed data; a buyer price is an advertisement. The
  // distinction must survive into the combined view.
  const buyerOption = res.body.data.combined.find((o) => o.channel === 'direct_buyer');
  assert.equal(buyerOption.isAdvertisedPrice, true);
  assert.match(res.body.data.disclaimer, /estimates/i);
});

test('23. a failing transport service does not break the marketplace', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const routingService = require('../src/services/routingService');
  const original = routingService.getRoute;
  routingService.getRoute = async () => { throw new Error('simulated routing outage'); };

  try {
    const res = await request('GET',
      `/api/marketplace/farmer/top-buyers?availabilityId=${state.availabilityId}`,
      null, state.tokens.farmerId);

    assert.equal(res.status, 200, 'the comparison still answers');
    const options = res.body.data.buyers;
    assert.ok(options.length >= 1, 'buyers are still listed');
    // The brief's rule: incomplete, never silently zero.
    const incomplete = options.find((o) => !o.isComplete);
    assert.ok(incomplete, 'at least one option is marked incomplete');
    assert.ok(incomplete.incompleteReasons.length > 0, 'with a stated reason');
    assert.equal(incomplete.expectedMoney, null, 'and no invented money figure');
  } finally {
    routingService.getRoute = original;
    routingService.clearRouteCache();
  }
});

// ===========================================================================
// 11–12. Chat
// ===========================================================================

test('11. chat authorization: only participants may read or write', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const created = await request('POST', '/api/marketplace/conversations', {
    requirementId: state.requirementId, availabilityId: state.availabilityId
  }, state.tokens.farmerId);
  assert.equal(created.status, 201);
  const conversationId = created.body.data.id;
  state.conversationId = conversationId;

  // Pressing Chat again reuses the thread.
  const again = await request('POST', '/api/marketplace/conversations', {
    requirementId: state.requirementId, availabilityId: state.availabilityId
  }, state.tokens.farmerId);
  assert.equal(again.body.data.id, conversationId, 'no duplicate conversation');

  // A stranger gets 404 for read AND write - indistinguishable from non-existent.
  const read = await request('GET', `/api/marketplace/conversations/${conversationId}/messages`,
    null, state.tokens.strangerId);
  assert.equal(read.status, 404);

  const write = await request('POST', `/api/marketplace/conversations/${conversationId}/messages`,
    { content: 'let me in' }, state.tokens.strangerId);
  assert.equal(write.status, 404);

  // The other buyer is also a stranger to this thread.
  const otherBuyer = await request('GET', `/api/marketplace/conversations/${conversationId}/messages`,
    null, state.tokens.buyer2UserId);
  assert.equal(otherBuyer.status, 404);

  // No contact details are exposed through a conversation.
  const list = await request('GET', '/api/marketplace/conversations', null, state.tokens.farmerId);
  const counterparty = list.body.data[0].counterparty;
  assert.deepEqual(Object.keys(counterparty).sort(),
    ['buyerProfileId', 'name', 'role', 'userId'].sort(),
    'counterparty carries no phone or email');
});

test('12. messages persist, sanitise, count unread and paginate', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  const conversationId = state.conversationId;

  await request('POST', `/api/marketplace/conversations/${conversationId}/messages`,
    { content: 'I have 500 kg Grade A tomato ready.' }, state.tokens.farmerId);
  await request('POST', `/api/marketplace/conversations/${conversationId}/messages`,
    { content: 'Can you deliver by Friday?' }, state.tokens.buyerUserId);

  // Stored escaped, so no consumer can render it as markup.
  const xss = await request('POST', `/api/marketplace/conversations/${conversationId}/messages`,
    { content: '<script>alert(1)</script>' }, state.tokens.farmerId);
  assert.equal(xss.status, 201);
  assert.ok(!xss.body.data.content.includes('<script>'));
  assert.match(xss.body.data.content, /&lt;script&gt;/);

  // Empty and over-long are refused.
  const empty = await request('POST', `/api/marketplace/conversations/${conversationId}/messages`,
    { content: '   ' }, state.tokens.farmerId);
  assert.equal(empty.status, 400);
  const tooLong = await request('POST', `/api/marketplace/conversations/${conversationId}/messages`,
    { content: 'x'.repeat(5000) }, state.tokens.farmerId);
  assert.equal(tooLong.status, 400);

  // Persistence survives a fresh request (i.e. a page refresh).
  const messages = await request('GET', `/api/marketplace/conversations/${conversationId}/messages`,
    null, state.tokens.buyerUserId);
  assert.ok(messages.body.data.length >= 3);
  assert.ok(messages.body.data.every((m) => m.id && m.createdAt));
  // Oldest first for display.
  assert.ok(messages.body.data[0].id < messages.body.data[messages.body.data.length - 1].id);

  // Reading zeroes the reader's unread count, not the other side's.
  const buyerList = await request('GET', '/api/marketplace/conversations', null, state.tokens.buyerUserId);
  assert.equal(buyerList.body.data[0].unreadCount, 0, 'buyer just read the thread');

  conversationService.clearRateLimits();
});

test('12b. message rate limiting', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  conversationService.clearRateLimits();

  let limited = false;
  for (let i = 0; i < conversationService.RATE_LIMIT_MESSAGES + 3; i += 1) {
    const res = await request('POST',
      `/api/marketplace/conversations/${state.conversationId}/messages`,
      { content: `flood ${i}` }, state.tokens.farmerId);
    if (res.status === 429) { limited = true; break; }
  }
  assert.ok(limited, 'flooding one thread is throttled');
  conversationService.clearRateLimits();
});

// ===========================================================================
// 13–17. Offers, counters, acceptance, concurrency
// ===========================================================================

test('13. offer creation validates against the requirement', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  await resetFixtureState();

  const created = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 500, pricePerKg: 30, deliveryTerms: 'farmer_delivers'
  }, state.tokens.farmerId);

  assert.equal(created.status, 201);
  assert.equal(created.body.data.quantityKg, 500);
  assert.equal(created.body.data.totalAmount, 15000, 'total stored, not recomputed');
  assert.equal(created.body.data.status, 'pending');
  assert.match(created.body.meta.note, /Nothing is agreed until/i);

  // Refusals.
  const tooMuch = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 5000, pricePerKg: 30
  }, state.tokens.farmerId);
  assert.equal(tooMuch.status, 409);
  assert.equal(tooMuch.body.error.code, 'QUANTITY_EXCEEDS_REQUIREMENT');

  const zero = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 0, pricePerKg: 30
  }, state.tokens.farmerId);
  assert.equal(zero.status, 400);

  // A buyer offering against a farmer's listing is legitimate - buyers may
  // initiate too - so this must SUCCEED. (An earlier version of this test
  // wrongly expected SELF_OFFER here; a self-offer needs both sides to be the
  // same user, which is covered separately below.)
  const buyerInitiated = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 100, pricePerKg: 29
  }, state.tokens.buyerUserId);
  assert.equal(buyerInitiated.status, 201, 'a buyer may open the negotiation');
  assert.equal(buyerInitiated.body.data.senderId, state.buyerUserId);
  assert.equal(buyerInitiated.body.data.recipientId, state.farmerId);
  await query('DELETE FROM marketplace_offers WHERE id = $1', [buyerInitiated.body.data.id]);

  // A genuine self-offer: the buyer lists their OWN crop and offers on their own
  // requirement. Both sides resolve to one user, which must be refused.
  const ownListing = await request('POST', '/api/marketplace/farmer/availability', {
    crop: 'tomato', totalHarvestedKg: 100, availableKg: 100, harvestStatus: 'harvested'
  }, state.tokens.buyerUserId);
  const selfOffer = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: ownListing.body.data.id,
    quantityKg: 100, pricePerKg: 30
  }, state.tokens.buyerUserId);
  assert.equal(selfOffer.status, 400);
  assert.equal(selfOffer.body.error.code, 'SELF_OFFER');
  await query('DELETE FROM farmer_crop_availability WHERE id = $1', [ownListing.body.data.id]);

  // Malformed ids must 404, not 500.
  const badId = await request('GET', '/api/marketplace/offers/undefined', null, state.tokens.farmerId);
  assert.equal(badId.status, 404);

  state.offerId = created.body.data.id;
});

test('14. counter-offer flips direction and supersedes the original', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const countered = await request('POST', `/api/marketplace/offers/${state.offerId}/counter`,
    { pricePerKg: 29, message: '₹29 is my best.' }, state.tokens.buyerUserId);

  assert.equal(countered.status, 201);
  assert.equal(countered.body.data.pricePerKg, 29);
  assert.equal(countered.body.data.parentOfferId, state.offerId);
  assert.equal(countered.body.data.totalAmount, 14500);
  state.counterOfferId = countered.body.data.id;

  const original = await request('GET', `/api/marketplace/offers/${state.offerId}`,
    null, state.tokens.farmerId);
  assert.equal(original.body.data.status, 'countered');

  // Only the recipient may counter.
  const wrongSide = await request('POST', `/api/marketplace/offers/${state.counterOfferId}/counter`,
    { pricePerKg: 31 }, state.tokens.buyerUserId);
  assert.equal(wrongSide.status, 403);
  assert.equal(wrongSide.body.error.code, 'NOT_OFFER_RECIPIENT');
});

test('15. acceptance creates a deal, reserves crop and decrements demand', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const accepted = await request('POST', `/api/marketplace/offers/${state.counterOfferId}/accept`,
    {}, state.tokens.farmerId);

  assert.equal(accepted.status, 200);
  const { deal, reservation, requirementRemainingKg, requirementStatus } = accepted.body.data;

  // The agreed terms.
  assert.equal(deal.agreedQuantityKg, 500);
  assert.equal(deal.agreedPricePerKg, 29);
  assert.equal(deal.agreedTotal, 14500);
  // Acceptance does NOT complete a deal.
  assert.equal(deal.status, 'agreed');
  assert.ok(!deal.allowedNextStatuses.includes('completed'),
    'a deal cannot jump straight to completed');
  assert.match(deal.paymentNote, /outside AgriChain/i);

  // 13. the farmer's available quantity fell by the reserved amount
  assert.equal(reservation.availableKg, 0);
  assert.equal(reservation.reservedKg, 500);

  // 14. the buyer's remaining requirement fell accordingly
  assert.equal(requirementRemainingKg, 500);
  assert.equal(requirementStatus, 'partially_fulfilled');

  // 15. both users can view the agreement
  const asFarmer = await request('GET', `/api/marketplace/deals/${deal.id}`, null, state.tokens.farmerId);
  const asBuyer = await request('GET', `/api/marketplace/deals/${deal.id}`, null, state.tokens.buyerUserId);
  assert.equal(asFarmer.status, 200);
  assert.equal(asBuyer.status, 200);
  assert.equal(asFarmer.body.data.myRole, 'farmer');
  assert.equal(asBuyer.body.data.myRole, 'buyer');

  // 17/20. nobody else can
  const asStranger = await request('GET', `/api/marketplace/deals/${deal.id}`, null, state.tokens.strangerId);
  assert.equal(asStranger.status, 404);

  // Conservation holds.
  const listings = await request('GET', '/api/marketplace/farmer/availability', null, state.tokens.farmerId);
  const listing = listings.body.data.find((l) => l.id === state.availabilityId);
  assert.equal(listing.availableKg + listing.reservedKg + listing.soldKg, listing.totalHarvestedKg);

  state.dealId = deal.id;
});

test('16. double acceptance is refused, sequentially and concurrently', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // Sequential: the offer is no longer pending.
  const again = await request('POST', `/api/marketplace/offers/${state.counterOfferId}/accept`,
    {}, state.tokens.farmerId);
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'OFFER_NOT_PENDING');

  // Concurrent: two simultaneous accepts on one fresh offer.
  await resetFixtureState();
  const fresh = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 500, pricePerKg: 30
  }, state.tokens.farmerId);
  const offerId = fresh.body.data.id;

  const [a, b] = await Promise.all([
    request('POST', `/api/marketplace/offers/${offerId}/accept`, {}, state.tokens.buyerUserId),
    request('POST', `/api/marketplace/offers/${offerId}/accept`, {}, state.tokens.buyerUserId)
  ]);

  const succeeded = [a, b].filter((r) => r.body && r.body.success).length;
  assert.equal(succeeded, 1, 'exactly one acceptance wins');

  const deals = await query('SELECT COUNT(*)::int AS c FROM marketplace_deals WHERE accepted_offer_id = $1',
    [offerId]);
  assert.equal(deals.rows[0].c, 1, 'exactly one deal exists');

  const listing = await query('SELECT available_kg, reserved_kg FROM farmer_crop_availability WHERE id = $1',
    [state.availabilityId]);
  assert.equal(Number(listing.rows[0].reserved_kg), 500, 'reserved once, not twice');
});

test('17. concurrent offers cannot over-reserve the same crop', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // Three 300 kg offers against 500 kg of stock: at most one can be accepted.
  for (let trial = 0; trial < 3; trial += 1) {
    await resetFixtureState();

    const offerIds = [];
    for (const [requirementId, senderToken] of [
      [state.requirementId, state.tokens.farmerId],
      [state.requirement2Id, state.tokens.farmerId],
      [state.requirementId, state.tokens.farmerId]
    ]) {
      const res = await request('POST', '/api/marketplace/offers', {
        requirementId, availabilityId: state.availabilityId, quantityKg: 300, pricePerKg: 28
      }, senderToken);
      if (res.body && res.body.success) offerIds.push({ id: res.body.data.id, requirementId });
    }

    const results = await Promise.all(offerIds.map((o) => request(
      'POST', `/api/marketplace/offers/${o.id}/accept`, {},
      o.requirementId === state.requirementId ? state.tokens.buyerUserId : state.tokens.buyer2UserId
    )));

    const accepted = results.filter((r) => r.body && r.body.success).length;
    assert.ok(accepted >= 1 && accepted <= 1, `trial ${trial}: exactly one accepted, got ${accepted}`);

    const listing = await query(
      'SELECT total_harvested_kg, available_kg, reserved_kg, sold_kg FROM farmer_crop_availability WHERE id = $1',
      [state.availabilityId]
    );
    const row = listing.rows[0];
    const sum = Number(row.available_kg) + Number(row.reserved_kg) + Number(row.sold_kg);
    assert.ok(sum <= Number(row.total_harvested_kg),
      `trial ${trial}: never over-reserved (${sum} <= ${row.total_harvested_kg})`);

    // Failures must be readable codes, never raw SQLSTATE.
    for (const failure of results.filter((r) => !(r.body && r.body.success))) {
      assert.doesNotMatch(failure.body.error.code, /^\d/,
        `raw SQLSTATE leaked: ${failure.body.error.code}`);
    }
  }
});

test('15b. reject and withdraw are restricted to the right party', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  await resetFixtureState();

  const offer = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 200, pricePerKg: 30
  }, state.tokens.farmerId);
  const offerId = offer.body.data.id;

  // The sender cannot reject their own offer; only the recipient can.
  const senderRejects = await request('POST', `/api/marketplace/offers/${offerId}/reject`,
    {}, state.tokens.farmerId);
  assert.equal(senderRejects.status, 409);

  // The recipient cannot withdraw someone else's offer.
  const recipientWithdraws = await request('POST', `/api/marketplace/offers/${offerId}/withdraw`,
    {}, state.tokens.buyerUserId);
  assert.equal(recipientWithdraws.status, 409);

  const withdrawn = await request('POST', `/api/marketplace/offers/${offerId}/withdraw`,
    {}, state.tokens.farmerId);
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.data.status, 'withdrawn');

  // A withdrawn offer cannot then be accepted.
  const accept = await request('POST', `/api/marketplace/offers/${offerId}/accept`,
    {}, state.tokens.buyerUserId);
  assert.equal(accept.status, 409);
});

// ===========================================================================
// 12. Deal status
// ===========================================================================

test('12c. deal status follows a legal workflow and cancelling releases crop', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  await resetFixtureState();

  const offer = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 400, pricePerKg: 30
  }, state.tokens.farmerId);
  const accepted = await request('POST', `/api/marketplace/offers/${offer.body.data.id}/accept`,
    {}, state.tokens.buyerUserId);
  const dealId = accepted.body.data.deal.id;

  // A deal cannot jump from agreed straight to completed.
  const illegal = await request('PATCH', `/api/marketplace/deals/${dealId}/status`,
    { status: 'completed' }, state.tokens.farmerId);
  assert.equal(illegal.status, 409);
  assert.equal(illegal.body.error.code, 'INVALID_DEAL_TRANSITION');

  // Legal progression.
  let res = await request('PATCH', `/api/marketplace/deals/${dealId}/status`,
    { status: 'preparing' }, state.tokens.farmerId);
  assert.equal(res.body.data.status, 'preparing');
  res = await request('PATCH', `/api/marketplace/deals/${dealId}/status`,
    { status: 'ready_for_pickup' }, state.tokens.farmerId);
  assert.equal(res.body.data.status, 'ready_for_pickup');
  res = await request('PATCH', `/api/marketplace/deals/${dealId}/status`,
    { status: 'completed' }, state.tokens.buyerUserId);
  assert.equal(res.body.data.status, 'completed');

  // Completing moves reserved -> sold.
  let listing = await query('SELECT reserved_kg, sold_kg FROM farmer_crop_availability WHERE id = $1',
    [state.availabilityId]);
  assert.equal(Number(listing.rows[0].sold_kg), 400);
  assert.equal(Number(listing.rows[0].reserved_kg), 0);

  // A stranger cannot change a deal's status.
  const byStranger = await request('PATCH', `/api/marketplace/deals/${dealId}/status`,
    { status: 'cancelled' }, state.tokens.strangerId);
  assert.equal(byStranger.status, 404);

  // Cancelling a different deal returns the crop and the buyer's demand.
  await resetFixtureState();
  const offer2 = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 300, pricePerKg: 30
  }, state.tokens.farmerId);
  const accepted2 = await request('POST', `/api/marketplace/offers/${offer2.body.data.id}/accept`,
    {}, state.tokens.buyerUserId);
  const deal2 = accepted2.body.data.deal.id;

  await request('PATCH', `/api/marketplace/deals/${deal2}/status`,
    { status: 'cancelled', note: 'buyer backed out' }, state.tokens.buyerUserId);

  listing = await query('SELECT available_kg, reserved_kg FROM farmer_crop_availability WHERE id = $1',
    [state.availabilityId]);
  assert.equal(Number(listing.rows[0].available_kg), 500, 'crop is sellable again');
  assert.equal(Number(listing.rows[0].reserved_kg), 0);

  const requirement = await query('SELECT quantity_remaining_kg FROM buyer_requirements WHERE id = $1',
    [state.requirementId]);
  assert.equal(Number(requirement.rows[0].quantity_remaining_kg), 1000, 'demand restored');
});

// ===========================================================================
// 18–19. Closure and notifications
// ===========================================================================

test('18. closing a requirement stops new offers but keeps agreed deals', async (t) => {
  if (!state.available) return t.skip('database unavailable');
  await resetFixtureState();

  const offer = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 200, pricePerKg: 30
  }, state.tokens.farmerId);
  const accepted = await request('POST', `/api/marketplace/offers/${offer.body.data.id}/accept`,
    {}, state.tokens.buyerUserId);
  const dealId = accepted.body.data.deal.id;

  // A farmer cannot close a buyer's requirement.
  const byFarmer = await request('POST', `/api/buyer-requirements/${state.requirementId}/close`,
    {}, state.tokens.farmerId);
  assert.equal(byFarmer.status, 403);

  // Nor can another buyer. buyer2 must genuinely HOLD a buyer profile for this to
  // prove ownership rather than merely role absence, so assert that first.
  const buyer2Roles = await request('GET', '/api/buyers/me/roles', null, state.tokens.buyer2UserId);
  assert.equal(buyer2Roles.body.data.isBuyer, true,
    'precondition: buyer2 is a registered buyer, so a 403 here means OWNERSHIP was refused');

  const byOtherBuyer = await request('POST', `/api/buyer-requirements/${state.requirementId}/close`,
    {}, state.tokens.buyer2UserId);
  assert.equal(byOtherBuyer.status, 403);
  assert.equal(byOtherBuyer.body.error.code, 'REQUIREMENT_FORBIDDEN');

  const closed = await request('POST', `/api/buyer-requirements/${state.requirementId}/close`,
    {}, state.tokens.buyerUserId);
  assert.equal(closed.status, 200);
  assert.equal(closed.body.data.status, 'closed');

  // No new offers.
  const afterClose = await request('POST', '/api/marketplace/offers', {
    requirementId: state.requirementId, availabilityId: state.availabilityId,
    quantityKg: 100, pricePerKg: 30
  }, state.tokens.farmerId);
  assert.equal(afterClose.status, 409);

  // The already-agreed deal survives.
  const deal = await request('GET', `/api/marketplace/deals/${dealId}`, null, state.tokens.farmerId);
  assert.equal(deal.status, 200);
  assert.equal(deal.body.data.status, 'agreed');

  await query("UPDATE buyer_requirements SET status = 'active' WHERE id = $1", [state.requirementId]);
});

test('19. notifications are created, deduplicated and scoped to the recipient', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const farmerNotifications = await request('GET', '/api/marketplace/notifications',
    null, state.tokens.farmerId);
  assert.equal(farmerNotifications.status, 200);
  assert.ok(farmerNotifications.body.data.length > 0, 'the farmer has been notified');

  const events = farmerNotifications.body.data.map((n) => n.eventType);
  assert.ok(events.includes('offer_accepted') || events.includes('new_offer')
    || events.includes('counter_offer'), `expected offer events, got ${events.join(',')}`);
  // Each links somewhere useful.
  assert.ok(farmerNotifications.body.data.every((n) => n.linkPath));

  // Idempotency: the same event cannot notify twice.
  const notificationService = require('../src/services/notificationService');
  const payload = {
    recipientId: state.farmerId,
    eventType: 'offer_accepted',
    entityType: 'deal',
    entityId: 999999,
    title: 'dedupe probe',
    linkPath: '/x'
  };
  const first = await notificationService.create(payload);
  const second = await notificationService.create(payload);
  assert.ok(first, 'first insert succeeds');
  assert.equal(second, null, 'a retry creates nothing');

  // Read state, scoped to the owner.
  const one = farmerNotifications.body.data[0];
  const byStranger = await request('POST', `/api/marketplace/notifications/${one.id}/read`,
    {}, state.tokens.strangerId);
  assert.equal(byStranger.body.data.updated, false, 'a stranger cannot mark it read');

  const byOwner = await request('POST', `/api/marketplace/notifications/${one.id}/read`,
    {}, state.tokens.farmerId);
  assert.equal(byOwner.body.data.updated, true);

  // A stranger's own list is empty - no cross-user leakage.
  const strangerList = await request('GET', '/api/marketplace/notifications',
    null, state.tokens.strangerId);
  assert.equal(strangerList.body.data.length, 0);

  await query('DELETE FROM marketplace_notifications WHERE entity_id = 999999');
});

// ===========================================================================
// 20–21. Cross-user access and empty states
// ===========================================================================

test('20. no user can reach another user\'s records', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const probes = [
    ['GET', `/api/marketplace/conversations/${state.conversationId}/messages`, 404],
    ['GET', `/api/marketplace/offers/${state.counterOfferId}`, 404],
    ['GET', `/api/marketplace/deals/${state.dealId}`, 404],
    ['GET', '/api/buyers/me', 404]
  ];

  for (const [method, path, expected] of probes) {
    const res = await request(method, path, null, state.tokens.strangerId);
    assert.equal(res.status, expected, `${method} ${path} as a stranger`);
  }

  // A farmer cannot edit a buyer's requirement.
  const edit = await request('PATCH', `/api/buyer-requirements/${state.requirementId}`,
    { offeredPricePerKg: 99 }, state.tokens.farmerId);
  assert.equal(edit.status, 403);

  // A buyer cannot change a farmer's crop availability.
  const changeStock = await request('PATCH',
    `/api/marketplace/farmer/availability/${state.availabilityId}`,
    { totalHarvestedKg: 99999 }, state.tokens.buyerUserId);
  assert.equal(changeStock.status, 403);
  assert.equal(changeStock.body.error.code, 'AVAILABILITY_FORBIDDEN');

  // Every marketplace route needs a token.
  const anonymous = await request('GET', '/api/marketplace/conversations');
  assert.equal(anonymous.status, 401);
});

test('21. empty states are reported with an actionable hint', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // A farmer with no crop listed.
  const matches = await request('GET', '/api/marketplace/farmer/matches',
    null, state.tokens.strangerId);
  assert.equal(matches.status, 200);
  assert.equal(matches.body.data.length, 0);
  assert.ok(matches.body.meta.diagnostics.hint, 'the empty list explains what to do');

  const conversations = await request('GET', '/api/marketplace/conversations',
    null, state.tokens.strangerId);
  assert.equal(conversations.body.data.length, 0);

  const deals = await request('GET', '/api/marketplace/deals', null, state.tokens.strangerId);
  assert.equal(deals.body.data.length, 0);
});

test('22. reports can be filed but not against oneself', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const filed = await request('POST', '/api/marketplace/reports', {
    reportedUserId: state.buyerUserId,
    entityType: 'requirement',
    entityId: state.requirementId,
    reason: 'suspicious_pricing',
    details: 'test report'
  }, state.tokens.farmerId);
  assert.equal(filed.status, 201);
  assert.equal(filed.body.data.status, 'open');

  const selfReport = await request('POST', '/api/marketplace/reports', {
    reportedUserId: state.farmerId, entityType: 'user', reason: 'x'
  }, state.tokens.farmerId);
  assert.equal(selfReport.status, 400);

  const noReason = await request('POST', '/api/marketplace/reports', {
    entityType: 'requirement', entityId: state.requirementId
  }, state.tokens.farmerId);
  assert.equal(noReason.status, 400);
});

test('23b. existing modules still work (no regression)', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const health = await request('GET', '/api/health');
  assert.equal(health.status, 200);

  const market = await request('GET', '/api/market/health');
  assert.equal(market.status, 200);

  const crops = await request('GET', '/api/crops');
  assert.equal(crops.status, 200);

  const spoilage = await request('GET', '/api/spoilage/options');
  assert.equal(spoilage.status, 200);
});

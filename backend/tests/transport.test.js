/**
 * Transporter discovery tests.
 *
 * Google Places is stubbed at the module boundary, so these run offline, cost
 * nothing, and need no API key. What they actually guard is the honesty of the
 * feature: that nothing Google did not say is ever put into a transporter record,
 * that availability and price are never asserted, and that a Google outage cannot
 * take the market recommendation down with it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GOOGLE_MAPS_API_KEY = 'test-key-not-real';
process.env.TRANSPORT_SEARCH_ENABLED = 'true';
process.env.ROUTING_PROVIDER = 'none'; // deterministic distances, no network

const googlePlaces = require('../src/services/googlePlacesService');
const transportService = require('../src/services/transportService');

/** Nagpur APMC, as the recommendation engine would hand it over. */
const MARKET = {
  id: 1,
  marketCode: 'nagpur',
  name: 'Nagpur APMC (Kalamna)',
  district: 'Nagpur',
  latitude: 21.15,
  longitude: 79.12
};

const FARM = { id: 39, name: 'Test Farm', latitude: 21.0046, longitude: 79.0477 };

/** A Text Search hit, in Places API (New) shape. */
const searchHit = (id, name, lat = 21.16, lng = 79.13, extra = {}) => ({
  id,
  displayName: { text: name },
  formattedAddress: `${name} Road, Nagpur, Maharashtra`,
  location: { latitude: lat, longitude: lng },
  primaryType: 'moving_company',
  types: ['moving_company', 'point_of_interest'],
  ...extra
});

/** A Place Details response, in Places API (New) shape. */
const detailHit = (id, name, overrides = {}) => ({
  id,
  displayName: { text: name },
  formattedAddress: `${name} Road, Nagpur, Maharashtra`,
  location: { latitude: 21.16, longitude: 79.13 },
  nationalPhoneNumber: '098765 43210',
  internationalPhoneNumber: '+91 98765 43210',
  websiteUri: 'https://example.com',
  rating: 4.2,
  userRatingCount: 37,
  businessStatus: 'OPERATIONAL',
  ...overrides
});

/**
 * Replaces the Google client for one test and restores it afterwards.
 * @param {object} stubs - { textSearch, placeDetailsBatch, placeDetails }
 * @param {Function} fn
 */
const withGoogleStub = async (stubs, fn) => {
  const original = {
    textSearch: googlePlaces.textSearch,
    placeDetails: googlePlaces.placeDetails,
    placeDetailsBatch: googlePlaces.placeDetailsBatch
  };
  Object.assign(googlePlaces, stubs);
  transportService.clearTransportCache();
  try {
    return await fn();
  } finally {
    Object.assign(googlePlaces, original);
    transportService.clearTransportCache();
  }
};

// ---------------------------------------------------------------------------
// Relevance filtering
// ---------------------------------------------------------------------------

test('transport: goods carriers are recognised as relevant', () => {
  const names = [
    'Raj Transport Services', 'Maharashtra Roadways', 'Shree Balaji Road Lines',
    'ABC Logistics', 'Nagpur Goods Carrier', 'Tempo Transport Co',
    'XYZ Freight Movers', 'Deccan Cargo', 'Mini Truck Transport'
  ];
  for (const name of names) {
    assert.equal(
      transportService.isRelevantTransporter({ displayName: { text: name } }),
      true,
      `${name} should be relevant`
    );
  }
});

test('transport: passenger and unrelated businesses are excluded', () => {
  // The exact trap: a farmer searching for a goods tempo must not be shown a
  // tourist minibus operator or a car showroom.
  const names = [
    'Sharma Travels', 'Patil Tours and Travels', 'City Taxi Service',
    'Nagpur Bus Service', 'Quick Car Rental', 'Speed Driving School',
    'Tata Motors Showroom', 'HP Petrol Pump'
  ];
  for (const name of names) {
    assert.equal(
      transportService.isRelevantTransporter({ displayName: { text: name } }),
      false,
      `${name} should be excluded`
    );
  }
});

test('transport: an excluded term beats a relevant one', () => {
  // "Tempo Travellers" contains "tempo" but is passenger hire.
  assert.equal(
    transportService.isRelevantTransporter({ displayName: { text: 'Shree Tempo Travellers' } }),
    false
  );
});

test('transport: a relevant Google type rescues an uninformative name', () => {
  assert.equal(
    transportService.isRelevantTransporter({
      displayName: { text: 'Shree Balaji & Sons' },
      primaryType: 'trucking_company',
      types: ['trucking_company']
    }),
    true
  );
});

test('transport: a closed business is never offered', () => {
  assert.equal(
    transportService.isRelevantTransporter({
      displayName: { text: 'Old Transport Co' },
      businessStatus: 'CLOSED_PERMANENTLY'
    }),
    false
  );
});

test('transport: a nameless place is rejected rather than shown blank', () => {
  assert.equal(transportService.isRelevantTransporter({}), false);
  assert.equal(transportService.isRelevantTransporter({ displayName: { text: '' } }), false);
});

// ---------------------------------------------------------------------------
// Normalisation — the honesty guarantees
// ---------------------------------------------------------------------------

test('transport: a Google place maps onto the transporter contract', () => {
  const tripCost = {
    totalCost: 875, distanceKm: 35,
    vehicle: { label: 'Tempo', ratePerKm: 18 }
  };
  const t = transportService.normaliseTransporter(
    detailHit('place-1', 'ABC Transport Services'), MARKET, tripCost
  );

  assert.equal(t.placeId, 'place-1');
  assert.equal(t.name, 'ABC Transport Services');
  assert.match(t.address, /Nagpur/);
  assert.equal(t.phone, '098765 43210');
  assert.equal(t.website, 'https://example.com');
  assert.equal(t.rating, 4.2);
  assert.equal(t.userRatingCount, 37);
  assert.equal(t.source, 'google_places');
  assert.ok(t.distanceFromMarketKm >= 0);
  assert.equal(t.distanceBasis, 'STRAIGHT_LINE', 'proximity is straight-line and says so');
});

test('transport: availability is NEVER asserted from a Google result', () => {
  // Google Places publishes no vehicle-availability feed. Claiming "vehicle
  // available" would send a farmer on a wasted trip.
  const t = transportService.normaliseTransporter(
    detailHit('place-1', 'ABC Transport'), MARKET, null
  );
  assert.equal(t.availability, 'contact_to_confirm');
  assert.match(t.availabilityNote, /confirm availability/i);
});

test('transport: a transporter never carries a quoted price', () => {
  const tripCost = {
    totalCost: 875, distanceKm: 35, vehicle: { label: 'Tempo', ratePerKm: 18 }
  };
  const t = transportService.normaliseTransporter(
    detailHit('place-1', 'ABC Transport'), MARKET, tripCost
  );
  // Google gave us no price, so the business quoted nothing...
  assert.equal(t.quotedPrice, null);
  // ...while OUR estimate is present and attributed to us.
  assert.equal(t.estimatedTripCost, 875);
  assert.match(t.estimatedTripCostBasis, /AgriChain rate estimate/);
});

test('transport: vehicle details are never inferred from a business category', () => {
  // A Google category of "transport" says nothing about which vehicle this
  // operator owns, so no vehicle is claimed.
  const t = transportService.normaliseTransporter(
    detailHit('place-1', 'ABC Transport'), MARKET, null
  );
  assert.equal(t.vehicleType, null);
  assert.equal(t.vehicleCapacityKg, null);
  assert.equal(t.serviceLabel, 'Transport service');
});

test('transport: a missing phone stays null rather than being invented', () => {
  const t = transportService.normaliseTransporter(
    detailHit('p', 'No Phone Transport', {
      nationalPhoneNumber: undefined, internationalPhoneNumber: undefined
    }),
    MARKET, null
  );
  assert.equal(t.phone, null, 'the UI renders "Phone number not listed" from this');
});

test('transport: a missing website stays null', () => {
  const t = transportService.normaliseTransporter(
    detailHit('p', 'No Web Transport', { websiteUri: undefined }), MARKET, null
  );
  assert.equal(t.website, null);
});

test('transport: a missing rating stays null, never zero', () => {
  // Zero would render as a one-star business, which is a different claim.
  const t = transportService.normaliseTransporter(
    detailHit('p', 'Unrated Transport', { rating: undefined, userRatingCount: undefined }),
    MARKET, null
  );
  assert.equal(t.rating, null);
  assert.equal(t.userRatingCount, null);
});

test('transport: a place with no coordinates gets null distance, not zero', () => {
  const t = transportService.normaliseTransporter(
    detailHit('p', 'Locationless Transport', { location: undefined }), MARKET, null
  );
  assert.equal(t.distanceFromMarketKm, null);
});

test('transport: a nameless detail record gets a placeholder, not undefined', () => {
  const t = transportService.normaliseTransporter(
    detailHit('p', 'x', { displayName: undefined }), MARKET, null
  );
  assert.ok(t.name && t.name.length > 0);
});

// ---------------------------------------------------------------------------
// The search flow
// ---------------------------------------------------------------------------

test('transport: a valid market returns ranked transporters', async () => {
  await withGoogleStub(
    {
      textSearch: async () => [
        searchHit('p1', 'Far Transport', 21.30, 79.30),
        searchHit('p2', 'Near Transport', 21.155, 79.125)
      ],
      placeDetailsBatch: async (ids) => ({
        details: ids.map((id) => detailHit(
          id,
          id === 'p1' ? 'Far Transport' : 'Near Transport',
          {
            location: id === 'p1'
              ? { latitude: 21.30, longitude: 79.30 }
              : { latitude: 21.155, longitude: 79.125 }
          }
        )),
        failures: 0
      })
    },
    async () => {
      const result = await transportService.findTransporters({
        marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500
      });

      assert.equal(result.available, true);
      assert.equal(result.transporters.length, 2);
      assert.equal(result.market.name, MARKET.name);
      // Nearest to the mandi first — that is what "local to this yard" means.
      assert.equal(result.transporters[0].name, 'Near Transport');
      assert.ok(
        result.transporters[0].distanceFromMarketKm < result.transporters[1].distanceFromMarketKm
      );
      // Google attribution must accompany displayed Places content.
      assert.ok(result.attribution, 'Places content requires attribution');
      assert.match(result.disclaimer, /estimate/i);
    }
  );
});

test('transport: duplicate places across queries produce one card', async () => {
  // Four query templates run; the same business legitimately appears in several.
  await withGoogleStub(
    {
      textSearch: async () => [
        searchHit('same-id', 'Raj Transport'),
        searchHit('same-id', 'Raj Transport'),
        searchHit('other-id', 'Shree Transport')
      ],
      placeDetailsBatch: async (ids) => ({
        details: ids.map((id) => detailHit(id, id === 'same-id' ? 'Raj Transport' : 'Shree Transport')),
        failures: 0
      })
    },
    async () => {
      const result = await transportService.findTransporters({
        marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500
      });
      const ids = result.transporters.map((t) => t.placeId);
      assert.equal(new Set(ids).size, ids.length, 'no duplicate Place IDs');
      assert.equal(ids.length, 2);
    }
  );
});

test('transport: irrelevant Google results are filtered out of the response', async () => {
  await withGoogleStub(
    {
      textSearch: async () => [
        searchHit('good', 'Nagpur Goods Transport'),
        searchHit('bad1', 'Sharma Travels'),
        searchHit('bad2', 'City Taxi Service')
      ],
      placeDetailsBatch: async (ids) => ({
        details: ids.map((id) => detailHit(id, 'Nagpur Goods Transport')),
        failures: 0
      })
    },
    async () => {
      const result = await transportService.findTransporters({
        marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500
      });
      assert.equal(result.transporters.length, 1);
      assert.equal(result.transporters[0].name, 'Nagpur Goods Transport');
    }
  );
});

test('transport: the result list is capped', async () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    searchHit(`p${i}`, `Transport Co ${i}`, 21.15 + i * 0.001, 79.12));

  await withGoogleStub(
    {
      textSearch: async () => many,
      placeDetailsBatch: async (ids) => ({
        details: ids.map((id) => detailHit(id, `Transport Co ${id}`)),
        failures: 0
      })
    },
    async () => {
      const result = await transportService.findTransporters({
        marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500
      });
      // Detail lookups are billed, so both the lookup cap and the display cap
      // must hold.
      assert.ok(result.transporters.length <= 10, `got ${result.transporters.length}`);
      assert.ok(result.diagnostics.detailsFetched <= 10);
    }
  );
});

// ---------------------------------------------------------------------------
// Empty and error states — the recommendation must survive all of them
// ---------------------------------------------------------------------------

test('transport: no Google results gives an empty state, and the cost estimate survives', async () => {
  await withGoogleStub(
    { textSearch: async () => [], placeDetailsBatch: async () => ({ details: [], failures: 0 }) },
    async () => {
      const result = await transportService.findTransporters({
        marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500
      });
      assert.equal(result.available, true, 'an empty result set is not a failure');
      assert.equal(result.transporters.length, 0);
      assert.equal(result.reason, 'NO_RESULTS');
      assert.match(result.message, /No transport services found/i);
      // The whole point: the farmer still gets their cost.
      assert.ok(result.tripEstimate, 'the trip estimate does not depend on Google');
      assert.ok(result.tripEstimate.totalCost > 0);
    }
  );
});

test('transport: a Google outage never throws and never loses the estimate', async () => {
  for (const code of [
    googlePlaces.PLACES_ERROR.AUTH,
    googlePlaces.PLACES_ERROR.RATE_LIMITED,
    googlePlaces.PLACES_ERROR.TIMEOUT,
    googlePlaces.PLACES_ERROR.UNAVAILABLE,
    googlePlaces.PLACES_ERROR.UNKNOWN
  ]) {
    await withGoogleStub(
      {
        textSearch: async () => {
          const error = new Error('simulated Google failure');
          error.code = code;
          throw error;
        }
      },
      async () => {
        const result = await transportService.findTransporters({
          marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500
        });
        assert.equal(result.available, false, `${code} should report unavailable`);
        assert.equal(result.reason, code);
        assert.equal(result.transporters.length, 0);
        assert.ok(result.tripEstimate, `${code}: the estimate must survive`);
        assert.ok(result.tripEstimate.totalCost > 0);
        // The message must reassure, and must not leak Google's own wording.
        assert.match(result.message, /estimated transport cost is still available/i);
        assert.doesNotMatch(result.message, /api key|project|quota exceeded for/i);
      }
    );
  }
});

test('transport: a missing API key degrades cleanly instead of crashing', async () => {
  const saved = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  transportService.clearTransportCache();

  try {
    const result = await transportService.findTransporters({
      marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, 'PLACES_NOT_CONFIGURED');
    assert.match(result.message, /not configured/i);
    assert.ok(result.tripEstimate, 'the estimate works with no Google key at all');
  } finally {
    process.env.GOOGLE_MAPS_API_KEY = saved;
    transportService.clearTransportCache();
  }
});

test('transport: the feature can be switched off without removing the key', async () => {
  process.env.TRANSPORT_SEARCH_ENABLED = 'false';
  transportService.clearTransportCache();
  try {
    const result = await transportService.findTransporters({
      marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, 'TRANSPORT_SEARCH_DISABLED');
    assert.ok(result.tripEstimate);
  } finally {
    process.env.TRANSPORT_SEARCH_ENABLED = 'true';
    transportService.clearTransportCache();
  }
});

test('transport: an unknown market is an error, not an empty list', async () => {
  await assert.rejects(
    () => transportService.findTransporters({ marketId: 'atlantis', market: null }),
    (error) => error.code === 'MARKET_NOT_FOUND' || error.code === 'DATABASE_UNAVAILABLE'
  );
});

test('transport: a market with no coordinates is rejected explicitly', async () => {
  await assert.rejects(
    () => transportService.findTransporters({
      marketId: 'x',
      market: { ...MARKET, latitude: null, longitude: null }
    }),
    (error) => error.code === 'MISSING_MARKET_COORDINATES'
  );
});

test('transport: some Place Details failing still returns the rest', async () => {
  await withGoogleStub(
    {
      textSearch: async () => [
        searchHit('ok1', 'Good Transport'),
        searchHit('dead', 'Vanished Transport'),
        searchHit('ok2', 'Other Transport')
      ],
      placeDetailsBatch: async (ids) => ({
        // 'dead' disappeared between the search and the detail call.
        details: ids.filter((id) => id !== 'dead').map((id) => detailHit(id, 'Good Transport')),
        failures: 1
      })
    },
    async () => {
      const result = await transportService.findTransporters({
        marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500
      });
      assert.equal(result.available, true);
      assert.equal(result.transporters.length, 2);
      assert.equal(result.diagnostics.detailsFailed, 1);
    }
  );
});

// ---------------------------------------------------------------------------
// Trip cost — AgriChain's, not Google's
// ---------------------------------------------------------------------------

test('transport: the trip estimate matches the market engine for the same trip', async () => {
  // The transporter card and the net-return ledger must never disagree, so both
  // go through transportCostService on the same farm-to-mandi distance.
  const routingService = require('../src/services/routingService');
  const transportCostService = require('../src/services/transportCostService');

  const estimate = await transportService.estimateTripCost({
    market: MARKET, farm: FARM, quantityKg: 500
  });
  assert.ok(estimate, 'an estimate should be produced');

  const route = await routingService.getRoute(
    { lat: FARM.latitude, lon: FARM.longitude },
    { lat: MARKET.latitude, lon: MARKET.longitude }
  );
  const direct = await transportCostService.calculateTransportCost({
    distanceKm: route.distanceKm, quantityKg: 500
  });

  assert.equal(estimate.totalCost, direct.totalCost, 'one source of truth for freight');
  assert.equal(estimate.distanceKm, route.distanceKm);
  assert.match(estimate.basis, /AgriChain transport rates/);
});

test('transport: quantity changes the vehicle and therefore the estimate', async () => {
  const small = await transportService.estimateTripCost({
    market: MARKET, farm: FARM, quantityKg: 500
  });
  const large = await transportService.estimateTripCost({
    market: MARKET, farm: FARM, quantityKg: 8000
  });
  assert.notEqual(small.vehicle.type, large.vehicle.type, 'a bigger load needs a bigger vehicle');
  assert.ok(large.totalCost > small.totalCost);
});

test('transport: no farm location means no invented distance or cost', async () => {
  assert.equal(
    await transportService.estimateTripCost({ market: MARKET, farm: null, quantityKg: 500 }),
    null
  );
  assert.equal(
    await transportService.estimateTripCost({
      market: MARKET, farm: { latitude: 0, longitude: 0 }, quantityKg: 500
    }),
    null,
    '(0,0) is not a farm location'
  );
});

test('transport: no quantity means no estimate rather than a default load', async () => {
  assert.equal(
    await transportService.estimateTripCost({ market: MARKET, farm: FARM, quantityKg: null }),
    null
  );
  assert.equal(
    await transportService.estimateTripCost({ market: MARKET, farm: FARM, quantityKg: 0 }),
    null
  );
});

// ---------------------------------------------------------------------------
// Google error mapping and status
// ---------------------------------------------------------------------------

test('transport: Google HTTP statuses map onto actionable codes', () => {
  const map = (status) =>
    googlePlaces.mapGoogleError({
      response: { status, data: { error: { message: 'google detail' } } },
      message: 'x'
    }).code;

  assert.equal(map(400), googlePlaces.PLACES_ERROR.INVALID_REQUEST);
  assert.equal(map(401), googlePlaces.PLACES_ERROR.AUTH);
  assert.equal(map(403), googlePlaces.PLACES_ERROR.AUTH);
  assert.equal(map(429), googlePlaces.PLACES_ERROR.RATE_LIMITED);
  assert.equal(map(500), googlePlaces.PLACES_ERROR.UNAVAILABLE);
  assert.equal(map(503), googlePlaces.PLACES_ERROR.UNAVAILABLE);
});

test('transport: network failures map onto timeout and unreachable', () => {
  assert.equal(
    googlePlaces.mapGoogleError({ code: 'ECONNABORTED', message: 'timeout of 8000ms' }).code,
    googlePlaces.PLACES_ERROR.TIMEOUT
  );
  assert.equal(
    googlePlaces.mapGoogleError({ code: 'ENOTFOUND', message: 'dns' }).code,
    googlePlaces.PLACES_ERROR.UNAVAILABLE
  );
});

test('transport: the 403 message tells an operator what to actually fix', () => {
  const error = googlePlaces.mapGoogleError({
    response: { status: 403, data: { error: { message: 'denied' } } }, message: 'x'
  });
  assert.match(error.message, /Places API \(New\)/);
  assert.match(error.message, /billing/i);
});

test('transport: a Places call without a key fails before reaching the network', async () => {
  const saved = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  try {
    await assert.rejects(
      () => googlePlaces.textSearch({ textQuery: 'x', latitude: 21, longitude: 79 }),
      (error) => error.code === googlePlaces.PLACES_ERROR.NOT_CONFIGURED
    );
  } finally {
    process.env.GOOGLE_MAPS_API_KEY = saved;
  }
});

test('transport: invalid coordinates are rejected before any billed call', async () => {
  await assert.rejects(
    () => googlePlaces.textSearch({ textQuery: 'x', latitude: 'abc', longitude: 79 }),
    (error) => error.code === googlePlaces.PLACES_ERROR.INVALID_REQUEST
  );
  await assert.rejects(
    () => googlePlaces.textSearch({ textQuery: '', latitude: 21, longitude: 79 }),
    (error) => error.code === googlePlaces.PLACES_ERROR.INVALID_REQUEST
  );
});

test('transport: status reports what Google does and does not provide', () => {
  const status = transportService.getTransportStatus();
  assert.equal(status.googlePlaces.api, 'Places API (New)');
  assert.equal(status.googlePlaces.providesAvailability, false);
  assert.equal(status.googlePlaces.providesPricing, false);
  assert.match(status.tripCost.note, /never from Google/);
  // The key must never appear in a status payload.
  assert.doesNotMatch(JSON.stringify(status), /test-key-not-real/);
});

test('transport: queries are built from the market, not hardcoded', () => {
  assert.ok(transportService.QUERY_TEMPLATES.length >= 2, 'several focused queries');
  for (const template of transportService.QUERY_TEMPLATES) {
    assert.match(template, /\{market\}/, 'every query must be market-specific');
    const built = template.replace('{market}', 'Nagpur APMC, Nagpur');
    assert.match(built, /Nagpur APMC/);
    assert.doesNotMatch(built, /\{market\}/);
  }
});

test('transport: repeated searches reuse the cache instead of re-billing Google', async () => {
  let searchCalls = 0;
  await withGoogleStub(
    {
      textSearch: async () => {
        searchCalls += 1;
        return [searchHit('p1', 'Cached Transport')];
      },
      placeDetailsBatch: async (ids) => ({
        details: ids.map((id) => detailHit(id, 'Cached Transport')), failures: 0
      })
    },
    async () => {
      const args = { marketId: 'nagpur', market: MARKET, farm: FARM, quantityKg: 500 };
      await transportService.findTransporters(args);
      const callsAfterFirst = searchCalls;
      const second = await transportService.findTransporters(args);

      assert.equal(searchCalls, callsAfterFirst, 'the second search must not call Google');
      assert.equal(second.fromCache, true);
      assert.equal(second.transporters.length, 1);
    }
  );
});

// ---------------------------------------------------------------------------
// The Google request itself
// ---------------------------------------------------------------------------
// These assert the exact wire format sent to Google. A wrong field mask, a
// missing header or the legacy endpoint would fail only once a real key existed,
// which is the worst time to find out — so the shape is pinned here instead.

test('transport: Text Search sends the correct Places API (New) request', async () => {
  const axios = require('axios');
  const originalPost = axios.post;
  let captured = null;

  axios.post = async (url, body, options) => {
    captured = { url, body, options };
    return { data: { places: [] } };
  };

  try {
    await googlePlaces.textSearch({
      textQuery: 'goods transport service near Nagpur APMC, Nagpur',
      latitude: 21.15,
      longitude: 79.12
    });
  } finally {
    axios.post = originalPost;
  }

  // Endpoint: the NEW API, not the legacy /maps/api/place/textsearch.
  assert.equal(captured.url, 'https://places.googleapis.com/v1/places:searchText');
  assert.doesNotMatch(captured.url, /maps\/api\/place/, 'must not use the legacy Places API');

  // Headers: key and field mask travel as headers in the new API.
  assert.equal(captured.options.headers['X-Goog-Api-Key'], 'test-key-not-real');
  assert.equal(captured.options.headers['Content-Type'], 'application/json');

  const mask = captured.options.headers['X-Goog-FieldMask'];
  for (const field of ['places.id', 'places.displayName', 'places.formattedAddress', 'places.location']) {
    assert.ok(mask.includes(field), `field mask must request ${field}`);
  }
  // Contact fields are billed higher and are NOT bought during search.
  assert.ok(!mask.includes('nationalPhoneNumber'), 'search must not request phone numbers');
  assert.ok(!mask.includes('websiteUri'), 'search must not request websites');
  assert.ok(!mask.includes('places.reviews'), 'search must not request reviews');

  // Body: POST with textQuery and a location bias circle around the mandi.
  assert.equal(captured.body.textQuery, 'goods transport service near Nagpur APMC, Nagpur');
  assert.equal(captured.body.regionCode, 'IN');
  assert.equal(captured.body.locationBias.circle.center.latitude, 21.15);
  assert.equal(captured.body.locationBias.circle.center.longitude, 79.12);
  assert.ok(captured.body.locationBias.circle.radius > 0);
  assert.ok(captured.body.maxResultCount <= 20);
});

test('transport: Place Details sends the correct request and field mask', async () => {
  const axios = require('axios');
  const originalGet = axios.get;
  let captured = null;

  axios.get = async (url, options) => {
    captured = { url, options };
    return { data: { id: 'abc' } };
  };

  try {
    await googlePlaces.placeDetails('ChIJ_test_place_id');
  } finally {
    axios.get = originalGet;
  }

  assert.equal(captured.url, 'https://places.googleapis.com/v1/places/ChIJ_test_place_id');
  assert.equal(captured.options.headers['X-Goog-Api-Key'], 'test-key-not-real');

  const mask = captured.options.headers['X-Goog-FieldMask'];
  for (const field of [
    'id', 'displayName', 'formattedAddress', 'location',
    'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
    'rating', 'userRatingCount'
  ]) {
    assert.ok(mask.includes(field), `details mask must request ${field}`);
  }
  // Expensive fields we deliberately never buy.
  for (const field of ['reviews', 'photos', 'editorialSummary', 'priceLevel']) {
    assert.ok(!mask.includes(field), `details mask must NOT request ${field}`);
  }
});

test('transport: a place id is URL-encoded into the details path', async () => {
  const axios = require('axios');
  const originalGet = axios.get;
  let capturedUrl = null;
  axios.get = async (url) => { capturedUrl = url; return { data: { id: 'x' } }; };
  try {
    await googlePlaces.placeDetails('weird/id with spaces');
  } finally {
    axios.get = originalGet;
  }
  assert.ok(!capturedUrl.includes(' '), 'spaces must be encoded');
  assert.ok(capturedUrl.includes('weird%2Fid'), 'slashes must be encoded, not path-traversed');
});

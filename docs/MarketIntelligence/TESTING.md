# Market Intelligence — Testing

**179 tests across 9 suites, all passing.** No test framework was added — the
suites use Node's built-in `node:test` runner (Node ≥ 18), so there is nothing to
install and nothing to configure.

```bash
cd backend
npm test              # all 179 tests
npm run test:unit     # 150 tests, no database required
npm run test:integration
npm run test:watch
```

Single suite:

```bash
node --test tests/ranking.test.js
```

---

## Suites

| Suite | Tests | Guards |
|---|---|---|
| `money.test.js` | 14 | Integer-paise arithmetic; float drift cannot enter |
| `transportCost.test.js` | 16 | Freight formula, vehicle selection, trips, minimum charge |
| `netReturn.test.js` | 19 | The waterfall, breakeven, selling costs |
| `spoilage.test.js` | 20 | Loss curve properties, provenance labelling |
| `ranking.test.js` | 19 | **Ranking is by expected money and nothing else** |
| `sellTiming.test.js` | 14 | Sell now vs wait, in both directions |
| `routing.test.js` | 17 | Haversine, coordinate guards, labelled fallback |
| `marketValidator.test.js` | 31 | Every rejection path, farmer-readable messages |
| `recommend.integration.test.js` | 29 | End-to-end over real HTTP |

---

## What the important tests actually assert

### The core product claim

`ranking.test.js` encodes the brief's scenario directly and is written so that
"simplifying" the ranking back to highest price makes it fail:

```
Market A: ₹3,200/qtl, 100 km, ₹2,000 freight, 8% loss  →  ₹11,885
Market B: ₹3,000/qtl,  35 km,   ₹800 freight, 3% loss  →  ₹12,918
```

- `THE CORE CASE - the lower-priced nearer mandi wins` — and additionally asserts
  the winner *is* the cheaper market, so a bug that accidentally reverses the sort
  cannot pass
- `NOT by price` / `NOT by distance` / `NOT by lowest spoilage` — three separate
  tests, each constructing a scenario where that single-factor heuristic would
  pick the wrong mandi
- Market A is deliberately passed **first** in the input array, so a
  "return input order" bug is caught
- `deltaVsBest` must be 0 for the winner and negative for everyone else
- Ties must break toward the nearer market
- Ranking must be stable across repeated calls

### Money cannot drift

`money.test.js` asserts the failures floats actually produce:

```js
// 0.1 + 0.2 !== 0.3 in binary floating point. In paise it is exact.
assert.equal(money.toRupees(money.add(money.toPaise(0.1), money.toPaise(0.2))), 0.3);

// 100 additions of 0.07 is exactly 7.00
let total = 0;
for (let i = 0; i < 100; i += 1) total = money.add(total, money.toPaise(0.07));
assert.equal(money.toRupees(total), 7);
```

Plus: `pg` `NUMERIC` strings are handled without a `parseFloat` detour, and no
input path (`NaN`, `Infinity`, `null`, `''`, `{}`) can produce `NaN` in a rupee
figure.

### The waterfall reconciles

`netReturn.test.js` asserts the identity the whole product rests on, on
deliberately awkward numbers (780 kg, ₹2,345/qtl, 7.3% loss):

```
gross − spoilage − transport − other  ==  expectedMoney   (within ₹1 of rounding)
```

Also asserted:

- Commission applies to the **realised** sale, not the spoiled load — 4% of
  ₹13,500, not of ₹15,000
- 8.5% loss is **not** rounded to 9% (an ₹80 difference on a 500 kg load)
- Total spoilage still charges the freight → `expectedMoney` of `−800`, not 0
- `expectedMoney` is **never clamped** at zero; a loss-making trip reports a loss
- **No profit figure exists without a production cost** — `expectedProfit` is
  `undefined`, not 0, and `reason` is `PRODUCTION_COST_MISSING`

### Spoilage: properties, not magic numbers

The engine is a documented rule set, so the tests assert the **properties** that
must hold for the ranking to be trustworthy, leaving future recalibration free:

- Loss rises monotonically with distance, temperature, and days since harvest
- Crop ordering holds: spinach > tomato > onion > wheat on the same trip
- Cold storage materially reduces loss
- Loss ∈ [0, 90%] under extremes (48 °C, 365-day-old harvest, 300 km)
- `estimatedLossKg + saleableQuantityKg == quantityKg` for every quantity
- `estimatedLossValue` is `null` unless a price is supplied, and equals
  `lossKg × pricePerKg` when it is
- Missing weather falls back without throwing
- A future harvest date counts as zero days elapsed
- Identical inputs give identical outputs

One test guards the curve shape specifically:

> `a fresh nearby trip loses only a few percent, not tens` — same-day tomato over
> 35 km must lose under 10%. The previous linear conversion reported ~34% here.

And two guard honesty:

> `the engine identifies itself as a rule-based baseline` — asserts
> `engine === 'RULE_BASED_BASELINE'` and `isMachineLearning === false`.

### Sell now vs wait, in both directions

`sellTiming.test.js` checks the engine is defensible whichever way it answers:

- High spoilage risk forces `SELL_NOW` **even against a ₹1,000/qtl rising
  forecast** — a price that rises after the produce has rotted is worth nothing
- **`WAIT` is never returned without a forecast** — no unsupported financial advice
- A falling forecast never produces `WAIT`
- A ₹2/quintal gain (₹10 on the load) is refused as noise
- Insufficient safe days blocks `WAIT` even on a large forecast gain
- A genuine case — onion, 30 safe days, ₹400/qtl rise — **does** produce `WAIT`
- `holdComparison` prices both branches and its arithmetic reconciles
- **No reason string may promise a price**: asserted against
  `/guarantee|will definitely|certain(ly)? (rise|increase)|assured/i`

### Routing never lies about a distance

- The fallback reports `method: 'STRAIGHT_LINE_ESTIMATE'`, `isRoadRoute: false`,
  a `degradedReason`, and `routeGeometry: null`
- It discloses both its assumptions: `detourFactorApplied` and `assumedSpeedKmph`
- `(0, 0)` is rejected as a coordinate — it is in the Gulf of Guinea, so as farm
  coordinates it means "unset"
- One bad destination among many does not void the rest, and the bad one gets
  `distanceKm: null`, never a fabricated number

### Validation

31 tests covering every rejection path with its own error code, plus:

- **All errors are collected, not just the first** — a farmer fixing a form sees
  everything wrong at once (asserted: exactly 5 codes from one bad request)
- Unit confusion is caught: 500,000 kg → `QUANTITY_TOO_LARGE` with a message
  naming kilograms
- The brief's `"farm_123"` form resolves, alongside plain ids
- Unknown optional values are **defaulted, never rejected** — an unknown
  `storageType` falls back to `open`, `predictionDays: 99` falls back to 1
- `snake_case` field names are accepted alongside `camelCase`

---

## Integration test

`recommend.integration.test.js` starts the real Express app on an ephemeral port
and drives it over real HTTP through the whole pipeline.

### How it is made deterministic

| Dependency | Treatment |
|---|---|
| Routing | `ROUTING_PROVIDER=none` → deterministic haversine × 1.3 |
| ML service | `PRICE_PREDICTION_ENABLED=false`, or the client stubbed per-test |
| Weather | `weatherService.getCurrentWeather` replaced with a fixed reading |
| Selling costs | `MARKET_APPLY_SELLING_COSTS=false` to isolate the core waterfall |
| Gemini | Never called by this endpoint |

**PostgreSQL is deliberately not stubbed** — the schema, markets and price
observations are part of what is under test. The suite creates its own users,
farms, markets and price rows (`zz_test_*` prefix), and removes them in an `after`
hook, so it neither depends on nor damages existing data. It also temporarily
deactivates the seeded Vidarbha markets so assertions depend only on its own
fixtures, and reactivates them on cleanup.

If the database is unreachable the whole suite **skips** rather than failing, so
`npm test` still works on a machine without PostgreSQL.

### Fixtures encode the core claim

```
ZZ Test Near  ₹3,000/qtl   ~6 km    →  must WIN
ZZ Test Mid   ₹3,100/qtl  ~46 km
ZZ Test Far   ₹3,400/qtl ~132 km    →  highest price, must LOSE
```

### What it asserts

**Happy path**
- Every response block is present and populated
- Ownership resolved, farm coordinates used

**The core claim, end to end**
- The highest-price mandi is *not* recommended
- `isHighestPriceButNotBest` is set on it
- The `reason` string names it and mentions freight

**Arithmetic integrity**
- Markets ordered by `expectedMoney` descending, `rank` sequential
- **Every market row reconciles**: `gross − loss − freight − other == expectedMoney`
- `estimatedLossKg + saleableQuantityKg == quantityKg` for every row

**Degradation**
- Routing down → `200`, every row `isRoadRoute: false`, disclosed in `confidenceFactors`
- ML down → `200`, `predictedPrice: null`, decision is not `WAIT`, basis `NO_FORECAST`
- Weather throws → `200`, `weatherAvailable: false`, **no temperature invented**
- Forecast available → model version surfaced, `comparisonBasis: BOTH_BRANCHES_REPRICED`
- Perishable crop out of safe days → spoilage overrides the forecast,
  `holdComparison: null`

**Errors and authorisation**
- `400` collects all validation codes; `0` and negative quantity refused
- `424 NO_MARKET_DATA` for a crop with no prices — no fabricated answer
- `422 MISSING_FARM_COORDINATES` with a message saying how to fix it
- `404` unknown farm · `403` another farmer's farm · `403` forged token
- `requestId` present on both success and failure

**Determinism**
- Two identical requests return identical rupee figures and the same winner
- A larger load earns more money and costs less freight per kg

**Provenance**
- `containsDemoData: true`, `priceSources: ['DEMO_SEED']`
- `/api/market/health` reports the price provider, its coverage, and whether any real observations exist
- `spoilage.isMachineLearning: false`
- Every price row carries source, observation date and freshness
- Channels without a price feed carry `netReturn: null` + `unavailableReason`
- `POST /api/spoilage/predict` declares `RULE_BASED_BASELINE`

**No regression**
- `/api/health`, `/api/spoilage/health`, `/api/spoilage/options` and
  `/api/farms/user` still respond correctly

---

## Bugs these tests caught

Writing the suites surfaced three real defects, all fixed:

1. **`distanceKm: null` priced as a free trip.** `Number(null) === 0`, so an
   unroutable market looked like the cheapest on the board. Caught by
   `transport: invalid distance is rejected`; now rejected as `INVALID_DISTANCE`.

2. **Sell-timing compared two different bases.** The engine measured a locally
   recomputed hold value against the caller's precomputed `expectedMoney`, so the
   difference was not the cost of waiting — and the reason text contradicted
   itself ("the extra **0%** of the load lost to spoilage is more than the
   forecast price movement is worth"). Caught by
   `a large gain on a sturdy crop ... can justify WAIT`. Both branches are now
   repriced by the same engine (`comparisonBasis: BOTH_BRANCHES_REPRICED`), and
   the reason text can no longer blame spoilage when spoilage did not change.

3. **Two of my own assertions were wrong, not the code** — worth recording,
   because both were cases where the implementation was right:
   - Freight is **non-decreasing** with distance, not strictly increasing: below
     the minimum charge it is flat by design, which is how transporters quote a
     short hop.
   - The detour-factor test re-derived from an already-rounded `straightLineKm`;
     the service correctly derives from the full-precision haversine.

Two further integration-test failures were also the engine being right: a
same-day tomato in open storage has zero safe days, so the spoilage constraint
correctly short-circuits before the forecast is consulted. The tests now request
cold storage to reach the branch they meant to exercise, and a new test asserts
the short-circuit itself.

---

## Manual verification

```bash
# 1. Provenance and engine versions
curl -s localhost:3000/api/market/health | python3 -m json.tool

# 2. Full recommendation
curl -s -X POST localhost:3000/api/market/recommend \
  -H 'Content-Type: application/json' \
  -d '{"crop":"tomato","quantityKg":500,"farmId":39,"productionCost":8000}' \
  | python3 -m json.tool

# 3. Error paths
for body in \
  '{"crop":"tomato","quantityKg":0,"farmId":39}' \
  '{"crop":"dragonfruit","quantityKg":500,"farmId":39}' \
  '{"crop":"wheat","quantityKg":500,"farmId":39}' \
  '{"crop":"tomato","quantityKg":500,"farmId":999999}'; do
  curl -s -o /tmp/r.json -w "HTTP %{http_code}  " -X POST \
    localhost:3000/api/market/recommend -H 'Content-Type: application/json' -d "$body"
  python3 -c "import json;print(json.load(open('/tmp/r.json'))['error']['code'])"
done

# 4. ML outage: stop uvicorn, then re-run step 2.
#    Expect HTTP 200 with pricePredictionAvailable: false.

# 5. Routing outage: restart the backend with ROUTING_PROVIDER=none, re-run step 2.
#    Expect HTTP 200 with routeMethod STRAIGHT_LINE_ESTIMATE on every market.
```

---

## Not covered

Stated so the gaps are known rather than assumed away:

- **No frontend component tests.** The React components were not modified; only
  the service adapter and two banner strings. Verified by `vite build` succeeding
  and by asserting the backend returns every field the adapter maps from (33
  fields on the winning market, all present).
- **No Python unit tests for the price module.** Verified manually: training-row
  count held at exactly 16,160 after the `features.py` fix, confirming training
  was unaffected; leakage is checked at training time by `assert_no_leakage()`.
  A `pytest` suite for `features.py` is the clearest next addition.
- **No load or concurrency testing.** The public OSRM demo server would rate-limit
  it anyway.
- **Provider ingestion is tested with a stubbed HTTP layer and a fake provider**
  (`tests/priceProvider.test.js`), never against the live API: the upstream host
  sleeps and rate-limits at 100 requests / 15 minutes, so a network-dependent test
  would be flaky for reasons unrelated to our code. Previously no key was
  configured. `normaliseRecord` and `parseArrivalDate` are exported and pure, so
  they are the natural place to start when a key is available.

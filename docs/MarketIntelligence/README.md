# AgriChain — Market Intelligence Module

> **The one question this module answers**
>
> *"For my crop and quantity, which nearby market will leave me with the most
> money after transport and expected crop loss?"*
>
> It does **not** recommend the mandi with the highest price.

---

## Contents

1. [The core idea](#1-the-core-idea)
2. [Architecture](#2-architecture)
3. [The Net Realizable Return formula](#3-the-net-realizable-return-formula)
4. [Recommendation logic](#4-recommendation-logic)
5. [Sell now vs wait](#5-sell-now-vs-wait)
6. [What is real, what is demo, what is ML, what is rule-based](#6-what-is-real-what-is-demo-what-is-ml-what-is-rule-based)
7. [Database](#7-database)
8. [Files added and changed](#8-files-added-and-changed)
9. [Error handling and degradation](#9-error-handling-and-degradation)
10. [Running it](#10-running-it)
11. [Known limitations](#11-known-limitations)

Companion documents:

| Document | Covers |
|---|---|
| [`API.md`](./API.md) | Every endpoint, request/response shapes, status codes |
| [`DATA_PROVENANCE.md`](./DATA_PROVENANCE.md) | Exactly which numbers are measured, modelled, or configured |
| [`SETUP.md`](./SETUP.md) | Environment variables, seeding, model training, running services |
| [`TESTING.md`](./TESTING.md) | Test suites, what each guards, how to run them |

---

## 1. The core idea

A farmer with 500 kg of tomatoes sees two mandis on a price board:

| | Price | Distance | Freight | Expected crop loss | **Money in hand** |
|---|---|---|---|---|---|
| Market A | ₹3,200/qtl | 100 km | ₹2,000 | 8% (₹1,280) | **₹11,885** |
| Market B | ₹3,000/qtl | 35 km | ₹800 | 3% (₹450) | **₹12,918** |

Market A pays **₹200/quintal more** and leaves the farmer **₹1,033 poorer**.

Every component in this module exists to compute that last column correctly, and
to be able to show its working. The ranking key is `expectedMoney` and nothing
else — not price, not distance, not spoilage. There are unit tests that fail if
anyone changes that ([`tests/ranking.test.js`](../../backend/tests/ranking.test.js)).

---

## 2. Architecture

```
                         React + Vite frontend
                    (Market page — UI unchanged)
                                 │
                   POST /api/market/recommend
                                 ▼
             ┌───────────────────────────────────────┐
             │   Node.js + Express  (port 3000)      │
             │                                       │
             │   marketController                    │
             │        ↓  validate → authorise farm   │
             │   marketService  (orchestrator)       │
             └───────────────────────────────────────┘
                │        │        │        │       │
     ┌──────────┘        │        │        │       └──────────┐
     ▼                   ▼        ▼        ▼                  ▼
PostgreSQL         routingService  │  weatherService   pricePredictionService
 markets           OSRM / ORS      │  Open-Meteo              │
 market_prices     road km + time  │  temp + humidity         ▼
 crop_profiles          │          │                  FastAPI ml-service :8000
 price_predictions      ▼          ▼                   POST /predict/price
 market_recommend.  transportCost  spoilageService            │
 transport_config    ENGINE        RULE_BASED_BASELINE        ▼
                        │                │              XGBoost artifact
                        └────────┬───────┘             price_xgb_v1_h{1,3}
                                 ▼
                         netReturnService
                    gross − spoilage − freight − fees
                                 ▼
                         rank by expectedMoney
                                 ▼
                        sellTimingService
                     SELL_NOW / SELL_SOON / WAIT
                                 ▼
                    structured recommendation (JSON)
                                 ▼
                 (optional) marketExplanationService
                  Gemini restates it in plain language
                     — it may not change a number
```

### Service responsibilities

| Service | Responsibility | Engine type |
|---|---|---|
| `marketService` | Orchestration, candidate selection, ranking, explanation text | Deterministic |
| `marketPriceService` | All reads of `market_prices`, with provenance + freshness | Data access |
| `providers/mandiApiProvider` | Fetch real prices from the keyless provider | External API |
| `marketPriceIngestService` | Provider-agnostic ingestion into `market_prices` | DB + provider |
| `pricePredictionService` | Client for the Python price model; persists predictions | ML client |
| `routingService` | Road distance, travel time, geometry (OSRM/ORS) + labelled fallback | External API |
| `transportCostService` | The **only** place freight is priced | Deterministic config |
| `spoilageService` | Expected crop loss between harvest and sale | **Rule-based baseline** |
| `netReturnService` | The **only** place money-in-hand is computed | Deterministic |
| `sellTimingService` | Sell now vs wait | Rule-based |
| `marketExplanationService` | Farmer-friendly narration | LLM (narration only) |

### Why the boundaries are drawn this way

- **Freight and net return have exactly one implementation each.** If two places
  computed freight, the ledger shown to the farmer and the ranking that picked
  the mandi could disagree, and the farmer would have no way to tell which was
  wrong. The frontend used to have its own copy of this logic; it is now a
  clearly-flagged offline fallback only.
- **No LLM touches a number.** Gemini receives already-computed values and is
  asked for prose. Its output is returned *alongside* the structured data, never
  merged into it, so a hallucinated figure can never become the figure the API
  reports.
- **No ML where arithmetic will do.** Routing, freight, and the net-return
  waterfall are deterministic. ML is used for exactly one thing: forecasting a
  future price, which is genuinely a prediction problem.

---

## 3. The Net Realizable Return formula

Implemented in
[`backend/src/services/netReturnService.js`](../../backend/src/services/netReturnService.js).

```
  gross sale value      = price_per_kg × quantity_kg
− spoilage loss value   = price_per_kg × (quantity_kg × loss% / 100)
─────────────────────────
= expected sale value   = price_per_kg × saleable_kg
− transport cost        = from transportCostService
− other selling costs   = commission + cess + hamali + weighing
─────────────────────────
= EXPECTED MONEY          ← the ranking key
```

### Precision

Every intermediate value is **integer paise**, via
[`utils/money.js`](../../backend/src/utils/money.js). Rupees appear only at the
response boundary.

This is not pedantry. `0.1 + 0.2 !== 0.3` in binary floating point, and a
cascade of eight float operations across a dozen markets drifts — drift here
reorders the ranking, which changes which mandi a farmer physically drives to.
`pg` returns `NUMERIC` columns as strings for the same reason, and `toPaise`
accepts those strings directly rather than routing them through `parseFloat`.

### Freight

```
cost = max(minimum_charge, distance_km × rate_per_km × return_trip_factor × trips)
     + (loading_cost + unloading_cost) × trips
```

- `return_trip_factor` — a transporter charges for the empty trip home. Omitting
  it understates freight by roughly a quarter, which is exactly the size of the
  gap that decides between a near and a far mandi.
- `trips` — a 4 t load in a 3 t vehicle is two hires, so quantity affects cost
  even at fixed distance.
- Rates live in the `transport_config` **table**, so a district or fuel-price
  correction needs no code deploy.

### Breakeven

Only when production cost is supplied:

```
break_even_price_per_kg = production_cost / quantity_kg
expected_profit         = expected_money − production_cost
```

Without it the response returns `productionCostAvailable: false` and **no profit
figure at all**. A profit number derived from a guessed input cost is worse than
no number, because a farmer would act on it.

---

## 4. Recommendation logic

`POST /api/market/recommend` runs this pipeline:

| # | Step | Failure behaviour |
|---|---|---|
| 1 | Validate request (all errors collected, not just the first) | `400` with field codes |
| 2 | Resolve farm + **enforce ownership** | `404` / `403` |
| 3 | Candidate markets: prices exist, not stale, within radius | `424 NO_MARKET_DATA` |
| 4 | Latest observed price per market, with source + freshness | fatal if none |
| 5 | Price forecast per market (ML) | degrade, flag `false` |
| 6 | Road distance + travel time per market | degrade to labelled estimate |
| 7 | Freight per market | market marked unevaluable |
| 8 | Weather at the farm | degrade, spoilage uses defaults |
| 9 | Expected crop loss per market | always available |
| 10 | Net realizable return per market | market marked unevaluable |
| 11 | **Rank by expected money** | `503` if none evaluable |
| 12 | Breakeven, if production cost given | `available: false` |
| 13 | Sell now vs wait | always answers |
| 14 | Persist audit trail | logged, never fatal |

Candidate selection is two-stage on purpose: straight-line distance is free and
prunes the field first, then road routing — one external call each — runs only on
the survivors, nearest first.

### The ranking is explainable

Ties break toward the **nearer** market (same money, less risk). The response
carries, for every market: current price, predicted price, distance, travel time,
freight, spoilage risk, loss %, loss kg, loss value, saleable kg, every fee line,
and expected money — plus:

- `deltaVsBest` — rupees lost by choosing this market over the winner
- `isHighestPriceButNotBest` — flags the exact case the product exists to expose
- `reason` — deterministic prose naming the specific trade-off:

> *"Wardha APMC quotes ₹33/quintal more, but it is 50 km further: ₹1,215 more
> freight and ₹2 more crop lost on the way. Selling at Nagpur APMC (Kalamna)
> instead leaves you about ₹1,060 better off — ₹7,511 in hand."*

That sentence is assembled by
[`buildRecommendationReason`](../../backend/src/services/marketService.js) from
computed figures. No LLM is involved.

### Confidence

A **qualitative** label over data quality — not a statistical confidence. It is
downgraded by each soft input, and every downgrade is named:

```json
"confidence": "medium",
"confidenceFactors": [
  "Prices are DEMO_SEED demonstration values, not government observations."
]
```

---

## 5. Sell now vs wait

Rule-based in V1, in
[`sellTimingService.js`](../../backend/src/services/sellTimingService.js).

Rather than reasoning about "trend" abstractly, it **prices both branches with
the same net-return engine** that produced the ranking:

- **sell today** → expected money at today's price, at today's spoilage
- **hold N days** → expected money at the forecast price, at the spoilage the
  load will have accumulated by then

The difference is the real cost or benefit of waiting, in rupees.

| Condition | Decision |
|---|---|
| High spoilage risk, or 0 safe days left | `SELL_NOW` — spoilage overrides any forecast |
| No forecast available | `SELL_SOON` — **never** `WAIT` without evidence |
| Safe days < forecast horizon | `SELL_SOON` — cannot survive the wait |
| Gain below ₹250 **and** 2% | `SELL_SOON` — too small to justify holding |
| Gain clears both thresholds, crop can hold | `WAIT` |

Both branches are computed inside the engine from the same inputs
(`comparisonBasis: "BOTH_BRANCHES_REPRICED"`). Comparing a locally computed hold
value against a caller-supplied `expectedMoney` risks mixing two bases, and a
mixed-basis subtraction is not the cost of waiting at all.

No output ever promises a price — there is a test asserting that none of the
reason strings contain words like *guarantee* or *will definitely rise*.

---

## 6. What is real, what is demo, what is ML, what is rule-based

Full detail in [`DATA_PROVENANCE.md`](./DATA_PROVENANCE.md). Summary:

| Component | Nature | Identifier |
|---|---|---|
| Mandi prices | **MANDI_API** for the 3 mapped mandis; **DEMO_SEED** for the other 13 | `source` + `isDemoData` on every row |
| Price forecast | **Machine learning** — XGBoost regression | `price_xgb_v1_h1-demo` |
| Spoilage / crop loss | **Rule-based baseline**, not ML | `RULE_BASED_BASELINE` / `spoilage_baseline_v1` |
| Road distance / time | **External API** — OSRM road network | `OSRM_ROAD` |
| Distance fallback | **Estimate** — haversine × 1.3 | `STRAIGHT_LINE_ESTIMATE` |
| Weather | **External API** — Open-Meteo, live | `Open-Meteo` |
| Freight | **Deterministic config** from `transport_config` | `DETERMINISTIC_CONFIG` |
| Selling fees | **Configured estimate**, not verified statutory rates | `CONFIGURED_ESTIMATE` |
| Net return, ranking, breakeven | **Deterministic arithmetic** | `net_return_v1` |
| Sell now / wait | **Rule-based** | `sell_timing_v1` |
| Plain-language explanation | **LLM narration only** | `GEMINI` or `TEMPLATE` |

Three rules are enforced throughout:

1. **Nothing synthetic is ever labelled as a government observation.** Demo rows
   carry `source: 'DEMO_SEED'`, surface as `isDemoData: true`, propagate to
   `dataQuality.containsDemoData`, and drive a banner on the Market page.
2. **The spoilage engine is never described as ML.** It reports
   `isMachineLearning: false` in every response.
3. **No invented confidence intervals.** The price model produces a point
   estimate; `providesPredictionIntervals` is `false` and `lower_bound` /
   `upper_bound` stay `NULL` in the database.

---

## 7. Database

Schema: [`database/schemas/market.sql`](../../database/schemas/market.sql) —
fully idempotent, applied automatically on backend startup by
`backend/src/config/db.js`.

| Table | Purpose | Notes |
|---|---|---|
| `markets` | APMC/mandi master data | `coordinate_source` records that coordinates are `CITY_CENTROID`, not surveyed yard gates |
| `market_prices` | One row per market/crop/day/source | `source` is the provenance guarantee; unique constraint makes ingestion idempotent |
| `crop_profiles` | Per-crop perishability parameters | Tunable without a deploy; code remains the computational source of truth |
| `price_predictions` | Every ML prediction | Traceable to `model_version`; bounds `NULL` unless real |
| `market_recommendations` | Audit trail of what a farmer was told | Stores the full `response_payload` |
| `transport_config` | Vehicle freight rates | Configuration, so freight is never hardcoded |

Money columns are `NUMERIC`, never `FLOAT`. No new tables were needed beyond
these; existing `users`, `farms`, `spoilage` tables are reused unchanged.

**PostGIS is not used.** `farms` stores plain `latitude`/`longitude` floats and
the existing NDVI module works that way. The only geospatial operation needed is
point-to-point distance, which haversine handles exactly; introducing PostGIS
would add an extension dependency for no capability gain.

---

## 8. Files added and changed

### Backend — added

```
src/services/routingService.js            road distance, time, geometry + fallback
src/services/transportCostService.js      freight (single source of truth)
src/services/pricePredictionService.js    ML client + price trend series
src/services/netReturnService.js          expected money + breakeven
src/services/sellTimingService.js         sell now vs wait
src/services/marketService.js             orchestration + ranking (was an empty stub)
src/services/marketExplanationService.js  Gemini narration (numbers locked)
src/controllers/marketController.js       HTTP layer (was an empty stub)
src/routes/marketRoutes.js                /api/market + /api/markets (was an empty stub)
src/routes/cropRoutes.js                  /api/crops
src/validators/marketValidator.js         request validation
src/middleware/optionalAuthMiddleware.js  identity + ownership enforcement
src/constants/marketCosts.js              selling-cost configuration
tests/*.test.js                           9 suites, 179 tests
```

### Backend — changed

| File | Change |
|---|---|
| `src/app.js` | Mounted `/api/market`, `/api/markets`, `/api/crops` |
| `src/services/spoilageService.js` | Tagged `RULE_BASED_BASELINE`; added precise loss %, monetary loss, market-loss estimator; **fixed the risk→loss curve** (see below) |
| `src/services/marketPriceService.js` | **Fixed a timezone date bug** (see below) |
| `src/controllers/spoilageController.js` | Added `predictSpoilage` |
| `src/routes/spoilageRoutes.js` | Added `POST /api/spoilage/predict` |
| `package.json` | Added `test`, `test:unit`, `test:integration`, `test:watch` |
| `.env.example` | Documented every new variable |

### ML service — changed

| File | Change |
|---|---|
| `src/price/features.py` | **Fixed an inference bug** (see below) |

### Frontend — changed (service layer only; no component or style touched)

| File | Change |
|---|---|
| `src/services/marketService.js` | Rewired to consume `POST /api/market/recommend` as the authoritative ranking, with an adapter onto the existing component field names. Client-side economics demoted to an offline fallback |
| `src/pages/Market.jsx` | Passes `farmId`/`userId`; provenance banner corrected (it previously stated the market API was unimplemented) |

### Three bugs found and fixed while testing

1. **Price inference was one observation stale.** In `features.py`, calendar
   features were derived by shifting the target date *backwards*, so the final
   row of every series was `NaT` and got dropped. Inference therefore predicted
   from the *second-to-last* observation and reported a stale `current_price`
   (₹1,804 from 23 Sep instead of ₹1,823 from 24 Sep). Fixed by projecting the
   target date forward over trading days, skipping Sundays when mandis are shut.
   Training is unaffected — those rows were already dropped for having no label,
   confirmed by training-row count remaining exactly 16,160 — so **no retraining
   was required** and the saved metrics remain valid.

2. **Every price looked a day older than it was.** `pg` parses a `DATE` as local
   midnight, so `toISOString().slice(0,10)` rewinds it past the UTC boundary in
   IST: a 24 Sep observation serialised as `2026-09-23`. That inflated every
   `ageInDays` and could push a `FRESH` quote into `RECENT`. Fixed with a
   local-components date formatter used for all `DATE` columns.

3. **A missing distance was priced as a free trip.** `Number(null) === 0`, so
   `calculateTransportCost({ distanceKm: null })` returned freight for 0 km —
   making an unroutable market look like the cheapest on the board. Now rejected
   explicitly as `INVALID_DISTANCE`.

Additionally, the spoilage **risk→loss curve** was reshaped. The previous linear
conversion reported ~34% loss on a day-old tomato load travelling 35 km, which no
farmer would recognise. Spoilage is convex in elapsed shelf life — produce
halfway through its life is nearly intact, then deteriorates sharply — so the
curve is now `0.45 × ratio^2.2`, capped at 90%:

| Shelf life used | 20% | 45% | 75% | 100% |
|---|---|---|---|---|
| Load lost | ~1.3% | ~7.8% | ~24% | 45% |

This also changes the loss figure on the existing Spoilage Risk page (for the
better); its risk score, band, timeline and recommendations are unchanged.

---

## 9. Error handling and degradation

**Only two things are fatal:** no farm coordinates, and no usable price data for
the crop. Everything else degrades with a visible flag.

| Failure | Behaviour | Response field |
|---|---|---|
| Routing API down | Labelled straight-line estimate | `isRoadRoute: false`, `routeMethod: "STRAIGHT_LINE_ESTIMATE"`, `routeDegradedReason` |
| ML service down | No forecast; ranking unaffected | `pricePredictionAvailable: false` |
| Not enough price history | No forecast | `INSUFFICIENT_HISTORY` |
| Weather API down | Spoilage uses documented defaults | `weatherAvailable: false`, `conditions.reason` |
| Gemini down / bad model | Deterministic template narration | `source: "TEMPLATE"` |
| `transport_config` unreadable | Documented fallback vehicle | `configSource: "FALLBACK_DEFAULT"` |
| One market unroutable | That market alone is unranked | `evaluated: false`, `unavailableReason` |
| No farm coordinates | `422 MISSING_FARM_COORDINATES` | message says how to fix it |
| No price data | `424 NO_MARKET_DATA` | diagnostics explain why |
| Another user's farm | `403 FARM_FORBIDDEN` | — |
| Forged token | `403 AUTH_INVALID` | — |

Every degradation also appears in `confidenceFactors`, so the farmer sees *why*
confidence dropped rather than just a lower label.

### Logging

Each request gets a short correlation id, returned as `requestId` on both success
and failure and printed with crop, quantity, candidate count, external-service
failures, and the final decision:

```
[Market Controller] [ah3o6f] recommend crop=tomato qty=500kg farmId=39 user=1 auth=DEV_FALLBACK
[Market Recommend] [ah3o6f] 8 candidate market(s) of 16 with price data
[Market Recommend] [ah3o6f] complete in 1408ms: Nagpur APMC (Kalamna) expectedMoney=₹7511 decision=SELL_SOON confidence=medium
```

Passwords, API keys and tokens are never logged.

### Security

- Farm ownership is enforced on every farm-scoped endpoint. A `farmId` is never
  trusted on its own.
- A present-but-invalid token is rejected with `403` rather than silently
  downgraded to anonymous, so tampering is not the easy path.
- All credentials come from environment variables; none are logged or returned.
- See `optionalAuthMiddleware.js` for why market routes use optional rather than
  mandatory auth, and the one-line migration to mandatory.

---

## 10. Running it

Full instructions in [`SETUP.md`](./SETUP.md). Shortest path:

```bash
# 1. Database + master data (idempotent)
cd backend
npm install
npm run seed:market          # 16 Vidarbha markets, crop profiles, vehicle rates
npm run seed:demo-prices     # DEMO_SEED price history — clearly labelled

# 2. ML service (price forecasts)
cd ../ml-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn api.app:app --port 8000

# 3. Backend
cd ../backend && npm run dev          # port 3000

# 4. Frontend (unchanged)
cd ../frontend && npm run dev         # port 5173

# 5. Confirm before a demo
curl -s localhost:3000/api/market/health | python3 -m json.tool
```

Then:

```bash
curl -X POST localhost:3000/api/market/recommend \
  -H 'Content-Type: application/json' \
  -d '{"crop":"tomato","quantityKg":500,"farmId":39,"productionCost":8000}'
```

### Tests

```bash
cd backend
npm test              # 179 tests across 9 suites
npm run test:unit     # no database required
```

---

## 11. Known limitations

Stated plainly, because a final-year project is judged on knowing what it has
not done:

1. **Real prices cover only 3 of 16 mandis.** The keyless provider does not carry
   Wardha, Katol, Savner, Umred, Kalmeshwar, Hinganghat, Amravati, Achalpur,
   Bhandara, Gondia, Washim, Buldhana or Yavatmal, so those markets are still
   DEMO_SEED. A ranking can therefore compare a real price against a demo one;
   both are labelled per market. Previously,
   all prices are `DEMO_SEED`. The ingestion service is written and tested;
   it needs a free data.gov.in key. Until then the price model is honestly
   versioned `price_xgb_v1_h1-demo`.

2. **The price model barely beats the naive baseline** — 0.52% better MAE than
   "tomorrow equals today". That is the honest result on synthetic data whose
   generator is a mean-reverting random walk; there is little learnable signal by
   construction. Re-evaluate on real provider history before claiming the model
   adds value.

3. **The spoilage baseline has no labelled dataset behind it.** It is agronomy
   (Q10 respiration) plus documented rules of thumb. `LOSS_AT_FULL_EXPOSURE`
   (0.45) and `LOSS_CURVE_EXPONENT` (2.2) are the first things a real
   post-harvest dataset should replace. The interface is shaped so a trained
   regressor can drop in behind it — keep the function signatures, bump
   `SPOILAGE_MODEL_VERSION`.

4. **Market coordinates are town centroids**, not surveyed APMC yard gates —
   recorded as `coordinate_source: 'CITY_CENTROID'`. Good enough to rank markets
   30–150 km apart; not good enough for turn-by-turn navigation.

5. **Selling fees are indicative, not statutory.** Maharashtra deregulated fruit
   and vegetable APMC trade from 2016 and who bears the commission varies by
   yard. Labelled `CONFIGURED_ESTIMATE`; confirm locally.

6. **No price feed for non-APMC channels.** FPO, local haat and processor
   contracts are listed as options with `netReturn: null` and an explicit
   `unavailableReason`, rather than being given invented figures.

7. **No toll data.** `breakdown.tollCost` is always 0 with a placeholder comment,
   rather than an estimate.

8. **`AiExplanation.jsx` contains stale marketing copy** claiming "Direct
   integration with Agmarknet" and "hourly ambient temperature forecasts". The
   first is not yet true and the second overstates what the spoilage engine uses.
   Left untouched because it is frontend content, but it should be reworded — or
   better, fed the real `recommendationReason` and `confidenceFactors` the API
   now returns.

9. **The public OSRM demo server is rate limited.** Fine for a demo; self-host
   OSRM or use OpenRouteService with a key for real load.

10. **`GEMINI_MODEL` in `.env` is `gemini-3.5-flash`, which does not exist** and
    returns 503. The market module works around it with a fallback chain
    (`gemini-flash-latest`, `gemini-flash-lite-latest`), but the NDVI advisor in
    `recommendationService.js` has no such chain and is likely silently falling
    back. Updating `.env` would fix both.

---

**Price provider:** the AGMARKNET API-key integration is retired. See
[PRICE_PROVIDER.md](PRICE_PROVIDER.md) — keyless provider abstraction,
`POST /api/market/ingest`, `GET /api/market/provider/coverage`.

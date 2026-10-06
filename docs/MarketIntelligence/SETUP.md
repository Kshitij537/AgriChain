# Market Intelligence — Setup

Assumes the rest of AgriChain already runs (PostgreSQL, backend, frontend). This
covers only what the market module adds.

---

## 1. Prerequisites

| Component | Version used | Notes |
|---|---|---|
| Node.js | 22.19 | Tests use the built-in `node:test` runner (needs ≥ 18) |
| PostgreSQL | any recent | No PostGIS extension required |
| Python | 3.11 | For the ML service |

No new Node dependencies were added — the module uses `axios` and `pg`, both
already present.

---

## 2. Database schema

Nothing to run by hand. `backend/src/config/db.js` applies
`database/schemas/market.sql` on every startup; the file is fully idempotent
(every statement is `IF NOT EXISTS`), so a fresh clone works without a manual
`psql` step.

To apply it explicitly:

```bash
psql -U postgres -d agrichain_db -f database/schemas/market.sql
```

Verify:

```bash
psql -U postgres -d agrichain_db -c "\dt markets|market_prices|crop_profiles|price_predictions|market_recommendations|transport_config"
```

---

## 3. Seed master data and configuration

```bash
cd backend
npm install
npm run seed:market
```

Idempotent. Seeds:

- **16 Vidarbha APMC markets** — Nagpur, Katol, Kalmeshwar, Savner, Umred,
  Wardha, Hinganghat, Amravati, Achalpur, Akola, Yavatmal, Bhandara, Gondia,
  Chandrapur, Washim, Buldhana
- **18 crop profiles**, sourced from `spoilageService.CROP_PROFILES`
- **4 vehicle freight configurations**

This seeds **master data and configuration only** — real-world facts about where a
mandi is and what a tempo charges. It does **not** seed any price observation.

---

## 4. Get price data

### Option A — real provider data (preferred, keyless)

1. Register free at <https://data.gov.in/> and copy your API key.
2. Add to `backend/.env`:
   ```
   MARKET_PRICE_PROVIDER=mandi_api
   ```
3. Restart the backend and trigger ingestion:
   ```bash
   curl -X POST localhost:3000/api/market/ingest \
     -H 'Content-Type: application/json' \
     -d '{"state":"Maharashtra","maxPages":5}'
   ```

The response reports `recordsFetched`, `recordsMatched`, `recordsWritten` and any
`unmapped`. Markets are matched through `market_provider_map` rows written by
`npm run map:markets`; only `EXACT`/`VERIFIED` rows are ingested. Add missing mappings
to `scripts/seedMarketData.js` and re-seed.

Run daily to accumulate history — the public resource exposes current arrivals,
not an archive, so lag features are built by accumulating snapshots. Wire it to a
scheduler alongside the existing NDVI refresh job when ready.

### Option B — demonstration data (to develop and demo without a key)

```bash
npm run seed:demo-prices          # ~270 days
npm run seed:demo-prices -- 365   # or a custom span
```

Writes 5 crops × 16 markets × ~270 trading days ≈ **18,560 rows**, every one with
`source = 'DEMO_SEED'`. Deterministic, so a rebuild reproduces identical numbers.

> **These are not government observations.** See
> [`DATA_PROVENANCE.md`](./DATA_PROVENANCE.md). Every API response and the Market
> page disclose it.

Remove once real data flows:

```sql
DELETE FROM market_prices WHERE source = 'DEMO_SEED';
```

---

## 5. ML service (price forecasting)

```bash
cd ml-service
python3.11 -m venv venv
source venv/bin/activate              # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Added for this module: `pandas`, `scikit-learn`, `xgboost`, `joblib`,
`psycopg2-binary`, `python-dotenv`, `pydantic`. TensorFlow for disease detection
is unchanged.

The service reads the **same** `DB_*` variables as the Node backend, so one
`.env` configures both:

```bash
set -a; . ../backend/.env; set +a
uvicorn api.app:app --host 127.0.0.1 --port 8000
```

Confirm both routers are live:

```bash
curl -s localhost:8000/health              # disease detection
curl -s localhost:8000/price-model/info    # price model metadata
```

The price router is mounted separately from disease detection and imports the
price model **lazily**, so a missing or untrained price artifact cannot prevent
the service from starting or affect disease inference.

### Training the price model

Trained artifacts are already committed under `ml-service/models/price/`. To
retrain (after ingesting real data, or after changing features):

```bash
cd ml-service
source venv/bin/activate
set -a; . ../backend/.env; set +a

python -m src.price.train --horizon 1
python -m src.price.train --horizon 3

# Real data only, once provider history has accumulated:
python -m src.price.train --horizon 1 --sources MANDI_API
```

Training will **refuse** rather than fit noise if there are fewer than
`MIN_TRAINING_ROWS` (500) usable rows, or if a series is shorter than
`MIN_SERIES_LENGTH` (max lag + max window + 5 = 65 observations). That is
deliberate: a 30-lag gradient-boosted model fitted to a handful of rows produces
a confident-looking model with no predictive value, which is worse than no model.

Each run writes:

```
models/price/price_model_h{N}.joblib            model + feature order + version
models/price/price_model_h{N}_metadata.json     provenance, split, metrics, importances
```

A model trained on any `DEMO_SEED` row is versioned with a `-demo` suffix
automatically. Training code never runs on an API request.

---

## 6. Backend

```bash
cd backend
npm run dev        # or npm start
```

Startup log should show:

```
✅ Connected to PostgreSQL database
✅ DB startup migrations complete
🚀 AgriChain Backend Server running on port 3000
```

Confirm the module:

```bash
curl -s localhost:3000/api/market/health | python3 -m json.tool
```

---

## 7. Frontend

No setup change. The existing Market page now consumes the live API through
`src/services/marketService.js`.

```bash
cd frontend
npm run dev        # http://localhost:5173
```

The page needs a farm with a **saved location**. If it shows
`MISSING_FARM_COORDINATES`, set the field boundary via Farm Setup first.

---

## 8. Environment variables

All documented with comments in `backend/.env.example`. Summary of what the market
module adds — **every one has a working default, and none is a credential**:

| Variable | Default | Purpose |
|---|---|---|
| `MARKET_PRICE_PROVIDER` | `mandi_api` | Which provider supplies prices |
| `MANDI_API_BASE_URL` | `https://mandi-api.onrender.com/v1` | Provider base URL (keyless) |
| `MANDI_API_TIMEOUT_MS` / `_RETRIES` / `_MIN_REQUEST_INTERVAL_MS` | `60000` / `2` / `900` | Cold-start tolerance and rate-limit pacing |
| `MARKET_PRICE_FRESH_DAYS` | `2` | Age at which a price stops being `FRESH` |
| `MARKET_PRICE_RECENT_DAYS` | `7` | `RECENT` threshold |
| `MARKET_PRICE_STALE_DAYS` | `30` | `STALE` threshold |
| `MARKET_MAX_PRICE_AGE_DAYS` | `30` | Older observations are excluded from ranking |
| `ROUTING_PROVIDER` | `osrm` | `osrm` \| `openrouteservice` \| `none` |
| `OSRM_BASE_URL` | public demo server | Self-host for real load |
| `ORS_BASE_URL` / `ORS_API_KEY` | — | Only for OpenRouteService |
| `ROUTING_TIMEOUT_MS` | `8000` | Per-route timeout |
| `ROUTING_CACHE_TTL_MS` | `86400000` | 24 h — roads do not move |
| `ROUTING_DETOUR_FACTOR` | `1.3` | Straight-line → road, **fallback only** |
| `MARKET_SEARCH_RADIUS_KM` | `150` | How far a mandi can be and still be considered |
| `MARKET_MAX_CANDIDATES` | `8` | Cap on markets fully evaluated |
| `PRICE_PREDICTION_ENABLED` | `true` | `false` skips the ML hop entirely |
| `PRICE_PREDICTION_TIMEOUT_MS` | `6000` | ML call timeout |
| `ML_SERVICE_URL` | `http://127.0.0.1:8000` | Shared with disease detection |
| `MARKET_APPLY_SELLING_COSTS` | `true` | `false` models a sale with no deductions |
| `MARKET_COMMISSION_PERCENT` | `4` | Trader commission |
| `MARKET_CESS_PERCENT` | `1.05` | APMC market fee |
| `MARKET_HAMALI_PER_QUINTAL` | `15` | Yard labour |
| `MARKET_WEIGHING_PER_QUINTAL` | `5` | Weighing / grading |
| `SELL_WAIT_MIN_GAIN_RUPEES` | `250` | Minimum rupee gain to justify waiting |
| `SELL_WAIT_MIN_GAIN_PERCENT` | `2` | Minimum percentage gain to justify waiting |
| `GEMINI_FALLBACK_MODELS` | `gemini-flash-latest,gemini-flash-lite-latest` | Tried when `GEMINI_MODEL` fails |

### Known `.env` issue

`GEMINI_MODEL=gemini-3.5-flash` does not exist and returns `503`. The market
module works around it via `GEMINI_FALLBACK_MODELS`, but the NDVI advisor in
`recommendationService.js` has no such chain. Fixing `.env` benefits both:

```
GEMINI_MODEL=gemini-flash-latest
```

Never commit a real key. `.env` is gitignored; `.env.example` holds placeholders.

---

## 9. Verification sequence

```bash
# 1. Module health and provenance
curl -s localhost:3000/api/market/health | python3 -m json.tool

# 2. Markets seeded?
curl -s localhost:3000/api/markets | python3 -c "import json,sys;print(len(json.load(sys.stdin)['data']),'markets')"

# 3. Prices present, with provenance?
curl -s 'localhost:3000/api/market/prices?crop=tomato' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['meta'])"

# 4. ML forecast reachable?
curl -s 'localhost:3000/api/market/forecast?crop=tomato&market=nagpur' \
  | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print('ML:',d['pricePredictionAvailable'],d['modelVersion'])"

# 5. Road routing real, not estimated?
curl -s -X POST localhost:3000/api/market/recommend \
  -H 'Content-Type: application/json' \
  -d '{"crop":"tomato","quantityKg":500,"farmId":<YOUR_FARM_ID>}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print('routingDegraded:',d['dataQuality']['routingDegraded'])"

# 6. Tests
cd backend && npm test
```

Use a real farm id — find one with:

```bash
psql -U postgres -d agrichain_db -c \
  "select id, user_id, name, latitude, longitude from farms where latitude is not null;"
```

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `424 NO_MARKET_DATA` | No prices for that crop | `npm run ingest:prices`, or `npm run seed:demo-prices`. Provider coverage is 3 of 16 mandis |
| `422 MISSING_FARM_COORDINATES` | Farm has no lat/lon | Set the field boundary in Farm Setup |
| `404 FARM_NOT_FOUND` | Wrong farm id | Query `farms` (see above) |
| `403 FARM_FORBIDDEN` | Farm belongs to another user | Pass the correct `userId`, or log in |
| `routingDegraded: true` | OSRM unreachable or rate limited | Check connectivity; distances are labelled estimates meanwhile |
| `pricePredictionAvailable: false` | ML service down | Start uvicorn on 8000; check `/api/market/health` for the reason |
| `MODEL_NOT_TRAINED` | No artifact for that horizon | `python -m src.price.train --horizon 1` |
| `INSUFFICIENT_HISTORY` | Series shorter than 65 observations | Seed more days, or run `npm run ingest:prices` repeatedly as provider history accumulates |
| `weatherAvailable: false` | Open-Meteo unreachable | Spoilage uses documented defaults; recommendation still works |
| Explanation is `TEMPLATE` | Gemini unconfigured/overloaded | Check `GEMINI_API_KEY` and the model name (see §8) |
| `configSource: FALLBACK_DEFAULT` | `transport_config` empty | `npm run seed:market` |
| Integration tests all skip | Database unreachable | Start PostgreSQL; unit tests still run with `npm run test:unit` |
| ML service import error on `xgboost` | Wrong venv | Use `ml-service/venv`, not `.venv-test` or `venv-x86` |

## Market prices

The AGMARKNET API-key integration is retired. Prices come through the provider
abstraction described in [PRICE_PROVIDER.md](PRICE_PROVIDER.md) — keyless, so
there is nothing to register for and no credential to leak.

```bash
npm run map:markets        # map our mandis to provider market names
npm run ingest:prices      # ingest real observations
npm run ingest:prices -- --coverage
```

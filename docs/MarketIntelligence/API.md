# Market Intelligence — API Reference

Base URL: `http://localhost:3000`

All responses follow the existing AgriChain convention:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "requestId": "ah3o6f" } }

// failure
{ "success": false, "error": { "code": "...", "message": "...", "requestId": "ah3o6f" } }
```

`requestId` appears on every response and in the server log, so any single
recommendation can be traced through the whole pipeline.

---

## Endpoint index

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/market/recommend` | **Main endpoint** — ranked recommendation | farm ownership |
| `POST` | `/api/market/explain` | Plain-language narration of a recommendation | — |
| `GET` | `/api/market/prices` | Latest observed price per market for a crop | — |
| `GET` | `/api/market/forecast` | Observed history + ML forecast for one mandi | — |
| `GET` | `/api/market/price-trend` | Chart series (observed + forecast, flagged) | — |
| `GET` | `/api/market/channels` | Alternative selling channels | — |
| `GET` | `/api/market/transport-options` | Vehicle freight configuration | — |
| `GET` | `/api/market/health` | Data coverage, engine versions, provenance | — |
| `GET` | `/api/market/history/:farmId` | Past recommendations for a farm | farm ownership |
| `POST` | `/api/market/ingest` | Trigger a provider ingestion pass | — |
| `GET` | `/api/market/provider/coverage` | Which mandis the provider can price | — |
| `GET` | `/api/markets` | Market master list | — |
| `GET` | `/api/markets/:id` | One market by id or `market_code` | — |
| `GET` | `/api/markets/:id/prices` | Price history at one market | — |
| `GET` | `/api/crops` | Crop perishability profiles | — |
| `GET` | `/api/crops/:crop` | One crop profile + price coverage | — |
| `POST` | `/api/spoilage/predict` | Compact spoilage prediction | — |

---

## `POST /api/market/recommend`

The one endpoint that answers the farmer's question.

### Request

```json
{
  "crop": "tomato",
  "quantityKg": 500,
  "farmId": 39,
  "harvestDate": "2026-09-26",
  "productionCost": 8000
}
```

| Field | Required | Notes |
|---|---|---|
| `crop` | yes | Crop key or label; case-insensitive. Must have a crop profile |
| `quantityKg` | yes | > 0, ≤ 100,000 |
| `farmId` | yes | Numeric, or the `"farm_123"` form. Ownership enforced |
| `harvestDate` | no | `YYYY-MM-DD`. Defaults to today. Max 30 days future, 365 past |
| `productionCost` | no | Total rupees spent. **Omit it and no profit figure is returned** |
| `storageType` | no | `open` (default), `packed`, `warehouse`, `cold` |
| `vehicleType` | no | Force a `transport_config` vehicle |
| `predictionDays` | no | `1` (default) or `3` |
| `includeRouteGeometry` | no | `true` to return GeoJSON route lines |
| `userId` | no | Dev-mode identity; a JWT takes precedence |

The farmer is **never** asked for latitude, longitude, mandi coordinates,
distance, travel time, transport cost, weather, market price, or spoilage
percentage. All of those are resolved or computed server-side.

### Response (abridged)

```json
{
  "success": true,
  "data": {
    "request": {
      "crop": "tomato", "cropLabel": "Tomato",
      "quantityKg": 500, "quintals": 5,
      "harvestDate": "2026-09-26", "storageType": "open",
      "productionCost": 8000,
      "farm": { "id": 39, "name": "building", "district": "Hingna",
                "latitude": 21.0046, "longitude": 79.0477 }
    },

    "recommendation": {
      "marketId": 1, "marketCode": "nagpur",
      "marketName": "Nagpur APMC (Kalamna)", "district": "Nagpur",
      "currentPrice": 1823,
      "predictedPrice": 1809,
      "expectedMoney": 7511,
      "saleableQuantityKg": 494.5,
      "distanceKm": 24.4, "travelTimeMinutes": 24,
      "transportCost": 950,
      "spoilageRisk": "low", "estimatedLossPercent": 1.1,
      "decision": "SELL_SOON",
      "recommendedSellingWindow": "1-2 days",
      "timingReason": "Waiting 1 day would leave you about ₹711 worse off: ...",
      "confidence": "medium",
      "confidenceFactors": [
        "Prices are DEMO_SEED demonstration values, not government observations."
      ],
      "reason": "Wardha APMC quotes ₹33/quintal more, but it is 50 km further: ₹1,215 more freight and ₹2 more crop lost on the way. Selling at Nagpur APMC (Kalamna) instead leaves you about ₹1,060 better off — ₹7,511 in hand."
    },

    "markets": [
      {
        "marketId": 1, "marketCode": "nagpur",
        "marketName": "Nagpur APMC (Kalamna)", "district": "Nagpur",
        "latitude": 21.15, "longitude": 79.12,
        "evaluated": true,

        "currentPrice": 1823, "minPrice": "1673.00", "maxPrice": "1973.00",
        "variety": "Local", "arrivalQuantity": 231,
        "priceUnit": "INR_PER_QUINTAL",
        "priceSource": "DEMO_SEED", "isDemoData": true,
        "observationDate": "2026-09-24", "priceAgeInDays": 2, "freshness": "FRESH",

        "predictedPrice": 1809, "predictedChange": -14,
        "predictionHorizonDays": 1,
        "predictionModelVersion": "price_xgb_v1_h1-demo",
        "predictionConfidence": "medium",
        "pricePredictionAvailable": true,
        "pricePredictionUnavailableReason": null,

        "distanceKm": 24.4, "straightLineKm": 17.8,
        "travelTimeMinutes": 24,
        "routeMethod": "OSRM_ROAD", "isRoadRoute": true,
        "routeProvider": "OSRM", "routeDegradedReason": null,
        "routeGeometry": null,

        "transportCost": 950,
        "transportBreakdown": { "runningCost": 600, "loadingCost": 200,
                                "unloadingCost": 150, "minimumChargeApplied": false,
                                "tollCost": 0 },
        "vehicle": { "type": "tempo", "label": "Tempo / Pickup (up to 1 t)",
                     "capacityKg": 1000, "ratePerKm": 18, "returnTripFactor": 1.35 },
        "trips": 1,

        "spoilageRisk": "low", "spoilageRiskScore": 29,
        "estimatedLossPercent": 1.1, "estimatedLossKg": 5.5,
        "estimatedLossValue": 100,
        "saleableQuantityKg": 494.5, "safeDays": 1,
        "spoilageFactors": ["High temperature", "No cold storage"],
        "spoilageEngine": "RULE_BASED_BASELINE",
        "spoilageModelVersion": "spoilage_baseline_v1",

        "quantityKg": 500,
        "grossSaleValue": 9115,
        "expectedSaleValue": 9015,
        "otherCosts": 554,
        "otherCostsBreakdown": { "commission": 361, "marketCess": 95,
                                 "hamali": 74, "weighing": 25 },
        "totalDeductions": 1604,
        "expectedMoney": 7511,
        "realizedPricePerKg": 15.02,
        "retentionPercent": 82.4,

        "rank": 1, "recommended": true, "deltaVsBest": 0,
        "isHighestPriceButNotBest": false
      }
      // ... remaining markets, ranked by expectedMoney descending
    ],

    "breakeven": {
      "available": true, "productionCostAvailable": true,
      "productionCost": 8000, "quantityKg": 500,
      "breakEvenPricePerKg": 16, "breakEvenPricePerQuintal": 1600,
      "expectedProfit": -489, "profitable": false, "roiPercent": -6.1,
      "engineVersion": "net_return_v1"
    },

    "timing": {
      "decision": "SELL_SOON",
      "reason": "...",
      "recommendedWindow": "1-2 days",
      "recommendedWindowDays": { "from": 1, "to": 2 },
      "confidence": "medium",
      "basis": "GAIN_BELOW_THRESHOLD",
      "priceForecastAvailable": true,
      "holdComparison": {
        "holdDays": 1,
        "sellNowExpectedMoney": 7511,
        "holdExpectedMoney": 6800,
        "netGainFromWaiting": -711,
        "netGainPercent": -9.5,
        "forecastPriceChangePerQuintal": -13.8,
        "additionalSpoilagePercent": 7.6,
        "additionalSpoilageValue": 687,
        "safeDaysRemaining": 1,
        "modelVersion": "price_xgb_v1_h1-demo",
        "forecastConfidence": "medium",
        "comparisonBasis": "BOTH_BRANCHES_REPRICED"
      },
      "engine": "RULE_BASED",
      "engineVersion": "sell_timing_v1"
    },

    "conditions": {
      "available": true, "temperatureC": 27, "humidity": 64,
      "condition": "Overcast", "windSpeedKmph": 37, "precipitation": 0,
      "observedAt": "2026-09-26T14:15:00.000Z", "source": "Open-Meteo"
    },

    "dataQuality": {
      "containsDemoData": true,
      "priceSources": ["DEMO_SEED"],
      "freshness": "FRESH", "observationDate": "2026-09-24",
      "routingDegraded": false,
      "weatherAvailable": true,
      "pricePredictionAvailable": true,
      "spoilageEngine": "RULE_BASED_BASELINE",
      "spoilageModelVersion": "spoilage_baseline_v1",
      "priceModelVersion": "price_xgb_v1_h1-demo",
      "netReturnEngineVersion": "net_return_v1"
    },

    "diagnostics": {
      "marketsWithPriceData": 16, "droppedNoCoordinates": 0,
      "droppedOutsideRadius": 8, "droppedStalePrice": 0,
      "radiusKm": 150, "evaluated": 8, "durationMs": 1408
    },

    "engineVersion": "market_recommend_v1",
    "generatedAt": "2026-09-26T14:35:12.004Z",
    "recommendationId": 1,
    "requestId": "ah3o6f"
  }
}
```

### Status codes

| Code | Meaning | `error.code` |
|---|---|---|
| `200` | Recommendation produced (possibly degraded — check `dataQuality`) | — |
| `400` | Validation failed; `error.fields` lists **every** problem | `VALIDATION_FAILED` |
| `403` | Farm belongs to another account, or token invalid | `FARM_FORBIDDEN`, `AUTH_INVALID` |
| `404` | No such farm | `FARM_NOT_FOUND` |
| `422` | Farm has no saved location | `MISSING_FARM_COORDINATES` |
| `424` | No usable price data for this crop | `NO_MARKET_DATA` |
| `503` | Prices exist but no market could be priced end to end | `NO_EVALUABLE_MARKET` |

Validation error example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Which crop are you selling?",
    "fields": [
      { "field": "crop", "code": "CROP_REQUIRED", "message": "Which crop are you selling?" },
      { "field": "quantityKg", "code": "QUANTITY_NEGATIVE", "message": "Quantity cannot be negative." },
      { "field": "farmId", "code": "FARM_ID_REQUIRED", "message": "Select which field this harvest came from." }
    ],
    "requestId": "b2k9xz"
  }
}
```

Full validation code list: `CROP_REQUIRED`, `CROP_NOT_SUPPORTED`,
`QUANTITY_REQUIRED`, `QUANTITY_ZERO`, `QUANTITY_NEGATIVE`, `QUANTITY_INVALID`,
`QUANTITY_TOO_LARGE`, `FARM_ID_REQUIRED`, `FARM_ID_INVALID`,
`HARVEST_DATE_INVALID`, `HARVEST_DATE_TOO_FAR_FUTURE`, `HARVEST_DATE_TOO_OLD`,
`PRODUCTION_COST_INVALID`, `PRODUCTION_COST_NEGATIVE`, `COORDINATES_INVALID`.

---

## `POST /api/market/explain`

Restates a recommendation in plain language, optionally in another language.

**Post the recommendation payload back verbatim** — it is not re-fetched, and
crucially not re-computed.

```json
{ "...the full data object from /recommend...": "", "language": "en" }
```

```json
{
  "success": true,
  "data": {
    "available": true,
    "source": "GEMINI",
    "isAiGenerated": true,
    "model": "gemini-flash-lite-latest",
    "summary": "You should sell your 500 kilograms of Tomato at Nagpur APMC (Kalamna) in 1-2 days to get an expected money of 7511 rupees.",
    "paragraphs": ["...", "...", "..."],
    "note": "Narration only. Every figure was computed by the deterministic engines; the language model did not calculate or alter any value."
  }
}
```

`source` is `GEMINI` when the model answered, or `TEMPLATE` when a deterministic
template was used instead (with `reason` giving `GEMINI_NOT_CONFIGURED`,
`GEMINI_RATE_LIMITED`, `GEMINI_OVERLOADED`, `GEMINI_MODEL_NOT_FOUND`,
`GEMINI_UNUSABLE_RESPONSE` or `GEMINI_ERROR`). The template path always works and
needs no API key.

---

## `GET /api/market/prices`

`?crop=tomato&lat=21.0046&lon=79.0477&radiusKm=80`

Latest observed price per market. Distance-ordered when coordinates are given.

```jsonc
{
  "success": true,
  "data": [{
    "marketId": 1, "marketCode": "nagpur", "marketName": "Nagpur APMC (Kalamna)",
    "district": "Nagpur", "latitude": 21.15, "longitude": 79.12,
    "crop": "tomato", "variety": "Local",
    "minPrice": "1673.00", "maxPrice": "1973.00", "modalPrice": "1823.00",
    "arrivalQuantity": "231.00", "priceUnit": "INR_PER_QUINTAL",
    "source": "DEMO_SEED", "isDemoData": true,
    "observationDate": "2026-09-24", "fetchedAt": "...",
    "ageInDays": 2, "freshness": "FRESH",
    "straightLineKm": 17.8
  }],
  "meta": {
    "crop": "tomato", "count": 8,
    "distanceBasis": "STRAIGHT_LINE",
    "distanceNote": "Straight-line distance only. Road distance and freight come from POST /api/market/recommend.",
    "containsDemoData": true
  }
}
```

Prices are returned as **strings** — they come from `NUMERIC` columns and are
deliberately not passed through a float. Freshness is `FRESH` | `RECENT` |
`STALE` | `EXPIRED`, from configurable day thresholds.

---

## `GET /api/market/forecast`

`?crop=tomato&market=nagpur&historyDays=7`

`market` accepts a numeric id or a `market_code`.

```json
{
  "success": true,
  "data": {
    "crop": "tomato", "marketId": 1,
    "marketName": "Nagpur APMC (Kalamna)", "marketCode": "nagpur",
    "priceUnit": "INR_PER_QUINTAL",
    "currentPrice": 1823, "observationDate": "2026-09-24", "source": "DEMO_SEED",
    "observed": [{ "date": "2026-09-24", "pricePerQuintal": 1823, "isObserved": true,
                   "source": "DEMO_SEED", "isDemoData": true }],
    "forecast": [
      { "date": "2026-09-25", "pricePerQuintal": 1809, "isObserved": false,
        "horizonDays": 1, "modelVersion": "price_xgb_v1_h1-demo", "confidence": "medium" },
      { "date": "2026-09-28", "pricePerQuintal": 1787, "isObserved": false,
        "horizonDays": 3, "modelVersion": "price_xgb_v1_h3-demo", "confidence": "medium" }
    ],
    "points": [ "...observed then forecast, each with isObserved..." ],
    "containsDemoData": true,
    "pricePredictionAvailable": true,
    "predictionUnavailableReason": null,
    "isMachineLearning": true,
    "engine": "ML_MODEL",
    "modelVersion": "price_xgb_v1_h1-demo"
  }
}
```

Observed and predicted points are **never merged into one undifferentiated
series** — `isObserved` separates them so a forecast cannot be rendered as a
recorded price. Target dates skip Sundays, when mandis do not auction.

Returns `200` with `pricePredictionAvailable: false` when the model is
unreachable or history is too short — that is a normal state, not an error.

---

## `GET /api/market/channels`

`?crop=tomato&quantityKg=500`

```json
{
  "success": true,
  "data": [
    { "id": "apmc", "name": "APMC Wholesale Mandi", "netReturn": null,
      "usesRecommendedMarket": true, "dataAvailable": true,
      "tradeoff": "Best price discovery, but you pay freight and commission." },
    { "id": "fpo", "name": "Farmer Producer Organisation (FPO)", "netReturn": null,
      "dataAvailable": false, "unavailableReason": "NO_FPO_PRICE_FEED",
      "tradeoff": "Usually a lower headline rate, but little or no freight to pay." }
  ],
  "meta": {
    "note": "Only the APMC channel has live figures. Other channels are listed without rupee values because this system has no price feed for them; no amounts are estimated."
  }
}
```

Only APMC has figures, and they come from `/recommend`. The others carry
`netReturn: null` with an explicit `unavailableReason` — no amount is invented.

---

## `GET /api/market/health`

The endpoint to check before a demo. Reports price coverage per crop and source,
whether any real provider data exists, and every engine's version and nature.

```jsonc
{
  "success": true,
  "data": {
    "status": "ok",
    "markets": 16,
    "priceCoverage": [{ "crop": "tomato", "source": "DEMO_SEED", "isDemoData": true,
                        "observations": 3712, "markets": 16,
                        "earliest": "2025-12-29", "latest": "2026-09-24",
                        "freshness": "FRESH" }],
    "dataProvenance": {
      "hasRealProviderData": true,
      "hasDemoData": true,
      "realSources": ["MANDI_API", "AGMARKNET"],
      "warning": null
    },
    "engines": {
      "priceModel": { "engine": "ML_MODEL", "algorithm": "XGBoost regression",
                      "available": true, "model_version": "price_xgb_v1_h1-demo",
                      "metrics": { "test": { "mae": 40.4, "rmse": 60.32, "mape": 1.816 } },
                      "provides_prediction_intervals": false },
      "spoilage":  { "engine": "RULE_BASED_BASELINE", "isMachineLearning": false,
                     "modelVersion": "spoilage_baseline_v1",
                     "note": "Deterministic Q10-based rule set, not a trained model." },
      "routing":   { "provider": "osrm", "configured": true, "cachedRoutes": 8,
                     "fallbackDetourFactor": 1.3 },
      "transport": { "engine": "DETERMINISTIC_CONFIG", "vehicles": 4 },
      "netReturn": { "engine": "DETERMINISTIC", "version": "net_return_v1" },
      "recommendation": { "version": "market_recommend_v1" }
    }
  }
}
```

---

## `POST /api/market/ingest`

Triggers a provider ingestion pass. Returns `200` on success (including
`PARTIAL`), `424` only when nothing at all was ingested. No API key is involved;
missing or the API is unreachable — with the reason, so an operator can see why
nothing was ingested.

```json
{ "state": "Maharashtra", "maxPages": 5 }
```

```json
{
  "success": true,
  "data": {
    "status": "SUCCESS", "provider": "mandi_api", "source": "MANDI_API", "state": "Maharashtra",
    "recordsFetched": 1840, "recordsMatched": 112, "recordsWritten": 112,
    "unmappedMarkets": ["Pune/Pune(Khadiki)"]
  }
}
```

Only rows actually returned by data.gov.in are written with
`source: 'MANDI_API'`. Nothing is synthesised, interpolated or back-filled.

---

## `GET /api/markets` · `GET /api/markets/:id` · `GET /api/markets/:id/prices`

Market master data. `:id` accepts a numeric id or `market_code`.
`coordinateSource` tells you the coordinates are `CITY_CENTROID` — a town centre,
not a surveyed yard gate — so every derived distance inherits that uncertainty.

`/api/markets/:id/prices` returns the latest price per crop at that market, or
`?crop=tomato&days=30` for one crop's history.

---

## `GET /api/crops` · `GET /api/crops/:crop`

Crop perishability profiles, read from `crop_profiles` when populated and falling
back to the code defaults (`meta.source` says which). `hasMarketPriceData` tells
you whether a crop can actually be recommended right now.

```json
{ "crop": "tomato", "label": "Tomato", "perishability": "high",
  "shelfLifeDays": 12, "temperatureSensitivity": "high",
  "optimalTempC": 13, "optimalHumidity": 90, "isGrain": false,
  "configVersion": "crop_profiles_v1", "hasMarketPriceData": true }
```

---

## `POST /api/spoilage/predict`

The compact spoilage contract. Same `RULE_BASED_BASELINE` engine as the existing
`POST /api/spoilage/assess` — this is a projection of it, not a second model.

```json
{ "crop": "tomato", "quantityKg": 500, "harvestDate": "2026-09-25",
  "distanceKm": 85, "temperatureC": 33, "humidity": 68, "pricePerQuintal": 2800 }
```

```json
{
  "success": true,
  "data": {
    "risk": "high", "riskScore": 81,
    "estimatedLossPercent": 28, "estimatedLossKg": 140,
    "estimatedLossValue": 3920, "saleableQuantityKg": 360,
    "safeDays": 0, "effectiveShelfLifeDays": 2.2,
    "factors": ["High temperature", "Air is too dry", "No cold storage"],
    "factorDetails": [{ "label": "High temperature",
                        "detail": "33°C is 20°C above the ideal 13°C for tomato",
                        "severity": "high", "impact": 40 }],
    "conditionsSource": "user-input",
    "engine": "RULE_BASED_BASELINE",
    "modelVersion": "spoilage_baseline_v1",
    "isMachineLearning": false
  }
}
```

`temperatureC` / `humidity` are optional — supply `farmId` and they are fetched
from the weather service. `estimatedLossValue` is `null` unless
`pricePerQuintal` is given; a loss is never valued at a guessed price.

---

## ML service (FastAPI, port 8000)

Called by the backend, not by the browser.

### `POST /predict/price`

```json
{ "crop": "tomato", "market_id": 1, "prediction_days": 1 }
```

```json
{
  "crop": "tomato", "market_id": 1,
  "current_price": 1823.0, "predicted_price": 1809.18, "predicted_change": -13.82,
  "prediction_horizon_days": 1,
  "last_observation_date": "2026-09-24",
  "price_unit": "INR_PER_QUINTAL",
  "model_version": "price_xgb_v1_h1-demo",
  "confidence": "medium",
  "confidence_basis": "qualitative band derived from held-out test MAPE and whether the model beat a naive persistence baseline; NOT a statistical prediction interval",
  "provides_prediction_intervals": false,
  "beats_persistence_baseline": true,
  "trained_on_demo_data": true,
  "test_mae": 40.4, "test_mape": 1.816,
  "input_data_source": "DEMO_SEED"
}
```

`503` when no model is trained, `422` when history is too short. Both are
recoverable — the backend falls back to the observed price.

### `GET /price-model/info?horizon_days=1`

Full training metadata: data provenance, chronological split sizes, validation
and test MAE/RMSE/MAPE, the persistence-baseline comparison, feature list and
importances, hyperparameters.

`confidence` is a **qualitative band** derived from held-out error, not a
statistical interval. `provides_prediction_intervals` is `false` and the
`lower_bound` / `upper_bound` columns stay `NULL` — no spread is invented.

---

**Price provider:** the AGMARKNET API-key integration is retired. See
[PRICE_PROVIDER.md](PRICE_PROVIDER.md) — keyless provider abstraction,
`POST /api/market/ingest`, `GET /api/market/provider/coverage`.

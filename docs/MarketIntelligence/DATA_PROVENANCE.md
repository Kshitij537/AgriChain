# Data Provenance — what is real, what is not

This document exists so that nobody — evaluator, farmer, or future maintainer —
can be misled about where a number came from. Read it before demonstrating or
describing this module.

**The short version, as of 26 September 2026:**

> All mandi prices in this deployment are **synthetic demonstration data**
> Mandi prices are now a MIX: markets mapped to the price provider carry real
> `MANDI_API` observations, and unmapped markets still carry `DEMO_SEED` rows.
> Provider coverage is 3 of 16 mandis, so most of the grid is still demo — see
> [PRICE_PROVIDER.md](PRICE_PROVIDER.md). Every row is labelled per market. The
> price forecasting model is currently trained
> on synthetic data and is versioned `price_xgb_v1_h1-demo` to say so. The
> spoilage engine is a **rule-based baseline, not machine learning**. Road
> distances and weather are **real, live** external data.

---

## 1. Classification of every number

| Number | Nature | Source / identifier | Real? |
|---|---|---|---|
| Mandi modal / min / max price | Observation | `market_prices.source` = `MANDI_API` (real), `AGMARKNET` (legacy), or `DEMO_SEED` | **Mixed — per-market** |
| Arrival quantity | Observation | same row | Currently DEMO |
| Market name, district, state | Master data | `scripts/seedMarketData.js` | **Real** |
| Market latitude / longitude | Master data | `coordinate_source: CITY_CENTROID` | Real, ~km accurate |
| Farm latitude / longitude | User data | `farms` table | **Real** (farmer-entered) |
| Road distance, travel time | External API | OSRM road network, `OSRM_ROAD` | **Real** |
| Fallback distance | Estimate | haversine × 1.3, `STRAIGHT_LINE_ESTIMATE` | Estimate, labelled |
| Temperature, humidity | External API | Open-Meteo, live | **Real** |
| Predicted future price | **ML** | XGBoost, `price_xgb_v1_h{1,3}` | Model output |
| Spoilage risk / loss % / loss kg | **Rule-based** | `RULE_BASED_BASELINE`, `spoilage_baseline_v1` | Not ML, not measured |
| Crop shelf life, optimal temp/humidity | Reference data | `crop_profiles` / `CROP_PROFILES` | Published agronomy |
| Freight cost | Deterministic config | `transport_config`, `DETERMINISTIC_CONFIG` | Indicative rates |
| Commission, cess, hamali, weighing | Configured estimate | `CONFIGURED_ESTIMATE`, `selling_costs_v1` | **Not verified statutory** |
| Gross sale, expected money, breakeven | Deterministic arithmetic | `net_return_v1` | Computed, exact |
| Ranking | Deterministic sort | `market_recommend_v1` | Computed |
| Sell now / wait | Rule-based | `sell_timing_v1` | Rule output |
| `confidence` label | Qualitative | derived from data-quality flags | **Not statistical** |
| Plain-language explanation | LLM narration | `GEMINI` or `TEMPLATE` | Prose only |
| `activeAgents`, `liquidity` (UI fields) | **No data source** | returned as `null` | Deliberately absent |
| Toll cost | **No data source** | always `0` with a comment | Deliberately absent |
| FPO / haat / processor returns | **No data source** | `netReturn: null` + `unavailableReason` | Deliberately absent |

---

## 2. Market prices

### Real path — price provider (`source: 'MANDI_API'`)

`backend/src/services/marketPriceIngestService.js`, through the provider
abstraction in `src/services/providers/`, pulls commodity prices from the
Government of India Open Government Data platform (`data.gov.in`, resource
`9ef84268-d588-465a-a308-a864a43d0070`).

Guarantees in the code:

- Only rows **actually returned by the provider** are written with `source: 'MANDI_API'`.
- Nothing is synthesised, interpolated or back-filled. If the API is down,
  **zero** rows are written and the outcome says so.
- Commodity names are mapped to our crop keys through an explicit table; an
  unrecognised commodity is skipped, never guessed.
- Market matching is by explicit `market_provider_map` rows with `match_type`
  `EXACT` or `VERIFIED`; a `FUZZY` candidate is recorded but never ingested, so one
  mandi's prices can never be attributed to another. Unmatched markets are
  reported in `unmappedMarkets`, not force-fitted.

**Enable it:** register free at <https://data.gov.in/>, set
`npm run map:markets`, then `npm run ingest:prices` (or `POST /api/market/ingest`). No API key is needed.

**Historical depth caveat:** the public daily-price resource exposes *current*
arrivals, not a deep archive. Lag and rolling features for the price model are
therefore built by accumulating daily snapshots over time. Until enough days
accumulate, training will correctly refuse rather than fit noise.

### Demo path — `source: 'DEMO_SEED'`

`backend/src/scripts/seedDemoPrices.js` generates a synthetic daily series so the
model, the engine and the demo can be built before credentials exist.

- Deterministic (fixed seed), so a rebuild reproduces identical numbers.
- A mean-reverting random walk plus an annual seasonal cycle and a mild trend.
- Sundays are skipped, because mandis do not auction.
- Perishable crops are given larger swings than grains — the one real-world
  property the generator deliberately reproduces.

**These are not measurements and must never be described as government data.**
Current contents: 5 crops × 16 markets × ~270 days = **18,560 observations**,
29 Dec 2025 → 24 Sep 2026.

Remove them once real data flows:

```sql
DELETE FROM market_prices WHERE source = 'DEMO_SEED';
```

### How demo data surfaces to the user

```
market_prices.source = 'DEMO_SEED'
  → marketPriceService: isDemoData: true  on every price row
  → marketService:      dataQuality.containsDemoData: true
  → confidenceFactors:  "Prices are DEMO_SEED demonstration values, not
                         government observations."
  → /api/market/health: dataProvenance.warning
  → Market page:        amber banner + "Demo Data" chip
  → model version:      suffixed "-demo"
```

---

## 3. Price prediction — genuinely machine learning

| | |
|---|---|
| Algorithm | XGBoost regression (`XGBRegressor`) |
| Model versions | `price_xgb_v1_h1-demo`, `price_xgb_v1_h3-demo` |
| Target | **Price change** from the last known price; predictions reconstructed as `lag_1 + predicted_delta` |
| Horizons | 1 and 3 trading days |
| Split | **Chronological** — 70% train / 15% validation / 15% test |
| Training rows | 16,160 (from 18,560 observations) |
| Trained on | `DEMO_SEED` only → `trained_on_real_data: false` |

### Test metrics (horizon 1)

| Metric | Model | Persistence baseline |
|---|---|---|
| MAE | ₹40.40 | ₹40.61 |
| RMSE | ₹60.32 | ₹60.60 |
| MAPE | 1.816% | 1.829% |

**The model beats "tomorrow equals today" by 0.52% MAE.** That is a marginal
improvement and is reported as such rather than dressed up. It is the honest
result of fitting a mean-reverting random walk — the generator leaves little
learnable signal by construction. Re-evaluate on real provider history before
claiming the model adds value.

Horizon 3: MAE ₹66.10, MAPE 2.90%.

### Why the delta, not the level

Daily mandi prices are close to a random walk. A model fitted to the price
*level* spends its capacity re-learning the level and extrapolates trend badly
out of sample. Fitting the *change* bounds the worst case at persistence:
predicting a delta of zero reproduces the naive baseline exactly, so the model
can only add information.

### Leakage prevention

The single most important property of `src/price/features.py`:

> A row whose target is the price on date *T* may only use information available
> strictly before *T*.

- `lag_1` is the price **at** the prediction origin; `lag_k` reaches `k−1` further back
- every rolling statistic is computed over a window **ending at** the origin
- calendar features describe the **target** date, which is known in advance
- the target is `modal_price` shifted forward and is never an input

This is not merely asserted — `assert_no_leakage()` re-verifies it on the built
frame, checking that no feature column reproduces the target and that every
target date is strictly after its origin. An off-by-one in a shift silently
produces near-perfect metrics, so the check runs against the data, not the code.

Lags are **positional (trading days)**, not calendar days, because mandis are
shut on Sundays and holidays — consecutive observations are not consecutive
dates, and inventing prices for non-trading days would be fabrication.

### Confidence — what it is and is not

```json
"confidence": "medium",
"confidence_basis": "qualitative band derived from held-out test MAPE and whether the model beat a naive persistence baseline; NOT a statistical prediction interval",
"provides_prediction_intervals": false
```

The model produces a **point estimate only**. There is no quantile regression, no
conformal prediction, no bootstrap. The `confidence` string is a plain-language
summary of held-out error plus whether the model beat the baseline. A model that
cannot beat persistence is capped at `low` regardless of its MAPE.

The `price_predictions.lower_bound` / `upper_bound` columns exist for a future
model that genuinely produces intervals. They are `NULL` today and are never
populated with an invented spread.

### Saved artifacts

```
ml-service/models/price/
  price_model_h1.joblib            model + feature column order + version
  price_model_h1_metadata.json     provenance, split, metrics, importances, hyperparams
  price_model_h3.joblib
  price_model_h3_metadata.json
```

Training code (`src/price/train.py`) is strictly separate from inference
(`src/price/inference.py`). Inference only ever **consumes** a saved artifact —
the model is never trained on an API request. The artifact is loaded once per
process and cached.

---

## 4. Spoilage — a rule-based baseline, NOT machine learning

Every response says so:

```json
"engine": "RULE_BASED_BASELINE",
"modelVersion": "spoilage_baseline_v1",
"isMachineLearning": false
```

### Why no model was trained

There is **no labelled post-harvest spoilage dataset in this repository** — no
records of "this load travelled N hours at T °C and arrived X% spoiled". The
`dataset/` directory contains leaf images for disease classification, which is a
different problem entirely.

Fabricating such a dataset and fitting a regressor to it would manufacture an
accuracy figure that means nothing: the model would learn the rules used to
generate the labels, report an impressive R², and know nothing about tomatoes.
A physics-based rule set is honest about what it is and can be audited by an
agronomist, which a model trained on invented labels cannot.

### The model

```
effectiveShelfLife = baseShelfLife × storageFactor × tempFactor × humidityFactor
exposure           = daysSinceHarvest + transitDays × stressMultiplier
riskScore          = clamp(exposure / effectiveShelfLife × 100, 0, 100)
lossFraction       = min(0.90, 0.45 × (exposure / effectiveShelfLife)^2.2)
```

- **`tempFactor`** uses a **Q10 respiration model** — deterioration rate roughly
  doubles for every 10 °C above the crop's optimum. This is the standard
  first-order approximation for post-harvest deterioration and is published
  agronomy, not invention.
- **`humidityFactor`** penalises both extremes: produce wilts when too dry and
  moulds when too wet; grains are the inverse and spoil chiefly from moisture.
- **Transit hours are weighted above storage hours**, because a long journey
  without a cold chain causes mechanical and thermal damage beyond elapsed time.

### The two rules of thumb, named honestly

| Constant | Value | What it encodes |
|---|---|---|
| `LOSS_AT_FULL_EXPOSURE` | 0.45 | A consignment at the end of its window typically has 40–50% downgraded or unsellable, the rest saleable at lower grade |
| `LOSS_CURVE_EXPONENT` | 2.2 | Spoilage is convex: produce halfway through its life is nearly intact, then deteriorates sharply |
| `MAX_LOSS_FRACTION` | 0.90 | Produce held well past its window is mostly refuse, but claiming 100% overstates what this rule set can know |

Resulting curve:

| Shelf life consumed | 20% | 45% | 75% | 100% |
|---|---|---|---|---|
| Load lost | ~1.3% | ~7.8% | ~24% | 45% |

**These are documented rules of thumb, not measured coefficients.** They are the
first thing a real post-harvest dataset should replace.

### Upgrading to ML later

Keep `assessSpoilageRisk` and `estimateSpoilageLossForMarket` as the interface,
swap the internals, and bump `SPOILAGE_MODEL_VERSION` to e.g.
`spoilage_xgb_v1`. Callers need no change, and every stored assessment stays
traceable to the engine that produced it.

If a validated dataset becomes available: regression (XGBoost / Random Forest /
Gradient Boosting) for loss percentage, evaluated with MAE and RMSE; if framed as
risk classification, report precision, recall, F1 and a confusion matrix.

---

## 5. Routing — real road network, with a labelled fallback

**Real:** OSRM (`https://router.project-osrm.org`) returns the distance a truck
actually drives. In Vidarbha this is typically 20–40% longer than the straight
line — a gap that is real money in freight:

| | Straight line | OSRM road | Difference |
|---|---|---|---|
| Hingna farm → Nagpur APMC | 17.8 km | 24.4 km | **+37%** |

**Fallback:** when routing is unavailable, `haversine × 1.3`, always labelled:

```json
"routeMethod": "STRAIGHT_LINE_ESTIMATE",
"isRoadRoute": false,
"routeDegradedReason": "ROUTING_API_FAILED",
"detourFactorApplied": 1.3,
"assumedSpeedKmph": 35
```

A straight-line figure presented as a road distance would under-quote freight and
could flip the ranking, so `isRoadRoute` is a first-class field, the degradation
appears in `dataQuality.routingDegraded`, and it is named in
`confidenceFactors`. The 1.3 circuity factor is the commonly cited figure for
Indian district road networks — an admitted approximation, which is why the
result is labelled.

The public OSRM demo server is rate limited; self-host for real load.

---

## 6. Weather — real and live

Open-Meteo (no API key required), through the project's existing
`weatherService`. Temperature and humidity feed the spoilage baseline.

When unavailable, the response is explicit and no reading is invented:

```json
"conditions": { "available": false, "reason": "WEATHER_API_FAILED" },
"dataQuality": { "weatherAvailable": false }
```

The spoilage engine then uses its documented defaults (28 °C, 70%), confidence
drops, and the reason is named. The recommendation is never made dependent on
weather availability.

---

## 7. Freight and selling costs — configuration, not measurement

### Freight (`transport_config` table)

Indicative Vidarbha hire rates, seeded by `scripts/seedMarketData.js`:

| Vehicle | ₹/km | Loading | Unloading | Minimum | Capacity | Return factor |
|---|---|---|---|---|---|---|
| Tempo / Pickup | 18 | 200 | 150 | 600 | 1,000 kg | 1.35 |
| Mini Truck (Tata Ace) | 25 | 300 | 200 | 900 | 3,000 kg | 1.30 |
| Medium Truck | 38 | 500 | 400 | 2,000 | 9,000 kg | 1.25 |
| Large Truck | 52 | 800 | 600 | 4,000 | 16,000 kg | 1.20 |

Held in the **database** specifically so a district or fuel-price correction needs
no code change. `configVersion` travels with every quote.

### Selling costs (`constants/marketCosts.js`)

| Charge | Default | Env override |
|---|---|---|
| Commission | 4% of realised sale | `MARKET_COMMISSION_PERCENT` |
| Market cess / user fee | 1.05% | `MARKET_CESS_PERCENT` |
| Hamali (yard labour) | ₹15/quintal | `MARKET_HAMALI_PER_QUINTAL` |
| Weighing / grading | ₹5/quintal | `MARKET_WEIGHING_PER_QUINTAL` |

**These are `CONFIGURED_ESTIMATE`, not verified statutory rates for any specific
APMC committee.** Maharashtra deregulated fruit and vegetable trade from APMC
compulsion (2016 onward) and who bears the commission varies by yard and buyer.
A farmer must confirm actual deductions with their own mandi. Set
`MARKET_APPLY_SELLING_COSTS=false` to model a sale with no deductions; the
response then reports `sellingCostsApplied: false`.

Percentage charges apply to the value **actually realised** — you are not charged
commission on produce that rotted — while per-quintal charges apply to the
quantity actually handled.

---

## 8. Gemini — narration only, numbers locked

`marketExplanationService.js` enforces a hard boundary. Gemini **must not**:

- choose or re-rank a market
- compute, adjust or round any rupee figure
- invent a price, distance, loss percentage or date
- override the decision or the selling window

Three mechanisms enforce it:

1. **Whitelisted facts.** The prompt receives a flat fact sheet extracted by
   `extractFacts()`, never the raw recommendation. The model cannot cite a number
   it was never given.
2. **Prose-only contract.** The prompt states explicitly that every number is
   final, and requests `{ summary, paragraphs }` — no numeric fields.
3. **Returned alongside, never merged.** The explanation is a sibling of the
   structured data. A hallucinated figure in the prose can never become the
   figure the API reports or the farmer acts on.

Every response carries:

```json
"note": "Narration only. Every figure was computed by the deterministic engines; the language model did not calculate or alter any value."
```

When Gemini is unconfigured, rate-limited, overloaded or returns something
unusable, a **deterministic template** narration is returned instead and `source`
says `TEMPLATE`. The explanation is never load-bearing.

---

## 9. Fields deliberately left empty

Returning `null` with a reason is better than returning a plausible number with
no basis. The following have **no data source** in this system and are not
estimated:

| Field | Why |
|---|---|
| `activeAgents`, `liquidity` | No trader-registry or arrivals-depth feed |
| `breakdown.tollCost` | No toll dataset wired in; always 0 with a comment |
| FPO / haat / processor `netReturn` | No price feed; `unavailableReason` given |
| `forecast.confidencePct` | The model has no statistical interval to report |
| `price_predictions.lower_bound/upper_bound` | Same |
| `expectedProfit` without `productionCost` | `productionCostAvailable: false` |

---

## 10. Pre-demo provenance checklist

```bash
curl -s localhost:3000/api/market/health | python3 -m json.tool
```

Confirm and be ready to state:

- [ ] `dataProvenance.hasRealProviderData` + per-market `isDemoData`; say "demo prices" for unmapped mandis
- [ ] `dataProvenance.warning` — read it aloud if asked about data
- [ ] `engines.priceModel.model_version` — ends `-demo`; that suffix is the point
- [ ] `engines.priceModel.metrics.beats_persistence_baseline` — true, by 0.52%
- [ ] `engines.spoilage.isMachineLearning` — **false**; call it a rule-based baseline
- [ ] `engines.routing.provider` — `osrm`; distances are real road distances
- [ ] The Market page's amber banner is visible and says prices are demo data

If asked *"is this real?"*, the honest answer is:

> "The road distances, travel times and weather are live and real. The economics
> engine is exact deterministic arithmetic. The mandi prices are synthetic
> demonstration data because we do not have a data.gov.in key yet — the ingestion
> service is written and tested, and every response and the UI say the prices are
> demo. The spoilage figure is a documented agronomic rule set, not a trained
> model, and it reports itself as such. The price forecast is a real XGBoost model
> with a leakage-checked chronological split, but it is trained on the synthetic
> prices, so it is versioned `-demo` and beats the naive baseline by only 0.52%."

## Price provenance after the provider change

`market_prices.source` values:

| value | meaning |
|---|---|
| `MANDI_API` | fetched from the current price provider. The provider aggregates
data.gov.in and is **never** described in the application as an independent
government source — the label names the service we fetched from, which is the
only thing we can vouch for. |
| `AGMARKNET` | **legacy.** Written by the retired data.gov.in API-key integration.
No ingestion path produces it any more; retained so historical rows keep their
original meaning. |
| `DEMO_SEED` | generated demonstration data. Flagged as `isDemoData` on every
market row and surfaced in the UI. |

See [PRICE_PROVIDER.md](PRICE_PROVIDER.md) for measured upstream behaviour,
coverage (3 of 16 mandis) and the mapping discipline that prevents one mandi's
prices being attributed to another.

# Freight Rate Provenance

## The problem this solves

Freight is the second largest deduction on a farmer's ledger. Until now the ₹/km
behind it was an **indicative figure written into the seed script with no source** —
₹18/25/38/52 per km by vehicle class. Plausible, never verified, and presented to
the farmer with the same confidence as the road distance, which *is* real.

There is no public API that publishes "₹/km for a mini truck in Wardha today."
So instead of inventing one, the freight rate now resolves from whatever evidence
actually exists, and **always says which**.

## Precedence — best evidence first

| # | `rateSource` | What it means | `isRealRate` |
|---|---|---|---|
| 1 | `TRANSPORTER_QUOTE` | A named, phone-reachable transporter quoted this rate on this date | **true** |
| 2 | `ESTIMATE_FUEL_INDEXED` | Our estimated baseline, moved by the ratio of observed diesel to the diesel price the baseline was declared against | false |
| 3 | `CONFIGURED_ESTIMATE` | The static `transport_config` rate. Unsourced | false |

`isRealRate` is true **only** for a quote. An indexed estimate is still an
estimate — the *movement* is real, the base is not.

## Why indexation, not derivation

The tempting move is:

```
rate_per_km = diesel_price / mileage_kmpl + fixed_cost_per_km
```

and to call the result "derived from real data". It isn't. Nobody has told us the
operator's fixed cost per km, so that term would be invented — and a fuel-only
rate **understates** freight badly, which biases the ranking toward distant
mandis. Indexing a labelled estimate to real diesel movement claims exactly as
much as the evidence supports:

```
effective_rate = baseline_rate × (observed_diesel / baseline_diesel)
```

`baseline_diesel_price` is **deliberately not seeded**. Guessing it would make the
"fuel-indexed" rate the old invented number wearing a costume. Until an operator
declares it, the engine reports `CONFIGURED_ESTIMATE` and says so.

The index factor is clamped to **0.6–1.6**. A mistyped baseline of ₹9.14 would
otherwise multiply every freight figure by ten and silently reorder every mandi.
A capped adjustment says `(adjustment capped)` in its note.

## Making it real — two steps

**1. Record diesel.** Any authenticated user; the pump board is public information.

```bash
curl -X POST http://localhost:3000/api/transport/fuel-price \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"pricePerLitre":94.20,"district":"Wardha","sourceNote":"HP pump, Wardha bypass"}'
```

Rejected if outside ₹20–₹300, dated in the future, or from an unrecognised source.
Re-submitting the same fuel/state/district/day/source **corrects** rather than
duplicates. `OFFICIAL_API` cannot be claimed by a caller — only by ingestion.

**2. Declare the baseline** the existing estimates correspond to, once:

```sql
UPDATE transport_config
   SET baseline_diesel_price = 94.20, baseline_set_on = CURRENT_DATE,
       rate_source_note = 'Baseline estimate declared against ₹94.20/L diesel.'
 WHERE active = TRUE;
```

Then reload, because `transport_config` is cached for 5 minutes:

```bash
curl -X POST http://localhost:3000/api/transport/config/reload \
  -H "Authorization: Bearer $ADMIN_TOKEN"     # admin role required
```

**Better than both:** record a real quote. The transporters on the Find Transport
card are real businesses with real phone numbers — one call replaces the estimate
entirely.

```bash
curl -X POST http://localhost:3000/api/transport/quotes \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"vehicleType":"large_truck","ratePerKm":47.5,"loadingCost":700,
       "unloadingCost":500,"minimumCharge":4000,"returnTripFactor":1.15,
       "transporterName":"<name from the card>","transporterPhone":"<their number>",
       "district":"Wardha","notes":"Quoted for the Wardha-Katol corridor"}'
```

`transporterName` is **required**: an unattributable quote is indistinguishable
from an invented one, which is the entire problem this table exists to solve. A
quote that states only a per-km rate keeps the configured handling charges rather
than treating them as zero, and discloses that with `partialQuote: true`.

Quotes expire after `FREIGHT_QUOTE_MAX_AGE_DAYS` (45) or at `valid_until`.
A quote for the farmer's own district beats a state-wide one — rates are
corridor-specific.

## Inspecting the current basis

```bash
curl "http://localhost:3000/api/transport/rate-basis?district=Wardha"
```

Returns every vehicle's effective rate, its source, the evidence behind it, the
current diesel observation, and `anyRealRate` — whether *any* freight figure on
this deployment is backed by a real quote.

## Schema

`database/schemas/transport_rates.sql`, applied automatically on boot.

- **`fuel_prices`** — dated diesel observations. `source` is
  `OFFICIAL_API` > `ADMIN_ENTERED` > `USER_REPORTED`; ties break on recency.
  CHECK constraints reject prices outside ₹20–₹300 and future dates.
- **`transport_rate_quotes`** — quotes from named transporters, optionally linked
  to the Google `place_id` the lead came from, so a quote traces to a real business.
- **`transport_config`** gains `mileage_kmpl`, `fixed_cost_per_km`, `rate_source`,
  `rate_source_note`, `baseline_diesel_price`, `baseline_set_on`.

## What is and is not real

| Input | Source | Real? |
|---|---|---|
| Road distance | OSRM over the real road network | **Yes** (haversine × 1.3 fallback, labelled) |
| Market coordinates | Hand-entered town centroids | Real places, **not** surveyed yard gates (`CITY_CENTROID`) |
| Transporter names & phones | Google Places API (New), live | **Yes** — real businesses |
| Diesel price | Observations recorded here | **Yes, when recorded.** Never interpolated |
| Vehicle capacities, mileage | Published vehicle-class specifications | Yes, as class typicals |
| ₹/km, loading, minimum charge | `transport_config` baseline | **No source** unless a quote exists |
| Toll costs | Not wired | **Always ₹0** — no dataset. Freight is understated on tolled highways |

## Env

| Variable | Default | Effect |
|---|---|---|
| `FUEL_PRICE_MAX_AGE_DAYS` | 14 | Older diesel observations stop being "current" |
| `FREIGHT_QUOTE_MAX_AGE_DAYS` | 45 | Older quotes are no longer used |

## Invariant

`transportCostService` remains the **only** place freight is computed.
`freightRateService` decides *which rate* goes in; the formula stays in one place
so the ledger the farmer reads and the ranking that chose the mandi can never
disagree. Within one recommendation the rate is resolved **once** — it depends on
the vehicle and the farm's district, not on the destination — and reused across
every candidate market.

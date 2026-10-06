# Market Price Provider

## What changed

The AGMARKNET / data.gov.in **API-key** integration is retired. Prices now come
through a **provider abstraction**, and the active provider is a keyless
aggregator API.

```
React
  ↓
AgriChain Backend
  ↓
marketPriceService / marketPriceIngestService
  ↓
MarketPriceProvider  (abstract contract)
  ↓
MandiApiProvider
  ↓
https://mandi-api.onrender.com/v1
```

No API key is required anywhere in this path. `AGMARKNET_API_KEY` and
`AGMARKNET_RESOURCE_ID` are gone from `.env` and `.env.example`; no other feature
used them (`ORS_API_KEY`, `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY` are unrelated
and untouched).

## Provenance — the rule that governs labelling

The provider aggregates data.gov.in. **It is never described in the application as
an independent government data source.** Rows are stored with
`source = 'MANDI_API'`, which names the service we fetched from — the only thing we
can vouch for. Its freshness, coverage and mistakes are its own.

`marketPriceService.SOURCE`:

| value | meaning |
|---|---|
| `MANDI_API` | fetched from the current provider |
| `AGMARKNET` | **legacy.** Written by the retired data.gov.in integration. No ingestion path produces it any more; retained so historical rows keep their original meaning |
| `DEMO_SEED` | generated demonstration data |

`REAL_SOURCES = ['MANDI_API', 'AGMARKNET']` — read priority prefers `MANDI_API`,
then `AGMARKNET`, then demo, so a real observation always outranks a demo row for
the same market and day.

## Measured upstream behaviour

Verified against the live API, not assumed. Each of these shaped the code:

| Behaviour | Consequence |
|---|---|
| Envelope `{success, data, meta}`; errors `{success:false, error:{code,message}}` with real statuses | Provider codes (`INVALID_STATE`, `INVALID_DATE`) survive into our errors |
| `market` values carry **trailing spaces** (`"APMC Nagpur "`) and duplicate spellings exist | Names stored **verbatim** so a query can be replayed; compared only after normalising |
| The `market` filter is a **partial match** | A query for `"Chandrapur(Ganjwad) "` also returns `"Chandrapur(Ganjwad) APMC"`. `namesMatch()` keeps both (one mandi, two spellings) but rejects a genuinely different market |
| `/prices` caps at **200 records** and ignores `limit`/`offset`/`page` | No state-wide bulk pull. `capabilities().bulkByState === false`; ingestion iterates market × commodity |
| A market-scoped query returns that market's **full history** | Ingestion gets history, not just today — which is what lets the price model eventually train on real data |
| `/commodities` returns only **7** entries, truncated at "Bajra" | Upstream defect. `commoditiesComplete: false`; the crop list comes from our own `crop_profiles` |
| **Rate limit: 100 requests / 15 min / IP** | A 429 is **never retried** — the window is minutes long. The ingestion pass aborts and says so. Requests are paced (`MANDI_API_MIN_REQUEST_INTERVAL_MS`) |
| Unknown commodity → `200` with `data: []` | Absence of data, not an error |
| Free-tier host sleeps | 60s timeout, 2 retries for timeouts/network/5xx |

## Coverage — the real constraint

The provider covers **3 of our 16** Vidarbha mandis (18.8%):

| mapped (`EXACT`) | not covered |
|---|---|
| Nagpur APMC (Kalamna) → `APMC Nagpur ` | Katol, Kalmeshwar, Savner, Umred, **Wardha**, Hinganghat, Achalpur, Amravati, Bhandara, Gondia, Washim, Buldhana, Yavatmal |
| Akola APMC → `Akola APMC` | |
| Chandrapur APMC → `Chandrapur(Ganjwad) ` | |

This is a property of the upstream data. `GET /api/market/provider/coverage`
reports it per market, so "why is there no price for Wardha" has an auditable
answer instead of an empty table.

**Mapping discipline.** `market_provider_map.match_type` is `EXACT`, `VERIFIED` or
`FUZZY`, and **only EXACT and VERIFIED are ingested**. The provider offers
"Shetkari Krushi Utapanna Bazar Roshankheda Tal Varud Dist Amravati" in Amravati
district — that is **not** Amravati APMC, and mapping it as one would attribute a
different mandi's prices to Amravati and corrupt every ranking Amravati appears
in. `npm run map:markets -- --dry-run` reports such candidates for a human.

## Commands

```bash
npm run map:markets -- --dry-run   # report match candidates, write nothing
npm run map:markets                # write EXACT market + commodity mappings
npm run ingest:prices              # full history for mapped markets
npm run ingest:prices -- --latest  # latest day only
npm run ingest:prices -- --crops tomato,onion
npm run ingest:prices -- --coverage  # report coverage, ingest nothing
```

A full pass is ~63 requests (3 markets × 21 commodity spellings), which fits the
100/15-min budget **once**. Two passes back to back will be rate-limited partway;
the run reports `status: PARTIAL` with `rateLimited: true` rather than pretending
it finished.

## API

| endpoint | purpose |
|---|---|
| `POST /api/market/ingest` | run an ingestion pass. `{state, crops, latest}`. `424` only when nothing at all was ingested; `PARTIAL` is a success with detail |
| `GET /api/market/provider/coverage` | per-market coverage and mapping state |
| `GET /api/market/health` | `priceProvider` block: reachability, latency, `requiresApiKey: false`, capabilities, coverage summary |

## Adding another provider

1. `class MsambProvider extends MarketPriceProvider` — implement `getPrices`,
   `getPriceHistory`, `getMarkets`, `getCommodities`, `health`, `capabilities`, and
   translate its payload into the canonical observation shape.
2. Register it in `services/providers/index.js`.
3. `MARKET_PRICE_PROVIDER=msamb`.
4. Add `market_provider_map` rows for it.

Nothing in the recommendation engine, the ledger, or the frontend changes. An
unknown `MARKET_PRICE_PROVIDER` value throws `UNKNOWN_PRICE_PROVIDER` rather than
silently falling back — a typo must not quietly change where prices come from.

## Env

| variable | default | purpose |
|---|---|---|
| `MARKET_PRICE_PROVIDER` | `mandi_api` | which provider supplies prices |
| `MANDI_API_BASE_URL` | `https://mandi-api.onrender.com/v1` | provider base URL |
| `MANDI_API_TIMEOUT_MS` | `60000` | generous: the host cold-starts |
| `MANDI_API_RETRIES` | `2` | timeouts/network/5xx only, never 429 |
| `MANDI_API_MIN_REQUEST_INTERVAL_MS` | `900` | pacing against the rate limit |
| `MANDI_API_DEFAULT_STATE` | `Maharashtra` | default state for queries |

## Schema

`database/schemas/market_providers.sql`, applied on boot:

- **`market_provider_map`** — our market ↔ provider market name, with `match_type`
  and a note. `UNIQUE(market_id, provider)` and `UNIQUE(provider, provider_state,
  provider_market)` prevent two mandis' prices being blended.
- **`commodity_provider_map`** — our crop key ↔ provider commodity spellings
  (many-to-one: chilli arrives as "Green Chilli" and "Chilly Red").
- **`price_ingest_runs`** — audit log per pass: records fetched, rows written,
  requests failed, `SUCCESS`/`PARTIAL`/`FAILED`, error summary.

## Retired

`src/services/_retired/agmarknetService.js.retired` — kept, not deleted, because it
records how the AGMARKNET dataset spells commodities and markets, which is worth
reading if an authorised data.gov.in provider is added later. Not loaded at
runtime; the `.retired` extension keeps it out of `require()` and the test glob.

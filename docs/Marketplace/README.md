# AgriChain — Buyer Marketplace

A second selling channel alongside the APMC mandi: **direct crop buyers**.

A buyer posts what they need. Matching farmers discover it, compare buyers by the
money they would actually keep, chat privately, negotiate with structured offers,
and agree a deal that reserves the crop.

---

## Contents

1. [Three corrections to the original brief](#1-three-corrections-to-the-original-brief)
2. [Architecture](#2-architecture)
3. [Database](#3-database)
4. [API endpoints](#4-api-endpoints)
5. [Matching algorithm](#5-matching-algorithm)
6. [Expected-money calculation](#6-expected-money-calculation)
7. [Chat and realtime](#7-chat-and-realtime)
8. [Offer and deal transaction logic](#8-offer-and-deal-transaction-logic)
9. [Security model](#9-security-model)
10. [Frontend](#10-frontend)
11. [Setup and commands](#11-setup-and-commands)
12. [Test results](#12-test-results)
13. [Bugs found and fixed during the build](#13-bugs-found-and-fixed-during-the-build)
14. [Known limitations](#14-known-limitations)

---

## 1. Three corrections to the original brief

The brief assumed a stack this project does not have. Found by inspection before
any code was written:

**Supabase is not in this project.** No `@supabase/supabase-js` in either
`package.json`, no Supabase env vars, no imports. The stack is plain `pg.Pool`
against local PostgreSQL. So **Supabase Realtime, Supabase Storage and Supabase
RLS were all unavailable.**

| Brief assumed | Actually used | Why |
|---|---|---|
| Supabase Realtime | **Polling** (6 s, visibility-aware) | No realtime infrastructure existed; polling adds zero dependencies and is indistinguishable from push for a negotiation measured in minutes |
| Supabase Storage | **multer → disk + authorising route** | Matches the existing disease-image upload pattern |
| Supabase RLS | **Service-layer authorization + DB constraints** | See below |

**PostgreSQL RLS cannot work as specified.** Everything connects through a single
pooled `postgres` **superuser** (`backend/src/config/db.js`), and PostgreSQL
superusers **bypass RLS entirely** — policies would be decorative. Real RLS needs
per-request database roles and `SET LOCAL` session context, which is a
re-architecture of the connection layer affecting all seven existing modules.

What is used instead, and why it is not merely a weaker substitute:

- **Ownership checks in every service**, the pattern `marketController.resolveAuthorisedFarm`
  already established. No read or write path skips them.
- **Database `CHECK`, `FOREIGN KEY` and `UNIQUE` constraints**, which PostgreSQL
  enforces regardless of who connects — including for a superuser. These are what
  make over-reservation and double-acceptance structurally impossible.

**Migration path to real RLS**, if wanted later: create a non-superuser
application role, have `db.js` `SET LOCAL app.user_id` per request from the JWT,
write policies against `current_setting('app.user_id')`, then grant that role to
the pool. The ownership checks can then stay as defence in depth.

---

## 2. Architecture

```
                    React (existing design system, en/hi/mr)
        BuyerMarketplace · MyCropsForSale · Messages · Offers · BuyerDashboard
                                     │
                     services/marketplaceService.js  (JWT on every call)
                                     ▼
                    Node.js + Express — STRICT authMiddleware
                                     │
        ┌────────────────┬───────────┴────────┬──────────────────┐
        ▼                ▼                    ▼                  ▼
  buyerService    requirementService   availabilityService   roleService
  profiles,       lifecycle, expiry    4 quantity buckets    farmer/buyer/admin
  verification                         reserve / release
        │                │                    │
        └────────┬───────┴──────────┬─────────┘
                 ▼                  ▼
          matchingService    buyerComparisonService
          hard eligibility   ┌── reuses, never reimplements ──┐
          + reasons          │ routingService                 │
                 │           │ transportCostService           │
                 │           │ spoilageService                │
                 │           │ netReturnService               │
                 │           │ marketService (mandi channel)  │
                 │           └────────────────────────────────┘
                 ▼
     conversationService ── offerService ── notificationService
     participant-only     THE transaction   idempotent, dedupe_key
                                     │
                                     ▼
                              PostgreSQL (10 new tables)
```

**Nothing about the mandi engine was modified.** `getSellingOptions` calls
`marketService.recommendMarkets` and maps its output into a shared option shape, so
both channels arrive from the same `netReturnService` waterfall and are genuinely
comparable rather than merely similar-looking.

---

## 3. Database

`database/schemas/marketplace.sql` — 10 tables, idempotent, applied automatically
on backend startup alongside `market.sql`.

| Table | Purpose |
|---|---|
| `user_roles` | farmer / buyer / admin. A **table**, not a column, because the brief requires one identity holding several roles |
| `buyer_profiles` | Business details + verification state + suspension |
| `buyer_requirements` | "I want N kg of X at ₹Y/kg", with lifecycle and live remaining quantity |
| `farmer_crop_availability` | What a farmer has, in four separate buckets |
| `marketplace_conversations` | One private thread per (requirement, farmer, buyer) |
| `marketplace_messages` | Text, photos, and mirrored offer events |
| `marketplace_offers` | Structured negotiation with counter-offer threading |
| `marketplace_deals` | The agreed terms |
| `marketplace_notifications` | In-app, idempotent on `dedupe_key` |
| `marketplace_reports` | Abuse reports for admin moderation |

### Key design decisions

**Integer `SERIAL` keys, not UUIDs.** Every existing table uses `SERIAL`, and these
carry foreign keys into `users` and `farms`. Mixing key types would break those.

**`farmer_crop_availability` is a new table, unavoidably.** The existing `farms`
table has **no quantity column at all** — only name, location, area and crop type —
so there was nothing to extend. Four quantities are tracked separately because
conflating them is how a platform sells the same 500 kg twice:

```
total_harvested_kg   what came off the field
available_kg         offered to buyers right now
reserved_kg          locked by an accepted deal, not yet handed over
sold_kg              handed over, deal completed
```

### The constraints that actually enforce correctness

All verified firing against direct SQL that bypasses the API:

| Constraint | Prevents |
|---|---|
| `chk_avail_conservation` | `available + reserved + sold <= total_harvested` — over-reservation |
| `chk_req_remaining` | `0 <= remaining <= required` — over-committing a requirement |
| `chk_req_quantity` / `chk_req_price` | Negative or zero quantity and price |
| `chk_req_dates` | Expiry before the required-by date |
| `chk_verification_status` | A forged verification value |
| `chk_conversation_parties` | A conversation with oneself |
| `uq_conversation` | Duplicate threads for the same triple |
| **`marketplace_deals.accepted_offer_id UNIQUE`** | **One offer yielding two deals** |

---

## 4. API endpoints

All under strict `authMiddleware`. Responses follow the existing convention:
`{ success, data, meta }` or `{ success: false, error: { code, message, requestId } }`.

### Buyer profiles — `/api/buyers`

| Method | Path | Notes |
|---|---|---|
| `POST` | `/profile` | Registers a business, grants the buyer role. Always starts `unverified` |
| `GET` | `/me` | Own profile, with own contact details |
| `PATCH` | `/me` | Edit own profile. **Cannot touch verification** |
| `POST` | `/me/verification` | Self-submit → reaches `verification_pending` only |
| `GET` | `/me/roles` | Drives UI gating |
| `GET` | `/:id` | **Public** projection: no phone, email, address or documents |
| `GET` | `/admin/pending` | Admin only |
| `POST` | `/admin/:id/verification` | Admin only — the only path to `verified` |
| `POST` | `/admin/:id/suspension` | Admin only |

### Requirements — `/api/buyer-requirements`

`POST /` · `GET /` (browse or `?mine=true`) · `GET /:id` · `PATCH /:id` ·
`POST /:id/publish` · `POST /:id/close` · `GET /:id/matching-farmers`

### Marketplace — `/api/marketplace`

| Area | Endpoints |
|---|---|
| Availability | `GET/POST /farmer/availability`, `PATCH /farmer/availability/:id`, `GET /farmer/availability/suggestions` |
| Discovery | `GET /farmer/matches`, `GET /farmer/top-buyers`, `GET /selling-options` |
| Buyer | `GET /buyer/summary` |
| Chat | `POST/GET /conversations`, `GET/POST /conversations/:id/messages`, `POST /conversations/:id/read`, `POST /conversations/:id/block`, `GET /messages/:id/attachment` |
| Offers | `POST/GET /offers`, `GET /offers/:id`, `POST /offers/:id/{accept,reject,counter,withdraw}` |
| Deals | `GET /deals`, `GET /deals/:id`, `PATCH /deals/:id/status` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
| Reports | `POST /reports` |

---

## 5. Matching algorithm

`backend/src/services/matchingService.js` — **deterministic, not ML.**

Every exclusion is a hard rule a farmer can be told in one sentence. An ML model
here would make the feature *look* clever while making rejections impossible to
explain, which is the opposite of useful.

**There is no "94% match".** A requirement either qualifies or it does not.
Qualifying ones carry `reasons` — plain statements:

```
"Same crop (Tomato)"
"You can supply 500 kg of the 1000 kg still needed"
"Your crop is harvested and ready"
"Quality meets their B requirement"
"Buyer collects from your farm"
"Within the buyer's 300 km buying area"
```

### Hard eligibility, in order

1. **Crop equality** on normalised `crop_profiles` keys. Both sides store a
   resolved key (via `spoilageService.resolveCropKey`), so `'Tomatoes'`,
   `'tamatar'` and `'TOMATO'` all compare equal — never a `LIKE` on free text.
2. Requirement open (`active` or `partially_fulfilled`) and unexpired.
3. Buyer not suspended.
4. `matchedQuantityKg = min(farmerAvailableKg, buyerRemainingKg)` — the brief's
   formula. Partial fulfilment is excluded when the buyer forbids it, and lots
   below `minimum_acceptable_quantity_kg` are excluded.
5. Harvest date not after the required-by date.
6. Variety and grade, **only when the buyer specified them**. An unrecognised
   grade on either side counts as unknown, not as failure — excluding a farmer
   because they typed "Premium" would lose them a real sale.
7. Delivery arrangement compatible.
8. Within the buyer's stated service area.

Exclusions are counted and returned in `diagnostics.excludedByReason`, so an empty
result can tell the farmer what to change.

**Distance during matching is straight-line** (`distanceBasis: 'STRAIGHT_LINE'`),
because matching may consider dozens of requirements and road routing costs an
external call each. The road distance that money depends on is fetched once, for
the shortlist, in the comparison step.

---

## 6. Expected-money calculation

`backend/src/services/buyerComparisonService.js`.

Every rupee comes from the **same engines the mandi recommendation uses** —
`routingService`, `transportCostService`, `spoilageService`, `netReturnService`.
Nothing is recomputed locally. That is what makes a buyer figure comparable with a
mandi figure.

```
  gross sale value   = offered price/kg × MATCHED quantity
− crop loss value    = the fraction that will not arrive saleable
= expected sale value
− transport cost     = 0 when the buyer collects
− selling charges    = commission, cess, hamali, weighing
─────────────────────
= MONEY YOU KEEP     ← the ranking key
```

### The brief's four rules, and how each is honoured

| Rule | Implementation |
|---|---|
| **1. Use the matched quantity** | A buyer wanting 1,000 kg from a farmer with 500 kg is valued on 500 kg |
| **2. Do not subtract crop loss twice** | The loss *percentage* is passed into `netReturnService`, which reduces the saleable quantity and prices the shortfall exactly once. This module never subtracts a loss itself |
| **3. Buyer pickup costs the farmer nothing** | `transportCost: 0` with `whoPaysTransport: 'buyer'` — a real zero, labelled, not an assumption |
| **4. Missing data = incomplete, never zero** | An unroutable destination yields `isComplete: false` with a stated reason and `expectedMoney: null`. A free trip is a far more attractive lie than an unknown one |

### Advertised vs agreed

Every comparison price carries `isAdvertisedPrice: true`. The only agreed price in
the system is `marketplace_deals.agreed_price_per_kg`. Ordering places **complete**
options first; an option whose cost is unknown never outranks one that is fully
costed.

Each option also carries `assumptions` — the sentences shown to the farmer:

> *"Price of ₹31/kg is what this buyer advertised and is negotiable — not an agreed price."*
> *"Transport assumes 153 km by road in a Tempo at ₹18/km."*
> *"Expected crop loss of 1.1% comes from AgriChain's rule-based spoilage estimate, not a trained model."*

### Verified working (demo scenario, live API)

```
BUYER                              PRICE    QTY  FREIGHT   LOSS   IN HAND  WHO PAYS
[DEMO] Nagpur Fresh Traders         ₹28   500kg       ₹0   ₹126   ₹13,074  buyer   ← MOST MONEY
[DEMO] Amravati Agro Processing     ₹31   500kg   ₹4,500   ₹186    ₹9,942  farmer  ← highest price, not best
```

**₹28/kg beats ₹31/kg by ₹3,132.** That is the whole point of the module.

---

## 7. Chat and realtime

`conversationService.js` + `MarketplaceMessages.jsx`.

**Access control is the entire design.** Every read and write goes through
`assertParticipant`, which compares the authenticated user id against the
conversation's own `farmer_user_id` and `buyer_user_id` columns. There is no code
path that loads messages without it — which is what makes changing an id in a URL
useless.

A non-participant gets **404, not 403**, deliberately: a probing caller must not be
able to learn that a conversation exists.

| Feature | Implementation |
|---|---|
| No duplicate threads | `UNIQUE (requirement_id, farmer_user_id, buyer_user_id)` + `ON CONFLICT DO UPDATE` |
| Realtime | 6 s poll while a thread is open, paused on a backgrounded tab via `visibilitychange` |
| Unread counts | Denormalised columns, incremented for the **recipient** only |
| Read receipts | `read_at` set when the other side opens the thread; `✓` / `✓✓` |
| Pagination | Cursor (`before` = message id), newest-first query reversed for display |
| Attachments | JPEG/PNG/WebP only, 5 MB cap, random filenames, **`Content-Disposition: attachment`** so an SVG cannot execute in the viewer's origin |
| Attachment access | Served **only** by `GET /messages/:id/attachment` after a participation check. Never `express.static` |
| Sanitisation | HTML-escaped at write time, so no consumer can render it as markup |
| Rate limit | 20 messages/minute per sender **per conversation** — flooding one thread is throttled without penalising someone messaging several buyers |
| Block / report | Per-side `blocked` flags; `marketplace_reports` for admin review |

**Contact details are never exposed.** A conversation's `counterparty` object
carries exactly `{ userId, name, role, buyerProfileId }` — asserted by test. A user
who wants to share a phone number types it into a message.

---

## 8. Offer and deal transaction logic

`offerService.accept()` — the most safety-critical function in the module.

### Four independent mechanisms prevent double-acceptance

1. **`SELECT ... FOR UPDATE` on the offer row.** A second concurrent acceptance
   blocks here until the first commits, then re-reads `status = 'accepted'` and
   refuses.
2. **`FOR UPDATE` on the requirement and availability rows**, so quantity
   arithmetic cannot interleave.
3. **Conditional `UPDATE`** in `availabilityService.reserve()` requires
   `available_kg >= quantity`, so it matches zero rows rather than going negative.
4. **`marketplace_deals.accepted_offer_id UNIQUE`.** Even if all the above were
   defeated, the second `INSERT` violates the constraint and the transaction rolls
   back.

Every guard the brief lists is re-verified **inside** the transaction, after locks
are held — a check performed before `BEGIN` is worthless by the time the write
happens.

```
BEGIN
  lock offer          → still pending? not expired? caller is the RECIPIENT?
  lock requirement    → still open? not expired? remaining >= quantity?
  lock availability   → available >= quantity?   (reserve)
  decrement remaining → status → partially_fulfilled | fulfilled
  mark offer accepted → compare-and-swap on status
  supersede siblings  → other pending offers on the same crop → countered
  INSERT deal         → UNIQUE(accepted_offer_id) is the final guarantee
  post to chat + notify BOTH parties  (enlisted in the transaction)
COMMIT
```

Notifications are enlisted in the transaction on purpose: a farmer must never be
told a deal was agreed if the deal then failed to save.

### Concurrency, measured

| Scenario | Result |
|---|---|
| Same offer accepted twice, simultaneously | 1 accepted, 1 `OFFER_NOT_PENDING`, **exactly 1 deal**, reserved once |
| Two buyers racing for the same 500 kg | 1 accepted, 1 `INSUFFICIENT_AVAILABLE_QUANTITY`, conservation held |
| Three 300 kg offers against 500 kg, ×3 trials | exactly 1 accepted each time, **never oversold** |

Under genuine contention PostgreSQL may abort with `40P01` (deadlock) or `40001`
(serialization failure). Both are safely retryable — nothing committed — so they
are mapped to `CONCURRENT_UPDATE_RETRY` → HTTP 409 with *"Someone else was agreeing
a deal for this crop at the same moment. Please try again."* A raw `40P01` must
never reach a farmer.

### Deals

`agreed → preparing → ready_for_pickup → completed`, plus `cancelled` / `disputed`.
Transitions are validated against an explicit table, so **a deal cannot jump from
`agreed` straight to `completed`** — the brief requires that acceptance does not
auto-complete.

- **Completing** moves `reserved → sold`.
- **Cancelling** returns crop to `available` *and* restores the buyer's remaining
  quantity.
- Every deal carries `paymentNote`: *"Payment and physical handover happen outside
  AgriChain."* V1 has no payment or escrow, and says so.

---

## 9. Security model

| Concern | Implementation |
|---|---|
| Authentication | Strict `authMiddleware` on **every** marketplace route — unlike the rest of AgriChain, which resolves an anonymous caller to a dev user. An anonymous session must not read user 1's private negotiations |
| Role authorization | `requireRole` / `requireBuyer` / `requireAdmin`; `requireBuyer` also rejects suspended buyers, so a suspension takes effect everywhere at once |
| Identity source | `req.user.id` from a verified JWT. A `userId`, `farmerId` or `buyerId` in a request body is **ignored throughout** |
| Ownership | Every farm-, requirement-, availability-, conversation-, offer- and deal-scoped operation re-derives the caller's side from the record itself |
| Enumeration | Forbidden → **404** for conversations, offers and deals |
| Malformed ids | `requireNumericId` guard 404s before `parseInt('undefined')` → `NaN` can reach SQL |
| Sensitive fields | `toPublic()` and `toOwner()` are separate functions, not one with a flag — a flag defaults to something and the wrong default leaks a document path |
| Verification | Only `POST /api/buyers/admin/:id/verification` can reach `verified`, and `buyerService.reviewVerification` re-checks the admin role even though the route already guards it |
| Uploads | MIME allow-list, 5 MB cap, random filenames, private directory, authorising download route |
| Rate limiting | Per sender per conversation |
| No fake trust | No ratings, no completed-transaction counts, no verification badge that is not backed by an admin decision |

---

## 10. Frontend

Reuses the existing design system throughout — `Sidebar`, `Header`,
`bg-surface-container-lowest rounded-3xl` cards, `font-headline` headings,
`material-symbols-outlined` icons, the `BatchSetupDialog` dialog shell, and the
existing `bg-error-container` / amber notice patterns. **No new theme, no new
component library.**

| Page | Route | Covers |
|---|---|---|
| `BuyerMarketplace.jsx` | `/marketplace` | Buyers Looking for Your Crop; ranked comparison with an expandable money breakdown; send-offer dialog |
| `MyCropsForSale.jsx` | `/marketplace/my-crops` | The four quantity buckets; add-crop dialog pre-filled from saved fields |
| `MarketplaceMessages.jsx` | `/marketplace/messages/:id?` | Conversation list + thread, photos, read receipts, pagination |
| `MarketplaceOffers.jsx` | `/marketplace/offers`, `/deals` | Offers (to answer / sent) and deals, with confirm dialogs |
| `BuyerDashboard.jsx` | `/buyer` | Buyer onboarding, dashboard, post-requirement dialog, farmer responses |

Plus: a **Buyers** entry in the sidebar (translated **en/hi/mr**), and an
**"Explore Direct Buyers"** card on the existing Market page that carries the
farmer's already-chosen crop and quantity into the marketplace so nothing is
re-entered.

### Language

Written for a farmer on a phone: *"Price per kg"*, *"Money you keep"*, *"Contact
Buyer"*, *"Send Offer"*, *"Agree to Offer"*, *"Price is negotiable"*. The brief's
banned terms — "match confidence", "net realizable value", "optimization score" —
appear nowhere in the UI.

Each buyer card has a **"How is this worked out?"** disclosure showing the full
deduction ledger and the assumptions behind it.

---

## 11. Setup and commands

No new dependencies. The module uses `pg`, `axios`, `jsonwebtoken`, `bcryptjs` and
`multer`, all already present.

```bash
# Schema — applied automatically on backend start, or by hand:
psql -U postgres -d agrichain_db -f database/schemas/marketplace.sql

# Backend
cd backend && npm run dev

# Demo data (clearly fictional; see below)
npm run seed:marketplace
npm run seed:marketplace -- --clear

# Tests
npm test                              # 249 tests
node --test tests/marketplace.test.js # 29 marketplace tests

# Frontend
cd frontend && npm run dev
```

### Environment variables

**The marketplace adds none.** It reuses `DB_*`, `JWT_SECRET`, and the market
module's `ROUTING_PROVIDER`, `MARKET_*` and selling-cost variables, all already
documented in `backend/.env.example`.

### Granting the admin role

There is no self-service path to admin, by design:

```sql
INSERT INTO user_roles (user_id, role) VALUES (<your_user_id>, 'admin');
```

### Demo data

`npm run seed:marketplace` creates four crop markets that demonstrate the core
claim. Every row is `is_demo_data = TRUE`, every business name is prefixed
`[DEMO]`, and contact details use the RFC 6761 reserved `example.test` domain and
`5550xxx` numbers, which cannot reach a real person. Re-running clears and
recreates, in deal → offer → requirement order so the `ON DELETE RESTRICT`
constraints are respected.

It is built through the real services — `buyerService.createProfile`,
`submitForVerification`, `reviewVerification` (as a **demo admin account**, the
only path to `verified`), `requirementService.create/close`,
`availabilityService.create`, `offerService.create/counter` — not raw INSERTs, so
no verification or validation rule is bypassed. Rows written by services that
predate `is_demo_data` (conversations, messages, offers) are flagged afterwards by
`markDemoRows`, scoped to the demo accounts.

**10 buyers (8 verified, 2 unverified), 12 open requirements, 4 farmer crop
listings.** Password for every account: `demo-only-not-secure`.

| Account | Role |
|---|---|
| `demo-farmer@example.test` | farmer — 1,000 kg each soybean / orange / cotton, 500 kg tomato, plus 3 spare unlisted fields |
| `demo-admin@example.test` | admin — grants buyer verification |
| `buyer-soy-processor@example.test` | verified processor, Butibori MIDC Nagpur — 2,000 kg soybean @ ₹50/kg, farmer delivers |
| `buyer-soy-trader@example.test` | verified wholesaler, Akola — 5,000 kg soybean @ ₹47/kg, farmer delivers |
| `buyer-wardha-processor@example.test` | verified processor, Wardha — 1,000 kg soybean @ ₹48.50/kg **collects**; 10,000 kg cotton @ ₹70/kg delivered |
| `buyer-orange-processor@example.test` | verified processor, Nagpur — 3,000 kg orange @ ₹35/kg **collects**; 1,500 kg @ ₹38/kg delivered |
| `buyer-orange-trader@example.test` | verified wholesaler, Amravati — 5,000 kg orange @ ₹32/kg, farmer delivers |
| `buyer-buldhana-fruit@example.test` | **unverified** wholesaler, Buldhana — 1,500 kg orange @ ₹40/kg, farmer delivers |
| `buyer-cotton-ginner@example.test` | verified processor, Yavatmal — 5,000 kg cotton @ ₹75/kg, farmer delivers |
| `buyer-cotton-trader@example.test` | verified wholesaler, Akola — 3,000 kg cotton @ ₹72/kg **collects** |
| `demo-buyer-a@example.test` | verified processor, Amravati — 1,000 kg tomato @ ₹31/kg, farmer delivers |
| `demo-buyer-b@example.test` | unverified wholesaler, Nagpur — 500 kg tomato @ ₹28/kg **collects** |

Each market makes a different point, and the ordering comes from
`buyerComparisonService`, never from the seed:

| Crop | What the ranking shows |
|---|---|
| Soybean | the nearest buyer also pays the most — and ₹47/kg 215 km away loses ~₹8,700 to freight |
| Cotton | ₹72/kg with the buyer collecting **beats** ₹75/kg delivered |
| Orange | the highest advertised price (₹40/kg, Buldhana, ~295 km) finishes **last** once freight and spoilage are counted — and that buyer is unverified |
| Tomato | the original two-buyer scenario, preserved unchanged |

Two **negative controls** are seeded on purpose and must never appear in a match:
`SOY-EXPIRED` (expired, advertises ₹55/kg) and `COT-CLOSED` (closed, ₹82/kg). The
seed re-reads its own output through `matchingService` and
`buyerComparisonService` and prints whether the crop filter held and whether those
two leaked.

One negotiation is left mid-flight for a live demo: the farmer offered 1,000 kg
soybean at ₹50/kg and `buyer-wardha-processor` countered at ₹49/kg. **Nothing is
accepted** — no deal exists, and all 1,000 kg stays available, so the acceptance
step can still be demonstrated. Re-running the seed deletes that thread, so do not
re-run mid-demonstration.

---

## 12. Test results

```
npm test  →  249 tests, 249 pass, 0 fail
             (220 pre-existing + 29 marketplace)
```

`tests/marketplace.test.js` runs end to end over real HTTP with **two separate
authenticated users** plus a stranger and an admin, against the real database.
PostgreSQL is deliberately *not* stubbed — the constraints, transactions and row
locks are the subject of the concurrency tests. The suite purges its fixtures both
before and after, so it is idempotent across runs even if a previous run crashed.

All 23 required cases, with the mapping:

| # | Case | Covered by |
|---|---|---|
| 1 | Buyer registration and role authorization | `1`, `1b` |
| 2 | Requirement creation | `2` |
| 3 | Invalid quantities and prices | `3`, `3b` (direct SQL) |
| 4 | Requirement expiry | `4` |
| 5 | Farmer crop matching | `5` |
| 6 | Crop mismatch rejection | `6` |
| 7 | Partial fulfilment | `7` |
| 8 | Multiple buyers competing for one quantity | `16`, `17` |
| 9 | Buyer comparison calculations | `9`, `9b` |
| 10 | Pickup vs delivery cost handling | `10` |
| 11 | Chat authorization | `11` |
| 12 | Message persistence | `12`, `12b`, `12c` |
| 13 | Offer creation | `13` |
| 14 | Counter-offer flow | `14` |
| 15 | Offer acceptance | `15`, `15b` |
| 16 | Double-acceptance prevention | `16` (sequential **and** concurrent) |
| 17 | Quantity reservation under concurrency | `17` (3 trials) |
| 18 | Requirement closure | `18` |
| 19 | Notification creation + idempotency | `19` |
| 20 | Unauthorized access to another user's records | `20` |
| 21 | Empty states | `21` |
| 22 | Mobile layouts | **See limitations** |
| 23 | Transport/spoilage failure without marketplace failure | `23`, `23b` |

---

## 13. Bugs found and fixed during the build

Writing the tests surfaced five real defects:

1. **`parseInt('undefined')` → `NaN` reached SQL.** `GET /api/marketplace/offers/undefined`
   returned **500** instead of 404. Fixed with a `requireNumericId` guard on every
   `:id` route.

2. **Closing a requirement then offering returned 500.**
   `requirementService.assessOpenness` derives its code from the requirement's
   status (`REQUIREMENT_CLOSED`, `REQUIREMENT_CANCELLED`, `REQUIREMENT_FULFILLED`),
   and none were in the controllers' status maps — a client mistake reported as a
   server fault. All are now mapped to 409.

3. **A deadlock leaked as raw SQLSTATE `40P01`** to the client under three-way
   contention. Now mapped to `CONCURRENT_UPDATE_RETRY` with a farmer-readable
   retry message.

4. **The price ceiling was too loose.** ₹3,000/kg was accepted. Mandi rates are
   quoted per *quintal*, so someone meaning ₹30/kg types 3000 — the signature typo
   of this domain. Ceiling tightened to ₹2,000/kg, and the message now names the
   likely cause: *"did you mean ₹3000 per quintal, which is ₹30/kg?"*

5. **The test suite was not idempotent.** A crashed run left a buyer profile
   behind, and the next run failed on *"not a buyer before registering"* — a
   failure with nothing to do with the code. Fixtures are now purged before
   seeding as well as after.

Plus one of my own test assertions was wrong, not the code: a buyer offering
against a farmer's listing is a **legitimate** buyer-initiated offer, not a
self-offer. The test now asserts that it succeeds, and covers a genuine self-offer
separately (one user holding both roles).

---

## 14. Known limitations

Stated plainly, because a final-year project is judged on knowing what it has not
done:

1. **No Row Level Security.** The single pooled superuser makes it unenforceable;
   authorization is service-layer plus database constraints. Migration path in
   §1. This is the most significant gap against the brief.

2. **Realtime is polling, not push.** 6 s while a thread is open. Fine for a
   negotiation; not what you would ship for a chat product. SSE or socket.io is
   the upgrade, and the service layer needs no change for it.

3. **Mobile layouts are responsive but not device-tested.** Every page uses the
   existing `sm:`/`lg:` breakpoints and the dialogs use the bottom-sheet pattern
   (`items-end sm:items-center`), but **case 22 was not verified on a real phone**
   — only at narrow viewport widths. The farmer pages assume the existing
   `ml-72` sidebar layout, which is desktop-first in this codebase.

4. **No frontend component tests.** Verified by `vite build` succeeding and by the
   backend contract tests. A React Testing Library suite is the clearest addition.

5. **Some brief-suggested pages are consolidated.** Offers and deals share one
   tabbed page; buyer onboarding, dashboard and post-requirement share `/buyer`.
   Requirement-detail and buyer-detail pages are **not built** — those routes
   currently navigate to existing pages. The API endpoints behind them exist and
   are tested.

6. **No SSE/email/SMS notifications.** In-app only, as the brief specifies for V1.

7. **No payment, escrow, driver tracking or vehicle GPS** — explicitly out of
   scope, and every deal says so.

8. **Buyer contact details are withheld from farmers** by design. If you would
   rather expose them, `buyerService.toPublic()` is the single place to change.

9. **Offer expiry and requirement expiry are lazy**, applied on read rather than
   by a scheduler. Correct, but it means a nightly job would be needed to notify
   buyers of *upcoming* expiry (the `REQUIREMENT_EXPIRING_SOON` event type exists
   but nothing emits it yet).

10. **`reserved_kg` is never auto-released.** If a deal is abandoned without being
    cancelled, the crop stays reserved indefinitely. A timeout or admin tool is
    needed.

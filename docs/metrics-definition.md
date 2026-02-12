# Reputy – Metrics Definition (Authoritative)

**Date:** 11 Feb 2026  
**Status:** Active  
**Scope:** DB → backend → admin → client

---

## 0. Purpose

- Single source of truth for metric definitions across DB → backend → admin → client.
- Prevents metric drift between layers.
- Serves as internal developer reference.
- **Any change to metrics logic must update this file before merging.**

---

## 1. Time & Period Conventions

### 1.1 Storage

- All timestamps are stored as **UTC ISO 8601 TEXT** strings (e.g. `2026-02-11T00:00:00.000Z`).
- All metrics must be computed in UTC.

### 1.2 Rolling window definition (canonical)

Reputy uses a rolling window aligned to **UTC midnight**, not raw `CURRENT_TIMESTAMP - X days`.

**Canonical helper:** `computeSinceISO(days)` — defined in `apps/backend/lib/db.js`.

Definition (must match server behavior):

```
1. Parse `since` param as `<N>d` (default 30d), clamp N ≤ 365
2. sinceDate = new Date(Date.now() - days * 86400000)
3. sinceDate.setUTCHours(0, 0, 0, 0)
4. sinceISO = sinceDate.toISOString()
```

A metric is included in a period if its relevant timestamp `>= sinceISO`.

### 1.3 Implementation status

- ✅ The admin metrics endpoint (`handleAdminMetrics` in `server.js`) uses `computeSinceISO(days)` from `db.js` (Step 5 — resolved 2026-02-11).

---

## 2. Core Entities

### 2.1 review_requests (Intent)

Represents the intent to request a review from a patient.

**Table:** `review_requests`

**Lifecycle statuses (authoritative):**

| Order | Status | Timestamp column | Description |
|-------|--------|------------------|-------------|
| 0 | `created` | `created_at` | Request created in DB |
| 1 | `queued` | `queued_at` | Queued in email_outbox for delivery |
| 2 | `sent` | `sent_at` | Email delivered by worker |
| 2 | `failed` | `failed_at` | Delivery failed (terminal branch) |
| 3 | `feedback_received` | `feedback_received_at` | Patient submitted private feedback |
| 4 | `public_redirected` | `public_redirected_at` | Patient clicked redirect to Google |

**Rules:**
- Lifecycle is **monotone**: transitions only go forward, never backward.
- `sent` and `failed` are at the same order level (2) — mutually exclusive terminal branches from `queued`.
- Timestamps are written **atomically** with status via `setLifecycleStatus(id, status)` in `request.repo.js`.
- Retrograde transitions are silently rejected and logged.
- Same-status re-application is an idempotent no-op.

---

### 2.2 feedbacks (Private feedback)

Represents private feedback submitted by the patient via the rating page.

**Table:** `feedbacks`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `request_db_id` | TEXT NOT NULL | FK → `review_requests.id`, ON DELETE CASCADE |
| `org_id` | TEXT, nullable | FK → `orgs.id` (no CASCADE). Denormalized for metrics (migration 007). |
| `rating` | INTEGER | 1–5 |
| `comment` | TEXT | Free text, nullable |
| `source` | TEXT | Channel origin (e.g. `email`, `web`) |
| `created_at` | TEXT | Default CURRENT_TIMESTAMP |

**Rules:**
- Feedback submission must be persisted in SQLite (not JSON-only).
- `INSERT feedback` + `UPDATE review_requests lifecycle` must happen in **one transaction**.
- Anti-duplication: a request can have at most one feedback (enforced at application level via `getByRequestDbId()`).

---

### 2.3 reviews (Provider reviews import — Google)

Represents reviews imported from provider APIs (Google by default).  
This table exists since migration 004.

**Table:** `reviews`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `org_id` | TEXT NOT NULL | FK → `orgs.id` |
| `provider` | TEXT | Default `'google'` |
| `provider_location_id` | TEXT | Google place_id |
| `provider_review_id` | TEXT | Unique provider-side ID (dedup) |
| `author_name` | TEXT NOT NULL | |
| `rating` | INTEGER | 1–5, NOT NULL |
| `comment` | TEXT | |
| `reviewed_at` | TEXT NOT NULL | ISO 8601 |
| `status` | TEXT | `pending` \| `replied` \| `ignored` |
| `reply_text` | TEXT | |
| `reply_status` | TEXT | `none` \| `draft` \| `queued` \| `sent` \| `failed` |
| `reply_sent_at` | TEXT | |
| `reply_error` | TEXT | |
| `tags` | TEXT | JSON array, default `'[]'` |
| `sentiment` | TEXT | `positive` \| `neutral` \| `negative` \| NULL |
| `raw_json` | TEXT | Raw provider data for debug |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

**Unique constraint:** `(org_id, provider, provider_review_id)` WHERE `provider_review_id IS NOT NULL`.

**Notes:**
- `reviews` is currently **NOT linked** to `review_requests` (no FK, no `review_request_id` column).
- Future (North Star V2) may add optional `reviews.review_request_id REFERENCES review_requests(id)` for attribution — out of scope for now.

---

### 2.4 email_outbox (Delivery execution — source of truth for sending)

`email_outbox` is the real delivery queue for emails.  
It is the **authoritative source** for "email attempted / sent / failed" execution.

**Table:** `email_outbox`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `org_id` | TEXT NOT NULL | FK → `orgs.id`, ON DELETE CASCADE |
| `to_email` | TEXT NOT NULL | |
| `template_key` | TEXT NOT NULL | `'review_request'`, `'test'`, etc. |
| `payload_json` | TEXT | JSON, default `'{}'` |
| `status` | TEXT | `pending` \| `sending` \| `sent` \| `failed` \| `cancelled` |
| `provider` | TEXT | `'ses_smtp'` \| `'dry_run'` \| NULL |
| `provider_message_id` | TEXT | |
| `error` | TEXT | Error message if failed |
| `attempts` | INTEGER | Default 0 |
| `idempotency_key` | TEXT UNIQUE | |
| `scheduled_at` | TEXT | NULL = ASAP |
| `sent_at` | TEXT | Effective send timestamp |
| `request_db_id` | TEXT | FK → `review_requests.id` (migration 007). Links outbox to request. |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

**Key concept:**
- `email_outbox.request_db_id` links an outbox row to `review_requests.id`.
- `process-email-outbox.js` is the **source of truth** for `sent_at` and `failed_at` on `review_requests`.

---

## 3. Activation (Official)

### 3.1 Official definition

An org is **activated** when:

```sql
orgs.activated_at IS NOT NULL
```

`activated_at` is set when the org's first review request transitions to `status = 'sent'`:
- Worker (`process-email-outbox.js`) sets `activated_at = MIN(sent_at)` across the org's requests.
- Overwrites any proxy value (migration 007 backfilled with `MIN(created_at)` as proxy; migration 008 corrected to `MIN(sent_at)` where available).

**Activation rate (official):**

```
COUNT(orgs WHERE activated_at IS NOT NULL) / COUNT(all orgs)
```

### 3.2 Implementation status

- ✅ `activation_rate_percent` is now based on `COUNT(orgs WHERE activated_at IS NOT NULL) / COUNT(all orgs)` (Step 5 — resolved 2026-02-11).
- Legacy usage_ledger-based signals (`orgs_with_email`, etc.) are still returned under `activation.deprecated_usage_signals` for breakdowns, but no longer drive the activation rate.

---

## 4. Operational Metrics (Official Definitions)

For a given period boundary `:sinceISO` (computed via `computeSinceISO(days)`):

### 4.1 Requests created

```sql
SELECT COUNT(*) FROM review_requests
WHERE created_at >= :sinceISO;
```

### 4.2 Requests queued

```sql
SELECT COUNT(*) FROM review_requests
WHERE queued_at IS NOT NULL AND queued_at >= :sinceISO;
```

### 4.3 Requests sent (authoritative "delivered" metric)

```sql
SELECT COUNT(*) FROM review_requests
WHERE sent_at IS NOT NULL AND sent_at >= :sinceISO;
```

### 4.4 Requests failed

```sql
SELECT COUNT(*) FROM review_requests
WHERE failed_at IS NOT NULL AND failed_at >= :sinceISO;
```

### 4.5 Feedback received

**Authoritative definition (preferred):**

```sql
SELECT COUNT(*) FROM review_requests
WHERE feedback_received_at IS NOT NULL AND feedback_received_at >= :sinceISO;
```

**Alternative validation (cross-check):**

```sql
SELECT COUNT(*) FROM feedbacks
WHERE created_at >= :sinceISO;
```

Both should return the same count for data created after migration 007.

### 4.6 Public redirects (North Star V1)

```sql
SELECT COUNT(*) FROM review_requests
WHERE public_redirected_at IS NOT NULL AND public_redirected_at >= :sinceISO;
```

**Interpretation:** Proxy for "patients redirected to provider review page via Reputy".

### 4.7 Implementation status

- ✅ (Step 5 — resolved 2026-02-11) The admin metrics endpoint now returns **per-status lifecycle counts**, both in-period and all-time:

| Payload field | SQL WHERE |
|---------------|-----------|
| `requests.created_in_period` | `created_at >= :sinceISO` |
| `requests.queued_in_period` | `queued_at IS NOT NULL AND queued_at >= :sinceISO` |
| `requests.sent_in_period` | `sent_at IS NOT NULL AND sent_at >= :sinceISO` |
| `requests.failed_in_period` | `failed_at IS NOT NULL AND failed_at >= :sinceISO` |
| `requests.feedback_received_in_period` | `feedback_received_at IS NOT NULL AND feedback_received_at >= :sinceISO` |
| `requests.public_redirected_in_period` | `public_redirected_at IS NOT NULL AND public_redirected_at >= :sinceISO` |
| `requests.total_sent` | `sent_at IS NOT NULL` (all-time) |
| `requests.total_failed` | `failed_at IS NOT NULL` (all-time) |
| `requests.total_feedback_received` | `feedback_received_at IS NOT NULL` (all-time) |
| `requests.total_public_redirected` | `public_redirected_at IS NOT NULL` (all-time) |

- `north_star_v1` is a top-level field = `requests.public_redirected_in_period`.
- `feedback.in_period` = `requests.feedback_received_in_period` (authoritative).
- `feedback.in_period_crosscheck` = `COUNT(feedbacks WHERE created_at >= :sinceISO)` (validation only).

---

## 5. Revenue Metrics (MRR & ARPU) — Exact Implementation

### 5.1 Paid org filter

MRR includes orgs meeting **both** conditions:

```sql
orgs.status = 'active'
AND json_extract(billing_json, '$.status') = 'active'
```

The only accepted value for `billing_json.status` in the filter is the literal string `'active'`.

### 5.2 Pricing fields (exact JSON paths)

| Field | JSON path | Type | Description |
|-------|-----------|------|-------------|
| Base price | `json_extract(plan_json, '$.basePriceCents')` | INTEGER | Monthly base price in cents |
| Negotiated enabled | `json_extract(negotiated_json, '$.enabled')` | BOOLEAN (0/1) | Whether negotiated pricing is active |
| Custom price | `json_extract(negotiated_json, '$.customPriceCents')` | INTEGER | Override price in cents |
| Discount percent | `json_extract(negotiated_json, '$.discountPercent')` | REAL | Percentage discount (e.g. 15.0) |
| Billing status | `json_extract(billing_json, '$.status')` | TEXT | Subscription status |

### 5.3 MRR calculation (exact CASE logic)

```sql
CASE
  WHEN negotiated.enabled = 1 AND customPriceCents > 0
    THEN customPriceCents
  WHEN negotiated.enabled = 1 AND discountPercent > 0
    THEN ROUND(basePriceCents * (1.0 - discountPercent / 100.0))
  WHEN basePriceCents IS NULL
    THEN 0
  ELSE basePriceCents
END
```

- MRR is a **snapshot** at query time.
- **Historical MRR** is available via daily snapshots in `mrr_snapshots` table
  (populated by `snapshot-mrr.js` at 00:05 UTC, idempotent per `snapshot_date`).
- Unit: **cents** (converted to EUR via `/ 100`).
- `mrr_total_cents`: sum across all paid orgs.
- `mrr_total_eur`: `mrr_total_cents / 100` (2 decimal places).
- API: `GET /internal/admin/mrr-history?days=90` returns daily snapshots.

### 5.4 ARPU

```
arpu_cents = ROUND(mrr_total_cents / orgs_paid)
arpu_eur   = arpu_cents / 100
```

Only computed when `orgs_paid > 0`.

### 5.5 MRR by tier

Tier is extracted from `json_extract(plan_json, '$.code')`:
- If `$.code` is NULL → `'unknown'`
- If `$.code` contains `_` → extract substring after `_` (e.g. `reputy_argent` → `argent`)
- Else → use `$.code` as-is

**Tier aliases** (exact, from code):

```javascript
{ basic: 'bronze', silver: 'argent', or: 'gold' }
```

**Canonical tier buckets** (from `mrr_by_tier` payload):

| Bucket | Includes aliases |
|--------|------------------|
| `bronze` | `basic` |
| `argent` | `silver` |
| `gold` | `or` |
| `platinum` | — |
| `custom` | Any tier not matching the above 4 (including `unknown` when `plan_json.$.code` is NULL) |

### 5.6 Additional revenue fields

| Field | Definition |
|-------|------------|
| `orgs_paid` | Count of orgs matching ACTIVE_FILTER with `monthly > 0` |
| `orgs_free` | Count of orgs matching ACTIVE_FILTER with `monthly = 0` |
| `negotiated_orgs` | Count of orgs matching ACTIVE_FILTER with `negotiated_json.$.enabled = 1` |
| `negotiated_percent` | `(negotiated_orgs / orgs_paid) * 100` (1 decimal place) |

---

## 6. North Star Metric

### 6.1 North Star V1 (Current, measurable)

```sql
SELECT COUNT(*) FROM review_requests
WHERE public_redirected_at IS NOT NULL
  AND public_redirected_at >= :sinceISO;
```

**Measures:** Patients redirected to Google review page via Reputy.

This is a proxy metric — it counts redirects, not confirmed published reviews.

### 6.2 North Star V2 (Future, requires matching)

```sql
SELECT COUNT(*) FROM reviews
WHERE review_request_id IS NOT NULL
  AND reviewed_at >= :sinceISO;
```

**Requires:**
- Adding `reviews.review_request_id REFERENCES review_requests(id)` (new column).
- Implementing Google review matching logic (attribute a review to a request).
- Out of scope for current version.

---

## 7. Data Integrity Rules (Non-negotiable)

1. **No JSON-only storage** — No metric may rely on JSON file storage for feedback or lifecycle data.
2. **SQLite is the source of truth** — All business metrics must be computed from persisted SQLite rows and timestamp columns.
3. **Atomic lifecycle updates** — `review_requests` status + timestamp must be written in one SQL statement via `setLifecycleStatus()`.
4. **Outbox worker is authoritative** — `process-email-outbox.js` is the source of truth for `sent_at` / `failed_at` on `review_requests`.
5. **Transactional feedback** — `INSERT feedback` + `UPDATE review_requests` lifecycle must occur in one `db.transaction()`.
6. **Monotone lifecycle** — Transitions must never regress. `setLifecycleStatus()` enforces this with an order guard.
7. **Activation correctness** — `orgs.activated_at` must equal `MIN(sent_at)` of the org's requests, not `MIN(created_at)`.

---

## 8. Deprecated / Non-authoritative Sources

| Source | Status | Reason |
|--------|--------|--------|
| `messages` table | **Legacy** | Replaced by `email_outbox`. Do not use as metric source. |
| `review_requests.status` alone | **Insufficient** | Status without its corresponding timestamp column is not a reliable metric. Always use the timestamp. |
| `review_requests.created_at` | **Not a delivery signal** | `created_at` does not imply the request was sent. Use `sent_at` for delivery metrics. |
| `usage_ledger`-based activation | **Deprecated for activation rate** | Replaced by `activated_at`-based definition (Step 5). Still returned under `deprecated_usage_signals` for breakdowns. |

---

## 9. Validation Record

**Date:** 2026-02-11  
**Validated by:** End-to-end lifecycle test on live SQLite DB (`reputy.db`).

Full lifecycle validated on a single review_request (`17d4350809b14312dcb01c61`):

| Transition | Status | Timestamp (UTC) | Delta |
|------------|--------|-----------------|-------|
| Creation | `created` | `16:35:23.526Z` | — |
| Queue in outbox | `queued` | `16:35:23.530Z` | +4ms |
| Worker send (dry-run) | `sent` | `16:35:23.827Z` | +297ms |
| Patient feedback | `feedback_received` | `16:35:23.878Z` | +51ms |
| Google redirect beacon | `public_redirected` | `16:35:23.915Z` | +37ms |

Verified:
- Monotone guard: no retrograde transition possible.
- Atomic transactions: outbox insert + lifecycle update in same `db.transaction()`.
- `email_outbox.request_db_id` correctly linked.
- `feedbacks.org_id` denormalized.
- `orgs.activated_at` set to `MIN(sent_at)`.
- Beacon returns HTTP 204 (fire-and-forget).

---

## 10. Change Policy

- **Any metric change requires updating this document first** — code review must verify doc is current.
- ✅ Step 5 resolved (2026-02-11):
  - ~~Migrate `handleAdminMetrics` to use `computeSinceISO(days)`.~~ Done.
  - ~~Replace `activation_rate_percent` with `activated_at`-based definition.~~ Done.
  - ~~Replace `requests.in_period` with per-status lifecycle counts.~~ Done.
  - ~~Add `north_star_v1` to top-level payload.~~ Done.
- Update §9 validation record after each significant lifecycle change.

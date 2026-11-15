# FleetFuel Guard — Project Report

**Fuel Leakage Detection & Prevention System · Vidyanagara PU College (ArtIntele Intern Project)**

Team module: Person 2 — Backend, Database & Integration (Part D lead), delivered together with
the full Part C prototype in the same repository. Deadline: Thursday, 19 November 2026, 9:00 AM IST.

> **Framing rule used everywhere in this project:** the system surfaces *discrepancies* with
> evidence and asks a human to review them. It never states "fraud confirmed". Flagged items are
> always labelled **Needs review / Discrepancy detected**, and "amount at issue" is never presented
> as a confirmed loss. Confirmed fraud is not established by the supplied files alone.

---

## 1. Executive summary

The college's eight diesel buses are fuelled from a credit account at Shree Lakshmi Fuels or in
cash, and the only record was a paper register. This project replaces that paper process with:

1. **A driver mobile app** to record every fill at the pump (5 steps: bus → litres/amount →
   evidence photos → location → review), usable one-handed, in sunlight, offline, and with a
   Kannada toggle.
2. **An office dashboard** for the transport manager, accountant and principal: KPIs, entries,
   flagged fills with evidence, pump-statement reconciliation, approvals, bus/QR management and
   an audit log.
3. **A real backend** (Person 2 deliverable): SQLite database with migrations, idempotent import
   of all seven supplied CSVs (including 54,522 GPS pings), JWT login with server-enforced
   role permissions, the detection engine, evidence storage, reconciliation, maker-checker
   approvals, append-only corrections/audit, and deployment configuration.

**What the data shows (quantified, unresolved — not proof of theft):**

| Quantified item | Amount |
| --- | ---: |
| Register spend Aug–Oct 2026 (112 fills) | ₹12,55,535.02 |
| — of which credit account (81 fills) | ₹8,82,722.82 |
| — of which cash (31 fills) | ₹3,72,812.20 |
| Pump statement total (82 lines) | ₹8,79,345.56 |
| VB-03 repeated ₹4/L pump-rate premium (3 bills) | ₹1,616.00 |
| VB-02 register vs pump-bill amount gap (₹10,251.69 vs ₹9,001.69) | ₹1,250.00 |
| Pump bill for a vehicle not in the fleet (KA 99 MX 4417) | ₹3,749.34 |
| VB-03 pump bill with no register line (SLF/72169) | ₹4,286.88 |
| **Sum of the four quantified credit-account mismatches (provisional)** | **₹10,902.22** |
| Cash claims without receipts (3 entries, control gap) | ₹33,295.16 |

The ₹10,902.22 is the sum of four separately quantified but **unresolved** credit-account
mismatches — it is not a confirmed loss and must not be reported as theft. Each case has an
owner-style review path in the app (evidence → note → escalation → decision).

---

## 2. My contribution (Person 2 — what I built)

**Part C prototype (before the backend):** built the complete clickable MVP in this repository —
React 18 + TypeScript + Vite + Tailwind, with all Part C screens (login/roles, driver home,
5-step entry wizard, dashboard, entries, flagged detail, reconciliation, approvals, buses/QR,
audit), the rule engine, the EN/ಕನ್ನಡ toggle and the demo dataset mapped 1:1 from the CSVs.

**Part D backend (the main Person 2 deliverable), in `server/`:**

- **Architecture & contract.** Kept frontend, API and detection modules separated; agreed the
  request/response shapes with the frontend (the serializers emit exactly the Part C types) and
  the rule interface with the detection engine (`runEntryChecks` outputs: rule code, severity,
  reason, explanation, evidence, amount at issue).
- **Database.** SQLite via better-sqlite3 (WAL) with a versioned migration system (currently v1)
  and 16 tables: `users, buses, fuel_entries, evidence, gps_pings, pump_statement_files,
  pump_statement_lines, flags, flag_notes, approvals, corrections, audit_events,
  reconciliation_results, diesel_prices, college_calendar, places` — foreign keys, indexes and
  timestamps throughout.
- **Idempotent CSV import.** One command imports **all seven** supplied CSVs (8 buses; 112
  register entries with IST timestamps normalised; 82 pump statement lines with DD-MM-YYYY dates
  normalised; 54,522 GPS pings; 92 diesel prices; 7 holidays; 3 places) keyed on natural unique
  IDs with `INSERT OR IGNORE`/upsert — **re-running never duplicates rows** (verified).
- **Authentication & RBAC.** JWT login (bcrypt, 12 h tokens), five demo accounts plus a disabled
  `system` user, and a permission matrix enforced **server-side** — drivers are scoped to their
  own bus at the SQL level; accountants cannot change flag status; managers cannot decide
  approvals; principals cannot create entries. The frontend guard is cosmetic; the API returns
  401/403 for every violation.
- **Fuel entry API.** `POST /fuel-entries` accepts multipart form data with the full fill record
  (server assigns the timestamp and entry ID), up to two images, GPS coordinates or an honest
  "location unavailable" note, and a `clientRef` for **offline-sync idempotency** — replaying the
  same draft returns the already-saved entry instead of duplicating it. A rule hit never blocks
  the save (201 even when flags fire).
- **Detection integration.** The rule engine runs server-side on every new entry with the same
  codes and thresholds as the frontend (RATE_MISMATCH, TANK_CAPACITY, DUPLICATE_ENTRY,
  SHORT_INTERVAL, HOLIDAY_FILL, RECEIPT_MISSING, ODOMETER_PHOTO_MISSING, LOCATION_UNAVAILABLE);
  each hit is persisted as a flag with plain-language reason, severity, confidence, evidence and
  status `needs_review`.
- **Evidence storage.** Odometer/receipt images are validated (JPEG/PNG/WebP, ≤5 MB) and stored
  in a private folder outside the web root; files are served only through
  `GET /evidence/:id/file` with a valid token (query-token support for `<img>` rendering).
  Nothing is publicly listable.
- **Reconciliation.** Statement import endpoint (multipart CSV, upsert by bill number) plus a
  live matching engine against credit-account register fills, returning the six canonical
  categories (matched 75, rate_mismatch 3, amount_mismatch 1, register_missing 1,
  unmatched_pump_bill 1, possible_duplicate 1 for the supplied statement). Reviewer decisions
  with mandatory notes are persisted per bill number (bill numbers contain `/`, so they travel
  in the request body).
- **Audit & corrections.** No delete endpoint exists anywhere. Corrections are append-only
  proposals (old value / new value / reason / actor / server time); when the principal approves
  one, the entry is updated and the audit trail records before/after. **Maker-checker is
  enforced in the database layer logic:** the submitter of an approval can never decide it
  (403), and a decided approval cannot be decided again (409).
- **Deployment configuration.** Environment variables (`PORT, JWT_SECRET, DB_PATH, UPLOAD_DIR,
  DATA_DIR, CORS_ORIGIN, TOKEN_TTL_HOURS`) with safe defaults, CORS allow-list, public health
  endpoint, automatic import + seed on boot, `.env.example`, and secrets kept out of git.
- **Testing.** An end-to-end API smoke suite (`npm run smoke`, 53 checks, all passing) that boots
  a throwaway server on a fresh database and verifies: auth, role scoping, entry creation with
  rules, idempotent replay, private evidence serving, RBAC denials, reconciliation categories,
  seeded reviewer decisions, statement re-import idempotency, flag review → escalation →
  principal decision, self-approval block, double-decision block, corrections applied via
  approval, GPS path computation, dashboard aggregates and the audit trail.
- **Frontend integration (API mode).** Added `src/services/rest.ts` behind
  `VITE_API_MODE=rest`: the existing UI now calls the real endpoints (login, bootstrap snapshot,
  save with photo upload, offline replay, flag review/notes, statement import, reconciliation
  decisions, approval decisions) with **no changes to the UI components**. Mock mode remains the
  default so the demo still works fully offline.

**Documentation:** `server/API.md` (full contract + permission matrix + demo accounts),
`README.md`, `docs/Backend-APIs.md` (design seam → implemented), `docs/PartC-Mapping.md`,
`docs/Walkthrough.md`.

---

## 3. Team division & how the parts fit

| Module | Owner | This repository |
| --- | --- | --- |
| Part A data investigation, findings.csv, detection rules | Person 1 | 9 seeded cases in the app mirror `findings.csv`; rule engine ports the same thresholds |
| Part D backend, database, integration | **Person 2 (me)** | `server/` — schema, import, auth/RBAC, APIs, evidence, reconciliation, audit |
| Part C screens, flows, UX | Person 3 | `src/pages/**` — Part C MVP built first, then wired to Person 2's APIs via the service layer |

Integration checkpoints from the team plan were met: canonical status vocabulary
(`saved, needs_review, under_review, awaiting_evidence, resolved, approved, rejected`), stable
request/response shapes (`GET /bootstrap` returns everything a screen needs in one call), and
working login → bus list → create-entry endpoints before office screens were integrated.

---

## 4. System architecture

```
┌───────────────────────────  Driver phone  ───────────────────────────┐
│  React app (mobile layout)                                           │
│  5-step wizard · offline drafts · Kannada labels                     │
└──────────────┬───────────────────────────────────────────────────────┘
               │ multipart POST /fuel-entries (clientRef) · GET /bootstrap
┌──────────────▼───────────────────────────────────────────────────────┐
│  Express API (server/src)                                            │
│  auth: JWT + RBAC middleware   entries   buses/QR   GPS path          │
│  flags  approvals (maker-checker)  statements  reconciliation        │
│  detection engine → flags (never blocks save)   audit (append-only)  │
└──────────────┬───────────────────────────────────────────────────────┘
               │ better-sqlite3 (WAL)
┌──────────────▼───────────────────────────────────────────────────────┐
│  SQLite: 16 tables · migration v1                                    │
│  users buses fuel_entries evidence gps_pings statements flags        │
│  approvals corrections audit_events reconciliation prices calendar   │
└──────────────────────────────────────────────────────────────────────┘
        ▲                                ▲
        │ private uploads/ (images)      │ intern_pack CSVs → idempotent import
```

The office React app (desktop layout) uses the same API. In **API mode** every screen reads from
`GET /bootstrap` (one role-scoped snapshot) and every action POSTs to the API, then re-reads the
snapshot — the server is the single source of truth. In **mock mode** the same UI runs on the
in-memory store seeded from the CSVs, so the demo never depends on the network.

---

## 5. Complete functioning — the flows end to end

### 5.1 Driver records a fill (the core loop)

1. **Scan / select bus.** The driver opens the app, taps the QR tag on the windscreen (or uses
   the manual search fallback if the code is damaged — the failure path is a first-class state).
   The bus is confirmed on screen; if a different bus is chosen after the scan, the change is
   recorded as an audit note *before* submission.
2. **Fill details.** Litres, amount, fuel type, odometer, payment mode, pump. While typing, the
   app compares the implied ₹/L against the published daily price and shows a live warning if it
   drifts ≥₹0.50/L, and warns if the litres exceed the tank capacity — **warnings only, saving is
   never blocked**.
3. **Evidence.** Odometer photo (recommended) and receipt photo (optional). A simulated upload
   failure with retry is a deliberate demo state. If the receipt cannot be photographed, the
   driver says so; cash fills without receipts raise a low-severity flag later.
4. **Location.** The browser is asked for GPS. If permission is denied or the lock fails, the
   entry is saved with "Location unavailable" — **nothing is invented** to fill the gap.
5. **Review & save.** One summary screen, then confirm. The server assigns the entry ID and
   server time, runs all rules, persists any flags, and returns the saved entry. If the device
   was offline, the draft queues as *Pending sync* and replays automatically — the server
   deduplicates via `clientRef`, so a retry can never create a second fill.

**Result on the server:** entry saved (112 historical + new), flags attached if rules fired, audit
event written. The driver sees *Saved* or *Needs review*; the office sees it instantly in the
dashboard/entries lists.

### 5.2 Flag lifecycle (discrepancy → decision)

- Rules (auto) or the seeded findings create flags. Each flag shows: plain-language reason,
  evidence summary, amount at issue, confidence, and structured figures (e.g. "GPS path ≈172.7 km
  vs odometer +97 km"). Wording stays in "needs review / discrepancy" territory.
- The transport manager opens the case (first view is audited), compares evidence cards
  (register vs pump bill vs GPS path), and adds notes.
- Manager actions, each with a **mandatory reason**: mark *Under review*, *Escalate* (creates an
  approval task for the principal), *Resolved*, or *Rejected*.
- The principal decides the escalated case: *Approve*, *Reject*, or *Request info* — again with a
  mandatory reason; approval resolves the flag; the maker of the escalation can never decide it.

### 5.3 Reconciliation (accountant)

The accountant uploads the monthly pump statement CSV (or loads the bundled demo statement, which
is the same file). Each of the 82 bill lines is compared with credit-account register fills by
date/vehicle/amount/litres and classified: **75 matched, 3 rate mismatches (VB-03 ₹4/L premium),
1 amount mismatch (VB-02 ₹1,250), 1 bill for an unknown vehicle, 1 bill missing from the register,
1 possible duplicate register line.** Every non-matched row can be resolved with a mandatory
human note (`resolved / needs_supplier_clarification / authorised_exception`), and the decisions
persist. Results are exportable as CSV.

### 5.4 Corrections (no silent edits)

The manager proposes a correction to litres/amount/odometer with a reason. The original value is
kept, the proposal is pending until the principal approves it, and only then is the entry updated
— with an audit event recording `field: old → new` and the approval that justified it. There is
no delete anywhere in the system.

### 5.5 Buses, QR and GPS evidence

The manager can print windscreen QR tags (payload `vpc-fleetfuel:bus:VB-xx` — a stable bus ID
with no personal data), look buses up manually, and pull **GPS evidence**: for any bus and date
interval the API returns the pings and the Haversine path length (e.g. F0071 → F0111 for VB-08:
171 pings, ≈172.7 km vs odometer +97 km — the figure quoted in flag FLG-07). Missing GPS is
reported as "no data — possible tracker outage", never as wrongdoing.

### 5.6 Audit log

Every creation, view, note, status change, correction, escalation, decision, statement import and
bus lookup is recorded with actor and server time, filterable by entity. This is what makes the
"no hard delete / preserve history" promise real.

---

## 6. Detection rules (deterministic, threshold-based)

| Rule code | Threshold | Severity | What it means on screen |
| --- | --- | --- | --- |
| `RATE_MISMATCH` | rate differs from published price ≥ ₹1/L (≥ ₹0.50/L) | high / medium | "Rate ₹X/L vs published ₹Y/L" — pump pricing issue or data-entry error |
| `TANK_CAPACITY` | litres > stated tank capacity | high | verify the tank spec before concluding anything |
| `DUPLICATE_ENTRY` | same bus/day, ≤0.5 L and ≤1 km apart | high | likely honest double entry |
| `SHORT_INTERVAL` | <24 h, ≥25 L, odometer delta <100 km | medium | unusual same-day refill pattern |
| `HOLIDAY_FILL` | fill on a calendar holiday | medium (cash) / low | special trip possible |
| `RECEIPT_MISSING` | cash fill without receipt photo/on-file | low | paperwork control gap |
| `ODOMETER_PHOTO_MISSING` | no odometer photo at save | low | office may ask later |
| `LOCATION_UNAVAILABLE` | no GPS coordinates recorded | low | verified manually with the receipt |

**False-positive limitations (documented, tested):** published-price fallback uses the most
recent earlier price; tank capacities come from the roster and may be outdated (VB-06 case);
duplicate detection needs exact-ish values; GPS path ≠ odometer distance (routes, detours,
tracker outages). Known seeded cases (VB-03 premium, F0052 amount mismatch, unknown-vehicle bill,
missing register line, F0078 capacity, F0112 duplicate, F0111 holiday/GPS, F0109 short interval)
are asserted by both the engine smoke test and the API smoke test.

---

## 7. Verification (what actually passes)

| Suite | Command | Result |
| --- | --- | --- |
| Engine smoke (frontend rules + reconciliation) | `npm run smoke` | 24/24 checks; categories {matched 75, rate 3, amount 1, unmatched 1, register-missing 1, duplicate 1} |
| **API smoke (backend end-to-end, fresh DB)** | `cd server && npm run smoke` | **53/53** — auth, scoping, entry+rules, idempotent replay, evidence privacy, RBAC denials, reconciliation, maker-checker, corrections, GPS path, audit |
| Type-check + production build | `npx tsc -b && npm run build` (both apps) | clean |
| Import idempotency | `npm run import` (twice) | totals unchanged (8/112/82/54,522) |
| Live integration | backend :4000 + frontend `VITE_API_MODE=rest` | login → bootstrap → save → retry-dedupe → evidence → office snapshot verified |

## 8. How to run

```bash
# frontend (mock demo, no network needed)
npm install && npm run dev            # http://localhost:5173

# backend (real database + APIs)
cd server && npm install && npm run dev   # http://localhost:4000/api

# frontend against the backend: copy .env.example → .env.local, uncomment
#   VITE_API_MODE=rest
#   VITE_API_URL=http://localhost:4000/api
# logins: driver / manager / accountant / principal / admin — password demo123
```

## 9. Limitations & cautions

- Mock mode resets on refresh; **API mode is the persistent system**.
- QR scanning is simulated in-app (camera scan is a Part-D+ nicety); the QR payload itself is real.
- Offline drafts queued for sync lose queued photo bytes if the page reloads first; the entry
  still syncs and the low-severity `ODOMETER_PHOTO_MISSING` flag records the gap honestly.
- The efficiency chart is a derived estimate (odometer deltas ÷ litres), labelled as such.
- Deployment to a public HTTPS URL (render/vercel + a hosted SQLite volume) is configured but the
  live link is the remaining pre-deadline step, along with the ≤5-minute demo video.
- The four quantified credit mismatches (₹10,902.22 total) remain **unresolved** — the system's
  job is to keep them visible with evidence until humans close them.

---

# Part E — One-page note for the Principal

**To:** The Principal, Vidyanagara PU College  **From:** FleetFuel Guard project team
**Re:** Fuel accountability for the 8-bus fleet — findings and recommended controls

**What we built.** A fuel-entry app for drivers and a review dashboard for your office, backed by
a real database. Every fill is recorded at the pump with litres, amount, odometer, payment mode
and photos; the system automatically compares each fill against the published diesel price, the
bus's tank capacity, its own history and the pump's monthly statement, and flags anything unusual
for human review. Nothing is ever auto-labelled as fraud — the system's language is "needs
review", and every conclusion is reached by a person, with the evidence on screen.

**What three months of data shows (Aug–Oct 2026: 112 fills, ₹12,55,535.02).** Four credit-account
discrepancies are quantified and still unresolved: a repeated ₹4-per-litre premium on three VB-03
pump bills (₹1,616.00), a ₹1,250.00 gap between the register and pump bill for one VB-02 fill, a
₹3,749.34 pump bill for a vehicle that is not on the college roster, and a ₹4,286.88 pump bill
with no register entry at all — ₹10,902.22 in total. Separately, three cash claims totalling
₹33,295.16 have no receipts (a paperwork control gap, not by itself evidence of misuse). These
figures are defensible from the source files; what they *mean* (supplier error, bookkeeping
error, or misuse) is exactly what the new review workflow is designed to establish.

**Controls we recommend adopting.** (1) Drivers log every fill in the app with an odometer photo —
receipts photographed at the pump, not handed in later. (2) The office imports the pump statement
monthly and clears every mismatch with a written note. (3) Any register correction requires a
reason and your approval; the original value is never overwritten silently. (4) No one reviews or
approves their own submission. (5) Keep the audit trail — it is your record of who did what and
when.

**Process & cost.** Running cost is minimal: the backend runs on one small free/low-tier server
(≈ ₹0–500/month), the app runs on the phones you already own, and the pump statement stays a CSV
the pump already provides. The realistic saving is the recovery of over-billed amounts (the
₹4/L premium alone is recurring) plus the deterrent effect of a documented, evidence-based
process. We ask for one decision: nominate who reviews flags weekly (transport manager) and who
decides escalations (your office), and the system handles the rest.

*Prepared with the evidence tables in this report; amounts are as computed from the supplied
CSVs and remain open items until reviewed.*

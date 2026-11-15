# FleetFuel Guard — Backend API (Person 2)

Base URL: `http://localhost:4000/api` · JSON over HTTP · Auth: `Authorization: Bearer <JWT>`
JWTs are returned by `POST /auth/login` and expire after `TOKEN_TTL_HOURS` (default 12 h).

Health probe (public): `GET /api/health` → `{ ok, name, time, counts }`.

## Demo accounts (seeded; all passwords `demo123`)

| Username | Name | Role | Scope |
| --- | --- | --- | --- |
| `driver` | Hanumanthappa G | driver | bus VB-07 only |
| `manager` | Ravi S | transport_manager | full office read; entries, corrections, flag reviews, statement import, escalation |
| `accountant` | Lakshmi Devi | accountant | full office read; statement import, reconciliation reviewer decisions, notes |
| `principal` | Dr. Suresh Rao | principal | full office read; approval decisions |
| `admin` | System Admin | admin | everything office-side (incl. approvals), cannot self-approve |
| `system` | Import System | admin (disabled) | owner of imported register rows; login blocked |

## Permission matrix (enforced server-side — not by hiding buttons)

| Action | driver | transport_manager | accountant | principal | admin |
| --- | --- | --- | --- | --- | --- |
| POST `/fuel-entries` | own bus only | ✔ | ✖ | ✖ | ✔ |
| GET `/fuel-entries` (+detail) | own bus only | ✔ | ✔ | ✔ | ✔ |
| POST `/fuel-entries/:id/corrections` | ✖ | ✔ | ✖ | ✖ | ✖ |
| POST `/fuel-entries/:id/evidence` | own bus | ✔ | ✖ | ✖ | ✔ |
| GET `/evidence/:id/file` | own bus | ✔ | ✔ | ✔ | ✔ |
| GET `/buses`, `/buses/:code`, `/buses/:code/qr` | own bus | ✔ | ✔ | ✔ | ✔ |
| GET `/buses/:code/path` (GPS evidence) | ✖ | ✔ | ✔ | ✖ | ✔ |
| GET `/flags`, `/flags/:id`, add notes | ✖ | ✔ | ✔ | ✔ | ✔ |
| POST `/flags/:id/review` | ✖ | ✔ | ✖ | ✖ | ✔ |
| POST `/statements/import` | ✖ | ✔ | ✔ | ✖ | ✔ |
| GET `/reconciliation` | ✖ | ✔ | ✔ | ✔ | ✔ |
| POST `/reconciliation/decision` | ✖ | ✔ | ✔ | ✖ | ✔ |
| GET `/approvals` | own submissions | own submissions | own submissions | ✔ | ✔ |
| POST `/approvals` (escalate) | ✖ | ✔ | ✖ | ✖ | ✔ |
| POST `/approvals/:id/decision` | ✖ | ✖ | ✖ | ✔ | ✔ |
| GET `/dashboard`, `/audit`, `/bootstrap` | own scope | ✔ | ✔ | ✔ | ✔ |

Maker-checker: the submitter of an approval can never decide it (`403`), double decisions are blocked (`409`), and there are **no delete endpoints** — corrections and audit are append-only.

## Endpoints

| Method & path | Purpose |
| --- | --- |
| `POST /auth/login` | `{username, password}` → `{token, user}` |
| `GET /auth/me` | current user from token |
| `GET /bootstrap` | one role-scoped snapshot: user, buses, entries, flags, flagNotes, approvals, corrections, statementLines, reconciliation, audit, prices, holidays |
| `GET /buses` | buses allowed for the current user |
| `GET /buses/:code` | bus detail + last 100 entries |
| `GET /buses/:code/qr` | `{busCode, regNo, qrPayload: "vpc-fleetfuel:bus:VB-xx"}` |
| `GET /buses/:code/path?date=D` or `?from=TS&to=TS` | GPS pings + Haversine path (from exclusive → to inclusive). Missing GPS is reported, never labelled fraud. |
| `POST /fuel-entries` | multipart form: `busCode, timestampClient, litres, amount, fuelType, odometerKm, paidBy, paymentMode, pumpName, billNo?, location?{lat,lng,accuracyM}, locationNote?, receiptOnFile?, clientRef?, activityNotes?` + optional files `odometerPhoto`, `receiptPhoto` (JPEG/PNG/WebP, ≤5 MB). Returns `{entry, ruleHits, flagIds}` — **201 even when rules fire**; rules never block the save. `clientRef` makes offline sync idempotent (replay → `200` + same entry). |
| `GET /fuel-entries` | filters `bus, status, payment, from, to, q` + `page/pageSize` (driver scoped to own bus) |
| `GET /fuel-entries/:id` | entry + linked flags + notes + corrections + audit timeline |
| `POST /fuel-entries/:id/corrections` | `{field: litres|amount|odometerKm, proposedValue, reason}` — append-only proposal (manager) |
| `POST /fuel-entries/:id/evidence` | attach photos after the fact (retry path) |
| `GET /evidence/:id/file` | private file stream (auth required; `?token=` accepted for `<img>` use) |
| `GET /flags` | office list, filter `status`, `busCode` |
| `GET /flags/:id` | detail + notes + timeline + linked entries (first office view is audited) |
| `POST /flags/:id/notes` | `{text}` (office roles) |
| `POST /flags/:id/review` | `{status: under_review|awaiting_evidence|resolved|escalated|rejected, reason}` — mandatory note. `escalated` also creates the approval (maker = caller). |
| `POST /statements/import` | multipart `file` (CSV: date DD-MM-YYYY, vehicle_no, bill_no, litres, rate, amount). Idempotent upsert by `bill_no`; returns `{fileId, fileName, lineCount, newLines, summary}` |
| `GET /reconciliation` | live match: `matched, amount_mismatch, rate_mismatch, unmatched_pump_bill, register_missing, possible_duplicate` + persisted reviewer state |
| `POST /reconciliation/decision` | `{billNo, decision: resolved|needs_supplier_clarification|authorised_exception, note}` — mandatory note (bill numbers contain `/`, so they travel in the body) |
| `GET /approvals` | principal/admin: all; others: own submissions |
| `POST /approvals` | `{flagId|correctionId, reviewNotes}` — escalation (manager/admin) |
| `POST /approvals/:id/decision` | `{decision: approved|rejected|info_requested, reason}` — principal/admin; maker-checker enforced; approvals resolve/reject their target flag or apply the correction |
| `GET /audit` | `entityType`, `entityId`, `limit` filters |
| `GET /dashboard` | KPI aggregates: totals, modes, monthly, per-bus efficiency, flag/approval/reconciliation counts, recent fills |
| `GET /reference` | prices, holidays, places |

## Status vocabulary (canonical)

- Entry: `saved, needs_review, awaiting_evidence, under_review, resolved, approved, rejected, pending_sync`
- Flag: `needs_review, under_review, awaiting_evidence, escalated, resolved, rejected`
- Approval: `pending → approved | rejected | info_requested`
- Reconciliation match: `matched, amount_mismatch, rate_mismatch, unmatched_pump_bill, register_missing, possible_duplicate`
- Reviewer decision: `none, resolved, needs_supplier_clarification, authorised_exception`

Framing rule enforced in data: flags carry `reason` + `plain_explanation`; no field ever asserts fraud.

## Detection rules (same codes/thresholds as the frontend engine)

`RATE_MISMATCH` (≥₹1/L high, ≥₹0.50/L medium) · `TANK_CAPACITY` · `DUPLICATE_ENTRY` (same bus/day, ±0.5 L, ±1 km) · `SHORT_INTERVAL` (<24 h, ≥25 L, <100 km) · `HOLIDAY_FILL` · `RECEIPT_MISSING` · `ODOMETER_PHOTO_MISSING` · `LOCATION_UNAVAILABLE`

## Data foundation

- SQLite via better-sqlite3 (file: `server/data/fleetfuel.db`, WAL). Migration v1 = full schema: `users, buses, fuel_entries, evidence, gps_pings, pump_statement_files, pump_statement_lines, flags, flag_notes, approvals, corrections, audit_events, reconciliation_results, diesel_prices, college_calendar, places`.
- `npm run import` (also runs automatically at boot): idempotent import of all seven CSVs — 8 buses, 112 register entries, 82 statement lines, 54,522 GPS pings, prices/calendar/places — plus seed of users, the 9 investigation cases from findings, 3 seeded approvals (submitted by the manager), reviewer decisions and audit history. Re-running never duplicates.
- Evidence files live in `server/uploads/` (private) and are served only through `GET /evidence/:id/file` with a valid token.

## Configuration

Copy `server/.env.example` → `server/.env`. All values have safe defaults; **set `JWT_SECRET` in production** and never commit it.

## Run

```bash
cd server
npm install
npm run dev        # tsx watch on :4000 (import + seed on boot)
npm run smoke      # 53 end-to-end checks on a throwaway DB (:4010)
npm run build      # esbuild bundle → dist/server.cjs
```

CORS allows the Vite dev origin(s) listed in `CORS_ORIGIN`.

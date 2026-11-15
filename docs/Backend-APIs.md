# Backend APIs / data still needed for Part D

> **Status (Part D, Person 2): implemented.** The backend lives in `server/` (Express +
> PostgreSQL primary with automatic SQLite fallback). The authoritative, implemented contract —
> endpoints, permission matrix, demo
> accounts and status vocabulary — is [`server/API.md`](../server/API.md). This document is
> kept as the original design seam list.

The frontend service layer (`src/services/api.ts`) is the seam: each exported function below maps
to a future endpoint. Nothing in the UI would need rewriting beyond the service module.
(In API mode — `VITE_API_MODE=rest` — the frontend now calls the real endpoints through
`src/services/rest.ts` and the UI code is unchanged.)

## Auth & users
- `POST /auth/login`, `POST /auth/logout` — real authentication (mock today: role selector).
- `GET /me` — role + permissions. **Enforce role rules on the backend** (the frontend guard is
  cosmetic). Self-approval must be rejected server-side too.
- `GET /users` — staff directory for submitter/approver names.

## Fuel entries
- `GET /entries?bus=&status=&from=&to=&pump=&payment=` — list (dashboard/tables).
- `GET /entries/:id` — detail incl. attachments and location.
- `POST /entries` — create. Server assigns `timestampServer`, runs the rule engine, returns the
  entry + triggered rule hits; status `saved | needs_review` decided server-side.
- `POST /entries/bulk-sync` — upload offline drafts; server must dedupe by client entry UUID.
- **No DELETE endpoint for entries or evidence** (audit requirement).

## Evidence
- `POST /evidence` (multipart) — odometer/receipt photos; return stable URLs. Keep originals,
  allow replace-only.
- `GET /evidence/:id` — authenticated download.

## Rules & flags
- `GET /flags?status=&severity=&bus=` / `GET /flags/:id`.
- `POST /flags/:id/status` — under review / resolved / escalated, reason mandatory.
- `POST /flags/:id/notes`.
- Rule engine runs server-side so thresholds/timestamps are tamper-proof; document each rule's
  threshold in a config table so the UI can display "threshold used".

## Pump statements & reconciliation
- `POST /statements` (CSV upload) → parse + persist raw file.
- `GET /statements/:id/lines`, `GET /reconciliation?statement=` — server-computed matches with
  both sides and differences.
- `POST /reconciliation/:id/decision` — resolved / supplier clarification / authorised exception,
  mandatory note.
- `GET /reconciliation/export.csv`.

## Approvals
- `GET /approvals?state=pending` / `POST /approvals` (escalate) / `POST /approvals/:id/decision`
  (approve / reject / request-info with reason; reject server-enforced self-approval).

## Corrections
- `POST /entries/:id/corrections` — proposal only; originals immutable.
- `POST /corrections/:id/decision` — approve/reject; applying a correction writes an audit event,
  never overwrites the row.

## Audit
- `GET /audit?entity=&actor=&from=&to=` — server-generated events for creates, views, notes,
  status changes, corrections, escalations, statement loads, QR/bus lookups.

## Reference data & telematics
- `GET /buses` (roster incl. tank litres), `PATCH /buses/:id`.
- `GET /prices/daily`, `GET /calendar/holidays`.
- GPS ingestion: `POST /gps/pings` (device) + `GET /gps/paths?bus=&date=` for the
  odometer-vs-GPS evidence; keep pings immutable.
- Notification hook (email/WhatsApp) for "needs review" and approval outcomes.

## Non-functional for Part D
- Offline-first client storage (IndexedDB) with conflict-safe sync keyed by client UUID.
- Image handling: compression + EXIF stripping; store hash for tamper evidence.
- Timezone discipline: all timestamps IST with UTC storage; server time authoritative.
- Permissions matrix per role; principle of least privilege; audit log append-only.

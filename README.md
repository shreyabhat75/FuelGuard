# FleetFuel Guard

**Fuel accountability for Vidyanagara PU College** — Part C MVP for the ArtIntele internship
project. A mobile-first fuel-entry app for drivers and a desktop fleet-monitoring dashboard for
the office, built on the synthetic Aug–Oct 2026 diesel dataset (8 buses, 112 register fills,
82 pump statement lines).

> **Important framing:** the app surfaces *discrepancies* with independent evidence and asks a
> human to review them. It never labels a transaction "fraud confirmed". Suspicious items are
> always marked **Needs review** / **Discrepancy detected**, and "amount at issue" is never
> presented as a confirmed loss.

---

## 1. Install & run

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build locally
```

Requires Node 18+. The project is React 18 + TypeScript + Vite 5 + Tailwind CSS 3 +
React Router 6 + Lucide icons + Recharts + qrcode.react. All data is mock: a small typed service
layer (`src/services/`) sits between the UI and an in-memory store seeded from the real CSVs, so
the mock layer can later be swapped for API calls without rewriting components.

## 2. Demo roles

Use the role selector on the sign-in screen (mock authentication — any password works):

| Role | Who | Sees |
|---|---|---|
| Driver — fuel entry | Hanumanthappa G (bus VB-07) | Mobile app: record fills, own entries, offline mode |
| Transport Manager | Ravi S | Dashboard, all entries, flagged fills + investigation, pump statement, buses & QR, audit log |
| Accountant | Lakshmi Devi | Dashboard, pump statement reconciliation, entries, flags, audit log |
| Principal / Approver | Dr. Suresh Rao | Dashboard, approval inbox, flags, entries, audit log |

Log out / switch role is available in the driver bottom bar and the office sidebar. **The role
guard is a frontend prototype guard only** — in production every permission (who may approve,
resolve, reconcile, correct) must be re-checked on the backend; this app demonstrates the
intended UX, not real security.

## 3. What is implemented (Part C mapping)

A screen-by-screen inventory against the Part C brief lives in
[`docs/PartC-Mapping.md`](docs/PartC-Mapping.md). Highlights:

- **Login** with demo role selector and clear prototype disclaimer (A)
- **Driver mobile home** with assigned bus, offline toggle, recent entries (B)
- **5-step pump entry wizard** — scan/simulated QR with error + manual fallback, fill details with
  live rate/capacity warnings, evidence photos with upload-failure/retry, location permission
  states, review + confirmation, saved/needs-review result (C)
- **Office dashboard** — KPIs (register spend ₹12,55,535.02, 112 entries, 8 buses, review counts),
  monthly spend chart, derived efficiency chart, recent entries table with filters (D)
- **Flagged fills list + investigation detail** with evidence-comparison cards, notes, timeline
  and manager actions (E, F)
- **Pump statement reconciliation** with demo CSV, match categories, reviewer decisions with
  mandatory notes, CSV export (G)
- **Principal approval inbox** with approve/reject/request-info, reasons and self-approval block (H)
- **Buses & QR management** with printable QR (bus ID only) and manual lookup (I)
- **Audit log** of creations, views, notes, status changes and corrections — no hard deletes (J)

## 4. Seeded cases & assumptions

The nine seeded investigation cases come straight from `findings.csv` (VB-03 rate premium,
VB-02 amount mismatch, unknown vehicle KA 99 MX 4417, VB-03 statement-only bill, VB-06 tank
conflict, VB-04 duplicate pair, VB-08 holiday cash fill, VB-02 short-interval refill, cash
claims without receipts). Data and rule assumptions are listed in
[`docs/PartC-Mapping.md`](docs/PartC-Mapping.md#5-mock-data--rule-assumptions).

## 5. Known limitations

- Everything is client-side mock state; refreshing the page resets the demo.
- "Uploads", QR scanning, server timestamps and sync are **simulated and labelled as demo** —
  nothing pretends to be a real camera, GPS lock or server round-trip.
- GPS coordinates are stored only if the browser actually provides them; otherwise the entry is
  marked "Location unavailable". No coordinates are ever invented.
- The printed QR encodes only `vpc-fleetfuel:bus:VB-xx` (stable bus ID, no personal data).
- Driver-facing text has an English/Kannada toggle; office screens are English-only.
- The efficiency chart is a **derived estimate** (odometer deltas ÷ litres) and is labelled as
  such — it is not a verified mileage figure.

## 6. What Part D still needs

See [`docs/Backend-APIs.md`](docs/Backend-APIs.md) for the API/data list (auth, entries,
statement upload + reconciliation, evidence storage, approvals, audit, GPS ingestion, etc.).

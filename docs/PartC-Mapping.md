# Part C screen / flow inventory

Mapping of the implementation to the Part C brief. Routes are relative to the dev server root.

| Part C item | Route(s) | Files | Notes |
|---|---|---|---|
| A. Login | `/login` | `src/pages/Login.tsx` | Role selector (4 roles), mock username/password, prototype disclaimer |
| B. Driver mobile home | `/driver` | `src/pages/driver/DriverHome.tsx` | Greeting, VB-07 bus card, offline demo toggle, pending-sync card, primary CTA, recent entries |
| C1. Identify bus | `/driver/entry` (step 1) | `src/pages/driver/steps/Step1Bus.tsx` | Simulated QR scan (+ unreadable-QR error state with retry/manual fallback), manual search, bus facts, confirm-bus gate, bus-change recording |
| C2. Fill details | step 2 | `src/pages/driver/steps/Step2Fill.tsx` | Numeric validation, live ₹/L vs published price, tank-capacity warning (non-blocking), holiday note |
| C3. Evidence | step 3 | `src/pages/driver/steps/Step3Evidence.tsx` | Real file input with preview, demo placeholder images, simulated upload failure + retry, receipt "not attached" notice, odometer-photo exception path |
| C4. Location & review | step 4 | `src/pages/driver/steps/Step4Review.tsx` | Real `navigator.geolocation` with granted/denied/unavailable states (never fabricates coords), full transaction summary, demo-server-time explanation, activity notes, confirmation checkbox |
| C5. Saved result | step 5 | `src/pages/driver/steps/Step5Done.tsx` | "Fuel entry saved" / "Saved — needs review" with plain-language reasons, View entry / Record another fill |
| D. Office dashboard | `/app` | `src/pages/office/Dashboard.tsx` | KPIs, Aug/Sep/Oct spend chart, derived efficiency chart, recent entries table, date/bus filters, row → detail |
| — Entries browser | `/app/entries` | `src/pages/office/EntriesPage.tsx` | Search + status/bus/pump/payment filters, responsive table→cards |
| — Transaction detail | `/app/entries/:id`, `/driver/entries/:id` | `src/pages/office/EntryDetailPage.tsx` | All values, location evidence, photos, linked flags, corrections (original preserved), timeline; manager can propose correction |
| E. Flagged fills list | `/app/flagged` | `src/pages/office/FlaggedPage.tsx` | Severity/status summary counts, search + filters, amount-at-issue column with "not a confirmed loss" framing |
| F. Investigation detail | `/app/flagged/:id` | `src/pages/office/FlagDetailPage.tsx` | Rule + threshold, plain-language explanation, register-vs-statement / price / tank / duplicate comparison cards, GPS figures card, confidence label, notes, timeline, manager actions (under review, request evidence, propose correction, resolve, escalate) with mandatory reasons |
| G. Reconciliation | `/app/reconciliation` | `src/pages/office/ReconciliationPage.tsx` | Drag/drop + demo statement loader, 6 match categories, both sides + exact difference, reviewer decisions with mandatory note, source file name preserved, CSV export |
| H. Approval inbox | `/app/approvals` | `src/pages/office/ApprovalsPage.tsx` | Pending cases with evidence completeness, approve/reject/request-info, mandatory reasons, confirmation dialog, self-approval blocked |
| I. Buses & QR | `/app/buses`, `/app/buses/:code` | `src/pages/office/BusesPage.tsx`, `BusDetailPage.tsx` | Roster table, bus detail, printable QR (`qrcode.react`, bus ID only), manual lookup fallback |
| J. Audit log | `/app/audit` | `src/pages/office/AuditPage.tsx` | Filterable timeline of every create/view/note/status-change/correction, before → after values, no hard delete |

Cross-cutting: role guard (`src/App.tsx` `Guard`), role-based navigation (`src/components/layouts.tsx`),
EN/ಕನ್ನಡ toggle (`src/i18n.ts`, driver-facing labels), demo offline mode with pending-sync and
auto-sync (`DriverHome`, `src/services/api.ts syncPendingEntries`), status chips
(`src/components/ui.tsx`).

## Data model

Typed models in `src/types.ts`: `User, Bus, FuelEntry, Flag, FlagNote, PumpStatementLine,
ReconciliationResult, Approval, AuditEvent, CorrectionProposal, DailyPrice, Holiday` — matching
the brief's required shapes (plus `FlagNote`/`CorrectionProposal`/`figures` for the audit and
correction flows). All mutations go through the service layer (`src/services/api.ts`), which also
writes `AuditEvent`s, so the mock store can be replaced with HTTP calls without touching UI code.

## 5. Mock data & rule assumptions

- Source CSVs are imported verbatim (`src/data/*.csv?raw`) and parsed at runtime — no hand-copied
  numbers. Verified: 112 register entries totalling ₹12,55,535.02 (81 credit / ₹8,82,722.82,
  31 cash / ₹3,72,812.20), 82 statement lines totalling ₹8,79,345.56.
- `registerEntries` uses the paper register's timestamps as both client and server time and
  `receipt_on_file` as `receiptOnFile`; register rows carry `location: null` (the paper register
  never had GPS).
- Seeded flags reproduce the 9 cases in `findings.csv` with the same amounts at issue
  (₹1,616.00 / ₹1,250.00 / ₹3,749.34 / ₹4,286.88 / 0 / 0 / 0 / 0 / ₹33,295.16).
- Demo "today" is the real system date. Published price for a date outside `diesel_price.csv`
  falls back to the last published price and is labelled as such.
- New-entry rule thresholds (demo values, documented on the flag cards):
  - **RATE_MISMATCH**: charged rate differs from the published price by ≥ ₹1/L (high) or
    ₹0.50–₹1/L (medium).
  - **TANK_CAPACITY**: litres > roster tank litres (high).
  - **DUPLICATE_ENTRY**: same bus, same day, litres within 0.5 and odometer within 1 km (high).
  - **SHORT_INTERVAL**: previous fill for the bus < 24 h earlier, this fill ≥ 25 L, and odometer
    delta < 100 km (medium).
  - **HOLIDAY_FILL**: date is a college holiday (cash → medium, credit → low).
  - **RECEIPT_MISSING / ODOMETER_PHOTO_MISSING / LOCATION_UNAVAILABLE**: informational (low).
  - Hits never block saving and never use the word "fraud".
- Reconciliation matching: statement line → bus by registration (whitespace-insensitive), then
  register credit entries on the same date; litres within 0.5 L; amount within ₹0.50 → matched,
  otherwise amount mismatch; rate compared to the published price (tolerance ₹0.05) → rate
  mismatch; no candidate → register missing; unregistered vehicle → unmatched pump bill; two
  exact register candidates → possible duplicate.
- Seeded approvals (FLG-02, FLG-03, FLG-04) were "submitted" by the transport manager, so the
  principal can act on them and the self-approval guard never trips.
- Investigation notes seeded for FLG-01/02/06 to make review screens feel lived-in.

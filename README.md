# FuelGuard — Frontend README

**Project:** FuelGuard · Fuel Leakage Detection & Prevention System  
**Organisation:** ArtIntele Internship  
**Person 3 deliverable:** Product Design & Frontend

---

## 1. Quick Start

```bash
# From the repository root (c:\FuelGraud\FuelGuard)
npm install
npm run dev        # → http://localhost:5173  (demo/mock mode, no backend needed)
npm run build      # TypeScript check (tsc -b) + production build to dist/ (zero errors)
npm run preview    # Serve dist/ locally
npm run smoke      # 25 detection-engine + reconciliation smoke checks (exits 0 = all pass)
```

---

## 2. Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | React | 18.3.1 |
| Language | TypeScript | 5.5.4 |
| Build Tool | Vite | 5.4.8 |
| Routing | React Router | 6.26.2 |
| Styling | Tailwind CSS | 3.4.13 |
| Charts | Recharts | 2.12.7 |
| Icons | Lucide React | 0.441.0 |
| QR Code | qrcode.react | 4.0.1 |
| Fonts | Inter + Noto Sans Kannada (Google Fonts CDN) | — |

---

## 3. Demo Accounts (Mock Mode)

In demo/mock mode, pick a role on the sign-in screen (`/login`). Any password works.

| Role | Demo User | Assigned Bus | Tailored Experience & Default Landing |
|---|---|---|---|
| **Driver / Pump User** | Hanumanthappa G | VB-07 | Mobile-first fuel entry app: 5-step wizard, simulated QR scanner, manual bus search, photo capture (odometer + receipt), GPS status, offline mode with pending-sync badge, transaction history, driver profile (`/driver`) |
| **Transport Manager** | Ravi S | Fleet-wide | Operational fleet dashboard: 7 KPI cards, 8 executive sections, spend & consumption trends, dedicated Bus Efficiency Hub (`/app/efficiency`), flag investigation detail with "Awaiting evidence" workflow, bus roster with printable QR codes (`/app`) |
| **Accountant** | Lakshmi Devi | Finance | Financial reconciliation hub: variance KPIs, match category cards, top discrepancy table, statement CSV import, tabbed mismatch filtering, resolution notes (`/app` dispatches `AccountantDashboard`) |
| **Principal / Approver** | Dr. Suresh Rao | Governance | Executive governance dashboard: pending approvals queue, decision log, spend vs discrepancy metrics, Maker-Checker lock enforcing strict block on self-approval, mandatory justification on all decisions (`/app` dispatches `PrincipalDashboard`) |

**API mode (real backend):** copy `.env.example` → `.env.local` and set `VITE_API_MODE=rest`. Start the backend (`cd server && npm run dev`). Credentials: username `driver / manager / accountant / principal`, password `demo123`.

---

## 4. Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_MODE` | _(unset)_ | Set to `rest` to use the real backend |
| `VITE_API_URL` | `http://localhost:4000/api` | Backend base URL |

No secrets belong in `.env.*` files. The JWT token is securely stored in `localStorage` by `src/services/rest.ts`.

---

## 5. Frontend Architecture

```
src/
├── App.tsx                   # Router + role-based Guard + dynamic role dashboard dispatcher
├── types.ts                  # TypeScript models (User, Bus, FuelEntry, Flag, Approval, Reconciliation, …)
├── i18n.ts                   # EN / Kannada string dictionary + useI18n hook
├── index.css                 # Tailwind layers + tnum utility + print styles
├── main.tsx                  # React root mount
│
├── components/
│   ├── ui.tsx                # Design system: Button, Chip, StatusChip, Card, CardHeader,
│   │                         #   Field, Banner, Modal, EmptyState, Spinner, KpiCard, DataTable
│   ├── layouts.tsx           # OfficeLayout (sidebar), DriverLayout (mobile bottom nav + Quick QR modal),
│   │                         #   Brand, RoleBadge, LangToggle, SwitchRoleModal
│   └── charts.tsx            # MonthlySpendChart, ConsumptionTrendChart, EfficiencyChart, ModeSplitBars, SeverityDots
│
├── pages/
│   ├── Login.tsx             # Role selector + mock/real login
│   ├── driver/
│   │   ├── DriverHome.tsx    # Mobile home with bus card, offline toggle, recent entries
│   │   ├── EntryWizard.tsx   # 5-step fuel-entry wizard orchestrator (supports QR pre-selection)
│   │   ├── DriverEntries.tsx # Driver's own transaction list
│   │   ├── DriverProfile.tsx # Driver profile, assigned bus specs, shift statistics, force-sync CTA
│   │   └── steps/
│   │       ├── Step1Bus.tsx      # Simulated QR scan + manual search + bus confirmation
│   │       ├── Step2Fill.tsx     # Fill details form with live rate/capacity warnings
│   │       ├── Step3Evidence.tsx # Odometer & receipt photo upload
│   │       ├── Step4Review.tsx   # GPS location status + full review + confirm checkbox
│   │       └── Step5Done.tsx     # Success/needs-review result with plain-language flag reasons
│   └── office/
│       ├── Dashboard.tsx          # Transport Manager Dashboard: 7 KPIs + 8 prompt sections
│       ├── BusEfficiencyPage.tsx  # Dedicated Fleet Efficiency Hub (km/L ranking & comparisons)
│       ├── AccountantDashboard.tsx# Dedicated Financial Reconciliation Hub & variance KPIs
│       ├── PrincipalDashboard.tsx # Executive Governance Dashboard & decision log
│       ├── ReportsPage.tsx        # Universal Reports Hub with one-click CSV export
│       ├── EntriesPage.tsx        # Searchable, filterable fuel entries table
│       ├── EntryDetailPage.tsx    # Full transaction detail + correction flow + timeline
│       ├── FlaggedPage.tsx        # Flagged fills list with KPI summary + filters
│       ├── FlagDetailPage.tsx     # Investigation detail: evidence cards, awaiting evidence action
│       ├── ReconciliationPage.tsx # Statement upload + match category filter tabs + search + decisions
│       ├── ApprovalsPage.tsx      # Principal approval inbox: maker-checker lock + mandatory comments
│       ├── BusesPage.tsx          # Bus roster with efficiency metrics
│       ├── BusDetailPage.tsx      # Bus detail + printable QR + manual lookup + fills
│       └── AuditPage.tsx          # Comprehensive searchable audit log
│
├── services/
│   ├── api.ts    # Mock service layer: all mutations + audit events (pure in-memory)
│   ├── rest.ts   # REST adapter for Person 2's backend (JWT, FormData, fetchBootstrap)
│   └── store.ts  # Zustand-style external store (useSyncExternalStore)
│
├── data/
│   ├── raw.ts    # CSV parsers → typed arrays (buses, entries, statement, prices, …)
│   ├── seed.ts   # Seeded flags, notes, approvals, audit events (9 investigation cases)
│   └── *.csv     # Source data files (verbatim from intern_pack: 112 entries, 82 statement lines)
│
└── utils/
    ├── format.ts # inr, num, fmtDate, fmtDateTime, dateKey, monthKey, relDays
    └── rules.ts  # Detection engine: runEntryChecks, reconcile, publishedPrice
```

---

## 6. Screens & Routes

| Route | Screen | Permitted Roles | Description |
|---|---|---|---|
| `/login` | Sign-in Screen | All | 1-click role selection + credentials form |
| `/driver` | Driver Home | `driver` | Assigned bus card, offline mode toggle, recent entries |
| `/driver/entry` | 5-step Entry Wizard | `driver`, `transport_manager` | Scan QR / search bus → details → photos → GPS review → save |
| `/driver/entries` | Driver Entries | `driver`, `transport_manager` | Mobile transaction history with status chips |
| `/driver/entries/:id` | Driver Entry Detail | `driver`, `transport_manager` | Mobile view of single fill with evidence and flag reason |
| `/driver/profile` | Driver Profile | `driver`, `transport_manager` | Driver details, assigned bus specs, sync controls, EN/Kannada |
| `/app` | Office Landing Hub | `transport_manager`, `accountant`, `principal` | **Role-tailored:** `Dashboard` (Manager), `AccountantDashboard` (Accountant), `PrincipalDashboard` (Principal) |
| `/app/efficiency` | Bus Efficiency Hub | `transport_manager` | Fleet efficiency comparison, top/bottom performers, km/L charts |
| `/app/entries` | Fleet Entries | All office roles | Filterable table by date, bus, pump, payment mode |
| `/app/entries/:id` | Entry Detail | All office roles | Transaction breakdown, before/after corrections, audit trail |
| `/app/flagged` | Flagged Fills | All office roles | Filterable table by severity, rule, status |
| `/app/flagged/:id` | Flag Detail | All office roles | Investigation workbench: evidence comparisons, "Awaiting evidence" action |
| `/app/reconciliation` | Statement Reconciliation | `accountant`, `transport_manager` | CSV import, match category tabs, discrepancy search, reviewer notes |
| `/app/approvals` | Principal Approvals | `principal` | Maker-checker lock, mandatory comments on decisions, decision history |
| `/app/buses` | Bus Roster | `transport_manager` | Fleet listing with capacity, total km, total litres, avg km/L |
| `/app/buses/:code` | Bus Detail | `transport_manager` | Specs, printable QR sticker, recent fills |
| `/app/reports` | Reports Hub | All office roles | Universal report generator with live preview and CSV export |
| `/app/audit` | Audit Trail | All office roles | Immutable log of all system mutations and user actions |

---

## 7. Design System & Visual Direction

FuelGuard follows an enterprise SaaS design system with professional restraint, high readability, and strict accessibility standards:

- **Primary Colors:**
  - Deep Navy (`navy-900` / `#0F172A`): Top header, sidebars, primary typography.
  - Royal Blue (`primary-600` / `#2563EB`): Primary buttons, active tabs, interactive highlights.
  - Surface Slate (`slate-50` / `#F8FAFC` to `slate-100`): Dashboard canvases.
  - Border Slate (`slate-200` / `#E2E8F0`): Clean container boundaries.
- **Semantic Status Tones:**
  - Teal/Green (`teal-700` / `bg-teal-50`): Matched, saved, approved, resolved.
  - Amber (`amber-700` / `bg-amber-50`): Needs review, under review, warnings.
  - Red (`red-700` / `bg-red-50`): High severity flags, discrepancies, rejected.
  - Violet (`violet-700` / `bg-violet-50`): Awaiting evidence.
- **Typography & Numerics:**
  - Inter for high-density UI labels.
  - Noto Sans Kannada for driver interface local language support.
  - `tnum` (tabular numeric figures) applied to all financial amounts, litres, and odometer readings to prevent layout jitter.

---

## 8. Business Rules Enforced in the Frontend

1. **Non-blocking Fills:** A flagged transaction is **always saved** — detection flags never block submission or leave a driver stranded.
2. **Neutral Anomaly Vocabulary:** A detection flag indicates an anomaly, not confirmed fraud. UI strictly avoids terms like "fraud confirmed" or "theft proven", instead using "Needs review", "Rate mismatch", "Unusual transaction", "Discrepancy detected".
3. **Mandatory Decision Comments:** Principal decisions require a **mandatory comment** before submission (enforced with real-time UI validation on both approvals and rejections).
4. **Maker-Checker Rule:** A user **cannot approve their own submission** (`submitterId === user.id` disables decision buttons and renders a warning chip).
5. **Immutable Audit Trail:** Corrections **preserve original values** and are displayed as `before → after` diffs in transaction details and audit logs.
6. **Graceful Degradation:** GPS unavailability is clearly indicated and logged as `locationNote: 'denied' | 'unavailable'` — never preventing entry save or implying fraud.
7. **Transparent Offline Mode:** If connectivity is toggled offline, entries are saved to local state with a `pending_sync` status and amber badge. Drivers are provided an explicit "Sync Now" button when connection is restored.
8. **Financial Integrity:** Financial variances between register entries and pump statements are displayed down to the exact rupee and litre — never rounded or silently adjusted.

---

## 9. Verification & Smoke Testing

FuelGuard includes automated smoke checks validating the complete detection engine and reconciliation pipeline:

```bash
npm run build
# Output:
# ✓ 2205 modules transformed.
# dist/assets/index-Bq814Gxy.css   30.29 kB
# dist/assets/index-3CK2CRJf.js   274.09 kB
# dist/assets/charts-CsF5O5IT.js  396.78 kB
# ✓ built in 12.71s (Zero TypeScript errors)

npm run smoke
# Output:
# ok  : 112 register entries
# ok  : 82 statement lines
# ok  : Nov price falls back to last published 89.31
# ok  : F0041 rate mismatch flagged high
# ok  : F0078 tank capacity flagged
# ok  : F0112 duplicate flagged
# ok  : F0109 short interval flagged
# ok  : F0111 holiday flagged medium
# ok  : 71185 amount mismatch
# ok  : 72152 unmatched (unknown vehicle)
# categories: {"matched":75,"rate_mismatch":3,"unmatched_pump_bill":1,"amount_mismatch":1,"register_missing":1,"possible_duplicate":1}
# All engine checks passed.
```

---

## 10. Demo Walkthrough

1. **Driver Experience:**
   - Log in as **Driver** (`/login`).
   - Notice the mobile bottom bar with **Home**, **New Fill**, **Scan QR**, **History**, and **Profile**.
   - Tap **Scan QR** in the bottom bar to open the camera modal, select a bus code (`VB-07`), and jump straight into fuel entry.
   - Enter fill details (litres, amount, odometer). Live warnings indicate if rate deviates from daily benchmark or exceeds tank capacity.
   - Attach mock odometer photo and review GPS location status.
   - Submit fill → view confirmation with entry reference and clear status explanation.
   - Switch to **Profile** to view driver credentials, assigned bus specs, and force-sync pending entries.
   - Tap **ಕನ್ನಡ** to switch interface to Kannada.

2. **Transport Manager Experience:**
   - Switch role to **Transport Manager** (`/app`).
   - View the 7 KPI cards and 8 dashboard sections including **Monthly Fuel Spend**, **Fuel Consumption Trend (Litres)**, **Efficiency Comparison**, and **Flagged Transactions**.
   - Navigate to **Bus Efficiency** (`/app/efficiency`) to inspect fleet performance, top/bottom performers, and sortable km/L metrics.
   - Navigate to **Flagged Fills** (`/app/flagged`) and open case `F0041`. Click **Request Evidence** to move status to `Awaiting evidence` with mandatory rationale.

3. **Accountant Experience:**
   - Switch role to **Accountant** (`/app`).
   - Automatically lands on **Accountant Dashboard** with variance KPIs (Statement Total ₹5,96,076 vs Credit Register ₹5,94,826), match categories, and top discrepancy table.
   - Click **View All Mismatches** to jump into **Statement Reconciliation** (`/app/reconciliation`).
   - Filter by tabs (`Mismatches Only`, `Rate Mismatch`, `Amount Mismatch`) and use real-time search.
   - Click **Review** on a mismatched bill, enter resolution notes, and save decision.

4. **Principal Experience:**
   - Switch role to **Principal** (`/app`).
   - Automatically lands on **Principal Dashboard** with pending approvals preview, high-severity flags list, and recent governance decisions.
   - Open **Approval Inbox** (`/app/approvals`).
   - Select an approval request. Notice the Maker-Checker rule: if the current user submitted the request, action buttons are locked.
   - Provide mandatory comments and confirm decision → view updated status in **Decision History** tab.

5. **Universal Reports Hub:**
   - Navigate to **Reports** (`/app/reports`).
   - Toggle between **Fleet Consumption**, **Statement Reconciliation**, and **Discrepancy Audit**.
   - Select date range and click **Download CSV** for one-click spreadsheet export.

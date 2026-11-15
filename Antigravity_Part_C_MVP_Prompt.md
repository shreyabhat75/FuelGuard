# ANTIGRAVITY BUILD PROMPT — PART C MVP
## ArtIntele Fuel Leakage Project | Vidyanagara PU College

You are a senior product designer and full-stack frontend engineer. Build a polished, clickable MVP for the **Part C app design** of the ArtIntele internship project. The product is a mobile-first fuel-entry and desktop fleet-monitoring application for a fictional college with 8 diesel buses.

The goal is to replace a paper fuel register and make suspicious activity visible through independent evidence. This is an MVP/prototype: it must be usable and convincingly interactive, but must not claim that a suspicious transaction is proven fraud.

---

## 1. Start by inspecting the existing project

1. Inspect the current repository, package manager, framework, and existing components before changing anything.
2. Reuse the existing stack and conventions if a project already exists. Do not overwrite unrelated files.
3. If the repository is empty, use:
   - React + TypeScript + Vite
   - Tailwind CSS
   - React Router
   - Lucide icons
   - Recharts for charts
   - A small service/data layer with typed mock data
4. Keep components modular and accessible. Avoid a single giant component.
5. Make the application responsive: phone-first for the pump-entry experience; desktop-first for the office dashboard.

## 2. Product name and visual direction

Product name: **FleetFuel Guard**  
Subtitle: Fuel accountability for Vidyanagara PU College.

Design style:
- Professional, trustworthy fleet-management SaaS.
- Clean light interface with deep navy text, white surfaces, subtle grey borders, restrained blue primary actions, teal success, amber warning and red critical states.
- Do not use excessive gradients, glassmorphism, neon colours or decorative animations.
- Large touch targets (minimum about 44px), clear typography, strong contrast and readable labels for outdoor sunlight.
- Use concise plain English. Avoid technical fraud jargon in driver-facing screens.
- Provide an English/Kannada language toggle in the UI if practical; English must work completely.
- Use clear status chips: Saved, Needs review, Matched, Unmatched, Pending approval, Approved, Rejected.
- Every suspicious item must say **“Needs review”** or **“Discrepancy detected”**, never “Fraud confirmed”.

## 3. Users and role-based navigation

Create a demo sign-in screen with role selection or prefilled demo accounts for:
1. Driver / Fuel-entry user
2. Transport Manager
3. Accountant
4. Principal / Approver

Implement a frontend role guard so each role sees the correct navigation and actions. This is a prototype guard only; explain in the README that production permissions must also be enforced by the backend.

Role capabilities:
- Driver: create fuel entry, see own entries and their statuses. Cannot approve, delete or edit a submitted record.
- Transport Manager: see all buses and entries, investigate flags, request evidence, propose a correction, manage bus records.
- Accountant: upload/view monthly pump statement, reconcile bills, review cash claims, see finance summaries.
- Principal: see overall summary, serious cases and approval queue; approve, reject or request more information. Cannot alter original transaction values.

Do not allow a user to approve their own submitted entry.

## 4. Main navigation / required screens

### A. Login
- Product logo/name, short description, username/password fields (mock authentication is acceptable), demo role selector.
- Show the active demo role after login.
- Provide an obvious logout/switch-role action for evaluation.

### B. Driver mobile home
- Greeting and assigned bus (e.g. VB-07 / KA 99 VB 1007).
- Large primary button: “Record a fuel fill”.
- Recent entries with date, litres, amount and status.
- Clear offline/online indicator.
- Bottom navigation or simple mobile navigation.

### C. Pump entry flow — complete stepper
Create a clear 5-step flow with progress indicator and Back/Continue controls. It must be usable on a phone.

**Step 1: Identify bus**
- Primary action “Scan bus QR”.
- For the MVP, provide a camera/QR simulation that can select a seeded bus; if real camera scanning is supported, include manual fallback.
- Manual search by bus code or registration.
- After selection show bus code, registration, assigned driver, tank capacity and fuel type.
- Require the user to confirm the selected bus before continuing.
- Include error state: QR invalid / unreadable, with manual search fallback.

**Step 2: Fill details**
Fields:
- Litres filled (numeric, required)
- Amount paid in ₹ (numeric, required)
- Fuel type (diesel / petrol / CNG; preselect diesel)
- Odometer reading in km (numeric, required)
- Person who paid (driver / transport manager / other)
- Payment method (credit account / cash)
- Pump (Shree Lakshmi Fuels / Highway Fuel Point / other)
- Optional pump bill or receipt number
Validation:
- positive litres and amount
- odometer cannot be negative
- show warning if litres exceed bus tank capacity, but do not block saving
- show amount-per-litre calculation and compare to the seeded daily diesel price
- do not silently modify values

**Step 3: Evidence**
- Upload/take odometer photo (required for the intended production workflow; in prototype allow a demo image placeholder if camera is unavailable).
- Upload receipt photo (optional but strongly recommended).
- Show image preview, remove/replace controls and upload status.
- Provide a retry state if upload fails.
- Clearly state when a photo is not attached.

**Step 4: Location and review**
- Show device location permission state: available / denied / unavailable.
- If location is unavailable, allow saving and visibly mark “Location unavailable”; never fabricate coordinates.
- Show transaction summary: bus, litres, amount, rate/L, odometer, payment mode, pump, photos, user and client timestamp.
- Show a warning if the transaction is on a college holiday or if a duplicate-like entry is detected.
- Explain that server timestamp is assigned when the backend receives the entry. For mock mode show “Demo server time”.
- Add a clear confirmation checkbox before submission.

**Step 5: Saved result**
- Show success state: “Fuel entry saved”.
- If checks trigger, show “Saved — needs review” with plain-language reasons.
- Never block or delete a saved entry because a rule triggered.
- Provide “View entry” and “Record another fill”.

### D. Office dashboard (Transport Manager / Accountant / Principal)
Desktop layout with sidebar, top bar, date range filter and bus filter.
Show KPI cards:
- Register spend: ₹12,55,535.02 (historical synthetic dataset total)
- Fuel entries: 112
- Registered buses: 8
- Items requiring review: calculated from seeded demo cases, clearly labelled
- Monthly spend chart (Aug, Sep, Oct 2026)
- Fuel efficiency trend chart by bus (use mock/derived sample data and label it appropriately)
- Recent entries table with bus, timestamp, litres, amount, payment mode, pump and status
- Filters for status, bus, pump and payment method
- Clicking a row opens the transaction detail.

### E. Flagged fills list
- Summary counts by severity/status.
- List/table of flagged entries with bus, date/time, rule reason, evidence summary, estimated amount at issue and review status.
- Search and filters.
- Never equate “amount at issue” with “confirmed loss”.

### F. Flagged fill detail / investigation page
This is a key Part C screen.
Display:
- Entry ID, bus and registration
- Entered transaction values
- Rule(s) triggered and threshold used
- Plain-language explanation
- Evidence comparison cards: fuel register vs pump statement; published diesel price vs charged rate; odometer vs GPS; tank capacity vs litres
- GPS/location evidence with a map-like placeholder or coordinate card (do not invent a real route)
- Receipt and odometer image previews/placeholders
- Confidence label for the discrepancy, not guilt
- Investigation notes/comments and timeline
- Actions for manager: Mark under review, Request more evidence, Propose correction, Resolve as data-entry error, Escalate to accountant/principal
- Require a reason when resolving or changing status
- Preserve original values; corrections must be represented as a separate event in the UI.

### G. Pump statement reconciliation (Accountant)
- Upload CSV statement area with drag/drop and browse control.
- In prototype, provide a “Load demo statement” button.
- Reconciliation table with Matched / Amount mismatch / Rate mismatch / Unmatched pump bill / Register entry missing / Possible duplicate.
- Show both sides of the comparison and exact difference.
- Allow a human reviewer to mark “Resolved”, “Needs supplier clarification” or “Authorised exception”, with mandatory note.
- Preserve the uploaded source file and reconciliation history in the mock state.
- Provide CSV export button if practical.

### H. Principal approval inbox
- Pending claims/serious exceptions with amount, bus, submitter, evidence completeness and review notes.
- Detail view showing source evidence and prior review.
- Actions: Approve, Reject, Request more information.
- Mandatory reason/comment for rejection or request.
- Prevent approval if the current user is the submitter.
- Show a confirmation dialog before final approval/rejection.

### I. Buses and QR management (Transport Manager)
- Bus list with code, registration, assigned driver, fuel type and tank capacity.
- Bus detail view.
- Generate a printable QR code containing only a stable bus ID (do not encode personal data).
- For MVP, use a QR generation library or a clear printable QR placeholder.
- Allow manual QR lookup fallback.

### J. Audit log / correction history
- Timeline of who created, viewed/changed/reviewed a record and when.
- Correction event must show original value, corrected value, reason, user and timestamp.
- No hard-delete action for fuel entries or evidence.

## 5. Seeded demo data and scenarios

Use clearly fictional data from the provided ArtIntele synthetic dataset. Do not invent a claim of confirmed fraud. Use these seeded cases:

1. **VB-03 price-rate discrepancy**
   - Entries: F0041, F0048, F0056
   - Pump bills: SLF/71007, SLF/71111, SLF/71251
   - Total 404.0 L
   - Pump rates: ₹93.27 / ₹93.27 / ₹93.48 per L
   - Published daily prices: ₹89.27 / ₹89.27 / ₹89.48 per L
   - Difference: ₹4/L on each, total ₹1,616.00
   - Status: Needs review; possible pump pricing issue, not proven fraud.

2. **VB-02 amount mismatch**
   - F0052 / SLF/71185
   - 100.6 L
   - Register amount ₹10,251.69
   - Pump statement amount ₹9,001.69
   - Difference ₹1,250.00
   - Status: Needs review; original receipt/payment ledger required.

3. **Unknown registration on pump statement**
   - SLF/72152
   - 06-09-2026, vehicle KA 99 MX 4417
   - 42.0 L, ₹3,749.34
   - Not in the 8-bus roster and no register match.
   - Status: Unmatched pump bill; authorisation unknown.

4. **VB-03 statement-only line**
   - SLF/72169
   - 18-10-2026
   - 48.0 L, ₹4,286.88
   - No matching register entry.
   - Status: Needs review; do not assert theft.

5. **VB-06 tank-capacity conflict**
   - F0078 / SLF/71589
   - Registered tank 160 L; recorded fill 195.2 L
   - Status: Capacity conflict; verify tank specification/record before concluding.

6. **VB-04 duplicate register line**
   - F0093 and F0112
   - Same date, 113.8 L, ₹10,163.48, odometer 72,634; 47 minutes apart
   - One matching pump bill SLF/71822
   - Status: Likely duplicate register entry / honest error; no second pump bill evidenced.

7. **VB-08 holiday cash entry**
   - F0111, 02-10-2026, 60 L, ₹5,368.80, no receipt
   - Holiday: Gandhi Jayanti
   - Odometer interval: +97 km; GPS path interval approximately 172.7 km
   - Status: Needs review; special trip/device/odometer explanation possible.

8. **VB-02 short-interval refill**
   - F0083 then F0109 on 12-10-2026
   - 114.3 L at 09:51; 34.0 L at 17:56
   - Odometer rises only 41 km
   - Status: Unusual refill pattern; verify tank state and purpose.

Historical totals to display:
- 112 register entries
- Register amount total ₹12,55,535.02
- Credit account 81 entries / ₹8,82,722.82
- Cash 31 entries / ₹3,72,812.20
- 8 buses
- 82 pump statement lines / ₹8,79,345.56

## 6. Error, offline and correction states

Design and implement visible states for:
- QR cannot scan → manual search.
- QR resolves to wrong bus → change bus before submission and record the change in local activity.
- GPS denied/unavailable → allow save, mark location unavailable.
- Offline → save a local pending draft; show “Pending sync”; when online, sync without duplicating the entry. If full offline persistence is too much for MVP, simulate it with an explicit offline toggle and local mock state.
- Receipt upload fails → retry, continue without optional receipt with warning.
- Required odometer photo missing → show a clear validation message or a documented exception path.
- Duplicate-like transaction → warn and ask for confirmation; do not silently block.
- User makes a mistake after save → correction request with reason; never overwrite the original.
- Flagged entry → still save it.

## 7. Data model / frontend types

Create typed models for:
- User (id, name, role)
- Bus (id, busCode, registration, tankLitres, fuelType, driverName, gpsDevice)
- FuelEntry (id, busId, timestampClient, timestampServer, litres, amount, fuelType, odometerKm, paidBy, paymentMode, pumpName, receiptPhoto, odometerPhoto, location, createdBy, status)
- Flag (id, entryId, ruleCode, severity, reason, evidenceSummary, amountAtIssue, status, createdAt)
- PumpStatementLine (id, billNo, date, vehicleNo, litres, rate, amount)
- ReconciliationResult (statementLineId, entryId, matchStatus, difference, reviewerNote)
- Approval (id, entryId, approverId, decision, reason, timestamp)
- AuditEvent (id, entityType, entityId, action, before, after, reason, actorId, timestamp)

Use a service layer so mock data can later be replaced by API calls without rewriting all UI components.

## 8. Interaction and quality requirements

- All navigation must work.
- All major buttons must perform an action.
- Form validation must be functional.
- A demo fuel entry must be creatable from start to saved state.
- Trigger at least three demo rules: tank capacity, rate mismatch, duplicate/short interval.
- The office user must be able to open a flag, add a note and change its review status.
- Accountant must be able to load the demo statement and view reconciliation results.
- Principal must be able to approve/reject/request information with a reason.
- Use realistic empty, loading, error and success states.
- Use responsive tables that become cards on small screens.
- Add accessible labels, keyboard focus states and semantic HTML.
- Do not show placeholder lorem ipsum.
- Do not use fabricated live GPS, fake server timestamps or fake successful uploads. Label simulated/demo values clearly.

## 9. Deliverables from Antigravity

1. Working frontend MVP in the current repository.
2. A short `README.md` with install/run instructions, demo roles and known limitations.
3. A screen/flow inventory mapping the implementation to Part C requirements.
4. A short list of mock data and rule assumptions.
5. A list of backend APIs/data still needed for Part D.
6. A 2–3 minute local walkthrough checklist.

Before finishing, run the app, fix build/runtime errors, and verify the following end-to-end:
- Log in as driver → record a fill → save → see normal/flagged result.
- Log in as transport manager → open flagged fill → add note → mark under review.
- Log in as accountant → load statement → inspect unmatched/mismatched lines.
- Log in as principal → review pending case → request information or approve/reject.
- Switch to mobile viewport → complete pump entry without horizontal scrolling.

Do not stop after generating static mockup screens. Build a coherent, clickable MVP with realistic states and clean component structure.
# 2–3 minute local walkthrough checklist

Run `npm run dev` → open http://localhost:5173. Full run ≈ 3 minutes.

## 1. Driver — record a fill (≈ 60 s)
1. Sign in → role **Driver — fuel entry** → any password → Sign in.
2. Note the offline toggle at the top (leave ON/online). Press **Record a fuel fill**.
3. Step 1: press **Scan bus QR** → wait for "detected" → pick **VB-07** → **Confirm this bus** → Continue.
4. Step 2: Litres `35`, Amount `3125`, Odometer `50317` (any plausible numbers) → Continue.
   (Tip: litres `205` shows the tank-capacity warning without blocking.)
5. Step 3: press **Use demo image** for the odometer photo → Continue.
6. Step 4: wait for the location card (allow the browser prompt if you want real coordinates) →
   tick the confirmation checkbox → **Save entry**.
7. Step 5 shows **Fuel entry saved** (or **Saved — needs review** if a rule hit — e.g. the ₹/L
   check when litres×rate ≠ published price). Open **View entry** to see the detail + timeline.
8. Offline test: toggle **Offline mode (demo)** on the driver home → record another fill → it
   saves as **Pending sync** → toggle back online → it syncs automatically without duplicates.

## 2. Transport manager — investigate (≈ 45 s)
1. Bottom bar **Switch role** → log out → sign in as **Transport Manager**.
2. Sidebar → **Flagged fills** → open **VB-02 — register amount differs from pump bill**.
3. Read the evidence cards (register vs statement, published price), then add a note
   ("checking ledger with accountant") → **Mark under review** with a reason.
4. On **VB-02 — register amount differs…** press **Propose correction** from the linked entry
   (Entries → F0052) → propose amount `9001.69` with a reason → the original stays, a separate
   correction event appears.
5. Open **VB-06 — recorded litres exceed tank capacity** → **Escalate to principal** with a reason.
6. **Pump statement** (also accountant's screen) → **Load demo statement** → inspect the
   Amount mismatch / Rate mismatch / Unmatched pump bill rows; open one and save a reviewer
   decision with a note; try **Export CSV**.

## 3. Accountant (≈ 20 s)
1. Switch role → **Accountant** → **Pump statement** → Load demo statement → same table from the
   finance side. Dashboard shows the credit/cash split and monthly spend.

## 4. Principal (≈ 30 s)
1. Switch role → **Principal / Approver** → **Approval inbox**.
2. Open the pending **VB-02 amount mismatch** → **Request info** with a reason (mandatory).
3. Open **Pump bill SLF/72152 — vehicle not in fleet** → **Approve** → reason → confirm in the
   dialog → the case resolves and the decision history updates.
4. Dashboard → **Audit log** shows every action from this walkthrough with before/after values.

## 5. Mobile viewport check
- DevTools → device toolbar → iPhone-ish viewport → repeat steps 1.2–1.6 — the wizard fits
  without horizontal scrolling; tables render as stacked cards in the office app.

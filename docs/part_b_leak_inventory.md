# Part B — leak inventory

Person 1's part of the threat model. This is the list of ways the fuel money can leave, who can do it, and what would show it. The permission table and the server checks sit with Person 2. The screens sit with Person 3. A check here raises a flag. It does not refuse to save the fill, and it does not call a person guilty.

## Ways the money leaks

**1. Litres on the credit bill that the bus did not burn.**
Who: whoever prepares the pump bill. The driver does not have to type it. On `F0078` the transport office typed the register from that bill, so the register agreeing with the statement is not a second witness.
How: the bill states more litres than the tank can hold, or more than the kilometres since the last fill support.
Evidence: tank size, odometer delta, GPS distance when the tracker was on, this bus's own earlier km/L.
What closes it: `R02` and `R09` on every new fill. Pay the statement only after the litres have been compared with the tank and the distance. Do not let the person who entered the fill approve it.

**2. A bill for a vehicle the college does not own.**
Who: pump staff, or anyone who can put a private vehicle on the college account.
How: `SLF/72152`, registration `KA 99 MX 4417`, no register line.
Evidence: registration not in `buses.csv`.
What closes it: at import, a statement row whose registration is not a college bus is a flag (`unknown_vehicle`), not a silent line in the payable.

**3. A bill for a college bus on a day the bus did not go to the pump.**
Who: the same people as (2), using a real registration.
How: `SLF/72169`, Sunday, `VB-03` parked at the depot, no register line.
Evidence: statement row with no register match, plus the day's GPS.
What closes it: reconciliation (`statement_without_register`) together with the day's track. No pings means "tracker off", which is not enough. Pings that never leave the depot are enough to hold the line.

**4. A rate above the published price, on some bills only.**
Who: the pump, or someone splitting the difference. Not shown to be the driver. The trips on the three `VB-03` premium bills look ordinary.
How: rate = published + Rs 4.00/L on three September bills, and the published price on the other fills.
Evidence: `diesel_price.csv` for that date, the rate on the statement, the other bills the same week.
What closes it: `R03` against the published price of the day. A standing contracted premium would show on every fill. Three fills in two weeks, then back to the published price, is the pattern to review. Until the contract is on file, the verdict stays "cannot be verified".

**5. A cash reimbursement with nothing behind it.**
Who: the person who pays cash and later claims it back. On this fleet that is the driver of `VB-07` or `VB-08`.
How: a register line, `payment_mode = cash`, no receipt. `F0111` adds a closed day and a tracker that shows the bus at the depot.
Evidence: receipt flag, calendar, Sunday, GPS if it exists.
What closes it: no cash is reimbursed without a receipt (`R07`). A closed day is its own flag (`R06`). A fresh GPS fix far from the named pump is `R08`. A missing fix is not. The three cash lines with no receipt that do match the price and the pump (`F0002`, `F0044`, `F0098`) show why the receipt rule is a hold, not an accusation.

**6. A second fill the same day.**
Who: whoever can raise a second credit bill. `F0109` is on the statement, so the college was billed.
How: 34 L, 8 hours later, 41 km, about 1.2 km/L against this bus's usual 4.5.
Evidence: the previous fill on that bus, the odometer, the statement.
What closes it: `R05`. The rupee figure is the litres above the bus baseline, not the whole bill.

**7. A slow extra on every fill, for weeks.**
Who: unknown. It can be the pump, the driver, or a fault in the bus. `VB-05` through October is the case in this pack.
How: the route on the map does not change, the odometer and the GPS agree, and the litres per kilometre drop and stay down.
Evidence: a run of stretches against the same bus's earlier median.
What closes it: flag the run and inspect the vehicle before anyone is accused. A single bad week (`F0062`) is not this pattern.

**8. The register is written twice, or the amount in the register is higher than the bill.**
Who: the person typing the register. `F0112` was written by the driver after the transport manager had already entered the same fill. `F0052` is the transport manager's line, Rs 1,250.00 above a bill that is itself correct.
How: a second identical line, or a round sum added to the amount.
Evidence: a second register row with the same odometer (`R04`, `R10`), or the amount against the statement.
What closes it: the payable is the statement, after duplicate lines are removed. The duplicate in this pack cost Rs 0 because the pump charged once. It still has to be caught, or the next one will be paid.

**9. The tracker is off, and the gap is used as cover.**
Who: anyone who gains when a trip cannot be checked. In this pack the long gap is `VB-04`, about 347 hours, and the fills inside it still match the statement.
How: the device is unplugged or it fails.
Evidence: gap length, not the fuel figures.
What closes it: an alert when a bus that should be running has no pings. Do not convert the silence into a fuel-loss number. `R11` compares GPS with the odometer only when the trace actually covers the interval.

**10. The person who types the fill is the person who gains if it is wrong.**
Who: on a cash fill, the driver. On a credit fill, the pump, with the office copying the bill into the register.
How: the section 2 sketch records what that person types.
What the sketch stops: a missing register line, a forgotten date, no named user.
What it does not stop: a wrong number, a second bill, a rate the pump chose, a cash claim with no receipt, a bus that never went to the pump.
What closes the gap: the checks above, all of which use evidence that person does not control (the statement, the published price, the tank, the odometer trend, the tracker). Photos of the odometer and the receipt help the reviewer. They do not replace those checks. The person who entered a fill cannot approve it.

## Evidence access

GPS tracks and photos are about a person as well as a bus.

- The driver can see their own bus and their own fills.
- The transport manager can see tracks and photos when they are reviewing a flag or a bus whose km/L has dropped.
- The accountant can see amounts, statement matches and the flag reason. They do not need the full track of an ordinary day.
- The principal sees a flagged fill when they are asked to approve a cash claim or an exception, not the whole fleet's movements.
- Keep a track and a photo for the financial year and the time the college is still allowed to question that bill, then delete them. Do not keep them because the disk is cheap.

Person 2 writes the table that enforces this on the server. Hiding a button is not the control.

# Vidyanagara PU College — fuel dataset (Aug–Oct 2026)

Everything here is **synthetic**: the college, the town, the buses, the drivers and every
number are invented for the ArtIntele intern project. Read the project brief (PDF) first.

The data is realistic, which means it is messy. Some of what looks wrong is fraud. Some is
an honest mistake, a broken device, or a real price change. Telling them apart is the job.

| File | What it is | Rows |
|---|---|---|
| `buses.csv` | The 8 buses: code, registration, tank size, driver, GPS device | 8 |
| `fuel_register.csv` | The transport office's fuel register: every fill, written in the paper logbook and typed into a spreadsheet each week | 112 |
| `gps_pings.csv` | Each bus's GPS tracker, a position every ~2 minutes while moving | ~54,500 |
| `pump_statement_shree_lakshmi.csv` | Monthly credit-account statement from Shree Lakshmi Fuels, the college's account pump | 82 |
| `diesel_price.csv` | Published retail diesel price per day in the town (₹/L) | 92 |
| `college_calendar.csv` | Holidays (buses also do not run on Sundays) | 7 |
| `places.csv` | Coordinates of the college depot and the two pumps | 3 |

## Columns

**fuel_register.csv** — the college has no fuel app yet; this is its paper register, typed up
- `entry_id` — line number given when the register was typed up
- `timestamp` — date and time written in the register (IST, `YYYY-MM-DD HH:MM`)
- `bus_code` — which bus
- `litres`, `amount_rs`, `fuel_type` — as written
- `odometer_km` — odometer reading as written
- `paid_by`, `payment_mode` — who paid and how (`credit_account` = billed to the college's account at Shree Lakshmi Fuels; `cash` = paid by the driver, reimbursed later)
- `pump_name`
- `written_by` — who wrote the line in the register
- `receipt_on_file` — `Y` if the pump receipt is in the office file

**gps_pings.csv** — `bus_code`, `timestamp` (`YYYY-MM-DD HH:MM:SS`, IST), `lat`, `lng`. A parked bus pings
only a few times a day. A tracker can go offline.

**pump_statement_shree_lakshmi.csv** — `date` (`DD-MM-YYYY`, as the pump prints it), `vehicle_no`
(registration as the pump writes it), `bill_no`, `litres`, `rate`, `amount`. Only fills paid
on the college's account appear here.

## Notes
- Times are IST. Distances: use the haversine formula on lat/lng.
- Buses run a morning and an evening route on working days and usually refuel at about 10:00.
- Do not assume every bus behaves the same: tanks, routes and engines differ.

# Data dictionary

Synthetic fleet for Vidyanagara PU College, Hosakere, August to October 2026. Seven files. Nothing is null. Entry ids and bill numbers are unique. The register is not stored in time order: `F0008` is filed above `F0005`, and `F0110` to `F0112` sit among the October rows rather than at the end.

## buses.csv — 8 rows

| Column | Meaning |
|---|---|
| bus_code | `VB-01` to `VB-08`. This is the key used by the register and the GPS file. |
| reg_no | Registration as the college writes it, `KA 99 VB 1001` and so on. |
| tank_litres | Stated tank. 160, 180 or 200. |
| fuel_type | `diesel` on every bus. |
| seats | 40, 51 or 60. Not used in the checks. |
| driver_name | Assigned driver. A finding does not treat this name as a suspect. |
| gps_device | Tracker id. Not used in the checks. |

`VB-01` to `VB-06` normally fill at Shree Lakshmi Fuels on the college credit account. `VB-07` and `VB-08` normally pay cash at Highway Fuel Point. `VB-07` has one credit fill as well (`F0110`).

## fuel_register.csv — 112 rows

The paper register, typed up. 81 lines are `credit_account` at Shree Lakshmi Fuels. 31 lines are `cash` at Highway Fuel Point. Every line is `diesel`.

| Column | Meaning |
|---|---|
| entry_id | `F0001` to `F0112`, unique, not chronological. |
| timestamp | IST, `YYYY-MM-DD HH:MM`. No seconds. |
| bus_code | Must exist in `buses.csv`. |
| litres | As written. |
| amount_rs | As written. |
| fuel_type | `diesel` throughout this file. |
| odometer_km | As written. |
| paid_by | `College account`, or the driver's name on cash fills. |
| payment_mode | `credit_account` or `cash`. |
| pump_name | `Shree Lakshmi Fuels` or `Highway Fuel Point`. |
| written_by | Mostly `Ravi (transport manager)`. Cash lines are written by the driver. `F0112` is the one credit line written by `Raghavendra`. |
| receipt_on_file | `Y` or `N`. Eight lines are `N`. |

Span: 4 Aug 2026 10:22 to 31 Oct 2026 09:57.

## pump_statement_shree_lakshmi.csv — 82 rows

Only the credit account. Cash fills are not here, and should not be expected here.

| Column | Meaning |
|---|---|
| date | `DD-MM-YYYY`, as the pump prints it. |
| vehicle_no | Registration. The college rows match `reg_no` once spaces are collapsed and the text is upper-cased. One row does not: `KA 99 MX 4417`. |
| bill_no | `SLF/` plus a number. Unique. |
| litres, rate, amount | `amount` equals `rate` times `litres` to the paisa on every row. |

## diesel_price.csv — 92 rows

`date` as `YYYY-MM-DD`, `diesel_rs_per_litre`. One published town price per day from 1 Aug to 31 Oct 2026. The price steps are 89.12, then 89.27 from 22 Aug, 89.48 from 16 Sep, and 89.31 from 9 Oct.

## college_calendar.csv — 7 rows

`date`, `holiday`. Independence Day, Ganesha Chaturthi, two mid-term days, Gandhi Jayanti, two Deepavali days. Sundays are not in this file. The brief says the buses also do not run on Sundays, so a Sunday is treated as a closed day in the checks even though it is absent here.

## places.csv — 3 rows

| Place | lat | lng |
|---|---|---|
| College depot | 13.95 | 76.2 |
| Shree Lakshmi Fuels | 13.9598 | 76.2095 |
| Highway Fuel Point | 14.021 | 76.318 |

The depot is about 1.5 km from Shree Lakshmi Fuels and about 15 km from Highway Fuel Point. A ping at the depot is not a ping at the pump.

## gps_pings.csv — 54,523 rows

`bus_code`, `timestamp` (`YYYY-MM-DD HH:MM:SS`, IST), `lat`, `lng`. All eight buses. Span 1 Aug 2026 06:30 to 31 Oct 2026 19:38. One timestamp is stored twice: `VB-02` at `2026-10-12 17:56:00`, with two coordinates about 11 km apart. A moving bus pings about every 2 minutes. A bus that is not running pings a few times in the day, from the depot. `VB-04` has a gap from 4 Sep 2026 19:07 to 19 Sep 2026 06:32, about 347 hours.

## How a fill is tied together

Credit line to statement: same calendar date, same registration, litres within 0.05. The amount is compared after that match, because one real row has the same litres and a different amount. Each statement line is used once, so a repeated register line stays unmatched.

Distance between GPS points uses the haversine formula and a mean Earth radius of 6371.0088 km. A jump of more than 0.5 km in under a second is not added into the path. That is the duplicate `VB-02` timestamp.

km per litre on a fill is the odometer change since the previous fill on that bus, divided by the litres on this fill. The first fill on each bus has no previous reading, so it has no km/L.

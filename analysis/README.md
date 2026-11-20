# Data investigation and detection rules

Person 1 owns this folder, `detection/`, `tests/` and `findings.csv`.
The backend, the database import and the screens belong to the other two people.
A flag from this code never stops a fill from being saved.

## Rerun the investigation

From the project root, with the seven CSVs in one folder:

```text
python -m analysis.investigate --data-dir path\to\csvs --out findings.csv
python -m unittest discover -s tests -v
```

If `--data-dir` is omitted, the script looks at `FUEL_DATA_DIR`, then `data/`, then `intern_pack/intern_pack/`.

`findings.csv` is written at the project root. The columns are the ones in the brief: `ids`, `bus`, `issue_type`, `evidence`, `verdict`, `confidence`, `rs_estimate`. Several ids in one cell are separated by a semicolon.

The rupee column is unexplained money on that row. Do not add the column up and call the total theft. Do not add two flag amounts on the same fill unless both flags set `additive_with_same_fill`.

## What the rules are for

`detection.evaluate_entry(entry, context)` returns a list of flags after the fill has already been stored. An empty list means nothing to review. Person 2 persists the list. Person 3 shows the plain-language `reason`. Neither side should turn a flag into the words "fraud confirmed".

```python
from detection import evaluate_entry
from detection.models import EntryContext

flags = evaluate_entry(entry, EntryContext(bus=bus, published_price_rs=89.48))
```

Leave a context field empty when that evidence does not exist. A missing GPS fix is not a flag. `R08_GPS_FAR_FROM_PUMP` fires only for a fix newer than 30 minutes that is more than 1 km from the named pump. If two fixes share a timestamp, the closer one is used, so a second impossible coordinate does not override a fix that is actually at the pump.

`detection.reconcile_credit_account` matches credit-account register lines to the Shree Lakshmi statement on date, registration and litres. Cash fills at Highway Fuel Point are not on that statement.

Rule codes and the thresholds live in `detection/thresholds.py`, with the reason for each number.

| Code | What it asks someone to check |
|---|---|
| R01_FUEL_TYPE | Fuel type does not match the bus. |
| R02_TANK_CAPACITY | Litres above the stated tank. |
| R03_AMOUNT_VS_PRICE | Amount against litres times the published price. |
| R04_DUPLICATE_ENTRY | Same bus, litres, amount and odometer within 24 hours. |
| R05_SHORT_INTERVAL | Second fill inside 18 hours at under 2.5 km/L. |
| R06_CLOSED_DAY | Holiday or Sunday. |
| R07_CASH_WITHOUT_RECEIPT | Cash claim with no receipt. Hold the reimbursement. Not proof the fuel was not bought. |
| R08_GPS_FAR_FROM_PUMP | Fresh fix more than 1 km from the named pump. |
| R09_EFFICIENCY | km/L under 75% of this bus's own baseline, or under 3.0 km/L when there is no baseline. |
| R10_ODOMETER_NOT_ADVANCING | Litres recorded but the odometer did not move. |
| R11_GPS_ODOMETER_GAP | Info only, and only when the tracker stayed on. A long gap returns nothing. |

The live rules are wider than `findings.csv`. A cash fill with no receipt is flagged for the office even when the price and the pump GPS later check out. The CSV is the investigated set for August to October 2026. The rules are what the app should keep running on a new fill.

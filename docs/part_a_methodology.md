# Part A — what the files support

August to October 2026, eight buses. The register has 112 fills. 81 are on the college credit account at Shree Lakshmi Fuels and 31 are cash at Highway Fuel Point. The credit statement has 82 lines. The published town diesel price is in `diesel_price.csv`. GPS is a separate distance measurement from the odometer. The figures below are the ones `analysis/investigate.py` writes into `findings.csv`. Rerun that script rather than copying a total out of a notebook.

## How the credit account was matched

A credit register line matches a statement line on the calendar date, the registration (upper case, single spaces) and the litres, within 0.05 L. Each bill is used once. The amount is checked after the match.

That pairs 80 of the 81 credit lines with 80 of the 82 bills.

- `F0112` is the register line with no bill. It repeats `F0093` (same litres, amount and odometer, 47 minutes later). The statement has one bill, `SLF/71822`.
- `SLF/72152` is a bill for `KA 99 MX 4417`, which is not a college bus, and it has no register line.
- `SLF/72169` is a bill for `VB-03` with no register line.

The credit register totals Rs 8,82,722.82. The statement totals Rs 8,79,345.56. The difference is Rs 3,377.26. That is exactly the Rs 1,250.00 register overstatement on `F0052`, plus the Rs 10,163.48 duplicate line, minus the Rs 3,749.34 unknown-vehicle bill and the Rs 4,286.88 bill with no register line. The two books balance. There is no fifth credit mismatch hiding in the totals.

## The provisional Rs 10,902.22

Four quantified credit-account mismatches add up to Rs 10,902.22. They are four rows in `findings.csv`, not one theft.

| Piece | Ids | What it is | In the rupee column |
|---|---|---|---|
| Price premium | `F0041`, `F0048`, `F0056` and bills `SLF/71007`, `SLF/71111`, `SLF/71251` | Three `VB-03` bills at exactly Rs 4.00/L over the published price. 131.9 + 130.8 + 141.3 litres. The register matches the inflated bills, so the extra is on the document the college pays. The other `VB-03` fills are at the published price. | Rs 1,616.00. Verdict: cannot be verified. There is no supply contract in the pack. |
| Unknown vehicle | `SLF/72152` | 42.0 L, Rs 3,749.34, registration `KA 99 MX 4417`, rate equal to the published price, no register line. | Rs 3,749.34. Cannot be verified. It may be a mis-keyed vehicle. |
| Book difference | `F0052`, `SLF/71185` | Same 100.6 L. Statement Rs 9,001.69, which is 100.6 times the published Rs 89.48. Register Rs 10,251.69, exactly Rs 1,250.00 higher. | Rs 0.00. Honest error as a cash loss. Credit fills are paid from the statement. The Rs 1,250.00 is a book difference, and it is still one of the four pieces of 10,902.22. |
| Bill with no register line | `SLF/72169` | 18 Oct 2026, a Sunday, `VB-03`, 48.0 L, Rs 4,286.88, rate equal to the published price. The tracker pinged three times, every ping at the depot. The closest approach to the pump is 1.50 km, which is the depot's own distance from Shree Lakshmi Fuels. | Rs 4,286.88. Cannot be verified, high confidence that the bus was not at the pump. A mis-keyed registration is still possible, so it is not marked fraud. |

1,616.00 + 3,749.34 + 1,250.00 + 4,286.88 = 10,902.22. The rupee column does not contain 10,902.22, and it does not contain the 1,250.00, because that 1,250.00 was not the amount on the payable.

## Rows that are not part of that provisional figure

**`F0078`, `VB-06`, marked Fraud, medium confidence, Rs 7,660.47.** The bill and the register both say 195.2 L. The tank is 160 L, so 35.2 L cannot fit. At the published price that overflow is Rs 3,149.70, and a mechanical fault cannot explain fuel that cannot enter the tank. The wider estimate is used because the distance is not in dispute: the odometer moved 502 km and the GPS trace for the same stretch is 502 km. The other fills on this bus sit at about 4.58 km/L, which would have used about 109.6 L. The gap versus that baseline is Rs 7,660.47. Both records come from the pump bill (the register line was typed by the transport office), so they are not two independent measurements. The row does not name the driver. Confidence stays at medium because the tank figure is the bus master we were given, and the part of the gap that does fit in a 160 L tank could still be a fault. The overflow alone cannot.

**`F0111`, `VB-08`, cannot be verified, Rs 5,368.80.** Cash, 60.0 L, Gandhi Jayanti, no receipt. The tracker reported three times that day and stayed 15.0 km from Highway Fuel Point. The pings exist, so this is not "missing GPS, therefore fraud". The full claim is the amount at risk because none of it is supported by a receipt or by a visit to that pump.

**`F0109`, `VB-02`, cannot be verified, Rs 2,230.82.** A second credit fill 8.1 hours after `F0083`. The odometer moved 41 km. 34.0 L on that distance is 1.21 km/L, against about 4.54 km/L on this bus's other fills. About 25 L are above that baseline. The estimate is those litres, not the whole Rs 3,036.54 bill, because a few litres do match 41 km. The tracker stored `2026-10-12 17:56:00` twice, about 11 km apart. The nearer fix is at Shree Lakshmi Fuels, so the location is not used against the fill.

**`VB-05`, six October fills, cannot be verified, Rs 22,253.64.** `F0076`, `F0082`, `F0089`, `F0097`, `F0102`, `F0108`. Before October this bus's other stretches have a median of 4.20 km/L. These six are between 2.79 and 3.04 km/L, on about 393 km each, and the GPS bounding box sits inside the earlier box, so it is not a new route on the map. The GPS distance also matches the odometer, so the bus did drive those kilometres and the litres are the thing that changed. A fault, a heavier load or more idling can do this. It is the largest unexplained figure in the file. It is not marked fraud, and it should not be read as a finding against the driver. The useful next step is to inspect the bus.

**`F0112` / `F0093`, honest error, Rs 0.00.** Repeated register line. The pump charged once.

## What was checked and left out

A missing receipt is not leakage by itself. `F0002`, `F0044` and `F0098` are cash claims with no receipt. Each amount matches the published price to the paisa, and a GPS fix at the time of the fill is at the claimed pump (0.00 km, 0.01 km and 0.00 km). They are not in `findings.csv`.

`VB-04` has a tracker gap of about 347 hours, 4 Sep 2026 19:07 to 19 Sep 2026 06:32. `F0049` falls in that window and has no receipt, but the litres and the amount match the statement and the odometer movement matches this bus's ordinary stretches. A silent tracker is not a fuel finding.

`F0062` on `VB-07` is one stretch, about 53 L and Rs 4,705.37 above that bus's other fills. The receipt is on file. One heavy stretch was not given its own row.

`VB-01` has several stretches where a continuous GPS trace is shorter than the odometer while the km/L stays near that bus's own baseline. That is a tracker limit, not extra fuel. The same treatment is applied to one `VB-08` stretch that was not already a finding.

`F0110` is `VB-07` filling on the credit account at Shree Lakshmi instead of paying cash at the highway pump. The 52 L matches the kilometres since the previous fill (about 4.25 km/L). It was not counted. The bill number `SLF/72135` sits outside the main bill sequence, along with `SLF/72126`, `SLF/72152` and `SLF/72169`. The bill number was not used as a finding on its own. `F0110` is the one of those four that the kilometres explain.

No register line falls on a Sunday. The only holiday fill in the register is `F0111`. Deepavali and the other listed holidays have no fill.

## Distance and the baseline

GPS distance is the haversine sum of consecutive pings between two fills. A zero-time jump of more than 0.5 km is dropped. km/L is odometer change divided by the litres on the later fill. The baseline for one fill is the median of the other stretches on that same bus. For a run of fills, the baseline is the median of the stretches outside the run. A run is reported only when four or more stretches in a row are each under 75% of that baseline and each at least 15 L over it. Medians use the ordinary statistical median (the average of the two middle values when the count is even).

The live rules use fixed thresholds, written in `detection/thresholds.py`: Rs 1 on an amount, Rs 0.50/L over the published price, 0.5 L over the tank, 1 km from the pump, 30 minutes for a fresh fix, 18 hours and 2.5 km/L for a same-day second fill. Those are review triggers. They are wider than this findings file on purpose.

## Which bus, which method

Do not add the rupee column into one loss.

The only row marked Fraud is `VB-06`, one credit bill, Rs 7,660.47, medium confidence. The method is litres on the pump bill that the tank cannot hold and that the bus's own GPS-confirmed distance does not support.

The largest unexplained figure is `VB-05`, Rs 22,253.64, a sustained drop in km/L on the same roads across October. That is an exposure, not a proved loss. The credit-account items that are actually on a bill and are not explained by a matching register line or by the published price are the `VB-03` premium (Rs 1,616.00), the unknown vehicle (Rs 3,749.34) and the Sunday `VB-03` bill (Rs 4,286.88).

## Limits

The pack does not say whether the college has a contracted price above the published town price. It does not say the statement was paid in full. It does not prove who received fuel that never went into a college tank. GPS can miss a short trip, which is why a silent tracker is not treated as fraud, and why `F0111` stays "cannot be verified" even though the pings that do exist are at the depot. A worse km/L can be mechanical. The first fill on each bus has no previous odometer, so it cannot be judged on km/L.

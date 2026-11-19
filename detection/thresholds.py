"""Thresholds used by the detection rules.

Each value is a review trigger, not a proof of fraud. The rationale is the
one that should be quoted in the report.
"""

# Pump meters and the published price are both in paise. A one-rupee gap
# is already far outside normal rounding (litres x price, rounded to paise,
# disagrees with the stated amount by at most a few paise).
AMOUNT_TOLERANCE_RS = 1.00

# Town diesel revisions in this dataset are about 0.15 to 0.21 Rs/L.
# Half a rupee above the same day's published price is not one of those revisions.
PRICE_PREMIUM_RS_PER_LITRE = 0.50

# Identical register lines written twice. F0112 is 47 minutes after F0093.
DUPLICATE_WINDOW_HOURS = 24.0
DUPLICATE_LITRES_TOLERANCE = 0.05
DUPLICATE_AMOUNT_TOLERANCE_RS = 0.05

# A normal gap between fills in this fleet is several days. A second fill
# the same working day, with almost no kilometres, is the unusual case.
SHORT_INTERVAL_HOURS = 18.0
SHORT_INTERVAL_MIN_KM = 0.5
SHORT_INTERVAL_KMPL_BELOW = 2.5

# Depot to Shree Lakshmi Fuels is about 1.5 km. Real pump pings in this
# dataset sit within a few dozen metres of the pump. 1 km separates
# "at the pump" from "still at the depot".
GPS_AT_PUMP_MAX_KM = 1.0
# Older than this, a fix is not used to claim the bus was away from the pump.
# A missing or stale fix is not evidence of fraud.
GPS_FRESH_SECONDS = 30 * 60

# Two coordinates at the same timestamp, farther apart than this, cannot
# both be the bus. The path total ignores that jump. The closest fix is
# the one used for the pump check.
GPS_TELEPORT_KM = 0.5

# Overnight parking in this fleet leaves gaps of about 14 to 16 hours.
# A gap beyond 18 hours, or a trace that covers under half the interval,
# means the tracker was off. Do not compare that distance with the odometer.
GPS_OUTAGE_GAP_HOURS = 18.0
GPS_MIN_COVERAGE_RATIO = 0.50
GPS_MIN_PINGS = 10
# With a continuous trace, flag only a large disagreement.
GPS_ODO_RATIO_LOW = 0.60
GPS_ODO_RATIO_HIGH = 1.50

# Single-fill floor when the caller has no bus baseline. The fleet's own
# medians sit around 3.9 to 4.6 km/L. Under 3.0 is outside that band.
KMPL_HARD_FLOOR = 3.0
KMPL_MIN_DISTANCE_KM = 30.0

# Pattern across weeks: four or more fills in a row, each below 75% of the
# bus's own earlier median, each at least 15 litres above that median.
PATTERN_MIN_RUN = 4
PATTERN_BASELINE_RATIO = 0.75
PATTERN_MIN_EXCESS_LITRES = 15.0

# Half a litre over the stated tank is past meter noise.
TANK_TOLERANCE_LITRES = 0.5

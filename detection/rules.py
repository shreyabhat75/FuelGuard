"""One function per check. Each returns a flag or None. None means no flag."""

from __future__ import annotations

from detection.haversine import haversine_km
from detection.models import EntryContext, Flag, FuelEntry
from detection.money import round_rs
from detection.thresholds import (
    AMOUNT_TOLERANCE_RS,
    DUPLICATE_AMOUNT_TOLERANCE_RS,
    DUPLICATE_LITRES_TOLERANCE,
    DUPLICATE_WINDOW_HOURS,
    GPS_AT_PUMP_MAX_KM,
    GPS_FRESH_SECONDS,
    GPS_MIN_COVERAGE_RATIO,
    GPS_MIN_PINGS,
    GPS_ODO_RATIO_HIGH,
    GPS_ODO_RATIO_LOW,
    GPS_OUTAGE_GAP_HOURS,
    GPS_TELEPORT_KM,
    KMPL_HARD_FLOOR,
    KMPL_MIN_DISTANCE_KM,
    PRICE_PREMIUM_RS_PER_LITRE,
    SHORT_INTERVAL_HOURS,
    SHORT_INTERVAL_KMPL_BELOW,
    SHORT_INTERVAL_MIN_KM,
    TANK_TOLERANCE_LITRES,
)


def _kmpl(entry: FuelEntry, ctx: EntryContext) -> float | None:
    if ctx.previous is None or entry.litres <= 0:
        return None
    delta = entry.odometer_km - ctx.previous.odometer_km
    if delta <= 0:
        return None
    return delta / entry.litres


def _hours_since_previous(entry: FuelEntry, ctx: EntryContext) -> float | None:
    if ctx.previous is None:
        return None
    return (entry.timestamp - ctx.previous.timestamp).total_seconds() / 3600


def rule_fuel_type(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R01. The bus master says what that vehicle burns."""
    if ctx.bus is None:
        return None
    if entry.fuel_type.strip().lower() == ctx.bus.fuel_type.strip().lower():
        return None
    return Flag(
        rule_code="R01_FUEL_TYPE",
        severity="review",
        reason=(
            f"{entry.bus_code} is a {ctx.bus.fuel_type} bus, and this fill "
            f"was entered as {entry.fuel_type}."
        ),
        evidence=f"bus.fuel_type={ctx.bus.fuel_type}; entry.fuel_type={entry.fuel_type}",
    )


def rule_tank_capacity(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R02. Litres above the stated tank cannot have gone into that tank."""
    if ctx.bus is None:
        return None
    overflow = entry.litres - ctx.bus.tank_litres
    if overflow <= TANK_TOLERANCE_LITRES:
        return None
    estimate = None
    if ctx.published_price_rs is not None:
        estimate = round_rs(overflow * ctx.published_price_rs)
    price_bit = ""
    if estimate is not None:
        price_bit = f" At the day's published price that is Rs {estimate:.2f}."
    return Flag(
        rule_code="R02_TANK_CAPACITY",
        severity="high",
        reason=(
            f"{entry.litres:.1f} litres were billed for {entry.bus_code}, "
            f"whose tank is {ctx.bus.tank_litres:.0f} litres. "
            f"{overflow:.1f} litres could not fit in the tank.{price_bit} "
            "This flags the fill for review. It does not say who is responsible."
        ),
        evidence=(
            f"litres={entry.litres:.1f}; tank={ctx.bus.tank_litres:.0f}; "
            f"overflow_litres={overflow:.1f}"
        ),
        rs_estimate=estimate,
        additive_with_same_fill=True,
    )


def rule_amount_vs_published_price(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R03. The entered amount against litres times the published town price."""
    if ctx.published_price_rs is None or entry.litres <= 0:
        return None
    expected = round_rs(entry.litres * ctx.published_price_rs)
    gap = round_rs(entry.amount_rs - expected)
    if abs(gap) <= AMOUNT_TOLERANCE_RS:
        return None
    return Flag(
        rule_code="R03_AMOUNT_VS_PRICE",
        severity="high",
        reason=(
            f"The amount is Rs {entry.amount_rs:.2f} for {entry.litres:.1f} litres. "
            f"Litres times the published price of Rs {ctx.published_price_rs:.2f} "
            f"is Rs {expected:.2f}, a difference of Rs {gap:.2f}. "
            "On a credit fill the pump statement, not the register, is what the college pays."
        ),
        evidence=(
            f"amount={entry.amount_rs:.2f}; expected={expected:.2f}; "
            f"gap={gap:.2f}; published={ctx.published_price_rs:.2f}"
        ),
        rs_estimate=abs(gap),
    )


def rule_duplicate_entry(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R04. Same bus, same litres, same amount, same odometer, inside one day."""
    for other in ctx.recent_entries:
        if other.entry_id == entry.entry_id or other.bus_code != entry.bus_code:
            continue
        hours = abs((entry.timestamp - other.timestamp).total_seconds()) / 3600
        if hours > DUPLICATE_WINDOW_HOURS:
            continue
        same_litres = abs(entry.litres - other.litres) <= DUPLICATE_LITRES_TOLERANCE
        same_amount = abs(entry.amount_rs - other.amount_rs) <= DUPLICATE_AMOUNT_TOLERANCE_RS
        same_odo = entry.odometer_km == other.odometer_km
        if same_litres and same_amount and same_odo:
            return Flag(
                rule_code="R04_DUPLICATE_ENTRY",
                severity="high",
                reason=(
                    f"This fill matches {other.entry_id} on {entry.bus_code}: "
                    f"the same litres, amount and odometer, {hours:.1f} hours apart. "
                    "A repeated register line is not a second purchase until the "
                    "pump statement shows a second bill."
                ),
                evidence=(
                    f"matches={other.entry_id}; hours_apart={hours:.2f}; "
                    f"litres={entry.litres:.1f}; amount={entry.amount_rs:.2f}; "
                    f"odometer={entry.odometer_km:.0f}"
                ),
                rs_estimate=None,
            )
    return None


def rule_short_interval(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R05. A second fill the same day whose litres do not match the kilometres."""
    hours = _hours_since_previous(entry, ctx)
    kmpl = _kmpl(entry, ctx)
    if hours is None or kmpl is None or ctx.previous is None:
        return None
    delta_km = entry.odometer_km - ctx.previous.odometer_km
    if hours > SHORT_INTERVAL_HOURS or delta_km < SHORT_INTERVAL_MIN_KM:
        return None
    if kmpl >= SHORT_INTERVAL_KMPL_BELOW:
        return None
    estimate = None
    if ctx.baseline_kmpl and ctx.baseline_kmpl > 0 and ctx.published_price_rs:
        expected_l = delta_km / ctx.baseline_kmpl
        excess_l = entry.litres - expected_l
        if excess_l > 0:
            estimate = round_rs(excess_l * ctx.published_price_rs)
    return Flag(
        rule_code="R05_SHORT_INTERVAL",
        severity="high",
        reason=(
            f"{entry.bus_code} was filled again after {hours:.1f} hours and "
            f"only {delta_km:.0f} km. {entry.litres:.1f} litres on that distance "
            f"is {kmpl:.2f} km per litre. A normal stretch for this fleet is "
            "several days and about 4 km per litre. "
            "The rupee figure, when present, is only the litres above this bus's "
            "own baseline, not the whole bill."
        ),
        evidence=(
            f"previous={ctx.previous.entry_id}; hours={hours:.2f}; "
            f"delta_km={delta_km:.0f}; km_per_litre={kmpl:.2f}"
        ),
        rs_estimate=estimate,
    )


def rule_closed_day(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R06. Holiday or Sunday. The calendar file has holidays; Sundays are extra."""
    if not ctx.is_holiday and not ctx.is_sunday:
        return None
    if ctx.is_holiday and ctx.holiday_name:
        when = ctx.holiday_name
    elif ctx.is_sunday:
        when = "a Sunday"
    else:
        when = "a holiday"
    return Flag(
        rule_code="R06_CLOSED_DAY",
        severity="review",
        reason=(
            f"This fill is dated {entry.timestamp:%d %b %Y}, which is {when}. "
            "These buses do not run a normal route on Sundays or listed holidays. "
            "A fill on a closed day needs a receipt and a movement trace before it is paid."
        ),
        evidence=f"date={entry.timestamp:%Y-%m-%d}; holiday={ctx.holiday_name or ''}; sunday={ctx.is_sunday}",
    )


def rule_cash_without_receipt(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R07. Cash is reimbursed from the register. No receipt means nothing to check it against."""
    del ctx
    if entry.payment_mode != "cash" or entry.receipt_on_file:
        return None
    return Flag(
        rule_code="R07_CASH_WITHOUT_RECEIPT",
        severity="review",
        reason=(
            f"Rs {entry.amount_rs:.2f} is a cash claim for {entry.bus_code} and "
            "the receipt is not on file. That is a reason to hold the reimbursement. "
            "It is not, by itself, evidence that the fuel was not bought."
        ),
        evidence=f"payment_mode=cash; receipt_on_file=N; amount={entry.amount_rs:.2f}",
        rs_estimate=round_rs(entry.amount_rs),
    )


def _closest_fresh_fix(entry: FuelEntry, ctx: EntryContext):
    if ctx.pump_lat is None or ctx.pump_lng is None or not ctx.gps_fixes:
        return None
    fresh = [fix for fix in ctx.gps_fixes if fix.age_seconds <= GPS_FRESH_SECONDS]
    if not fresh:
        return None
    ranked = []
    for fix in fresh:
        distance = haversine_km(fix.lat, fix.lng, ctx.pump_lat, ctx.pump_lng)
        ranked.append((distance, fix))
    ranked.sort(key=lambda item: item[0])
    return ranked


def rule_gps_far_from_pump(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R08. A fresh fix far from the named pump.

    No fix, or only a stale fix, returns None. Missing GPS is not a flag.
    If two fresh fixes disagree by a teleport, the closest one is used and
    the conflict is mentioned. One of them sitting on the pump means no flag.
    """
    ranked = _closest_fresh_fix(entry, ctx)
    if not ranked:
        return None
    closest_km, closest = ranked[0]
    farthest_km = ranked[-1][0]
    conflict = farthest_km - closest_km > GPS_TELEPORT_KM
    if closest_km <= GPS_AT_PUMP_MAX_KM:
        return None
    conflict_note = ""
    if conflict:
        conflict_note = (
            " Another fix at the same time is much farther away, so the tracker "
            "disagrees with itself. The nearer fix is the one used here."
        )
    return Flag(
        rule_code="R08_GPS_FAR_FROM_PUMP",
        severity="high",
        reason=(
            f"A GPS fix from {closest.timestamp:%H:%M} places {entry.bus_code} "
            f"{closest_km:.1f} km from {entry.pump_name}, outside the {GPS_AT_PUMP_MAX_KM:.0f} km "
            f"check. The fill names that pump.{conflict_note}"
        ),
        evidence=(
            f"closest_km={closest_km:.2f}; fix_age_seconds={closest.age_seconds:.0f}; "
            f"pump={entry.pump_name}"
        ),
    )


def rule_efficiency(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R09. Kilometres per litre against this bus's own baseline, or a hard floor.

    The rupee estimate is the fuel above the baseline, minus any tank-overflow
    amount already reported by R02, so the two flags can be added.
    """
    kmpl = _kmpl(entry, ctx)
    if kmpl is None or ctx.previous is None:
        return None
    delta_km = entry.odometer_km - ctx.previous.odometer_km
    if delta_km < KMPL_MIN_DISTANCE_KM:
        return None
    baseline = ctx.baseline_kmpl
    if baseline and baseline > 0 and kmpl < baseline * 0.75:
        expected_l = delta_km / baseline
        excess_l = entry.litres - expected_l
    elif kmpl < KMPL_HARD_FLOOR:
        expected_l = None
        excess_l = None
        baseline = None
    else:
        return None
    overflow_rs = 0.0
    if (
        ctx.bus is not None
        and entry.litres > ctx.bus.tank_litres + TANK_TOLERANCE_LITRES
        and ctx.published_price_rs is not None
    ):
        overflow_rs = round_rs((entry.litres - ctx.bus.tank_litres) * ctx.published_price_rs)
    estimate = None
    if excess_l is not None and excess_l > 0 and ctx.published_price_rs is not None:
        full = round_rs(excess_l * ctx.published_price_rs)
        estimate = round_rs(max(0.0, full - overflow_rs))
    if baseline:
        comparison = f"this bus's baseline of {baseline:.2f} km per litre"
    else:
        comparison = f"the fleet floor of {KMPL_HARD_FLOOR:.1f} km per litre"
    return Flag(
        rule_code="R09_EFFICIENCY",
        severity="review",
        reason=(
            f"{entry.bus_code} shows {kmpl:.2f} km per litre on the {delta_km:.0f} km "
            f"since the previous fill, against {comparison}. "
            "A drop can be a loaded bus, a fault, or fuel that did not move the bus. "
            "The flag asks for a look. It does not decide which."
        ),
        evidence=f"delta_km={delta_km:.0f}; km_per_litre={kmpl:.2f}; baseline={baseline}",
        rs_estimate=estimate,
        additive_with_same_fill=True,
    )


def rule_odometer_not_advancing(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R10. The odometer did not move, but litres were recorded."""
    if ctx.previous is None:
        return None
    delta = entry.odometer_km - ctx.previous.odometer_km
    if delta > 0:
        return None
    return Flag(
        rule_code="R10_ODOMETER_NOT_ADVANCING",
        severity="review",
        reason=(
            f"The odometer on {entry.bus_code} reads {entry.odometer_km:.0f} km, "
            f"against {ctx.previous.odometer_km:.0f} km on {ctx.previous.entry_id}. "
            f"It did not advance, and {entry.litres:.1f} litres were still recorded."
        ),
        evidence=(
            f"previous={ctx.previous.entry_id}; previous_odo={ctx.previous.odometer_km:.0f}; "
            f"odo={entry.odometer_km:.0f}"
        ),
    )


def rule_gps_odometer_divergence(entry: FuelEntry, ctx: EntryContext) -> Flag | None:
    """R11. GPS distance against the odometer, and only when the tracker stayed on.

    A long gap or a trace that covers little of the interval returns None.
    That is the VB-04 outage case: missing GPS is not a fuel finding.
    """
    if ctx.previous is None or ctx.gps_distance_km is None:
        return None
    delta_km = entry.odometer_km - ctx.previous.odometer_km
    if delta_km <= 0:
        return None
    if ctx.gps_ping_count is None or ctx.gps_ping_count < GPS_MIN_PINGS:
        return None
    if ctx.gps_max_gap_hours is not None and ctx.gps_max_gap_hours > GPS_OUTAGE_GAP_HOURS:
        return None
    if ctx.interval_hours and ctx.gps_span_hours is not None:
        if ctx.gps_span_hours < GPS_MIN_COVERAGE_RATIO * ctx.interval_hours:
            return None
    ratio = ctx.gps_distance_km / delta_km
    if GPS_ODO_RATIO_LOW <= ratio <= GPS_ODO_RATIO_HIGH:
        return None
    return Flag(
        rule_code="R11_GPS_ODOMETER_GAP",
        severity="info",
        reason=(
            f"Between fills the odometer moved {delta_km:.0f} km and the GPS trace "
            f"adds to {ctx.gps_distance_km:.0f} km. The tracker was reporting often "
            "enough to compare the two. A gap like this is a tracker or odometer "
            "question. It is not, on its own, a fuel-loss finding."
        ),
        evidence=(
            f"odo_km={delta_km:.0f}; gps_km={ctx.gps_distance_km:.1f}; ratio={ratio:.2f}"
        ),
        rs_estimate=None,
    )


ENTRY_RULES = (
    rule_fuel_type,
    rule_tank_capacity,
    rule_amount_vs_published_price,
    rule_duplicate_entry,
    rule_short_interval,
    rule_closed_day,
    rule_cash_without_receipt,
    rule_gps_far_from_pump,
    rule_efficiency,
    rule_odometer_not_advancing,
    rule_gps_odometer_divergence,
)

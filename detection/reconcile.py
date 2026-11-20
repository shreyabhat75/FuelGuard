"""Match credit-account register lines to the Shree Lakshmi statement.

Cash fills at Highway Fuel Point are not on this statement and are not
matched here. Registration text is upper-cased and collapsed to single spaces
so a pump layout change does not hide a bus.
"""

from __future__ import annotations

from detection.models import (
    CreditMatch,
    FuelEntry,
    ReconcileResult,
    StatementLine,
)
from detection.money import round_rs
from detection.thresholds import AMOUNT_TOLERANCE_RS, PRICE_PREMIUM_RS_PER_LITRE


def normalise_registration(value: str) -> str:
    return " ".join(value.upper().replace("-", " ").split())


def reconcile_credit_account(
    entries: list[FuelEntry],
    statements: list[StatementLine],
    reg_to_bus: dict[str, str],
) -> ReconcileResult:
    """Greedy match on date + registration + litres.

    Each statement line is used at most once, so a duplicated register line
    stays unmatched. Amount is compared after the match. It is not required
    for the match, because F0052 has the same litres and a different amount.
    """
    result = ReconcileResult()
    credit = [entry for entry in entries if entry.payment_mode == "credit_account"]
    used: set[int] = set()

    for entry in sorted(credit, key=lambda item: (item.timestamp, item.entry_id)):
        reg = _reg_for_entry(entry, reg_to_bus)
        pick = _pick_statement(entry, reg, statements, used)
        if pick is None:
            result.register_only_entry_ids.append(entry.entry_id)
            continue
        used.add(pick)
        line = statements[pick]
        litre_diff = round_rs(entry.litres - line.litres)
        amount_diff = round_rs(entry.amount_rs - line.amount)
        match = CreditMatch(entry.entry_id, line.bill_no, litre_diff, amount_diff)
        result.matches.append(match)
        if abs(amount_diff) > AMOUNT_TOLERANCE_RS or abs(litre_diff) > 0.05:
            result.amount_mismatches.append(match)

    for index, line in enumerate(statements):
        if index in used:
            continue
        if normalise_registration(line.vehicle_no) not in reg_to_bus:
            result.unknown_vehicle_bills.append(line)
        else:
            result.statement_only_bills.append(line)
    return result


def price_premiums(
    statements: list[StatementLine],
    published_price_on,
    reg_to_bus: dict[str, str],
) -> list[tuple[StatementLine, str, float, float]]:
    """Bills whose rate sits above the published town price.

    Returns (line, bus_code or UNKNOWN, rupees_per_litre_over, excess_rupees).
    """
    found = []
    for line in statements:
        published = published_price_on(line.date)
        if published is None:
            continue
        gap = round(line.rate - published, 2)
        if gap <= PRICE_PREMIUM_RS_PER_LITRE:
            continue
        excess = round_rs(line.litres * gap)
        bus = reg_to_bus.get(normalise_registration(line.vehicle_no), "UNKNOWN")
        found.append((line, bus, gap, excess))
    return found


def _reg_for_entry(entry: FuelEntry, reg_to_bus: dict[str, str]) -> str | None:
    for reg, bus in reg_to_bus.items():
        if bus == entry.bus_code:
            return reg
    return None


def _pick_statement(
    entry: FuelEntry,
    reg: str | None,
    statements: list[StatementLine],
    used: set[int],
) -> int | None:
    if reg is None:
        return None
    candidates = []
    for index, line in enumerate(statements):
        if index in used:
            continue
        if line.date.date() != entry.timestamp.date():
            continue
        if normalise_registration(line.vehicle_no) != reg:
            continue
        candidates.append(index)
    litre_hits = [
        index
        for index in candidates
        if abs(statements[index].litres - entry.litres) <= 0.05
    ]
    pool = litre_hits or candidates
    if not pool:
        return None
    if len(pool) == 1:
        return pool[0]
    for index in pool:
        if abs(statements[index].amount - entry.amount_rs) <= AMOUNT_TOLERANCE_RS:
            return index
    return pool[0]

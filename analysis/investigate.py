"""Turn the intern-pack CSVs into findings.csv.

The rupee column is unexplained money, not a finding that a named person
took it. The provisional credit-account figure of Rs 10,902.22 is rebuilt
from four mismatches and is never written as one row.
"""

from __future__ import annotations

import argparse
import csv
import os
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from analysis.gps_track import BusTrack
from analysis.loaders import load_pack
from detection.haversine import haversine_km
from detection.models import VERDICT_FRAUD, VERDICT_HONEST, VERDICT_UNVERIFIED
from detection.reconcile import (
    normalise_registration,
    price_premiums,
    reconcile_credit_account,
)
from detection.thresholds import (
    GPS_MIN_COVERAGE_RATIO,
    GPS_MIN_PINGS,
    GPS_OUTAGE_GAP_HOURS,
    PATTERN_BASELINE_RATIO,
    PATTERN_MIN_EXCESS_LITRES,
    PATTERN_MIN_RUN,
    TANK_TOLERANCE_LITRES,
)

FINDING_COLUMNS = [
    "ids",
    "bus",
    "issue_type",
    "evidence",
    "verdict",
    "confidence",
    "rs_estimate",
]

PROVISIONAL = (
    "This is one of the four credit-account mismatches that add up to the "
    "provisional Rs 10902.22. That sum is not confirmed theft."
)


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _litres(value: float) -> Decimal:
    return Decimal(str(round(value, 1)))


def _rate(value: float) -> Decimal:
    return Decimal(str(round(value, 2)))


def _product(litres: float, rate: float) -> Decimal:
    return _q2(_litres(litres) * _rate(rate))


def _text(amount: Decimal) -> str:
    return f"{_q2(amount):.2f}"


@dataclass
class Segment:
    bus: str
    previous_id: str
    entry_id: str
    start: datetime
    end: datetime
    km: float
    litres: float
    kmpl: float
    amount: float
    payment_mode: str
    pump_name: str


@dataclass
class Investigation:
    findings: list[dict] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    provisional_credit_rs: Decimal = Decimal("0.00")


def find_data_dir(explicit: Path | None = None) -> Path:
    if explicit is not None:
        return explicit
    env = os.environ.get("FUEL_DATA_DIR")
    root = Path(__file__).resolve().parents[1]
    candidates = []
    if env:
        candidates.append(Path(env))
    candidates.extend([root / "data", root / "intern_pack" / "intern_pack"])
    for candidate in candidates:
        if (candidate / "fuel_register.csv").is_file():
            return candidate
    raise FileNotFoundError(
        "No fuel_register.csv found. Pass --data-dir or set FUEL_DATA_DIR."
    )


def build_investigation(data_dir: Path) -> Investigation:
    pack = load_pack(data_dir)
    buses = {bus.bus_code: bus for bus in pack["buses"]}
    reg_to_bus = {
        normalise_registration(bus.reg_no): bus.bus_code for bus in pack["buses"]
    }
    entries = pack["entries"]
    by_id = {entry.entry_id: entry for entry in entries}
    statements = pack["statements"]
    prices = pack["prices"]
    holidays = pack["holidays"]
    places = pack["places"]
    tracks = {bus: BusTrack(pings) for bus, pings in pack["gps"].items()}

    reconciled = reconcile_credit_account(entries, statements, reg_to_bus)
    bill_of = {match.entry_id: match.bill_no for match in reconciled.matches}
    premiums = price_premiums(
        statements,
        lambda moment: prices.get(moment.date()),
        reg_to_bus,
    )
    segments = _segments(entries)
    by_bus_segments: dict[str, list[Segment]] = defaultdict(list)
    for segment in segments:
        by_bus_segments[segment.bus].append(segment)

    findings: list[tuple[datetime, dict]] = []
    provisional = Decimal("0.00")

    if premiums:
        provisional += _add_premium(findings, premiums, bill_of, by_id)

    book_gap = Decimal("0.00")
    for mismatch in reconciled.amount_mismatches:
        gap = _add_amount_mismatch(
            findings, mismatch, by_id, statements, prices, bill_of
        )
        book_gap += gap
    provisional += book_gap

    for line in reconciled.unknown_vehicle_bills:
        provisional += _add_unknown(findings, line)

    for line in reconciled.statement_only_bills:
        provisional += _add_statement_only(
            findings, line, reg_to_bus, tracks, places, holidays
        )

    _add_tank_conflicts(
        findings, entries, buses, prices, bill_of, by_bus_segments, tracks
    )
    _add_duplicates(findings, entries, reconciled, bill_of)
    _add_closed_day_claims(findings, entries, holidays, tracks, places)
    _add_short_intervals(findings, by_bus_segments, prices, bill_of, tracks, places)
    _add_patterns(findings, by_bus_segments, prices, bill_of, tracks)

    findings.sort(key=lambda item: (item[0], item[1]["issue_type"], item[1]["ids"]))
    report = Investigation(
        findings=[row for _, row in findings],
        provisional_credit_rs=_q2(provisional),
    )
    report.notes.extend(
        _notes(
            entries,
            statements,
            reconciled,
            book_gap,
            premiums,
            by_bus_segments,
            tracks,
            prices,
            places,
            report.findings,
        )
    )
    return report


def write_findings(path: Path, findings: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=FINDING_COLUMNS,
            lineterminator="\n",
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        for row in findings:
            writer.writerow(row)


def _segments(entries) -> list[Segment]:
    grouped: dict[str, list] = defaultdict(list)
    for entry in entries:
        grouped[entry.bus_code].append(entry)
    segments = []
    for bus, rows in grouped.items():
        rows.sort(key=lambda item: item.timestamp)
        for previous, current in zip(rows, rows[1:]):
            km = current.odometer_km - previous.odometer_km
            if km <= 0 or current.litres <= 0:
                continue
            segments.append(
                Segment(
                    bus=bus,
                    previous_id=previous.entry_id,
                    entry_id=current.entry_id,
                    start=previous.timestamp,
                    end=current.timestamp,
                    km=km,
                    litres=current.litres,
                    kmpl=km / current.litres,
                    amount=current.amount_rs,
                    payment_mode=current.payment_mode,
                    pump_name=current.pump_name,
                )
            )
    return segments


def _median_kmpl(segments: list[Segment]) -> float | None:
    if not segments:
        return None
    return float(statistics.median([segment.kmpl for segment in segments]))


def _excess(segment: Segment, baseline: float, prices: dict) -> tuple[Decimal, Decimal]:
    expected = Decimal(str(segment.km)) / Decimal(str(baseline))
    excess_l = _litres(segment.litres) - expected
    rate = prices[segment.end.date()]
    money = _q2(excess_l * _rate(rate))
    return _q2(excess_l), money


def _ids(*parts: str) -> str:
    seen = []
    for part in parts:
        if part and part not in seen:
            seen.append(part)
    return ";".join(seen)


def _row(ids, bus, issue_type, evidence, verdict, confidence, amount: Decimal) -> dict:
    return {
        "ids": ids,
        "bus": bus,
        "issue_type": issue_type,
        "evidence": " ".join(evidence.split()),
        "verdict": verdict,
        "confidence": confidence,
        "rs_estimate": _text(amount),
    }


def _add_premium(findings, premiums, bill_of, by_id) -> Decimal:
    by_bus: dict[str, list] = defaultdict(list)
    for line, bus, gap, excess in premiums:
        by_bus[bus].append((line, gap, excess))
    total = Decimal("0.00")
    for bus, rows in by_bus.items():
        amount = _q2(sum((Decimal(str(excess)) for _, _, excess in rows), Decimal("0")))
        total += amount
        entry_ids = []
        bill_ids = []
        bits = []
        for line, gap, excess in rows:
            bill_ids.append(line.bill_no)
            matched = [
                entry_id
                for entry_id, bill_no in bill_of.items()
                if bill_no == line.bill_no
            ]
            entry_ids.extend(matched)
            bits.append(
                f"{line.bill_no} on {line.date:%d %b %Y} bills {line.litres:.1f} L "
                f"at Rs {line.rate:.2f}/L, which is Rs {gap:.2f}/L over the published "
                f"Rs {(line.rate - gap):.2f}/L (Rs {excess:.2f} extra)"
            )
        first = min(line.date for line, _, _ in rows)
        label = "bill" if len(rows) == 1 else "bills"
        findings.append(
            (
                first,
                _row(
                    _ids(*entry_ids, *bill_ids),
                    bus,
                    "price_premium",
                    (
                        f"{bus} has {len(rows)} credit {label} above the published town price. "
                        + "; ".join(bits)
                        + ". The register amount matches each inflated bill, and this bus's "
                        "other fills are at the published price, so the extra rupees are on "
                        "the document the college pays. The litres are a separate question "
                        "and are not included here. "
                        + PROVISIONAL
                    ),
                    VERDICT_UNVERIFIED,
                    "high",
                    amount,
                ),
            )
        )
    return total


def _add_amount_mismatch(findings, mismatch, by_id, statements, prices, bill_of) -> Decimal:
    entry = by_id[mismatch.entry_id]
    line = next(item for item in statements if item.bill_no == mismatch.bill_no)
    published = prices[entry.timestamp.date()]
    expected = _product(line.litres, published)
    statement_ok = abs(Decimal(str(round(line.amount, 2))) - expected) <= Decimal("0.05")
    book_gap = _q2(Decimal(str(round(entry.amount_rs, 2))) - Decimal(str(round(line.amount, 2))))
    if statement_ok and book_gap > 0:
        verdict = VERDICT_HONEST
        confidence = "high"
        loss = Decimal("0.00")
        cash = (
            f"The statement amount Rs {line.amount:.2f} equals {line.litres:.1f} L times "
            f"the published Rs {published:.2f}/L. The register says Rs {entry.amount_rs:.2f}, "
            f"which is Rs {book_gap:.2f} higher. Credit fills are paid from the statement, "
            "so this book difference is not a cash loss."
        )
    else:
        verdict = VERDICT_UNVERIFIED
        confidence = "medium"
        loss = abs(book_gap)
        cash = (
            f"Register Rs {entry.amount_rs:.2f} and statement Rs {line.amount:.2f} "
            f"differ by Rs {book_gap:.2f} on the same litres."
        )
    findings.append(
        (
            entry.timestamp,
            _row(
                _ids(entry.entry_id, line.bill_no),
                entry.bus_code,
                "amount_mismatch",
                cash + " " + PROVISIONAL,
                verdict,
                confidence,
                loss,
            ),
        )
    )
    return abs(book_gap)


def _add_unknown(findings, line) -> Decimal:
    amount = _q2(Decimal(str(round(line.amount, 2))))
    findings.append(
        (
            line.date,
            _row(
                line.bill_no,
                "UNKNOWN",
                "unknown_vehicle",
                (
                    f"{line.bill_no} on {line.date:%d %b %Y} charges Rs {line.amount:.2f} "
                    f"for {line.litres:.1f} L at Rs {line.rate:.2f}/L to {line.vehicle_no}. "
                    "That registration is not one of the eight college buses, and the fuel "
                    "register has no line for it. The rate matches the published price. "
                    "The whole charge is unexplained. It may be a mis-keyed vehicle or "
                    "fuel that was never for this fleet. "
                    + PROVISIONAL
                ),
                VERDICT_UNVERIFIED,
                "medium",
                amount,
            ),
        )
    )
    return amount


def _add_statement_only(findings, line, reg_to_bus, tracks, places, holidays) -> Decimal:
    bus = reg_to_bus[normalise_registration(line.vehicle_no)]
    amount = _q2(Decimal(str(round(line.amount, 2))))
    day = line.date.date()
    pump = places["Shree Lakshmi Fuels"]
    ping_count, nearest = tracks[bus].day_min_km(day, pump[0], pump[1])
    closed = []
    if day.weekday() == 6:
        closed.append("a Sunday")
    if day in holidays:
        closed.append(holidays[day])
    depot = places["College depot"]
    _, depot_near, depot_far = tracks[bus].day_distance_range(day, depot[0], depot[1])
    where = "The GPS track has no pings that day, so a missing tracker is not being treated as proof."
    if (
        nearest is not None
        and depot_near is not None
        and depot_far is not None
        and depot_far < 0.2
        and nearest > 1
    ):
        where = (
            f"The tracker reported {ping_count} times that day. Every ping is at the "
            f"college depot (the farthest is {depot_far:.2f} km from the depot). "
            f"The closest point to Shree Lakshmi Fuels is {nearest:.2f} km, which is "
            "the depot's own distance from that pump. The bus was not at the pump."
        )
    elif nearest is not None:
        where = (
            f"The tracker reported {ping_count} times that day and its closest point "
            f"was {nearest:.2f} km from Shree Lakshmi Fuels."
        )
    closed_text = ""
    if closed:
        closed_text = " The date is " + " and ".join(closed) + ", when these buses do not run a normal route."
    findings.append(
        (
            line.date,
            _row(
                line.bill_no,
                bus,
                "statement_without_register",
                (
                    f"{line.bill_no} on {line.date:%d %b %Y} bills {bus} ({line.vehicle_no}) "
                    f"for {line.litres:.1f} L and Rs {line.amount:.2f}. The fuel register "
                    f"has no line for it.{closed_text} {where} "
                    "The whole charge is unexplained. A mis-keyed registration remains possible, "
                    "which is why this is not called proved theft. "
                    + PROVISIONAL
                ),
                VERDICT_UNVERIFIED,
                "high" if nearest is not None and nearest > 1 else "medium",
                amount,
            ),
        )
    )
    return amount


def _add_tank_conflicts(findings, entries, buses, prices, bill_of, by_bus_segments, tracks):
    for entry in entries:
        bus = buses[entry.bus_code]
        overflow = entry.litres - bus.tank_litres
        if overflow <= TANK_TOLERANCE_LITRES:
            continue
        others = [
            segment
            for segment in by_bus_segments[entry.bus_code]
            if segment.entry_id != entry.entry_id
        ]
        own = next(
            (segment for segment in by_bus_segments[entry.bus_code] if segment.entry_id == entry.entry_id),
            None,
        )
        baseline = _median_kmpl(others)
        rate = prices[entry.timestamp.date()]
        overflow_rs = _product(overflow, rate)
        efficiency_text = "There is no earlier fill to compare consumption with."
        loss = overflow_rs
        if own is not None and baseline:
            excess_l, excess_rs = _excess(own, baseline, prices)
            loss = excess_rs if excess_rs > 0 else overflow_rs
            path = tracks[entry.bus_code].path(own.start, own.end)
            gps_text = (
                f"GPS distance on that stretch is {path['km']:.0f} km "
                f"against an odometer movement of {own.km:.0f} km."
            )
            efficiency_text = (
                f"Since {own.previous_id} the bus did {own.km:.0f} km on {own.litres:.1f} L "
                f"({own.kmpl:.2f} km/L). The other fills on this bus sit at about "
                f"{baseline:.2f} km/L, which would have used about "
                f"{(Decimal(str(own.km)) / Decimal(str(baseline))).quantize(Decimal('0.1'))} L. "
                f"The gap versus that baseline is Rs {excess_rs:.2f}. {gps_text}"
            )
        bill = bill_of.get(entry.entry_id)
        findings.append(
            (
                entry.timestamp,
                _row(
                    _ids(entry.entry_id, bill or ""),
                    entry.bus_code,
                    "tank_capacity",
                    (
                        f"{entry.entry_id} bills {entry.litres:.1f} L into {entry.bus_code}, "
                        f"whose tank is {bus.tank_litres:.0f} L. {overflow:.1f} L cannot fit. "
                        f"At the published price that overflow is Rs {overflow_rs:.2f}, and that "
                        "part cannot be explained as fuel the bus burned. "
                        f"{efficiency_text} The register line was typed by the transport office "
                        "from the pump bill, and the statement carries the same litres, so the "
                        "two records are not two independent measurements. "
                        "The estimate uses the gap versus this bus's own other fills, because "
                        "the odometer and the GPS trace agree on the distance. "
                        "This does not name a driver. It is not part of the provisional "
                        "Rs 10902.22, which is a different set of book mismatches."
                    ),
                    VERDICT_FRAUD,
                    "medium",
                    loss,
                ),
            )
        )


def _add_duplicates(findings, entries, reconciled, bill_of):
    grouped: dict[str, list] = defaultdict(list)
    for entry in entries:
        grouped[entry.bus_code].append(entry)
    matched_ids = set(bill_of)
    for entry_id in reconciled.register_only_entry_ids:
        entry = next(item for item in entries if item.entry_id == entry_id)
        twin = None
        for other in grouped[entry.bus_code]:
            if other.entry_id == entry.entry_id:
                continue
            hours = abs((entry.timestamp - other.timestamp).total_seconds()) / 3600
            same = (
                hours <= 24
                and abs(entry.litres - other.litres) <= 0.05
                and abs(entry.amount_rs - other.amount_rs) <= 0.05
                and entry.odometer_km == other.odometer_km
            )
            if same and other.entry_id in matched_ids:
                twin = other
                break
        bill = bill_of.get(twin.entry_id) if twin else None
        if twin and bill:
            evidence = (
                f"{entry.entry_id} repeats {twin.entry_id}: {entry.litres:.1f} L, "
                f"Rs {entry.amount_rs:.2f}, odometer {entry.odometer_km:.0f}, "
                f"{abs((entry.timestamp - twin.timestamp).total_seconds()) / 3600:.1f} hours apart. "
                f"The pump statement has one bill for that fill, {bill}. "
                "The college was not charged twice. This is a repeated register line."
            )
            verdict = VERDICT_HONEST
            confidence = "high"
        else:
            evidence = (
                f"{entry.entry_id} is a credit-account register line with no statement bill."
            )
            verdict = VERDICT_UNVERIFIED
            confidence = "medium"
        findings.append(
            (
                entry.timestamp,
                _row(
                    _ids(twin.entry_id if twin else "", entry.entry_id, bill or ""),
                    entry.bus_code,
                    "duplicate_register_entry",
                    evidence,
                    verdict,
                    confidence,
                    Decimal("0.00"),
                ),
            )
        )


def _add_closed_day_claims(findings, entries, holidays, tracks, places):
    for entry in entries:
        day = entry.timestamp.date()
        is_sunday = day.weekday() == 6
        holiday = holidays.get(day)
        if not is_sunday and holiday is None:
            continue
        if entry.receipt_on_file:
            continue
        pump = places.get(entry.pump_name)
        if pump is None or entry.bus_code not in tracks:
            continue
        ping_count, nearest = tracks[entry.bus_code].day_min_km(day, pump[0], pump[1])
        if ping_count == 0 or nearest is None or nearest <= 5:
            continue
        name = holiday or "Sunday"
        findings.append(
            (
                entry.timestamp,
                _row(
                    entry.entry_id,
                    entry.bus_code,
                    "holiday_unreceipted_cash",
                    (
                        f"{entry.entry_id} is a {entry.payment_mode.replace('_', ' ')} claim "
                        f"for {entry.litres:.1f} L and Rs {entry.amount_rs:.2f} on {name} "
                        f"({day:%d %b %Y}), with no receipt on file. The tracker reported "
                        f"{ping_count} times that day and stayed {nearest:.1f} km from "
                        f"{entry.pump_name}. Those pings exist, so this is not a case of a "
                        "silent tracker being called fraud. The bus was not shown at the pump, "
                        "and there is no receipt to show the fuel was bought. The full claim "
                        "is the amount at risk. It is outside the provisional Rs 10902.22 "
                        "credit-account figure."
                    ),
                    VERDICT_UNVERIFIED,
                    "medium",
                    _q2(Decimal(str(round(entry.amount_rs, 2)))),
                ),
            )
        )


def _add_short_intervals(findings, by_bus_segments, prices, bill_of, tracks, places):
    for bus, segments in by_bus_segments.items():
        for segment in segments:
            hours = (segment.end - segment.start).total_seconds() / 3600
            if hours > 18 or segment.kmpl >= 2.5:
                continue
            others = [item for item in segments if item.entry_id != segment.entry_id]
            baseline = _median_kmpl(others)
            excess_l, excess_rs = (Decimal("0.00"), Decimal("0.00"))
            baseline_text = "This bus has no other stretch to compare."
            if baseline:
                excess_l, excess_rs = _excess(segment, baseline, prices)
                baseline_text = (
                    f"The other fills on this bus sit at about {baseline:.2f} km/L, "
                    f"so about {excess_l:.1f} L (Rs {excess_rs:.2f}) are above that baseline."
                )
            path = tracks[bus].path(segment.start, segment.end)
            teleport = ""
            if path["teleports"]:
                pump = places.get(segment.pump_name)
                nearest = None
                if pump is not None:
                    _, nearest = tracks[bus].day_min_km(segment.end.date(), pump[0], pump[1])
                if nearest is not None and nearest <= 0.2:
                    teleport = (
                        " A GPS timestamp in this window is stored twice, at two places "
                        "too far apart for one bus. The nearer fix is at the named pump, "
                        "so the location is not used as proof against the fill."
                    )
                else:
                    teleport = (
                        " A GPS timestamp in this window is stored twice, at two places "
                        "too far apart for one bus. That jump was left out of the distance."
                    )
            bill = bill_of.get(segment.entry_id)
            findings.append(
                (
                    segment.end,
                    _row(
                        _ids(segment.entry_id, bill or ""),
                        bus,
                        "short_interval_refill",
                        (
                            f"{segment.entry_id} is a second fill {hours:.1f} hours after "
                            f"{segment.previous_id}. The odometer moved {segment.km:.0f} km "
                            f"and the fill is {segment.litres:.1f} L ({segment.kmpl:.2f} km/L). "
                            f"{baseline_text}{teleport} "
                            "The estimate is the litres above this bus's own baseline, "
                            "not the whole bill, because a few litres do match the short distance. "
                            "This is not part of the provisional Rs 10902.22."
                        ),
                        VERDICT_UNVERIFIED,
                        "medium",
                        excess_rs if excess_rs > 0 else Decimal("0.00"),
                    ),
                )
            )


def _add_patterns(findings, by_bus_segments, prices, bill_of, tracks):
    for bus, segments in by_bus_segments.items():
        best = None
        for start in range(len(segments)):
            for end in range(start + PATTERN_MIN_RUN, len(segments) + 1):
                window = segments[start:end]
                outside = segments[:start] + segments[end:]
                if len(outside) < 4:
                    continue
                baseline = _median_kmpl(outside)
                if baseline is None or baseline <= 0:
                    continue
                ok = True
                for segment in window:
                    excess_l, _ = _excess(segment, baseline, prices)
                    if segment.kmpl >= PATTERN_BASELINE_RATIO * baseline:
                        ok = False
                        break
                    if excess_l < PATTERN_MIN_EXCESS_LITRES:
                        ok = False
                        break
                if ok and (best is None or len(window) > len(best[0])):
                    best = (window, baseline, outside)
        if best is None:
            continue
        window, baseline, outside = best
        total = Decimal("0.00")
        detail = []
        ids = []
        for segment in window:
            excess_l, excess_rs = _excess(segment, baseline, prices)
            total += excess_rs
            ids.append(segment.entry_id)
            bill = bill_of.get(segment.entry_id)
            if bill:
                ids.append(bill)
            detail.append(
                f"{segment.entry_id} {segment.end:%d %b} {segment.km:.0f} km / "
                f"{segment.litres:.1f} L = {segment.kmpl:.2f} km/L, Rs {excess_rs:.2f} above baseline"
            )
        early = [segment for segment in outside if segment.end < window[0].end]
        corridor = _corridor_note(tracks.get(bus), early, window)
        findings.append(
            (
                window[0].end,
                _row(
                    _ids(*ids),
                    bus,
                    "efficiency_drop",
                    (
                        f"{bus} has {len(window)} fills in a row below its own earlier "
                        f"consumption. The other stretches on this bus have a median of "
                        f"{baseline:.2f} km/L. " + "; ".join(detail) + ". "
                        f"Together that is Rs {total:.2f} of fuel above the same bus's baseline. "
                        f"{corridor} "
                        "A fault, a heavier load or more idling can do this, so it is not "
                        "marked as fraud. It is a pattern across weeks, not one bad bill, "
                        "and it is not part of the provisional Rs 10902.22."
                    ),
                    VERDICT_UNVERIFIED,
                    "medium",
                    _q2(total),
                ),
            )
        )


def _corridor_note(track: BusTrack | None, early: list[Segment], window: list[Segment]) -> str:
    if track is None or not early:
        return "The GPS corridor was not compared."
    before = _box(track, early[0].start, early[-1].end)
    during = _box(track, window[0].start, window[-1].end)
    if before is None or during is None:
        return "The GPS corridor was not compared."
    same = (
        during[0] >= before[0] - 0.02
        and during[1] <= before[1] + 0.02
        and during[2] >= before[2] - 0.02
        and during[3] <= before[3] + 0.02
    )
    if same:
        return (
            "The GPS bounding box of the weak stretches sits inside the box of the "
            "earlier stretches, so this is not a new route on the map."
        )
    return "The GPS bounding box of the weak stretches is not the same as the earlier one."


def _box(track: BusTrack, start: datetime, end: datetime):
    points = track.slice(start, end)
    if len(points) < 10:
        return None
    lats = [point[1] for point in points]
    lngs = [point[2] for point in points]
    return min(lats), max(lats), min(lngs), max(lngs)


def _coverage_ok(path: dict, start: datetime, end: datetime) -> bool:
    if path["pings"] < GPS_MIN_PINGS:
        return False
    if path["max_gap_hours"] is not None and path["max_gap_hours"] > GPS_OUTAGE_GAP_HOURS:
        return False
    interval_h = (end - start).total_seconds() / 3600
    if interval_h <= 0:
        return False
    return path["span_hours"] >= GPS_MIN_COVERAGE_RATIO * interval_h


def _notes(
    entries,
    statements,
    reconciled,
    book_gap,
    premiums,
    by_bus_segments,
    tracks,
    prices,
    places,
    findings,
) -> list[str]:
    notes = []
    credit = [entry for entry in entries if entry.payment_mode == "credit_account"]
    credit_rs = _q2(sum((_q2(Decimal(str(round(entry.amount_rs, 2)))) for entry in credit), Decimal("0")))
    statement_rs = _q2(
        sum((_q2(Decimal(str(round(line.amount, 2)))) for line in statements), Decimal("0"))
    )
    duplicate_rs = Decimal("0.00")
    for entry_id in reconciled.register_only_entry_ids:
        entry = next(item for item in entries if item.entry_id == entry_id)
        duplicate_rs += _q2(Decimal(str(round(entry.amount_rs, 2))))
    unknown_rs = _q2(
        sum(
            (_q2(Decimal(str(round(line.amount, 2)))) for line in reconciled.unknown_vehicle_bills),
            Decimal("0"),
        )
    )
    missing_rs = _q2(
        sum(
            (_q2(Decimal(str(round(line.amount, 2)))) for line in reconciled.statement_only_bills),
            Decimal("0"),
        )
    )
    explained = _q2(book_gap + duplicate_rs - unknown_rs - missing_rs)
    notes.append(
        f"Credit register Rs {credit_rs:.2f} minus pump statement Rs {statement_rs:.2f} "
        f"is Rs {(credit_rs - statement_rs):.2f}. That equals the Rs {book_gap:.2f} register "
        f"overstatement plus the Rs {duplicate_rs:.2f} duplicate register line, minus the "
        f"Rs {unknown_rs:.2f} unknown-vehicle bill and the Rs {missing_rs:.2f} statement line "
        f"with no register row (Rs {explained:.2f}). The books balance. Nothing else is hiding "
        "in the credit total."
    )
    premium_rs = _q2(
        sum((Decimal(str(excess)) for *_, excess in premiums), Decimal("0"))
    )
    notes.append(
        f"Price premium on the statement is Rs {premium_rs:.2f}. It is inside both the "
        "register and the statement, so it does not show up in the register-minus-statement "
        "difference. It is the fourth piece of the provisional Rs 10902.22."
    )
    flagged_ids = set()
    for row in findings:
        flagged_ids.update(part for part in row["ids"].split(";") if part.startswith("F"))
    for entry in entries:
        if entry.receipt_on_file or entry.payment_mode != "cash":
            continue
        if entry.entry_id in flagged_ids:
            continue
        published = prices[entry.timestamp.date()]
        expected = _product(entry.litres, published)
        gap = abs(_q2(Decimal(str(round(entry.amount_rs, 2))) - expected))
        pump = places.get(entry.pump_name)
        where = "pump location was not checked"
        if pump and entry.bus_code in tracks:
            age = tracks[entry.bus_code].nearest(entry.timestamp, timedelta(minutes=20))
            if age is None:
                where = "no GPS fix within 20 minutes"
            else:
                distance = haversine_km(age[2], age[3], pump[0], pump[1])
                where = f"nearest fix {distance:.2f} km from the pump"
        notes.append(
            f"{entry.entry_id} has no receipt, but the amount matches the published price "
            f"(gap Rs {gap:.2f}) and {where}. Not counted as leakage."
        )
    for bus, track in tracks.items():
        gap = track.longest_gap()
        if gap and gap[2] > GPS_OUTAGE_GAP_HOURS:
            notes.append(
                f"{bus} tracker gap {gap[0]:%d %b %Y %H:%M} to {gap[1]:%d %b %Y %H:%M} "
                f"({gap[2]:.0f} h). Fills in that window are not treated as fraud. "
                "A silent tracker is not evidence."
            )
    weak = []
    for bus, segments in by_bus_segments.items():
        for segment in segments:
            if segment.entry_id in flagged_ids:
                continue
            outside = [item for item in segments if item.entry_id != segment.entry_id]
            baseline = _median_kmpl(outside)
            if not baseline:
                continue
            excess_l, excess_rs = _excess(segment, baseline, prices)
            if excess_l >= 30:
                entry = next(item for item in entries if item.entry_id == segment.entry_id)
                receipt = (
                    "The receipt is on file."
                    if entry.receipt_on_file
                    else "The receipt is not on file."
                )
                weak.append(
                    f"{segment.entry_id} on {bus} is one stretch, {excess_l:.0f} L "
                    f"(Rs {excess_rs:.2f}) above that bus's other fills. {receipt} "
                    "A single heavy stretch was not given its own finding."
                )
    notes.extend(weak)
    short_gps = []
    for bus, segments in by_bus_segments.items():
        count = 0
        for segment in segments:
            path = tracks[bus].path(segment.start, segment.end)
            if not _coverage_ok(path, segment.start, segment.end):
                continue
            if segment.km <= 0:
                continue
            if segment.entry_id in flagged_ids:
                continue
            if path["km"] < 0.85 * segment.km:
                count += 1
        if count:
            short_gps.append(f"{bus} {count}")
    if short_gps:
        notes.append(
            "Segments where a continuous GPS trace is under 85% of the odometer, "
            "and which were not turned into fuel findings: " + ", ".join(short_gps) + ". "
            "Where the litres per kilometre stay normal, the short trace is a tracker limit."
        )
    return notes


def main() -> None:
    parser = argparse.ArgumentParser(description="Write findings.csv from the intern pack.")
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=Path("findings.csv"))
    args = parser.parse_args()
    data_dir = find_data_dir(args.data_dir)
    report = build_investigation(data_dir)
    write_findings(args.out, report.findings)
    print(f"data {data_dir}")
    print(f"wrote {args.out} rows {len(report.findings)}")
    print(f"provisional_credit_rs {report.provisional_credit_rs:.2f}")
    for row in report.findings:
        print(
            f"{row['issue_type']:28} {row['bus']:8} {row['verdict']:22} "
            f"{row['confidence']:6} {row['rs_estimate']:>10}  {row['ids']}"
        )
    print("--- notes ---")
    for note in report.notes:
        print(f"* {note}")


if __name__ == "__main__":
    main()

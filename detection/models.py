"""Plain records shared by the rules and the historical investigation."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


VERDICT_FRAUD = "Fraud"
VERDICT_HONEST = "Honest error"
VERDICT_UNVERIFIED = "Cannot be verified"
VERDICTS = (VERDICT_FRAUD, VERDICT_HONEST, VERDICT_UNVERIFIED)


@dataclass(frozen=True)
class Bus:
    bus_code: str
    reg_no: str
    tank_litres: float
    fuel_type: str
    driver_name: str = ""


@dataclass(frozen=True)
class FuelEntry:
    entry_id: str
    timestamp: datetime
    bus_code: str
    litres: float
    amount_rs: float
    fuel_type: str
    odometer_km: float
    payment_mode: str
    pump_name: str
    receipt_on_file: bool
    paid_by: str = ""
    written_by: str = ""


@dataclass(frozen=True)
class GpsFix:
    timestamp: datetime
    lat: float
    lng: float
    age_seconds: float


@dataclass(frozen=True)
class EntryContext:
    """What the rule engine is allowed to see besides the fill itself.

    Leave a field empty when that evidence does not exist. An empty GPS
    field means the tracker did not report. Rules must not treat that as fraud.
    """

    bus: Bus | None = None
    published_price_rs: float | None = None
    previous: FuelEntry | None = None
    baseline_kmpl: float | None = None
    is_holiday: bool = False
    holiday_name: str | None = None
    is_sunday: bool = False
    pump_lat: float | None = None
    pump_lng: float | None = None
    recent_entries: tuple[FuelEntry, ...] = ()
    # Fresh fixes only (caller drops anything older than the fresh window
    # if it does not want a stale point to count). Pass every fix the caller
    # considers usable; the pump rule uses the closest one.
    gps_fixes: tuple[GpsFix, ...] = ()
    gps_distance_km: float | None = None
    gps_max_gap_hours: float | None = None
    gps_span_hours: float | None = None
    interval_hours: float | None = None
    gps_ping_count: int | None = None
    # Closest the bus came to the claimed pump on the fill's calendar day,
    # using whatever pings exist. None when the day has no pings.
    day_min_km_to_pump: float | None = None
    day_ping_count: int | None = None


@dataclass(frozen=True)
class Flag:
    rule_code: str
    severity: str
    reason: str
    evidence: str
    rs_estimate: float | None = None
    # True only when this rupee figure does not overlap another flag on the
    # same fill. The default is safer: do not add flag amounts together.
    additive_with_same_fill: bool = False

    def __post_init__(self) -> None:
        if self.severity not in {"info", "review", "high"}:
            raise ValueError(f"bad severity {self.severity}")
        lowered = self.reason.lower()
        if "guilty" in lowered or "fraud confirmed" in lowered:
            raise ValueError("a flag must not declare a person guilty")


@dataclass(frozen=True)
class StatementLine:
    bill_no: str
    date: datetime
    vehicle_no: str
    litres: float
    rate: float
    amount: float


@dataclass(frozen=True)
class CreditMatch:
    entry_id: str
    bill_no: str
    litre_diff: float
    amount_diff: float


@dataclass
class ReconcileResult:
    matches: list[CreditMatch] = field(default_factory=list)
    amount_mismatches: list[CreditMatch] = field(default_factory=list)
    register_only_entry_ids: list[str] = field(default_factory=list)
    statement_only_bills: list[StatementLine] = field(default_factory=list)
    unknown_vehicle_bills: list[StatementLine] = field(default_factory=list)

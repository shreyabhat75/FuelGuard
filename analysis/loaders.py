"""Read the seven intern-pack CSVs. Money is taken from the text, not from binary floats."""

from __future__ import annotations

import csv
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path

from detection.models import Bus, FuelEntry, StatementLine


def _dec(text: str) -> Decimal:
    return Decimal(text.strip())


def load_buses(path: Path) -> list[Bus]:
    buses = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            buses.append(
                Bus(
                    bus_code=row["bus_code"].strip(),
                    reg_no=row["reg_no"].strip(),
                    tank_litres=float(row["tank_litres"]),
                    fuel_type=row["fuel_type"].strip(),
                    driver_name=row["driver_name"].strip(),
                )
            )
    return buses


def load_register(path: Path) -> list[FuelEntry]:
    entries = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            entries.append(
                FuelEntry(
                    entry_id=row["entry_id"].strip(),
                    timestamp=datetime.strptime(row["timestamp"].strip(), "%Y-%m-%d %H:%M"),
                    bus_code=row["bus_code"].strip(),
                    litres=float(_dec(row["litres"])),
                    amount_rs=float(_dec(row["amount_rs"])),
                    fuel_type=row["fuel_type"].strip(),
                    odometer_km=float(row["odometer_km"]),
                    payment_mode=row["payment_mode"].strip(),
                    pump_name=row["pump_name"].strip(),
                    receipt_on_file=row["receipt_on_file"].strip().upper() == "Y",
                    paid_by=row["paid_by"].strip(),
                    written_by=row["written_by"].strip(),
                )
            )
    return entries


def load_statements(path: Path) -> list[StatementLine]:
    lines = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            lines.append(
                StatementLine(
                    bill_no=row["bill_no"].strip(),
                    date=datetime.strptime(row["date"].strip(), "%d-%m-%Y"),
                    vehicle_no=row["vehicle_no"].strip(),
                    litres=float(_dec(row["litres"])),
                    rate=float(_dec(row["rate"])),
                    amount=float(_dec(row["amount"])),
                )
            )
    return lines


def load_prices(path: Path) -> dict[date, float]:
    prices = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            prices[datetime.strptime(row["date"].strip(), "%Y-%m-%d").date()] = float(
                _dec(row["diesel_rs_per_litre"])
            )
    return prices


def load_holidays(path: Path) -> dict[date, str]:
    holidays = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            holidays[datetime.strptime(row["date"].strip(), "%Y-%m-%d").date()] = row[
                "holiday"
            ].strip()
    return holidays


def load_places(path: Path) -> dict[str, tuple[float, float]]:
    places = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            places[row["place"].strip()] = (float(row["lat"]), float(row["lng"]))
    return places


def load_gps(path: Path) -> dict[str, list[tuple[datetime, float, float]]]:
    by_bus: dict[str, list[tuple[datetime, float, float]]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            bus = row["bus_code"].strip()
            ping = (
                datetime.strptime(row["timestamp"].strip(), "%Y-%m-%d %H:%M:%S"),
                float(row["lat"]),
                float(row["lng"]),
            )
            by_bus.setdefault(bus, []).append(ping)
    for bus in by_bus:
        by_bus[bus].sort(key=lambda item: item[0])
    return by_bus


def load_pack(data_dir: Path) -> dict:
    return {
        "buses": load_buses(data_dir / "buses.csv"),
        "entries": load_register(data_dir / "fuel_register.csv"),
        "statements": load_statements(data_dir / "pump_statement_shree_lakshmi.csv"),
        "prices": load_prices(data_dir / "diesel_price.csv"),
        "holidays": load_holidays(data_dir / "college_calendar.csv"),
        "places": load_places(data_dir / "places.csv"),
        "gps": load_gps(data_dir / "gps_pings.csv"),
    }

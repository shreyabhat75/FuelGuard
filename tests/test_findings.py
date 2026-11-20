"""The investigation on the real intern pack.

findings.csv in the project root has to match a fresh run. The provisional
Rs 10,902.22 has to be four rows, never one theft total.
"""

from __future__ import annotations

import unittest
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from analysis.gps_track import BusTrack
from analysis.investigate import FINDING_COLUMNS, build_investigation, find_data_dir, write_findings
from analysis.loaders import load_pack
from detection.engine import evaluate_entry
from detection.models import VERDICTS, EntryContext, GpsFix
from detection.reconcile import normalise_registration, price_premiums, reconcile_credit_account


ROOT = Path(__file__).resolve().parents[1]


def data_dir() -> Path:
    return find_data_dir()


class ReconcileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = load_pack(data_dir())
        cls.reg_to_bus = {
            normalise_registration(bus.reg_no): bus.bus_code for bus in cls.pack["buses"]
        }
        cls.result = reconcile_credit_account(
            cls.pack["entries"], cls.pack["statements"], cls.reg_to_bus
        )

    def test_eighty_one_credit_lines_and_eighty_two_bills(self):
        credit = [entry for entry in self.pack["entries"] if entry.payment_mode == "credit_account"]
        self.assertEqual(len(credit), 81)
        self.assertEqual(len(self.pack["statements"]), 82)
        self.assertEqual(len(self.result.matches), 80)

    def test_the_four_credit_mismatches_are_exactly_these(self):
        self.assertEqual(
            [mismatch.entry_id for mismatch in self.result.amount_mismatches],
            ["F0052"],
        )
        self.assertEqual(self.result.amount_mismatches[0].amount_diff, 1250.00)
        self.assertEqual(self.result.register_only_entry_ids, ["F0112"])
        self.assertEqual(
            [line.bill_no for line in self.result.unknown_vehicle_bills],
            ["SLF/72152"],
        )
        self.assertEqual(
            [line.bill_no for line in self.result.statement_only_bills],
            ["SLF/72169"],
        )

    def test_provisional_sum_is_10902_22_and_not_a_single_theft(self):
        premiums = price_premiums(
            self.pack["statements"],
            lambda moment: self.pack["prices"].get(moment.date()),
            self.reg_to_bus,
        )
        premium = sum(Decimal(str(excess)) for *_, excess in premiums)
        unknown = Decimal("3749.34")
        missing = Decimal("4286.88")
        book = Decimal("1250.00")
        self.assertEqual(premium, Decimal("1616.00"))
        self.assertEqual(premium + unknown + missing + book, Decimal("10902.22"))
        buses = {item[1] for item in premiums}
        self.assertEqual(buses, {"VB-03"})


class FindingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = build_investigation(data_dir())
        cls.by_type = {row["issue_type"]: row for row in cls.report.findings}

    def test_columns_and_allowed_verdicts(self):
        self.assertEqual(list(self.by_type["tank_capacity"]), FINDING_COLUMNS)
        for row in self.report.findings:
            self.assertIn(row["verdict"], VERDICTS)
            self.assertIn(row["confidence"], {"low", "medium", "high"})
            Decimal(row["rs_estimate"])
            self.assertNotIn("guilty", row["evidence"].lower())
            self.assertNotIn("fraud confirmed", row["evidence"].lower())

    def test_provisional_figure_is_not_one_row(self):
        self.assertEqual(self.report.provisional_credit_rs, Decimal("10902.22"))
        amounts = {row["rs_estimate"] for row in self.report.findings}
        self.assertNotIn("10902.22", amounts)

    def test_seeded_rows(self):
        premium = self.by_type["price_premium"]
        self.assertEqual(premium["bus"], "VB-03")
        self.assertEqual(premium["verdict"], "Cannot be verified")
        self.assertEqual(premium["rs_estimate"], "1616.00")
        self.assertIn("F0041", premium["ids"])
        self.assertIn("SLF/71007", premium["ids"])

        amount = self.by_type["amount_mismatch"]
        self.assertEqual(amount["ids"], "F0052;SLF/71185")
        self.assertEqual(amount["verdict"], "Honest error")
        self.assertEqual(amount["rs_estimate"], "0.00")
        self.assertIn("1250.00", amount["evidence"])

        unknown = self.by_type["unknown_vehicle"]
        self.assertEqual(unknown["ids"], "SLF/72152")
        self.assertEqual(unknown["rs_estimate"], "3749.34")

        missing = self.by_type["statement_without_register"]
        self.assertEqual(missing["ids"], "SLF/72169")
        self.assertEqual(missing["bus"], "VB-03")
        self.assertEqual(missing["rs_estimate"], "4286.88")
        self.assertIn("Sunday", missing["evidence"])
        self.assertIn("depot", missing["evidence"].lower())

        tank = self.by_type["tank_capacity"]
        self.assertEqual(tank["ids"], "F0078;SLF/71589")
        self.assertEqual(tank["verdict"], "Fraud")
        self.assertEqual(tank["confidence"], "medium")
        self.assertIn("3149.70", tank["evidence"])
        self.assertIn("502 km", tank["evidence"])

        duplicate = self.by_type["duplicate_register_entry"]
        self.assertEqual(duplicate["verdict"], "Honest error")
        self.assertEqual(duplicate["rs_estimate"], "0.00")
        self.assertIn("F0112", duplicate["ids"])
        self.assertIn("SLF/71822", duplicate["ids"])

        holiday = self.by_type["holiday_unreceipted_cash"]
        self.assertEqual(holiday["ids"], "F0111")
        self.assertEqual(holiday["rs_estimate"], "5368.80")
        self.assertIn("Gandhi Jayanti", holiday["evidence"])

        short = self.by_type["short_interval_refill"]
        self.assertEqual(short["ids"], "F0109;SLF/72126")
        self.assertEqual(short["verdict"], "Cannot be verified")

        drop = self.by_type["efficiency_drop"]
        self.assertEqual(drop["bus"], "VB-05")
        self.assertIn("F0076", drop["ids"])
        self.assertIn("not a new route", drop["evidence"])

    def test_cleared_records_are_not_findings(self):
        joined = " ".join(row["ids"] for row in self.report.findings)
        for cleared in ("F0002", "F0044", "F0049", "F0098"):
            self.assertNotIn(cleared, joined)
        notes = " ".join(self.report.notes)
        self.assertIn("F0002", notes)
        self.assertIn("VB-04", notes)
        self.assertIn("347", notes)

    def test_csv_on_disk_matches_a_fresh_run(self):
        path = ROOT / "findings.csv"
        self.assertTrue(path.is_file(), "findings.csv is missing from the project root")
        fresh = ROOT / "findings.fresh.csv"
        try:
            write_findings(fresh, self.report.findings)
            self.assertEqual(path.read_bytes(), fresh.read_bytes())
        finally:
            if fresh.exists():
                fresh.unlink()


class SeededDatasetRuleTests(unittest.TestCase):
    """The same rule functions, pointed at the real rows."""

    @classmethod
    def setUpClass(cls):
        cls.pack = load_pack(data_dir())
        cls.by_id = {entry.entry_id: entry for entry in cls.pack["entries"]}
        cls.buses = {bus.bus_code: bus for bus in cls.pack["buses"]}
        cls.tracks = {bus: BusTrack(pings) for bus, pings in cls.pack["gps"].items()}

    def _context(self, entry_id: str) -> EntryContext:
        entry = self.by_id[entry_id]
        same_bus = sorted(
            (item for item in self.pack["entries"] if item.bus_code == entry.bus_code),
            key=lambda item: item.timestamp,
        )
        previous = None
        for item in same_bus:
            if item.timestamp < entry.timestamp:
                previous = item
        day = entry.timestamp.date()
        pump = self.pack["places"].get(entry.pump_name)
        fixes = []
        track = self.tracks[entry.bus_code]
        window = timedelta(minutes=40)
        for stamp, lat, lng in track.slice(entry.timestamp - window, entry.timestamp + window):
            fixes.append(
                GpsFix(stamp, lat, lng, abs((stamp - entry.timestamp).total_seconds()))
            )
        return EntryContext(
            bus=self.buses[entry.bus_code],
            published_price_rs=self.pack["prices"][day],
            previous=previous,
            is_holiday=day in self.pack["holidays"],
            holiday_name=self.pack["holidays"].get(day),
            is_sunday=day.weekday() == 6,
            pump_lat=None if pump is None else pump[0],
            pump_lng=None if pump is None else pump[1],
            recent_entries=tuple(
                item
                for item in same_bus
                if item.entry_id != entry.entry_id
                and abs((item.timestamp - entry.timestamp).total_seconds()) <= 24 * 3600
            ),
            gps_fixes=tuple(fixes),
        )

    def test_real_rows_hit_the_rules_they_should(self):
        f0078 = codes(evaluate_entry(self.by_id["F0078"], self._context("F0078")))
        self.assertIn("R02_TANK_CAPACITY", f0078)
        self.assertNotIn("R03_AMOUNT_VS_PRICE", f0078)

        f0052 = codes(evaluate_entry(self.by_id["F0052"], self._context("F0052")))
        self.assertIn("R03_AMOUNT_VS_PRICE", f0052)

        f0112 = codes(evaluate_entry(self.by_id["F0112"], self._context("F0112")))
        self.assertIn("R04_DUPLICATE_ENTRY", f0112)

        f0109 = codes(evaluate_entry(self.by_id["F0109"], self._context("F0109")))
        self.assertIn("R05_SHORT_INTERVAL", f0109)
        self.assertNotIn("R08_GPS_FAR_FROM_PUMP", f0109)

        f0111 = codes(evaluate_entry(self.by_id["F0111"], self._context("F0111")))
        self.assertIn("R06_CLOSED_DAY", f0111)
        self.assertIn("R07_CASH_WITHOUT_RECEIPT", f0111)
        self.assertNotIn("R08_GPS_FAR_FROM_PUMP", f0111)

        f0041 = codes(evaluate_entry(self.by_id["F0041"], self._context("F0041")))
        self.assertIn("R03_AMOUNT_VS_PRICE", f0041)


def codes(flags) -> set[str]:
    return {flag.rule_code for flag in flags}


if __name__ == "__main__":
    unittest.main()

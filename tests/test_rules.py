"""Rule tests against the seeded cases named in the team plan.

These tests build the fills in memory. They do not need the CSV pack.
A flag is a review trigger. It is not a verdict, and it does not block a save.
"""

from __future__ import annotations

import unittest
from datetime import datetime

from detection.engine import evaluate_entry
from detection.models import Bus, EntryContext, FuelEntry, GpsFix
from detection.money import round_rs


def entry(**overrides) -> FuelEntry:
    base = dict(
        entry_id="F0001",
        timestamp=datetime(2026, 10, 7, 9, 57),
        bus_code="VB-06",
        litres=110.0,
        amount_rs=9842.80,
        fuel_type="diesel",
        odometer_km=58000,
        payment_mode="credit_account",
        pump_name="Shree Lakshmi Fuels",
        receipt_on_file=True,
        paid_by="College account",
        written_by="Ravi (transport manager)",
    )
    base.update(overrides)
    return FuelEntry(**base)


VB06 = Bus("VB-06", "KA 99 VB 1006", 160, "diesel", "Naveen T")
VB02 = Bus("VB-02", "KA 99 VB 1002", 160, "diesel", "Prakash R")
VB04 = Bus("VB-04", "KA 99 VB 1004", 160, "diesel", "Raghavendra S")
VB08 = Bus("VB-08", "KA 99 VB 1008", 180, "diesel", "Shivakumar B")


def codes(flags) -> set[str]:
    return {flag.rule_code for flag in flags}


class RuleTests(unittest.TestCase):
    def test_ordinary_fill_has_no_flag(self):
        # 110 L at the published price, tank is 160, receipt on file.
        flags = evaluate_entry(
            entry(litres=110.0, amount_rs=round_rs(110.0 * 89.48)),
            EntryContext(bus=VB06, published_price_rs=89.48),
        )
        self.assertEqual(flags, [])

    def test_f0078_capacity_conflict(self):
        previous = entry(
            entry_id="F0067",
            timestamp=datetime(2026, 9, 28, 9, 51),
            odometer_km=57646,
            litres=112.3,
            amount_rs=10048.60,
        )
        current = entry(
            entry_id="F0078",
            litres=195.2,
            amount_rs=17466.50,
            odometer_km=58148,
        )
        flags = evaluate_entry(
            current,
            EntryContext(
                bus=VB06,
                published_price_rs=89.48,
                previous=previous,
                baseline_kmpl=4.58,
            ),
        )
        self.assertIn("R02_TANK_CAPACITY", codes(flags))
        self.assertNotIn("R03_AMOUNT_VS_PRICE", codes(flags))
        tank = next(flag for flag in flags if flag.rule_code == "R02_TANK_CAPACITY")
        self.assertEqual(tank.rs_estimate, 3149.70)
        self.assertTrue(tank.additive_with_same_fill)
        efficiency = next(flag for flag in flags if flag.rule_code == "R09_EFFICIENCY")
        # Tank overflow and the remaining efficiency gap add up to the full gap.
        # They must not be added on top of a second full-gap figure.
        full_gap = round_rs((195.2 - 502 / 4.58) * 89.48)
        self.assertEqual(round_rs(tank.rs_estimate + efficiency.rs_estimate), full_gap)

    def test_f0052_amount_mismatch(self):
        flags = evaluate_entry(
            entry(
                entry_id="F0052",
                timestamp=datetime(2026, 9, 16, 9, 55),
                bus_code="VB-02",
                litres=100.6,
                amount_rs=10251.69,
                odometer_km=59795,
                pump_name="Shree Lakshmi Fuels",
            ),
            EntryContext(bus=VB02, published_price_rs=89.48),
        )
        flag = next(item for item in flags if item.rule_code == "R03_AMOUNT_VS_PRICE")
        self.assertEqual(flag.rs_estimate, 1250.00)
        self.assertIn("statement", flag.reason)

    def test_vb03_price_premium_flags_the_rate_gap(self):
        # SLF/71007: 131.9 L at 93.27 against a published 89.27. The amount matches the inflated rate.
        litres = 131.9
        flags = evaluate_entry(
            entry(
                entry_id="F0041",
                timestamp=datetime(2026, 9, 5, 9, 48),
                bus_code="VB-03",
                litres=litres,
                amount_rs=round_rs(litres * 93.27),
                odometer_km=62788,
            ),
            EntryContext(
                bus=Bus("VB-03", "KA 99 VB 1003", 200, "diesel"),
                published_price_rs=89.27,
            ),
        )
        flag = next(item for item in flags if item.rule_code == "R03_AMOUNT_VS_PRICE")
        self.assertEqual(flag.rs_estimate, 527.60)

    def test_published_price_within_one_rupee_does_not_flag(self):
        flags = evaluate_entry(
            entry(litres=100.0, amount_rs=8948.40),
            EntryContext(bus=VB06, published_price_rs=89.48),
        )
        self.assertNotIn("R03_AMOUNT_VS_PRICE", codes(flags))

    def test_f0112_duplicate(self):
        original = entry(
            entry_id="F0093",
            timestamp=datetime(2026, 10, 19, 10, 0),
            bus_code="VB-04",
            litres=113.8,
            amount_rs=10163.48,
            odometer_km=72634,
        )
        duplicate = entry(
            entry_id="F0112",
            timestamp=datetime(2026, 10, 19, 10, 47),
            bus_code="VB-04",
            litres=113.8,
            amount_rs=10163.48,
            odometer_km=72634,
            written_by="Raghavendra",
        )
        flags = evaluate_entry(
            duplicate,
            EntryContext(
                bus=VB04,
                published_price_rs=89.31,
                previous=original,
                recent_entries=(original,),
            ),
        )
        self.assertIn("R04_DUPLICATE_ENTRY", codes(flags))
        self.assertIn("R10_ODOMETER_NOT_ADVANCING", codes(flags))
        duplicate_flag = next(flag for flag in flags if flag.rule_code == "R04_DUPLICATE_ENTRY")
        self.assertIsNone(duplicate_flag.rs_estimate)
        self.assertIn("not a second purchase", duplicate_flag.reason)

    def test_f0109_short_interval(self):
        morning = entry(
            entry_id="F0083",
            timestamp=datetime(2026, 10, 12, 9, 51),
            bus_code="VB-02",
            litres=114.3,
            amount_rs=10208.13,
            odometer_km=61400,
        )
        afternoon = entry(
            entry_id="F0109",
            timestamp=datetime(2026, 10, 12, 17, 56),
            bus_code="VB-02",
            litres=34.0,
            amount_rs=3036.54,
            odometer_km=61441,
        )
        flags = evaluate_entry(
            afternoon,
            EntryContext(
                bus=VB02,
                published_price_rs=89.31,
                previous=morning,
                baseline_kmpl=4.54,
            ),
        )
        self.assertIn("R05_SHORT_INTERVAL", codes(flags))
        flag = next(item for item in flags if item.rule_code == "R05_SHORT_INTERVAL")
        self.assertGreater(flag.rs_estimate, 2000)
        self.assertLess(flag.rs_estimate, 3036.54)

    def test_f0111_holiday_receipt_and_stale_gps_is_not_a_location_flag(self):
        stale = GpsFix(
            timestamp=datetime(2026, 10, 2, 9, 41),
            lat=13.94990,
            lng=76.19998,
            age_seconds=84 * 60,
        )
        flags = evaluate_entry(
            entry(
                entry_id="F0111",
                timestamp=datetime(2026, 10, 2, 11, 5),
                bus_code="VB-08",
                litres=60.0,
                amount_rs=5368.80,
                odometer_km=47106,
                payment_mode="cash",
                pump_name="Highway Fuel Point",
                receipt_on_file=False,
                written_by="Shivakumar",
            ),
            EntryContext(
                bus=VB08,
                published_price_rs=89.48,
                is_holiday=True,
                holiday_name="Gandhi Jayanti",
                pump_lat=14.021,
                pump_lng=76.318,
                gps_fixes=(stale,),
            ),
        )
        self.assertIn("R06_CLOSED_DAY", codes(flags))
        self.assertIn("R07_CASH_WITHOUT_RECEIPT", codes(flags))
        self.assertNotIn("R08_GPS_FAR_FROM_PUMP", codes(flags))

    def test_fresh_fix_far_from_the_pump_does_flag(self):
        fresh = GpsFix(
            timestamp=datetime(2026, 10, 2, 11, 5),
            lat=13.95,
            lng=76.2,
            age_seconds=0,
        )
        flags = evaluate_entry(
            entry(
                entry_id="F0111",
                timestamp=datetime(2026, 10, 2, 11, 5),
                bus_code="VB-08",
                litres=60.0,
                amount_rs=5368.80,
                payment_mode="cash",
                pump_name="Highway Fuel Point",
                receipt_on_file=False,
            ),
            EntryContext(
                bus=VB08,
                published_price_rs=89.48,
                pump_lat=14.021,
                pump_lng=76.318,
                gps_fixes=(fresh,),
            ),
        )
        self.assertIn("R08_GPS_FAR_FROM_PUMP", codes(flags))

    def test_two_fixes_at_one_timestamp_use_the_one_at_the_pump(self):
        # The F0109 tracker wrote two coordinates for 17:56. One is at the pump.
        at_pump = GpsFix(datetime(2026, 10, 12, 17, 56), 13.95984, 76.20960, 0)
        elsewhere = GpsFix(datetime(2026, 10, 12, 17, 56), 13.95943, 76.31529, 0)
        flags = evaluate_entry(
            entry(entry_id="F0109", timestamp=datetime(2026, 10, 12, 17, 56), bus_code="VB-02"),
            EntryContext(
                bus=VB02,
                pump_lat=13.9598,
                pump_lng=76.2095,
                gps_fixes=(elsewhere, at_pump),
            ),
        )
        self.assertNotIn("R08_GPS_FAR_FROM_PUMP", codes(flags))

    def test_tracker_outage_does_not_flag_gps_against_odometer(self):
        previous = entry(entry_id="F0039", timestamp=datetime(2026, 9, 4, 10, 1), odometer_km=69547)
        current = entry(entry_id="F0049", timestamp=datetime(2026, 9, 11, 9, 55), odometer_km=70076, litres=119.0)
        flags = evaluate_entry(
            current,
            EntryContext(
                bus=VB04,
                published_price_rs=89.27,
                previous=previous,
                gps_distance_km=44.9,
                gps_max_gap_hours=3.0,
                gps_span_hours=9.0,
                interval_hours=168.0,
                gps_ping_count=47,
            ),
        )
        self.assertNotIn("R11_GPS_ODOMETER_GAP", codes(flags))

    def test_continuous_trace_can_flag_a_large_odometer_gap_as_info(self):
        previous = entry(entry_id="A", timestamp=datetime(2026, 10, 1, 10, 0), odometer_km=1000)
        current = entry(entry_id="B", timestamp=datetime(2026, 10, 2, 10, 0), odometer_km=1500, litres=100)
        flags = evaluate_entry(
            current,
            EntryContext(
                bus=VB06,
                published_price_rs=89.48,
                previous=previous,
                gps_distance_km=100,
                gps_max_gap_hours=2,
                gps_span_hours=20,
                interval_hours=24,
                gps_ping_count=80,
            ),
        )
        flag = next(item for item in flags if item.rule_code == "R11_GPS_ODOMETER_GAP")
        self.assertEqual(flag.severity, "info")
        self.assertIsNone(flag.rs_estimate)
        self.assertIn("not", flag.reason.lower())

    def test_wrong_fuel_type(self):
        flags = evaluate_entry(
            entry(fuel_type="petrol"),
            EntryContext(bus=VB06, published_price_rs=89.48),
        )
        self.assertIn("R01_FUEL_TYPE", codes(flags))

    def test_reasons_do_not_call_anyone_guilty(self):
        previous = entry(entry_id="F0067", timestamp=datetime(2026, 9, 28, 9, 51), odometer_km=57646)
        flags = evaluate_entry(
            entry(entry_id="F0078", litres=195.2, amount_rs=17466.50, odometer_km=58148),
            EntryContext(bus=VB06, published_price_rs=89.48, previous=previous, baseline_kmpl=4.58),
        )
        for flag in flags:
            self.assertNotIn("guilty", flag.reason.lower())
            self.assertNotIn("fraud confirmed", flag.reason.lower())


if __name__ == "__main__":
    unittest.main()

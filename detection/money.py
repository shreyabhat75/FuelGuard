"""Rupee rounding. Half-up, two decimal places, the way a bill is rounded."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


def round_rs(value: float) -> float:
    quantized = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(quantized)


def rs_text(value: float) -> str:
    return f"{round_rs(value):.2f}"

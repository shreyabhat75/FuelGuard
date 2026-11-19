"""Detection rules for a fuel fill.

A rule returns a flag. It never rejects the save. Person 2 can call
``evaluate_entry`` after a fill is stored and persist whatever comes back.

Flags on the same fill can describe one event from two sides. Add their
rupee estimates only when a flag says ``additive_with_same_fill`` is true.
"""

from detection.engine import evaluate_entry
from detection.models import Bus, EntryContext, Flag, FuelEntry, GpsFix
from detection.reconcile import reconcile_credit_account

__all__ = [
    "Bus",
    "EntryContext",
    "Flag",
    "FuelEntry",
    "GpsFix",
    "evaluate_entry",
    "reconcile_credit_account",
]

"""Run every entry rule. Saving the fill is the caller's job, before this runs."""

from __future__ import annotations

from detection.models import EntryContext, Flag, FuelEntry
from detection.rules import ENTRY_RULES


def evaluate_entry(entry: FuelEntry, context: EntryContext | None = None) -> list[Flag]:
    """Return the flags for one fill. An empty list means nothing to review.

    This function does not raise when a rule fires, and it does not decide
    whether the fill may be stored.
    """
    ctx = context or EntryContext()
    flags: list[Flag] = []
    for rule in ENTRY_RULES:
        flag = rule(entry, ctx)
        if flag is not None:
            flags.append(flag)
    return flags

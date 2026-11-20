"""Distance and pump-proximity helpers over one bus's ping list."""

from __future__ import annotations

import bisect
from datetime import datetime, timedelta

from detection.haversine import haversine_km
from detection.thresholds import GPS_TELEPORT_KM


class BusTrack:
    def __init__(self, pings: list[tuple[datetime, float, float]]):
        self.pings = pings
        self.times = [ping[0] for ping in pings]

    def slice(self, start: datetime, end: datetime) -> list[tuple[datetime, float, float]]:
        left = bisect.bisect_left(self.times, start)
        right = bisect.bisect_right(self.times, end)
        return self.pings[left:right]

    def path(self, start: datetime, end: datetime) -> dict:
        """Sum the trace from start to end. A zero-time teleport is not added."""
        points = self.slice(start, end)
        distance = 0.0
        max_gap_h = 0.0
        teleports = 0
        for (t0, lat0, lng0), (t1, lat1, lng1) in zip(points, points[1:]):
            gap_h = (t1 - t0).total_seconds() / 3600
            step = haversine_km(lat0, lng0, lat1, lng1)
            if gap_h * 3600 <= 1 and step > GPS_TELEPORT_KM:
                teleports += 1
                continue
            distance += step
            if gap_h > max_gap_h:
                max_gap_h = gap_h
        span_h = 0.0
        if len(points) >= 2:
            span_h = (points[-1][0] - points[0][0]).total_seconds() / 3600
        return {
            "pings": len(points),
            "km": distance,
            "max_gap_hours": max_gap_h if len(points) >= 2 else None,
            "span_hours": span_h,
            "teleports": teleports,
        }

    def nearest(self, moment: datetime, window: timedelta):
        if not self.pings:
            return None
        index = bisect.bisect_left(self.times, moment)
        best = None
        for probe in (index - 1, index, index + 1):
            if probe < 0 or probe >= len(self.pings):
                continue
            stamp, lat, lng = self.pings[probe]
            age = abs((stamp - moment).total_seconds())
            if best is None or age < best[0]:
                best = (age, stamp, lat, lng)
        if best is None or best[0] > window.total_seconds():
            return None
        return best

    def day_min_km(self, day, lat: float, lng: float) -> tuple[int, float | None]:
        count, nearest, _ = self.day_distance_range(day, lat, lng)
        return count, nearest

    def day_distance_range(self, day, lat: float, lng: float) -> tuple[int, float | None, float | None]:
        start = datetime(day.year, day.month, day.day)
        points = self.slice(start, start + timedelta(days=1) - timedelta(seconds=1))
        if not points:
            return 0, None, None
        distances = [haversine_km(lat_p, lng_p, lat, lng) for _, lat_p, lng_p in points]
        return len(points), min(distances), max(distances)

    def longest_gap(self) -> tuple[datetime, datetime, float] | None:
        best = None
        for (t0, _, _), (t1, _, _) in zip(self.pings, self.pings[1:]):
            hours = (t1 - t0).total_seconds() / 3600
            if best is None or hours > best[2]:
                best = (t0, t1, hours)
        return best

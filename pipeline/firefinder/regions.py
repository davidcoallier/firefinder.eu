"""Study region definitions."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    # (min_lon, min_lat, max_lon, max_lat)
    bbox: tuple[float, float, float, float]


# Iberia + southern France. Covers the catastrophic 2017 and 2022 fire seasons.
EU_SOUTHWEST = Region(
    id="eu-southwest",
    name="Iberia & Southern France",
    bbox=(-9.6, 36.0, 7.2, 46.0),
)

# Phase 2: adds CPUC ignitions, EAGLE-I outages, HIFLD lines.
US_CALIFORNIA = Region(
    id="us-california",
    name="California",
    bbox=(-124.5, 32.5, -114.1, 42.0),
)

# Small pilot AOI inside eu-southwest for fast iteration before scaling up:
# Portugal + Galicia, the most fire-dense corner of Europe.
PILOT_PORTUGAL_GALICIA = Region(
    id="pilot-pt-galicia",
    name="Portugal & Galicia (pilot)",
    bbox=(-9.6, 36.8, -6.0, 43.8),
)

ALL_REGIONS = [EU_SOUTHWEST, US_CALIFORNIA]

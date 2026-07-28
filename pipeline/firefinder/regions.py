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

# Demo slice: central Portugal — Pedrógão Grande (2017) and Serra da Estrela (2022)
# fire country. Small enough to process end-to-end on a laptop.
PT_CENTRO = Region(
    id="pt-centro",
    name="Central Portugal",
    bbox=(-8.8, 39.0, -7.0, 41.0),
)

ALL_REGIONS = [EU_SOUTHWEST, US_CALIFORNIA, PT_CENTRO]


def get(region_id: str) -> Region:
    for r in ALL_REGIONS + [PILOT_PORTUGAL_GALICIA]:
        if r.id == region_id:
            return r
    raise KeyError(f"unknown region: {region_id}")

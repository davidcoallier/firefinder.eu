"""Load pipeline outputs into Supabase (PostGIS)."""

import json

import geopandas as gpd
import h3
import pandas as pd
import psycopg
from shapely.geometry import Polygon

from firefinder import regions
from firefinder.aoi import cells_for_region
from firefinder.config import DATA_DIR, settings


def _conn():
    return psycopg.connect(settings.database_url)


def _cell_polygon(cell: str) -> Polygon:
    return Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(cell)])


def load_static(region: str):
    """Region row, cells with static features, line segments, fire events."""
    reg = regions.get(region)
    proc_dir = DATA_DIR / "processed" / reg.id
    w, s, e, n = reg.bbox
    terrain = pd.read_parquet(proc_dir / "terrain.parquet").set_index("h3")
    segs = gpd.read_parquet(proc_dir / "segments.parquet")
    fires = gpd.read_parquet(proc_dir / "fires.parquet")

    from firefinder.features.build import _cell_centroids, _dist_to_powerline

    dist = _dist_to_powerline(_cell_centroids(cells_for_region(reg)), proc_dir).set_index("h3")

    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """insert into regions (id, name, bbox)
               values (%s, %s, st_makeenvelope(%s, %s, %s, %s, 4326))
               on conflict (id) do nothing""",
            (reg.id, reg.name, w, s, e, n),
        )

        cur.execute(
            "delete from cell_scores where h3 in (select h3 from cells where region_id = %s)",
            (reg.id,),
        )
        cur.execute("delete from cells where region_id = %s", (reg.id,))
        cur.executemany(
            """insert into cells (h3, region_id, geom, elevation_m, slope_deg, dist_powerline_m)
               values (%s, %s, st_geomfromtext(%s, 4326), %s, %s, %s)""",
            [
                (
                    c, reg.id, _cell_polygon(c).wkt,
                    _f(terrain, c, "elevation_m"), _f(terrain, c, "slope_deg"),
                    _f(dist, c, "dist_powerline_m"),
                )
                for c in cells_for_region(reg)
            ],
        )

        cur.execute(
            "delete from segment_scores where segment_id in "
            "(select id from line_segments where region_id = %s)",
            (reg.id,),
        )
        cur.execute("delete from line_segments where region_id = %s", (reg.id,))
        cur.executemany(
            """insert into line_segments
               (region_id, osm_way_ids, voltage_kv, operator, length_m, locality, geom)
               values (%s, %s, %s, %s, %s, %s, st_geomfromtext(%s, 4326))""",
            [
                (
                    reg.id, [int(r.osm_way_id)],
                    None if pd.isna(r.voltage_kv) else float(r.voltage_kv),
                    r.operator, float(r.length_m),
                    getattr(r, "locality", None), r.geometry.wkt,
                )
                for r in segs.itertuples()
            ],
        )

        cur.execute("delete from fire_events where region_id = %s", (reg.id,))
        cur.executemany(
            """insert into fire_events (region_id, source, event_date, area_ha, geom)
               values (%s, %s, %s, %s, st_geomfromtext(%s, 4326))""",
            [
                (
                    reg.id, r.source, r.event_date,
                    None if pd.isna(_num(r.area_ha)) else _num(r.area_ha),
                    r.geometry.wkt,
                )
                for r in fires.itertuples()
            ],
        )
    print(f"loaded static data for {reg.id}: {len(segs)} segments, {len(fires)} fires")


def _f(df, key, col):
    try:
        v = df.at[key, col]
        return None if pd.isna(v) else float(v)
    except KeyError:
        return None


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("nan")


def write_cell_scores(region_id: str, week, rows, model_version: str):
    """rows: iterable of (h3, p_ignition, drivers_dict)."""
    with _conn() as conn, conn.cursor() as cur:
        cur.executemany(
            """insert into cell_scores (h3, week, p_ignition, drivers, model_version)
               values (%s, %s, %s, %s, %s)
               on conflict (h3, week) do update
                 set p_ignition = excluded.p_ignition, drivers = excluded.drivers,
                     model_version = excluded.model_version""",
            [(h, week, float(p), json.dumps(d), model_version) for h, p, d in rows],
        )


def write_segment_scores(region_id: str, week, rows, model_version: str):
    """rows: iterable of (segment_db_id, risk, rank, drivers_dict)."""
    with _conn() as conn, conn.cursor() as cur:
        cur.executemany(
            """insert into segment_scores (segment_id, week, risk, rank_in_region, drivers, model_version)
               values (%s, %s, %s, %s, %s, %s)
               on conflict (segment_id, week) do update
                 set risk = excluded.risk, rank_in_region = excluded.rank_in_region,
                     drivers = excluded.drivers, model_version = excluded.model_version""",
            [(int(i), week, float(r), int(k), json.dumps(d), model_version) for i, r, k, d in rows],
        )


def segment_ids(region_id: str) -> gpd.GeoDataFrame:
    """DB segment ids + geometry, so scoring joins against real primary keys."""
    with _conn() as conn:
        return gpd.read_postgis(
            "select id, geom from line_segments where region_id = %s",
            conn, params=(region_id,), geom_col="geom", crs="EPSG:4326",
        )

"""Daily refresh: top up dynamic data and rescore the latest week.

Designed for a scheduled CI runner — everything static (terrain, grid,
composites for past months, the trained model) is reused; only the
current-month composite, recent weather, fire labels and scores change.
"""

import pandas as pd

from firefinder import db, regions
from firefinder.config import DATA_DIR


def run(region: str):
    reg = regions.get(region)
    proc_dir = DATA_DIR / "processed" / reg.id
    today = pd.Timestamp.utcnow().tz_localize(None).normalize()

    # 1. fire labels: full refetch, it's one fast WFS call
    (proc_dir / "fires.parquet").unlink(missing_ok=True)
    from firefinder.ingest import fires

    fires.run(region)

    # 2. weather: append missing days
    from firefinder.ingest import weather

    weather.update(region)

    # 3. current-month composite (and last month's during the first days,
    #    when late scenes may still have been missing)
    from firefinder.ingest import sentinel2

    months = {today.strftime("%Y-%m")}
    if today.day <= 5:
        months.add((today - pd.offsets.MonthBegin(1)).strftime("%Y-%m"))
    for month in sorted(months):
        (proc_dir / f"veg_{month}.parquet").unlink(missing_ok=True)
        sentinel2.run(region, month, month)

    # 4. rebuild features, score the latest complete week
    from firefinder.features import build

    build.run(region)
    feats = pd.read_parquet(proc_dir / "features.parquet", columns=["week"])
    latest = feats["week"].max()

    from firefinder.scoring import score

    score.run(region, latest.strftime("%Y-%m-%d"))

    # 5. keep fire_events current in the DB (cells/segments are static)
    with db._conn() as conn, conn.cursor() as cur:
        cur.execute("delete from fire_events where region_id = %s", (reg.id,))
    import geopandas as gpd

    fdf = gpd.read_parquet(proc_dir / "fires.parquet")
    with db._conn() as conn, conn.cursor() as cur:
        cur.executemany(
            """insert into fire_events (region_id, source, event_date, area_ha, geom)
               values (%s, %s, %s, %s,
                       st_simplifypreservetopology(st_geomfromtext(%s, 4326), 0.0005))""",
            [
                (
                    reg.id, r.source, r.event_date,
                    None if pd.isna(db._num(r.area_ha)) else db._num(r.area_ha),
                    r.geometry.wkt,
                )
                for r in fdf.itertuples()
            ],
        )
    print(f"refresh done: {reg.id}, scored week {latest.date()}")

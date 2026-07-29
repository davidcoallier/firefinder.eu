"""Firefinder pipeline CLI.

Usage:
    firefinder ingest sentinel2 --region pilot-pt-galicia --start 2021-01 --end 2022-12
    firefinder ingest fires --region pilot-pt-galicia
    firefinder ingest weather --region pilot-pt-galicia
    firefinder ingest grid --region pilot-pt-galicia
    firefinder features build --region pilot-pt-galicia
    firefinder train --region pilot-pt-galicia --test-year 2022
    firefinder score --region pilot-pt-galicia --week 2022-07-11
"""

import typer

app = typer.Typer(no_args_is_help=True, help="Firefinder data + ML pipeline")
ingest_app = typer.Typer(no_args_is_help=True, help="Data ingestion")
features_app = typer.Typer(no_args_is_help=True, help="Feature engineering")
app.add_typer(ingest_app, name="ingest")
app.add_typer(features_app, name="features")


@ingest_app.command("sentinel2")
def ingest_sentinel2(region: str, start: str, end: str):
    """Search CDSE, download Sentinel-2 L2A, cloud-mask, build monthly composites."""
    from firefinder.ingest import sentinel2

    sentinel2.run(region=region, start=start, end=end)


@ingest_app.command("fires")
def ingest_fires(region: str):
    """Pull EFFIS burnt areas + FIRMS detections as labels."""
    from firefinder.ingest import fires

    fires.run(region=region)


@ingest_app.command("weather")
def ingest_weather(region: str):
    """Pull ERA5 weekly weather aggregates via CDS API."""
    from firefinder.ingest import weather

    weather.run(region=region)


@ingest_app.command("grid")
def ingest_grid(region: str):
    """Extract OSM power lines from Geofabrik, segment into corridors."""
    from firefinder.ingest import grid

    grid.run(region=region)


@ingest_app.command("terrain")
def ingest_terrain(region: str):
    """Copernicus DEM GLO-30 elevation + slope, ESA WorldCover land cover."""
    from firefinder.ingest import terrain

    terrain.run(region=region)


@features_app.command("build")
def features_build(region: str):
    """Assemble the H3 cell-week feature table."""
    from firefinder.features import build

    build.run(region=region)


@app.command()
def refresh(region: str):
    """Daily incremental refresh: recent weather + current composite + rescore."""
    from firefinder import refresh as refresh_mod

    refresh_mod.run(region)


@app.command("export-grid")
def export_grid(region: str):
    """Export the full grid network as a static geojson context layer for the web app."""
    from firefinder import export

    export.grid_geojson(region)


@app.command("db-load")
def db_load(region: str):
    """Load regions, cells, line segments and fire events into Supabase."""
    from firefinder import db

    db.load_static(region)


@app.command()
def train(region: str, test_year: int = 2024):
    """Train XGBoost ignition model, backtest on held-out year."""
    from firefinder.models import train as train_mod

    train_mod.run(region=region, test_year=test_year)


@app.command()
def score(region: str, week: str):
    """Score cells + line segments for a week, write to Supabase."""
    from firefinder.scoring import score as score_mod

    score_mod.run(region=region, week=week)


if __name__ == "__main__":
    app()

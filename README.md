# Firefinder

Wildfire and grid-corridor risk forecasting from public satellite imagery and open data.

Every ~1km cell in the study area gets a weekly ignition probability, built from a raw
Sentinel-2 processing pipeline, ERA5 weather, terrain, and land cover — backtested against
real fire seasons. Cell risk is then aggregated onto power line corridors (OSM) so the
output isn't "this area is risky" but "these corridors are the riskiest this week, and here's why."

**Regions:** Iberia + southern France first, California second (adds CPUC utility ignition
reports and EAGLE-I outage history — the utility-crisis layer that has no public European
equivalent).

## Architecture

```
pipeline/   Python 3.12 — ingestion, feature engineering, ML, scoring (batch, offline)
supabase/   PostGIS schema + local dev stack (ports 55420-55429)
web/        Next.js + MapLibre/deck.gl — reads precomputed scores, no live inference
data/       Local raster/parquet store (gitignored)
```

Data flow: `pipeline` downloads raw sources → builds H3 cell-week features → trains/scores →
writes `cell_scores` + `segment_scores` to Supabase and emits PMTiles → `web` renders.

## Data sources (all free)

| Source | What | Access |
|---|---|---|
| Sentinel-2 L2A (CDSE) | NDVI/NDMI monthly composites, own cloud masking | OAuth client |
| EFFIS + NASA FIRMS | Fire labels (burnt areas, active fire detections) | FIRMS map key |
| ERA5 (CDS) | Wind, temp, humidity, precip | CDS API key |
| OSM (Geofabrik) | Power line geometry | none |
| Copernicus DEM GLO-30 | Elevation, slope | none |
| ESA WorldCover | Land cover / fuel proxy | none |

## Local dev

```sh
# Supabase (runs on 55421 API / 55422 DB / 55423 Studio — no clashes with other local stacks)
npx supabase start

# Pipeline
cd pipeline && source .venv/bin/activate
cp .env.example .env   # then fill in API keys
firefinder --help

# Web
cd web && pnpm dev
```

## Model

XGBoost on H3 res-7 cell-weeks; labels from EFFIS/FIRMS; trained through 2021, backtested
on the 2022 European fire season. Reported as PR-AUC + calibration (ignition is a rare
event — accuracy would be meaningless). SHAP values are stored per cell and drive the UI's
risk decomposition, from plain-language for public-sector users down to full feature
attribution for analysts.

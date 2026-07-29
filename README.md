# Firefinder

**Weekly wildfire ignition risk along power-grid corridors, built entirely from
free, public, keyless data.**

Trees and brush touching power lines are one of the leading causes of both
catastrophic wildfires and large-scale outages. Utilities and civil-protection
teams need to know *which corridors to worry about this week*, not just which
regions are generally fire-prone. Firefinder answers that question: every ~1km
cell of a country gets a weekly ignition probability from satellite imagery,
weather, terrain and fuel data, and that risk is aggregated onto every power
line corridor in the national grid, ranked, and explained in plain language.

- **Simple mode** is built for a public-sector user: a map, this week's top-risk
  corridors by town name, and a plain-English answer to "why is this corridor
  risky" ("Patches of very dry vegetation", "High winds this week").
- **Advanced mode** exposes the machinery: layer toggles, risk thresholds, full
  signed feature attributions per cell and corridor, historical fire perimeters.
- **Live fires**: NASA FIRMS satellite detections from the last 24 hours as a
  toggleable overlay, with per-detection fire power, satellite and confidence.

Current coverage: **Portugal and Spain** (live), France (pipeline ready, same
config-driven machinery). California is planned. It adds public utility
ignition reports (CPUC) and outage history (EAGLE-I) that have no European
public equivalent.

## How it works

```
            ┌──────────────── batch pipeline (Python) ────────────────┐
 Sentinel-2 ─┤ raw scenes → cloud mask → monthly NDVI/NDMI composites │
 ERA5/POWER ─┤ daily weather → weekly aggregates + drought trailing   │──► features
 EFFIS ──────┤ burnt-area perimeters → cell-week ignition labels      │   (H3 cell-weeks)
 OSM ────────┤ power lines → 5km corridor segments + nearest town     │        │
 DEM/ESA WC ─┤ elevation, slope, land-cover fractions                 │     XGBoost
            └──────────────────────────────────────────────────────────┘        │
                                                                                ▼
                       Supabase (PostGIS) ◄── weekly scores + SHAP drivers ── scoring
                              │                                    (cells → corridors)
                              ▼
                  Next.js + MapLibre + deck.gl (Vercel)
```

The analysis grid is **H3 resolution 7** (~5 km² hexagons), clipped to the
actual country polygon, not a bounding-box rectangle. All raster sources are
warped onto a common ~200m grid per region, then aggregated per hexagon.

## Data sources

Everything is public and keyless. No accounts, tokens or paid tiers anywhere in
the pipeline.

| Source | What we take | Native resolution | Refresh in Firefinder |
|---|---|---|---|
| [Sentinel-2 L2A](https://registry.opendata.aws/sentinel-2-l2a-cogs/) (ESA, via AWS Open Data / Earth Search STAC) | Raw B04/B08/B11 reflectance + scene classification; own cloud masking; monthly NDVI (greenness) and NDMI (moisture) composites | 10-20 m | Current month recomposited daily |
| [ERA5 via Open-Meteo](https://open-meteo.com/) (primary), [NASA POWER](https://power.larc.nasa.gov/) (fallback) | Daily max temperature, min relative humidity, max wind + gusts, precipitation, ET0 on a 0.25-0.5 degree grid | ~25-50 km | New days appended daily |
| [EFFIS](https://forest-fire.emergency.copernicus.eu/) burnt-area perimeters (Copernicus) | Fire polygons with dates: the training labels and the historical-fires layer | per-fire polygons, 2016 to present | Refetched daily |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) VIIRS active fires (Suomi NPP + NOAA-20) | Live fire detections with fire radiative power and confidence | 375 m, ~3 h latency | Every 15 min in the app |
| [OpenStreetMap](https://www.geofabrik.de/) power lines (Geofabrik extracts) | Transmission + distribution line geometry, voltage, operator; split into corridor segments of up to 5 km, named by nearest town | vector | Static (re-ingest on demand) |
| [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/) | Elevation and derived slope | 30 m | Static |
| [ESA WorldCover 2021](https://esa-worldcover.org/) | Land-cover fractions (tree / shrub / grass / crop / built-up) as fuel proxies | 10 m | Static |

## The model

**Task.** For every H3 cell and week of the April-October fire season, predict
the probability that a fire ignites in that cell that week. Labels come from
EFFIS perimeters (a cell-week is positive if a perimeter with that fire date
touches the cell). Ignition is a rare event with a base rate of ~0.1-0.15%,
which drives every modelling and evaluation choice below.

**Features (21).** Vegetation state from the latest monthly composite *before*
the scored week (using the same month would leak the post-fire NDVI drop):
mean and 10th-percentile NDVI, NDMI, NDVI anomaly vs the cell's own monthly
climatology. Fire weather for the week: max temperature, min relative humidity,
max wind and gusts, precipitation, ET0, plus 30- and 90-day trailing
precipitation as drought proxies. Static: elevation, slope, land-cover
fractions, distance to the nearest power line, and seasonality encodings.

**Model.** Gradient-boosted trees (XGBoost, 400 trees, depth 6) with class
weighting for the extreme imbalance. Deliberately not a deep model first: on
tabular cell-week features, boosted trees are a very strong baseline, train in
minutes on a laptop, and their SHAP attributions power the app's plain-language
"why is this risky" explanations directly. A spatiotemporal deep model is the
natural next experiment, and the honest bar it has to beat is below.

**Evaluation: temporal holdout, no shuffling.** Train on seasons through 2023,
evaluate on 2024-2026. Random splits would leak (neighbouring weeks are nearly
identical); only forward-in-time evaluation says anything about forecasting.
Portugal, held-out years:

| Test year | ROC-AUC | PR-AUC | Positives |
|---|---|---|---|
| 2024 | 0.82 | 0.005 | 641 |
| 2025 | 0.88 | 0.035 | 959 |
| 2026 (partial) | 0.79 | 0.004 | 251 |
| **All (2024-26)** | **0.85** | **0.014** | 1,851 |

Read PR-AUC against the 0.15% base rate: 0.014 is roughly 10x lift over random,
and 2025, the big fire season, is where the model is strongest. Accuracy is not
reported because it is meaningless at this base rate. Calibration tables ship
with each model in `pipeline/models/<region>/metrics.json`. After evaluation
the model is refit on all data for live scoring.

Spain (16.5M cell-weeks, base rate 0.04%): held-out ROC-AUC **0.86**, PR-AUC
0.0099, roughly 26x lift over random, consistent across 2024-2026.

**Corridor scoring.** Cells within 500 m of a line segment contribute to that
corridor: `risk = 0.65 * max(p) + 0.35 * mean(p)`. A corridor through one
severe cell matters more than one through many mild ones. Corridors are ranked
nationally per week, and each carries the SHAP drivers of its riskiest cell.

**Known limitations, stated plainly.** Weekly weather is observed, not
forecast; a production system would swap in NWP forecasts, and backtests are
unaffected. EFFIS labels are MODIS-derived and miss some small fires. Risk is
wildfire ignition risk *near* corridors, not a prediction that a power line
causes ignition. Europe has no public equivalent of California's CPUC
equipment-ignition reports, which is exactly what the planned California phase
adds.

## Refresh cadence

| What | When | How |
|---|---|---|
| Cell + corridor scores | Daily, 05:00 UTC | GitHub Actions cron runs `firefinder refresh <region>`: append weather days, recomposite current month, rebuild features, score the latest complete week |
| Live fire detections | Every 15 min while the app is open | App API route over FIRMS 24h feeds |
| Historical fire perimeters | Daily | Part of the refresh |
| Grid geometry, terrain, land cover | Static | Re-ingest on demand |
| Model retraining | Manual, after each season | `firefinder train <region>`, model committed to the repo |

## Repository layout

```
pipeline/   Python 3.12: ingestion, features, training, scoring, refresh (Typer CLI)
supabase/   PostGIS schema + read-API functions, local stack config
web/        Next.js + MapLibre GL + deck.gl frontend
data/       Local raster/parquet store (gitignored; CI bootstraps from a release seed)
```

## Running it locally

```sh
# database (Supabase local, ports 55421-55429)
npx supabase start

# pipeline
cd pipeline && python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/firefinder --help

# full build for a region (hours; resumable, rerun after any failure)
./pipeline/scripts/run_region.sh portugal

# app
cd web && pnpm install && pnpm dev
```

Deployment (hosted Supabase + Vercel + the Actions cron) is documented in
[DEPLOY.md](DEPLOY.md).

## Roadmap

- Spain and France scoring (pipeline ready; a region is ~30 lines of config)
- California: CPUC utility ignition reports + EAGLE-I outage history for a true
  utility-crisis layer, CAL FIRE perimeters as labels
- NWP forecast weather in place of observed weather for true forward scoring
- Deep spatiotemporal model vs the XGBoost baseline, honestly compared

# Deploying Firefinder

Three moving parts: a hosted Supabase project (the database), Vercel (the web
app), and a GitHub Actions cron (the daily data refresh). One-time setup below,
then everything is self-sustaining.

## 1. Hosted Supabase

Create a project at supabase.com, then from the repo root:

```sh
npx supabase link --project-ref <project-ref>
npx supabase db push                     # applies every migration in supabase/migrations
```

Load the data from your machine into the hosted DB. Use the **Session pooler**
connection string (dashboard → Connect → Session pooler), NOT the direct
`db.<ref>.supabase.co` host: new projects resolve the direct host to IPv6 only,
which fails on many networks with "failed to resolve host". URL-encode special
characters in the password (`#` → `%23`, `&` → `%26`, `^` → `%5E`, `@` → `%40`)
and keep the whole URL in single quotes so zsh leaves the `%` signs alone.

```sh
export DATABASE_URL='postgresql://postgres.<ref>:<encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
BIN=pipeline/.venv/bin/firefinder

# Portugal: static data (cells, segments, fire events), then the score weeks.
# db-load wipes and reloads the region INCLUDING its scores, so always rescore
# every week after a db-load. score is an upsert, safe to re-run any time.
$BIN db-load portugal
$BIN score portugal 2026-07-20
$BIN score portugal 2026-07-13
$BIN score portugal 2025-08-11

# Spain: same sequence
$BIN db-load spain
$BIN score spain 2026-07-20
$BIN score spain 2026-07-13
$BIN score spain 2025-08-11

# France: same sequence
$BIN db-load france
$BIN score france 2026-07-20
$BIN score france 2026-07-13
$BIN score france 2025-08-11

# after the first load, a single daily command per region keeps the DB current
# (fires + weather + current composite + rescore latest week); CI runs this too
$BIN refresh portugal
$BIN refresh spain
```

None of these duplicate data: `db-load` deletes the region's rows before
reinserting, and `score`/`refresh` upsert on conflict.

## 2. Vercel

Import the GitHub repo in Vercel with:

- **Root directory**: `web`
- **Environment variables**:
  - `NEXT_PUBLIC_SUPABASE_URL`: `https://<project-ref>.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the anon/publishable key from the Supabase dashboard

Nothing else: the app is read-only against the DB, live fires go through the
app's own `/api/live-fires` route, and the grid context layers are static files
in `web/public/basemap/` that deploy with the app.

## 3. Daily refresh (GitHub Actions)

The workflow is `.github/workflows/refresh.yml`: daily at 05:00 UTC plus a
manual "Run workflow" button. Per run and region it: refetches fire labels,
appends missing weather days, rebuilds the current month's satellite composite,
rebuilds features, scores the latest complete week, and writes to the DB.
Models are committed in `pipeline/models/<region>/` so CI never retrains.

One-time wiring after pushing the repo to GitHub:

```sh
# seed the historical data CI starts from (uploads to a "seed-data" release)
./pipeline/scripts/pack_seed.sh portugal

# give CI the hosted DB connection string
gh secret set DATABASE_URL
```

Historical data then persists between runs in the Actions cache; the release
seed is only used when the cache is cold (first run, or after about a week of
failed or missing runs; cache entries expire after 7 days of no access).

### Adding a region to the schedule

1. Run its full pipeline locally: `./pipeline/scripts/run_spain.sh`
2. Load + score it against the hosted DB (step 1 commands, swap region id)
3. `./pipeline/scripts/pack_seed.sh spain`
4. Add it to the matrix in `.github/workflows/refresh.yml`:
   `region: [portugal, spain]`
5. Commit the model that the pipeline wrote to `pipeline/models/spain/`

Watch the first scheduled run in the Actions tab. Known risk at Spain/France
scale: the feature rebuild is ~20M rows and standard runners have 7GB RAM: if
a run OOMs, move that region to a larger runner
(`runs-on: ubuntu-latest-4-cores` on a paid plan) or ping Claude to chunk the
rebuild further.

## Retraining

CI only scores. Retrain when a season ends or coverage changes:

```sh
pipeline/.venv/bin/firefinder train <region>   # writes pipeline/models/<region>/
git add pipeline/models/<region> && git commit -m "Retrain <region>"
```

`metrics.json` next to the model records the holdout evaluation for the readme.

## Rotating / revoking

- DB password: rotate in Supabase dashboard → update the `DATABASE_URL` secret
  (GitHub): Vercel only holds the anon key, which is safe to expose.
- All upstream data sources are keyless (Earth Search, EFFIS, Open-Meteo,
  NASA POWER, FIRMS public CSVs, Geofabrik): nothing to rotate there.

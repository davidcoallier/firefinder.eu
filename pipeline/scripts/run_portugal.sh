#!/bin/zsh
# Full-country Portugal pipeline: ingest everything, train, load, score.
set -e
cd "$(dirname "$0")/.."
BIN=.venv/bin/firefinder
LOG_DIR=../data/interim/portugal
mkdir -p "$LOG_DIR"

(
  for y in 2020 2021 2022 2023 2024 2025; do
    $BIN ingest sentinel2 portugal $y-04 $y-10
  done
  $BIN ingest sentinel2 portugal 2026-04 2026-07
) > "$LOG_DIR/sentinel.log" 2>&1 &
S_PID=$!

$BIN ingest weather portugal > "$LOG_DIR/weather.log" 2>&1 &
W_PID=$!

$BIN ingest terrain portugal
$BIN ingest grid portugal
$BIN ingest fires portugal

wait $S_PID
wait $W_PID
echo "=== ingestion complete ==="

$BIN features build portugal
$BIN train portugal

# pt-centro cells overlap portugal's (same H3 ids) — clear the pilot before loading
docker exec supabase_db_firefinder psql -U postgres -q -c "
  delete from cell_scores where h3 in (select h3 from cells where region_id = 'pt-centro');
  delete from segment_scores where segment_id in (select id from line_segments where region_id = 'pt-centro');
  delete from cells where region_id = 'pt-centro';
  delete from line_segments where region_id = 'pt-centro';
  delete from fire_events where region_id = 'pt-centro';
  delete from regions where id = 'pt-centro';
"
$BIN db-load portugal
for wk in 2026-07-20 2026-07-13 2025-08-11; do
  $BIN score portugal $wk
done
$BIN export-grid portugal
echo "=== portugal pipeline done ==="

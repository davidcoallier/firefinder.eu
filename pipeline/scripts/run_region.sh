#!/bin/zsh
# Full pipeline for one region: ingest -> features -> train -> load -> score -> export.
# Usage: run_region.sh <region-id>   (e.g. spain, france)
set -e
REGION="${1:?usage: run_region.sh <region-id>}"
cd "$(dirname "$0")/.."
BIN=.venv/bin/firefinder
LOG_DIR="../data/interim/$REGION"
mkdir -p "$LOG_DIR"

echo "=== $REGION: ingestion ==="
(
  for y in 2020 2021 2022 2023 2024 2025; do
    $BIN ingest sentinel2 "$REGION" $y-04 $y-10
  done
  $BIN ingest sentinel2 "$REGION" 2026-04 2026-07
) > "$LOG_DIR/sentinel.log" 2>&1 &
S_PID=$!

$BIN ingest weather "$REGION" > "$LOG_DIR/weather.log" 2>&1 &
W_PID=$!

$BIN ingest terrain "$REGION"
$BIN ingest grid "$REGION"
$BIN ingest fires "$REGION"

wait $S_PID
wait $W_PID
echo "=== $REGION: ingestion complete ==="

$BIN features build "$REGION"
$BIN train "$REGION"
$BIN db-load "$REGION"
for wk in 2026-07-20 2026-07-13 2025-08-11; do
  $BIN score "$REGION" $wk
done
$BIN export-grid "$REGION"
echo "=== $REGION pipeline done ==="
echo "Reload the app — the $REGION jurisdiction lights up automatically."

#!/bin/zsh
# Pack a region's processed data as the CI seed and upload it to the
# "seed-data" GitHub release. Usage: pack_seed.sh <region-id>
set -e
REGION="${1:?usage: pack_seed.sh <region-id>}"
cd "$(dirname "$0")/../.."

tar czf "seed-$REGION.tar.gz" \
  "data/processed/$REGION" \
  data/interim/"$REGION"/h3_grid_*.npy 2>/dev/null || \
tar czf "seed-$REGION.tar.gz" "data/processed/$REGION"

gh release view seed-data > /dev/null 2>&1 || gh release create seed-data \
  --title "CI seed data" --notes "Processed pipeline data used to bootstrap the daily refresh workflow." --latest=false
gh release upload seed-data "seed-$REGION.tar.gz" --clobber
rm "seed-$REGION.tar.gz"
echo "uploaded seed-$REGION.tar.gz to the seed-data release"

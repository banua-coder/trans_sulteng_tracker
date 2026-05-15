#!/usr/bin/env bash
#
# Prune cektrans-web / cektrans-proxy images on the VPS once the most
# recent deploy is at least 24h old. Run daily by the scheduled
# cleanup-images GitHub Action.
#
# Why the 24h grace window: deploy.sh snapshots the previous image
# tags so it (or rollback.sh) can restore them if the new release
# misbehaves. Pruning n-1 immediately would erase that safety net.
# After 24h of uptime on the new release we trust it and let n-1 go.
#
# Usage on the VPS:
#   ./cleanup-images.sh
#
# Env overrides:
#   ROLLBACK_WINDOW_SECONDS  grace window before n-1 can be pruned (86400)
#   LAST_DEPLOY_FILE         path to the deploy timestamp (.last-deploy-at)

set -euo pipefail

LAST_DEPLOY_FILE="${LAST_DEPLOY_FILE:-$PWD/.last-deploy-at}"
WINDOW="${ROLLBACK_WINDOW_SECONDS:-86400}"
NOW=$(date -u +%s)

if [[ -f "$LAST_DEPLOY_FILE" ]]; then
  last=$(cat "$LAST_DEPLOY_FILE")
  age=$(( NOW - last ))
  if (( age < WINDOW )); then
    echo "skip: most recent deploy was ${age}s ago (< ${WINDOW}s rollback window)"
    exit 0
  fi
  echo "last deploy ${age}s ago — rollback window expired, proceeding"
else
  # No timestamp means either a fresh install or a recent rollback
  # cleared the marker. Either way the currently-running stack is the
  # safety target; anything else is fair game to prune.
  echo "no deploy timestamp — treating live container as the safety target"
fi

# Determine the currently-running image tags so we don't prune the
# digest the live container is using.
current_web=$(docker inspect --format '{{.Config.Image}}' cektrans-web-1 2>/dev/null || true)
current_proxy=$(docker inspect --format '{{.Config.Image}}' cektrans-proxy-1 2>/dev/null || true)

prune_repo() {
  local repo="$1" current="$2"
  docker image ls --format '{{.Repository}}:{{.Tag}}|{{.ID}}' "$repo" \
    | while IFS='|' read -r tag id; do
        # Always keep :latest and the live container's tag.
        [[ "$tag" == *:latest ]] && continue
        [[ "$tag" == "$current" ]] && continue
        echo "  remove $tag ($id)"
        docker rmi "$id" || true
      done
}

echo "── pruning cektrans-web (live: ${current_web:-<none>}) ──"
prune_repo "ghcr.io/banua-coder/cektrans-web" "$current_web"
echo "── pruning cektrans-proxy (live: ${current_proxy:-<none>}) ──"
prune_repo "ghcr.io/banua-coder/cektrans-proxy" "$current_proxy"

# Sweep any dangling layers freed up by the rmi calls above.
docker image prune -f >/dev/null
echo "cleanup ok."

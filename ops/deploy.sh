#!/usr/bin/env bash
#
# VPS-side deploy script. Invoked by .github/workflows/deploy.yml via
# ssh with the desired image version as the first arg.
#
# Expects to be run from /opt/cektrans on the VPS, with:
#   · /opt/cektrans/.env             runtime secrets (BRT_KEY etc.)
#   · /opt/cektrans/docker-compose.yml   prod compose
#   · the `traefik-public` external Docker network already up
#
# Safety mechanism:
#   1. Snapshots the currently-running image tags to .previous-version
#      BEFORE pulling new images.
#   2. After `compose up`, polls proxy health for up to 60s.
#   3. If health never reaches "healthy", auto-rolls back to the
#      snapshot and exits 1 so the workflow knows the deploy failed.
#   4. On success, writes .last-deploy-at; the cleanup-images cron
#      uses that timestamp to keep the n-1 image on disk for 24h.
#
# Usage on the VPS:
#   ./deploy.sh 0.1.0

set -euo pipefail

VERSION="${1:?version required (e.g. 0.1.0)}"
REGISTRY="ghcr.io"
OWNER="${OWNER:-banua-coder}"
WEB_IMAGE="${REGISTRY}/${OWNER}/cektrans-web:${VERSION}"
PROXY_IMAGE="${REGISTRY}/${OWNER}/cektrans-proxy:${VERSION}"

STATE_FILE="${STATE_FILE:-/opt/cektrans/.previous-version}"
LAST_DEPLOY_FILE="${LAST_DEPLOY_FILE:-/opt/cektrans/.last-deploy-at}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

echo "── deploying cektrans ${VERSION} ──"
echo "  web   : ${WEB_IMAGE}"
echo "  proxy : ${PROXY_IMAGE}"
echo

# Snapshot currently-running images so we have a rollback target.
# On first-ever deploy these will be empty; the snapshot is skipped and
# rollback is unavailable for this deploy only.
prev_web=$(docker inspect --format '{{.Config.Image}}' cektrans-web-1 2>/dev/null || true)
prev_proxy=$(docker inspect --format '{{.Config.Image}}' cektrans-proxy-1 2>/dev/null || true)

if [[ -n "$prev_web" && -n "$prev_proxy" ]]; then
  cat > "$STATE_FILE" <<EOF
WEB_IMAGE=${prev_web}
PROXY_IMAGE=${prev_proxy}
SNAPSHOT_AT=$(date -u +%s)
EOF
  echo "  rollback target snapshotted (${prev_web} / ${prev_proxy})"
else
  echo "  no running stack — rollback target NOT recorded for this deploy"
fi

# Pull the new images first; if either fails we abort before touching
# the running stack.
docker pull "${WEB_IMAGE}"
docker pull "${PROXY_IMAGE}"

# Roll the compose stack with the new tags.
export WEB_IMAGE PROXY_IMAGE
docker compose -f docker-compose.yml up -d --remove-orphans

echo
echo "── waiting for proxy to report healthy (timeout: ${HEALTH_TIMEOUT}s) ──"
healthy=0
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  status=$(docker inspect --format '{{.State.Health.Status}}' cektrans-proxy-1 2>/dev/null || echo unknown)
  if [[ "$status" == "healthy" ]]; then
    echo "  proxy healthy after ${i}s"
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" -ne 1 ]]; then
  echo "::error::deploy unhealthy after ${HEALTH_TIMEOUT}s — auto-rolling back"
  if [[ -f "$STATE_FILE" ]]; then
    # Re-export the previous tags and roll the stack back.
    # shellcheck disable=SC1090
    source "$STATE_FILE"
    export WEB_IMAGE PROXY_IMAGE
    echo "── rolling back to ${WEB_IMAGE} / ${PROXY_IMAGE} ──"
    docker compose -f docker-compose.yml up -d
    for i in $(seq 1 "$HEALTH_TIMEOUT"); do
      status=$(docker inspect --format '{{.State.Health.Status}}' cektrans-proxy-1 2>/dev/null || echo unknown)
      if [[ "$status" == "healthy" ]]; then
        echo "  rollback healthy after ${i}s"
        break
      fi
      sleep 1
    done
  else
    echo "::error::no rollback target on disk — manual intervention required"
  fi
  exit 1
fi

# Record successful deploy timestamp so the daily cleanup job knows
# when 24h has elapsed and the n-1 image is safe to prune.
date -u +%s > "$LAST_DEPLOY_FILE"

echo
echo "deploy ok."

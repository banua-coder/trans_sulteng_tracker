#!/usr/bin/env bash
#
# Roll the running stack back to the version recorded in
# .previous-version. Invoked by the deploy workflow's smoke job when
# the post-deploy curl checks fail (the in-deploy health gate already
# catches Docker-level startup failures; this layer catches functional
# regressions that pass health checks but fail real traffic).
#
# Usage on the VPS:
#   ./rollback.sh

set -euo pipefail

STATE_FILE="${STATE_FILE:-$PWD/.previous-version}"
LAST_DEPLOY_FILE="${LAST_DEPLOY_FILE:-$PWD/.last-deploy-at}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "::error::no previous version on disk; cannot roll back"
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

if [[ -z "${WEB_IMAGE:-}" || -z "${PROXY_IMAGE:-}" ]]; then
  echo "::error::state file malformed (missing WEB_IMAGE or PROXY_IMAGE)"
  exit 1
fi

export WEB_IMAGE PROXY_IMAGE

echo "── rolling back to ${WEB_IMAGE} / ${PROXY_IMAGE} ──"

# Pulls are best-effort — the previous image is almost certainly still
# on disk (the cleanup-images job preserves it for 24h after a deploy).
docker pull "$WEB_IMAGE" || true
docker pull "$PROXY_IMAGE" || true

docker compose -f docker-compose.yml up -d

echo
echo "── waiting for proxy to report healthy (timeout: ${HEALTH_TIMEOUT}s) ──"
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  status=$(docker inspect --format '{{.State.Health.Status}}' cektrans-proxy-1 2>/dev/null || echo unknown)
  if [[ "$status" == "healthy" ]]; then
    echo "  rollback healthy after ${i}s"
    # Clear the deploy timestamp — the rolled-back image is now the
    # safety target. The next deploy will snapshot it fresh.
    rm -f "$LAST_DEPLOY_FILE"
    echo "rollback ok."
    exit 0
  fi
  sleep 1
done

echo "::error::rollback failed to reach healthy state within ${HEALTH_TIMEOUT}s"
exit 1

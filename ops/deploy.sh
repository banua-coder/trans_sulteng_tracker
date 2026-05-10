#!/usr/bin/env bash
#
# VPS-side deploy script. Invoked by .github/workflows/deploy.yml via
# appleboy/ssh-action with the desired image version as the first arg.
#
# Expects to be run from /opt/cektrans on the VPS, with:
#   · /opt/cektrans/.env             runtime secrets (BRT_KEY etc.)
#   · /opt/cektrans/docker-compose.yml   prod compose
#   · the `traefik-public` external Docker network already up
#
# Usage on the VPS:
#   ./deploy.sh 0.1.0

set -euo pipefail

VERSION="${1:?version required (e.g. 0.1.0)}"
REGISTRY="ghcr.io"
OWNER="${OWNER:-banua-coder}"
WEB_IMAGE="${REGISTRY}/${OWNER}/cektrans-web:${VERSION}"
PROXY_IMAGE="${REGISTRY}/${OWNER}/cektrans-proxy:${VERSION}"

echo "── deploying cektrans ${VERSION} ──"
echo "  web   : ${WEB_IMAGE}"
echo "  proxy : ${PROXY_IMAGE}"
echo

# Pull the new images first; if either fails we abort before touching the
# running stack.
docker pull "${WEB_IMAGE}"
docker pull "${PROXY_IMAGE}"

# Roll the compose stack with the new tags. WEB_IMAGE / PROXY_IMAGE are
# read by docker-compose.yml via ${WEB_IMAGE} / ${PROXY_IMAGE}.
export WEB_IMAGE PROXY_IMAGE

docker compose -f docker-compose.yml up -d --remove-orphans

echo
echo "── waiting for proxy to report healthy ──"
for i in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' cektrans-proxy-1 2>/dev/null || echo unknown)
  if [[ "$status" == "healthy" ]]; then
    echo "  proxy healthy after ${i}s"
    break
  fi
  sleep 1
done

# Reap dangling images from prior versions to keep disk usage sane.
docker image prune -f >/dev/null

echo
echo "deploy ok."

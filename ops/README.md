# ops/

How **cektrans** runs in production on the shared Banuacoder VPS.
The container layout, Traefik routing, and the path GitHub Actions
takes from a tag push to a healthy deploy.

## Topology

```
Internet
   │
   ▼
Traefik (host)  ── traefik-public network
   ├── cektrans-web    :80   (nginx serving the SPA)
   └── cektrans-proxy  :8080 (Axum REST + Socket.IO)
                              │
                              ▼ HTTPS
                        ${BRT_UPSTREAM_HOST}
```

- A single host: `cektrans.banuacoder.com`. Traefik (already running on
  the VPS for Archipelago) terminates TLS via Let's Encrypt and
  routes by path:
  - `/api/*` and `/socket.io/*` → `cektrans-proxy:8080`
  - everything else → `cektrans-web:80`
- Containers join the existing `traefik-public` external network — we
  do **not** stand up our own Traefik instance. Routing is declared
  via labels on each service in `ops/docker-compose.yml`.
- Proxy secrets (`BRT_KEY`, upstream URLs) are runtime-only — passed
  to the container via `/opt/cektrans/.env`. Never baked into images.

## VPS layout

```
/opt/cektrans/
├── docker-compose.yml      # production stack (this repo's ops/docker-compose.yml)
├── .env                    # runtime secrets — chmod 600, NOT in git
└── deploy.sh               # invoked by GH Actions over SSH
```

`docker-compose.yml` and `deploy.sh` are tracked in this repo (`ops/`).
Copy them to `/opt/cektrans/` once during initial provisioning;
afterwards the deploy script handles all image rolls.

## First-time provisioning

```bash
ssh banuacoder@$VPS
sudo mkdir -p /opt/cektrans
sudo chown $USER /opt/cektrans
cd /opt/cektrans

# 1. Drop in the compose + deploy script.
scp banuacoder@build:trans_sulteng_tracker/ops/docker-compose.yml ./
scp banuacoder@build:trans_sulteng_tracker/ops/deploy.sh         ./
chmod +x deploy.sh

# 2. Author the runtime env. Never commit this file.
cat > .env <<'EOF'
BIND_ADDR=0.0.0.0:8080
BRT_REST_BASE=http://REDACTED_REST_BASE
BRT_SOCKET_BASE=https://REDACTED_SOCKET_BASE/
BRT_KEY=<32-byte-utf8-secret>
ALLOW_ORIGIN=https://cektrans.banuacoder.com
RUST_LOG=info,cektrans_proxy=debug
EOF
chmod 600 .env

# 3. Authenticate Docker against GHCR (read-only PAT).
echo "$GHCR_PAT" | docker login ghcr.io -u $GHCR_USER --password-stdin

# 4. First deploy — usually triggered from GH Actions, but you can run
#    it manually for the very first roll.
WEB_IMAGE=ghcr.io/banua-coder/cektrans-web:latest \
  PROXY_IMAGE=ghcr.io/banua-coder/cektrans-proxy:latest \
  docker compose -f docker-compose.yml up -d
```

Verify:

```bash
PROXY_BASE=https://cektrans.banuacoder.com \
  ORIGIN=https://cektrans.banuacoder.com \
  bash <(curl -fsSL https://raw.githubusercontent.com/banua-coder/trans_sulteng_tracker/main/scripts/smoke.sh)
```

## Deploy (steady state)

Triggered by either:

- pushing a tag matching `cektrans/v*` (e.g. `cektrans/v0.1.0`), or
- running `Deploy cektrans` from the Actions tab with a manual version.

The workflow:

1. Resolves the version once (input or tag suffix).
2. Builds + pushes both images to GHCR with `latest` and the version
   tag, using GHA cache.
3. SSHs the VPS via `webfactory/ssh-agent` + raw `ssh -p $DEPLOY_PORT`,
   refreshes `/opt/cektrans/.env` from the `ENV_B64` secret, and runs
   `./deploy.sh <version>`.
4. Runs `scripts/smoke.sh` against `https://cektrans.banuacoder.com`
   for a final go/no-go.

`deploy.sh` itself: `docker pull` both images, `docker compose up -d
--remove-orphans`, wait up to 30 s for the proxy healthcheck to go
green, then `docker image prune -f` for housekeeping.

## Required GitHub Actions secrets / variables

Mirrors the **pico-api-go** deploy pattern, with secrets shared at the
banua-coder org level:

| Name | Scope | Purpose |
|---|---|---|
| `DEPLOY_SSH_KEY` | **banua-coder org** | SSH private key consumed by `webfactory/ssh-agent`. The matching public key sits in the deploy user's `~/.ssh/authorized_keys` on the VPS. |
| `DEPLOY_HOST` | org | VPS hostname / IP |
| `DEPLOY_PORT` | org | SSH port (custom, not 22) |
| `DEPLOY_USER` | org | deploy user with docker compose rights |
| `DEPLOY_PATH` | repo | absolute path to this app on the VPS, e.g. `/opt/cektrans` |
| `ENV_B64` | repo | base64-encoded full prod `.env` (proxy + frontend keys in one blob). Decoded by `build-web` for `VITE_*` vars and rewritten on the VPS during deploy. |
| `GITHUB_TOKEN` | auto | issued per-run; pushes images to GHCR. |

`BRT_KEY` and the upstream URLs are **not** GitHub secrets — they live
only in `/opt/cektrans/.env` on the VPS.

## Logs / observability

```bash
# Live tail of both containers
docker compose -f /opt/cektrans/docker-compose.yml logs -f --tail 100

# Just the proxy
docker logs -f cektrans-proxy-1

# Health snapshot
curl -fsS https://cektrans.banuacoder.com/api/health | jq
```

`tracing-subscriber` filters via `RUST_LOG`. To bump the proxy to
trace-level for a debug session, edit `/opt/cektrans/.env` and re-run
`./deploy.sh latest` to roll the container with the new env.

## Rollback

Every previous version is still tagged in GHCR. To roll back:

```bash
ssh banuacoder@$VPS
cd /opt/cektrans
./deploy.sh 0.1.0          # or whichever known-good tag
```

Or use the `workflow_dispatch` form in GitHub Actions and supply the
older version string — the deploy job is the same code path either
way.

## Networking gotchas

- The `traefik-public` network must exist before this stack starts.
  It's created by Archipelago's Traefik bootstrap (`/opt/traefik/`
  on the VPS). If `docker compose up` complains about a missing
  network, that's the cause.
- Socket.IO requires WebSocket upgrade. Traefik's default behavior
  handles this automatically — no extra middleware labels needed.
- The proxy listens on `0.0.0.0:8080` inside the container; we never
  publish that port to the host. Traefik addresses it over the Docker
  network only.

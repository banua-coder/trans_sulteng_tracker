# Deploy checklist — cektrans.banuacoder.com

Run this end-to-end before tagging the first release, and again any
time the upstream BRT contract changes (key rotation, endpoint move,
operating-hour change). Boxes you can tick are the ones that don't
need a human eye on the result.

## Pre-flight

- [ ] `develop` is green: CI passes for both web and proxy on the
      latest commit
- [ ] No staged or untracked files locally (`git status` clean)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`
      pass in `apps/proxy`

## Local end-to-end

- [ ] `pnpm dev` boots web + proxy without errors
- [ ] `bash scripts/smoke.sh` reports all 5 checks green
- [ ] `/api/health` body contains `"upstream":{"connected":true,…}`
- [ ] Browser visits `http://localhost:5173/palu` and renders
      corridors + halte without console errors
- [ ] Within operating hours (06:00–18:00 WITA), at least one bus
      marker appears within ~30 s
- [ ] Click a bus → flies + zooms + follows; close card → returns
      to prior viewport
- [ ] Click a corridor card → focus mode (faded other corridors,
      direction toggle showing the actual endpoint names)
- [ ] Direction toggle swaps the halte list in the focus panel
- [ ] Map legend defaults open and shows live + stale icons
- [ ] Dark mode toggle swaps both UI and map basemap (Voyager →
      Dark Matter)
- [ ] Language toggle swaps id ↔ en
- [ ] Refresh `/palu?kor=K1&dir=b&bus=<imei>` — state restores from
      URL
- [ ] On a 360 px viewport (devtools), TopBar fits a single row,
      bottom sheet drags through peek/mid/full

## VPS provisioning (one-time per host)

- [ ] `traefik-public` Docker network exists on the VPS
- [ ] `/opt/cektrans/.env` exists, `chmod 600`, owned by deploy user
- [ ] `/opt/cektrans/docker-compose.yml` matches `ops/docker-compose.yml`
      from this repo
- [ ] `/opt/cektrans/deploy.sh` matches `ops/deploy.sh` and is `+x`
- [ ] Deploy user can `docker login ghcr.io` with a read-only PAT
- [ ] DNS: `cektrans.banuacoder.com` resolves to the VPS IP
- [ ] Traefik picks up the labels (`docker logs traefik` shows the
      router+service for `cektrans-web` and `cektrans-proxy`)
- [ ] Let's Encrypt issues a certificate for `cektrans.banuacoder.com`

## GitHub repo configuration

- [ ] Repository created under the `banua-coder` organisation
- [ ] Secrets set:
  - [ ] `SSH_HOST`
  - [ ] `SSH_USERNAME`
  - [ ] `SSH_PRIVATE_KEY`
- [ ] Default branch `develop`; `main` protected (PRs only)
- [ ] Actions: `Read and write permissions` enabled (so workflow can
      push to GHCR)

## Cut a release

```bash
git checkout develop
git pull --rebase
git checkout main
git merge --ff-only develop
git tag cektrans/v0.1.0
git push origin main cektrans/v0.1.0
```

GitHub Actions handles the rest:

- [ ] Both `build-*` jobs go green
- [ ] `deploy` job reports `proxy healthy`
- [ ] `smoke` job reports all checks green against
      `https://cektrans.banuacoder.com`

## Post-deploy verification (live site)

- [ ] `https://cektrans.banuacoder.com` loads with valid TLS
- [ ] `https://cektrans.banuacoder.com/api/health` returns
      `{"status":"ok"}`
- [ ] During operating hours, live bus markers update on `/palu`
- [ ] Mobile browser test: PWA install prompt appears or the
      manifest is valid in Lighthouse
- [ ] Lighthouse PWA + Performance ≥ 80 (informational, not blocking)
- [ ] No mixed-content warnings in the browser console (the proxy
      is serving everything via HTTPS through Traefik)

## Rollback

If `smoke` fails or live verification flags an issue:

```bash
ssh banuacoder@$VPS
cd /opt/cektrans
./deploy.sh <previous-version>     # e.g. cektrans/v0.0.9 → "0.0.9"
```

Then re-run the smoke script with `PROXY_BASE=https://cektrans.banuacoder.com`
and confirm green before declaring rollback complete.

## Periodic maintenance

- [ ] Once a quarter: probe `/api/cities` against the upstream and
      confirm `pref` values for Palu (`12`) and Donggala (`11`)
      haven't shifted
- [ ] Once a quarter: check if `secretKeyGpsSocket` has rotated
      (signal: every request returns 401 even after fresh `getToken`).
      If so, recover the new key and rotate `BRT_KEY` in
      `/opt/cektrans/.env`, then `docker compose restart proxy`.
- [ ] Watch GHCR storage; periodically delete tags older than ~10
      releases via the GitHub web UI.

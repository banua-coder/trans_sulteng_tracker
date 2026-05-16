# Slim multi-stage build for the Vue SPA.
#
# Stage 1 builds the static bundle with node:22-alpine and pnpm.
# Stage 2 pre-compresses every text asset with brotli + gzip so the
# runtime serves the .br / .gz variants directly (no on-the-fly cost).
# Stage 3 serves the bundle via static-web-server (joseluisq's Rust
# static server, ~4 MB base) instead of nginx, taking the final image
# from ~49 MB (nginx:1.27-alpine) down to ~8 MB.

# ── Stage 1: build the Vue static bundle ──────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm fetch && \
    pnpm install --frozen-lockfile --offline --filter @cektrans/web

COPY apps/web ./apps/web

ARG VITE_BUILD_SHA=unknown
ARG VITE_GA_ID=
ENV VITE_BUILD_SHA=${VITE_BUILD_SHA}
ENV VITE_GA_ID=${VITE_GA_ID}

RUN pnpm --filter @cektrans/web build

# ── Stage 2: pre-compress text assets ─────────────────────────────
# brotli wins on size for text/JS/CSS; gzip is the fallback for
# clients that don't accept-encoding br. The runtime server's
# compression-static support picks whichever the client asked for.
FROM alpine:3.20 AS compress
RUN apk add --no-cache brotli gzip findutils
COPY --from=build /app/apps/web/dist /dist
RUN find /dist -type f \
      \( -name '*.html' -o -name '*.js' -o -name '*.mjs' \
         -o -name '*.css' -o -name '*.svg' -o -name '*.json' \
         -o -name '*.webmanifest' -o -name '*.txt' -o -name '*.xml' \) \
      -size +1024c -print0 \
    | xargs -0 -I{} sh -c 'brotli -q 11 -k "{}" && gzip -9 -k "{}"'

# ── Stage 3: serve via static-web-server (alpine, ~19 MB total) ───
# Final image lands ~19 MB versus the previous ~49 MB nginx:alpine
# build. SWS is a single Rust binary with native SPA fallback,
# Brotli/gzip negotiation, and a built-in /health endpoint.
FROM joseluisq/static-web-server:2-alpine AS runtime

COPY --from=compress /dist /public

ENV SERVER_ROOT=/public
ENV SERVER_PORT=80
# SPA fallback: any unknown path returns index.html so client-side
# routing handles it.
ENV SERVER_PAGE_FALLBACK=/index.html
# Negotiate pre-compressed variants when the client supports them.
ENV SERVER_COMPRESSION_STATIC=true
ENV SERVER_COMPRESSION=true
# Cache: long-lived fingerprinted assets, no-cache for the entry HTML
# and service worker so deploys propagate.
ENV SERVER_CACHE_CONTROL_HEADERS=true
# Built-in /health endpoint that Traefik can probe.
ENV SERVER_HEALTH=true

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health >/dev/null 2>&1 || exit 1

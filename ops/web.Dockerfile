# ── Stage 1: build the Vue static bundle ──────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Cache deps separately from source for faster rebuilds.
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm fetch && \
    pnpm install --frozen-lockfile --offline --filter @cektrans/web

COPY apps/web ./apps/web

# VITE_* build-time vars come from CI build args.
ARG VITE_BUILD_SHA=unknown
ARG VITE_GA_ID=
ENV VITE_BUILD_SHA=${VITE_BUILD_SHA}
ENV VITE_GA_ID=${VITE_GA_ID}

RUN pnpm --filter @cektrans/web build

# ── Stage 2: serve the static bundle with nginx ───────────────────
FROM nginx:1.27-alpine AS runtime

COPY ops/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]

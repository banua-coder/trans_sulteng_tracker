# ── Stage 1: build the Rust binary ────────────────────────────────
FROM rust:1.82-slim AS build
WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config ca-certificates && rm -rf /var/lib/apt/lists/*

COPY apps/proxy/Cargo.toml apps/proxy/rust-toolchain.toml ./apps/proxy/
COPY apps/proxy/src ./apps/proxy/src

WORKDIR /build/apps/proxy
RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-target,target=/build/apps/proxy/target \
    cargo build --release && \
    cp target/release/cektrans-proxy /usr/local/bin/cektrans-proxy

# ── Stage 2: minimal runtime ──────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Non-root user.
RUN groupadd --system --gid 1001 cektrans && \
    useradd  --system --uid 1001 --gid cektrans cektrans

COPY --from=build /usr/local/bin/cektrans-proxy /usr/local/bin/cektrans-proxy

USER cektrans
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -fsS http://localhost:8080/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/cektrans-proxy"]

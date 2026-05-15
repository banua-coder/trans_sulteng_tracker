# Slim multi-stage build for the Rust proxy.
#
# Stage 1 cross-compiles to musl. Stage 2 runs on alpine — musl libc
# native, a shell for ops debugging, curl for HEALTHCHECK, ~7 MB base.
# Total image with binary lands around 12-15 MB versus ~97 MB on the
# previous debian:bookworm-slim runtime.
#
# v0.6.6 attempted to use gcr.io/distroless/static-debian12 as runtime
# but the musl binary failed to exec there with "no such file or
# directory" — distroless/static lacks /lib/ld-musl-x86_64.so.1, the
# interpreter the cross-compiled binary references. Alpine ships musl
# as its system libc so the binary runs unmodified.

# ── Stage 1: build static musl binary ─────────────────────────────
FROM rust:1.82-slim AS build
WORKDIR /build

# Build toolchain:
#   pkg-config + perl   — ring's build script
#   musl-tools          — musl-gcc + musl headers for the cross-target
#   make + linux-headers — openssl-src vendored build needs `make` and
#                          kernel headers; rust:1.82-slim ships neither
#   ca-certificates     — cargo's TLS pull from crates.io
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config musl-tools perl make linux-libc-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    rustup target add x86_64-unknown-linux-musl

COPY apps/proxy/Cargo.toml apps/proxy/Cargo.lock apps/proxy/rust-toolchain.toml ./apps/proxy/
COPY apps/proxy/src ./apps/proxy/src

WORKDIR /build/apps/proxy
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
# Point cc-rs at the musl toolchain so transitive C builds (ring's
# assembly stubs etc.) compile against musl, not glibc.
ENV CC_x86_64_unknown_linux_musl=musl-gcc
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=musl-gcc
RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-target-musl,target=/build/apps/proxy/target \
    cargo build --release --target x86_64-unknown-linux-musl && \
    cp target/x86_64-unknown-linux-musl/release/cektrans-proxy /tmp/cektrans-proxy

# ── Stage 2: alpine runtime (musl native) ─────────────────────────
# alpine:3.20 ships musl libc as its system libc, ca-certificates,
# and curl — everything the cross-compiled musl binary needs to run
# plus an in-container healthcheck.
FROM alpine:3.20 AS runtime

RUN apk add --no-cache ca-certificates curl tzdata && \
    addgroup -S -g 1001 cektrans && \
    adduser  -S -u 1001 -G cektrans cektrans

COPY --from=build /tmp/cektrans-proxy /usr/local/bin/cektrans-proxy

USER cektrans
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -fsS http://localhost:8080/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/cektrans-proxy"]

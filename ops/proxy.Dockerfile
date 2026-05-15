# Native alpine build for the Rust proxy.
#
# v0.6.0 through v0.6.7 attempted a cross-compile from rust:1.82-slim
# (glibc host) targeting x86_64-unknown-linux-musl. The resulting
# binaries all SIGSEGV'd at startup — strace revealed a double
# arch_prctl(ARCH_SET_FS) call, the classic glibc/musl TLS-init
# conflict that happens when openssl-src's vendored OpenSSL is built
# with the host's glibc gcc and statically linked into a musl binary.
#
# Building natively on rust:1.82-alpine sidesteps the entire issue:
# the toolchain is musl-gcc all the way through, openssl-libs-static
# is musl-built from alpine's package, no env-var juggling required.
# Final image lands ~24 MB versus ~97 MB on the previous debian-slim
# runtime, with the Cargo size profile (Cargo.toml) shaving the binary
# from ~15 MB to ~10 MB.

# ── Stage 1: build the binary ─────────────────────────────────────
FROM rust:1.82-alpine AS build
WORKDIR /build

# musl-dev provides musl libc headers. openssl-dev + openssl-libs-static
# let rust_socketio's native-tls dep link against alpine's musl-built
# OpenSSL statically (avoids needing libssl at runtime).
RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static pkgconfig perl make

COPY apps/proxy/Cargo.toml apps/proxy/Cargo.lock apps/proxy/rust-toolchain.toml ./apps/proxy/
COPY apps/proxy/src ./apps/proxy/src

WORKDIR /build/apps/proxy
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
ENV OPENSSL_STATIC=1
RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-target-alpine,target=/build/apps/proxy/target \
    cargo build --release && \
    cp target/release/cektrans-proxy /usr/local/bin/cektrans-proxy

# ── Stage 2: alpine runtime ───────────────────────────────────────
FROM alpine:3.20 AS runtime

RUN apk add --no-cache ca-certificates curl tzdata && \
    addgroup -S -g 1001 cektrans && \
    adduser  -S -u 1001 -G cektrans cektrans

COPY --from=build /usr/local/bin/cektrans-proxy /usr/local/bin/cektrans-proxy

USER cektrans
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -fsS http://localhost:8080/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/cektrans-proxy"]

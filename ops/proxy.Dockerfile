# Slim multi-stage build for the Rust proxy.
#
# Stage 1 builds a statically linked musl binary so the runtime stage
# can be distroless/static (no glibc, no shell, no package manager,
# ~2 MB base). Combined with the size-optimised release profile in
# Cargo.toml the final image lands around 10-12 MB versus ~97 MB on
# the previous debian:bookworm-slim runtime.

# ── Stage 1: build static musl binary ─────────────────────────────
FROM rust:1.82-slim AS build
WORKDIR /build

# musl toolchain + perl/pkg-config for ring's build script. ca-
# certificates lets cargo reach crates.io over TLS.
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config musl-tools perl ca-certificates && \
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

# ── Stage 2: distroless static runtime ────────────────────────────
# distroless/static-debian12:nonroot carries ca-certificates, an
# /etc/passwd entry for the `nonroot` user (uid 65532), and tzdata.
# No libc, no shell, no package manager. Smallest viable surface for
# a static Rust binary.
FROM gcr.io/distroless/static-debian12:nonroot AS runtime

COPY --from=build /tmp/cektrans-proxy /usr/local/bin/cektrans-proxy

# distroless/static-debian12:nonroot drops privileges automatically;
# no explicit USER directive needed.
EXPOSE 8080

# No HEALTHCHECK — distroless has no curl/wget and Traefik probes
# the public endpoint. Adding a tini-style health binary just to
# keep `docker ps` happy isn't worth the bytes.
ENTRYPOINT ["/usr/local/bin/cektrans-proxy"]

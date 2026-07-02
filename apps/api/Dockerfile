# syntax=docker/dockerfile:1
# Multi-stage production image for the Rust/axum API.
# Build context: the repository root (`docker build -f apps/api/Dockerfile .`).

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM rust:1.96.0-slim@sha256:c37af730be4fd8104cbf9aedbd6ab259e51ca2d5437817a0f8680edf66ac6c28 AS build
WORKDIR /app

# Copy the workspace and build the release binary against the committed lockfile.
COPY . .
RUN cargo build --release --locked -p api

# ── Stage 2: runtime ────────────────────────────────────────────────────────
# Distroless carries libc + libgcc for a dynamically-linked Rust binary and runs
# as a non-root user by default — no shell, minimal attack surface.
FROM gcr.io/distroless/cc-debian12:nonroot@sha256:b0ae8e989418b458e0f25489bc3be523718938a2b70864cc0f6a00af1ddbd985 AS runtime
COPY --from=build /app/target/release/api /usr/local/bin/api

# API port defaults to 4000; override at run time with -e API_PORT.
EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/api"]

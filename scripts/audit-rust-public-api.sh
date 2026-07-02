#!/usr/bin/env bash
# Generate cargo-public-api snapshots for the three consumed library crates and
# write them to apps/api/public-api/*.txt. Requires nightly rustdoc.
# Run from the repository root. Safe to re-run; overwrites existing snapshots.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${HERE}/apps/api/public-api"
# The version pinned here must match the nightly the installed cargo-public-api
# binary was compiled against. Update by re-running:
#   RUSTUP_TOOLCHAIN=nightly-<date> cargo public-api ...
# and checking that rustdoc JSON builds cleanly.
TOOLCHAIN="${RUSTUP_TOOLCHAIN:-nightly-2026-03-01}"

CRATES=(
  "bymax-auth-axum"
  "bymax-auth-core"
  "bymax-auth-redis"
)

if ! command -v cargo-public-api >/dev/null 2>&1; then
  echo "audit:public-api — cargo-public-api not installed; run: cargo install cargo-public-api" >&2
  exit 1
fi

echo "audit:public-api — generating snapshots via cargo public-api (${TOOLCHAIN} rustdoc)"
mkdir -p "${OUT_DIR}"

for CRATE in "${CRATES[@]}"; do
  OUT="${OUT_DIR}/${CRATE}.txt"
  echo "audit:public-api —   ${CRATE} → ${OUT}"
  RUSTUP_TOOLCHAIN="${TOOLCHAIN}" cargo public-api \
    --manifest-path "${HERE}/apps/api/Cargo.toml" \
    --package "${CRATE}" \
    2>/dev/null \
    | sort \
    > "${OUT}"
  echo "audit:public-api —   $(wc -l < "${OUT}" | tr -d ' ') lines written"
done

echo "audit:public-api — snapshots written to ${OUT_DIR}"

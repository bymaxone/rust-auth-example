#!/usr/bin/env bash
# Generate cargo-public-api snapshots for the three consumed library crates and
# write them to apps/api/public-api/*.txt. Requires nightly rustdoc.
# Run from the repository root. Safe to re-run; overwrites existing snapshots.
#
# Flags:
#   --check   Regenerate snapshots to a temp dir and diff against committed
#             snapshots; exits non-zero on drift. Default mode generates and
#             blesses the committed snapshots in-place.
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

CHECK_MODE=false
for arg in "$@"; do
  if [[ "$arg" == "--check" ]]; then
    CHECK_MODE=true
  fi
done

if ! command -v cargo-public-api >/dev/null 2>&1; then
  echo "audit:public-api — cargo-public-api not installed; run: cargo install cargo-public-api" >&2
  exit 1
fi

if $CHECK_MODE; then
  WORK_DIR="$(mktemp -d)"
  trap 'rm -rf "$WORK_DIR"' EXIT
  echo "audit:public-api — check mode: regenerating to temp dir for drift detection (${TOOLCHAIN} rustdoc)"
else
  echo "audit:public-api — generating snapshots via cargo public-api (${TOOLCHAIN} rustdoc)"
  mkdir -p "${OUT_DIR}"
fi

DRIFT=false

for CRATE in "${CRATES[@]}"; do
  if $CHECK_MODE; then
    TMP_OUT="${WORK_DIR}/${CRATE}.txt"
    echo "audit:public-api —   ${CRATE} → (temp)"
    RUSTUP_TOOLCHAIN="${TOOLCHAIN}" cargo public-api \
      --manifest-path "${HERE}/apps/api/Cargo.toml" \
      --package "${CRATE}" \
      | sort \
      > "${TMP_OUT}"
    COMMITTED="${OUT_DIR}/${CRATE}.txt"
    if [[ ! -f "${COMMITTED}" ]]; then
      echo "audit:public-api — DRIFT: ${CRATE}.txt not found in committed snapshots" >&2
      DRIFT=true
    elif ! diff -u "${COMMITTED}" "${TMP_OUT}"; then
      echo "audit:public-api — DRIFT detected in ${CRATE}" >&2
      DRIFT=true
    else
      echo "audit:public-api —   ${CRATE}: no drift"
    fi
  else
    OUT="${OUT_DIR}/${CRATE}.txt"
    echo "audit:public-api —   ${CRATE} → ${OUT}"
    RUSTUP_TOOLCHAIN="${TOOLCHAIN}" cargo public-api \
      --manifest-path "${HERE}/apps/api/Cargo.toml" \
      --package "${CRATE}" \
      | sort \
      > "${OUT}"
    echo "audit:public-api —   $(wc -l < "${OUT}" | tr -d ' ') lines written"
  fi
done

if $CHECK_MODE; then
  if $DRIFT; then
    echo "audit:public-api — FAILED: snapshot drift detected; run without --check to regenerate" >&2
    exit 1
  fi
  echo "audit:public-api — all snapshots match committed state"
else
  echo "audit:public-api — snapshots written to ${OUT_DIR}"
fi

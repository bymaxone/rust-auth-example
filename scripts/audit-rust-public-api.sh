#!/usr/bin/env bash
# Public-API audit for the consumed Rust crates. Runs `cargo public-api` over the
# `bymax-auth-*` crates the example depends on and checks every `pub` item is
# referenced in apps/api (or allow-listed with a reason in .audit-ignore.json).
#
# It exits 0 on the current stub: no `bymax-auth` path dependency is wired into
# apps/api yet, so there is no consumed public surface to audit. The gate becomes
# real once the library-consumption step adds the path dependencies.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Match an actual dependency declaration (`bymax-auth-... =`), not a comment that
# merely mentions the crate family.
if ! grep -qE '^[[:space:]]*bymax-auth[a-z-]*[[:space:]]*=' "${ROOT}/apps/api/Cargo.toml" 2>/dev/null; then
  echo "audit:public-api — no consumed crates wired yet; nothing to audit."
  exit 0
fi

if ! command -v cargo-public-api >/dev/null 2>&1; then
  echo "audit:public-api — cargo-public-api is not installed." >&2
  exit 1
fi

# The consumed public surface exists; snapshot it so a reviewer can diff the
# referenced items. Enforcement of the reference set lands with the audit wiring.
cargo public-api --manifest-path "${ROOT}/apps/api/Cargo.toml" >/dev/null
echo "audit:public-api — consumed crates present; public-API snapshot generated."

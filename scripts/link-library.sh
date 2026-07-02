#!/usr/bin/env bash
# Build @bymax-one/rust-auth from the sibling rust-auth checkout (WASM + dist)
# and resolve the file: link in this workspace. Idempotent; never run in CI.
set -euo pipefail

if [[ "${CI:-}" == "true" ]]; then
  echo "error: link-library.sh must not run in CI — the build-library job builds the package" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB_DIR="$(cd "${HERE}/../rust-auth/packages/rust-auth" 2>/dev/null && pwd || true)"

if [[ -z "${LIB_DIR}" || ! -d "${LIB_DIR}" ]]; then
  echo "error: expected the npm package at ${HERE}/../rust-auth/packages/rust-auth" >&2
  echo "       clone https://github.com/bymaxone/rust-auth next to this repo" >&2
  exit 1
fi

echo "==> Building ${LIB_DIR} (WASM then dist)"
# The package's dist/ and wasm/ are git-ignored and absent until built.
(cd "${LIB_DIR}" && pnpm install --frozen-lockfile=false && pnpm build:wasm && pnpm build)

echo "==> Resolving the file: link in $(basename "${HERE}")"
(cd "${HERE}" && pnpm install)

echo "==> Resolved:"
(cd "${HERE}/apps/web" && node --input-type=commonjs -e \
  "console.log(require.resolve('@bymax-one/rust-auth/shared'))")

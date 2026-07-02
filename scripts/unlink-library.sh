#!/usr/bin/env bash
# Remove the file:-linked @bymax-one/rust-auth from apps/web and restore a
# clean install state. Idempotent; never run in CI.
set -euo pipefail

if [[ "${CI:-}" == "true" ]]; then
  echo "error: unlink-library.sh must not run in CI" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINK_DIR="${HERE}/apps/web/node_modules/@bymax-one/rust-auth"

if [[ -d "${LINK_DIR}" ]]; then
  echo "==> Removing ${LINK_DIR}"
  rm -rf "${LINK_DIR}"
fi

echo "==> Restoring a clean install in $(basename "${HERE}")"
(cd "${HERE}" && pnpm install)

echo "==> Unlinked. Run scripts/link-library.sh to re-link."

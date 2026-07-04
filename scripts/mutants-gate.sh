#!/usr/bin/env bash
# Run cargo-mutants on apps/api and enforce the caught-ratio floor.
#
# cargo-mutants exits non-zero whenever ANY mutant survives, which is stricter
# than the project floor and gives no ratio. This wrapper recomputes
#   caught / (caught + missed)
# from mutants.out/ (timeouts count as caught; unviable mutants are excluded) and
# fails only below MUTANTS_MIN. --jobs is bounded for memory safety: each job
# reloads the path-linked library into its own module graph.
set -euo pipefail

# `--in-place` mutates the real source tree (restoring each mutant after its run) rather
# than a scratch copy: the api crate's `path = "../../../rust-auth/crates/*"` deps only
# resolve at the real sibling depth, which a copied tree breaks. In-place runs are
# inherently serial (cargo-mutants rejects `--jobs` with `--in-place`), so this is
# bounded/memory-safe by construction — never fan out parallel mutation.
MIN="${MUTANTS_MIN:-0.95}"
OUT="mutants.out"

echo "==> cargo mutants -p api --in-place (floor ${MIN})"
# Let cargo-mutants run to completion regardless of its own exit code; this
# wrapper owns the pass/fail decision from the recomputed ratio.
cargo mutants -p api --in-place || true

count() { if [[ -f "${OUT}/$1" ]]; then grep -c . "${OUT}/$1"; else echo 0; fi; }
caught=$(( $(count caught.txt) + $(count timeout.txt) ))
missed=$(count missed.txt)
total=$(( caught + missed ))

if (( total == 0 )); then
  echo "error: no viable mutants produced — check the cargo-mutants config" >&2
  exit 1
fi

ratio=$(awk -v c="${caught}" -v t="${total}" 'BEGIN { printf "%.4f", c / t }')
echo "==> caught=${caught} missed=${missed} ratio=${ratio} (floor ${MIN})"
if ! awk -v r="${ratio}" -v m="${MIN}" 'BEGIN { exit (r + 1e-9 < m) }'; then
  echo "error: mutation caught ratio ${ratio} below floor ${MIN}" >&2
  exit 1
fi
echo "==> mutation gate passed"

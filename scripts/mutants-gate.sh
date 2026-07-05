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

# Optional: scope the run to a unified-diff file (the changed lines only), so the
# pull-request gate stays well under the CI job cap while the full sweep runs nightly.
# Set MUTANTS_IN_DIFF=<path-to.diff> to enable; unset runs the full surface.
IN_DIFF="${MUTANTS_IN_DIFF:-}"
DIFF_ARGS=()
SCOPE="full surface"
if [[ -n "${IN_DIFF}" ]]; then
  DIFF_ARGS+=(--in-diff "${IN_DIFF}")
  SCOPE="--in-diff ${IN_DIFF}"
fi

echo "==> cargo mutants -p api --in-place (${SCOPE}, floor ${MIN})"
# Let cargo-mutants run to completion regardless of its own exit code; this
# wrapper owns the pass/fail decision from the recomputed ratio.
cargo mutants -p api --in-place "${DIFF_ARGS[@]}" || true

count() { if [[ -f "${OUT}/$1" ]]; then grep -c . "${OUT}/$1"; else echo 0; fi; }
caught=$(( $(count caught.txt) + $(count timeout.txt) ))
missed=$(count missed.txt)
total=$(( caught + missed ))

if (( total == 0 )); then
  # A scoped (--in-diff) run with nothing mutable is a pass — the change touched no
  # mutable API line. A full run with zero viable mutants is a misconfiguration.
  if [[ -n "${IN_DIFF}" ]]; then
    echo "==> no mutable API lines in the diff — mutation gate passed (nothing to test)"
    exit 0
  fi
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

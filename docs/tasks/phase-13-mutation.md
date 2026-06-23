# Phase 13 — Mutation Hardening

> **Status**: 📋 ToDo · **Progress**: 0 / 5 tasks · **Last updated**: 2026-06-23
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P13
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phase 12 closed the coverage walls: `cargo llvm-cov nextest` reports 100% on all metrics in `apps/api`, `pnpm -C apps/web test:cov` reports 100% in `apps/web`, the Playwright journeys pass against the live stack, and the `unit` / `e2e-api` / `e2e-web` / `coverage-report` CI jobs are green. The `--test-threads` and `maxWorkers: '50%'` caps are baked into the runner configs. Coverage proves every line/region/branch is *executed* by a test — it does not prove that any test would *fail* if that line changed. That gap is exactly what mutation testing closes.

This phase makes the **mutation floor real and enforced** in both workspaces. On the Rust side it arms `cargo-mutants` for `apps/api` (a `.cargo/mutants.toml` that scopes the mutated surface and pins `nextest` as the runner) plus a wrapper gate script that recomputes `caught / (caught + missed)` from `mutants.out/` and fails below `0.95` — because `cargo-mutants`, unlike Stryker, has no built-in `break` threshold (its own exit code is all-or-nothing). It then drives the API score from baseline to **≥ 95 (target 100)** by writing the tests that kill each surviving mutant, recording the numbers and any provable equivalents in `docs/mutation/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md`. On the browser side it adds `apps/web/stryker.config.json` (`break: 95`, `lib/**` driven to 100, `concurrency`/`maxWorkers` capped) and drives the web score up the same way, documenting survivors. Finally it wires the two mutation workflows: `mutation.yml` (a `dorny/paths-filter` `detect` job → conditional `mutation-api` running the gate script and `mutation-web` running Stryker incremental, both cached) and `mutation-nightly.yml` (a Monday cron full run that opens a `mutation-drift` issue when the floor regresses).

When P13 is done, `bash scripts/mutants-gate.sh` runs `cargo-mutants` over `apps/api` and reports a caught ratio at or above the `0.95` floor (driven to 100) with every surviving mutant either killed or documented as a provable equivalent; `pnpm -C apps/web exec stryker run` passes `break: 95` with `lib/**` at 100; `docs/mutation/` carries the baseline, the running history, and the equivalent-mutant justifications for both workspaces; and `mutation.yml` + `mutation-nightly.yml` are green and contractual (branch protection references `mutation-api` / `mutation-web` by name). **No documentation, security hardening, or release work happens here — those are Phase 14; this phase only stands up, drives, and gates the mutation surface. Never weaken a threshold to pass: kill the mutant with a test, or delete genuinely-dead code, or document a provable equivalent.**

---

## Rules-of-phase

1. **Never weaken a gate to pass.** A surviving mutant is fixed by adding the test that kills it or by removing genuinely-dead code — never by lowering `MUTANTS_MIN`, raising a Stryker `break`-exclusion, or excluding a live module from the mutated surface. The only acceptable non-kill is a **documented provable equivalent** recorded in `docs/mutation/IMPLEMENTATION_PLAN.md` with a written argument.
2. **The floor is `0.95`, the target is `100`.** Both workspaces must clear the mandatory `≥ 95` floor; both are driven as close to 100 as achievable (`apps/web` `lib/**` reaches a hard 100). The library itself holds this bar — the example matches it.
3. **`cargo-mutants` has no `break` config — the gate is a script.** `cargo-mutants` exits non-zero whenever *any* mutant survives, which is stricter than the `0.95` floor and gives no ratio. The wrapper `scripts/mutants-gate.sh` recomputes `caught / (caught + missed)` from `mutants.out/{caught,timeout,missed}.txt` (timeouts count as caught; `unviable` is excluded) and makes the final pass/fail decision against `MUTANTS_MIN`.
4. **Memory-safe execution — bounded jobs/workers, never parallel test agents.** `cargo-mutants --jobs` is capped (`MUTANTS_JOBS`, default `2`); `stryker.config.json` `concurrency` is capped and the Vitest runner keeps `maxWorkers: '50%'`. Run the suites sequentially in one agent — never fan out parallel mutation agents (each duplicates the `path`-linked library into its own module graph and can OOM the machine).
5. **The mutated surface excludes only non-executable glue.** `apps/api` excludes `main.rs` and generated/`#[cfg(test)]`-only code; `apps/web` excludes `*.d.ts`, barrels, configs, `app/**` route shells, and the verbatim shadcn `components/ui/*` wrappers (structural, not logic). Excluding a live logic module to inflate the score is forbidden.
6. **`docs/mutation/` is the system of record.** `BASELINE.md` captures the first measurement per workspace; `HISTORY.md` is the append-only running log; `IMPLEMENTATION_PLAN.md` holds the rollout strategy and every documented equivalent. No survivor is "accepted" outside these files.
7. **CI job names are contractual.** `mutation-api` and `mutation-web` are referenced by name in branch protection; do not rename them. `mutation.yml` is PR-scoped (paths-filtered, cached/incremental); `mutation-nightly.yml` is the cold full run (Monday cron) that catches drift the incremental cache masks.
8. **English-only, timeless comments.** No `Phase N` / task / roadmap references in any committed source, config, workflow, script, or `docs/mutation/*` heading (a doc-*section* ref like `DEVELOPMENT_PLAN.md § P13` is fine; a plan-*stage* name is not). `git switch -c` only (never `git checkout -b`); Conventional Commits with no `Co-Authored-By` trailer.

---

## Reference docs

- [`docs/OVERVIEW.md`](../OVERVIEW.md) — § 17 "Testing Strategy" (the Mutation — API / web rows: `cargo-mutants` caught ratio ≥ 95 driven toward 100, Stryker `break ≥ 95` with `lib/**` 100, survivors documented in `docs/mutation/`; the note that `cargo-mutants` has no `break` config so the gate is a CI script computing `caught / (caught + missed)`; the `maxWorkers`/`--test-threads` caps baked in).
- [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P13 (scope + DoD), § 2 "Global Conventions" (the Mutation-score + Memory-safe rows), Appendix C (the Mutation — api / web gate rows + the `caught / (caught + missed)` note), Appendix D (the `mutation.yml` `detect` → `mutation-api` / `mutation-web` job set + the `mutation-nightly.yml` Monday cron / `mutation-drift` issue).
- [`docs/DASHBOARD.md`](../DASHBOARD.md) — the `apps/web` `lib/**` + `components/**` + `hooks/**` surface that Stryker mutates (the error-code localization, the OTP box, the sessions table, the `/react` hook wrappers).
- `/Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/.github/workflows/mutation.yml` · `.../mutation-nightly.yml` · `.../apps/web/stryker.config.json` · `.../docs/stryker/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md` — the sibling Stryker config, the `dorny/paths-filter` + cached-incremental workflow shape, and the mutation-docs structure to copy-and-adapt (rename `docs/stryker/` → `docs/mutation/`).
- `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/docs/tasks/phase-12-release-supply-chain.md` — the `cargo-mutants` gate + `mutants.toml` floor pattern from the library repo.
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 13.1 | `cargo-mutants` config + caught-ratio gate (api) | 📋 ToDo | P0 | M | — |
| 13.2 | Drive API mutation → ≥ 95 (target 100) | 📋 ToDo | P0 | L | 13.1 |
| 13.3 | Stryker config (web) | 📋 ToDo | P0 | M | — |
| 13.4 | Drive web mutation → ≥ 95 (target 100) | 📋 ToDo | P0 | L | 13.3 |
| 13.5 | Mutation CI workflows (PR + nightly) | 📋 ToDo | P1 | M | 13.1, 13.3 |

---

## Tasks

### Task 13.1 — `cargo-mutants` config + caught-ratio gate (api)

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Add a `.cargo/mutants.toml` that scopes the `apps/api` mutated surface and pins `nextest` as the runner, plus a `scripts/mutants-gate.sh` wrapper that runs `cargo-mutants` (bounded `--jobs`) and recomputes `caught / (caught + missed)` from `mutants.out/`, failing below the `0.95` floor.

#### Acceptance criteria

- [ ] `.cargo/mutants.toml` sets `test_tool = "nextest"`, `additional_cargo_args = ["--features", "full"]`, a bounded `timeout_multiplier` + `minimum_test_timeout`, and `exclude_globs` for non-executable glue (`apps/api/src/main.rs` and any pure-bootstrap module) — no live logic module excluded.
- [ ] `scripts/mutants-gate.sh` runs `cargo mutants -p api --jobs "${MUTANTS_JOBS:-2}"`, then computes `caught = caught.txt + timeout.txt`, `missed = missed.txt`, `ratio = caught / (caught + missed)`, prints the ratio, and exits `1` when `ratio < MUTANTS_MIN` (default `0.95`), `0` otherwise; `unviable.txt` is excluded from the denominator.
- [ ] `cargo mutants --list -p api` enumerates candidate mutants (the config is valid and the surface is non-empty).
- [ ] The gate logic is self-proving: `MUTANTS_MIN=1.001 bash scripts/mutants-gate.sh` exits non-zero (the floor trips) and a normal run at the achieved ratio exits 0.
- [ ] `--jobs` is bounded (`MUTANTS_JOBS`, default `2`) for memory safety; the script is executable (`chmod +x`) and `set -euo pipefail`.
- [ ] No `.gitkeep` / empty-directory placeholders are created; no phase/task references in any committed file.

#### Files to create / modify

- `.cargo/mutants.toml`
- `scripts/mutants-gate.sh`
- `package.json` (root — a `mutation:api` script invoking the gate, if surfaced there)

#### Agent prompt

````
You are a senior mutation-testing engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 13 (Mutation Hardening) — Task 13.1 of 5 (FIRST)

PRECONDITIONS
- Phase 12 brought apps/api to 100% coverage on all metrics under `cargo llvm-cov nextest`; the engine wiring, repositories, routes, error mapping, and audit/diagnostics code all exist and are fully tested. `nextest` is the test runner with bounded `--test-threads`.
- The cargo workspace root `Cargo.toml` has `members = ['apps/api']`; the api binary builds with `--features full`. `cargo-mutants` reads its config from `.cargo/mutants.toml` at the source-tree root.
- `cargo-mutants` is NOT yet installed in CI; locally install once with `cargo install cargo-mutants --locked` (document this as a one-time prerequisite). It exits non-zero whenever ANY mutant survives — stricter than the 0.95 floor and giving no ratio — so a wrapper script must compute the ratio.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "17. Testing Strategy" — the Mutation — API row (caught ratio ≥ 95 driven toward 100; survivors documented in docs/mutation/) and the explicit note that cargo-mutants has no Stryker-style `break`, so the gate is a CI script computing `caught / (caught + missed)`.
- docs/DEVELOPMENT_PLAN.md § "Phase 13" + § "2. Global Conventions" (the Mutation-score + Memory-safe rows) + Appendix C (the Mutation — api gate row + the `caught / (caught + missed)` note).
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/docs/tasks/phase-12-release-supply-chain.md § "Task 12.2" — the `cargo-mutants` gate + `mutants.toml` floor pattern to copy-and-adapt (a single workspace here, scoped to `-p api`).

TASK
Arm `cargo-mutants` for apps/api: author `.cargo/mutants.toml` (scope the mutated surface, pin nextest) and a `scripts/mutants-gate.sh` wrapper that runs cargo-mutants with bounded jobs and enforces the `caught / (caught + missed) ≥ 0.95` floor. Do NOT add tests or change app code — that is the next task; this task only stands up the config and the gate.

DELIVERABLES
1. `.cargo/mutants.toml`:
   ```toml
   # cargo-mutants configuration for the apps/api workspace.
   #
   # Runs the same test surface as coverage (nextest) so a mutant that survives
   # here is a genuine test-suite gap, not a runner mismatch. The mutated surface
   # excludes only non-executable bootstrap glue; every logic module is in scope.
   test_tool = "nextest"

   # Build the binary with its full feature set so mfa / oauth / platform code
   # is mutated, matching the coverage configuration.
   additional_cargo_args = ["--features", "full"]

   # Give each mutated run headroom over the baseline test time without hanging
   # CI: a mutant that loops forever is caught as a timeout (counts as killed).
   timeout_multiplier = 3.0
   minimum_test_timeout = 60

   # Non-executable glue only — never a live logic module.
   exclude_globs = [
       "apps/api/src/main.rs",
   ]
   ```
2. `scripts/mutants-gate.sh` (executable):
   ```bash
   #!/usr/bin/env bash
   # Run cargo-mutants on apps/api and enforce the caught-ratio floor.
   #
   # cargo-mutants exits non-zero whenever ANY mutant survives, which is stricter
   # than the project floor and gives no ratio. This wrapper recomputes
   #   caught / (caught + missed)
   # from mutants.out/ (timeouts count as caught; unviable mutants are excluded)
   # and fails only below MUTANTS_MIN. --jobs is bounded for memory safety.
   set -euo pipefail

   JOBS="${MUTANTS_JOBS:-2}"   # bounded: each job reloads the path-linked library
   MIN="${MUTANTS_MIN:-0.95}"
   OUT="mutants.out"

   echo "==> cargo mutants -p api --jobs ${JOBS} (floor ${MIN})"
   # Let cargo-mutants run to completion regardless of its own exit code; this
   # wrapper owns the pass/fail decision.
   cargo mutants -p api --jobs "${JOBS}" || true

   count() { [[ -f "${OUT}/$1" ]] && grep -c . "${OUT}/$1" || echo 0; }
   caught=$(( $(count caught.txt) + $(count timeout.txt) ))
   missed=$(count missed.txt)
   total=$(( caught + missed ))

   if (( total == 0 )); then
     echo "error: no viable mutants produced — check the cargo-mutants config" >&2
     exit 1
   fi

   ratio=$(awk -v c="${caught}" -v t="${total}" 'BEGIN { printf "%.4f", c / t }')
   echo "==> caught=${caught} missed=${missed} ratio=${ratio} (floor ${MIN})"
   awk -v r="${ratio}" -v m="${MIN}" 'BEGIN { exit (r + 1e-9 < m) }' || {
     echo "error: mutation caught ratio ${ratio} below floor ${MIN}" >&2
     exit 1
   }
   echo "==> mutation gate passed"
   ```
3. `package.json` (root) — `"scripts": { "mutation:api": "bash scripts/mutants-gate.sh" }` if surfaced as a script.

Constraints:
- Exclude ONLY non-executable glue (main.rs and any pure bootstrap). Never exclude a live logic module to inflate the ratio.
- `--jobs` MUST be bounded (default 2); never fan out parallel mutation agents.
- #![forbid(unsafe_code)] stays in the crate; the shell script is `set -euo pipefail`.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed file. No `.gitkeep`. `git switch -c` only.

Verification:
- `cargo mutants --list -p api` — expected: prints a non-empty list of candidate mutants (the config parses and the surface is non-empty).
- `MUTANTS_MIN=1.001 bash scripts/mutants-gate.sh` — expected: runs, prints the ratio, exits non-zero (proves the floor trips).
- `bash -n scripts/mutants-gate.sh` — expected: no syntax error; `test -x scripts/mutants-gate.sh` — expected: executable.
- `grep -riE "phase [0-9]|task [0-9]" .cargo/mutants.toml scripts/mutants-gate.sh` — expected: no matches.
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 5` and Last updated.
4. Update the P13 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 13.1 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `build(api): add cargo-mutants config + caught-ratio gate` (no Co-Authored-By).
````

---

### Task 13.2 — Drive API mutation → ≥ 95 (target 100)

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: L
- **Depends on**: 13.1

#### Description

Run `scripts/mutants-gate.sh`, read `mutants.out/missed.txt`, and add the `nextest` tests that kill each surviving mutant until the caught ratio reaches the `0.95` floor (driven toward 100); record the baseline, the running history, and every provable equivalent in `docs/mutation/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md` (the api sections).

#### Acceptance criteria

- [ ] `bash scripts/mutants-gate.sh` exits 0 with a caught ratio ≥ 0.95 (driven as close to 100 as achievable) for `apps/api`.
- [ ] Every mutant that survived the first run is either killed by a new/strengthened test or recorded in `docs/mutation/IMPLEMENTATION_PLAN.md` with a written provable-equivalent argument; no live logic module was excluded to raise the ratio.
- [ ] `docs/mutation/BASELINE.md` records the first apps/api measurement (date, commit, tool version, jobs, caught/missed/timeout/unviable counts, ratio); `docs/mutation/HISTORY.md` appends the drive-up entries; `docs/mutation/IMPLEMENTATION_PLAN.md` documents the strategy + each equivalent.
- [ ] Every added test names the scenario and the rule it protects (e.g. *"lockout triggers on the Nth failed attempt, not the N+1th — protects the brute-force boundary"*), and the suite still passes under `cargo nextest run -p api`.
- [ ] `cargo llvm-cov nextest -p api` still reports 100% (the new tests do not regress coverage); `cargo fmt --all --check` + `cargo clippy --workspace --all-targets -- -D warnings` clean.
- [ ] No phase/task references in the new tests or the `docs/mutation/*` files (a `DEVELOPMENT_PLAN.md § P13` doc-section ref is allowed; a plan-stage name is not).

#### Files to create / modify

- `apps/api/src/**` test modules (`#[cfg(test)] mod tests`) and/or `apps/api/tests/*.rs` (the killing tests)
- `docs/mutation/BASELINE.md`, `docs/mutation/HISTORY.md`, `docs/mutation/IMPLEMENTATION_PLAN.md`

#### Agent prompt

````
You are a senior mutation-testing engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 13 (Mutation Hardening) — Task 13.2 of 5 (MIDDLE)

PRECONDITIONS
- Task 13.1 is done: `.cargo/mutants.toml` (nextest, `--features full`, glue excluded) and `scripts/mutants-gate.sh` (the `caught / (caught + missed) ≥ 0.95` gate, bounded `--jobs`) exist and run.
- apps/api is at 100% coverage on all metrics under `cargo llvm-cov nextest`. Coverage proves execution, not assertion strength — surviving mutants mark the lines a test runs but does not assert on.
- `docs/mutation/` does not exist yet; create it on first write (no `.gitkeep`, no empty scaffold).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "17. Testing Strategy" — the Mutation — API row (caught ratio ≥ 95 driven toward 100; survivors documented as provable equivalents in docs/mutation/) and the "every test names the scenario and the rule it protects" requirement.
- docs/DEVELOPMENT_PLAN.md § "Phase 13" (DoD) + Appendix C (the Mutation — api gate).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/docs/stryker/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md — copy-and-adapt the documentation STRUCTURE (summary table, per-survivor rows, equivalent-mutant arguments) into docs/mutation/ for the Rust workspace; the numbers are different.

TASK
Drive the apps/api mutation score to ≥ 0.95 (target 100). Run the gate, read `mutants.out/missed.txt`, and for each surviving mutant write the smallest nextest test that fails on the mutated code and passes on the real code — or, if it is a provable equivalent, document the argument. Record the baseline + history + plan in docs/mutation/. Do NOT touch non-test application logic except to delete genuinely-dead code (with justification).

DELIVERABLES
1. New / strengthened tests under `apps/api/src/**` (`#[cfg(test)] mod tests`) and/or `apps/api/tests/*.rs`. Each kills a specific surviving mutant. Example shape for a boundary mutant (`>=` → `>` on a lockout threshold):
   ```rust
   #[cfg(test)]
   mod lockout_boundary {
       use super::*;

       /// Lockout engages on exactly the configured number of failures, not one
       /// more. Kills the `>=` → `>` boundary mutant on the threshold check —
       /// protects the brute-force lockout boundary.
       #[tokio::test]
       async fn locks_on_the_threshold_attempt_not_after() {
           let attempts = LOCKOUT_THRESHOLD; // the exact boundary value
           let outcome = evaluate_lockout(attempts).await;
           assert!(
               outcome.is_locked(),
               "must lock at the threshold; a `>` mutant would let one extra attempt through"
           );
       }
   }
   ```
2. `docs/mutation/BASELINE.md` — the first apps/api measurement:
   ```markdown
   # Mutation Testing — Baseline

   > **Recorded**: <YYYY-MM-DD>
   > **Commit**: `<sha>`
   > **Tool**: `cargo-mutants <version>` · **Runner**: nextest · **Jobs**: 2
   > **Floor**: 0.95 (target 1.00)

   | Workspace  | Caught | Missed | Timeout | Unviable | Ratio | Runtime |
   | ---------- | ------ | ------ | ------- | -------- | ----- | ------- |
   | `apps/api` | <n>    | <n>    | <n>     | <n>      | <r>   | <t>     |
   ```
3. `docs/mutation/HISTORY.md` — append-only running log (one row per drive-up pass: date, commit, ratio before → after, mutants killed).
4. `docs/mutation/IMPLEMENTATION_PLAN.md` — the rollout strategy + a table of every documented provable-equivalent mutant (location, mutation, why no behavioural test can distinguish it).

Constraints:
- Kill mutants with TESTS, never by weakening the gate, raising an exclude, or removing a live module from scope. The only non-kill is a documented provable equivalent.
- Tests only (plus dead-code deletion with justification). Do not change behavioural application code to dodge a mutant.
- No `unwrap`/`expect`/`panic!` in non-test helpers; test code may use them freely.
- Memory-safe: run `cargo nextest run -p api --test-threads <bounded>` and `scripts/mutants-gate.sh` with bounded `MUTANTS_JOBS`; never fan out parallel mutation agents.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in tests or docs/mutation/* headings. No `.gitkeep`. `git switch -c` only.

Verification:
- `bash scripts/mutants-gate.sh` — expected: prints `mutation gate passed` with ratio ≥ 0.95 for apps/api.
- `cargo nextest run -p api` — expected: all tests pass (the killing tests are green on the real code).
- `cargo llvm-cov nextest -p api --lcov` — expected: still 100% on all metrics (no coverage regression).
- `cargo fmt --all --check` — expected: no diff; `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `grep -riE "phase [0-9]|task [0-9]" docs/mutation/` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 5` and Last updated.
4. Update the P13 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 13.2 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(api): drive mutation score to the floor + document survivors` (no Co-Authored-By).
````

---

### Task 13.3 — Stryker config (web)

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Author `apps/web/stryker.config.json` (Vitest runner, `break: 95`, mutating `lib/**` + `components/**` with the verbatim shadcn `components/ui/*` wrappers excluded) plus a `lib/**`-scoped config that enforces a hard `break: 100`, both with `concurrency`/`maxWorkers` caps.

#### Acceptance criteria

- [ ] `apps/web/stryker.config.json` uses the Vitest runner (`vitest.config.ts`), `coverageAnalysis: "perTest"`, `mutate: ['lib/**/*.ts', 'components/**/*.tsx', …]` excluding `*.test.*`, `*.d.ts`, barrels, configs, and the verbatim `components/ui/*` shadcn wrappers, with `ignorePatterns` for `.next` / `coverage` / `e2e` / `app` / `.stryker-tmp`.
- [ ] `thresholds` is `{ "high": 100, "low": 95, "break": 95 }`; `concurrency` is bounded (≤ the Vitest `maxWorkers: '50%'` budget); `incremental: true` with `incrementalFile: "reports/stryker-incremental.json"`; the HTML report lands under `reports/mutation/web.html`.
- [ ] A `lib/**`-only config (`apps/web/stryker.lib.config.json`) extends the base, narrows `mutate` to `lib/**/*.ts`, and sets `break: 100` — so the mandatory `lib/** 100` invariant is independently enforceable.
- [ ] Root/web scripts wire it: `mutation:web` (base, `break 95`) and `mutation:web:lib` (`--config-file stryker.lib.config.json`, `break 100`).
- [ ] `pnpm -C apps/web exec stryker run --help` resolves the config (Stryker installed); `node -e "JSON.parse(require('fs').readFileSync('apps/web/stryker.config.json','utf8'))"` parses.
- [ ] No `.gitkeep` / empty-directory placeholders; no phase/task references in the configs.

#### Files to create / modify

- `apps/web/stryker.config.json`
- `apps/web/stryker.lib.config.json`
- `apps/web/package.json` (the `@stryker-mutator/*` devDeps + the `mutation:web` / `mutation:web:lib` scripts)

#### Agent prompt

````
You are a senior mutation-testing engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 13 (Mutation Hardening) — Task 13.3 of 5 (MIDDLE)

PRECONDITIONS
- Phase 12 brought apps/web to 100% coverage under `pnpm -C apps/web test:cov` (Vitest 4, jsdom) with `maxWorkers: '50%'` baked into `vitest.config.ts`. `lib/**`, `components/**`, and `hooks/**` are all covered.
- The verbatim shadcn `components/ui/*` wrappers are copied design-system primitives (structural, not logic) — they are excluded from the mutated surface, exactly as the sibling does.
- Stryker is not yet a dependency; add `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` to `apps/web` devDependencies.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "17. Testing Strategy" — the Mutation — web row (Stryker `break ≥ 95`, `lib/**` 100, driven toward 100, survivors documented) and the `maxWorkers` cap note.
- docs/DEVELOPMENT_PLAN.md § "Phase 13" + Appendix C (the Mutation — web gate: break ≥ 95, `lib/**` 100) + the Memory-safe row (Vitest `maxWorkers: '50%'`, bounded concurrency).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/apps/web/stryker.config.json — copy-and-adapt the Vitest-runner config (mutate globs, the `components/ui/*` exclusions, `incremental`, the HTML report path). Change `thresholds.break` from 100 to 95 for the base config, and add the separate `lib/**` config at break 100.

TASK
Author the web Stryker configuration: a base `stryker.config.json` (`break 95`, lib + components, shadcn wrappers excluded, caps applied) and a `lib/**`-scoped `stryker.lib.config.json` (`break 100`) so the mandatory lib invariant is independently enforced. Wire the npm scripts. Do NOT run a full drive-up or add tests — that is the next task.

DELIVERABLES
1. `apps/web/stryker.config.json`:
   ```json
   {
     "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
     "packageManager": "pnpm",
     "plugins": ["@stryker-mutator/vitest-runner"],
     "testRunner": "vitest",
     "vitest": { "configFile": "vitest.config.ts" },
     "coverageAnalysis": "perTest",
     "ignoreStatic": true,
     "mutate": [
       "lib/**/*.ts",
       "components/**/*.tsx",
       "hooks/**/*.ts",
       "!**/*.test.ts",
       "!**/*.test.tsx",
       "!**/*.d.ts",
       "!**/index.ts",
       "!**/*.config.ts",
       "!components/ui/**"
     ],
     "ignorePatterns": [".next", "coverage", "e2e", "playwright-report", "app", ".stryker-tmp"],
     "thresholds": { "high": 100, "low": 95, "break": 95 },
     "concurrency": 2,
     "timeoutMS": 30000,
     "incremental": true,
     "incrementalFile": "reports/stryker-incremental.json",
     "reporters": ["progress", "clear-text", "html"],
     "htmlReporter": { "fileName": "reports/mutation/web.html" },
     "tempDirName": ".stryker-tmp",
     "cleanTempDir": true
   }
   ```
2. `apps/web/stryker.lib.config.json` — the hard `lib/**` invariant:
   ```json
   {
     "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
     "packageManager": "pnpm",
     "plugins": ["@stryker-mutator/vitest-runner"],
     "testRunner": "vitest",
     "vitest": { "configFile": "vitest.config.ts" },
     "coverageAnalysis": "perTest",
     "ignoreStatic": true,
     "mutate": ["lib/**/*.ts", "!**/*.test.ts", "!**/*.d.ts", "!**/index.ts"],
     "ignorePatterns": [".next", "coverage", "e2e", "playwright-report", "app", "components", ".stryker-tmp"],
     "thresholds": { "high": 100, "low": 100, "break": 100 },
     "concurrency": 2,
     "incremental": false,
     "reporters": ["progress", "clear-text"]
   }
   ```
3. `apps/web/package.json` — add devDeps `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` and scripts:
   ```json
   {
     "scripts": {
       "mutation:web": "stryker run",
       "mutation:web:lib": "stryker run --config-file stryker.lib.config.json"
     }
   }
   ```

Constraints:
- `concurrency` is bounded (≤ the Vitest `maxWorkers: '50%'` budget); never fan out parallel mutation agents.
- Exclude ONLY structural wrappers (`components/ui/**`), barrels, configs, types — never a live logic module.
- TypeScript strict, zero `any`, zero suppression comments; English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed file. No `.gitkeep`. `git switch -c` only.

Verification:
- `node -e "JSON.parse(require('fs').readFileSync('apps/web/stryker.config.json','utf8'))" && node -e "JSON.parse(require('fs').readFileSync('apps/web/stryker.lib.config.json','utf8'))"` — expected: both parse (valid JSON).
- `pnpm -C apps/web exec stryker run --help` — expected: Stryker resolves and prints usage (the plugin/runner are installed).
- `pnpm -C apps/web typecheck && pnpm -C apps/web lint` — expected: pass (the package.json edit is valid).
- `grep -riE "phase [0-9]|task [0-9]" apps/web/stryker.config.json apps/web/stryker.lib.config.json` — expected: no matches.
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 5` and Last updated.
4. Update the P13 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 13.3 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `build(web): add Stryker config (break 95, lib 100)` (no Co-Authored-By).
````

---

### Task 13.4 — Drive web mutation → ≥ 95 (target 100)

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: L
- **Depends on**: 13.3

#### Description

Run Stryker over `apps/web`, read the survived mutants, and add the Vitest tests that kill each one until the base config passes `break: 95` and the `lib/**` config passes `break: 100`; document the baseline + history + provable equivalents in `docs/mutation/` (the web sections).

#### Acceptance criteria

- [ ] `pnpm -C apps/web exec stryker run` passes `break: 95` and `pnpm -C apps/web run mutation:web:lib` passes `break: 100` (`lib/**`).
- [ ] Every survived mutant is killed by a new/strengthened Vitest test or documented as a provable equivalent in `docs/mutation/IMPLEMENTATION_PLAN.md`; no live module was excluded to raise the score.
- [ ] `docs/mutation/BASELINE.md` gains the `apps/web` row, `docs/mutation/HISTORY.md` gains the web drive-up entries, and `IMPLEMENTATION_PLAN.md` documents the web equivalents.
- [ ] Each added test names its scenario and the rule it protects; `pnpm -C apps/web test:cov` still reports 100% (no coverage regression); `pnpm -C apps/web typecheck && lint` clean.
- [ ] Stryker runs with bounded `concurrency` (the config cap) — no parallel mutation agents; no phase/task references in the new tests or `docs/mutation/*`.

#### Files to create / modify

- `apps/web/lib/**`, `apps/web/components/**`, `apps/web/hooks/**` test files (`*.test.ts` / `*.test.tsx`)
- `docs/mutation/BASELINE.md`, `docs/mutation/HISTORY.md`, `docs/mutation/IMPLEMENTATION_PLAN.md` (web sections)

#### Agent prompt

````
You are a senior mutation-testing engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 13 (Mutation Hardening) — Task 13.4 of 5 (MIDDLE)

PRECONDITIONS
- Task 13.3 is done: `apps/web/stryker.config.json` (Vitest runner, `break 95`, shadcn wrappers excluded, caps) and `apps/web/stryker.lib.config.json` (`lib/** break 100`) exist; the `mutation:web` / `mutation:web:lib` scripts run.
- apps/web is at 100% coverage under `pnpm -C apps/web test:cov`. Survived mutants mark code the tests run but do not assert on — typically string-literal swaps in the error-code localization, conditional-boundary flips in the OTP/session logic, and the `/react` hook wrappers.
- `docs/mutation/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md` already exist with the apps/api sections from the API drive-up; add the web sections to the same files.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "17. Testing Strategy" — the Mutation — web row (Stryker `break ≥ 95`, `lib/**` 100, survivors documented) and the "every test names the scenario and the rule it protects" requirement.
- docs/DASHBOARD.md — the `lib/**` (error-code localization + severity, the auth client/fetch wrappers), `components/**` (the OTP box, the sessions table), and `hooks/**` (the `/react` wrappers) surface Stryker mutates.
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/docs/stryker/IMPLEMENTATION_PLAN.md — copy-and-adapt the survivor-table + equivalent-argument structure into docs/mutation/ (web section).

TASK
Drive the apps/web mutation score to pass `break 95` (base) and `break 100` (lib). Run Stryker, read the survived mutants from the report, and for each write the smallest Vitest test that fails on the mutant and passes on the real code — or document a provable equivalent. Add the web rows to docs/mutation/. Do NOT change application logic except to delete genuinely-dead code (with justification).

DELIVERABLES
1. New / strengthened Vitest tests under `apps/web/lib/**`, `components/**`, `hooks/**`. Each kills a specific survived mutant. Example shape for a string-literal mutant in the error-code localization:
   ```ts
   import { describe, expect, it } from 'vitest';
   import { localizeAuthError } from '@/lib/shared/localize-auth-error';

   describe('localizeAuthError', () => {
     // Asserts the exact user-facing string for a known code. Kills the
     // string-literal mutant that swaps the message for "" — protects the
     // never-show-a-raw-error-code contract.
     it('maps invalid_credentials to its localized message', () => {
       expect(localizeAuthError('auth.invalid_credentials')).toBe(
         'Incorrect email or password.',
       );
     });
   });
   ```
2. `docs/mutation/BASELINE.md` — add the `apps/web` row to the summary table (caught/survived/timeout/no-coverage counts, score, runtime).
3. `docs/mutation/HISTORY.md` — append the web drive-up entries (date, commit, score before → after, mutants killed).
4. `docs/mutation/IMPLEMENTATION_PLAN.md` — add the web survivor/equivalent table (location, mutation, why no behavioural test distinguishes it).

Constraints:
- Kill mutants with TESTS, never by weakening `break` or adding a live module to the exclude list. The only non-kill is a documented provable equivalent.
- Tests only (plus dead-code deletion with justification). Do not change behavioural app code to dodge a mutant.
- TypeScript strict, zero `any`, zero suppression comments; bounded Stryker `concurrency` + Vitest `maxWorkers: '50%'`; never fan out parallel mutation agents.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in tests or docs/mutation/* headings. No `.gitkeep`. `git switch -c` only.

Verification:
- `pnpm -C apps/web exec stryker run` — expected: passes `break: 95` (base config).
- `pnpm -C apps/web run mutation:web:lib` — expected: passes `break: 100` (`lib/**`).
- `pnpm -C apps/web test:cov` — expected: still 100% on all metrics (no coverage regression).
- `pnpm -C apps/web typecheck && pnpm -C apps/web lint` — expected: pass.
- `grep -riE "phase [0-9]|task [0-9]" docs/mutation/ apps/web/lib apps/web/components apps/web/hooks` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 5` and Last updated.
4. Update the P13 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 13.4 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(web): drive Stryker score to the floor + document survivors` (no Co-Authored-By).
````

---

### Task 13.5 — Mutation CI workflows (PR + nightly)

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: 13.1, 13.3

#### Description

Replace the P0 skeletons with the working `mutation.yml` (a `dorny/paths-filter` `detect` job → conditional `mutation-api` running `scripts/mutants-gate.sh` cached + `mutation-web` running Stryker incremental cached) and `mutation-nightly.yml` (a Monday cron full run that uploads reports and opens a `mutation-drift` issue on failure). This is the LAST task — it also runs the per-phase closeout.

#### Acceptance criteria

- [ ] `.github/workflows/mutation.yml` triggers on `pull_request` with a `paths` filter, a `detect` job using `dorny/paths-filter@v3` (outputs `api` / `web`), and conditional `mutation-api` / `mutation-web` jobs (job names unchanged — they are contractual for branch protection).
- [ ] `mutation-api` installs `cargo-mutants`, restores a `Swatinem/rust-cache` cache, and runs `bash scripts/mutants-gate.sh` with `MUTANTS_JOBS` bounded; `mutation-web` restores the Stryker incremental cache (`apps/web/reports/stryker-incremental.json`, keyed by ref/sha with a `main` fallback) and runs `stryker run`, uploading `mutation-report-{api,web}`.
- [ ] `.github/workflows/mutation-nightly.yml` runs `schedule: '0 3 * * 1'` (Mondays 03:00 UTC) + `workflow_dispatch`, with `full-api` (cold `mutants-gate.sh`) / `full-web` (`stryker run --force`) jobs, 90-day report artifacts, and a final step that opens a `mutation-drift`-labelled issue when a job fails.
- [ ] Both workflows declare top-level `permissions: contents: read` (the nightly issue step widens to `issues: write`), `concurrency` with `cancel-in-progress`, pinned actions, and `timeout-minutes` per job.
- [ ] `actionlint .github/workflows/mutation.yml .github/workflows/mutation-nightly.yml` is clean (or `yamllint` if actionlint is unavailable); no phase/task references in either workflow.
- [ ] Per-phase closeout performed (see Completion Protocol): P13 flipped to ✅ / 5 of 5, Active phase advanced to P14, Overall progress recomputed.

#### Files to create / modify

- `.github/workflows/mutation.yml`
- `.github/workflows/mutation-nightly.yml`

#### Agent prompt

````
You are a senior mutation-testing engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 13 (Mutation Hardening) — Task 13.5 of 5 (LAST)

PRECONDITIONS
- Task 13.1 is done: `.cargo/mutants.toml` + `scripts/mutants-gate.sh` (the `caught / (caught + missed) ≥ 0.95` gate, bounded `--jobs`) exist and pass on apps/api.
- Task 13.3 is done: `apps/web/stryker.config.json` (`break 95`, incremental, `reports/stryker-incremental.json`) + the `mutation:web` script exist; apps/web passes.
- Phase 0 scaffolded `mutation.yml` + `mutation-nightly.yml` as runnable skeletons; this task replaces them with the working pipeline. Branch protection references the job names `mutation-api` and `mutation-web` — do not rename them. The npm package must be built first (the `build-library` job / `scripts/link-library.sh`) so the `file:` link resolves before the web mutation run.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md § "Phase 13" + Appendix D (the `mutation.yml` `detect` → `mutation-api` / `mutation-web` job set + the `mutation-nightly.yml` Monday cron / `mutation-drift` issue) + the Memory-safe row (bounded `--jobs` / `concurrency`).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/.github/workflows/mutation.yml — copy-and-adapt the `dorny/paths-filter@v3` `detect` job + the conditional per-workspace jobs + the cached-incremental restore; switch the api job from Stryker to `cargo-mutants` via `scripts/mutants-gate.sh`.
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/.github/workflows/mutation-nightly.yml — copy-and-adapt the `schedule: '0 3 * * 1'` cron + the cold full-run jobs + the 90-day artifacts; ADD the `mutation-drift` issue-creation step (the sibling lacks it).

TASK
Replace the two mutation workflow skeletons with the working pipeline: `mutation.yml` (paths-filtered, per-workspace, cached) running `scripts/mutants-gate.sh` for api and `stryker run` for web; `mutation-nightly.yml` (Monday cron, cold full runs) that opens a `mutation-drift` issue on failure. Then run the per-phase closeout.

DELIVERABLES
1. `.github/workflows/mutation.yml`:
   ```yaml
   name: Mutation Testing (PR)

   on:
     pull_request:
       paths:
         - 'apps/api/src/**'
         - 'apps/api/tests/**'
         - '.cargo/mutants.toml'
         - 'scripts/mutants-gate.sh'
         - 'apps/web/{lib,components,hooks}/**'
         - 'apps/web/stryker*.config.json'
         - 'apps/web/vitest.config.ts'
         - 'pnpm-lock.yaml'
         - 'Cargo.lock'
         - '.github/workflows/mutation.yml'

   concurrency:
     group: mutation-${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true

   permissions:
     contents: read

   jobs:
     detect:
       name: Detect changed workspaces
       runs-on: ubuntu-latest
       timeout-minutes: 5
       outputs:
         api: ${{ steps.filter.outputs.api }}
         web: ${{ steps.filter.outputs.web }}
       steps:
         - uses: actions/checkout@v5
         - uses: dorny/paths-filter@v3
           id: filter
           with:
             filters: |
               api:
                 - 'apps/api/src/**'
                 - 'apps/api/tests/**'
                 - '.cargo/mutants.toml'
                 - 'scripts/mutants-gate.sh'
                 - 'Cargo.lock'
               web:
                 - 'apps/web/{lib,components,hooks}/**'
                 - 'apps/web/stryker*.config.json'
                 - 'apps/web/vitest.config.ts'
                 - 'pnpm-lock.yaml'

     mutation-api:
       name: Mutation — apps/api
       needs: detect
       if: needs.detect.outputs.api == 'true'
       runs-on: ubuntu-latest
       timeout-minutes: 30
       env:
         MUTANTS_JOBS: '2'   # bounded for memory safety
       steps:
         - uses: actions/checkout@v5
         - uses: dtolnay/rust-toolchain@<pin>   # pinned action; toolchain from rust-toolchain.toml
         - uses: Swatinem/rust-cache@v2
         - run: cargo install cargo-mutants --locked
         - run: bash scripts/mutants-gate.sh
         - uses: actions/upload-artifact@v4
           if: always()
           with:
             name: mutation-report-api
             path: mutants.out/
             retention-days: 30

     mutation-web:
       name: Mutation — apps/web
       needs: detect
       if: needs.detect.outputs.web == 'true'
       runs-on: ubuntu-latest
       timeout-minutes: 30
       steps:
         - uses: actions/checkout@v5
           with: { fetch-depth: 0 }
         - uses: pnpm/action-setup@v4
           with: { version: 10.8.0 }
         - uses: actions/setup-node@v5
           with: { node-version: '24', cache: pnpm }
         # link-library.sh runs build:wasm (wasm-pack) — needs a Rust + wasm toolchain.
         - uses: dtolnay/rust-toolchain@<pin>   # pinned action; toolchain from rust-toolchain.toml
           with:
             targets: wasm32-unknown-unknown
         - uses: Swatinem/rust-cache@v2
         - run: cargo install wasm-pack --locked
         - run: bash scripts/link-library.sh   # build the npm package so file: resolves
           env: { CI: 'false' }
         - run: pnpm install --frozen-lockfile
         - name: Restore Stryker incremental cache
           uses: actions/cache@v4
           with:
             path: apps/web/reports/stryker-incremental.json
             key: stryker-web-${{ github.ref }}-${{ github.sha }}
             restore-keys: |
               stryker-web-${{ github.ref }}-
               stryker-web-refs/heads/main-
         - run: pnpm -C apps/web exec stryker run
         - uses: actions/upload-artifact@v4
           if: always()
           with:
             name: mutation-report-web
             path: apps/web/reports/mutation/
             retention-days: 30
   ```
2. `.github/workflows/mutation-nightly.yml` — Monday cron, cold full runs, opens a `mutation-drift` issue on failure:
   ```yaml
   name: Mutation Testing (Nightly Full)

   on:
     schedule:
       - cron: '0 3 * * 1'   # Mondays 03:00 UTC
     workflow_dispatch:

   concurrency:
     group: mutation-nightly-${{ github.ref }}
     cancel-in-progress: false

   permissions:
     contents: read

   jobs:
     full-api:
       name: Mutation full — apps/api
       runs-on: ubuntu-latest
       timeout-minutes: 60
       env:
         MUTANTS_JOBS: '2'
       steps:
         - uses: actions/checkout@v5
         - uses: dtolnay/rust-toolchain@<pin>   # pinned action; toolchain from rust-toolchain.toml
         - uses: Swatinem/rust-cache@v2
         - run: cargo install cargo-mutants --locked
         - run: bash scripts/mutants-gate.sh
         - uses: actions/upload-artifact@v4
           if: always()
           with:
             name: mutation-report-api-full
             path: mutants.out/
             retention-days: 90

     full-web:
       name: Mutation full — apps/web
       runs-on: ubuntu-latest
       timeout-minutes: 60
       steps:
         - uses: actions/checkout@v5
         - uses: pnpm/action-setup@v4
           with: { version: 10.8.0 }
         - uses: actions/setup-node@v5
           with: { node-version: '24', cache: pnpm }
         # link-library.sh runs build:wasm (wasm-pack) — needs a Rust + wasm toolchain.
         - uses: dtolnay/rust-toolchain@<pin>   # pinned action; toolchain from rust-toolchain.toml
           with:
             targets: wasm32-unknown-unknown
         - uses: Swatinem/rust-cache@v2
         - run: cargo install wasm-pack --locked
         - run: bash scripts/link-library.sh
           env: { CI: 'false' }
         - run: pnpm install --frozen-lockfile
         - run: pnpm -C apps/web exec stryker run --force
         - uses: actions/upload-artifact@v4
           if: always()
           with:
             name: mutation-report-web-full
             path: apps/web/reports/mutation/
             retention-days: 90

     report-drift:
       name: Open drift issue on failure
       needs: [full-api, full-web]
       if: failure()
       runs-on: ubuntu-latest
       timeout-minutes: 5
       permissions:
         contents: read
         issues: write
       steps:
         - uses: actions/github-script@v7
           with:
             script: |
               await github.rest.issues.create({
                 owner: context.repo.owner,
                 repo: context.repo.repo,
                 title: `Mutation drift detected (${new Date().toISOString().slice(0, 10)})`,
                 labels: ['mutation-drift'],
                 body: `The nightly full mutation run dropped below the floor.\n\nRun: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
               });
   ```

Constraints:
- Do NOT rename `mutation-api` / `mutation-web` (branch protection references them by name).
- Bounded `MUTANTS_JOBS` + bounded Stryker `concurrency`; never fan out parallel mutation agents.
- Top-level `permissions: contents: read`; the issue step widens to `issues: write` only. Pinned actions; `timeout-minutes` per job; `concurrency` set.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in either workflow. No `.gitkeep`. `git switch -c` only.

Verification:
- `actionlint .github/workflows/mutation.yml .github/workflows/mutation-nightly.yml` — expected: clean (or `yamllint` valid if actionlint is unavailable).
- `grep -E 'name: Mutation — apps/(api|web)' .github/workflows/mutation.yml` — expected: both contractual job names present.
- `grep -E "cron: '0 3 \* \* 1'" .github/workflows/mutation-nightly.yml` — expected: the Monday cron matches.
- `grep -n 'mutation-drift' .github/workflows/mutation-nightly.yml` — expected: the issue label present.
- `grep -riE "phase [0-9]|task [0-9]" .github/workflows/mutation.yml .github/workflows/mutation-nightly.yml` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `5 / 5` and Last updated.
4. Update the P13 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 13.5 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `ci: wire mutation PR + nightly workflows` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol: confirm all five tasks are ✅ and the DoD is met with CI green on the merged PR; in docs/DEVELOPMENT_PLAN.md set the P13 Status to ✅, Progress 5 / 5, Last updated, advance the Active phase to P14, and recompute Overall progress; set this file's header Status to ✅; commit `docs(plan): P13 complete`. If any DoD bullet is unmet, use 🟡 Partial instead of ✅.)
````

---

## Phase Completion Protocol

Run this closeout when the LAST task (13.5) is ✅:

1. Confirm every task (13.1–13.5) is ✅ and each Phase-13 Definition-of-Done bullet in [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P13 is observably met: `bash scripts/mutants-gate.sh` passes the ≥ 0.95 caught gate on `apps/api` (target 100); `pnpm -C apps/web exec stryker run` passes `break: 95` (`lib/**` 100); survivors documented in `docs/mutation/`; `mutation.yml` + `mutation-nightly.yml` green.
2. Confirm the PR is merged to `main` and CI is fully green (no skipped required check; `mutation-api` / `mutation-web` green on the PR-changed workspaces).
3. In `docs/DEVELOPMENT_PLAN.md`: set the P13 **Status** to ✅, **Progress** to `5 / 5`, refresh **Last updated**, advance the **Active phase** to P14, and recompute **Overall progress** (phases and tasks).
4. In this file's header, set **Status** to ✅ and refresh **Last updated**.
5. Commit `docs(plan): P13 complete` (no `Co-Authored-By`).
6. If any DoD bullet is unmet or a required check is red, mark P13 **🟡 Partial** (never ✅) and record the gap.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

_(empty — no tasks completed yet)_

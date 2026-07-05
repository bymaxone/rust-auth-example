# Mutation baseline

The first full mutation measurement per workspace, before any survivor was driven out. See
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the disposition of each survivor and
[`HISTORY.md`](./HISTORY.md) for the running log.

## apps/api — cargo-mutants

- **Date:** 2026-07-05
- **Surface:** default features (the only cargo feature, `argon2`, is non-default), `main.rs` and
  `bin/seed.rs` excluded as non-executable glue; run through `nextest` with Postgres, Redis, and
  Mailpit up (the full coverage suite, so DB-backed and delivery mutants are killable).
- **Runner:** `cargo mutants -p api` (copy mode needs a `$TMPDIR/rust-auth` symlink, or `--in-place`,
  because the crate's `path = "../../../rust-auth/crates/*"` deps do not survive a scratch copy).
- **Result:** **142 / 153 = 92.81%** caught (128 caught + 14 timeout killed; 11 missed; 101
  unviable, excluded from the ratio) — below the `0.95` floor.
- **Survivors (11):** three equivalent-by-construction (`AxumAuthConfig` fields in `app.rs`) and
  eight genuine gaps in `config` / `layers` / `telemetry` / `audit` / `email`. All resolved: the
  eight were killed with tests, the three removed by collapsing `build_router` to
  `AxumAuthConfig::default()` — final score **100% (150/150)**. See
  [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) and [`HISTORY.md`](./HISTORY.md).

## apps/web — Stryker

- **Date:** 2026-07-05
- **Surface:** `lib/**` + `components/**` + `hooks/**` (41 of 133 files); barrels, `*.d.ts`,
  configs, `app/**` route shells, and the verbatim shadcn `components/ui/*` wrappers excluded.
  Vitest runner, `coverageAnalysis: perTest`, `concurrency: 2` (memory-safe; runs sequentially
  after the Rust suite, never in parallel).
- **Result:** **78.26%** (1376 mutants; 865 killed, 10 timeout, 243 survived) — below the base
  `break: 95`.
- **Survivors (243):** clustered in `otp-input` (42), `trigger-actions` (25), `DiagnosticsMatrix`
  (22), `expiry-pill` (21), `AuditTable` (20), … — almost all "renders/calls but under-asserts".
  Driven out by strengthening 25 test files; final **base ≥ 95, `lib/**` 100** — see
  [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) and [`HISTORY.md`](./HISTORY.md).

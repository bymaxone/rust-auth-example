---
applyTo: 'apps/api/tests/**/*.rs,apps/web/**/*.{spec,test}.{ts,tsx},apps/web/e2e/**/*.ts'
---

# Test Review Instructions — rust-auth-example

## Coverage

- 100% on all metrics for files that carry logic, in both workspaces
  (`cargo-llvm-cov` for the API, Vitest for the web). Non-executable glue
  (`main.rs`, generated sqlx, pure type modules, `*.d.ts`) is out of scope.
- Every branch of a conditional is exercised by at least one test.

## Test design

- Name the scenario and the rule each test protects — describe the behavior, not
  the implementation: `it('rejects an expired reset token')`, not `it('path 2')`.
- One observable behavior per test; a single, focused assertion target.
- No fake mocks that hide real branches — mock at the boundary (the dependency),
  not inside the unit under test.
- Deterministic — mock time, randomness, and timers.
- No `it.only` / `describe.only` (web) or focused/ignored tests (Rust) committed.
- Assert on the specific error class and message, not just that something threw.

## Memory safety (mandatory)

The library is consumed via a local link, so its crates and WASM are recompiled
into every test runner. Bound the pools:

- Rust: `cargo nextest run` with a capped `--test-threads` (≤ cores / 2);
  coverage via `cargo llvm-cov nextest`.
- Web: Vitest `maxWorkers: '50%'` baked into the config; mutation with
  `cargo-mutants --jobs` capped and Stryker via the web package.
- Run suites **sequentially**; never fan out parallel test agents, and never run
  both workspaces' suites at once.

## Integration tests

- API integration tests run `sqlx migrate` against the high-port test stack
  first; they never touch the running dev stack.
- Use real backends (Testcontainers / the test compose stack) for e2e, not
  in-memory fakes.

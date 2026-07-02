# Copilot Review Instructions — rust-auth-example

This file configures GitHub Copilot code review for the `rust-auth-example`
repository: the public reference app for `bymax-auth` / `@bymax-one/rust-auth`.

## Project context

A dual workspace in one repository:

- `apps/api` — a Rust/axum service (edition 2024) that hosts the `AuthEngine` and
  mounts the library router. Cargo workspace.
- `apps/web` — a Next.js console (React) that consumes the browser package
  (`/client`, `/react`, `/nextjs`, `/shared`) and edge-verifies the session JWT.
  pnpm workspace.

The Rust crates are consumed by `path` and the browser package by `file:` across
the sibling checkout boundary. The two workspaces never merge.

## Critical rules (block any PR that violates these)

- **No `unsafe`, `unwrap`, `expect`, `panic!`, `todo!`, or `unreachable!`** in
  non-test Rust code.
- **No `any`** in TypeScript; use `unknown` with type guards.
- **No suppression comments** — no `#[allow(...)]`, `@ts-ignore`,
  `@ts-expect-error`, or `eslint-disable` without a written justification.
- **No secrets, tokens, or credentials** in any committed file; only local/test
  values (Mailpit, dev fixtures) may appear.
- **Never log** secrets, tokens, OTP codes, or PII.
- The HTTP layer **maps library errors** to the stable error envelope and never
  leaks an internal error string to the client.

## Code quality rules

- Functions ≤ 50 lines; files ≤ 800 lines; one responsibility per unit.
- Rust: `#![forbid(unsafe_code)]` + `#![deny(missing_docs)]` per crate; typed
  `thiserror` errors; explicit dependency injection.
- Every exported symbol carries rustdoc / JSDoc.
- English-only, timeless identifiers, comments, and docs.
- Conventional Commits; never add a `Co-Authored-By` trailer.

## Test rules

- 100% coverage on files that carry logic, in both workspaces.
- Deterministic tests — mock time and randomness.
- Every consumed library export is demonstrated (referenced) in the app, not left
  probe-only; the export audits enforce this.

# CLAUDE.md

Guidance for Claude (and any AI agent) working in this repository. The full,
tool-agnostic version lives in [`AGENTS.md`](./AGENTS.md); the invariants below
are authoritative and identical in intent.

## Repository shape

`rust-auth-example` is the reference app for `bymax-auth` / `@bymax-one/rust-auth`,
a **dual workspace in one repository**:

- `apps/api` — Rust/axum service (cargo workspace, `members = ["apps/api"]`).
- `apps/web` — Next.js console (pnpm workspace, `packages: ["apps/web"]`).

The Rust crates are consumed by `path`, the browser package by `file:`, across the
sibling checkout boundary. The two workspaces never merge.

## Non-negotiable invariants

- **Rust:** edition 2024; `#![forbid(unsafe_code)]` + `#![deny(missing_docs)]` per
  crate; **no `unwrap`/`expect`/`panic!`/`todo!`/`unreachable!`** in non-test
  code; typed `thiserror` errors; explicit dependency injection.
- **TypeScript:** strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `verbatimModuleSyntax`); **zero `any`**; no suppression
  comments (`@ts-ignore`, `eslint-disable`, or Rust `#[allow]` without a written
  justification).
- **Quality:** 100% coverage in both workspaces; mutation ≥ 95% driven toward 100%;
  the two export audits stay green.
- **Security:** secrets only from the environment; never log secrets/tokens/codes;
  the HTTP layer maps library errors and never leaks internals to the client.
- **Design system:** reused **verbatim** — never re-styled.
- **Workflow:** `git switch -c` only; Conventional Commits with **no
  `Co-Authored-By` trailer**; English-only, timeless comments and docs.

## Before you commit

Run the quality gates in [`CONTRIBUTING.md`](./CONTRIBUTING.md): `cargo fmt`,
`cargo clippy -- -D warnings`, `cargo deny check`, the TypeScript gates, and the
export audits. Respect the memory-safe testing rules — bounded threads/workers,
sequential suites, never fan out parallel test agents.

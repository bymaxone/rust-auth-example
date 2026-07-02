# AGENTS.md

Operating guide for AI agents and human contributors working in this repository.
These are the invariants; treat them as non-negotiable.

## What this repository is

`rust-auth-example` is the public, production-shaped reference app for `bymax-auth`
/ `@bymax-one/rust-auth`. It is a **dual workspace, one repository**:

- `apps/api` — a Rust/axum service that hosts the `AuthEngine`, in a **cargo
  workspace** (`Cargo.toml`, `members = ["apps/api"]`).
- `apps/web` — a Next.js console, in a **pnpm workspace** (`pnpm-workspace.yaml`,
  `packages: ["apps/web"]`).

The two workspaces never merge. The Rust crates are consumed by `path` and the
browser package by `file:` across the sibling checkout boundary.

## Rust invariants

- Edition **2024**; the toolchain is pinned in `rust-toolchain.toml` and the MSRV
  floor is declared in `[workspace.package]`.
- Every first-party crate carries `#![forbid(unsafe_code)]` and
  `#![deny(missing_docs)]`.
- **No `unwrap`, `expect`, `panic!`, `todo!`, `unreachable!`** in non-test code —
  the workspace `[lints]` table denies them.
- Errors are **typed `thiserror`** enums, not `anyhow`, in library-shaped code.
- Dependencies are injected explicitly via constructors into shared state.

## TypeScript invariants

- **Strict** TypeScript with `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noImplicitOverride`, and `verbatimModuleSyntax`.
- **Zero `any`**; use `unknown` with type guards.
- **No suppression comments** — no `@ts-ignore`, `@ts-expect-error`,
  `eslint-disable`, or Rust `#[allow(...)]` without a written justification.

## Quality bar

- **100% coverage** on all metrics in both workspaces (`cargo-llvm-cov` for the
  API, Vitest for the web).
- **Mutation ≥ 95%** (mandatory floor), driven toward 100% (`cargo-mutants` for
  the API, Stryker for the web).
- Two export audits gate CI: every npm export is referenced in `apps/web`, and
  every consumed-crate `pub` item is referenced in `apps/api` (or allow-listed
  with a reason).

## Security

- Secrets come only from the environment; never commit real keys — only
  local/test values (Mailpit, dev fixtures) may appear in examples.
- Never log secrets, tokens, codes, or PII. Honor redacting `Debug`.
- The HTTP layer maps library errors to the stable error envelope; it never leaks
  an internal error string to the client.

## Design system

The shared design system (`docs/design_system.html` and the copied web config +
`components/ui/*`) is reused **verbatim** — never re-styled or re-derived.

## Workflow

- Branch with `git switch -c <type>/<slug>` (never `git checkout -b`); never
  commit on the default branch.
- Commits follow **Conventional Commits** (`<type>(scope): <subject>`) with **no
  `Co-Authored-By` trailer**.
- All code, comments, rustdoc/JSDoc, identifiers, and commit messages are
  **English** and **timeless** — describe what the code does and why, never which
  planning step produced it.
- Run the quality gates locally before opening a PR (see `CONTRIBUTING.md`).

## Memory safety when testing

The library is consumed via a local link, so its crates and WASM are recompiled
into every test runner. Bound the pools: `cargo nextest` with a capped
`--test-threads`, Vitest `maxWorkers: '50%'`, `cargo-mutants --jobs` capped. Run
suites sequentially; **never fan out parallel test agents**.

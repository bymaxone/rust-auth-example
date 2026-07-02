# Contributing

Thanks for your interest in improving `rust-auth-example` — the reference app for
`bymax-auth` / `@bymax-one/rust-auth`. This guide covers how to build, test, and
submit changes.

## Prerequisites

- The pinned Rust toolchain — installed automatically from `rust-toolchain.toml`
  (channel, components, and the `wasm32-unknown-unknown` target).
- Node.js 24 (`.nvmrc`) and pnpm 10.8.x (`packageManager`).
- Docker, for the local Postgres + Redis + Mailpit stack.
- The Rust dev tools the gates use: `cargo-nextest`, `cargo-llvm-cov`,
  `cargo-deny`, `cargo-audit`, and `cargo-public-api`.

## Build and test

```bash
pnpm install                 # install the JS workspace + commit hooks
cargo build --locked         # build the Rust workspace
pnpm infra:up                # start Postgres + Redis + Mailpit (healthchecked)
```

## Quality gates (run before opening a PR)

```bash
cargo fmt --all --check                                # Rust formatting
cargo clippy --workspace --all-targets -- -D warnings  # Rust lints (zero warnings)
cargo deny check                                        # supply-chain policy
cargo audit                                             # advisory scan
pnpm typecheck && pnpm lint && pnpm format:check        # TypeScript gates
pnpm audit:exports && pnpm audit:public-api             # library export audits
```

Coverage is held to 100% on files that carry logic, and mutation testing enforces
a caught-rate floor. CI runs the same gates on every pull request; a change is
mergeable only when they are all green.

## Commit convention

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). A
local `commit-msg` hook (commitlint) enforces the format, and a `pre-commit` hook
runs `lint-staged`. Never add a `Co-Authored-By` trailer.

Example: `feat(api): mount the session device manager routes`.

## Pull requests

- Keep each change focused; explain the _why_, not just the _what_.
- Add or update tests for every behavior change — the suite is the contract.
- Keep comments and documentation in English and timeless (describe what the code
  does and why, never which planning step produced it).
- Never commit secrets or `.env` files; only local/test values (Mailpit, dev
  fixtures) may appear in examples.
- By contributing, you agree that your work is licensed under the repository's
  [MIT license](./LICENSE).

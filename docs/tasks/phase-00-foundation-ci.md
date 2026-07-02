# Phase 0 — Foundation, Tooling & CI Skeleton

> **Status**: 🔄 In Progress · **Progress**: 6 / 7 tasks · **Last updated**: 2026-07-01
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P0
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

The repository currently contains only `docs/` (`OVERVIEW.md`, `DEVELOPMENT_PLAN.md`, `DASHBOARD.md`, the already-present `design_system.html`) and this `docs/tasks/` tree. There is no `Cargo.toml`, no `apps/`, no `.github/`, no governance files, and no CI. This is the very first phase, so its only inputs are the blueprint documents and the sibling reference repos (`rust-auth`, `nest-auth-example`, `nest-logger-example`).

Phase 0 stands up the **dual workspace** (a cargo workspace for `apps/api`, a pnpm workspace for `apps/web`), the pinned toolchains, the Rust lint/supply-chain policy, the commit-governance hooks, every mandatory public-repo file, the GitHub configuration (issue/PR templates, CODEOWNERS, dependency bot, the four Copilot review files), and the **complete CI/CD + go-public workflow set** as runnable skeletons that pass green on an otherwise-empty tree. No application logic is written here — the `apps/api` `main.rs` is a compiling stub and `apps/web` does not yet exist, so the export-audit scripts pass trivially.

When P0 is done: `cargo build --locked`, `cargo fmt --all --check`, and `cargo clippy --workspace --all-targets -- -D warnings` all pass on the `apps/api` stub; `cargo deny check` reports `advisories/bans/licenses/sources ok`; the `commit-msg` hook rejects a non-Conventional message; `ci.yml` runs green on a PR with every Appendix D job name present; `codeql.yml` + `scorecard.yml` run informationally; `release.yml` validates without publishing; the four Copilot instruction files are each under 4000 characters and carry no phase/task references; and `find . -name .gitkeep` returns nothing. **No engine, no Redis, no Postgres, no auth routes, no UI — those are P1 and later; this phase only builds the gate every later phase merges through.**

---

## Rules-of-phase

1. **Dual workspace, one repo.** The Rust API lives in a cargo workspace (`Cargo.toml: [workspace] members = ['apps/api']`, `resolver = "3"`); the Next.js console + tooling live in a pnpm workspace (`pnpm-workspace.yaml: packages: ['apps/web']`). The two never merge; `apps/api` consumes `bymax-auth-*` by `path` across the checkout boundary (wired in P2, not here).
2. **Pinned toolchains, proven floor.** Rust `1.96.0` via `rust-toolchain.toml` (with the `wasm32-unknown-unknown` target + `rustfmt`/`clippy`/`llvm-tools-preview` components); MSRV floor `1.90` declared in `[workspace.package].rust-version` and proven by a dedicated `msrv` CI job. Node `24` (`.nvmrc`), pnpm `10.8.x` (`packageManager`).
3. **Rust language rigor.** Edition 2024; `#![forbid(unsafe_code)]` on every first-party crate; **no `unwrap`/`expect`/`panic!`/`todo!`/`unreachable!`** in non-test code; typed `thiserror` errors. The stub `main.rs` honours these from day one.
4. **CI job names are contractual.** Branch protection and the audit scripts reference jobs by name. Use exactly the Appendix D names (`build-library`, `install`, `format`, `lint`, `typecheck`, `msrv`, `unit`, `e2e-api`, `e2e-web`, `export-usage-check`, `supply-chain`, `dependency-review`, `coverage-report`, plus `analyze`/Scorecard/secret-scan/mutation/release jobs). Renaming a job breaks the contract.
5. **Least-privilege, pinned, bounded CI.** Top-level `permissions: contents: read`; a job widens scope only for what it needs (OIDC `id-token: write` + `packages: write` only in `release`). Every action is version-pinned; every job sets `timeout-minutes`; every workflow except `release` sets `concurrency` with `cancel-in-progress: true`.
6. **Supply-chain mirrors the library.** `deny.toml` bans `ring`, `openssl`, and `openssl-sys`, denies copyleft by omission, and restricts sources to crates.io — the same posture as the consumed `bymax-auth` crates.
7. **Timeless, English-only, docs-as-config too.** No `Phase N` / task / roadmap-stage references in any committed source, config, workflow, or Copilot file. The four Copilot instruction files are < 4000 characters each. Doc-section references (`OVERVIEW.md §9`) are allowed; plan-stage names are not.
8. **No placeholder scaffolding.** Never create `.gitkeep`/`.keep` files or pre-create empty directories — every directory emerges from a real committed file.
9. **Conventional Commits, no co-author trailer.** `<type>(scope): <subject>`; never add a `Co-Authored-By` line. Branch with `git switch -c feat/p0-<slug>` (never `git checkout -b`).

---

## Reference docs

- [`docs/OVERVIEW.md`](../OVERVIEW.md) — § 4 "Tech Stack" (toolchain/version pins), § 5 "Repository Layout" (the exact file tree), § 7 "Library Consumption" (the `build-library`-before-web ordering, the four npm subpaths the export audit parses), § 8 "Local Stack & Memory-Safe Run" (the bounded-pool CI constraint).
- [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P0 (scope In/Out + Definition of Done), § 2 "Global Conventions" (the convention table this phase materializes), § 3 "Autonomous Execution Model", Appendix C "Quality Gates", Appendix D "CI/CD Workflow Matrix", Appendix E "Go-Public Readiness Checklist".
- [`docs/DASHBOARD.md`](../DASHBOARD.md) — § design-system mandate (the verbatim-copy rule for `globals.css` / `tailwind.config.ts` / `components.json` / `postcss.config.mjs` / `components/ui/*`, referenced again in P8).
- Sibling configs to copy-and-adapt: `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/` (`Cargo.toml`, `rust-toolchain.toml`, `rustfmt.toml`, `deny.toml`, `.github/`) and `/Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/` (`.github/workflows/*`, root `package.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.husky/`, `renovate.json`); the four Copilot files from `/Users/maximiliano/Documents/MyApps/bymax-one/nest-logger-example/.github/`.
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 0.1 | Cargo + pnpm dual workspace + toolchains | ✅ Done | P0 | M | — |
| 0.2 | Rust lint/supply-chain + commit governance | ✅ Done | P0 | S | 0.1 |
| 0.3 | Mandatory repo & community-health files | ✅ Done | P1 | S | 0.1 |
| 0.4 | GitHub config & Copilot review | ✅ Done | P0 | M | 0.1 |
| 0.5 | Core CI workflow + audit-script stubs | ✅ Done | P0 | M | 0.1, 0.2 |
| 0.6 | Security & supply-chain workflows | ✅ Done | P0 | M | 0.5 |
| 0.7 | Mutation/release skeletons + Dockerfiles | 📋 ToDo | P1 | M | 0.5 |

---

## Tasks

### Task 0.1 — Cargo + pnpm dual workspace + toolchains

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Create the dual-workspace root — the cargo workspace (`members = ['apps/api']`) with a compiling `apps/api` stub, the pinned `rust-toolchain.toml`, the pnpm workspace + root `package.json` scripts, and `tsconfig.base.json` — so `cargo build`/`fmt`/`clippy` and `pnpm install` all pass on an otherwise-empty tree.

#### Acceptance criteria

- [x] Root `Cargo.toml` declares `[workspace] resolver = "3"`, `members = ["apps/api"]`, and a `[workspace.package]` with `edition = "2024"`, `rust-version = "1.90"`, `license = "MIT"`, `repository`, `authors`.
- [x] `rust-toolchain.toml` pins `channel = "1.96.0"`, the `wasm32-unknown-unknown` target, and the `rustfmt`/`clippy`/`llvm-tools-preview` components.
- [x] `apps/api/Cargo.toml` + `apps/api/src/main.rs` compile: `main.rs` carries `#![forbid(unsafe_code)]`, has no `unwrap`/`expect`/`panic!`, and `cargo build --locked` succeeds; `Cargo.lock` is committed.
- [x] `pnpm-workspace.yaml` lists `apps/web`; root `package.json` sets `packageManager: pnpm@10.8.x`, `engines.node >= 24`, and the `dev`/`build`/`typecheck`/`lint`/`format`/`format:check`/`test:cov`/`prepare`/`infra:up`/`infra:down`/`audit:exports`/`audit:public-api` scripts; `pnpm install` produces a committed `pnpm-lock.yaml`.
- [x] `tsconfig.base.json` sets TS strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` + `noImplicitOverride` + `verbatimModuleSyntax`.
- [x] No `.gitkeep` / empty-directory placeholders exist.

#### Files to create / modify

- `Cargo.toml`, `Cargo.lock`
- `rust-toolchain.toml`
- `apps/api/Cargo.toml`, `apps/api/src/main.rs`
- `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`
- `tsconfig.base.json`

#### Agent prompt

````
You are a senior Rust + TypeScript build/CI/tooling engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 0 (Foundation, Tooling & CI Skeleton) — Task 0.1 of 7 (FIRST)

PRECONDITIONS
- The repo contains only `docs/` (OVERVIEW.md, DEVELOPMENT_PLAN.md, DASHBOARD.md, design_system.html) and `docs/tasks/`. No Rust code, no `package.json`, no `apps/`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 4 "Tech Stack" — the exact version pins (Rust 1.96.0 / MSRV 1.90, Node 24, pnpm 10.8.x, edition 2024).
- docs/OVERVIEW.md § 5 "Repository Layout" — the root-file tree and the `apps/api` vs `apps/web` split.
- docs/DEVELOPMENT_PLAN.md § 2 "Global Conventions" — the Workspaces / Toolchains / Install / Rust-language / TS-language rows.
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/Cargo.toml + rust-toolchain.toml — the workspace/toolchain shape to copy-and-adapt (this example owns its OWN workspace; members = ['apps/api']).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/package.json + tsconfig.base.json — the root-script and TS-strict shape to copy-and-adapt.

TASK
Scaffold the dual workspace and the compiling `apps/api` stub. No engine, no routes, no dependencies on bymax-auth yet (P2 adds the path deps) — only the workspace metadata, the pinned toolchains, and a `main.rs` that builds clean.

DELIVERABLES
1. `Cargo.toml` (workspace root):
   ```toml
   [workspace]
   resolver = "3"
   members  = ["apps/api"]

   [workspace.package]
   edition      = "2024"
   rust-version = "1.90"   # MSRV floor; the toolchain (1.96.0) is higher and proven against this floor by the `msrv` CI job
   license      = "MIT"
   repository   = "https://github.com/bymaxone/rust-auth-example"
   authors      = ["Bymax One"]
   ```
2. `rust-toolchain.toml`:
   ```toml
   [toolchain]
   channel    = "1.96.0"
   components = ["rustfmt", "clippy", "llvm-tools-preview"]
   targets    = ["wasm32-unknown-unknown"]
   ```
3. `apps/api/Cargo.toml` + `apps/api/src/main.rs`:
   ```toml
   [package]
   name             = "api"
   version          = "0.0.0"
   edition.workspace      = true
   rust-version.workspace = true
   license.workspace      = true
   publish          = false

   [dependencies]   # bymax-auth-* path deps are wired in a later task — keep empty for now
   ```
   ```rust
   //! rust-auth-example API binary. Hosts the axum service that mounts the `bymax-auth`
   //! engine and the example's own domain routes. This entry point is fleshed out as the
   //! configuration loader, engine wiring, and routers land; for now it only proves the
   //! workspace compiles under the pinned toolchain.
   #![forbid(unsafe_code)]

   /// Process entry point. Replaced by the Tokio runtime + `axum::serve(API_PORT)` bootstrap.
   fn main() {
       println!("rust-auth-example api: bootstrap not yet wired");
   }
   ```
4. `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - apps/web
   ```
5. `package.json` (root) — `private: true`, `packageManager: "pnpm@10.8.1"`, `engines: { "node": ">=24" }`, and:
   ```json
   {
     "scripts": {
       "dev": "pnpm -r --parallel --if-present run dev",
       "build": "pnpm -r --if-present run build",
       "typecheck": "pnpm -r --if-present run typecheck",
       "lint": "eslint .",
       "format": "prettier --write .",
       "format:check": "prettier --check .",
       "test:cov": "pnpm -r --if-present run test:cov",
       "prepare": "husky",
       "infra:up": "docker compose up -d --wait",
       "infra:down": "docker compose down",
       "audit:exports": "node scripts/audit-library-exports.mjs",
       "audit:public-api": "bash scripts/audit-rust-public-api.sh"
     }
   }
   ```
6. `tsconfig.base.json` — TS strict + `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `moduleResolution: "Bundler"`, `skipLibCheck: true`.

Constraints:
- `#![forbid(unsafe_code)]` on `main.rs`; no `unwrap`/`expect`/`panic!`/`todo!`/`unreachable!`.
- Add NO bymax-auth dependency in this task — the example's `apps/api` stays dependency-free until the library-consumption task.
- Commit `Cargo.lock` and `pnpm-lock.yaml`; do not gitignore them.
- English-only, timeless comments — NO Phase/Task/roadmap references in any committed source or config file.
- No `.gitkeep`; let real files create the directories. `git switch -c` only.

Verification:
- `cargo build --locked` — expected: builds with no errors and no warnings.
- `cargo fmt --all --check` — expected: no diff.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo +1.90 check` — expected: builds on the MSRV floor.
- `pnpm install --frozen-lockfile` — expected: resolves and writes/validates `pnpm-lock.yaml`.
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 7` and Last updated.
4. Update the P0 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 0.1 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `chore(workspace): scaffold dual cargo + pnpm workspace and toolchains` (no Co-Authored-By).
````

---

### Task 0.2 — Rust lint/supply-chain + commit governance

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: 0.1

#### Description

Add the Rust format/lint/supply-chain policy (`rustfmt.toml`, `clippy.toml`, `deny.toml` mirroring the library's `ring`/`openssl` ban) and the cross-stack commit governance (commitlint, husky hooks, lint-staged, editor/git dotfiles, ESLint flat config, Prettier).

#### Acceptance criteria

- [x] `rustfmt.toml` (stable-only options: `edition = "2024"`, `max_width = 100`) and `clippy.toml` exist; `cargo fmt --all --check` and `cargo clippy --workspace --all-targets -- -D warnings` stay clean.
- [x] `deny.toml` denies vulnerable/unmaintained/yanked advisories, sets a permissive license allow-list (copyleft denied by omission), bans `ring`/`openssl`/`openssl-sys`, denies `multiple-versions` + `wildcards`, and restricts sources to crates.io; `cargo deny check` passes.
- [x] `commitlint.config.mjs` extends `@commitlint/config-conventional`; `.husky/commit-msg` runs commitlint and `.husky/pre-commit` runs `lint-staged`; `lint-staged.config.mjs` runs `cargo fmt`/`cargo clippy` on staged `*.rs` and `prettier`/`eslint --fix` on staged `*.ts`/`*.tsx`.
- [x] `.gitmessage`, `.editorconfig`, `.npmrc` (`frozen-lockfile=true`), `.nvmrc` (`24`), `.gitignore`, `.gitattributes`, `.markdown-link-check.json`, `eslint.config.mjs` (flat, `--max-warnings 0`), `.prettierrc.mjs`, `.prettierignore` all exist.
- [x] A non-Conventional commit message is rejected by the `commit-msg` hook.

#### Files to create / modify

- `rustfmt.toml`, `clippy.toml`, `deny.toml`
- `commitlint.config.mjs`, `lint-staged.config.mjs`, `.husky/commit-msg`, `.husky/pre-commit`
- `.gitmessage`, `.editorconfig`, `.npmrc`, `.nvmrc`, `.gitignore`, `.gitattributes`, `.markdown-link-check.json`
- `eslint.config.mjs`, `.prettierrc.mjs`, `.prettierignore`
- `package.json` (add husky/commitlint/lint-staged/eslint/prettier devDeps)

#### Agent prompt

````
You are a senior Rust + TypeScript build/CI/tooling engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 0 (Foundation, Tooling & CI Skeleton) — Task 0.2 of 7 (MIDDLE)

PRECONDITIONS
- Task 0.1 is done: the dual workspace builds (`cargo build --locked`, `pnpm install --frozen-lockfile`), the `apps/api` stub compiles, the toolchains are pinned.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md § 2 "Global Conventions" — the Lint/format, Pre-commit, Commits, and Supply-chain rows.
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/deny.toml + rustfmt.toml — the supply-chain ban-list (ring/openssl) and the stable-only rustfmt config to copy-and-adapt.
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/.husky/ + commitlint.config.mjs + lint-staged.config.mjs + eslint.config.mjs + .prettierrc.mjs — the commit-governance shape to copy-and-adapt.

TASK
Author the Rust lint/supply-chain policy and the cross-stack commit governance. No application code.

DELIVERABLES
1. `rustfmt.toml` (stable-only — nightly import-grouping options omitted so `cargo fmt --check` stays clean):
   ```toml
   edition       = "2024"
   max_width     = 100
   newline_style = "Unix"
   ```
   plus `clippy.toml` (may set `avoid-breaking-exported-api = false`; keep minimal — the deny-level lints live in `Cargo.toml`/CLI).
2. `deny.toml` — mirror the library's posture:
   ```toml
   [advisories]
   unmaintained = "all"
   yanked       = "deny"
   ignore       = []

   [licenses]
   allow = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Unicode-DFS-2016", "Unicode-3.0", "Zlib", "BSL-1.0"]
   confidence-threshold = 0.9

   [bans]
   multiple-versions = "deny"
   wildcards         = "deny"
   deny = [
       { crate = "openssl",     reason = "TLS is rustls/aws-lc-rs; no OpenSSL on any path." },
       { crate = "openssl-sys", reason = "C OpenSSL bindings are banned — zero-native-binding posture." },
       { crate = "ring",        reason = "ring breaks the wasm32 edge build; RustCrypto is the crypto policy." },
   ]
   skip      = []
   skip-tree = []

   [sources]
   unknown-registry = "deny"
   unknown-git      = "deny"
   allow-registry   = ["https://github.com/rust-lang/crates.io-index"]
   ```
3. `commitlint.config.mjs` → `export default { extends: ['@commitlint/config-conventional'] };`; `.husky/commit-msg` → `npx --no -- commitlint --edit "$1"`; `.husky/pre-commit` → `npx --no -- lint-staged`.
4. `lint-staged.config.mjs`:
   ```js
   export default {
     '*.rs': () => ['cargo fmt --all -- --check', 'cargo clippy --workspace --all-targets -- -D warnings'],
     '*.{ts,tsx,mjs,js}': ['prettier --write', 'eslint --fix --max-warnings 0'],
     '*.{json,md,yml,yaml}': ['prettier --write'],
   };
   ```
5. The dotfiles: `.gitmessage` (Conventional-Commits template), `.editorconfig`, `.npmrc` (`frozen-lockfile=true`), `.nvmrc` (`24`), `.gitignore` (`/target`, `node_modules`, `.next`, `dist`, `.env`, `**/*.rs.bk`, `.DS_Store`), `.gitattributes`, `.markdown-link-check.json`, `eslint.config.mjs` (flat config, `--max-warnings 0`), `.prettierrc.mjs`, `.prettierignore`. Add the husky/commitlint/lint-staged/eslint/prettier devDependencies to root `package.json`.

Constraints:
- `cargo deny check` must PASS on the current tiny graph — prefer a narrow documented exception over loosening a category.
- After adding lints, the workspace stays clean — fix findings by changing code, never with `#[allow(...)]`/`@ts-ignore` suppression.
- English-only, timeless comments — NO Phase/Task/roadmap references in any committed file.
- No `.gitkeep`; `git switch -c` only.

Verification:
- `cargo fmt --all --check` — expected: no diff.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo deny check` — expected: `advisories ok`, `bans ok`, `licenses ok`, `sources ok`.
- `echo "bad message" | npx --no -- commitlint` — expected: non-zero exit (rejects non-Conventional).
- `pnpm run format:check` — expected: clean (or only intended files reported).

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 7` and Last updated.
4. Update the P0 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 0.2 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `chore(tooling): rust lint/supply-chain policy + commit governance` (no Co-Authored-By).
````

---

### Task 0.3 — Mandatory repo & community-health files

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: S
- **Depends on**: 0.1

#### Description

Author the public-repository governance and community-health documents — `LICENSE`, a badge-header `README.md` with an ASCII architecture diagram, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and the agent-instruction files `CLAUDE.md` + `AGENTS.md`.

#### Acceptance criteria

- [x] `LICENSE` is MIT, copyright "Bymax One".
- [x] `README.md` has a badge header (CI, coverage, mutation, license, Rust edition, MSRV, Node, axum, Next, React, Tailwind), a one-line tagline, a nav row, an Overview, a Quick-start, an ASCII architecture diagram (api/web/Postgres/Redis/Mailpit), a Documentation table linking the `docs/*.md` set, and a License section.
- [x] `CHANGELOG.md` follows Keep-a-Changelog + SemVer with an `## [Unreleased]` section.
- [x] `SECURITY.md` routes vulnerability reports to email (not a public issue); `CONTRIBUTING.md` documents the gate set + Conventional Commits; `CODE_OF_CONDUCT.md` references Contributor Covenant 2.1 by link.
- [x] `CLAUDE.md` + `AGENTS.md` state the repo invariants for agents (dual workspace, `#![forbid(unsafe_code)]`, no `unwrap`/`expect`/`panic`, typed errors, 100% coverage + mutation ≥ 95, design-system verbatim, Conventional Commits / no co-author trailer) with NO phase/task references.
- [x] `markdown-link-check` is clean on `README.md`.

#### Files to create / modify

- `LICENSE`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
- `CLAUDE.md`, `AGENTS.md`

#### Agent prompt

````
You are a senior Rust + TypeScript build/CI/tooling engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 0 (Foundation, Tooling & CI Skeleton) — Task 0.3 of 7 (MIDDLE)

PRECONDITIONS
- Task 0.1 is done: the dual workspace exists; the root `package.json` and `docs/*.md` blueprint files are present.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md § P0 (Definition of Done) + Appendix E "Go-Public Readiness Checklist" — the exact required-file list and the README badge/diagram/matrix requirements.
- docs/OVERVIEW.md § 3 "Architecture at a Glance" — the api/web/Postgres/Redis/Mailpit shape to render as the README ASCII diagram, and § 5 for the `docs/*.md` set to table.
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/README.md + SECURITY.md + CONTRIBUTING.md — the tone/structure to copy-and-adapt (this is a reference example, not a starter template).

TASK
Author the mandatory governance and community-health files. Product-focused, neutral tone; no claims that the repo demonstrates any author's seniority.

DELIVERABLES
1. `LICENSE` — MIT text, copyright "Bymax One".
2. `README.md`:
   - A badge header row (CI · coverage · mutation · license · Rust edition 2024 · MSRV 1.90 · Node 24 · axum 0.8 · Next 16 · React 19 · Tailwind 4).
   - A one-line tagline: "The public, production-shaped reference app for `bymax-auth` / `@bymax-one/rust-auth`."
   - A nav row linking the key docs; an Overview paragraph; a Quick-start block (`pnpm install` → `pnpm infra:up` → run api + web).
   - An ASCII architecture diagram:
     ```text
     apps/web (Next.js 16) ──/api/auth/*──▶ apps/api (axum 0.8)
                                              │  AuthEngine (bymax-auth-core)
                                              ├─▶ PostgreSQL (sqlx repos)
                                              ├─▶ Redis (RedisStores · 8 traits)
                                              └─▶ Mailpit (lettre SMTP)
     ```
   - A Documentation table linking `OVERVIEW.md`, `DEVELOPMENT_PLAN.md`, `DASHBOARD.md`, and the `docs/*.md` set (the later docs may be "planned").
   - A License section.
3. `CHANGELOG.md` — Keep-a-Changelog header + SemVer note + `## [Unreleased]`.
4. `SECURITY.md` — supported versions + private disclosure to a security email (ask reporters not to open public issues).
5. `CONTRIBUTING.md` — build/test steps, the gate set (fmt/clippy/coverage/deny/audits), Conventional Commits, PR expectations.
6. `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 by link (do not transcribe the full body) + the report contact.
7. `CLAUDE.md` + `AGENTS.md` — the repo invariants for agents: dual workspace; `#![forbid(unsafe_code)]`; no `unwrap`/`expect`/`panic!`/`todo!`/`unreachable!`; typed `thiserror` errors; TS strict / zero `any`; 100% coverage + mutation ≥ 95; design-system copied verbatim; Conventional Commits with NO `Co-Authored-By` trailer; `git switch -c` only; timeless English-only comments. Keep these timeless — NO phase/task references.

Constraints:
- English-only; neutral, product-focused tone.
- Timeless content — NO Phase/Task/roadmap references in any file (including CLAUDE.md / AGENTS.md).
- Do not transcribe the full Contributor Covenant — link it.
- No `.gitkeep`; `git switch -c` only.

Verification:
- `ls LICENSE README.md CHANGELOG.md SECURITY.md CONTRIBUTING.md CODE_OF_CONDUCT.md CLAUDE.md AGENTS.md` — expected: all present.
- `grep -q '\[Unreleased\]' CHANGELOG.md` — expected: match.
- `npx --no -- markdown-link-check -c .markdown-link-check.json README.md` — expected: no dead links.
- `grep -riE "phase [0-9]|task [0-9]" README.md CLAUDE.md AGENTS.md SECURITY.md CONTRIBUTING.md` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 7` and Last updated.
4. Update the P0 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 0.3 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `docs(repo): mandatory governance + community-health files` (no Co-Authored-By).
````

---

### Task 0.4 — GitHub config & Copilot review

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 0.1

#### Description

Add the GitHub configuration — issue/PR templates, `CODEOWNERS`, the dependency-update bot, and the four customized Copilot review files (a Rust + TS Blockers checklist), each instruction file under 4000 characters with no phase/task references.

#### Acceptance criteria

- [x] `.github/ISSUE_TEMPLATE/{bug_report.yml,feature_request.yml,config.yml}` exist; `config.yml` links security reports to the SECURITY.md email (not a public issue).
- [x] `.github/PULL_REQUEST_TEMPLATE.md` + `.github/CODEOWNERS` exist.
- [x] `.github/dependabot.yml` and/or `renovate.json` cover the `cargo`, `npm`, and `github-actions` ecosystems, weekly, PRs only (never auto-merge).
- [x] The four Copilot files exist: `.github/copilot-instructions.md`, `.github/instructions/code.instructions.md`, `.github/instructions/tests.instructions.md`, `.github/agents/agent-code-reviewer.agent.md`.
- [x] Each `*.instructions.md` file is < 4000 characters; the reviewer agent carries a Rust + TS Blockers checklist (unsafe / unwrap / expect / panic, secrets-in-logs, the controller-maps-the-error rule, never-log-secrets, an undemonstrated export, a `#[allow]` / `@ts-ignore` without justification).
- [x] No phase/task references appear in any of the four Copilot files.

#### Files to create / modify

- `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/ISSUE_TEMPLATE/config.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`
- `.github/dependabot.yml` and/or `renovate.json`
- `.github/copilot-instructions.md`, `.github/instructions/code.instructions.md`, `.github/instructions/tests.instructions.md`, `.github/agents/agent-code-reviewer.agent.md`

#### Agent prompt

````
You are a senior Rust + TypeScript build/CI/tooling engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 0 (Foundation, Tooling & CI Skeleton) — Task 0.4 of 7 (MIDDLE)

PRECONDITIONS
- Task 0.1 is done: the dual workspace exists. `SECURITY.md` (the security email target) is authored in the governance task.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md § P0 (Definition of Done — "the 4 Copilot files customized for this stack") + Appendix E (the Blockers-checklist enumeration + the < 4000-char rule).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-logger-example/.github/copilot-instructions.md + instructions/{code,tests}.instructions.md + agents/agent-code-reviewer.agent.md — the four-file shape and length budget to copy-and-adapt (retarget from NestJS/TS to Rust/axum + Next.js/TS).
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/.github/ISSUE_TEMPLATE/ + dependabot.yml — the issue-template + bot shape.

TASK
Author the GitHub config and the four Copilot review files, retargeted to the Rust + TS stack. No application code.

DELIVERABLES
1. `.github/ISSUE_TEMPLATE/bug_report.yml` + `feature_request.yml` (GitHub form schema) + `config.yml`:
   ```yaml
   blank_issues_enabled: false
   contact_links:
     - name: Security report
       url: https://github.com/bymaxone/rust-auth-example/security/advisories/new
       about: Report a vulnerability privately — do not open a public issue (see SECURITY.md).
   ```
2. `.github/PULL_REQUEST_TEMPLATE.md` (summary · linked issue · the gate checklist: fmt/clippy/coverage/deny/audits green) + `.github/CODEOWNERS` (`* @bymaxone/maintainers`).
3. Dependency bot — `.github/dependabot.yml`:
   ```yaml
   version: 2
   updates:
     - package-ecosystem: cargo
       directory: "/"
       schedule: { interval: weekly }
     - package-ecosystem: npm
       directory: "/"
       schedule: { interval: weekly }
     - package-ecosystem: github-actions
       directory: "/"
       schedule: { interval: weekly }
   ```
   (or the equivalent `renovate.json` covering the same three ecosystems — pick one and state why).
4. The four Copilot files, retargeted to this stack:
   - `.github/copilot-instructions.md` — repo map (apps/api Rust, apps/web Next.js), the invariants, the gate set.
   - `.github/instructions/code.instructions.md` (< 4000 chars) — Rust: `#![forbid(unsafe_code)]`, no `unwrap`/`expect`/`panic!`, typed `thiserror`, controller maps the library error, never log secrets/tokens/codes; TS: strict, zero `any`, no suppression comments.
   - `.github/instructions/tests.instructions.md` (< 4000 chars) — name the scenario + the rule each test protects; bounded `--test-threads` / Vitest `maxWorkers: '50%'`; 100% coverage scope.
   - `.github/agents/agent-code-reviewer.agent.md` — a Rust + TS **Blockers** checklist: `unsafe`/`unwrap`/`expect`/`panic` in non-test code, secrets-in-logs, the controller-maps-the-error rule, the never-log-secrets rule, an undemonstrated library export, a `#[allow]`/`@ts-ignore` without a written justification.

Constraints:
- Each `*.instructions.md` strictly < 4000 characters.
- NO phase/task/roadmap references in any of the four Copilot files or the GitHub config.
- English-only, timeless content. No `.gitkeep`; `git switch -c` only.

Verification:
- `ls .github/copilot-instructions.md .github/instructions/code.instructions.md .github/instructions/tests.instructions.md .github/agents/agent-code-reviewer.agent.md` — expected: all present.
- `for f in .github/instructions/*.instructions.md; do test "$(wc -c < "$f")" -lt 4000 || echo "TOO LONG: $f"; done` — expected: no output.
- `grep -riE "phase [0-9]|task [0-9]" .github/` — expected: no matches.
- `npx --no -- yaml-lint .github/dependabot.yml .github/ISSUE_TEMPLATE/*.yml` (or `python3 -c "import yaml,glob;[yaml.safe_load(open(f)) for f in glob.glob('.github/**/*.yml',recursive=True)]"`) — expected: valid YAML.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 7` and Last updated.
4. Update the P0 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 0.4 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `ci(github): issue/PR templates, dependency bot, copilot review files` (no Co-Authored-By).
````

---

### Task 0.5 — Core CI workflow + audit-script stubs

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 0.1, 0.2

#### Description

Author the core `ci.yml` workflow (the full Appendix D job DAG) plus the two export-audit scripts (`audit-library-exports.mjs`, `audit-rust-public-api.sh`) and the `.audit-ignore.json` allow-list, wiring them to the `audit:exports` / `audit:public-api` npm scripts; the audits pass trivially on the empty `apps/`.

#### Acceptance criteria

- [x] `.github/workflows/ci.yml` triggers on PR + push to `main`/`next`, sets top-level `permissions: contents: read`, `concurrency` with `cancel-in-progress: true`, pinned actions, and `timeout-minutes` per job.
- [x] The job DAG matches Appendix D: `build-library` → `install`, `format`, `lint`, `typecheck`, `msrv`, `unit`, `e2e-api`, `e2e-web` (`needs: e2e-api`), `export-usage-check`, `supply-chain`, `dependency-review` (PR), `coverage-report` (`if: always()`).
- [x] `scripts/audit-library-exports.mjs` parses the four-subpath `dist/**/*.d.ts` of `@bymax-one/rust-auth`, word-boundary-searches `apps/web`, and exits 0 when `apps/web` is absent/empty (with a clear "nothing to audit yet" message).
- [x] `scripts/audit-rust-public-api.sh` runs `cargo public-api` over the consumed crates and exits 0 on the current stub (no path deps yet).
- [x] `.audit-ignore.json` is the allow-list seed (empty `{ "exports": [], "publicApi": [] }` with a schema comment); `pnpm audit:exports` and `pnpm audit:public-api` both exit 0.

#### Files to create / modify

- `.github/workflows/ci.yml`
- `scripts/audit-library-exports.mjs`, `scripts/audit-rust-public-api.sh`, `.audit-ignore.json`
- `package.json` (confirm the `audit:exports` / `audit:public-api` scripts)

#### Agent prompt

````
You are a senior Rust + TypeScript build/CI/tooling engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 0 (Foundation, Tooling & CI Skeleton) — Task 0.5 of 7 (MIDDLE)

PRECONDITIONS
- Tasks 0.1 + 0.2 are done: the dual workspace builds, the toolchains are pinned, and `cargo fmt --check` / `cargo clippy -- -D warnings` / `cargo deny check` already pass locally. `apps/web` does not exist yet, so the export audits must pass trivially.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md Appendix D "CI/CD Workflow Matrix" — the `ci.yml` job list + the shared step conventions (checkout@v5, pnpm/action-setup@v4 BEFORE setup-node@v5, dtolnay/rust-toolchain + Swatinem/rust-cache, `--frozen-lockfile` + `cargo build --locked`, the placeholder `DATABASE_URL`).
- docs/DEVELOPMENT_PLAN.md Appendix C "Quality Gates" (which gate each job enforces) + § P0 (the build-library-first ordering).
- docs/OVERVIEW.md § 6 "Feature Coverage Matrix" (the Coverage rule) + § 7 — how the two audits parse the four npm subpaths' `.d.ts` and the consumed crates' `pub` surface, and the allow-list-with-a-reason rule.
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/.github/workflows/ci.yml + scripts/audit-library-exports.mjs — the workflow DAG and the export-audit script to copy-and-adapt.

TASK
Author `ci.yml` (the full Appendix D DAG, green on the stub) and the two audit scripts + the allow-list seed. The Rust jobs build the `apps/api` stub; the web jobs no-op gracefully until `apps/web` exists.

DELIVERABLES
1. `.github/workflows/ci.yml`:
   ```yaml
   name: ci
   on:
     pull_request:
     push:
       branches: [main, next]
   permissions:
     contents: read
   concurrency:
     group: ci-${{ github.ref }}
     cancel-in-progress: true
   jobs:
     build-library:   # build @bymax-one/rust-auth so the file: link resolves (no-op until the link is wired)
       timeout-minutes: 15
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v5
         - uses: pnpm/action-setup@v4
         - uses: actions/setup-node@v5
           with: { node-version: 24, cache: pnpm }
     # install · format · lint · typecheck · msrv · unit · e2e-api · e2e-web (needs: e2e-api) ·
     # export-usage-check · supply-chain · dependency-review (if: github.event_name == 'pull_request') ·
     # coverage-report (if: always()) — each with timeout-minutes; the Rust jobs use
     # dtolnay/rust-toolchain (read from rust-toolchain.toml) + Swatinem/rust-cache@v2 and a
     # placeholder DATABASE_URL so `cargo` builds without a DB.
   ```
   - `format`: `cargo fmt --all --check` (+ `pnpm format:check`). `lint`: `cargo clippy --workspace --all-targets -- -D warnings` (+ `pnpm lint`). `typecheck`: `cargo check --workspace` (+ `pnpm typecheck`). `msrv`: `cargo +1.90 check`. `unit`: `cargo llvm-cov nextest` (+ web Vitest, both `--if-present`). `export-usage-check`: `pnpm audit:exports` + `pnpm audit:public-api`. `supply-chain`: `cargo deny check`. `dependency-review`: `actions/dependency-review-action`.
2. `scripts/audit-library-exports.mjs`:
   ```js
   #!/usr/bin/env node
   // Parses the four-subpath dist/**/*.d.ts of @bymax-one/rust-auth (/client /react /nextjs /shared),
   // extracts every exported symbol, and word-boundary-searches the apps/web corpus. Fails on any
   // unreferenced export not allow-listed (with a reason) in .audit-ignore.json. Exits 0 when
   // apps/web is absent — there is nothing to audit yet.
   import { existsSync } from 'node:fs';
   const WEB_DIR = new URL('../apps/web', import.meta.url);
   if (!existsSync(WEB_DIR)) {
     console.log('audit:exports — apps/web absent; nothing to audit yet.');
     process.exit(0);
   }
   // …parse .d.ts → search corpus → report → process.exit(unreferenced.length ? 1 : 0)
   ```
3. `scripts/audit-rust-public-api.sh`:
   ```sh
   #!/usr/bin/env bash
   set -euo pipefail
   # Runs `cargo public-api` over the consumed crates (bymax-auth-axum/-core/-redis) and checks
   # every pub item is referenced in apps/api (or allow-listed with a reason in .audit-ignore.json).
   # Exits 0 on the current stub: no path deps are wired yet, so there is no pub surface to audit.
   if ! grep -q 'bymax-auth' apps/api/Cargo.toml 2>/dev/null; then
     echo "audit:public-api — no consumed crates wired yet; nothing to audit."
     exit 0
   fi
   ```
4. `.audit-ignore.json` → `{ "exports": [], "publicApi": [] }` with a top comment documenting the `{ symbol, reason }` shape.

Constraints:
- Job names are CONTRACTUAL — use the Appendix D names verbatim.
- Least-privilege `permissions`; pinned actions; `timeout-minutes` per job; `concurrency` cancel-in-progress.
- Scripts must exit 0 on the empty tree — the gate becomes real once `apps/web`/the path deps land.
- English-only, timeless comments — NO Phase/Task references in the YAML or scripts.
- No `.gitkeep`; `git switch -c` only.

Verification:
- `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/ci.yml'))"` — expected: valid YAML.
- `node scripts/audit-library-exports.mjs` — expected: exit 0, prints "nothing to audit yet".
- `bash scripts/audit-rust-public-api.sh` — expected: exit 0, prints "nothing to audit".
- `pnpm audit:exports && pnpm audit:public-api` — expected: both exit 0.
- `grep -riE "phase [0-9]|task [0-9]" .github/workflows/ci.yml scripts/` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 7` and Last updated.
4. Update the P0 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 0.5 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `ci(workflow): core ci pipeline + export-audit script stubs` (no Co-Authored-By).
````

---

### Task 0.6 — Security & supply-chain workflows

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 0.5

#### Description

Add the go-public security workflows — CodeQL (`javascript-typescript`, `security-extended`), OpenSSF Scorecard, and a secret-scan (gitleaks) — each with job-scoped least-privilege permissions, pinned actions, and timeouts; re-verify each action's current usage via context7/WebSearch before pinning.

#### Acceptance criteria

- [x] `.github/workflows/codeql.yml` analyzes `javascript-typescript` with the `security-extended` query suite on PR + push to `main` + a weekly cron, uploads SARIF to the Security tab, and scopes `security-events: write` to the analyze job only.
- [x] `.github/workflows/scorecard.yml` runs OpenSSF Scorecard on push to `main` + weekly cron (informational), with `id-token: write` scoped to the job and SARIF upload.
- [x] A secret-scan workflow (gitleaks) runs on PR + push and fails on a detected secret (test fixtures / Mailpit values excluded).
- [x] Every workflow sets top-level `permissions: contents: read`, pins all actions, and sets `timeout-minutes` per job.
- [x] Each third-party action version is re-verified against current docs (context7/WebSearch) before pinning.

#### Files to create / modify

- `.github/workflows/codeql.yml`
- `.github/workflows/scorecard.yml`
- `.github/workflows/secret-scan.yml`

#### Agent prompt

````
You are a senior Rust + TypeScript build/CI/tooling engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 0 (Foundation, Tooling & CI Skeleton) — Task 0.6 of 7 (MIDDLE)

PRECONDITIONS
- Task 0.5 is done: `ci.yml` runs green with least-privilege permissions, pinned actions, and per-job timeouts — match that posture.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md Appendix D (the `codeql.yml` / `scorecard.yml` rows + the secret-scan note) + Appendix E (the go-public security-gate requirements).
- docs/DEVELOPMENT_PLAN.md § 3 "Autonomous Execution Model" (branch-protection references these jobs by name — keep them stable).
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/.github/workflows/codeql.yml + scorecard.yml — the security-workflow shape to copy-and-adapt (note: this example analyzes javascript-typescript, NOT a compiled language).
- Re-verify the current usage of github/codeql-action, ossf/scorecard-action, and gitleaks/gitleaks-action via context7 (mcp__context7__resolve-library-id → query-docs) or WebSearch before pinning — do not pin from memory.

TASK
Author the three security workflows. Each is least-privilege, pinned, and bounded. They run informationally now and become go-public gates later.

DELIVERABLES
1. `.github/workflows/codeql.yml`:
   ```yaml
   name: codeql
   on:
     pull_request:
     push:
       branches: [main]
     schedule:
       - cron: "0 6 * * 1"
   permissions:
     contents: read
   jobs:
     analyze:
       timeout-minutes: 30
       runs-on: ubuntu-latest
       permissions:
         security-events: write
         actions: read
       steps:
         - uses: actions/checkout@v5
         - uses: github/codeql-action/init@<pinned>
           with: { languages: javascript-typescript, queries: security-extended }
         - uses: github/codeql-action/analyze@<pinned>
   ```
2. `.github/workflows/scorecard.yml` — OpenSSF Scorecard on push `main` + weekly cron; `id-token: write` + `security-events: write` scoped to the job; `ossf/scorecard-action@<pinned>` → SARIF upload; `publish_results: true`.
3. `.github/workflows/secret-scan.yml` — `gitleaks/gitleaks-action@<pinned>` on PR + push; fails on a detected secret; document that Mailpit/test-fixture values are not real keys.

Constraints:
- Top-level `permissions: contents: read`; widen only per-job for exactly what each needs.
- Pin every action to a verified version (re-checked against current docs — not memory).
- `timeout-minutes` on every job.
- English-only, timeless comments — NO Phase/Task references in the YAML.
- No `.gitkeep`; `git switch -c` only.

Verification:
- `python3 -c "import yaml,glob;[yaml.safe_load(open(f)) for f in ['.github/workflows/codeql.yml','.github/workflows/scorecard.yml','.github/workflows/secret-scan.yml']]"` — expected: all valid YAML.
- `grep -L 'permissions:' .github/workflows/{codeql,scorecard,secret-scan}.yml` — expected: no output (every file declares permissions).
- `grep -riE "phase [0-9]|task [0-9]" .github/workflows/{codeql,scorecard,secret-scan}.yml` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 7` and Last updated.
4. Update the P0 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 0.6 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `ci(security): codeql + scorecard + secret-scan workflows` (no Co-Authored-By).
````

---

### Task 0.7 — Mutation/release skeletons + Dockerfiles

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: 0.5

#### Description

Add the mutation and release workflow skeletons (`mutation.yml`, `mutation-nightly.yml`, `release.yml`), the multi-stage `apps/{api,web}/Dockerfile` skeletons + `.dockerignore`, and the `docs/RELEASES.md` seed table. As the LAST task, run the per-phase completion protocol.

#### Acceptance criteria

- [ ] `.github/workflows/mutation.yml` is PR-triggered with a `dorny/paths-filter` `detect` job gating `mutation-api` (`cargo-mutants`) and `mutation-web` (Stryker); `mutation-nightly.yml` runs a Monday 03:00 UTC cron full run and opens a drift issue on failure.
- [ ] `.github/workflows/release.yml` triggers on `v*` tags, uses OIDC (`id-token: write` + `packages: write` scoped to the build job), builds + pushes GHCR `…-api` / `…-web` images via `docker/metadata-action` + `docker/build-push-action`, and appends a `RELEASES.md` row via a bot commit.
- [ ] `apps/api/Dockerfile` (multi-stage cargo build → slim runtime) and `apps/web/Dockerfile` (multi-stage Next.js build) + `.dockerignore` exist and are buildable skeletons.
- [ ] `docs/RELEASES.md` has the seed table (branch → tracked `bymax-auth` version, reading from `apps/api/Cargo.toml`).
- [ ] Every workflow is least-privilege, pinned, bounded; `release` sets `concurrency` with `cancel-in-progress: false`.
- [ ] The per-phase protocol is run: P0 flipped to ✅ at 7/7 in this file + DEVELOPMENT_PLAN.md, Active phase advanced, Overall progress recomputed.

#### Files to create / modify

- `.github/workflows/mutation.yml`, `.github/workflows/mutation-nightly.yml`, `.github/workflows/release.yml`
- `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`
- `docs/RELEASES.md`
- `docs/DEVELOPMENT_PLAN.md` (P0 closeout), this file (header + index + log)

#### Agent prompt

````
You are a senior Rust + TypeScript build/CI/tooling engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 0 (Foundation, Tooling & CI Skeleton) — Task 0.7 of 7 (LAST)

PRECONDITIONS
- Task 0.5 is done: `ci.yml` is green with the contractual job names; the audit scripts exist. `apps/api` is a compiling stub; `apps/web` does not exist yet — the mutation/release jobs run as validating skeletons.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md Appendix D (the `mutation.yml` / `mutation-nightly.yml` / `release.yml` rows — triggers, jobs, the GHCR `…-api`/`…-web` images, the RELEASES.md bot row) + Appendix C (the mutation bar: cargo-mutants ≥ 95, Stryker break ≥ 95).
- docs/DEVELOPMENT_PLAN.md § Update Protocol + the Phase Completion Protocol below (you run it as the LAST task).
- docs/OVERVIEW.md § 18 "Deployment Notes" (the two deployable images) + § 19 "Versioning & Release Tracking" (the RELEASES.md per-branch row).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/.github/workflows/{mutation,mutation-nightly,release}.yml + apps/{api,web}/Dockerfile — the workflow + Dockerfile shape to copy-and-adapt (swap the api job to cargo-mutants; the release lib-version row reads apps/api/Cargo.toml).

TASK
Author the mutation/release workflow skeletons + the two Dockerfiles + `.dockerignore` + the `RELEASES.md` seed, then run the per-phase completion protocol to close P0.

DELIVERABLES
1. `.github/workflows/mutation.yml`:
   ```yaml
   name: mutation
   on: { pull_request: { paths: ["apps/api/src/**", "apps/web/{app,lib,components}/**", "**/Cargo.*", "pnpm-lock.yaml"] } }
   permissions: { contents: read }
   concurrency: { group: mutation-${{ github.ref }}, cancel-in-progress: true }
   jobs:
     detect:        # dorny/paths-filter@<pinned> → outputs api / web booleans
       timeout-minutes: 5
       runs-on: ubuntu-latest
     mutation-api:  # if needs.detect.outputs.api == 'true' → cargo-mutants (capped --jobs), gate caught/(caught+missed) >= 0.95
       needs: detect
       timeout-minutes: 60
       runs-on: ubuntu-latest
     mutation-web:  # if needs.detect.outputs.web == 'true' → stryker run --incremental (break 95)
       needs: detect
       timeout-minutes: 60
       runs-on: ubuntu-latest
   ```
2. `.github/workflows/mutation-nightly.yml` — `schedule: '0 3 * * 1'` + `workflow_dispatch`; `full-api` (`cargo-mutants` cold) / `full-web` (`stryker run --force`); opens a `mutation-drift` issue on failure.
3. `.github/workflows/release.yml` — on `v*` tags; top-level `permissions: contents: read`; `concurrency: { group: release-${{ github.ref }}, cancel-in-progress: false }`; `build-and-push` job adds `packages: write` + `id-token: write`, uses `docker manifest inspect` idempotency, `docker/metadata-action@<pinned>` (semver tags), `docker/build-push-action@<pinned>` for both Dockerfiles; `update-releases-doc` appends a `RELEASES.md` row (lib version read from `apps/api/Cargo.toml`) via a bot commit.
4. `apps/api/Dockerfile`:
   ```dockerfile
   FROM rust:1.96.0-slim AS build
   WORKDIR /app
   COPY . .
   RUN cargo build --release --locked -p api
   FROM gcr.io/distroless/cc-debian12 AS runtime
   COPY --from=build /app/target/release/api /usr/local/bin/api
   EXPOSE 4000
   ENTRYPOINT ["/usr/local/bin/api"]
   ```
5. `apps/web/Dockerfile` (multi-stage `node:24-slim` build → standalone Next.js runtime) + `.dockerignore` (`target`, `node_modules`, `.next`, `.git`).
6. `docs/RELEASES.md` — a seed table: `| Branch | Tracked bymax-auth | @bymax-one/rust-auth | Date |` with the `main` row marked pre-publish (`0.0.0` path/file:).

Constraints:
- `release` is the ONLY workflow with `cancel-in-progress: false`; OIDC for publishing (no static registry creds).
- Least-privilege, pinned, `timeout-minutes` everywhere; `cargo-mutants --jobs` capped for memory safety; Stryker via the web package.
- English-only, timeless comments — NO Phase/Task references in any committed YAML, Dockerfile, or RELEASES.md.
- No `.gitkeep`; `git switch -c` only.

Verification:
- `python3 -c "import yaml;[yaml.safe_load(open('.github/workflows/'+f)) for f in ['mutation.yml','mutation-nightly.yml','release.yml']]"` — expected: all valid YAML.
- `docker build -f apps/api/Dockerfile -t rae-api:skeleton .` — expected: the api image builds (multi-stage).
- `grep -q '| Branch |' docs/RELEASES.md` — expected: match (seed table present).
- `grep -riE "phase [0-9]|task [0-9]" .github/workflows/{mutation,mutation-nightly,release}.yml apps/api/Dockerfile apps/web/Dockerfile docs/RELEASES.md` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `7 / 7` and Last updated.
4. Update the P0 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 0.7 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `ci(release): mutation + release workflow skeletons and Dockerfiles` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol: in docs/DEVELOPMENT_PLAN.md flip the P0 dashboard row to ✅ / 7 of 7, advance the Active phase to P1, recompute Overall progress; set THIS file's header Status to ✅; confirm every DoD bullet is met — if any is unmet use 🟡 Partial, never ✅.)
````

---

## Phase Completion Protocol

Run this only when the LAST task (0.7) is ✅:

1. Confirm **all seven tasks are ✅** in the Task index and that every § P0 **Definition of Done** bullet is observably met (the static gates pass on the stub, `ci.yml` is green on a PR, `codeql.yml` + `scorecard.yml` run, `release.yml` validates without publishing, all go-public files present, the four Copilot files < 4000 chars with no phase/task references, `deny.toml` mirrors the library ban, no `.gitkeep`).
2. Confirm the phase PR is **merged** and **CI is fully green** (every Appendix D job name + `codeql` + `scorecard` + secret-scan).
3. In [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P0** dashboard Status to ✅, Progress `7 / 7`, Last updated to today; advance **Active phase** to P1; recompute **Overall progress** (`1 / 15 phases`, task %).
4. In this file: set the header **Status** to ✅ and Progress `7 / 7`.
5. Commit `docs(plan): P0 complete` (no `Co-Authored-By`).
6. If any DoD bullet is unmet, set the phase to 🟡 Partial (never ✅) and record the gap before proceeding.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 0.1 ✅ 2026-07-01 — Dual cargo + pnpm workspace, pinned toolchains, compiling `apps/api` stub, TS-strict base; `Cargo.lock` + `pnpm-lock.yaml` committed.
- 0.2 ✅ 2026-07-01 — Rust lint/supply-chain policy (`rustfmt.toml`, `clippy.toml`, `deny.toml` + workspace deny-lints) and cross-stack commit governance (commitlint, husky hooks, lint-staged, ESLint flat, Prettier, editor/git dotfiles).
- 0.3 ✅ 2026-07-01 — Mandatory governance + community-health files: MIT `LICENSE`, badge-header `README.md` with ASCII diagram + docs table, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and the `CLAUDE.md`/`AGENTS.md` invariants.
- 0.4 ✅ 2026-07-01 — GitHub config: issue templates + `config.yml` (security → advisory), PR template, `CODEOWNERS`, `dependabot.yml` (cargo/npm/actions), and the four Rust+TS Copilot review files (instruction files < 4000 chars, no planning-stage references).
- 0.5 ✅ 2026-07-01 — Core `ci.yml` (full Appendix D job DAG, least-privilege, pinned, bounded, `dependency-review` gated informational while private) + the two export-audit scripts and the `.audit-ignore.json` seed, all green on the empty tree.
- 0.6 ✅ 2026-07-01 — Security workflows: CodeQL (`javascript-typescript`, `security-extended`, v4), OpenSSF Scorecard (v2.4.3), and a gitleaks CLI secret-scan (real gate, org-license-free) with a `.gitleaks.toml` allow-list; CodeQL/Scorecard gated to public so private PRs stay green; action versions verified against current releases.

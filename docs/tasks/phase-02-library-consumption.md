# Phase 2 — Library Consumption & Export Audits

> **Status**: 🔄 In Progress · **Progress**: 0 / 4 tasks · **Last updated**: 2026-07-02
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P2
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phase 1 produced the local stack and the fail-fast `Settings` loader: `pnpm infra:up` brings Postgres + Redis + Mailpit up healthy, and `apps/api/src/config/` validates the environment at boot. The `apps/api` crate still compiles only against the standard library and the `figment`-based config — it does **not** yet depend on the library under demonstration, and `apps/web` is an empty skeleton with no package linked. The two coverage audits exist only as the trivial stubs scaffolded in Phase 0.

This phase makes the library a **real, linked dependency in both workspaces** and turns the two export audits into working tools. On the Rust side it adds the three `path` dependencies (`bymax-auth-axum` / `bymax-auth-core` / `bymax-auth-redis`) reaching across the checkout boundary to `../../../rust-auth/crates/*`, plus a tiny compile-time probe that names a symbol from each crate so the link is genuinely exercised by `rustc` rather than merely declared. On the browser side it wires the build-first `link-library.sh` / `unlink-library.sh` scripts (the npm package's `dist/` and `wasm/` are git-ignored and absent until `pnpm build:wasm && pnpm build` run), the `file:` dependency in `apps/web/package.json`, and the `next.config.mjs` externalization (`serverExternalPackages` + `outputFileTracingRoot`). Finally it finalizes both audits: `scripts/audit-library-exports.mjs` (parses the built `dist/**/*.d.ts` for the four subpaths and word-boundary-searches `apps/web`) and `scripts/audit-rust-public-api.sh` (snapshots `cargo public-api` over the three consumed crates and checks every `pub` item is referenced in `apps/api`).

When P2 is done, `cargo build --locked` links all three library crates into `apps/api` and `cargo +1.90 check` proves the MSRV floor holds with the deps in place; `bash scripts/link-library.sh` builds the npm package and `pnpm -C apps/web build` resolves the `file:`-linked `@bymax-one/rust-auth`; `pnpm audit:exports` parses the four subpaths from the real `.d.ts` and `bash scripts/audit-rust-public-api.sh` captures the three committed snapshots — both passing trivially on the current stub (the catalog-only error sentinels allow-listed with a reason). The build-first ordering is documented and wired into the `build-library` CI job. **No engine wiring, no repositories, no UI — those are Phase 5 and later; this phase only links the surfaces and arms the audits that keep the coverage promise honest.**

---

## Rules-of-phase

1. **Prefer `path` / `file:` over symlinks.** Rust depends via `path` to `../../../rust-auth/crates/*`; the browser depends via `file:../../../rust-auth/packages/rust-auth`. No `pnpm link --global`, no manual symlinks into `node_modules` — the dependency must be reproducible from the manifest alone.
2. **The facade crate is a stub.** `bymax-auth` has zero `pub use` and no `[dependencies]`; never write `use bymax_auth::*`. Depend on the concrete crates `bymax-auth-axum` / `bymax-auth-core` / `bymax-auth-redis` directly; `-types` / `-crypto` / `-jwt` arrive transitively.
3. **Build the npm package before consuming it.** `dist/` and `wasm/` are git-ignored and absent until `pnpm build:wasm && pnpm build`. Any consumer step (local bootstrap, the `build-library` CI job) builds the upstream package first; a fresh clone that skips this fails to resolve the `file:` link.
4. **Allow-list only genuinely-internal leaked symbols, never a demonstrable export.** The Rust allow-list carries exactly the four catalog-only codes (`TokenExpired`, `TokenRevoked`, `TokenMissing`, `PasswordResetTokenExpired`), each with a written reason. Silencing a real export to make an audit green is forbidden.
5. **WASM `extract_claims` / `verify_password` are out-of-surface — do not allow-list them.** `extract_claims` is exported by the WASM module but unsurfaced in the npm package; `verify_password` is gated behind `wasm-extra` (off in the npm build). They are simply absent from the `.d.ts`, so the npm audit never sees them — no ignore entry is needed or allowed.
6. **`Cargo.lock` is committed.** `apps/api` is a binary; the lockfile is part of the supply-chain posture. After adding the path deps, commit the updated `Cargo.lock`.
7. **Audits parse the real shipped surface, never prose.** The npm audit reads the built `dist/**/*.d.ts`; the Rust audit reads `cargo public-api` output. Neither derives its symbol list from a README or this document.
8. **Snapshots are reviewable artifacts.** The `cargo public-api` snapshot is committed under `apps/api/public-api/`; a diff against it is a deliberate, reviewed change — a surprise drift fails the audit.
9. **English-only, timeless comments.** No `Phase N` / task / roadmap references in any committed source, script, config, or snapshot. `git switch -c` only (never `git checkout -b`); Conventional Commits with no `Co-Authored-By` trailer.

---

## Reference docs

- [`docs/OVERVIEW.md`](../OVERVIEW.md) — § 6 "Feature Coverage Matrix" (the Coverage rule + the two CI audits) and § 7 "Library Consumption" (the exact `path` / `file:` snippets, the `next.config.mjs` externalization, the build-first ordering).
- [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P2 (scope + DoD), § 2 "Global Conventions" (the Library-dependency, Audits, and Memory-safe rows), Appendix B (Library Export → Phase Coverage Map), Appendix C (the Export-usage + Public-API gates), Appendix D (the `build-library` job + the `export-usage-check` job).
- [`docs/DASHBOARD.md`](../DASHBOARD.md) — `apps/web` console build spec; the `serverExternalPackages` / `outputFileTracingRoot` context for the `file:` consumer.
- `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-axum` · `.../bymax-auth-core` · `.../bymax-auth-redis` — the three consumed crates whose `pub` surface the Rust audit snapshots.
- `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/packages/rust-auth` — the npm package to build (`build:wasm` + `build`) and `file:`-link.
- `/Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/scripts/link-library.sh` · `.../scripts/audit-library-exports.mjs` — the sibling scripts to copy-and-adapt (the `.d.ts` parser, the `.audit-ignore.json` reader, the build-first bootstrap).
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Rust `path` deps + consumed-symbol probe | 📋 ToDo | P0 | M | — |
| 2.2 | npm package build + `file:` link | 📋 ToDo | P0 | M | — |
| 2.3 | npm export-usage audit | 📋 ToDo | P1 | M | 2.2 |
| 2.4 | `cargo public-api` audit | 📋 ToDo | P1 | M | 2.1 |

---

## Tasks

### Task 2.1 — Rust `path` deps + consumed-symbol probe

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Add the three `path` dependencies on `bymax-auth-axum` / `bymax-auth-core` / `bymax-auth-redis` to `apps/api/Cargo.toml` and a minimal compile-time probe that names one symbol from each crate, so the link is genuinely exercised by the compiler and `Cargo.lock` records the resolved graph.

#### Acceptance criteria

- [ ] `apps/api/Cargo.toml` declares `bymax-auth-axum = { path = "../../../rust-auth/crates/bymax-auth-axum", features = ["full"] }`, `bymax-auth-core = { path = "../../../rust-auth/crates/bymax-auth-core", features = ["full"] }`, and `bymax-auth-redis = { path = "../../../rust-auth/crates/bymax-auth-redis", features = ["mfa", "oauth", "platform"] }`.
- [ ] A probe module (`apps/api/src/probe.rs`) names `AuthEngine` (core), `AxumAuthConfig` (axum), and `RedisStores` (redis) so all three path deps link; it carries timeless rustdoc and is referenced from the crate root.
- [ ] `cargo build --locked` succeeds and links the three crates; the updated `Cargo.lock` is committed.
- [ ] `cargo +1.90 check` builds the crate on the MSRV floor with the new dependencies present.
- [ ] `cargo fmt --all --check` is clean and `cargo clippy --workspace --all-targets -- -D warnings` is clean (no `unwrap`/`expect`/`panic` introduced).
- [ ] No `.gitkeep` / empty-directory placeholders are created.

#### Files to create / modify

- `apps/api/Cargo.toml`
- `apps/api/src/probe.rs`
- `apps/api/src/main.rs` (or the crate-root module list — wire in the probe)
- `Cargo.lock` (commit the updated lockfile)

#### Agent prompt

````
You are a senior Rust + build-integration engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 2 (Library Consumption & Export Audits) — Task 2.1 of 4 (FIRST)

PRECONDITIONS
- Phase 0 scaffolded `apps/api` as a building stub (a `main.rs` that compiles) inside the cargo workspace `Cargo.toml` (`members = ['apps/api']`), with `rust-toolchain.toml` channel 1.96.0 and `rust-version = "1.90"`.
- Phase 1 added `apps/api/src/config/` (the figment-based `Settings`). The crate has NO dependency on the library yet.
- The library checkout exists at `../../../rust-auth` relative to `apps/api/` (i.e. `<repo>/../rust-auth`), with the crates under `crates/bymax-auth-{axum,core,redis}`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "7. Library Consumption" — copy the exact `path` snippet and the `features = ["full"]` rationale; note the facade is a stub so you depend on the three concrete crates directly.
- docs/DEVELOPMENT_PLAN.md § "Phase 2" + § "2. Global Conventions" (the Library-dependency row) — `path` across the checkout boundary; `Cargo.lock` committed.
- ../../../rust-auth/crates/bymax-auth-core/src/lib.rs and .../bymax-auth-axum/src/lib.rs and .../bymax-auth-redis/src/lib.rs — confirm the crate-root re-exports `AuthEngine`, `AxumAuthConfig`, and `RedisStores` (the symbols the probe names).

TASK
Add the three `path` dependencies to `apps/api/Cargo.toml` and a minimal compile-time probe that references one type from each crate, so the link is real and `cargo build --locked` records the resolved graph in `Cargo.lock`. Do NOT wire the engine, repositories, stores, or any route — that is later work. The probe is a temporary link-proof, replaced when the real `apps/api/src/engine/` and `apps/api/src/app.rs` wiring lands.

DELIVERABLES
1. `apps/api/Cargo.toml` — add to `[dependencies]`:
   ```toml
   # The library under demonstration, consumed pre-publish across the checkout
   # boundary. The `bymax-auth` facade is a stub (no `pub use`), so depend on the
   # concrete crates directly; `-types`/`-crypto`/`-jwt` arrive transitively.
   bymax-auth-axum  = { path = "../../../rust-auth/crates/bymax-auth-axum",  features = ["full"] }
   bymax-auth-core  = { path = "../../../rust-auth/crates/bymax-auth-core",  features = ["full"] }
   bymax-auth-redis = { path = "../../../rust-auth/crates/bymax-auth-redis", features = ["mfa", "oauth", "platform"] }
   ```
2. `apps/api/src/probe.rs` — a tiny module that names a symbol from each consumed crate so the compiler exercises all three path deps:
   ```rust
   //! Compile-time proof that the three consumed library crates link.
   //!
   //! Naming one type from each crate forces `rustc` to resolve the path
   //! dependencies declared in `Cargo.toml` (a declared-but-unused dependency
   //! would not). This module carries no runtime behaviour; its sole purpose is
   //! link coverage of the consumed crates.

   use bymax_auth_axum::AxumAuthConfig;
   use bymax_auth_core::AuthEngine;
   use bymax_auth_redis::RedisStores;

   /// Returns the default adapter config, having named a type from each consumed
   /// crate. The body is intentionally trivial — its purpose is link coverage,
   /// not behaviour.
   #[must_use]
   pub fn consumed_surface_probe() -> AxumAuthConfig {
       // Name the builder entry point (core) and the store handle type (redis)
       // without performing any I/O or constructing an engine.
       let _engine_builder = AuthEngine::builder;
       // `connect` is generic over its namespace parameter, so pin it with a
       // turbofish to satisfy inference when bound without a call site.
       let _stores_connect = RedisStores::connect::<String>;
       AxumAuthConfig::default()
   }
   ```
3. `apps/api/src/main.rs` — declare the module (`mod probe;`) so it is compiled. A single reference (e.g. `let _ = probe::consumed_surface_probe;` behind the existing startup path, or a `pub use` from the crate root if `main.rs` is binary-only) is enough; keep it dead-code-clippy-clean (the `pub fn` + `#[must_use]` suffices — do not add `#[allow(dead_code)]`).
4. `Cargo.lock` — commit the lockfile updated by `cargo build --locked`.

Constraints:
- #![forbid(unsafe_code)] stays; no `unwrap`/`expect`/`panic!`/`todo!`/`unreachable!` in non-test code; typed `thiserror` errors only.
- Do NOT add `bymax-auth` (the facade) as a dep. `bymax-auth-types`/`-crypto`/`-jwt` arrive transitively for now — the probe names no type from them. **The moment a later module names a domain type from `bymax-auth-types` directly (first in P3: `AuthError`), that phase must add `bymax-auth-types = { path = "../../../rust-auth/crates/bymax-auth-types" }` as an explicit dep** — a transitive dependency is not nameable in Rust.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed file. No `.gitkeep`. `git switch -c` only. No `#[allow(...)]` suppression without a written justification (none needed here).

Verification:
- `cargo build --locked` — expected: builds; the three crates appear in the linked graph; `Cargo.lock` updated.
- `cargo +1.90 check` — expected: builds on the MSRV floor with the new deps present.
- `cargo fmt --all --check` — expected: no diff.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean (no dead-code warning on the probe).
- `git check-ignore Cargo.lock` — expected: no output (the lockfile is tracked).
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 4` and Last updated.
4. Update the P2 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 2.1 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `build(api): add bymax-auth path deps + link probe` (no Co-Authored-By).
````

---

### Task 2.2 — npm package build + `file:` link

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Author `scripts/link-library.sh` / `scripts/unlink-library.sh` that build the upstream npm package (`pnpm build:wasm && pnpm build`) and `file:`-link it, add the `file:` dependency to `apps/web/package.json`, and externalize the package in `apps/web/next.config.mjs` (`serverExternalPackages` + `outputFileTracingRoot`).

#### Acceptance criteria

- [ ] `scripts/link-library.sh` builds the upstream package at `../../../rust-auth/packages/rust-auth` (`pnpm install --frozen-lockfile=false && pnpm build:wasm && pnpm build`, refusing to run when `CI=true`) and then runs `pnpm install` in this repo so the `file:` link resolves; `scripts/unlink-library.sh` reverses it cleanly.
- [ ] `apps/web/package.json` depends on `"@bymax-one/rust-auth": "file:../../../rust-auth/packages/rust-auth"`.
- [ ] `apps/web/next.config.mjs` sets `serverExternalPackages: ['@bymax-one/rust-auth']` and `outputFileTracingRoot: path.join(import.meta.dirname, '../..')`.
- [ ] After `bash scripts/link-library.sh`, the four subpath declaration files exist under `apps/web/node_modules/@bymax-one/rust-auth/dist/{client,react,nextjs,shared}/index.d.ts`.
- [ ] `pnpm -C apps/web build` resolves the `file:`-linked package and completes.
- [ ] No `.gitkeep` / empty-directory placeholders are created; both scripts are executable (`chmod +x`).

#### Files to create / modify

- `scripts/link-library.sh`
- `scripts/unlink-library.sh`
- `apps/web/package.json`
- `apps/web/next.config.mjs`
- `pnpm-lock.yaml` (updated by `pnpm install`)

#### Agent prompt

````
You are a senior Rust + build-integration engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 2 (Library Consumption & Export Audits) — Task 2.2 of 4 (MIDDLE)

PRECONDITIONS
- Phase 0 created the pnpm workspace (`pnpm-workspace.yaml: packages: ['apps/web']`), `apps/web` as a Next.js 16 skeleton, and a `.npmrc` with `frozen-lockfile=true`.
- The upstream npm package lives at `../../../rust-auth/packages/rust-auth` (relative to `apps/web/`, i.e. `<repo>/../rust-auth/packages/rust-auth`). Its `dist/` and `wasm/` are GIT-IGNORED and ABSENT until `pnpm build:wasm && pnpm build` run there. The package has NO root export — only four subpaths: `/client`, `/react`, `/nextjs`, `/shared`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "7. Library Consumption" — the exact `link-library.sh` bootstrap, the `file:` dependency line, and the `next.config.mjs` snippet (`serverExternalPackages` + `outputFileTracingRoot`).
- docs/DEVELOPMENT_PLAN.md § "Phase 2" + Appendix D (the `build-library` job that builds the package before the web build resolves it).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/scripts/link-library.sh — copy-and-adapt the bash structure (set -euo pipefail, the CI guard, the resolved-path echo), but switch from `pnpm link --global` to a `file:` dependency + `pnpm build:wasm && pnpm build` (this package wraps a WASM module).

TASK
Wire the build-first `file:` consumption of `@bymax-one/rust-auth` into `apps/web`. Author the link/unlink scripts, the `file:` dependency, and the Next.js externalization. Do NOT consume any export in app code — that is later UI work; this task only makes the package resolvable.

DELIVERABLES
1. `scripts/link-library.sh` (executable):
   ```bash
   #!/usr/bin/env bash
   # Build @bymax-one/rust-auth from the sibling rust-auth checkout (WASM + dist)
   # and resolve the file: link in this workspace. Idempotent; never run in CI.
   set -euo pipefail

   if [[ "${CI:-}" == "true" ]]; then
     echo "error: link-library.sh must not run in CI — the build-library job builds the package" >&2
     exit 1
   fi

   HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
   LIB_DIR="$(cd "${HERE}/../rust-auth/packages/rust-auth" 2>/dev/null && pwd || true)"

   if [[ -z "${LIB_DIR}" || ! -d "${LIB_DIR}" ]]; then
     echo "error: expected the npm package at ${HERE}/../rust-auth/packages/rust-auth" >&2
     exit 1
   fi

   echo "==> Building ${LIB_DIR} (WASM then dist)"
   # The package's dist/ and wasm/ are git-ignored and absent until built.
   (cd "${LIB_DIR}" && pnpm install --frozen-lockfile=false && pnpm build:wasm && pnpm build)

   echo "==> Resolving the file: link in $(basename "${HERE}")"
   (cd "${HERE}" && pnpm install)

   echo "==> Resolved:"
   (cd "${HERE}/apps/web" && node --input-type=commonjs -e \
     "console.log(require.resolve('@bymax-one/rust-auth/shared'))")
   ```
2. `scripts/unlink-library.sh` (executable): removes `apps/web/node_modules/@bymax-one/rust-auth` and re-runs `pnpm install` so a clean state is restored; refuses to run in CI; idempotent.
3. `apps/web/package.json` — add the dependency:
   ```json
   {
     "dependencies": {
       "@bymax-one/rust-auth": "file:../../../rust-auth/packages/rust-auth"
     }
   }
   ```
4. `apps/web/next.config.mjs`:
   ```js
   import path from 'node:path';

   /** @type {import('next').NextConfig} */
   export default {
     // The package wraps a WASM module; keep it out of the bundler so the
     // `.wasm` resolves at runtime, and widen tracing to the monorepo root.
     serverExternalPackages: ['@bymax-one/rust-auth'],
     outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
   };
   ```

Constraints:
- The dependency MUST be a `file:` path in the manifest — no `pnpm link --global`, no hand-edited symlink in `node_modules`.
- The scripts refuse to run under `CI=true` (CI builds the package via the `build-library` job, not these dev scripts).
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed file. No `.gitkeep`. `git switch -c` only.

Verification:
- `bash scripts/link-library.sh` — expected: builds the package, then prints a resolved path ending in `.../rust-auth/packages/rust-auth/dist/shared/index.js` (or `.d.ts`).
- `ls apps/web/node_modules/@bymax-one/rust-auth/dist/{client,react,nextjs,shared}/index.d.ts` — expected: all four files listed.
- `pnpm -C apps/web build` — expected: completes; the package resolves with `serverExternalPackages` set.
- `bash scripts/unlink-library.sh && bash scripts/link-library.sh` — expected: both succeed (idempotent round-trip).
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 4` and Last updated.
4. Update the P2 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 2.2 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `build(web): build + file:-link @bymax-one/rust-auth` (no Co-Authored-By).
````

---

### Task 2.3 — npm export-usage audit

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: 2.2

#### Description

Finalize `scripts/audit-library-exports.mjs` so it parses the built `dist/**/*.d.ts` for the `/client`, `/react`, `/nextjs`, `/shared` subpaths, word-boundary-searches `apps/web` for every exported symbol, reads `.audit-ignore.json` for allow-listed entries, and exits 1 on any unreferenced, non-ignored export.

#### Acceptance criteria

- [ ] The script discovers subpaths dynamically from `apps/web/node_modules/@bymax-one/rust-auth/dist/` and parses each subpath's `index.d.ts` for exported symbols (named exports, `export { … }`, `export type { … }`, skipping `from '<external>'` re-exports).
- [ ] It word-boundary-searches the `apps/web` corpus (skipping `node_modules`, `.next`, `dist`, `coverage`) and reports every unreferenced symbol grouped by subpath.
- [ ] It reads `.audit-ignore.json` (`"<subpath>.<symbol>": "reason"`) and exits 1 on any unreferenced symbol not in the ignore map; exit 0 otherwise.
- [ ] A root `audit:exports` script runs it (`node scripts/audit-library-exports.mjs`); the `.audit-ignore.json` carries only genuinely-internal leaked symbols with reasons — NOT `extract_claims` / `verify_password` (those are absent from the `.d.ts`).
- [ ] A self-check proves the parser: a known export (`createAuthClient`) is extracted from `/client` and a deliberately-fake symbol is reported missing.
- [ ] On the current `apps/web` stub the audit passes trivially (report mode); CI flips to strict enforcement in the docs/release phase per DEVELOPMENT_PLAN Appendix C.

#### Files to create / modify

- `scripts/audit-library-exports.mjs`
- `.audit-ignore.json`
- `package.json` (root — the `audit:exports` script, if not already present)

#### Agent prompt

````
You are a senior Rust + build-integration engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 2 (Library Consumption & Export Audits) — Task 2.3 of 4 (MIDDLE)

PRECONDITIONS
- Task 2.2 is done: `bash scripts/link-library.sh` builds the npm package and the four subpath declaration files exist at `apps/web/node_modules/@bymax-one/rust-auth/dist/{client,react,nextjs,shared}/index.d.ts`.
- Phase 0 scaffolded `scripts/audit-library-exports.mjs` as a trivial stub. `apps/web` is still a near-empty skeleton (the console pages land in later phases).
- The npm surface is FOUR subpaths only (no root export): `/client` (createAuthFetch, createAuthClient, AuthClient, AuthClientError, …), `/react` (AuthProvider, useSession, useAuth, useAuthStatus, …), `/nextjs` (verifyJwtToken, decodeJwtToken, createAuthProxy, createClientRefreshHandler, createSilentRefreshHandler, createLogoutHandler, …), `/shared` (AUTH_ROUTES, AUTH_ERROR_CODES (38), AuthClientError, the ts-rs types). The WASM `extract_claims`/`verify_password` are NOT in any `.d.ts` (out-of-surface) — they must never appear and must never be allow-listed.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "6. Feature Coverage Matrix" — the Coverage rule (parse `dist/**/*.d.ts`, word-boundary-search `apps/web`, fail on an unused export; allow-list only genuinely-internal leaked symbols).
- docs/DEVELOPMENT_PLAN.md § "Phase 2" + Appendix C (the Export-usage gate) — note the gate is fully enforced in the docs/release phase; on today's stub it must pass trivially.
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/scripts/audit-library-exports.mjs — copy-and-adapt the `.d.ts` export parser (`parseExports`), the word-boundary corpus search (`isUsed`), the `.audit-ignore.json` reader (`loadIgnore`), and the grouped missing-symbol report. Retarget DIST to `apps/web/node_modules/@bymax-one/rust-auth/dist` and the corpus to `apps/web` only.

TASK
Finalize `scripts/audit-library-exports.mjs` to enforce that every export of the four npm subpaths is referenced in `apps/web`, honoring `.audit-ignore.json`. Add a self-check that the parser extracts a known export and flags a fake one. Keep it report-mode-passing on the current stub; strict CI enforcement flips on in the docs/release phase.

DELIVERABLES
1. `scripts/audit-library-exports.mjs` (ESM, Node 24):
   - `@fileoverview` + `@layer tooling` header (timeless — no roadmap references).
   - Constants: `DIST = apps/web/node_modules/@bymax-one/rust-auth/dist`; `CORPUS_DIR = apps/web`; `IGNORE_FILE = .audit-ignore.json`; `SKIP_DIRS = { node_modules, .next, dist, coverage, .turbo, out, build }`.
   - `parseExports(dts)` — named `export const|let|var|function|class|interface|enum|type|namespace Foo`, `export { Foo, type Bar, Baz as Qux }` (alias wins), `export type { … }`; skip `… from '<pkg>'` re-exports.
   - `walkTs(dir)` (`.ts`/`.tsx`), `buildCorpus(files)` (sentinel-joined), `isUsed(corpus, symbol)` (`\bsymbol\b`).
   - `loadIgnore()` reads `.audit-ignore.json` (`{ "<subpath>.<symbol>": "reason" }`); missing file → `{}`.
   - Main: discover subpaths dynamically (each `dist/<name>/index.d.ts`), parse, search, group missing by subpath, print a copy-pasteable ignore block on failure, `process.exit(1)` if any non-ignored symbol is missing — but support a `--report` flag (default in this phase's CI) that prints the report and exits 0 so the stub is green; strict (exit 1) is the default for a developer run and the CI default once the console consumes the surface.
   - A self-check path (e.g. `--self-test`): assert `parseExports` finds `createAuthClient` in the real `/client` `index.d.ts` and that a fabricated `__definitely_not_exported__` is reported missing.
2. `.audit-ignore.json` — an empty object `{}` (no leaked internal symbol is known today; DO NOT add `extract_claims`/`verify_password` — they are absent from the `.d.ts`).
3. `package.json` (root) — `"scripts": { "audit:exports": "node scripts/audit-library-exports.mjs" }` if not already present.

Constraints:
- Parse the REAL built `.d.ts` — never hardcode a symbol list.
- Allow-list (`.audit-ignore.json`) is reserved for genuinely-internal leaked symbols WITH a written reason; never silence a demonstrable export.
- TypeScript-free script (plain `.mjs`); zero `any`; English-only TIMELESS comments — NO Phase/Task/roadmap references. No `.gitkeep`. `git switch -c` only.

Verification:
- `node scripts/audit-library-exports.mjs --self-test` — expected: prints that `createAuthClient` is found and the fake symbol is flagged; exit 0.
- `pnpm audit:exports -- --report` (or `node scripts/audit-library-exports.mjs --report`) — expected: lists the four subpaths and a parsed-export count per subpath; exit 0 on the current stub.
- `node -e "JSON.parse(require('fs').readFileSync('.audit-ignore.json','utf8'))"` — expected: parses (valid JSON, empty object).
- `grep -c 'extract_claims\|verify_password' .audit-ignore.json` — expected: `0`.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 4` and Last updated.
4. Update the P2 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 2.3 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `build(web): finalize npm export-usage audit` (no Co-Authored-By).
````

---

### Task 2.4 — `cargo public-api` audit

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: 2.1

#### Description

Author `scripts/audit-rust-public-api.sh` that runs `cargo public-api` over the three consumed crates, commits a reviewable snapshot per crate, and checks that every `pub` item is referenced in `apps/api` (allow-listing the four catalog-only error codes with a reason). This is the LAST task — it also runs the per-phase closeout.

#### Acceptance criteria

- [ ] `scripts/audit-rust-public-api.sh` runs `cargo public-api --manifest-path` for `bymax-auth-axum` (`--features full`), `bymax-auth-core` (`--features full`), and `bymax-auth-redis` (`--features mfa,oauth,platform`), writing `apps/api/public-api/<crate>.txt`.
- [ ] On re-run with a committed snapshot present, the script diffs and fails on undocumented drift; a `--bless` mode regenerates the snapshots.
- [ ] A reference check word-boundary-searches `apps/api` (`src` + `tests`) for each `pub` item and reads `apps/api/public-api/allow.json` (`"<item>": "reason"`); the four catalog-only codes — `TokenExpired`, `TokenRevoked`, `TokenMissing`, `PasswordResetTokenExpired` — are allow-listed with reasons.
- [ ] The reference check supports a `--report` mode (exit 0, used by this phase's CI) and a strict mode (exit 1) that the docs/release phase enables once `apps/api` demonstrates the full surface.
- [ ] A root `audit:public-api` script (or the `ci.yml` `export-usage-check` job) invokes it; `bash scripts/audit-rust-public-api.sh` passes trivially on the current stub.
- [ ] Per-phase closeout performed (see Completion Protocol): P2 flipped to ✅ / 4 of 4, Active phase advanced, Overall progress recomputed.

#### Files to create / modify

- `scripts/audit-rust-public-api.sh`
- `apps/api/public-api/bymax-auth-axum.txt`, `apps/api/public-api/bymax-auth-core.txt`, `apps/api/public-api/bymax-auth-redis.txt`
- `apps/api/public-api/allow.json`
- `package.json` (root — the `audit:public-api` script, if surfaced there)

#### Agent prompt

````
You are a senior Rust + build-integration engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 2 (Library Consumption & Export Audits) — Task 2.4 of 4 (LAST)

PRECONDITIONS
- Task 2.1 is done: `apps/api/Cargo.toml` declares the three `path` deps (`bymax-auth-axum`/`-core` with `features = ["full"]`, `bymax-auth-redis` with `features = ["mfa", "oauth", "platform"]`) and `cargo build --locked` links them.
- `cargo-public-api` builds rustdoc JSON and therefore needs a nightly rustdoc; the script must invoke it via `cargo public-api --rustup-toolchain nightly` (or document `rustup toolchain install nightly` as a one-time prerequisite). The pinned dev toolchain stays 1.96.0 stable.
- The consumed crates live at `../../../rust-auth/crates/bymax-auth-{axum,core,redis}` relative to `apps/api/`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "6. Feature Coverage Matrix" — the Coverage rule for the Rust surface (run `cargo public-api` over the consumed crates; every `pub` item referenced in `apps/api` or allow-listed with a reason); the note that the three internal-only sentinels collapse to `TokenInvalid` on the wire and `PasswordResetTokenExpired` is by-design unreachable.
- docs/DEVELOPMENT_PLAN.md § "Phase 2" + Appendix B + Appendix C (the Public-API gate; full enforcement lands in the docs/release phase; trivially green on the stub today).
- ../../../rust-auth/crates/bymax-auth-core/src/error.rs — confirm `AuthErrorCode` has the four catalog-only variants `TokenExpired`/`TokenRevoked`/`TokenMissing` (`is_internal_only`) and `PasswordResetTokenExpired` (by-design unreachable) that the allow-list documents.

TASK
Author `scripts/audit-rust-public-api.sh`: snapshot the `pub` surface of the three consumed crates into committed text files and check every `pub` item is referenced in `apps/api`, allow-listing only the four catalog-only error codes. Keep it green on the current stub via a report mode; strict enforcement flips on in the docs/release phase. Then run the per-phase closeout.

DELIVERABLES
1. `scripts/audit-rust-public-api.sh` (executable, `set -euo pipefail`):
   ```bash
   #!/usr/bin/env bash
   # Snapshot the pub surface of the three consumed bymax-auth crates and verify
   # every pub item is exercised in apps/api (or allow-listed with a reason).
   set -euo pipefail

   HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
   CRATES_DIR="${HERE}/../rust-auth/crates"
   OUT_DIR="${HERE}/apps/api/public-api"
   mkdir -p "${OUT_DIR}"

   # crate-name : feature-set passed to cargo public-api
   snapshot() {
     local crate="$1" features="$2"
     echo "==> cargo public-api ${crate} (${features})"
     cargo public-api --rustup-toolchain nightly \
       --manifest-path "${CRATES_DIR}/${crate}/Cargo.toml" \
       --features "${features}" > "${OUT_DIR}/${crate}.txt.new"
     if [[ "${1:-}" != "--bless" && -f "${OUT_DIR}/${crate}.txt" ]]; then
       diff -u "${OUT_DIR}/${crate}.txt" "${OUT_DIR}/${crate}.txt.new" || {
         echo "error: ${crate} public-api drift — review and re-run with --bless" >&2; exit 1; }
     fi
     mv "${OUT_DIR}/${crate}.txt.new" "${OUT_DIR}/${crate}.txt"
   }

   snapshot bymax-auth-axum  "full"
   snapshot bymax-auth-core  "full"
   snapshot bymax-auth-redis "mfa,oauth,platform"

   # Reference check: every `pub fn/struct/enum/...` short name must appear in
   # apps/api/{src,tests} or be allow-listed in apps/api/public-api/allow.json.
   # `--report` (CI today) prints findings and exits 0; strict exits 1.
   node "${HERE}/scripts/check-public-api-usage.mjs" "$@"
   ```
2. `scripts/check-public-api-usage.mjs` — parses the three `*.txt` snapshots for `pub` item short names, word-boundary-searches `apps/api/src` + `apps/api/tests`, reads `apps/api/public-api/allow.json`, reports unreferenced non-allow-listed items; `--report` exits 0, strict exits 1.
3. `apps/api/public-api/bymax-auth-{axum,core,redis}.txt` — the committed snapshots produced by `--bless`.
4. `apps/api/public-api/allow.json`:
   ```json
   {
     "TokenExpired": "internal-only sentinel; collapses to TokenInvalid via AuthErrorCode::to_wire — never on the wire",
     "TokenRevoked": "internal-only sentinel; collapses to TokenInvalid via AuthErrorCode::to_wire — never on the wire",
     "TokenMissing": "internal-only sentinel; collapses to TokenInvalid via AuthErrorCode::to_wire — never on the wire",
     "PasswordResetTokenExpired": "by-design unreachable: reset uses Redis GETDEL, so expired is indistinguishable from missing — kept for catalog completeness"
   }
   ```
5. `package.json` (root) — `"audit:public-api": "bash scripts/audit-rust-public-api.sh"` if surfaced as a script.

Constraints:
- Allow-list exactly the four catalog-only codes WITH reasons; never allow-list a demonstrable `pub` item to silence the audit.
- Snapshots are committed text artifacts; a diff is a deliberate, reviewed change.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed file (including the snapshots' surrounding files and allow.json reasons — describe the symbol, never a roadmap stage). No `.gitkeep`. `git switch -c` only.

Verification:
- `bash scripts/audit-rust-public-api.sh --bless` — expected: writes `apps/api/public-api/bymax-auth-{axum,core,redis}.txt` (non-empty `pub`-item listings).
- `bash scripts/audit-rust-public-api.sh` — expected: re-run shows no snapshot drift; the reference check passes (report mode) on the stub.
- `node -e "JSON.parse(require('fs').readFileSync('apps/api/public-api/allow.json','utf8'))"` — expected: parses; exactly four keys.
- `grep -riE "phase [0-9]|task [0-9]" scripts/audit-rust-public-api.sh scripts/check-public-api-usage.mjs apps/api/public-api/` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 4` and Last updated.
4. Update the P2 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 2.4 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `build(api): cargo public-api snapshot + usage audit` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol: confirm all four tasks are ✅ and the DoD is met with CI green on the merged PR; in docs/DEVELOPMENT_PLAN.md set the P2 Status to ✅, Progress 4 / 4, Last updated, advance the Active phase to P3, and recompute Overall progress; set this file's header Status to ✅; commit `docs(plan): P2 complete`. If any DoD bullet is unmet, use 🟡 Partial instead of ✅.)
````

---

## Phase Completion Protocol

Run this closeout when the LAST task (2.4) is ✅:

1. Confirm every task (2.1–2.4) is ✅ and each Phase-2 Definition-of-Done bullet in [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P2 is observably met: `cargo public-api` snapshots captured + Rust audit green; `pnpm audit:exports` green; the npm `build:wasm` + `build` run and the `file:` link resolves; the build-first ordering is wired into the `build-library` CI job.
2. Confirm the PR is merged to `main` and CI is fully green (no skipped required check).
3. In `docs/DEVELOPMENT_PLAN.md`: set the P2 **Status** to ✅, **Progress** to `4 / 4`, refresh **Last updated**, advance the **Active phase** to P3, and recompute **Overall progress** (phases and tasks).
4. In this file's header, set **Status** to ✅ and refresh **Last updated**.
5. Commit `docs(plan): P2 complete` (no `Co-Authored-By`).
6. If any DoD bullet is unmet or a required check is red, mark P2 **🟡 Partial** (never ✅) and record the gap.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

_(empty — no tasks completed yet)_

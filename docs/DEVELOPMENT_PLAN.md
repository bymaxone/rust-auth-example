# rust-auth-example — Development Plan

> **Scope:** the phased build plan for `rust-auth-example`, the public reference application for `bymax-auth` /
> `@bymax-one/rust-auth`.
> **Source spec:** [`docs/OVERVIEW.md`](./OVERVIEW.md) (the master blueprint — 21 sections, 35-row Feature Coverage Matrix).
> **Targeted library version:** `bymax-auth-*` `0.0.0` (pre-publish, consumed via `path`) + `@bymax-one/rust-auth`
> `0.0.0` (pre-publish, consumed via `file:`).
> **Document version:** `1.0 — authored before implementation`.
> **Status:** specification only — no `apps/` code yet.

This is **Layer 2** of the `spec → roadmap → phase-tasks` workflow. It does not restate the specification; it
**sequences the work** into independently shippable phases, each with an observable Definition of Done, and defines the
**autonomous execution model** by which AI agents build the repo end-to-end (one phase = one PR = one review cycle).
Layer 3 (`docs/tasks/phase-NN-*.md`) carries the per-task agent execution prompts and is scaffolded one phase at a time
from this plan. Format and conventions follow the `rust-auth` gold reference and the `@bymax-one/nest-auth` structural
template, reconciled with the current vault standard and adapted to the Rust/axum + Next.js stack.

---

## Table of Contents

- [Status legend](#status-legend)
- [Progress](#progress)
- [Phase dashboard](#phase-dashboard)
- [0. Guiding Principles](#0-guiding-principles)
- [1. Phase Map & Dependencies](#1-phase-map--dependencies)
- [2. Global Conventions](#2-global-conventions)
- [3. Autonomous Execution Model](#3-autonomous-execution-model)
- [Phases 0–14](#phase-0--foundation-tooling--ci-skeleton)
- [Appendix A — Environment Variable Registry](#appendix-a--environment-variable-registry)
- [Appendix B — Library Export → Phase Coverage Map](#appendix-b--library-export--phase-coverage-map)
- [Appendix C — Quality Gates](#appendix-c--quality-gates)
- [Appendix D — CI/CD Workflow Matrix](#appendix-d--cicd-workflow-matrix)
- [Appendix E — Go-Public Readiness Checklist](#appendix-e--go-public-readiness-checklist)
- [Update Protocol](#update-protocol)

---

## Status legend

| Symbol | Meaning |
| --- | --- |
| 📋 | ToDo — not started |
| 🔄 | In Progress — exactly one phase at a time |
| 👀 | Review — code complete, in PR / Copilot review |
| ✅ | Done — every DoD bullet met and CI green on the merged PR |
| ⛔ | Blocked — a dependency or external blocker is open |
| 🟡 | Partial — some tasks done but the phase DoD is not fully met (never use ✅ here) |

---

## Progress

- **Overall progress:** 1 / 15 phases · 12 / 86 tasks done (14%)
- **Active phase:** P1 (Local Stack & Environment)
- **Blocked:** none

> All 15 Layer-3 task files are scaffolded under [`docs/tasks/`](./tasks/) (86 tasks total). Execute one phase at a time
> per the [Autonomous Execution Model](#3-autonomous-execution-model); update this dashboard as tasks/phases close.

---

## Phase dashboard

| ID | Phase | Tasks file | Status | Progress | Size | Last updated |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Foundation, Tooling & CI Skeleton | `phase-00-foundation-ci.md` | ✅ | 7 / 7 | L | 2026-07-01 |
| P1 | Local Stack & Environment | `phase-01-local-stack.md` | 🔄 | 5 / 5 | M | 2026-07-02 |
| P2 | Library Consumption & Export Audits | `phase-02-library-consumption.md` | 📋 | 0 / 4 | M | — |
| P3 | API Skeleton | `phase-03-api-skeleton.md` | 📋 | 0 / 6 | M | — |
| P4 | Schema & Repositories | `phase-04-schema-repositories.md` | 📋 | 0 / 6 | L | — |
| P5 | Engine Wiring, Email & Audit | `phase-05-engine-wiring.md` | 📋 | 0 / 7 | L | — |
| P6 | OAuth & Invitations | `phase-06-oauth-invitations.md` | 📋 | 0 / 5 | M | — |
| P7 | Platform Domain & WebSocket | `phase-07-platform-websocket.md` | 📋 | 0 / 5 | M | — |
| P8 | Web Skeleton & Design System | `phase-08-web-skeleton.md` | 📋 | 0 / 6 | M | — |
| P9 | Public Auth Pages | `phase-09-public-auth-pages.md` | 📋 | 0 / 6 | M | — |
| P10 | Dashboard Console | `phase-10-dashboard-console.md` | 📋 | 0 / 7 | L | — |
| P11 | Platform Console | `phase-11-platform-console.md` | 📋 | 0 / 4 | M | — |
| P12 | Testing & 100% Coverage | `phase-12-testing.md` | 📋 | 0 / 6 | L | — |
| P13 | Mutation Hardening | `phase-13-mutation.md` | 📋 | 0 / 5 | L | — |
| P14 | Docs, Public-Readiness & Release | `phase-14-docs-release.md` | 📋 | 0 / 7 | L | — |

---

## 0. Guiding Principles

1. **Library-faithful.** Every public export of the consumed surface — the Rust `pub` API of `bymax-auth-axum` /
   `bymax-auth-core` / `bymax-auth-redis` (+ transitive `-types`/`-crypto`/`-jwt`) and the `@bymax-one/rust-auth` npm
   package's four subpaths — is exercised, reconciled against the shipped surface, never the README. The contract is the
   [Feature Coverage Matrix](./OVERVIEW.md#6-feature-coverage-matrix).
2. **Browser-exercisable, not probe-only.** Every feature must be reachable from the UI (the console / Trigger Center /
   panels); a wiring/probe reference is the floor for type-only or server-only exports, never a substitute for a real
   journey (server-only primitives surface via observable effects — Diagnostics, Mailpit, the Audit stream).
3. **Production-shaped.** `AuthEngine::builder()` wiring real sqlx repositories, `Arc<RedisStores>`, a real
   `EmailProvider`, a concrete `AuthHooks`, and `GoogleOAuthProvider` with an injected TLS `HttpClient` — wired the way
   a real app would, no shortcuts or stubs in the happy path.
4. **Same quality bar as the library.** **100% coverage on all metrics** in both workspaces (`cargo-llvm-cov` for the
   API, Vitest for the web), and **mutation ≥ 95 (mandatory floor), driven as close to 100% as achievable**
   (`cargo-mutants` for the API, Stryker for the web) — per the explicit project mandate.
5. **CI from Phase 0.** The full, strong pipeline (static gates + 100%-coverage + audits + security scanning + mutation
   + release) exists before any feature code, so every later phase merges green. The repo is **private now, public
   later** — go-public hardening is built in from the start, not retrofitted.
6. **Design parity.** The shared design system (`docs/design_system.html` + the copied `globals.css` /
   `tailwind.config.ts` / `components.json` / `postcss.config.mjs` + `components/ui/*`) is reused **verbatim** — forced
   dark, orange `#ff6224` glass, Geist + mono. Never re-derived, never overridden by an opinionated design skill.
7. **Honest scope.** Unimplemented surfaces are shown truthfully — account-unlink / email-change / account-deletion /
   non-Google OAuth / SMS-push MFA are documented as host-app responsibilities in a Roadmap panel, not faked. OAuth's
   secure-DENY default is made explicit, not hidden.
8. **One phase in progress at a time.** No phase starts until every dependency is ✅. No phase is marked ✅ while a DoD
   bullet is unmet or CI is red — use 🟡 Partial.
9. **Rust + TS rigor, English-only & Conventional Commits.** Rust edition 2024, `#![forbid(unsafe_code)]`,
   `#![deny(missing_docs)]`, no `unwrap`/`expect`/`panic!` in non-test code, typed `thiserror` errors; TypeScript strict
   (no `any`). All code, comments, rustdoc/JSDoc, identifiers, and commit messages are English. Commits follow
   Conventional Commits with **no `Co-Authored-By` trailer**. Comments are timeless — **no `Phase N` / task references in
   committed source or docs-as-config** (`.github/**`). Doc-section refs are allowed.

---

## 1. Phase Map & Dependencies

```text
  FOUNDATION                BACKEND TRACK                          FRONTEND TRACK              QUALITY & RELEASE
  ──────────                ─────────────                          ──────────────              ─────────────────
  P0 ─ P1 ─ P2 ─ P3 ─ P4 ─ P5 ──┬── P6 ──┐
                                 │        │
                                 └── P7 ──┤
                                          ├── P8 ── P9 ──┬── P10 ──┐
                                          │              └── P11 ──┤
                                          │                        │
                                          └────────────────────────┴── P12 ── P13 ── P14
```

**Edge list (canonical):**
`P0→P1`, `P1→P2`, `P2→P3`, `P3→P4`, `P4→P5`, `P5→P6`, `P5→P7`, `{P6,P7}→P8`, `P8→P9`, `P9→P10`, `P9→P11`,
`{P10,P11}→P12`, `P12→P13`, `P13→P14`.

**Critical path:** `P0 → P1 → P2 → P3 → P4 → P5 → P6 → P8 → P9 → P10 → P12 → P13 → P14` (13 phases — P8 needs both P6
and P7, with P7 running parallel to P6).

**Parallelization notes.** The backend track (P3–P7) is mostly linear because each layer consumes the previous one's
wiring; **P7 (platform + WebSocket) can run in parallel with P6 (OAuth + invitations)** once the engine (P5) lands. The
frontend track (P8–P11) opens once the backend surface (P6 + P7) exists; **P10 (dashboard console) and P11 (platform
console) are independent** and parallelizable after P9 (the public auth pages, which both consoles' login flows depend
on). The quality track (P12–P14) consolidates: testing and mutation are **dedicated phases** (not folded into feature
phases), and feature phases still ship their own tests at 100% as they land — P12/P13 are the hardening/gate-closing
consolidation.

---

## 2. Global Conventions

Stated once here so per-phase DoDs do not restate them.

| Concern | Convention |
| --- | --- |
| Workspaces | A **cargo workspace** (`Cargo.toml: members = ['apps/api']`) for the Rust API + a **pnpm workspace** (`pnpm-workspace.yaml: packages: ['apps/web']`) for the Next.js console + tooling. Two workspaces, one repo. |
| Toolchains | **Rust `1.96.0`** (`rust-toolchain.toml`, MSRV floor `1.90` proven by a dedicated CI job) + **Node 24 (Active LTS)** (`.nvmrc=24`) + **pnpm 10.8.x** (`packageManager`). |
| Install | `cargo build --locked` (committed `Cargo.lock`) + `pnpm install --frozen-lockfile` (`.npmrc: frozen-lockfile=true`). |
| Rust language | Edition 2024; `#![forbid(unsafe_code)]` + `#![deny(missing_docs)]` per crate; **no `unwrap`/`expect`/`panic!`/`todo!`/`unreachable!`** in non-test code; typed `thiserror` errors (no `anyhow` in lib-shaped code); explicit DI via constructors into `AppState`. |
| TS language | TypeScript 5.x **strict** + `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`. **Zero `any`, zero suppression comments** (`@ts-ignore`, `eslint-disable`, Rust `#[allow]` without a written justification). |
| Lint / format | Rust: `cargo fmt --all --check` + `cargo clippy --workspace --all-targets -- -D warnings`. Web: ESLint flat (`--max-warnings 0`) + Prettier. |
| Pre-commit | husky `pre-commit` → `lint-staged` (`cargo fmt` + `cargo clippy` on staged Rust; `prettier --write` + `eslint --fix` on staged TS); `commit-msg` → `commitlint`. |
| Commits | Conventional Commits (`<type>(scope): <subject>`); **no `Co-Authored-By` trailer**; signed where possible. |
| Boolean naming | `is` / `has` / `should` / `can` prefixes (both stacks). |
| Test coverage | **100%** on all metrics, both workspaces (`cargo-llvm-cov nextest` API, Vitest web). Non-executable glue excluded from scope (`main.rs`, generated sqlx, `*.d.ts`, pure type modules). |
| Mutation score | **`cargo-mutants` caught ≥ 95% (mandatory, API)** + **Stryker break ≥ 95 (web, `lib/**` 100)**, both driven toward 100%; survivors documented as provable equivalents in `docs/mutation/`. |
| Audits | `audit:exports` (every npm export referenced in `apps/web`) + `audit:public-api` (`cargo public-api` — every consumed-crate `pub` item referenced in `apps/api`); both CI-gating. |
| Memory-safe tests | `cargo nextest` with bounded `--test-threads`; Vitest `maxWorkers: '50%'` baked into the config; `NODE_OPTIONS=--max-old-space-size`; `cargo-mutants --jobs` capped; sequential suites; **never fan out parallel test agents**. |
| Design system | Copied **verbatim** from a sibling example (`docs/design_system.html` + the 4 web config files + `components/ui/*`). Never re-styled. |
| Library dependency | `bymax-auth-*` via `path` to `../../../rust-auth/crates/*` + `@bymax-one/rust-auth` via `file:` to the built `packages/rust-auth`, pre-publish; pinned versions after publish (`RELEASES.md`). |
| Security defaults | tower-http security headers, CORS allow-list, `Retry-After` exposed, secrets only via env, no PII/tokens/codes in logs, redacting `Debug` honoured. |
| Supply chain | `cargo deny check` + `cargo audit` + `cargo vet` (Rust) + dependency-review + secret-scan (both). |
| Clean Code sizing | Functions ≤ 50 lines; files ≤ 800 (200–400 typical); SRP/SOLID; explicit DI. |

---

## 3. Autonomous Execution Model

This repo is built **end-to-end by autonomous agents in a Claude Code loop**. Each phase is executed, reviewed,
committed, and merged as a single unit before the next begins. The loop per phase:

1. **Scaffold the phase tasks** — `/bymax-workflow:phase-tasks <P>` generates `docs/tasks/phase-NN-*.md` with one
   self-contained agent execution prompt per task (Role · PROJECT · CURRENT PHASE · PRECONDITIONS · REQUIRED READING
   (bounded) · TASK · DELIVERABLES · Constraints · Verification (exact commands + expected output) · Completion Protocol).
2. **Branch** — `git switch -c feat/pNN-<slug>` off `main` (never commit on `main`; never `git checkout -b`).
3. **Implement task-by-task (TDD)** — `/bymax-quality:tdd` for new code (tests first, 100% as written) or the `tester`
   skill for adding tests. One task `🔄` at a time; never start a task until its `Depends on` are `✅`.
4. **Local gate (must all pass before review):** Rust — `cargo fmt --check && cargo clippy --all-targets -- -D warnings
   && cargo llvm-cov nextest && cargo deny check && cargo public-api`; Web — `pnpm -C apps/web typecheck && lint &&
   test:cov && build`; plus `pnpm audit:exports`.
5. **Self-review (apply all findings):** `/bymax-quality:code-review` (Rust track → `bymax-quality:rust-reviewer`;
   Web track → `bymax-quality:typescript-reviewer`) → `/security-review` → re-run the local gate after fixes.
6. **Verify behavior:** `/bymax-workflow:verify` (run the app / the new surface; confirm the DoD observably).
7. **Commit** — Conventional Commits, scoped to the phase; no `Co-Authored-By`.
8. **Push & open a PR** to `main`. **CI must go fully green** (Appendix D) — no merge on a red or skipped required check.
9. **Copilot / agent review** — the GitHub Copilot code-review (`.github/copilot-instructions.md` +
   `agents/agent-code-reviewer.agent.md`) reviews the PR; the agent addresses every 🔴 Blocker and re-pushes until green.
10. **Merge** (squash) after green CI + resolved review. Then **update the dashboard** (this file + the phase file) per
    the [Update Protocol](#update-protocol), and proceed to the next phase.

**The three invariants** (enforced by the dashboard + each task's `Depends on` + `Verification`):
- **One-in-progress-at-a-time** — exactly one phase `🔄` and one task `🔄` within it.
- **Never-start-until-deps-green** — a phase/task begins only when every dependency is `✅`.
- **Never-mark-done-with-failing-verification** — `✅` requires every DoD/acceptance bullet met **and** CI green on the
  merged PR; otherwise `🟡 Partial`.

> **Branch protection (configured in the GitHub UI before going public):** `main` is PR-only (no direct push); required
> checks = every `ci.yml` job + `codeql` + `scorecard` (informational) + `mutation` (PR-changed workspaces); linear
> history; signed commits. Job names are **contractual** — branch protection references them by name.

---

## Phase 0 — Foundation, Tooling & CI Skeleton

**Goal:** stand up the dual (cargo + pnpm) monorepo, the full toolchain, the shared design-system files, and the
**complete CI/CD + go-public scaffolding** so every subsequent phase merges through a strong, agent-gating pipeline.

**Scope — In:** root `Cargo.toml` (`[workspace] members = ['apps/api']`) + `rust-toolchain.toml` (channel `1.96.0`,
`+wasm32`, rustfmt/clippy/llvm-tools) + `rustfmt.toml` + `clippy.toml` + `deny.toml`; `pnpm-workspace.yaml` + root
`package.json` (scripts) + `tsconfig.base.json` + `eslint.config.mjs` + `.prettierrc.mjs`/`.prettierignore`;
`commitlint.config.mjs`, `.husky/`, `lint-staged.config.mjs`, `.nvmrc`, `.npmrc`, `.editorconfig`, `.gitignore`,
`.gitattributes`, `.gitmessage`, `.markdown-link-check.json`; the shared design-system file (`docs/design_system.html`
is already present); **all `.github/workflows/`** (`ci.yml`, `codeql.yml`, `scorecard.yml`, `mutation.yml`,
`mutation-nightly.yml`, `release.yml`) as runnable skeletons; `dependabot.yml` and/or `renovate.json`; the **4 Copilot
review files**; `.github/ISSUE_TEMPLATE/` + `PULL_REQUEST_TEMPLATE.md` + `CODEOWNERS`; mandatory repo files (`LICENSE`,
`SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`);
`apps/{api,web}/Dockerfile` skeletons; the `scripts/audit-library-exports.mjs` + `scripts/audit-rust-public-api.sh` stubs.

**Scope — Out:** any application logic (P3+); real audit results (the scripts run but pass trivially on the empty `apps/`).

**Definition of Done:**
- `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo build --locked` pass on an empty `apps/api` stub (a
  `main.rs` that compiles); `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check` pass.
- `ci.yml` runs green on a PR; `codeql.yml` + `scorecard.yml` run (informational); `release.yml` validates without
  publishing; least-privilege `permissions`, `concurrency`, pinned actions, and `timeout-minutes` set on every job.
- All go-public files (Appendix E) present; the 4 Copilot files customized for this stack (< 4000 chars each, no
  phase/task references); `deny.toml` mirrors the library's `ring`/`openssl` ban.
- The design-system files are byte-identical to the sibling's; no `.gitkeep`/empty-dir scaffolding.

**Context / preconditions:** none (first phase).
**Rules-of-phase:** no `.gitkeep`/empty-dir scaffolding; CI job names are contractual; copilot/docs-as-config carry no
phase/task references; `git switch -c` only.
**References:** OVERVIEW §4, §5, §7, §8; Appendix C, D, E.
**Size:** L. **CI introduced:** the entire pipeline (skeletons).

---

## Phase 1 — Local Stack & Environment

**Goal:** a one-command, zero-credential local stack and a fail-fast environment contract.

**Scope — In:** `docker-compose.yml` (postgres:18 + redis:7 + mailpit, each healthchecked), `docker-compose.test.yml`
(high ports — Postgres `55432`, Redis `56379`, Mailpit `51025`/`58025`, `tmpfs`), `docker-compose.override.yml`,
`docker/postgres/init.sql` + `docker/redis/redis.conf`, `.env.example` + `.env.prod.example`, the `figment`-based
config loader + validated `Settings` struct (`apps/api/src/config/`), the `infra:up`/`infra:down` scripts.

**Scope — Out:** any axum bootstrap (P3).

**Definition of Done:**
- `pnpm infra:up` (or `docker compose up --wait`) returns only when all three containers are healthy; Mailpit UI
  reachable at `:8025`.
- A missing/invalid env var aborts startup with a precise message (the `Settings` loader is unit-tested for the failure
  path, including the `JWT_SECRET` ≥ 64 and `MFA_ENCRYPTION_KEY` base64-32 checks).
- `.env.example` documents every variable; ports match OVERVIEW §8/§9.

**Context / preconditions:** P0.
**Rules-of-phase:** all services bind `127.0.0.1`; the test stack uses the high ports to never contend with dev;
secrets only via env.
**References:** OVERVIEW §8, §9; Appendix A.
**Size:** M.

---

## Phase 2 — Library Consumption & Export Audits

**Goal:** consume both sibling surfaces pre-publish and wire the export audits that make the coverage promise real.

**Scope — In:** the `path` deps on `../../../rust-auth/crates/{bymax-auth-axum,bymax-auth-core,bymax-auth-redis}`
(features `full`) in `apps/api/Cargo.toml`; the `scripts/link-library.sh`/`unlink-library.sh` that build the npm package
(`pnpm build:wasm && pnpm build`) and `file:`-link it into `apps/web`; `apps/web/next.config.mjs`
(`serverExternalPackages` + `outputFileTracingRoot`); finalize `scripts/audit-library-exports.mjs` (against the built
`@bymax-one/rust-auth` `dist/**/*.d.ts` for the 4 subpaths) + `scripts/audit-rust-public-api.sh` (`cargo public-api` over
the 3 consumed crates) + the `.audit-ignore` allow-list.

**Scope — Out:** any engine wiring (P5); UI consumption (P8+).

**Definition of Done:**
- `cargo public-api -p bymax-auth-core` (and the other two) runs and the snapshot is captured; the Rust audit passes
  (every consumed `pub` item referenced in `apps/api` or allow-listed with a reason — trivially on the stub today).
- `pnpm audit:exports` passes (every npm export referenced or allow-listed with a reason).
- The npm package's `build:wasm` + `build` run and the `file:` link resolves; the build-first ordering is documented
  and wired into a `build-library` CI job.

**Context / preconditions:** P1 (workspace + the `apps/api` config stub).
**Rules-of-phase:** prefer `path`/`file:` over symlinks; allow-list only genuinely-internal leaked symbols, never
demonstrable exports; the WASM `extract_claims`/`verify_password` are out-of-surface (not allow-listed — simply not in
the npm `.d.ts`).
**References:** OVERVIEW §6 (Coverage rule), §7; Appendix B.
**Size:** M.

---

## Phase 3 — API Skeleton

**Goal:** a bootable axum service with the cross-cutting plumbing the engine needs.

**Scope — In:** `apps/api/src/main.rs` (`#[tokio::main]`, `axum::serve(API_PORT)`, graceful shutdown), `app.rs`
(compose the `Router` + `AppState`, CORS allowing `x-tenant-id`/exposing `Retry-After`, the tower-http trace/security
layers), `GET /health`, a typed `AppError` enum (`thiserror` + `IntoResponse`) that wraps the library's `AuthRejection`,
the sqlx `PgPool` provider, the `RedisStores::connect(...)` → `Arc<RedisStores>` handle, the `tracing-subscriber` (JSON)
init.

**Scope — Out:** the engine wiring (P5); any auth routes (the library mounts them in P5).

**Definition of Done:**
- `GET /health` → 200; the app boots against the local stack and exits with a precise error when Postgres/Redis are down.
- `AppError` serializes to the library's `{ error: { code, message, details } }` envelope with the right HTTP status
  (unit-tested), delegating to `AuthError::to_envelope`/`error_response` for library errors.
- The `PgPool` + `Arc<RedisStores>` resolve and are reachable from `AppState`; a connect-failure path is covered.

**Context / preconditions:** P2.
**Rules-of-phase:** the adapter installs the tracing subscriber here (the library installs none); `AppError` never
leaks an internal error string to the client (`Internal` → opaque 500); no `unwrap`/`expect` on the connect path.
**References:** OVERVIEW §9, §11, §13.
**Size:** M. **Matrix rows:** 30 (error model, partial), 22 (guards available).

---

## Phase 4 — Schema & Repositories

**Goal:** the Postgres schema and the two repository implementations — the library's persistence boundary.

**Scope — In:** the `migrations/*.sql` (`users`, `platform_users`, `tenants`, `invitations`, `audit_log` — backing
`AuthUser`/`AuthPlatformUser` exactly, including `mfa_recovery_codes`, `oauth_provider`/`oauth_provider_id`, platform
`updated_at`/`platform_id`); the offline `.sqlx/` query cache; `SqlxUserRepository` (all 11 `UserRepository` methods) +
`SqlxPlatformUserRepository` (all 6 `PlatformUserRepository` methods); the `RepositoryError` mapping
(`Conflict → auth.email_already_exists`, missing row → `Ok(None)`); a `seed` for demo tenants (`acme`/`globex`) + a
demo platform admin.

**Scope — Out:** the engine (P5); the HTTP surface (P5).

**Definition of Done:**
- `sqlx migrate run` applies cleanly; `cargo sqlx prepare --check` passes (the offline cache is current).
- `SqlxUserRepository` implements all 11 methods and `SqlxPlatformUserRepository` all 6, each with `query_as!`-typed SQL;
  the `Conflict`/`Ok(None)` semantics are unit-proven against a real Postgres (test stack).
- The schema round-trips every `AuthUser`/`AuthPlatformUser` field (incl. the `Vec<String>` recovery codes); 100% covered.

**Context / preconditions:** P3.
**Rules-of-phase:** repositories return `Ok(None)` for a missing/cross-tenant row (never an error); use `query_as!`
(compile-checked) over runtime queries; no business logic in the repository (it is pure persistence).
**References:** OVERVIEW §12 (the boundary), §13; DATABASE.md (authored P14).
**Size:** L. **Matrix rows:** 33 (repository contracts), 18 (password-hash persistence path).

---

## Phase 5 — Engine Wiring, Email & Audit

**Goal:** wire `AuthEngine::builder()` with real seams and mount the library router — the core auth surface goes live.

**Scope — In:** `apps/api/src/engine/` (the `AuthConfig` profile + `validate` + the full builder wiring); the lettre
`EmailProvider` (→ Mailpit) + the Resend provider (opt-in) + the 7 transactional templates; the `AuditAuthHooks` impl
(writing the `audit_log`) + the example-owned `GET /audit/{logs,stream}` read-API (keyset + SSE); the
`bymax_auth_axum::auth_router(engine, AxumAuthConfig)` mount merged onto the example's `Router`; the
example-owned `diagnostics` endpoints (`hash-strength`, `force-lockout`, `hooks` log).

**Scope — Out:** OAuth + invitations (P6); the platform domain + WebSocket (P7); any UI (P8+).

**Definition of Done:**
- The engine builds via `AuthEngine::builder()`; the mounted `/auth/*` surface answers register/login/logout/refresh/me
  + email-verification + password-reset over HTTP with correct status codes and `Retry-After` on 429.
- A programmatic register → verify → login renders + delivers the verification email to Mailpit and writes masked audit
  rows (no token/code) to Postgres; brute-force lockout + rate limits are exercised.
- The HS256 access token verifies and the opaque refresh token rotates with grace; every endpoint is covered at 100%.

**Context / preconditions:** P4.
**Rules-of-phase:** wire stores via the one `Arc<RedisStores>` handle; pass DI-dependent seams as `Arc`-instances; the
audit never persists a token/code/secret (regression-tested); never log secrets; the resend/forgot paths are
anti-enumeration (always success).
**References:** OVERVIEW §9, §11, §12, §13, §15.
**Size:** L. **Matrix rows:** 1–7, 16, 19, 20, 21, 23, 24, 25, 30, 31, 32.

---

## Phase 6 — OAuth & Invitations

**Goal:** the Google OAuth flow (with the example's TLS transport + a concrete `on_oauth_login` policy) and team invitations.

**Scope — In:** `apps/api/src/oauth/` — a TLS `HttpClient` impl (`reqwest` + rustls/aws-lc-rs) injected into
`GoogleOAuthProvider`; the `on_oauth_login` Create/Link/Reject policy inside `AuditAuthHooks`; verifying the mounted
`/auth/oauth/{provider}` + `/callback` routes (PKCE + state); the invitation flow (`/auth/invitations` +
`/auth/invitations/accept`) with the `send_invitation` email.

**Scope — Out:** the OAuth/Invitations UI panels (P10); non-Google providers (roadmap).

**Definition of Done:**
- `oauth_initiate` returns a Google `authorize_url` (PKCE + state); `oauth_callback` (driven with a mocked Google via
  the injected `HttpClient`) exchanges the code, fetches the profile, and the `on_oauth_login` policy Creates an unseen
  verified email and Links a matching one — proven by e2e against `MockHttpClient`/`MockOAuthProvider`.
- The invitation create→email→accept chain issues a session; the audit records `after_invitation_accepted`.
- 100% covered; the TLS client reaches a real `https://` host in an opt-in integration test (skipped without creds).

**Context / preconditions:** P5. Parallel with P7.
**Rules-of-phase:** the built-in `ReqwestHttpClient` is plain-HTTP — the example MUST inject TLS; `on_oauth_login`
defaults to DENY, so the concrete policy is mandatory (OAuth is dead without it); `ring`/`openssl` stay banned.
**References:** OVERVIEW §11, §12, §16 (journey 8, 15); OAUTH_GOOGLE.md (authored P14).
**Size:** M. **Matrix rows:** 12, 13, 34.

---

## Phase 7 — Platform Domain & WebSocket

**Goal:** the tenant-less platform-admin domain, the WebSocket ticket surface, and the guard/diagnostics demo.

**Scope — In:** the platform wiring (`platform.enabled` + `SqlxPlatformUserRepository` + the platform MFA fail-closed
behavior); verifying the mounted `/auth/platform/*` + `/auth/platform/mfa/*` routes; the `POST /auth/ws-ticket` mint +
a tiny example WebSocket endpoint guarded by `WsAuthUser`/`WsAuthUserFromHeader`; the guard demo (the example's
`/audit`/`/diagnostics` routes gated by `AuthUser`/`RequireRole<R>`/`PlatformUser`).

**Scope — Out:** the platform UI (P11); the WebSocket browser client (P10).

**Definition of Done:**
- Platform login/me/refresh/logout + platform MFA work over HTTP; a dashboard token cannot satisfy a platform guard
  (and vice-versa); MFA-enabled admin login is refused when `mfa` is unconfigured (fail-closed) — all unit/e2e-proven.
- `ws-ticket` mints a ~30 s single-use ticket; a replay is rejected (`redeem_ws_ticket` once); the example WS endpoint
  authenticates via the ticket.
- The guard extractors gate the example routes (allowed vs 401/403 covered); 100% coverage.

**Context / preconditions:** P5. Parallel with P6.
**Rules-of-phase:** the two domains are isolated token families; platform MFA is fail-closed; the WS ticket carries the
auth (the JWT is never in the URL).
**References:** OVERVIEW §11, §12, §13, §16 (journey 12, 14).
**Size:** M. **Matrix rows:** 14, 15, 17, 22.

---

## Phase 8 — Web Skeleton & Design System

**Goal:** the Next.js console shell under the shared design system, consuming `@bymax-one/rust-auth`, ready for pages.

**Scope — In:** `apps/web` (Next 16 + React 19 + Tailwind 4), the **verbatim** design-system files, `app/layout.tsx` +
`providers.tsx` (Geist + forced dark + `AuthProvider` from `/react`), the app shell (64px topbar / 250px sidebar), the
global controls (tenant selector, delivery-mode indicator, the `useAuthStatus()` session badge) persisted via `nuqs`,
`proxy.ts` + the middleware **WASM edge verify** (`verifyJwtToken` from `/nextjs`) + the `api/auth/{client-refresh,
silent-refresh,logout}/route.ts` handlers, and the `lib/` client setup (`createAuthClient`/`createAuthFetch` + the
`./shared` error-code localization + severity).

**Scope — Out:** page bodies (P9+).
**UI base:** `docs/design_system.html`.

**Definition of Done:**
- `pnpm -C apps/web build` succeeds (resolving the `file:`-linked package, with `serverExternalPackages` set); the
  middleware edge-verifies a valid cookie and bounces an invalid one without a backend round-trip.
- A screenshot of the shell is indistinguishable from the sibling examples (design parity); the global controls drive
  URL state and the `AuthProvider` hydrates `useSession`.
- 100% coverage on the new `lib/`+`hooks/`.

**Context / preconditions:** P6 + P7 (the backend surface the console will call).
**Rules-of-phase:** keep `lib/` JSX-free; the `/nextjs` subpath is server/edge-only (never import it in a client
component); overlays above the topbar; the design system is never re-styled.
**References:** OVERVIEW §3, §7, §10; DASHBOARD.md.
**Size:** M. **Matrix rows:** 28 (client/hooks/proxy, partial), 29 (WASM edge), 30 (localization).

---

## Phase 9 — Public Auth Pages

**Goal:** the unauthenticated entry points — the full pre-login surface.

**Scope — In:** the `(public)/auth/*` pages — **login** (`useAuth().login`, branching to MFA), **register**
(`useAuth().register`), the **forgot/reset** 3-screen wizard (`forgotPassword`/`resetPassword` + the OTP `verify-otp`
→ `verifiedToken`), **verify-email**, **mfa-challenge** (the segmented 6-digit box + `mfaChallenge`), and
**accept-invitation** (name + password); each error localized from `./shared`.

**Scope — Out:** the authenticated dashboard (P10); the platform login (P11).

**Definition of Done:**
- A full register → verify-email → login (incl. the MFA branch) → land authenticated journey works against the live
  stack; the reset wizard returns a `verifiedToken` and completes; an invitation link accepts to a session.
- Every `auth.*` error a public page can surface is localized (no raw code shown); the OTP box honours
  `autocomplete="one-time-code"` + `inputmode="numeric"`.
- 100% web coverage on the new pages/components.

**Context / preconditions:** P8.
**Rules-of-phase:** the anti-enumeration paths show the same "check your inbox" regardless of account existence; the
MFA temp token is short-lived (the UI handles its expiry); never store a token in `localStorage` (cookies/in-memory only).
**References:** OVERVIEW §10, §11, §16 (journeys 1, 2, 7, 15).
**Size:** M. **Matrix rows:** 1, 2, 6, 7, 9, 13, 26.

---

## Phase 10 — Dashboard Console

**Goal:** the authenticated daily-driver surfaces — fire every feature and watch it land.

**Scope — In:** **Overview** (auth-health charts), **Trigger Center** (a card per feature: register, login, force MFA,
rotate token, hammer login → 429, force lockout, provoke each `auth.*` error — each auto-pivoting to the audit row),
**Security/MFA** (TOTP enroll with QR + recovery-code grid + disable/regen), **Sessions** (the device manager + live
new-session alerts + revoke + "log out everywhere else"), **OAuth** ("Continue with Google" + the Create/Link decision),
**Invitations** (invite + accept admin views), **Audit** (the hook-event stream + SSE live tail + the no-secrets proof),
**Account** (the `me` card + the Diagnostics panel surfacing hash-strength / lockout / hook log).

**Scope — Out:** the platform console (P11).

**Definition of Done:**
- Every backend feature is fireable from the Trigger Center and auto-pivots to its audit row; the Sessions manager
  lists/revokes against the live API; the MFA enroll→challenge round-trips; the OAuth panel shows the decision branch.
- The Audit Explorer searches/filters, tails live over SSE, and renders the never-contains-secrets proof; the
  Diagnostics panel exercises the server-only primitives.
- 100% web coverage on the new `lib/`+`components/`.

**Context / preconditions:** P9. Parallel with P11.
**Rules-of-phase:** charts use rate/percentile series (color + icon + label); skeletons not spinners; action-oriented
empty states; the WebSocket "Connect realtime" uses the `ws-ticket` (never a JWT in the URL).
**References:** OVERVIEW §10, §15, §16.
**Size:** L. **Matrix rows:** 4, 5, 8, 10, 11, 12, 17 (browser), 19, 20, 24, 25, 28.

---

## Phase 11 — Platform Console

**Goal:** the tenant-less admin console — the platform domain's daily-driver surfaces.

**Scope — In:** the `platform/*` tree — **platform login** (`PlatformAuthService` via the client), the protected admin
shell, **platform MFA** (the same enroll/challenge/disable journeys against `PlatformClaims`), **platform sessions**
(`revoke_all_platform_sessions`), and a read-only **platform users** view.

**Scope — Out:** the dashboard console (P10).

**Definition of Done:**
- Platform login → admin shell → platform MFA enroll/challenge works against the live platform API; a dashboard session
  cannot enter the platform console (and vice-versa); revoke-all-platform-sessions clears the admin's sessions.
- 100% web coverage.

**Context / preconditions:** P9. Parallel with P10.
**Rules-of-phase:** the platform domain is visually and structurally separate (no tenant selector — it is tenant-less);
the same design system; platform MFA fail-closed is surfaced honestly.
**References:** OVERVIEW §12, §16 (journey 14).
**Size:** M. **Matrix rows:** 14, 15.

---

## Phase 12 — Testing & 100% Coverage

**Goal:** close the coverage walls — 100% on all metrics in both workspaces.

**Scope — In:** consolidate `cargo nextest` unit + integration (API) and Vitest unit + Playwright e2e (web) to **100%**;
the `proptest`/RFC-KAT edges (TOTP drift, PHC round-trip, alg-pin rejection) exercised via the wiring; bake the
`--test-threads`/`maxWorkers: '50%'` caps into the configs; the coverage-scope exclusions; the `ci.yml`
`unit`/`e2e-api`/`e2e-web`/`coverage-report` jobs fully green; the live journeys under Playwright.

**Scope — Out:** mutation (P13).

**Definition of Done:**
- `cargo llvm-cov nextest` reports 100% on all metrics in `apps/api`; `pnpm -C apps/web test:cov` reports 100% in
  `apps/web`; the Playwright journeys pass against the live stack; CI `unit` + `e2e-api` + `e2e-web` + `coverage-report`
  green.
- Every test names its scenario and the rule it protects.

**Context / preconditions:** P10, P11.
**Rules-of-phase:** memory-safe execution (no parallel test agents; capped threads/workers); the API integration tests
run `sqlx migrate` against the test stack first.
**References:** OVERVIEW §17; Appendix C.
**Size:** L.

---

## Phase 13 — Mutation Hardening

**Goal:** mutation ≥ 95 (mandatory), driven toward 100, on both workspaces.

**Scope — In:** the `cargo-mutants` config + the gate script (`caught / (caught + missed) ≥ 0.95`) for `apps/api`; the
`apps/web/stryker.config.json` (web); drive both scores up; document surviving mutants as provable equivalents in
`docs/mutation/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md`; wire `mutation.yml` (incremental, PR-changed workspaces) +
`mutation-nightly.yml` (full, Monday, opens a drift issue).

**Scope — Out:** docs/release (P14).

**Definition of Done:**
- `cargo mutants` passes the ≥ 95% caught gate on `apps/api` (target 100); `stryker run` passes `break: 95` on
  `apps/web` (`lib/**` 100); survivors documented; `mutation.yml` + `mutation-nightly.yml` green.

**Context / preconditions:** P12.
**Rules-of-phase:** never weaken a gate to pass — fix the test or remove genuinely-dead code; document equivalents;
`cargo-mutants --jobs` capped for memory safety.
**References:** Appendix C, D.
**Size:** L.

---

## Phase 14 — Docs, Public-Readiness & Release

**Goal:** complete the doc-set, harden for public, and cut the first tag.

**Scope — In:** every `docs/*.md` (DASHBOARD, GETTING_STARTED, FEATURES, ARCHITECTURE, ENVIRONMENT, DATABASE, EMAIL,
OAUTH_GOOGLE, REDIS, MFA, DEPLOYMENT, TROUBLESHOOTING, RELEASES); the README badge header; enforce `audit:exports` +
`audit:public-api`; security hardening (security headers, CORS, secret-scan clean); the **go-public checklist**
(Appendix E — secret-scan clean, branch protection, flip to public); the `release.yml` (OIDC + GHCR images) and the
first `v*` tag.

**Scope — Out:** any library-publish automation (that belongs to the library repo, not this example) and v-next features.

**Definition of Done:**
- All docs present + `markdown-link-check` clean; the Feature Coverage Matrix reconciles against both audits; CI fully
  green including `codeql` + `scorecard` + the security gates; the repo is ready to flip public; the first tag is cut
  and `release.yml` produces images + records `RELEASES.md`.

**Context / preconditions:** P13.
**Rules-of-phase:** no phase/task references in any committed doc-as-config; security reports go to email per SECURITY.md.
**References:** OVERVIEW §18, §19, §20, §21; Appendix D, E.
**Size:** L.

---

## Appendix A — Environment Variable Registry

Canonical table: [`OVERVIEW.md §9`](./OVERVIEW.md#9-configuration--environment). Every variable is `UPPER_SNAKE_CASE`
(browser vars `NEXT_PUBLIC_`), documented in the root `.env.example`, and **validated at boot** by the `figment`-based
`Settings` loader (`apps/api/src/config/`) — a missing/invalid var aborts startup. Hard guards: `JWT_SECRET` ≥ 64 chars
and entropy-checked by `AuthConfig::validate`; `MFA_ENCRYPTION_KEY` is base64 32 bytes; production guards: `WEB_ORIGIN`
must be `https://`, managed `DATABASE_URL`/`REDIS_URL` (no loopback) in production.

---

## Appendix B — Library Export → Phase Coverage Map

The contract is the [Feature Coverage Matrix](./OVERVIEW.md#6-feature-coverage-matrix) (35 rows). Two audits enforce it:
`scripts/audit-library-exports.mjs` parses the built `@bymax-one/rust-auth` `dist/**/*.d.ts` (the `/client`, `/react`,
`/nextjs`, `/shared` subpaths), extracts every exported symbol, and word-boundary-searches `apps/web`, failing CI on any
unreferenced export; `scripts/audit-rust-public-api.sh` runs `cargo public-api` over the consumed crates and checks every
`pub` item is referenced in `apps/api` (allow-list with a reason). Phase → matrix mapping:

| Phase | Matrix rows |
| --- | --- |
| P3 | 30 (partial), 22 (available) |
| P4 | 33, 18 |
| P5 | 1–7, 16, 19, 20, 21, 23, 24, 25, 30, 31, 32 |
| P6 | 12, 13, 34 |
| P7 | 14, 15, 17, 22 |
| P8 | 28 (partial), 29, 30 |
| P9 | 1, 2, 6, 7, 9, 13, 26 (browser journeys) |
| P10 | 4, 5, 8, 10, 11, 12, 17, 19, 20, 24, 25, 28 |
| P11 | 14, 15 |
| P14 | 35 (Roadmap honesty), 27 (native client documented) |

Every export lands in at least one phase's DoD. Catalog-only codes (the 3 internal-only sentinels, the unreachable
`PasswordResetTokenExpired`) are allow-listed with a reason; the WASM `extract_claims`/`verify_password` are out-of-surface.

---

## Appendix C — Quality Gates

| Gate | Tool / config | Threshold | Enforced in |
| --- | --- | --- | --- |
| Format — api | `cargo fmt --all --check` | clean | `ci.yml` `format`, pre-commit |
| Format — web | Prettier | clean | `ci.yml` `format`, pre-commit |
| Lint — api | `cargo clippy --all-targets -- -D warnings` | 0 warnings | `ci.yml` `lint` |
| Lint — web | ESLint flat (`--max-warnings 0`) | 0 warnings | `ci.yml` `lint` |
| Typecheck — api | `cargo check --workspace` | 0 errors | `ci.yml` `typecheck` |
| Typecheck — web | `tsc --noEmit` | 0 errors | `ci.yml` `typecheck` |
| MSRV — api | `cargo +1.90 check` | builds on the floor | `ci.yml` `msrv` |
| Unit coverage — api | `cargo-llvm-cov nextest` | **100%** all metrics | `ci.yml` `unit` |
| Unit coverage — web | Vitest (`thresholds`) | **100%** all metrics | `ci.yml` `unit` |
| E2E — api | `cargo nextest` integration (test stack) | pass | `ci.yml` `e2e-api` |
| E2E — web | Playwright | pass | `ci.yml` `e2e-web` |
| Mutation — api | `cargo-mutants` (+ gate script) | **caught ≥ 95%** (target 100) | `mutation.yml`, `mutation-nightly.yml` |
| Mutation — web | Stryker (`break`) | **≥ 95** (`lib/**` 100) | `mutation.yml`, `mutation-nightly.yml` |
| Export usage — web | `audit-library-exports.mjs` | every npm export referenced | `ci.yml` `export-usage-check` |
| Public-API — api | `audit-rust-public-api.sh` (`cargo public-api`) | every `pub` item referenced | `ci.yml` `export-usage-check` |
| Dependency review | `actions/dependency-review-action` | no high vulns / bad licenses | `ci.yml` (PR) |
| Supply chain — api | `cargo deny check` + `cargo audit` + `cargo vet` | clean / recorded | `ci.yml` `supply-chain` |
| Static security | CodeQL (`security-extended`, `javascript-typescript`) | no new alerts | `codeql.yml` |
| Supply chain — repo | OpenSSF Scorecard | published (informational) | `scorecard.yml` |
| Secret scan | gitleaks/TruffleHog | clean | `ci.yml` (or `codeql.yml` companion) |
| Pre-commit | husky + lint-staged + commitlint | pass | local + `commit-msg` |

> **Notes.** *Coverage scope:* `main.rs`, generated sqlx glue, pure type modules, and `*.d.ts` are excluded so the 100%
> stays meaningful. *Mutation bar:* `cargo-mutants` has no Stryker-style `break` config — a CI script computes
> `caught / (caught + missed)` and fails below 0.95 (api targets 100; web `lib/**` 100 with `components/**` driven up);
> survivors documented as provable equivalents in `docs/mutation/`. *Memory safety:* `cargo nextest --test-threads`
> bounded + Vitest `maxWorkers: '50%'`; CI runs each workspace's coverage as a separate step; `cargo-mutants --jobs`
> capped; never fan out parallel test agents. *Toolchain:* the npm package builds first so the `file:` link resolves;
> a placeholder `DATABASE_URL` lets the api build without a DB; `cargo sqlx prepare` keeps the offline cache current.

---

## Appendix D — CI/CD Workflow Matrix

All workflows: `actions/checkout@v5`, `pnpm/action-setup@v4` (pinned, pnpm 10.8.x), `actions/setup-node@v5` (Node 24,
`cache: pnpm`, **pnpm before node**), `dtolnay/rust-toolchain@<pin>` + `Swatinem/rust-cache@v2`, `pnpm install
--frozen-lockfile` + `cargo build --locked`; top-level `permissions: contents: read` (jobs widen only what they need);
`concurrency` cancel-in-progress (except `release`); pinned actions; `timeout-minutes` per job; a placeholder
`DATABASE_URL` so the api build runs without a DB.

| Workflow | Triggers | Jobs | Lands |
| --- | --- | --- | --- |
| `ci.yml` | PR + push `main`/`next` | `build-library` (build the npm package) → `install`, `format`, `lint`, `typecheck`, `msrv`, `unit` (coverage upload, both workspaces), `e2e-api`, `e2e-web` (needs e2e-api), `export-usage-check` (npm + public-api), `supply-chain` (deny/audit/vet), `dependency-review` (PR), `coverage-report` | P0 (skeleton) → enriched P2/P5/P12 |
| `codeql.yml` | PR + push `main` + weekly cron | `analyze` (`javascript-typescript`, `security-extended`, SARIF → Security tab) | P0 |
| `scorecard.yml` | push `main` + weekly cron | OpenSSF Scorecard (supply-chain, publishes to scorecard.dev) | P0 |
| `mutation.yml` | PR (paths filter via `dorny/paths-filter`) | `detect` (changed workspace) → `mutation-api` (`cargo-mutants`, cached) / `mutation-web` (`stryker --incremental`) | P13 (skeleton P0) |
| `mutation-nightly.yml` | cron Mon 03:00 UTC + dispatch | `full-api` / `full-web` (cold full run); opens a `mutation-drift` issue on failure | P13 |
| `release.yml` | tag `v*` | `build-and-push` (OIDC, GHCR `…-api`/`…-web` images, `docker manifest inspect` idempotency, `metadata-action` semver tags) → `update-releases-doc` (bot appends to RELEASES.md, lib-version row from `apps/api/Cargo.toml`) | P14 (validates from P0) |
| `dependabot.yml` / `renovate.json` | weekly | cargo + npm + github-actions update PRs (never auto-merge) | P0 |

> **Enhancement over the sibling examples.** `@bymax-one/nest-auth` ships only `ci`/`mutation`/`mutation-nightly`/
> `release`. Because this repo is **going public and is agent-built**, `codeql.yml`, `scorecard.yml`, the
> `dependency-review` + `supply-chain` gates, and the secret-scan are added from P0 (the canonical published-`@bymax-one/*`
> CI set per the vault `GitHub-Actions/Bymax-Conventions`). The `build-library` job + the `cargo public-api` audit are
> Rust-stack additions: the npm package must be built before the web build resolves it, and the Rust `pub` surface needs
> a snapshot audit the npm `.d.ts` parser cannot cover.

---

## Appendix E — Go-Public Readiness Checklist

To flip the repo from private to public (gated in P0 for scaffolding, enforced in P14):

- [ ] `LICENSE` (MIT), `SECURITY.md` (report → email, not a public issue), `CODE_OF_CONDUCT.md` (Contributor Covenant
  2.1 by reference), `CONTRIBUTING.md`, `CHANGELOG.md` (with `## [X.Y.Z]` headings), `CLAUDE.md`, `AGENTS.md`.
- [ ] `.github/ISSUE_TEMPLATE/` (bug_report, feature_request, `config.yml` linking security to email) +
  `PULL_REQUEST_TEMPLATE.md` + `CODEOWNERS`.
- [ ] The 4 Copilot review files, customized for this stack (Rust + TS; < 4000 chars each on the instruction files; no
  phase/task references; the Blockers checklist covers `unsafe`/`unwrap`/`expect`/`panic`, secrets-in-logs, the
  controller-maps-the-error rule, the never-log-secrets rule, an undemonstrated export, a `#[allow]`/`@ts-ignore` without
  justification).
- [ ] `README.md` with the badge header (CI, coverage, mutation, license, Rust edition, MSRV, Node, axum, Next, React,
  Tailwind) + an architecture diagram + the Feature Coverage matrix link.
- [ ] CI fully green incl. `codeql` + `scorecard` + `dependency-review` + `supply-chain` + secret-scan; **secret scan
  clean** (no real keys — Mailpit/test fixtures only).
- [ ] Branch protection on `main` (PR-only, required checks by name, signed commits, linear history) configured in the
  GitHub UI.
- [ ] `release.yml` OIDC / GHCR configured; the first `v*` tag cut.

---

## Update Protocol

When a phase changes state:

1. Set the phase's **Status** emoji (and **Last updated** date) in the [Phase dashboard](#phase-dashboard) — `🔄` when
   started, `👀` in PR/review, `✅` only after merge with every DoD bullet met and CI green; `🟡 Partial` if some tasks
   are done but the DoD is not; `⛔` if blocked.
2. Update the phase's `Progress` cell (`done / total` tasks) once its Layer-3 task file exists.
3. Recompute **Overall progress** in [Progress](#progress) (`N / 15 phases`, %), and set **Active phase** / **Blocked**.
4. Mirror the change in the phase's `docs/tasks/phase-NN-*.md` header counter and task-index rows (per that file's own
   completion protocol).
5. **Never mark a phase `✅` while any Definition-of-Done bullet is unmet or any required CI check is red** — use `🟡`.
6. Commit the dashboard update with `docs(plan): <phase> → <status>` (no `Co-Authored-By`).

---

_End of the development plan for `rust-auth-example`._

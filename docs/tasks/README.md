# Task files — rust-auth-example

> **Layer 3** of the `spec → roadmap → phase-tasks` workflow. One file per phase, each carrying that phase's
> self-contained per-task agent execution prompts.
> **Source roadmap**: [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) · **Source spec**: [`../OVERVIEW.md`](../OVERVIEW.md).
> Format follows the `rust-auth` gold reference and the vault **Example-App-Standard**.

This index lists the 15 phase files, the conventions every file obeys, and the protocols an executing agent runs after
each task and at the close of each phase. It does **not** restate the roadmap (Layer 2) or the spec (Layer 1) — it is the
map into the task files and the rulebook for executing them one task at a time.

---

## Phase files

| Phase | File | Scope | Status |
| --- | --- | --- | --- |
| P0 | [`phase-00-foundation-ci.md`](./phase-00-foundation-ci.md) | Foundation, Tooling & CI Skeleton | ✅ |
| P1 | [`phase-01-local-stack.md`](./phase-01-local-stack.md) | Local Stack & Environment | ✅ |
| P2 | [`phase-02-library-consumption.md`](./phase-02-library-consumption.md) | Library Consumption & Export Audits | ✅ |
| P3 | [`phase-03-api-skeleton.md`](./phase-03-api-skeleton.md) | API Skeleton | ✅ |
| P4 | [`phase-04-schema-repositories.md`](./phase-04-schema-repositories.md) | Schema & Repositories | ✅ |
| P5 | [`phase-05-engine-wiring.md`](./phase-05-engine-wiring.md) | Engine Wiring, Email & Audit | ✅ |
| P6 | [`phase-06-oauth-invitations.md`](./phase-06-oauth-invitations.md) | OAuth & Invitations | 🔄 |
| P7 | [`phase-07-platform-websocket.md`](./phase-07-platform-websocket.md) | Platform Domain & WebSocket | 📋 |
| P8 | [`phase-08-web-skeleton.md`](./phase-08-web-skeleton.md) | Web Skeleton & Design System | 📋 |
| P9 | [`phase-09-public-auth-pages.md`](./phase-09-public-auth-pages.md) | Public Auth Pages | 📋 |
| P10 | [`phase-10-dashboard-console.md`](./phase-10-dashboard-console.md) | Dashboard Console | 📋 |
| P11 | [`phase-11-platform-console.md`](./phase-11-platform-console.md) | Platform Console | 📋 |
| P12 | [`phase-12-testing.md`](./phase-12-testing.md) | Testing & 100% Coverage | 📋 |
| P13 | [`phase-13-mutation.md`](./phase-13-mutation.md) | Mutation Hardening | 📋 |
| P14 | [`phase-14-docs-release.md`](./phase-14-docs-release.md) | Docs, Public-Readiness & Release | 📋 |

All 15 phase files are scaffolded. Execute them one phase at a time (per [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md)
§3) — a phase starts only after the previous one merges green.

---

## Status legend

Matches the roadmap dashboard:

| Symbol | Meaning |
| --- | --- |
| 📋 | ToDo — not started |
| 🔄 | In Progress — exactly one task at a time |
| 👀 | Review — code complete, in PR / Copilot review |
| ✅ | Done — every acceptance/DoD bullet met and CI green |
| ⛔ | Blocked — a dependency or external blocker is open |
| 🟡 | Partial — some tasks done but the phase DoD is not fully met (never use ✅ here) |

---

## Token economy — executing a single task

> **Do NOT read a whole phase file to run one task.** Every `### Task N.n` block is self-contained: its
> `#### Agent prompt` carries the full role + project context, a **bounded** *REQUIRED READING* list, the deliverables,
> the exact verification commands, and the completion protocol — everything needed to drop the block into a fresh
> conversation and execute it.
>
> To execute task `N.n`:
> 1. Jump straight to its block — `grep -n "### Task N.n" docs/tasks/phase-NN-*.md`, then `Read` that file at the
>    returned `offset` with a small `limit` (just the one block).
> 2. Confirm every **Depends on** ID for that task is `✅` in the phase file's `## Task index` table before starting.
> 3. Read **only** what the prompt's *REQUIRED READING* lists (specific `OVERVIEW.md` / `DEVELOPMENT_PLAN.md` sections
>    and the named sibling/library paths) — never load the whole phase file, the other tasks, or unrelated docs.
>
> This keeps each execution cheap and deterministic: context in, deliverable out, no incidental reading.

---

## Task-file anatomy

Every `phase-NN-*.md` file follows the same 8-part structure:

1. **Header** — H1 `# Phase N — <Title>` + a status blockquote (Status · Progress `n / TOTAL` · Last updated · Source
   roadmap · Source spec · the "executing a task?" pointer back to this index).
2. **`## Context`** — what the previous phase produced, what this phase fills in, and the observable end-state, closing
   with a bold scope-fence sentence.
3. **`## Rules-of-phase`** — the numbered conventions that bite in this phase specifically.
4. **`## Reference docs`** — exact `OVERVIEW.md` / `DEVELOPMENT_PLAN.md` / `DASHBOARD.md` sections, sibling paths, and
   the universal `/bymax-workflow:standards` (Rust track) pointer.
5. **`## Task index`** — a table `| ID | Task | Status | Priority | Size | Depends on |`.
6. **`## Tasks`** — one `### Task N.n — <title>` per index row, each with: metadata bullets
   (**Status**/**Priority**/**Size**/**Depends on**) → `#### Description` → `#### Acceptance criteria` (`- [ ]`
   checkboxes) → `#### Files to create / modify` → `#### Agent prompt` (a **four-backtick** fence so the inner
   ` ```rust ` / ` ```toml ` / ` ```ts ` skeletons render).
7. **`## Phase Completion Protocol`** — the closeout run when the last task is `✅`.
8. **`## Completion log`** — append-only, one line per completed task.

---

## Per-task Completion Protocol

Run these **6 steps after every task** (they are also embedded in each task's `#### Agent prompt`):

1. Set the task's status to `✅` in **both** its `### Task N.n` block and the `## Task index` row.
2. Tick the satisfied acceptance-criteria checkboxes (`- [x]`).
3. Bump the file-header **Progress** counter to `<n> / <TOTAL>` and update **Last updated**.
4. Update the matching `P<N>` row **Progress** in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md).
5. Append one line to the phase file's `## Completion log`: `- N.n ✅ YYYY-MM-DD — <summary>`.
6. Commit with a Conventional-Commits message (no `Co-Authored-By` trailer).

**Never mark a task `✅` while an acceptance bullet is unmet or its verification command fails.**

---

## Per-phase Completion Protocol

Run when the phase's **last** task turns `✅`:

1. Confirm **all** tasks in the phase are `✅` and every Definition-of-Done bullet is met.
2. Confirm the phase PR is **merged** and **CI is green** (all required checks).
3. In [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the phase to `✅` / Progress `N of N` / update **Last
   updated**, advance the **Active phase** pointer, and recompute **Overall progress** (`X / 15`).
4. Set this index's phase row to `✅` and the phase file's header **Status** to `✅`.
5. Commit `docs(plan): P<N> complete`.

**If a DoD bullet is unmet or CI is red, set the phase `🟡 Partial` — not `✅`.**

---

## Execution rules

The three invariants that govern the whole build (enforced by each task's **Depends on** + **Verification**, see
[`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) §3):

1. **One-in-progress-at-a-time** — exactly one phase `🔄` and exactly one task `🔄` within it.
2. **Never-start-until-deps-green** — a phase or task begins only once every dependency is `✅`.
3. **Never-mark-done-with-failing-verification** — `✅` requires every acceptance/DoD bullet met **and** CI green;
   otherwise `🟡 Partial`.

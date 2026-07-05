# Going Public

The checklist for flipping this repository from private to public. Most items
live in the tree already (see the go-public files below); the one item that
cannot be expressed in code — branch protection — is applied once in the GitHub
UI and is documented here so it is reproducible.

## Go-public files (in the tree)

These are committed and verified; no action beyond review is required:

- Governance & community health: [`LICENSE`](../LICENSE) (MIT),
  [`SECURITY.md`](../SECURITY.md) (reports go to **support@bymax.one**, never a
  public issue), [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) (Contributor
  Covenant 2.1), [`CONTRIBUTING.md`](../CONTRIBUTING.md),
  [`CHANGELOG.md`](../CHANGELOG.md), [`CLAUDE.md`](../CLAUDE.md),
  [`AGENTS.md`](../AGENTS.md).
- GitHub configuration: `.github/ISSUE_TEMPLATE/` (bug report, feature request,
  and a `config.yml` that routes security reports to the private advisory flow),
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, and the four Copilot
  review files (`.github/copilot-instructions.md`,
  `.github/instructions/code.instructions.md`,
  `.github/instructions/tests.instructions.md`,
  `.github/agents/agent-code-reviewer.agent.md`).
- The [`README.md`](../README.md) badge header (CI, coverage, mutation, license,
  Rust edition, MSRV, Node, axum, Next.js, React, Tailwind).

Before flipping visibility, confirm the secret scan is clean — only Mailpit and
local/dev fixtures appear in the tree, never a real key.

## Branch protection for `main`

`main` is protected before the repository goes public. This is a GitHub-UI step
(**Settings → Branches → Branch protection rules**, or an equivalent repository
ruleset) — it cannot be set from a workflow. Apply the rule to `main` with:

- **Require a pull request before merging** — no direct pushes to `main`.
- **Require approvals** (at least one) and **dismiss stale approvals** when new
  commits are pushed.
- **Require review from Code Owners** ([`.github/CODEOWNERS`](../.github/CODEOWNERS)).
- **Require status checks to pass** and **require branches to be up to date**
  before merging (the checks are listed below).
- **Require signed commits.**
- **Require linear history.**
- **Include administrators** — the rule applies to everyone.
- **Block force pushes and deletions.**

### Required status checks (by name)

Job names are contractual — branch protection references them exactly, so
renaming a job means updating this rule. Mark every check below as required:

**CI (`ci.yml`):**

- `build-library`
- `install`
- `format`
- `lint`
- `typecheck`
- `msrv`
- `unit`
- `e2e-api`
- `e2e-web`
- `e2e-web-live`
- `build-web`
- `export-usage-check`
- `docs-link-check`
- `supply-chain`
- `dependency-review`
- `coverage-report`

**Static analysis & supply chain:**

- `analyze` (`codeql.yml`)
- `analysis` (`scorecard.yml`) — informational; keep it required so a scorecard
  regression stays visible.

**Mutation testing (`mutation.yml`, scoped to the workspaces a PR changes):**

- `mutation-api`
- `mutation-web`

The mutation workflow's `detect` gate skips `mutation-api` / `mutation-web` when
their workspace is unchanged; GitHub treats a skipped required check as
satisfied, so a docs-only PR stays green while a PR that touches a workspace
still must pass its mutation run.

## Flip to public

Only after the go-public files are reviewed, the secret scan is clean, and branch
protection is in place: change the repository visibility to public. This is a
deliberate, human-performed action — it is not automated.

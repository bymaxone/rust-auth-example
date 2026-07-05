# Releases

This file records which `bymax-auth` / `@bymax-one/rust-auth` version each branch
tracks and the container images published for each tagged release. While the
library is pre-publish, the tracked versions are the local `path` (Rust crates)
and `file:` (npm package) links at `0.0.0`.

## Tracked library versions

| Branch | Tracked bymax-auth | @bymax-one/rust-auth | Date       |
| ------ | ------------------ | -------------------- | ---------- |
| main   | 0.0.0 (path)       | 0.0.0 (file:)        | 2026-07-01 |
| next   | upcoming line      | upcoming line        | —          |

`main` tracks one library version line at a time; the `path`/`file:` links become pinned
semver ranges once the crates and the npm package publish. `next` tracks the upcoming line
(for example the `bymax-auth` facade landing or new `OAuthProvider` implementations). This
mirrors [OVERVIEW §19 — Versioning & Release Tracking](./OVERVIEW.md#19-versioning--release-tracking).

## How a release is recorded

A release is cut by pushing a `v*` git tag. The
[`release.yml`](../.github/workflows/release.yml) workflow then, in order:

1. Builds and pushes the two GHCR images —
   `ghcr.io/bymaxone/rust-auth-example-api` (distroless) and
   `ghcr.io/bymaxone/rust-auth-example-web` (Next.js standalone) — tagged with the semver
   **without** the leading `v` plus a rolling `{major}.{minor}` tag. Each image is checked
   with `docker manifest inspect` first, so a retried run never overwrites an image that
   already published.
2. Appends a row to the [Tagged releases](#tagged-releases) table below via a bot commit. The
   tracked library version is read from
   [`apps/api/Cargo.toml`](../apps/api/Cargo.toml) (the `bymax-auth-core` dependency version).

The workflow is idempotent per tag: if a row for the tag already exists, it is skipped.

## Tagged releases

Rows below are appended automatically by the release workflow when a `v*` tag is
pushed; the tracked library version is read from `apps/api/Cargo.toml`. The
`_pre-release_` seed row is the pre-publish baseline and stays at the bottom as new
tags are prepended above it.

| Tag | Tracked bymax-auth | Date | Images |
| --- | ------------------ | ---- | ------ |
<!-- releases:insert -->
| _pre-release_ | 0.0.0 (path) | 2026-07-05 | none published yet |

## Further reading

- [`CHANGELOG.md`](../CHANGELOG.md) — the human-written change history.
- [Deployment](./DEPLOYMENT.md) — what to verify on each release, and how the images run.
- [OVERVIEW §18 — Deployment Notes](./OVERVIEW.md#18-deployment-notes).
</content>

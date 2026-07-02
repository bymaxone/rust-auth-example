# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial repository foundation: the dual cargo + pnpm workspace, the pinned Rust
  and Node toolchains, the compiling `apps/api` stub, and the TypeScript-strict
  base configuration.
- Rust lint and supply-chain policy (`rustfmt.toml`, `clippy.toml`, `deny.toml`)
  and cross-stack commit governance (commitlint, husky hooks, lint-staged, ESLint
  flat config, Prettier, and the editor/git dotfiles).
- Repository governance and community-health files (`LICENSE`, `SECURITY.md`,
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`).
- GitHub configuration: issue and pull-request templates, `CODEOWNERS`, the
  dependency-update bot, and the Copilot review files.
- The complete CI/CD and go-public workflow set as runnable skeletons — the core
  pipeline, static security analysis, supply-chain scanning, mutation testing, and
  the container release flow — plus the export-audit scripts and the two
  application `Dockerfile`s.

[Unreleased]: https://github.com/bymaxone/rust-auth-example/commits/main

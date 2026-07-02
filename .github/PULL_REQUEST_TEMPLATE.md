<!-- Keep the PR focused; explain the WHY, not just the WHAT. -->

## Summary

<!-- What does this change do, and why? -->

## Linked issue

<!-- e.g. Closes #123 -->

## Quality gates

- [ ] `cargo fmt --all --check` and `cargo clippy --workspace --all-targets -- -D warnings` pass
- [ ] `cargo deny check` and `cargo audit` pass
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` pass
- [ ] `pnpm audit:exports` and `pnpm audit:public-api` pass
- [ ] Tests added/updated; coverage stays at 100% on changed logic
- [ ] Commits follow Conventional Commits (no `Co-Authored-By` trailer)
- [ ] No secrets committed; comments are English and timeless

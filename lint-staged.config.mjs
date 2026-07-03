export default {
  // Rust: format-check and lint the whole workspace whenever any Rust file is
  // staged (both commands are workspace-scoped, so the file list is unused).
  // env SQLX_OFFLINE=true builds from the committed .sqlx/ cache so the hook
  // does not need a live database (CI sets this flag in the same way).
  '*.rs': () => [
    'cargo fmt --all -- --check',
    'env SQLX_OFFLINE=true cargo clippy --workspace --all-targets -- -D warnings',
  ],
  '*.{ts,tsx,mjs,cjs,js,jsx}': ['prettier --write', 'eslint --fix --max-warnings 0'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};

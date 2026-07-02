export default {
  // Rust: format-check and lint the whole workspace whenever any Rust file is
  // staged (both commands are workspace-scoped, so the file list is unused).
  '*.rs': () => [
    'cargo fmt --all -- --check',
    'cargo clippy --workspace --all-targets -- -D warnings',
  ],
  '*.{ts,tsx,mjs,cjs,js,jsx}': ['prettier --write', 'eslint --fix --max-warnings 0'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};

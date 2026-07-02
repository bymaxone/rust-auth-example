---
applyTo: 'apps/api/**/*.rs,apps/web/**/*.{ts,tsx,mts,cts}'
---

# Code Review Instructions — rust-auth-example

## Rust rules (apps/api)

- Every crate carries `#![forbid(unsafe_code)]` and `#![deny(missing_docs)]`.
- **No `unwrap`, `expect`, `panic!`, `todo!`, `unreachable!`** in non-test code —
  return a typed error instead. The workspace `[lints]` table denies them.
- Errors are typed `thiserror` enums, not `anyhow`, in library-shaped code.
- The controller/handler **maps the library error** to the stable error envelope
  via the library's mapping; it never leaks an internal error string, and an
  `Internal` variant collapses to an opaque 500.
- Never log secrets, tokens, OTP codes, or PII; honor redacting `Debug`.
- Dependencies are injected explicitly through constructors into shared state.
- Functions ≤ 50 lines; files ≤ 800 lines; every `pub` item carries rustdoc.

## TypeScript rules (apps/web)

- `strict` is active with `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noImplicitOverride`, and `verbatimModuleSyntax`.
- **Zero `any`** — use `unknown` with type guards; use generics for typed APIs.
- Import types with `import type { … }` when the value is not used at runtime.
- The `/nextjs` subpath is server/edge-only; never import it in a client
  component. Keep `lib/` JSX-free.
- Never store a token in `localStorage` — cookies or in-memory only.
- Localize every `auth.*` error from `/shared`; never render a raw error code.

## Shared rules

- **No suppression comments** without a written justification: no `#[allow(...)]`,
  `@ts-ignore`, `@ts-expect-error`, or `eslint-disable`.
- **No secrets** in any file; only local/test values (Mailpit, dev fixtures).
- The shared design system is reused verbatim — never re-styled.
- English-only, timeless comments and identifiers — describe what the code does
  and why, never which planning step produced it.
- Conventional Commits; never add a `Co-Authored-By` trailer.

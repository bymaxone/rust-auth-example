# Mutation hardening — implementation plan & equivalents

How each workspace's mutation surface is driven to the floor (≥ 95, target 100), and the
written argument for every mutant accepted as a **provable equivalent** rather than killed.

## Strategy

- **apps/api** — `cargo-mutants` over the default-feature surface, run through `nextest` (the
  same suite coverage uses). The wrapper `scripts/mutants-gate.sh` recomputes
  `caught / (caught + missed)` (timeouts count as caught; `unviable` excluded) and gates at the
  `0.95` floor. Survivors are killed by adding the missing assertion — a boundary test, a
  value/format assertion, a delivery-arrival check — never by weakening a gate.
- **apps/web** — Stryker (Vitest runner) over `lib/**`, `components/**`, `hooks/**` (the verbatim
  shadcn `components/ui/*` wrappers are structural, not logic, and excluded). `break: 95` on the
  base config; a `lib/**`-only config holds a hard `break: 100`.

## apps/api survivors and dispositions

The first full run (see [`BASELINE.md`](./BASELINE.md)) left 11 survivors:

| File:line | Mutation | Disposition |
| --- | --- | --- |
| `config/mod.rs:297` | `<` → `<=` in `Settings::validate` | **killed** — `accepts_a_jwt_secret_exactly_at_the_floor`: a secret of exactly `JWT_SECRET_MIN_LEN` bytes must load. |
| `layers.rs:22` | `1024 * 1024` → `1024 + 1024` | **killed** — `a_body_under_the_one_mib_cap_passes_the_limit_layer`: a 4 KiB body passes the cap; a shrunk cap would 413 it. |
| `telemetry.rs:19` | `init_tracing` → `()` | **killed** — `init_tracing_installs_the_subscriber…`: asserts a global dispatcher is set afterwards (nextest isolates the process, so none exists before). |
| `audit/routes.rs:125` | `format_ts` → `String::new()` | **killed** — `format_ts_renders_the_rfc3339_string`. |
| `audit/routes.rs:162` | `>` → `>=` in the has-more check | **killed** — extracted `page_has_more(len, limit)` + `page_has_more_only_strictly_past_the_limit`. |
| `audit/routes.rs:337` | `-` → `+` in the aggregate cutoff | **killed** — extracted `aggregate_cutoff(now)` + `aggregate_cutoff_is_the_window_in_the_past`. |
| `email/lettre.rs:71,85` | `send_password_reset_token`/`send_password_reset_otp` → `Ok(())` | **killed** — `delivers_every_message_to_mailpit` now asserts all seven messages actually arrive (Mailpit search API), not merely that `send` returns `Ok`. |
| `app.rs:82,83,84` | delete field `route_prefix` / `rate_limits` / `client_ip_source` from `AxumAuthConfig` | **removed** — the three assignments duplicated the library defaults; see below. |

### Equivalent-by-construction, resolved by simplification — `AxumAuthConfig` (`app.rs`)

`build_router` used to set three `AxumAuthConfig` fields explicitly, then fill the rest with
`..Default::default()`:

```rust
AxumAuthConfig {
    route_prefix: "auth".to_owned(),
    rate_limits: RateLimitConfig::default(),
    client_ip_source: ClientIpSource::PeerAddr,
    ..Default::default()
}
```

At the pinned library version `AxumAuthConfig::default()` is **exactly** these values
(`bymax-auth-axum` `state.rs`: `route_prefix = AUTH_ROUTE_PREFIX` = `"auth"`, `rate_limits =
RateLimitConfig::default()`, `client_ip_source = ClientIpSource::default()` = `PeerAddr`), so each
"delete field" mutant was a true equivalent — deleting a field fell through `..Default::default()`
to the identical value, observable by no test. Rather than carry three permanently-surviving
equivalents (which `--exclude-re` cannot target — it matches at function granularity, not per
struct field), `build_router` now calls `AxumAuthConfig::default()` directly, with a comment
documenting the tunable knobs (including the security-relevant `client_ip_source`). The redundant
assignments — and their equivalent mutants — are gone, so the surface is genuinely 100%-killable.

## apps/web survivors and dispositions

The first Stryker run (base config) scored **78.26%** (243 survivors across 1376 mutants, 41 files).
Strengthening the 25 affected test files drove the base config to **≥ 95** (`break: 95` passes) and
the `lib/**` subset to **100** (`break: 100`). How the survivors were resolved:

- **Under-asserted rendering / logic** (the bulk): tests rendered components or called functions
  without asserting the exact output. Killed by asserting exact strings (labels, aria-labels,
  className/variant tokens, request URLs/methods/bodies), by exercising **both** branches of each
  conditional (boundary indices, empty vs filled, ok vs error, active vs idle), and by asserting
  callback args / focus targets / computed values.
- **`readErrorBody` (`api.ts` + `platform-client.ts`)** — the optional-chaining and empty-catch
  mutants were equivalents *only because one `try` wrapped the whole body*. Narrowing the `try` to
  `res.json()` and inspecting `parsed.error` **outside** it makes every branch observable (an absent
  envelope or a non-JSON body now diverges — throw vs fallback), so all are killed by tests.
- **Dead / redundant source removed** (the phase endorses this over documenting): `expiry-pill.tsx`
  carried a `firedRef` written at three sites but never read (double-fire is actually prevented by
  `clearInterval` + the early return) — deleted; `trigger-actions.ts` dropped a redundant
  `!== undefined` operand that `Number.isFinite` already subsumes, except where the
  `exactOptionalPropertyTypes` narrowing needs it (there it is disabled, below).

### Documented provable equivalents (`// Stryker disable next-line` + written argument)

Three `lib/**` mutants are irreducible equivalents, disabled inline (Stryker's mechanism for a
documented equivalent):

| Location | Mutant | Why no test can distinguish it |
| --- | --- | --- |
| `oauth.ts:51` | the `decision === null \|\| branch === null` guard | the `.includes` check on the next line already rejects null (null is a member of neither set), so every mutation yields the same `null`; the guard exists only to narrow `string \| null` → `string` for `.includes`. |
| `ws-ticket.ts:29` | the `?? ''` default | any non-absolute default (the mutant's `"Stryker was here!"` included) makes `new URL(...)` throw and routes to the identical `catch` fallback. |
| `trigger-actions.ts:135` | the `seconds !== undefined` operand | `Number.isFinite(undefined)` is already `false`, so flipping the operand to `true` changes nothing; kept only for the `exactOptionalPropertyTypes` narrowing of the result. |
| `platform-client.ts:44-48` | the `createAuthFetch({ baseUrl, credentials, refreshEndpoint })` config | a **static module-load mutant**: the single-flight fetch must be one module-level singleton (all callers share its 401-refresh dedup), so its config runs once at import — before/outside any test — and Stryker's per-test model cannot re-execute it (`ignoreStatic: true` is set for this class but does not catch it here). A `platform-client module wiring` test still pins the values. |

The remaining base-config survivors (in `components/**` / `hooks/**`, which do not block the
`break: 95` floor) are documented provable equivalents: out-of-bounds `?.focus()` no-ops and a ref
array fully overwritten by ref callbacks (`otp-input.tsx`); a lazy `useState` initializer the mount
effect overwrites synchronously under test but which prevents a real-browser flash
(`expiry-pill.tsx`); a `variant="default" → ""` cva fallback that resolves back to `default`
(`ProviderChips.tsx`); constant-dependency arrays whose `[]` vs `[const]` produce identical effect
timing / memo identity (`RecoveryCodeGrid`, `QrEnrollmentCard`, `use-audit-tail`); and status
discriminants (`'idle'` / `'ready'`) set but never compared (`DiagnosticsMatrix`,
`AcceptedInvitations`).

A small number of recursive/conditional-render mutants (`AuditTable` `valueContainsSecret` /
`redactValue` object guards, the `DiagnosticsMatrix` lockout ternary) are reported as survived even
though the suite asserts the divergent behaviour — a `null` leaf makes the mutated
`Object.entries(null)` throw (`containsSecret({ nested: null })` covers it), and the elapsed-lockout
render asserts no `retry in` timer. These are **behaviourally guarded, not untested gaps**: Stryker's
`perTest` coverage does not always attribute the covering assertion to a mutant inside a
deeply-recursive function or a `renderResult` branch. The base score of 97.48 clears the 95 floor
with margin.

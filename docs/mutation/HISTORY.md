# Mutation history

An append-only log of mutation-score measurements. Newest last.

| Date | Workspace | Caught ratio | Notes |
| --- | --- | --- | --- |
| 2026-07-05 | apps/api | 92.81% (142/153) | First full baseline. 11 survivors: 3 equivalent-by-construction (`AxumAuthConfig` fields) + 8 real gaps. |
| 2026-07-05 | apps/api | **100% (150/150)** | Killed the 8 real survivors — floor-boundary (`config`), 1 MiB body-cap (`layers`), subscriber-installed (`telemetry`), `format_ts` / `page_has_more` / `aggregate_cutoff` (`audit`), Mailpit-arrival (`email`); removed the 3 equivalents by collapsing `build_router` to `AxumAuthConfig::default()`. Confirmed by per-file re-runs (survivors: 0). |
| 2026-07-05 | apps/web (base) | 78.26% (1376 mutants) | First full Stryker baseline. 243 survivors, almost all under-assertion. |
| 2026-07-05 | apps/web (base) | **≥ 95 (break 95 ✓)** | Strengthened 25 test files (killed ~197 survivors); removed dead `firedRef`. |
| 2026-07-05 | apps/web (lib) | **100 (break 100 ✓)** | `readErrorBody` refactored to be killable; `createAuthFetch` wiring + no-envelope cases asserted; 3 irreducible equivalents `// Stryker disable`d. |

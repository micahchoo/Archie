---
scope: "apps/studio/src/**/*.ts"
tags: [toolchain, hazard]
priority: high
source: hand-written
---

# Pure-.ts edits in apps/studio: `pnpm typecheck` is the gate, not svelte-check

`pnpm --filter @archie/studio run check` (svelte-check) uses `tsconfig.svelte-check.json`,
which deliberately sets `exactOptionalPropertyTypes: false` (Issue 12 — the flag is noise on
.svelte props). The full strictness for `.ts` files lives only in `cd apps/studio && pnpm
typecheck` (`tsc --noEmit`, the CI gate in checks.yml). Vitest never typechecks at all.

Proven 2026-07-19 (Archie-656a): a TS2379 exactOptionalPropertyTypes violation in
ingest-flows.ts passed BOTH vitest (542 green) and svelte-check (0/0) and was caught only
by the language server / `pnpm typecheck`.

**How to apply:** after editing any `.ts` under apps/studio, run `pnpm typecheck` in
apps/studio (in addition to vitest; svelte-check too if `.svelte` files changed). For the
optional-property idiom itself: pass optionals via conditional spread `...(x ? { x } : {})`,
the codebase's pervasive pattern.

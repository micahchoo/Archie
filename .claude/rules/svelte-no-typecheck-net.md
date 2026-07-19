---
scope: "apps/**/*.svelte"
tags: [toolchain, hazard]
priority: high
source: hand-written
---

# `.svelte` type errors: svelte-check is the gate — run it after edits

**Updated 2026-07-17.** This rule originally documented that the repo had NO svelte-check
(`tsc --noEmit` skips `.svelte`; an undefined identifier became a runtime ReferenceError — proven
by the 2026-07-06 `orderedIds()` bite in App.svelte). That gap is closed: ISSUES.md Issue 12
(merged `6bf45ef`) added `svelte-check` to apps/studio (`pnpm --filter @archie/studio run check`,
tsconfig `tsconfig.svelte-check.json`) and wired it into CI's checks.yml; apps/viewer is covered
by `astro check`.

**How to apply now:**
- After editing any `.svelte` file, run the app's check locally (`svelte-check` for studio,
  `astro check` for viewer) — don't rely on `tsc`/`vite build`, which still can't see `.svelte`
  scripts.
- Treat check errors on changed lines as blocking. The studio baseline is **0 errors / 0
  warnings** (as of 2026-07-19: the once-standing 11 a11y warnings were cleared by the a11y
  interaction-pattern merges `9d33b29`/`32ed159` (Archie-f260) and the glyph-label merges
  `c063f36`/`ca1eda8`) — keep it at zero; a new warning is a regression, not noise.
- The old manual discipline (grep every renamed identifier's definition AND call sites, both
  sides of cross-component prop renames) remains the fastest mid-edit pre-check, but the gate is
  what guarantees it.

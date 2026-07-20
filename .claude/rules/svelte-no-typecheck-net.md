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
tsconfig `tsconfig.svelte-check.json`) and wired it into CI's checks.yml.

**Corrected 2026-07-20 (Archie-b50f): apps/viewer is NOT covered.** This rule used to claim
`astro check` covers the viewer's `.svelte` islands. Measured, it does not. A deliberate
`const probe: number = notADefinedThing;` planted in `apps/viewer/src/components/MetadataRun.svelte`
passed `pnpm exec astro check` at **0 errors / 0 warnings / 0 hints** AND `pnpm exec tsc --noEmit`
clean; the same statement planted in `src/pages/index.astro` was caught immediately (1 error).
`astro check` diagnoses `.astro` files only — the viewer's 23 Svelte islands, which hold nearly all
of its UI, have no type gate in `check`, `typecheck`, or CI.

**Closed 2026-07-20 (same day, later):** apps/viewer now has the gate — `pnpm --filter @archie/viewer
run check:svelte` (`svelte-check --workspace . --fail-on-warnings`, own devDep), wired into checks.yml's
svelte-check job beside studio's. The old baseline (1 error, 10 warnings in 5 files) was burned to
**zero**: the error was a real unguarded indexed access in `Reader.svelte` `stepObject`; the 10
warnings were 9 intentional initial-capture sites (props named `initial*`, once-per-open builds,
prev-value trackers) converted to declared intent via `// svelte-ignore state_referenced_locally`
with a WHY on each, plus one dead CSS selector. `--fail-on-warnings` means the viewer's baseline is
**0/0 and a new warning fails CI** — same regression discipline as studio. When silencing
`state_referenced_locally`, never paste a bare ignore: the comment must say why initial-capture is
the contract at that site (see the five components for the idiom).

**How to apply now:**
- After editing any `.svelte` file, run the app's check locally — `pnpm --filter @archie/studio run
  check` for studio, the svelte-check command above for viewer. `astro check` is still worth running
  for viewer (it gates the `.astro` pages), but it proves nothing about an island. Never rely on
  `tsc`/`vite build`, which can't see `.svelte` scripts at all.
- Treat check errors on changed lines as blocking. The studio baseline is **0 errors / 0
  warnings** (as of 2026-07-19: the once-standing 11 a11y warnings were cleared by the a11y
  interaction-pattern merges `9d33b29`/`32ed159` (Archie-f260) and the glyph-label merges
  `c063f36`/`ca1eda8`) — keep it at zero; a new warning is a regression, not noise.
- The old manual discipline (grep every renamed identifier's definition AND call sites, both
  sides of cross-component prop renames) remains the fastest mid-edit pre-check, but the gate is
  what guarantees it.

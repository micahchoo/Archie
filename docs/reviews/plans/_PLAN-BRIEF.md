# Review-Plan Brief (all planning agents read this first)

You are writing an **implementation-ready plan doc** for ONE deferred fix from the thermo-nuclear review.
You are NOT implementing — you produce a plan a future session executes. Ground every claim in actual
code: open the files, confirm signatures and line numbers, do not trust the review summaries blindly.

**Read first:** `docs/reviews/THERMO-NUCLEAR-SYNTHESIS.md` (the landing order + cross-cutting analysis),
your subsystem's per-area review file (`thermo-render-core.md` / `thermo-viewer.md` / `thermo-studio.md`),
and the ADRs named in your task. Project mandate: cite prior art (ADRs) for every design decision.

**Context — what already landed (do NOT re-plan these):** step 1 (deleted dead exports
`boundsForSelector`/`RENDER_MOUNT`/`RENDER_SVELTE` + tautological tests) and step 2 (studio `tagsOf`
routed to `@render/core` `filter.ts`) are DONE and verified green. Your plan builds on that state.

**Test reality (verified):** studio has ZERO test files (no safety net — plan manual verification).
viewer has ONE test `apps/viewer/src/published.test.ts` (+ fixtures `sample-data.ts`, `voynich.ts`).
render-core has 46 test files / 402 tests; the publish readers are guarded by
`packages/render-core/src/publish/*.test.ts` (`site`, `voynich-readings`, `portable`, `interop`,
`ghpages`, `preview`). Project fixture rule: never modify a shared fixture to fix one test; changing a
fixture requires checking all consumers — call this out if your plan would touch one.

## Output: write `docs/reviews/plans/STEP-<N>-<slug>.md` with these sections
1. **Objective** — one line + the synthesis step number.
2. **Why this is a deliberate/separate change** — the specific risk that kept it out of the easy pass.
3. **Current state (verified)** — exact files, signatures, call sites with `file:line`. Confirm against code.
4. **Target design** — the new shape. If introducing an abstraction, apply the seam discriminator
   (≥2 real variants) and state the two+ variants explicitly. If deleting, apply the deletion test.
5. **Behavior changes** — explicit list, or "none (behavior-preserving)". Flag any latent-bug-fix as a change.
6. **Blast radius & test impact** — which tests guard this, which must be updated (and why that's correct,
   not fixture-masking), what has no coverage. Name the verification commands.
7. **ADR alignment** — cite the ADRs; confirm no contradiction, or flag intended drift-correction.
8. **Implementation steps** — ordered, ≤5 files per phase, a verify gate between phases.
9. **Acceptance criteria** — concrete, checkable.
10. **Rollback** — how to revert if it goes wrong.

Return a ≤300-word summary: objective, behavior-change count, blast radius (tests touched), key risk.

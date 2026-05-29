# Thermo-Nuclear Review — Shared Brief (all review agents read this first)

**Project:** Archie — static-publishable, multi-media exhibit annotation platform. pnpm monorepo.
Subsystems: `apps/studio` (@archie/studio), `apps/viewer` (@archie/viewer), `packages/render-core`
(@render/core — the canonical data/publish/IIIF layer), `packages/render-mount` (@render/mount),
`packages/render-svelte` (@render/svelte).

**Goal:** A deliberately harsh, structural code-quality audit. Not a style pass. Rethink how code is
structured to meaningfully improve quality WITHOUT changing behavior. Be ambitious: hunt for
restructurings that delete whole categories of complexity. If you can delete complexity rather than
rearrange it, push hard for that. Prefer a few high-conviction structural calls over a long nit list.

## The Eight Standards
0. **Be ambitious about structural simplification** — reframe so complexity disappears; delete layers, don't polish them.
1. **Guard the 1000-line threshold.** A file pushed over 1000 lines is a presumptive blocker unless there's a compelling structural reason and the result is still clearly organized. Flag files already over it.
2. **No random spaghetti growth.** Ad-hoc conditionals / one-off branches bolted into unrelated flows = a design problem. Push logic behind a dedicated abstraction, helper, or state machine.
3. **Clean the design; don't rubber-stamp "it works."** If behavior can stay the same while structure gets meaningfully cleaner, push for that. Prefer removing moving pieces over spreading complexity around.
4. **Prefer direct, boring code over magic.** Flag brittle/ad-hoc behavior, generic mechanisms hiding simple data-shape assumptions, thin wrappers / identity passthroughs that add indirection without clarity (= "shallow modules").
5. **Push on type & boundary cleanliness.** Question needless optionality, `unknown`, `any`, cast-heavy code, silent fallbacks papering over unclear invariants. Prefer explicit typed contracts.
6. **Keep logic in the canonical layer.** Flag feature logic leaking into shared paths and details leaking through APIs; reuse existing canonical helpers instead of bespoke near-duplicates. (render-core is the canonical layer.)
7. **Needless sequential orchestration & non-atomic updates are smells** when the cleaner structure is obvious. Don't micro-optimize.

## Architecture Lens (apply when a finding turns on abstraction quality)
- **Deep module** = lots of behavior behind a small interface (good). **Shallow module** = interface nearly as complex as implementation (the thin-wrapper smell — flag as structural regression).
- **Deletion test** (before recommending "delete this wrapper/layer"): imagine it deleted. If complexity *vanishes* → pass-through, delete it. If complexity *reappears across N callers* → it's deep, earning its keep, leave it.
- **Seam discriminator** (before recommending "introduce an abstraction"): one adapter = hypothetical seam; two = real one. Don't recommend a port/abstraction/dispatcher unless ≥2 things actually vary across it.
- **Self-check your own recommendations** — don't introduce premature extraction, DRY-as-rule (collapsing things that only look alike), premature decomposition (splitting one coherent module so understanding requires bouncing between files), complecting, or reified abstraction.

## Finding-Priority Order (lead with the domino)
First find the **domino**: the ONE restructuring that makes 2+ other findings unnecessary. Lead with it.
1. Structural code-quality regressions
2. Missed dramatic simplification / code-judo restructuring
3. Spaghetti / branching complexity
4. Boundary / abstraction / type-contract problems
5. File-size & decomposition
6. Modularity & abstraction
7. Legibility & maintainability

## MANDATORY before flagging structural complexity (project rule: cite prior art for every decision)
Read the architecture docs and the ADRs relevant to YOUR subsystem first. Several apparent
complexities are deliberate, documented decisions — the deletion test exists to respect them:
- `docs/architecture/subsystems.md`, `docs/architecture/overview.md`
- ADR-0003 (spine append-only version DAG), ADR-0005 (narrative section model),
  ADR-0006 (edit-at-locus spatiotemporal selectors), ADR-0007 (readings as AnnotationPages),
  ADR-0008 (viewer one-shell dual-mode), ADR-0010 (portable viewer read seam).
If a complexity is justified by an ADR, say so and cite it — do NOT flag it as a regression.
If the diff/code contradicts or has drifted from an ADR, that itself is a finding.

## Out of scope / low-priority
`anti-pattern-report.txt` is a prior mechanical scan (fire-and-forget awaits, bare catch-alls). Most
fire-and-forget hits are benign Svelte event handlers — do NOT echo these as findings. Only surface an
error-handling item if it's a genuine structural correctness hazard. Lead with structure, omit nits.

## Output contract
Write findings to `docs/reviews/thermo-<subsystem>.md` with sections:
1. **Verdict** (one of: Full Coherence / Pragmatic Partial / Hold+Clarify — and why)
2. **The Domino** (the single highest-leverage restructuring, or "none — findings are independent")
3. **Findings** (prioritized; each: severity [blocker/major/minor], file:line, the structural problem,
   the preferred remedy, and — if relevant — the ADR/prior-art citation that justifies or contradicts it)
4. **What earns its keep** (modules/abstractions you considered flagging but passed the deletion test — name them so synthesis doesn't re-litigate)
5. **Cross-subsystem hooks** (anything that looks like it leaks into / duplicates another subsystem — synthesis will reconcile)

Return to the orchestrator a ≤450-word summary: verdict, the domino, blocker/major count, and the
cross-subsystem hooks. Keep the full detail in the file.

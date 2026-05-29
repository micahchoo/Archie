# Thermo-Nuclear Review — `@render/mount` + `@render/svelte`

**Reviewer:** thermo agent · **Date:** 2026-05-28
**Scope:** `packages/render-mount/src` (mount.ts 220, fitbounds.ts 86, surface.ts 58, index.ts 26 — 390 LOC, 4 source files) and `packages/render-svelte/src` (Canvas.svelte 129, controller.ts 55, sanitize.ts 35, index.ts 14 — 233 LOC, 4 source files).
**Prior art read:** `_SHARED-BRIEF.md`, `subsystems.md` (Rendering §2), ADR-0002 (three-layer rendering, thin Svelte adapters), ADR-0004 (no wasm-vips).

---

## 1. Verdict

**Full Coherence.** Both packages are **deep modules**, not shallow wrappers. They survive the deletion test cleanly and the seam discriminator confirms ≥2 real consumers. The three-layer split (core → mount → svelte) is the *non-reversible* structure ADR-0002 deliberately committed to; the controller-as-plain-TS pattern is ADR-0002's "valuable shared thing is logic, not components" realized as running code. This is a well-structured corner of the codebase. Findings below are all **minor** — barrel-surface tightening, dead exports, two documented type-boundary casts, and one doc-drift note. No blockers, no majors.

A harsh review that finds clean structure and three minor cleanups is a pass, not a failure to find dirt. I deliberately resisted the brief's "fold a package into render-core" invitation: folding either package would *violate* ADR-0002 (see §4).

---

## 2. The Domino

**None — findings are independent and all minor.** There is no single restructuring that removes 2+ others. The tempting domino ("collapse render-mount or render-svelte into render-core") is an anti-finding: it reappears as an ADR-0002 violation under the deletion test (§4). The next-largest lever is cosmetic — tighten the two `index.ts` barrels — and it removes only the two dead-export findings, which are already trivial.

---

## 3. Findings (all minor)

### F1 [minor] Dead public exports — `render-mount/src/index.ts:22,26`, `render-svelte/src/index.ts:9`
`boundsForSelector` (index.ts:22), `RENDER_MOUNT` (index.ts:26), and `RENDER_SVELTE` (render-svelte index.ts:9) have **zero consumers** anywhere in `apps/` or `packages/` (verified by repo-wide grep — only their own def sites match). `boundsForSelector` is a one-line re-export of core's `selectorBBox` justified in-comment as "thin re-export convenience" — but no one consumes the convenience.
**Remedy:** delete all three. If a package-identity constant is wanted for diagnostics, keep one and document the intended caller; otherwise drop it. Std-1/Std-4 (thin passthrough adding indirection without a caller).

### F2 [minor] Over-broad mount barrel — `render-mount/src/index.ts:13`
`index.ts` re-exports `fitBoundsRect`, `applyFitBounds`, `FitOptions`, `ViewportLike` as public API. These are **live internally** (mount.ts:164,170 via `dispatchFitBounds`/`applyFitBounds`) and exercised by `gate.test.ts`, so they are NOT dead — but no *external* package imports them. The only cross-package surface apps actually use is `Canvas.svelte` + `createMount` (indirectly) + `MarkerStyle`/`FitOptions` types via the svelte adapter.
**Remedy:** narrow the public barrel to what crosses the package boundary (`createMount`, `MountOptions`, `MountSurface`, `FitOptions`, the marker/draw types). Keep `fitBoundsRect`/`applyFitBounds`/`ViewportLike` as internal module exports for the gate test (test imports the module path directly), not as package-public API. This is a boundary-cleanliness nit (Std-5/Std-6), not a behavior change.

### F3 [minor / accepted-risk] Annotorious internal-store cast — `render-mount/src/mount.ts:83–114`
The degenerate-selector guard reaches `annotator.state.store` through `as unknown as {…}` and monkey-patches `addAnnotation`/`upsertAnnotation`. This is the one place an Annotorious upgrade can silently break the guard; the `else` branch logs `console.error` (mount.ts:111) when the internal shape is gone.
**Assessment:** documented (carried verbatim from anvil viewer.ts:123-157, cited in-comment), single-sourced, and fenced behind a runtime presence check with a loud-on-failure path. The `console.error` at :111 was flagged by a prior scan — it is **not** a structural hazard: it is the correct degraded-mode signal for a missing private API, and the guard failing open (annotations still render, just unfiltered) is the safe direction. **Do not block.** The real mitigation already exists: `markerScreenRect` (mount.ts:182-199) was deliberately moved OFF the internal store onto the *public* `getAnnotations()` + core geometry because "that store lookup proved fragile" (its own comment) — the architecture is already migrating away from the cast. Leave as accepted risk; revisit only on an Annotorious major bump.

### F4 [minor] `sanitize.ts` is framework-agnostic logic living in the "thin adapter" — `render-svelte/src/sanitize.ts`
`sanitizeHtml` / `renderMarkdown` / `stripMarkdown` are pure TS with no Svelte dependency, sitting in the package ADR-0002 budgets as the *logic-leak detector* (<500 LOC). Strictly, framework-neutral logic belongs in `@render/core` (Std-6, "keep logic in the canonical layer").
**Assessment:** genuinely a mild ADR-0002 tension, but **every consumer is Svelte** (Reader, NarrativeReader, NoteLightbox, App — all `.svelte`; verified by grep). The seam discriminator says there is no second (non-Svelte) consumer that would justify hoisting it to core, and `isomorphic-dompurify`/`snarkdown` are display-time deps the pure-TS core has no other reason to pull in. Keep it here for now; if a non-Svelte surface ever needs body sanitization, *that* is the trigger to hoist to core. Flagging so synthesis is aware it's display logic in an adapter, not a regression to fix today. `sanitize.ts` itself is **correct and safe** — markdown is rendered `snarkdown → sanitizeHtml` (never raw), DOMPurify uses the `html` profile, and `stripMarkdown` is plain-text-only (used inside `<button>`, no HTML reaches the DOM). No XSS hole.

### F5 [minor / doc-drift] ADR-0002 names a Wavesurfer mount that does not exist in `render-mount`
ADR-0002 describes `@render/mount` as "wiring OpenSeadragon + Annotorious headless core **+ Wavesurfer**." The package contains only the OSD/Annotorious image mount — no audio/AV mount file exists (`find packages/render-mount/src` = 4 source files, all image-path). `subsystems.md` §2 likewise describes only the image stack.
**Assessment:** this is the brief's "code has drifted from an ADR" case — but it's a *not-yet-built* drift (AV is plausibly post-v1), not a contradiction. **Remedy:** add a one-line note to ADR-0002 or subsystems.md that the Wavesurfer/AV mount is deferred, so a cold reader doesn't hunt for a missing file. Documentation finding, not a code finding.

---

## 4. What earns its keep (deletion-test PASSES — do not re-litigate)

- **`render-mount` as a package.** Delete it → 220 lines of OSD config, the inverted listener-set reactivity, the degenerate-selector store guard, `markerScreenRect` viewport math, and fit dispatch all reappear — *inside the Svelte adapter*, destroying the framework-free / node-importable boundary ADR-0002 declares **non-reversible**. Deep module: large behavior behind the small `MountSurface` interface. Keep.
- **`render-svelte` as a package.** `Canvas.svelte` has 4 consumers (Reader, NarrativeReader, App, ExhibitView); `sanitize` exports have 4+. A Svelte component cannot live in pure-TS core. Real seam, real module. Keep.
- **`controller.ts` (`createCanvasController`).** This is exactly the abstraction the task asked me to scrutinize for thin-on-thin. It is **plain TS specifically so the select/fitBounds coordination + selection-loop-prevention is testable headless** — Canvas.svelte is explicitly NOT in the tsc/test gate (Canvas.svelte:3). Delete it and that logic reappears in an untestable `.svelte` file. ADR-0002 "logic not components." Deep. Keep.
- **`surface.ts`.** A type-only contract file (the `MountSurface` interface + id/style types), declared separately to break a circular import (its own comment). Not a wrapper layer — a published interface. Keep.
- **`fitbounds.ts` pure oracle.** `fitBoundsRect`/`applyFitBounds`/`dispatchFitBounds` are the de-duplicated polygon→bbox + sidebar-reservation math, kept pure as the Phase-1 acceptance ORACLE (mockable viewport, no live OSD needed). The mount → surface → controller chain is NOT thin-on-thin: each layer adds distinct behavior (OSD wiring / typed contract / testable selection logic). Keep.

---

## 5. Cross-subsystem hooks (for synthesis)

- **render-core dependency (expected, healthy).** Both packages consume core's pure geometry/IIIF (`selectorBBox`, `isDegenerateSelectorValue`, `resolveTileSource`, `W3CSelector`/`Box` types). This is the documented dependency direction (core → mount → svelte). `boundsForSelector` (F1) is a *redundant* re-export of core's `selectorBBox` — synthesis should confirm core is the single source for selector→bbox and the dead re-export is dropped.
- **sanitize.ts vs core (F4).** Body sanitization is display logic currently in the svelte adapter. If render-core or any non-Svelte subsystem (e.g. publish-side preview) ever needs it, synthesis should route the hoist-to-core decision then — not now.
- **MarkerStyle type re-export.** `render-svelte/index.ts:14` re-exports `MarkerStyle` from `@render/mount` so the viewer needn't depend on mount directly (verified: `ExhibitView.svelte`, `Reader.svelte` import it from `@render/svelte`). This is an intentional, load-bearing barrel — keep it; it is the adapter shielding apps from the mount layer. Contrast with F1's dead constants.
- **No logic leak into apps.** Apps import `Canvas.svelte` + the three sanitize helpers + types only — no app reaches into `@render/mount` internals. The adapter boundary holds.

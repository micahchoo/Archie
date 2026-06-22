# Phase 0 — Keystone: the read-only DOM-SVG overlay mount (leaf-task plan)

**Status:** decomposed 2026-06-21 (strategy-doc §"Mechanical execution system" / Decomposer step).
**Phase boundary (from `EMBED-VIEWER-IMPLEMENTATION-STRATEGY.md` §Phase 0):** a standalone harness page
mounts the read-only path over a fixture exhibit with NO `@annotorious/*`/`pixi` in the bundle and NO
`unsafe-eval` in its CSP. Build items **1.1–1.7, 5.2**.

This plan is the ordered DAG of **leaf tasks** the Executor runs. Each task's acceptance test is written
**FIRST** (test-first discipline — write the test, watch it fail, make it pass). Tests run **per-package**:
`cd packages/render-mount && pnpm exec vitest run` (the ROOT vitest binary fails rune tests — `MEMORY.md`).
Do **not** `git commit`. Stay strictly inside each task's `write-targets`.

---

## Design facts this plan rests on (donor-grounded, not invented)

- **The overlay donor** is `packages/render-mount/src/frame-overlay.ts` — the `createElementNS` +
  `viewer.addOverlay({ element, location })` pattern, the `FrameViewerLike` minimal-surface interface
  (decoupled from the full OSD type so it tests under happy-dom), and the closure-held element with
  draw/clear semantics. Phase 0 generalizes this from one whole-object border to per-annotation region
  shapes. (ADR-0019 §Decision names it the donor explicitly.)
- **The geometry is already pure** in `packages/render-core/src/geometry/selector.ts`, re-exported via
  `@render/core` (`packages/render-core/src/index.ts:55`): `parseFragmentXYWH` (xywh Fragment → `Box`),
  `parsePolygonPoints` (SvgSelector → `Point[]`, returns `null` on NaN/empty), `polygonBBox`,
  `selectorOf` (annotation → `W3CSelector | null`), `selectorBBox`. **Selector values reach geometry
  parsers ONLY** — never `innerHTML`/`DOMParser` (ADR-0019 §Consequences security bullet; the standing
  5.2 assertion).
- **The editor mount stays untouched.** `packages/render-mount/src/mount.ts:74` `createMount` wires
  `createOSDAnnotator` and is consumed by `packages/render-svelte/src/Canvas.svelte:122` (Studio's editor,
  via `onCreate/onUpdate/onDelete/setDrawingEnabled`). Phase 0 adds a **separate** `createReadOnlyMount`
  factory + `ReadOnlyOverlay` module; it must NOT modify `createMount`'s annotator path (ADR-0019
  §Consequences "Annotorious stays in Studio … WITHOUT regressing the editor mount").
- **Test idiom** (donor `frame-overlay.test.ts`): happy-dom gives real `createElementNS`; a hand-built
  fake viewer satisfying the minimal `*ViewerLike` interface captures `overlays`/`removed`/`openHandlers`
  + a fake `viewport`. No live OSD is constructed (memory: leave real-render visuals to the human).
- **The bundle gate** uses the existing `scripts/bundle-size.mjs` (`measureStdin` / `measureEntry`,
  esbuild `external`, gz via `gzipSync`) — extend it, don't invent a measurement harness.

---

## Ordering (the DAG)

```
P0-1 (overlay-geometry corpus) ─┬─► P0-2 (ReadOnlyOverlay draw) ─┬─► P0-4 (createReadOnlyMount factory)
P0-1 ───────────────────────────┘                               │
P0-2 ──► P0-3 (hit-test → onSelect)  ───────────────────────────┤
P0-2 ──► P0-6 (a11y marker-label)                               │
P0-4 ──► P0-5 (fitBounds-on-select reuse)                       │
P0-2 ──► P0-7 (SVG-never-innerHTML standing assertion, 5.2)     │
P0-4 ──► P0-8 (index exports)  ◄────────────────────────────────┘
P0-8 ──► P0-9 (Studio non-regression gate)
P0-8 ──► P0-10 (bundle-size + no-unsafe-eval measurement gate)
```

Parallel-wave hint (disjoint write-targets): **Wave A** = P0-1. **Wave B** = P0-2. **Wave C** = P0-3,
P0-6, P0-7 (all touch the overlay + its test, so serialize within the file OR keep one executor).
**Wave D** = P0-4, P0-5. **Wave E** = P0-8 → then P0-9, P0-10 in parallel.

---

## Leaf tasks

### TASK P0-1 — selector → overlay-geometry test corpus
- **implements:** strategy 1.1 / ADR-0019 (xywh Fragment + SvgSelector polygon render read-only) / §5.2 security
- **blocked-by:** []
- **donor:** greenfield-per ADR-0019 §Consequences; corpus shape mirrors
  `packages/render-mount/src/fitbounds.test.ts:14-18` (the `rect`/`poly` fixtures) and
  `packages/render-core/src/geometry/selector.ts:19-53` (the parsers under test)
- **write-targets:** `[packages/render-mount/src/read-overlay-geometry.test.ts]`
- **change:** Write ONLY the corpus + a tiny pure helper signature the corpus asserts against:
  `overlayShapeFor(selector: W3CSelector): { kind: "rect"; box: Box } | { kind: "polygon"; points: Point[] } | null`
  (the geometry-only descriptor the SVG layer will draw — NO DOM). Cover: (a) `xywh=pixel:100,50,200,80`
  → `{kind:"rect", box:{x:100,y:50,w:200,h:80}}`; (b) bare `xywh=10,20,30,40`; (c) polygon
  `<svg><polygon points='10,10 110,10 60,90'/></svg>` → `{kind:"polygon", points:[…3 pts…]}`; (d) degenerate
  polygon `points='NaN'` → `null`; (e) empty `points=''` → `null`; (f) a non-rect/non-polygon (ellipse/path)
  selector → `null` (v1 vocab is rect+polygon only, `selector.ts:124`); (g) `selectorOf` of an
  Annotorious array-wrapped target resolves `[0]`. Import `overlayShapeFor` from `./read-overlay.js`
  (does not exist yet — RED).
- **acceptance:** RUN `cd packages/render-mount && pnpm exec vitest run read-overlay-geometry` → MUST FAIL
  with an unresolved import of `./read-overlay.js` (test authored, target absent) — RED is the pass for this task.
- **on-block:** STOP + escalate; do NOT relitigate the descriptor shape.

### TASK P0-2 — `ReadOnlyOverlay` draws region shapes (createElementNS, geometry-only)
- **implements:** strategy 1.1–1.2 / ADR-0019 §Decision (DOM-SVG overlay from render-core selectors, frame-overlay donor)
- **blocked-by:** [P0-1]
- **donor:** `packages/render-mount/src/frame-overlay.ts:32-94` (whole module: `*ViewerLike` interface,
  `createElementNS` rect build, `viewer.addOverlay`, closure-held element, draw/clear,
  `addOnceHandler("open")` queueing). Geometry: `@render/core` `parseFragmentXYWH` / `parsePolygonPoints`
  / `polygonBBox` / `selectorOf`.
- **write-targets:** `[packages/render-mount/src/read-overlay.ts, packages/render-mount/src/read-overlay.test.ts]`
- **change:** Create `read-overlay.ts` exporting (1) `overlayShapeFor` (makes P0-1 GREEN — pure, from the
  parsers; rect→`box`, polygon→`points`, else `null`); (2) `OverlayViewerLike` (donor's `FrameViewerLike`
  shape + a `viewport` with `imageToViewportRectangle(x,y,w,h)` so the overlay anchors a shape to its
  image-space bounds); (3) `createReadOnlyOverlay(viewer): { setAnnotations(anns), setSelected(id|null),
  clear() }`. `setAnnotations` clears prior shapes then, per annotation: `selectorOf` → `overlayShapeFor`;
  skip `null` (LOUD `console.warn` for legacy degenerate, mirroring `mount.ts:261-265`); build an
  `<svg>`/`<rect>` (xywh) or `<svg>`/`<polygon>` (points joined into the `points` ATTRIBUTE via
  `setAttribute` — never `innerHTML`) with `vector-effect="non-scaling-stroke"`, anchor each via
  `viewer.addOverlay({ element, location })` at the shape's bbox. Queue on `addOnceHandler("open")` when
  `world.getItemAt(0)` is absent (donor lines 45-49). Write `read-overlay.test.ts` (happy-dom, fake viewer
  per `frame-overlay.test.ts:10-28`) asserting: 2 annotations → 2 overlays; a rect overlay contains one
  `<rect>` with the right `x/y/width/height`; a polygon overlay contains one `<polygon>` whose `points`
  attribute equals the joined coords; a degenerate annotation is skipped (overlay count excludes it) +
  warns; `clear()` removes all.
- **acceptance:** RUN `cd packages/render-mount && pnpm exec vitest run read-overlay read-overlay-geometry`
  → MUST pass (both the P0-1 corpus and the new draw tests GREEN).
- **on-block:** STOP + escalate; do NOT touch `mount.ts` or the Annotorious path.

### TASK P0-3 — hit-test → `selectionChanged` (onSelect)
- **implements:** strategy 1.3 / ADR-0019 §Consequences ("hit-test for SELECT")
- **blocked-by:** [P0-2]
- **donor:** `frame-overlay.ts:78-82` (a clickable shape → `pointerEvents:"stroke"` + `click` →
  callback); the SELECT contract is `mount.ts:196-199` (`selectionChanged` → first id → listeners) and
  `MountSurface.onSelect` (`surface.ts:69`).
- **write-targets:** `[packages/render-mount/src/read-overlay.ts, packages/render-mount/src/read-overlay.test.ts]`
- **change:** Extend `createReadOnlyOverlay` with an `onSelect(cb: (id|null)=>void)` subscription set and
  per-shape `click` handlers that fire `onSelect(annotationId)`; make each shape the hit target
  (`pointerEvents` on the geometry: `"all"` for filled regions / `"stroke"` for outlines — pick one and
  pin it in the test). A click on empty overlay background fires `onSelect(null)` (deselect). Add tests:
  clicking a rect overlay calls `onSelect` once with that annotation's id; clicking a second selects the
  second; the subscription unsubscribe stops further calls.
- **acceptance:** RUN `cd packages/render-mount && pnpm exec vitest run read-overlay` → MUST pass
  (the new hit-test cases GREEN, existing draw cases still GREEN).
- **on-block:** STOP + escalate.

### TASK P0-4 — `createReadOnlyMount` factory (OSD kept, no annotator)
- **implements:** strategy 1.4–1.5 / ADR-0019 §Decision (OSD stays; `createOSDAnnotator` replaced)
- **blocked-by:** [P0-2, P0-3]
- **donor:** `mount.ts:74-170` (OSD construction: `resolveTileSource`, `tileSources`, `crossOriginPolicy`,
  the `open`/`open-failed` promise, `showNavigationControl:false`) — COPY the OSD-setup half, OMIT
  everything from `createOSDAnnotator` (`mount.ts:172`) onward. `surface.ts` `MountSurface` (the read
  subset: `setAnnotations`, `setSelected`, `fitBounds`, `onSelect`, `destroy`).
- **write-targets:** `[packages/render-mount/src/read-mount.ts, packages/render-mount/src/read-mount.test.ts]`
- **change:** Create `createReadOnlyMount(container, opts): Promise<ReadOnlyMountSurface>` — define a
  `ReadOnlyMountSurface` = the read-only subset of `MountSurface` (`setAnnotations`/`setSelected`/
  `fitBounds`/`onSelect`/`destroy`; NO `setDrawingEnabled`/`onCreate`/`onUpdate`/`onDelete`/draw tools).
  Build OSD exactly as `createMount` does, then instantiate `createReadOnlyOverlay(viewer)` instead of the
  annotator. Wire `setAnnotations` → overlay; `onSelect` → overlay's onSelect; `destroy` → overlay.clear +
  viewer.destroy. Because a live OSD can't run under happy-dom, the TEST injects a fake viewer via a
  seam: factor the overlay-wiring into a pure `wireReadOnlySurface(viewer, overlay)` the test drives
  directly (no OSD), and assert: `setAnnotations` reaches the overlay; `onSelect` round-trips an id;
  `destroy` clears. (Mirrors how `gate.test.ts` mocks the viewport rather than OSD.)
- **acceptance:** RUN `cd packages/render-mount && pnpm exec vitest run read-mount` → MUST pass.
- **on-block:** STOP + escalate; do NOT import `@annotorious/*` in `read-mount.ts`.

### TASK P0-5 — fitBounds-on-select reuses the pure oracle
- **implements:** strategy 1.6 / ADR-0019 §Consequences ("`fitBounds`-on-select, ADR-0006 nav contract") / ADR-0006
- **blocked-by:** [P0-4]
- **donor:** `mount.ts:282-293` (`fitBounds`: `selectorOf` → `dispatchFitBounds(viewport, anns, id, opts)`)
  and `fitbounds.ts` `dispatchFitBounds` / `applyFitBounds` (the pinned oracle, `gate.test.ts`).
- **write-targets:** `[packages/render-mount/src/read-mount.ts, packages/render-mount/src/read-mount.test.ts]`
- **change:** Add `fitBounds(id)` to `ReadOnlyMountSurface`, routing through the SAME
  `dispatchFitBounds(viewport, annotations, id, getFitOptions?.() ?? PLAIN_FIT)` oracle `createMount` uses
  (the gate-pinned rect+polygon→bbox path) — do NOT write a new fit computation. Wire `onSelect` →
  `fitBounds(id)` when an id is selected (select-then-fit, the ADR-0006 nav contract). Test with the
  `gate.test.ts` mock-viewport idiom: selecting the rect annotation pushes the expected rect to
  `viewport.fitBounds`; selecting the polygon annotation pushes its bbox; selecting `null` fits nothing.
- **acceptance:** RUN `cd packages/render-mount && pnpm exec vitest run read-mount` → MUST pass
  (fit-on-select cases GREEN; the asserted rect equals the `gate.test.ts` oracle output for the same selectors).
- **on-block:** STOP + escalate.

### TASK P0-6 — a11y marker-label pass
- **implements:** strategy 1.7 / ADR-0019 §Consequences ("a11y marker-label pass; `Canvas.svelte:82`
  currently leans on Annotorious-emitted DOM")
- **blocked-by:** [P0-2]
- **donor:** greenfield-per ADR-0019 (Annotorious-emitted a11y DOM is gone → the overlay must label its own
  shapes). Label source: the annotation's note title/logicalId via an opts-supplied `labelFor(id)` hook
  (no DOM read).
- **write-targets:** `[packages/render-mount/src/read-overlay.ts, packages/render-mount/src/read-overlay.test.ts]`
- **change:** Give each shape an accessible name: `role="img"` (or `"button"` when clickable) + an
  `aria-label` set from an optional `labelFor(annotationId): string` passed to `createReadOnlyOverlay`
  (fallback label e.g. `"annotation <id>"` when absent). Set via `setAttribute` only. Test: a drawn rect
  carries `role` + the `aria-label` returned by `labelFor`; absent `labelFor` → the fallback label; the
  label text NEVER comes from the selector value.
- **acceptance:** RUN `cd packages/render-mount && pnpm exec vitest run read-overlay` → MUST pass
  (a11y cases GREEN).
- **on-block:** STOP + escalate.

### TASK P0-7 — standing SVG-never-`innerHTML` security assertion (5.2)
- **implements:** strategy 5.2 / ADR-0019 §Consequences security bullet (raw `SvgSelector.value` must never
  reach `innerHTML`/`DOMParser`; "the guardrail is an overlay-leaf acceptance test")
- **blocked-by:** [P0-2]
- **donor:** greenfield-per ADR-0019; the parser `parsePolygonPoints` (`selector.ts:31-40`) is the only
  thing that touches the raw value, and it extracts numbers — proving the data path stays geometry-only.
- **write-targets:** `[packages/render-mount/src/read-overlay-security.test.ts]`
- **change:** Write a STANDING test (lives forever, not a one-shot): feed `createReadOnlyOverlay` an
  annotation whose `SvgSelector.value` carries a hostile payload —
  `<svg><polygon points='10,10 110,10 60,90'/><script>window.__x=1</script><image href='x' onerror='window.__x=1'/></svg>`
  — and assert: (a) no overlay node's `innerHTML` contains `<script` or `onerror`; (b) the drawn
  `<polygon>`'s `points` attribute equals ONLY the parsed numeric coords; (c) `window.__x` is undefined
  (no injected node executed); (d) a spy proving the overlay code path calls neither `Element.innerHTML`
  setter nor `DOMParser` (assert via a happy-dom property spy on `innerHTML`, or grep-style: the produced
  subtree node count equals exactly the geometry nodes built by `createElementNS`).
- **acceptance:** RUN `cd packages/render-mount && pnpm exec vitest run read-overlay-security` → MUST pass
  (hostile value renders as geometry only; nothing executes; no `innerHTML`/`DOMParser` on the path).
- **on-block:** STOP + escalate — a failure here is a Red Line (security exposure), not a test to relax.

### TASK P0-8 — export the read-only path from `@render/mount`
- **implements:** strategy 1.4 / ADR-0019 (the keystone path is consumable by Phase 1's element)
- **blocked-by:** [P0-4]
- **donor:** `packages/render-mount/src/index.ts:1-18` (existing export pattern + `index.test.ts` shape).
- **write-targets:** `[packages/render-mount/src/index.ts, packages/render-mount/src/index.test.ts]`
- **change:** Add named exports `createReadOnlyMount`, type `ReadOnlyMountSurface`, type
  `ReadOnlyMountOptions`, and `createReadOnlyOverlay` from `./read-mount.js` / `./read-overlay.js`. Do NOT
  remove or alter the existing `createMount` export (the editor seam). Extend `index.test.ts` to assert the
  new names are exported and are functions/defined.
- **acceptance:** RUN `cd packages/render-mount && pnpm exec vitest run index` → MUST pass (new exports
  present; `createMount` still exported).
- **on-block:** STOP + escalate.

### TASK P0-9 — Studio editor non-regression gate
- **implements:** ADR-0019 §Consequences ("Annotorious stays in Studio … WITHOUT regressing the editor mount")
- **blocked-by:** [P0-8]
- **donor:** the existing Studio mount path: `packages/render-svelte/src/Canvas.svelte:122` (`createMount`)
  + `controller.test.ts`; the full editor test suite is the oracle.
- **write-targets:** `[]` (verification-only — runs existing suites; NO source edits)
- **change:** Confirm Phase 0 added a *parallel* path and changed nothing on the editor path: run the full
  `render-mount` AND `render-svelte` suites; both must be all-GREEN with zero diffs to
  `render-mount/src/mount.ts`, `render-mount/src/surface.ts`, `render-svelte/src/Canvas.svelte`,
  `render-svelte/src/controller.ts`. (A non-empty `git diff` on those four files is a FAIL.)
- **acceptance:** RUN
  `cd packages/render-mount && pnpm exec vitest run && cd ../render-svelte && pnpm exec vitest run`
  → MUST both report 0 failed; AND `git diff --stat -- packages/render-mount/src/mount.ts
  packages/render-mount/src/surface.ts packages/render-svelte/src/Canvas.svelte
  packages/render-svelte/src/controller.ts` → MUST be EMPTY.
- **on-block:** STOP + escalate — any editor-path regression means Phase 0 violated its boundary.

### TASK P0-10 — bundle-size + no-`unsafe-eval` measurement gate
- **implements:** strategy 9.1 / ADR-0019 §Consequences (drop ~194 KB gz Annotorious+PixiJS; remove
  `script-src 'unsafe-eval'` + `worker-src blob:`; floor ~110–150 KB gz) / phase BOUNDARY
- **blocked-by:** [P0-8]
- **donor:** `scripts/bundle-size.mjs:19-37` (`measureStdin` / `measureEntry`, esbuild `external`,
  `gzipSync`); `.claude/rules/tauri-csp.md` (PixiJS `new Function()` = the sole `unsafe-eval` cause).
- **write-targets:** `[scripts/bundle-size.mjs, packages/render-mount/src/read-mount-no-eval.test.ts]`
- **change:** (a) In `bundle-size.mjs` add a measured row for the **read-only mount entry** — a `measureStdin`
  importing the read-only path (`import { createReadOnlyMount } from "@render/mount/src/read-mount.js"` or
  the index, OSD kept, `@annotorious/*`/`pixi` NOT imported) — so the gz number is recorded next to the
  "OSD + Annotorious" floor for comparison. (b) Add `read-mount-no-eval.test.ts`: a SOURCE-LEVEL assertion
  that the read-only path's import graph (`read-mount.ts`, `read-overlay.ts`) contains NO
  `@annotorious/openseadragon`, `@annotorious/plugin-tools`, or `pixi` import (read the files, assert the
  import statements are absent) — the static proof that the eval-causing dep is gone. (Live strict-CSP
  browser verification of the packaged element is a Phase-1 boundary task, NOT Phase 0 — Phase 0 proves the
  dep is absent at the source/bundle level; note this deferral inline.)
- **acceptance:** RUN
  `cd packages/render-mount && pnpm exec vitest run read-mount-no-eval && node scripts/bundle-size.mjs`
  → MUST: the no-eval test GREEN (no Annotorious/pixi import in the read-only path) AND `bundle-size.mjs`
  print the read-only-mount gz row (a measured number, lower than the OSD+Annotorious floor row).
- **on-block:** STOP + escalate — if the read-only path still pulls Annotorious/pixi, the keystone premise
  (ADR-0019) is unmet; escalate before relaxing.

---

## Phase-close verification (Verifier, not a leaf task)

After P0-10: confirm the green tests are meaningful (not gamed) and the cross-task seams cohere —
`createReadOnlyMount` → `createReadOnlyOverlay` → render-core geometry, with the fitBounds oracle shared
with the editor. Run the **Pre-Ship Gate** 4 Invariables: state lives in the overlay's closure (one
writer); feedback = the LOUD degenerate warns + the standing security/no-eval tests; deleting the read-only
modules leaves `createMount`/Studio intact (P0-9 proves the decoupling); timing = the `addOnceHandler("open")`
queue handles "annotations set before first paint" (donor-proven). **Deferred, named:** the live
strict-CSP host-page browser verification + the two-bundle split land in **Phase 1** (per strategy §Phase 1
boundary); Phase 0's gate is source/bundle-level absence of the eval-causing dep, not a packaged-app CSP run.

# Thermo-Nuclear Review — render-mount

## Verdict

**APPROVE-WITH-NITS** — The package delivers a genuinely deep adapter: it hides all OSD + Annotorious imperative complexity behind a clean, store-agnostic `MountSurface` contract. No structural regressions. Two concrete nits (type unsafety in the style/annotation casts; `drawFrame` inline in mount.ts) and one watch-flag on mount.ts size. The code-judo opportunities are real but optional.

---

## Baseline

| File | LOC | Flag |
|---|---|---|
| `mount.ts` | 370 | Watch (600–999 band: not over the line, but the SVG/frame block inflates it) |
| `fitbounds.ts` | 86 | OK |
| `surface.ts` | 77 | OK |
| `gesture-guard.ts` | 44 | OK |
| `xyz.ts` | 34 | OK |
| `zoom-band.ts` | 13 | OK |
| `index.ts` | 17 | OK |
| **Total (source)** | **641** | OK |

Test files: 5 files, ~230 LOC. Coverage targets the right things: the pure-logic units (GestureGuard, fitBounds, zoomBand, xyzTileSource) are well-tested; `createMount` is integration-tested implicitly at the gate.

No file breaches 1000 lines. `mount.ts` at 370 is the right watch candidate.

---

## The Domino

`mount.ts` is doing two things that are structurally distinct: (1) lifecycle orchestration — viewer init, event wiring, listener dispatch, destroy — and (2) rendering a canvas-wide SVG frame overlay (`drawFrame`/`clearFrame`, ~60 LOC of DOM surgery). The frame renderer is pure DOM with no viewer coupling except `viewer.element.appendChild`; it is extractable without behavioral change and would bring `mount.ts` down ~60 lines, below any watch concern. This is not a blocker, but it is the cleanest deletion target.

---

## Findings

**[Nit] `drawFrame` inline in `mount.ts` conflates two unrelated responsibilities**
— `mount.ts:201–258` — Standard #0 (structural simplification), #2 (spaghetti growth)
— Smell: rendering responsibility embedded in the lifecycle orchestrator. The frame builder has no coupling to OSD internals (it only calls `viewer.element.appendChild` at the end); the rest is pure SVG DOM construction. Extracting to `frame-overlay.ts` (a `drawFrame(container, frame)` function) makes both units independently testable, brings mount.ts to ~310 LOC, and narrows the module's stated concern to "wire OSD + Annotorious, return surface."
— Remedy: extract `drawFrame(container: HTMLElement, frame: FrameOverlay): SVGSVGElement` and `clearFrame(el: SVGSVGElement | null)` to `./frame-overlay.ts`. `mount.ts` reduces to three lines of closure plumbing.

**[Nit] `as never` and `as unknown` casts suppress real type gaps**
— `mount.ts:287` (`annotator.setAnnotations(ok as never, true)`), `mount.ts:293` (`styleFor ? (((ann: { id?: unknown }) => ...) as never) : undefined`), `mount.ts:299` (`viewer.viewport as unknown as ViewportLike`) — Standard #5 (type/boundary cleanliness)
— Smell: `as never` is the nuclear option — it tells the compiler to trust the author completely and abandon inference. In `setAnnotations`, the issue is that Annotorious's type parameter instantiation conflicts with the `W3CAnnotation` cross-package type; this mismatch should be called out at the boundary, not silenced. The `setStyle` cast is similarly a consequence of Annotorious's `DrawingStyleExpression` generic not aligning with `ann.id` access. The `ViewportLike` cast for `viewer.viewport` is acceptable (it IS the defined seam), but `as never` and double-casting elsewhere signal places where the type contract is unverified at the call site.
— Remedy: For `setAnnotations`, define an internal adapter type that maps `W3CAnnotation` to the Annotorious-expected shape explicitly. For `setStyle`, narrow to `(ann: ImageAnnotation) => MarkerStyle | undefined` with a proper cast chain rather than `as never`. Document any remaining `as unknown as X` with a one-line justification comment.

**[Nit] `selectorValue` helper is private but duplicates logic that belongs in `@render/core`**
— `mount.ts:52–55` — Standard #6 (canonical layer leak), #4 (thin-wrapper smell)
— Smell: `selectorValue` extracts `target.selector.value` with an unsafe cast chain. This is structural navigation of a W3C annotation — precisely the kind of thing `@render/core` owns. The function exists because `@render/core`'s `selectorBBox` / `isDegenerateSelectorValue` take a `W3CSelector` rather than a raw annotation. The gap is that render-core doesn't export a `selectorOf(annotation)` helper for the raw annotation → selector extraction step. That leaves mount.ts doing it inline with `as unknown` casts. `fitbounds.ts` defines `selectorOf` (line 65) for the same purpose; mount.ts re-implements it privately.
— Remedy: mount.ts should call `fitbounds.selectorOf` (already exported via the module) instead of the private `selectorValue`. This deletes the duplicate and removes one `as unknown` cast.

**[Watch] `clampToRegion` inline handler — complexity density in an already-dense function**
— `mount.ts:102–116` — Standard #7 (sequential orchestration), #3 (moving pieces)
— Smell: the pan/zoom clamp logic (12 lines of coordinate math) lives inline inside `createMount`, named only by a `const` declaration. It is not wrong, but it is the densest patch of imperative math in the file, has the most potential for subtle bugs (the `1e-9` epsilon, the two-branch settle), and is untested. If a bounds bug appears here, finding it requires first understanding the entire viewer init sequence.
— Not a blocker — behavior is correct and well-commented — but extracting to `clampToViewportBounds(viewport, region)` would make it independently testable.
— Remedy: extract + test in isolation. Low priority.

---

## Code-Judo Opportunities

**1. Unify `markerScreenRect` and `markerScreenRects` via the batch path.**
`markerScreenRect(id)` is now strictly a special case of `markerScreenRects([id])`. Its implementation (`mount.ts:321–331`) repeats the annotation-list scan and offset read that `markerScreenRects` does more efficiently. After `markerScreenRects` landed (worklist 2.1), the single-id variant became a thin wrapper over a suboptimal path. Implementing `markerScreenRect` as `return this.markerScreenRects([id])[id] ?? null` deletes ~10 lines and ensures both paths share the same annotation scan. Deletion test: the single-id variant disappears and reappears in one line — pass.

**2. `subscribe` helper is 5 lines for a pattern that could be inline or a module-level utility.**
`mount.ts:185–190` defines a generic `subscribe<T>(set, cb)` function inside the closure. It's called exactly 4 times (lines 365–368). At 4 call sites the wrapping is worth it, but the helper itself is trivially readable inline (`set.add(cb); return () => set.delete(cb)`). Whether to keep it as a named helper or inline is a style call — not a structural issue — but if mount.ts were ever refactored into a class, this becomes a static method naturally.

**3. The four listener Sets could be a typed event-bus record.**
`selectL / createL / updateL / deleteL` follow an identical pattern. A `type EventBus = { select: Set<...>; create: Set<...>; ... }` with a shared `emit(bus, 'select', id)` helper would reduce the `for (const l of X) l(...)` repetition (currently 4 instances) and make the event contract explicit at one declaration site. Worth considering if a 5th event type is ever added.

---

## Self-Check

**Is the "extract `drawFrame`" proposal premature decomposition?** No — it meets the seam test: two distinct varying things (lifecycle wiring vs. SVG rendering), and the deletion test passes (mount.ts loses ~60 lines of DOM code with no behavioral change; frame-overlay.ts gains a pure, independently testable unit).

**Is the "`as never` is bad" finding overstated?** Partially. The `viewer.viewport as unknown as ViewportLike` cast is justified — `ViewportLike` is the explicit seam type. The `setAnnotations`/`setStyle` casts are genuine gaps: they suppress type errors that reflect a real mismatch between `@render/core`'s `W3CAnnotation` and Annotorious's internal generics. The right fix is a typed adapter shim, not a suppression. Finding stands.

**Is this a SHALLOW adapter (structural regression)?** No. The deletion test is decisive: removing `createMount` and `MountSurface` would require every caller to own: OSD lifecycle, Annotorious init, GestureGuard decisions, degenerate-annotation filtering, coordinate translation, event fan-out, zoom-band stamping, frame overlay, viewport clamping, and XYZ tile source construction. That's a deep adapter doing real work. The interface (`MountSurface`, 12 methods) is proportionate to the complexity hidden, not larger than the implementation.

**Is the "unify markerScreenRect" judo real?** Yes — deletion test passes, and the single-id path is strictly slower (rescans the full annotation list vs. the batch path's single-pass). No behavioral change. Worth doing before the batch path accumulates any further callers.

**Is the `selectorValue` / `selectorOf` duplication a real finding?** Yes — `fitbounds.selectorOf` already exists and is already exported. `mount.ts` re-implements it privately with worse types. This is a standard #6 violation: logic lives in the wrong canonical layer.

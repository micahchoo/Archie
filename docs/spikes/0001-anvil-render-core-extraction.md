# SPIKE 0001 — anvil → `@render/core` extraction cleanliness

**Date:** 2026-05-24
**Decision under test:** "adopt anvil's editor + viewer logic as RUNNING code, not laundered code."
**Risk under test:** anvil's reusable logic is so entangled with Svelte reactivity (stores, `$state`, runes, lifecycle) that "adopt as running code" is far harder than assumed — premise cites "viewer carries 70+ `as any`" and "a semantic Annotorious↔W3C type mismatch."
**Source surveyed:** `anvil/app/src` (logic in `app/src/lib/**`, components in `app/src/{editor,read,embed}/*.svelte`). 75 `.ts` + 28 `.svelte` files.

---

## (a) VERDICT

**"Adopt as running code" is SOUND. No re-scoping needed.** The risk premise is **empirically not supported by anvil's current code.**

Two load-bearing corrections to the premise:

1. **The "70+ `as any`" does not exist.** Whole-tree count (non-test): **3 total** — 2 in `embed/EmbeddedReader.svelte`, 1 in `lib/theme-presets.ts`. The viewer logic file `lib/viewer.ts` has **zero** `as any` and exactly **one** `as unknown as` cast (line 124). The number is stale or was inflated; the type surface is clean.

2. **The Annotorious↔W3C bridge is NOT a semantic mismatch anvil had to hand-roll.** anvil consumes Annotorious's shipped `W3CImageFormat(sourceIRI)` adapter directly (`lib/viewer.ts:106, 273`). There is no custom bridge module to delaminate. The W3C round-trip risk Archie tracks (Ellipse→NaN, Path→curves-stripped) is an *upstream adapter* limitation already mitigated by the v1 rect+polygon-only decision (ADR shape-vocab) and `isDegenerateSelector` (`lib/storage/annotations.ts:19`), not an entanglement cost.

anvil's `lib/**` layer is **already framework-free pure TS**. The Svelte coupling that exists is exactly where Archie's architecture *expects* it: mount lifecycle + selection→viewport wiring, which is the declared job of `@render/mount` (vanilla mount fns) and the thin `@render/svelte` adapter. The codebase has effectively *pre-performed* the core/mount/adapter split that Archie's `@render` 3-layer decision prescribes — the seam already exists, it just isn't packaged.

**Re-scope NOT required.** One module (the OSD+Annotorious mount lifecycle) is NEEDS-DELAMINATION, but mild and anticipated. The rest are CLEAN-LIFT.

---

## (b) Per-module classification

Entanglement markers grepped: `from 'svelte'`, `svelte/store`, `$state/$derived/$effect`, `writable()/readable()`, `.svelte` imports, `as any`, `as unknown as`. (Note: `writable()`/`readable()` hits in `lib/storage/**` are `FileSystemWritableFileStream` methods on the storage seam — **false positives**, not Svelte stores.)

| # | Module | Home file(s) | Svelte imp. | Runes/stores | `as any`/`unknown` | Class | What blocks the lift |
|---|--------|--------------|:-:|:-:|:-:|-------|----------------------|
| 1 | fitBounds / nav wiring | logic: `lib/viewer.ts` (factory exposes `annotator`); calls: `App.svelte:1115`, `embed/EmbeddedReader.svelte:326,440,461,703` | 0 in logic | 0 in logic | 0 | **NEEDS-DELAMINATION (mild)** | The `fitBounds(id)` call is a one-liner on the Annotorious instance, but it's *invoked* from `$effect`/`$state` selection reactivity in `.svelte`; polygon→bbox geometry is computed **inline in a component** (`EmbeddedReader.svelte:292–337`), not in `lib/`. Lift = pull the bbox math into core + expose a `select(id)` mount method; adapter binds it to `selectedId`. |
| 2 | W3CImageAdapter / Annotorious↔W3C bridge | `lib/viewer.ts:106,273` (consumes `W3CImageFormat`); `lib/wadm-types.ts`; `lib/annotation-fields.ts` | 0 | 0 | 1 (`viewer.ts:124` `as unknown as`) | **CLEAN-LIFT** | No custom bridge exists — anvil uses Annotorious's stock `W3CImageFormat`. The single cast reaches Annotorious's internal `state.store` for a degenerate-selector guard; it lifts verbatim (it's a defensive shim, not entanglement). `wadm-types.ts` is 29 lines, pure. |
| 3 | OPFS / filesystem persistence | `lib/storage/backends/{types,fsa,test}.ts`, `lib/storage/{core,images,annotations,narrative,config}.ts`, `lib/handles-db.ts` | 0 | 0 (the `writable()` hits are FS-API false positives) | 0 | **CLEAN-LIFT** | Nothing. Already a clean seam: `StorageBackend`/`StorageDirectory`/`StorageFile`/`StorageWritable` interfaces (`backends/types.ts`) with FSA + Test backends behind them. This **is** Archie's "Filesystem seam" — copies out as-is. |
| 4 | URL ↔ selector serialization | `lib/share-url.ts`, `lib/anvil-uri.ts` | 0 | 0 | 0 | **CLEAN-LIFT** | Nothing. `encode/decodeContentState`, `buildShareUrl`, `parse/buildAnvilUri` are pure string functions; URN/hash types are branded (`Brand<string,…>`, ADR-0029). |
| 5 | Geometry / hit-testing / selector parsing | `lib/storage/annotations.ts` (`isDegenerateSelector`), `lib/annotation-fields.ts` (`shapeLabel`, `matchesFilter`) | 0 | 0 | 0 | **CLEAN-LIFT** ¹ | Pure selector parsing lifts cleanly. ¹ Caveat: the **polygon→bbox** computation (the piece `fitBounds` needs) currently lives inline in `EmbeddedReader.svelte:292–337`, not in `lib/` — it must be *written into* core during the lift (small, ~30 LOC). Counted under module 1's delamination. |
| 6 | Annotation data model / WADM types | `lib/wadm-types.ts`, `lib/anvil-uri.ts` (branded URNs), `lib/annotation-fields.ts` | 0 | 0 | 0 | **CLEAN-LIFT** | Nothing. WADM types re-export the upstream `W3CImageAnnotation` + thin local `W3CBody`/selector helpers. Branded types (ADR-0029) are pure type-level. |

**Incidental (not in the 6-module lift surface):** `lib/undo.svelte.ts` (54 LOC, uses `$state` by design — a Svelte-5 rune module on purpose). It is the undo *store*, not core logic; it belongs to the adapter/mount layer, not `@render/core`. Call it out so it isn't mistaken for entangled core.

---

## (c) Single riskiest delamination

**The OSD + Annotorious mount lifecycle in `lib/viewer.ts` + its selection-reactivity consumers in `.svelte`.**

Why it's the riskiest (and still only "mild"):
- `lib/viewer.ts` is pure-import-clean, but it is a **stateful factory** holding live OSD + Annotorious instances. The *imperative* surface (`fitBounds`, `setDrawingTool`, `setSelected`, `destroy`) lifts directly into `@render/mount`. The risk is the **inverse direction**: anvil drives that surface from Svelte `$effect`/`$state` (e.g. `App.svelte:308 $effect` on `selectedId`). Those effects must be re-expressed as imperative mount-method calls + an event callback (`onSelect`) so the adapter — not core — owns reactivity.
- The polygon→bbox math needed by `fitBounds` is **stranded in a component** (`EmbeddedReader.svelte:292–337`) and duplicated in two places. The lift must hoist it into core, and the two call sites diverge slightly (one expands bounds for sidebar offset) — reconcile before lifting or the duplication migrates.
- The `viewer.ts:124 as unknown as` cast depends on Annotorious's **undocumented internal `state.store`** shape; it's guarded with a console-warn fallback (`:155`) but is the one place a future Annotorious upgrade can silently break the degenerate-selector guard. Carry the warning into core verbatim.

This is precisely the boundary Archie's `@render/mount` + `@render/svelte` split is designed to absorb — it is the *expected* cost, not a re-scope trigger.

---

## (d) Effort signal

| Module | Effort | Note |
|--------|--------|------|
| 3 OPFS/storage seam | **Days** | Already seam-shaped; mostly a package move + import rewrite. |
| 4 URL↔selector | **Days** (≈1) | Pure functions, no deps beyond branded types. |
| 6 WADM model | **Days** (≈1) | 29-line type module + helpers. |
| 5 Geometry/selector parse | **Days** | Pure; +~30 LOC to hoist bbox out of the component. |
| 2 W3C bridge | **Days** | No bridge to build — consume stock adapter; carry the one cast. |
| 1 fitBounds / mount lifecycle | **~1 week** | The only real engineering: invert reactivity (effects → imperative mount API + callbacks), de-dup bbox, package OSD+Annotorious mount. |

**Whole `@render/core` + `@render/mount` extraction from anvil: low single-digit weeks, dominated by module 1.** No module is "extract ≈ rewrite." Zero modules classified SVELTE-ENTANGLED.

---

## Evidence appendix (file:line)

- `as any` whole-tree (non-test): `embed/EmbeddedReader.svelte` (×2), `lib/theme-presets.ts` (×1). **viewer.ts: 0.**
- `as unknown as` in viewer logic: `lib/viewer.ts:124` (Annotorious internal-store reach for degenerate guard; fallback warn `:155`).
- Stock W3C adapter consumed: `lib/viewer.ts:106` and `:273` — `adapter: W3CImageFormat(sourceIRI)`.
- `lib/viewer.ts` imports: `openseadragon`, `@annotorious/openseadragon`, `@annotorious/plugin-tools` — **no svelte import.**
- fitBounds call sites: `App.svelte:1115`; `embed/EmbeddedReader.svelte:326,440,461,703`.
- Polygon→bbox computed inline in component: `embed/EmbeddedReader.svelte:292–337` (`viewport.imageToViewportRectangle` / `fitBounds(rect,false)`).
- Selection reactivity driving the mount: `App.svelte:69–75` (`$state` for `viewer`, `selectedId`, `annotations`), `App.svelte:308 $effect`.
- Storage seam (pure interfaces): `lib/storage/backends/types.ts:9` `StorageBackend`, `:13` `StorageDirectory`, `:20` `StorageFile`, `:28` `StorageWritable`; backends `FsaBackend`, `TestBackend` (`storage/index.ts:71–72`).
- `writable()`/`readable()` = FS API, NOT Svelte: `lib/storage/backends/fsa.ts:30,34`; `lib/storage/{annotations,core,images}.ts`.
- Pure URL/URN: `lib/share-url.ts:35,62,94`; `lib/anvil-uri.ts:42,51,124` (branded types `:17–25`).
- Pure selector/geometry: `lib/storage/annotations.ts:19` `isDegenerateSelector`; `lib/annotation-fields.ts:67` `shapeLabel`, `:96` `matchesFilter`.
- WADM: `lib/wadm-types.ts` (29 LOC, re-exports `W3CImageAnnotation`, local `W3CBody`, `selectorShapeLabel`).
- Incidental rune module (not core): `lib/undo.svelte.ts` (`$state`, by design).

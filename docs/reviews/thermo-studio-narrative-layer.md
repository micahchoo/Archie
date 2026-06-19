# Thermo-Nuclear Review — STUDIO subsystem (narrative-as-additive-layer, Phase 1)

Branch: `feat/narrative-as-additive-layer` (uncommitted vs `main`). Scope: `apps/studio/*`
narrative-layer changes + the `layout.ts` keystone they depend on. Reviewed against ADR-0016.

## 1. Verdict

**Pragmatic Partial.** The keystone is honored where it matters most — `resolveLayout`
(`layout.ts:18-20`) now unconditionally derives and the `exhibit.layout ??` override is gone; the
LayoutPicker and every trigger/handler are fully removed with no dangling references; the
NarrativeEditor is ungated; routing predicates are sections-/object-count-based; the rewritten
`layout.test.ts` genuinely asserts the new contract (not gamed). Two issues hold it back from Full
Coherence: (a) **App.svelte:441-442 reintroduces a byte-for-byte DUPLICATE of the canonical
derivation** — the exact drift hazard ADR-0016 rejected alternative (a) names ("two sources of truth
free to disagree"); (b) the deprecated `layout` field is annotated inconsistently across the model
pass-throughs, and the diff *edited a dead duplicate `ExhibitMeta` block* in `store.ts`. Neither
breaks Phase-1 behavior (build + 559 core + 103 studio tests green), so this is shippable with a
tightening pass, not a hold.

## 2. The Domino

**Replace the inline `currentLayout` derivation in `App.svelte:441-442` with a call to the canonical
`resolveLayout` from `@render/core`.** This single change (i) makes finding #1 disappear by enforcing
the ADR's literal keystone ("`resolveLayout` becomes the single source of truth"), and (ii)
neutralizes the drift class entirely — any future evolution of the derivation (e.g. a v1.1 `compare`
arrangement) propagates to the Studio's overview intent line for free instead of silently desyncing.
It is the one restructuring that converts "two derivations that happen to agree today" into "one
derivation, consumed twice."

## 3. Findings

### [major] App.svelte:441-442 — duplicate derivation mirrors `resolveLayout`, can drift
```
const currentLayout = $derived<LayoutType>(
  (currentExhibit?.sections?.length ?? 0) > 0 ? "narrative" : (currentExhibit?.objects.length ?? 0) > 1 ? "grid" : "single",
);
```
This is the same expression as `resolveLayout` (`layout.ts:18-19`), re-implemented inline. ADR-0016
Consequences: *"`resolveLayout` becomes the single source of truth."* Rejected-alternative (a) is
rejected precisely because it "leaves two sources of truth … free to disagree." The diff removed the
*stored* second source (`exhibit.layout`) but introduced a *computed* second source in its place. It
agrees with the canonical function today only by coincidence of identical hand-copied logic; the next
edit to the discriminant (a new arrangement threshold, a tie-break rule) will desync the Studio
overview's intent line from the published leading surface, with no test guarding the equivalence.

`currentLayout` has exactly one live consumer: `layout={currentLayout}` → `ExhibitOverview`
(`App.svelte:882`), used only to index `LAYOUT_INTENT` display copy. `currentExhibit`
(`App.svelte:67`) is structurally compatible with `resolveLayout`'s `Exhibit` param for the fields it
reads (`objects.length`, `sections.length`).

**Remedy:** `const currentLayout = $derived(resolveLayout(currentExhibit).type)` with
`import { resolveLayout } from "@render/core"`. If a strict structural-type gap surfaces
(`WorkingObjectMeta` vs `AObject`), pass `resolveLayout(currentExhibit as unknown as Exhibit)` or add
a 1-line `Pick<Exhibit,"objects"|"sections">` adapter — but a `$derived` wrapper is the boring,
correct shape. The handful of `?? 0` guards become unnecessary (resolveLayout takes a non-null
`Exhibit`; gate on `currentExhibit` once, fall back to `"single"`/`"grid"` for the null case).

### [minor] store.ts:77-97 — diff edited a PRE-EXISTING dead duplicate `ExhibitMeta` block
`store.ts` both **re-exports** `WorkingExhibitMeta as ExhibitMeta` (`:18`) and **locally redeclares**
`export interface ExhibitMeta` (`:77`) — along with `ObjectMeta`, `ObjectProvenance`, `LibraryMeta`,
the same way. This is `TS2484` (export-declaration conflicts with exported declaration; reproduced
with `tsc --noEmit` on a 3-line repro). It survives only because the Studio build is `vite build`
(esbuild transpile-only) + `vitest` — **there is no type-check script** (`apps/studio/package.json`
has no `check`/`tsc`/`svelte-check`), so the duplicate-identifier error is never surfaced. The local
block is dead: App.svelte's `type ExhibitMeta` import resolves through the module, and the re-export
is the intended live shape (the comment at `:14` says "Re-exported under their original Studio names").

**This block is pre-existing on `main`** (verified: `git show main:apps/studio/src/store.ts` has the
identical structure). Attribution: NOT introduced by this diff. **But this diff *touched* it** —
adding `import … type LayoutType` (`:10`) and rewriting `layout?: "single"|"grid"|"narrative"` →
`layout?: LayoutType` with a deprecation JSDoc (`:83-87`). That is effort spent maintaining a phantom
type that the compiler would reject if it were ever checked, and it makes the dead block *look* more
authoritative than the re-export. The narrative-layer change to the *real* shape lives in
`working.ts:81` (see cross-subsystem hooks).

**Remedy (out of strict scope, but cheap and on-point):** delete the local
`ExhibitMeta`/`ObjectMeta`/`ObjectProvenance`/`LibraryMeta` interfaces (`store.ts:48-97`) entirely —
the re-export at `:15-20` is the source of truth. Revert the `LayoutType` import (`:10`) added solely
to feed the dead block. If full deletion is deferred, at minimum do not invest in the dead copy.
Separately: the absence of a Studio type-check is the root cause that let this rot — a `"check":
"svelte-check"` script would have flagged TS2484 long ago. Flag for a follow-up seed.

### [nit] layout.ts:1-5 / layout.test.ts:5-8 — comment cites superseded CONTEXT §
Both refreshed headers still open with "CONTEXT §Layout v1: Single + Grid + Narrative" before adding
the ADR-0016 clause. ADR-0016 marks CONTEXT §105 ("Layout v1 set") **SUPERSEDED** — there is no
author-facing layout *set* anymore. The union `single|grid|narrative` survives as the *resolved
descriptor* type (correct, unchanged), but leading the comment with the retired "set" framing is the
exact stale-prose the ADR warns against. Tighten to "the resolved LayoutType descriptor (ADR-0016)".

## 4. What earns its keep

- **`resolveLayout` (`layout.ts:16-25`)** — deep: one small interface (`Exhibit → LayoutDescriptor`)
  behind the content discriminant + the `sections`-on-narrative shaping. The keystone; leave it.
- **`LayoutType` union (`model.ts:34`) kept at 3 values** — correct per ADR-0016: it is now the
  *resolved descriptor* type, not an author-facing set. Narrowing it would break the exhaustive
  `LAYOUT_INTENT` Record and `readingFamily`. Deletion test: removing `single`/`narrative` makes the
  descriptor un-representable → keep all three.
- **`LAYOUT_INTENT` Record (`ExhibitOverview.svelte:60-64`)** — total over the unchanged union; the
  `single` key stays live for exhaustiveness even though `hasOverview` (`App.svelte:452`) means the
  overview never actually receives `"single"` (1-object exhibits skip the overview). Coherent, not
  dead. `LAYOUT_NAME` (the picker-stance chip) correctly removed; `LayoutType` import still used.
- **`ExhibitMeta.layout?` / `Exhibit.layout?` kept OPTIONAL + `@deprecated`** — correct
  read-tolerance per ADR-0016 ("legacy stored data harmless and IGNORED"). resolveLayout never reads
  it; no read path re-introduced. Removing it now would break load of pre-existing stored exhibits.
- **`hasOverview` / `openExhibit` routing now pure object-count (`App.svelte:185,452`)** — correctly
  drops the "OR narrative" clause per ADR-0016 ("§56: sections authored in the object editor, not the
  lay-it-out screen"). The two predicates are kept in sync by comment contract; both reduced to the
  same `objects.length !== 1` expression, so they cannot diverge as written. Good.
- **seed-data: `layout` dropped from all `DEFAULT_EXHIBITS`, `seedVersion` NOT bumped** — correct.
  The reconcile keys on `seedVersion` per *content* changes; dropping a field that resolveLayout
  re-derives identically is behavior-preserving (rosettes: 1 obj→single; voynich: >1 obj→grid;
  voynich-reading: sections→narrative — all match their old explicit values). No reseed needed.
- **NarrativeEditor always-mounted (`App.svelte:995-1007`)** — the `{#if currentLayout==='narrative'}`
  gate removed exactly as ADR-0016 specifies ("ungate … always present … mirrors ReadingsRail").

## 5. Cross-subsystem hooks

- **render-core `working.ts:81` — the REAL persisted `layout?: LayoutType` was NOT deprecation-marked.**
  The diff added `@deprecated (ADR-0016)` JSDoc to `Exhibit.layout` (`model.ts:153`) and to the
  *dead* `store.ts:83` block, but `WorkingExhibitMeta.layout` (`working.ts:81`) — the shape Studio
  actually persists and re-exports as `ExhibitMeta` — kept its bare `layout?: LayoutType;` with no
  deprecation notice. For coherence the deprecation annotation belongs on `working.ts:81` (the live
  field) most of all. **This file is render-core's, not Studio's — flagging for synthesis to route to
  the render-core reviewer.** No behavioral impact (still ignored by resolveLayout), purely a
  doc-coherence gap on the canonical persisted type.
- **The Studio has no type-check gate** (`apps/studio/package.json` — `build`=vite, no
  `svelte-check`/`tsc`). This is why the `TS2484` duplicate-`ExhibitMeta` rot (finding #2) is
  invisible. A cross-cutting QA-architecture concern, not narrative-specific; worth a seed regardless
  of this diff.
- **`seed-data.ts` BASE → `WORKING_IRI_BASE`** (`seed-data.ts:21`, importing from render-core via the
  `publish/working.js` barrel `index.ts:22`) is an *adjacent* fix bundled into this diff (IRI-base
  drift between Studio writer and live reader), not a narrative-layer change. Out of scope here but
  noted so synthesis doesn't double-count it as narrative work; it is correct and barrel-exported.

# Thermo-Nuclear Review — apps/viewer

## Verdict

**STRUCTURAL-CONCERNS** — No single blocker, but two structural regressions together warrant the designation: (1) `sample-data.ts` and `voynich.ts`/`atlas.ts` are fixture-content modules that have hardcoded demo data coupled to the viewer's build and boot paths, blurring the boundary between "generic reader" and "demo exhibit"; (2) the three per-exhibit static Astro pages (`voynich.astro`, `voynich-rosettes.astro`, `voynich-reading.astro`) are near-identical boilerplate shells duplicating 35–38 lines of HTML/meta each, which will rot on every SEO/OG change. Neither alone is a blocker; together they establish a pattern of concrete contaminating generic.

---

## Baseline

**Size:** 3,236 LOC across 29 source files (excl. tests). No file crosses 300 LOC. No threshold violations (≥1000 blocker, 600–999 watch). All clear on the quantitative standard.

**Architecture:** The viewer is a three-tier SPA:
- `published.ts` (248 LOC) — the entire data layer: three read modes (hosted HTTP, portable zip, live OPFS) unified behind `loadGallery`/`loadPublishedExhibit`. The `liveFs`/`portableFs`/`liveSlugs` module-level state machines are tested, documented, and well-bounded.
- `ViewerShell.svelte` (285 LOC) — client router: hash → gallery/exhibit/empty-hall, boot sequence, carousel lift-up to top bar.
- Layout orchestrator chain: `ExhibitView` → dispatches to `Reader` | `NarrativeReader` | `MediaPlayer` | `ObjectGrid` based on `resolveLayout` (from render-core).
- Leaf components: `Gallery`, `NoteLightbox`, `NoteMedia`, `ReadingLegend`, `Credit`, `EmptyHall` — all appropriately small (56–116 LOC).

**Live-vs-Published path:** Cleanly unified. All three modes (hosted, portable, live) converge on `loadPortableExhibit` or `readExhibitTree` behind `loadPublishedExhibit`. `ViewerShell` and `ExhibitView` are mode-agnostic — they never branch on mode. The live-source implementation (OPFS probe → `publishLibrary` → `MemoryFilesystem`) is the right abstraction: live is "portable mode over an in-memory projection." The `mergeGalleries` pure function keeps the live-over-hosted merge testable in isolation. The published.test.ts covers the seam well.

**Reading system (ADR-0007):** The `overlay` + `activeReading` state flows cleanly from `ExhibitView` (owns the state) down through `Reader` / `NarrativeReader` via props. `ReadingLegend` is correctly stateless. No ad-hoc conditionals on reading IDs anywhere in components.

**Component family (Reader / NarrativeReader / MediaPlayer):** These are structurally distinct, not duplicated. Reader is spatial (OSD canvas + note list/detail), NarrativeReader is section-led spatial (prose drives camera), MediaPlayer is temporal (time-indexed transcript). They share: the `Credit` component, the `NoteLightbox`/`NoteMedia` subcomponents, and the `ReadingLegend`. Shared leaf components are the right seam; the three main readers are genuinely different enough to remain separate.

**Type discipline:** Generally clean. `PublishedExhibit = PortableExhibit` (one canonical type, no drift). `RightsFields` passed explicitly. `W3CAnnotation`, `W3CSelector` used directly. One cast noted below.

---

## The Domino

**`sample-data.ts` + `voynich.ts` + `atlas.ts` are authored fixture content coupled into the viewer's build pipeline** — if you deleted them and replaced them with a generic `loadWorkingLibrary`-based dev fixture or pointed the viewer at a real working store, the entire 556 LOC of demo-data scaffolding vanishes from the app bundle, and `ExhibitView`/`ViewerShell` require zero changes. The domino eliminates Finding 2 (static exhibit page boilerplate) as a side effect, because those pages exist only to serve the demo exhibits by slug. This is not a criticism of the demo content itself — it is correct to have Voynich and atlas as the sample exhibits — but the coupling mechanism (hardcoded in the viewer's TypeScript, baked into its build, consumed via `published.ts`'s `initLiveSource` path) makes the viewer look like a Voynich reader with a plugin slot rather than a generic reader with a demo.

---

## Findings (prioritized)

### **[HIGH] Demo fixtures baked into the viewer's module graph and three-mode boot**
`sample-data.ts:1–172`, `voynich.ts:1–215`, `atlas.ts:1–110` — Standard #6 (logic in wrong layer) + Standard #2 (spaghetti growth)

`sample-data.ts` builds and exports a `Library` and `getLog`, which `published.ts` uses via the `gen-published.mts` build script (`vite-node scripts/gen-published.mts`). This is a build-time coupling: the viewer's npm scripts (`predev`, `prebuild`) run the gen script, which imports `sample-data.ts`, which imports `voynich.ts` and `atlas.ts`. This is "exhibit authoring in the viewer's TypeScript" — the appropriate home is either a fixtures package, the Studio's working store (the canonical author path), or a separate seed generation tool decoupled from the viewer.

The immediate consequence: any change to exhibit content (prose, reading colours, IIIF image IDs) requires touching viewer source files, triggering a viewer rebuild, and regenerating the published tree. The deeper structural issue: the distinction between "viewer (generic reader)" and "demo content (specific exhibits)" is dissolved at the module level, not just at the page level.

**Deletion test:** Delete `sample-data.ts`, `voynich.ts`, `atlas.ts`. The viewer's `src/` loses 556 LOC. `published.ts` is unchanged (it does not import these). `ExhibitView`/`ViewerShell` are unchanged. The build fails only in `scripts/gen-published.mts` and the static Astro exhibit pages. This confirms the demo content is SHALLOW to the reader — it reappears only at the build periphery, not in the read path.

**Remedy:** Move `voynich.ts`, `atlas.ts`, `sample-data.ts` to a `packages/demo-content` (or `apps/viewer/fixtures/`) layer that is a build-time-only dev dependency, not part of the viewer's runtime module graph. Or: author the demo exhibits in the Studio working store and treat `gen-published.mts` as a "seed the OPFS from the Studio" step, keeping the viewer's `src/` entirely generic.

---

### **[HIGH] Three near-identical Astro per-exhibit pages — hardcoded slug duplication**
`pages/voynich.astro`, `pages/voynich-rosettes.astro`, `pages/voynich-reading.astro` — Standard #2 (spaghetti growth) + Standard #0 (structural simplification opportunity)

Each page is 39–40 lines of near-identical HTML boilerplate (head, OG tags, JSON-LD, `ExhibitView client:only slug="…"`), differing only in slug, title, description, OG type, and schema.org type. These pages exist because Astro needs a static entry point per per-note anchor (the published model: static per-exhibit HTML with per-note anchors). But the boilerplate repetition means every future OG tag change, JSON-LD schema change, or font change must be applied to four files (`voynich.astro`, `voynich-reading.astro`, `voynich-rosettes.astro`, `language-atlas.astro`) and `index.astro`.

**Remedy:** Astro supports dynamic routes (`src/pages/[slug].astro`) with `getStaticPaths()`. A single `[slug].astro` could read `exhibits.json` at build time, yield one page per exhibit with per-exhibit meta, and eliminate all the individual exhibit pages. The per-exhibit metadata (title, description, schema type, cover) lives in the `Library` already. This would reduce four exhibit pages to zero (the dynamic route generates them) and `language-atlas.astro` would also vanish.

---

### **[MEDIUM] `firstSelectorOf` reimplemented inline in ExhibitView — boundary leak**
`ExhibitView.svelte:136–143` — Standard #6 (logic in wrong layer)

```typescript
const firstSelectorOf = (a: W3CAnnotation): W3CSelector | null => {
  const t = Array.isArray(a.target) ? a.target[0] : a.target;
  if (!t || typeof t === "string") return null;
  const sel = (t as { selector?: W3CSelector | W3CSelector[] }).selector;
  if (!sel) return null;
  return Array.isArray(sel) ? (sel[0] ?? null) : sel;
};
```

The comment admits "Replicated inline because render-mount's `selectorOf` isn't exported." This is a boundary violation: the W3C annotation selector-extraction logic belongs in render-core (it is a data-shape concern, not a viewer concern). The `as { selector?: ... }` cast on line 139 is the smell — the viewer is manually unwrapping a type it doesn't own.

**Remedy:** Export `selectorOf` (or a `firstSelectorOf` equivalent) from `@render/core` or `@render/svelte`. The viewer deletes the inline reimplementation and imports it. If the Studio harness already has this function, the correct fix is to expose it from the shared package, not replicate it.

---

### **[MEDIUM] Blob-URL revoke lifecycle split across two independent variables — timing hazard**
`published.ts:24–38`, `54–56`, `229–247` — Standard #7 (non-atomic updates) + Standard #5 (boundary cleanliness)

The portable and live sources each manage their own `revoke` callback independently: `portableRevoke` and `liveRevoke`. The code is correct in isolation, but the two revoke paths are structurally identical (call old revoke → run `loadPortableExhibit` → store new revoke) and could diverge on a future refactor. More critically, there is no guard against a caller invoking `loadPublishedExhibit` on a live slug while a portable session is open — the `liveFs && liveSlugs.has(slug)` check prevents collision, but the ordering of the `if` branches (portable first, live second, hosted third) is a silent assumption that isn't validated or commented as a priority invariant.

**Remedy:** Extract the revoke/load/store pattern into a small helper:
```typescript
async function loadFromFs(fs: Filesystem, slug: string, revokeRef: { revoke: (() => void) | null }): Promise<PublishedExhibit> {
  revokeRef.revoke?.();
  const { exhibit, revoke } = await loadPortableExhibit(fs, slug);
  revokeRef.revoke = revoke;
  return exhibit;
}
```
This makes the lifecycle explicit and eliminates the two parallel `revoke` variables.

---

### **[MEDIUM] `NarrativeReader` deep-link arrival ignores reading annotations**
`NarrativeReader.svelte:50–55` — Standard #5 (type/boundary cleanliness)

```typescript
const arrivalSection = (() => {
  if (!initialSelected) return 0;
  const ownerId = objects.find((o) => (annotationsByObject[o.id] ?? []).some((a) => a.id === initialSelected))?.id;
  ...
})();
```

The arrival-section finder only searches `annotationsByObject` (base annotations), not `readingAnnotationsByObject`. If a deep-link targets a reading annotation (a note under cipher/hoax/abjad), `ownerId` will be `undefined`, the section index will be 0, and the user lands on the wrong section. `ExhibitView` correctly searches both (`annotationsByObject` and `readingAnnotationsByObject`) when resolving `noteId` for arrival (lines 62–66). `NarrativeReader` misses the reading-annotation branch.

**Remedy:** Mirror ExhibitView's search: also scan `readingAnnotationsByObject[o.id]` across all reading IDs to find the owner. Optionally, activate the matched reading (as ExhibitView does with `foundReading`).

---

### **[LOW] `readingStyleOf` closure identity trick is subtle and fragile**
`ExhibitView.svelte:124–131` — Standard #4 (prefer direct, boring code)

```typescript
const readingStyleOf = (objectId: string): ((id: string) => MarkerStyle | undefined) => {
  const hovered = hoverNote; // captured per mint — the read that re-mints identity
  return (id) => readingMarkerStyle(colourBy[id] ?? ACCENT, ...);
};
```

The comment explains the trick: `hoverNote` is captured in the closure so that changing `hoverNote` changes the closure identity (a new function reference), which forces the Canvas to re-apply styles. This is correct but relies on Svelte reactive derived semantics and the Canvas component's prop-identity-comparison behavior. The trick is sound but undiscoverable — a reader encountering this without the comment would not understand why `hovered` is captured but not used in the return value. The `hovered` variable is used only to influence closure identity, not the return value.

**Remedy:** Document with a one-line comment at the capture site naming the exact mechanism: "captured to force a new closure identity on hover change — Canvas re-applies styles only when this prop changes." (This is partially done but the existing comment could be tighter.) Or restructure: expose `hoverNote` as a direct prop to Canvas and let Canvas handle highlight internally.

---

### **[LOW] `voynich-reading.astro` / `voynich-rosettes.astro` / `voynich.astro` import CSS four times each**
`pages/voynich.astro:5–10`, `pages/voynich-reading.astro:5–10`, `pages/voynich-rosettes.astro:5–10` — Standard #2 (ad-hoc repetition)

Each exhibit page re-imports the same four CSS files in the same order:
```
tokens.css
annotorious-openseadragon.css
annotorious-plugin-tools.css
markers.css
atmosphere.css
```

If the import order changes (e.g. `markers.css` must come after Annotorious CSS, as noted by comment), it must be maintained in four places. This is a minor lint-level finding but contributes to the structural case for dynamic routes above.

---

### **[LOW] `published-base.ts` fallback base URL is a hardcoded `archie.demo` URL**
`published-base.ts:11–14` — Standard #5 (silent fallbacks)

```typescript
export const BASE =
  typeof process !== "undefined" && process.env?.PUBLISH_BASE
    ? process.env.PUBLISH_BASE
    : "https://archie.demo/";
```

The comment acknowledges this ("the fallback rarely triggers") because `ExhibitView` reads canvas IRIs from `data.canvasIdByObject`. But when it does trigger (the fallback path), it silently uses a non-resolvable domain. A `DEBUG` console warning at fallback use-time would make missed configuration observable without being noisy.

---

## Code-Judo Opportunities

1. **Dynamic Astro route eliminates four exhibit pages.** `src/pages/[slug].astro` with `getStaticPaths()` reading the compiled `library` from `sample-data.ts` at build time generates all exhibit pages from one template. The `language-atlas.astro` page (not read — checked via tree) would also be replaced. Zero per-exhibit page files remain. Every OG/JSON-LD change happens once.

2. **`loadFromFs` helper collapses the parallel revoke state machines.** Two `revoke` variables + two identical call-site patterns → one helper + two `{ revoke }` ref objects. The lifecycle contract becomes a named thing, not folklore.

3. **Exporting `selectorOf` from render-core.** The viewer's `firstSelectorOf` disappears. The Studio harness, if it has the same function, converges to one implementation.

4. **`NarrativeReader` arrival search mirrors ExhibitView** — a 5-line fix that closes a silent bug where reading-annotation deep-links land on the wrong section.

---

## Self-Check

**Not premature extraction?** The `loadFromFs` helper wraps a concrete, duplicated 3-line pattern that already exists twice and will grow as modes are added. Not premature.

**Not DRY-as-rule?** The three reader components (Reader/NarrativeReader/MediaPlayer) are not merged — they are genuinely different interaction models (spatial list/detail, section-led camera, temporal transcript). Shared leaf components (Credit, NoteMedia, NoteLightbox, ReadingLegend) are at the right granularity.

**Not complecting?** Moving demo content to a fixtures layer does not merge concerns — it draws a cleaner line between "viewer (reader)" and "demo content (exhibits)." The build pipeline stays the same; only which module graph lives in `src/` changes.

**Not stopping early?** The live-vs-published path is genuinely clean and the reading system is well-structured. The structural concerns are real and localized.

**Voynich/atlas placement verdict:** `voynich.ts` and `atlas.ts` are correctly authored exhibit content — the prose, readings, regions, and structured notes are appropriate. The problem is not what they contain but where they live: in the viewer's `src/`, coupled to the viewer's build, rather than in a content or fixtures layer that the build tool consumes. The demo content is good; its address is wrong.

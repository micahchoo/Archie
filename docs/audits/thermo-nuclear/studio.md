# Thermo-Nuclear Review — apps/studio

## Verdict

**BLOCKER** — App.svelte at 1949 lines concentrates navigation routing, session management, all five ingest flows, geo-annotation geometry, WADM form logic, seed data, note styling, dialog orchestration, and keyboard handling in one file. No single concern can be understood, tested, or changed without touching the others. The file must be split before any structural work on this codebase is tractable.

---

## Baseline

| File | LOC | Flag |
|---|---|---|
| `App.svelte` | 1949 | **BLOCKER ≥1000** |
| `AvEditor.svelte` | 413 | watch |
| `ExhibitOverview.svelte` | 360 | ok |
| `LibraryHome.svelte` | 325 | ok |
| `store.ts` | 270 | ok |
| `PublishDialog.svelte` | 260 | ok |
| `AddMapModal.svelte` | 236 | ok |
| `NarrativeEditor.svelte` | 225 | ok |
| `Publish.svelte` | 213 | ok |
| `binding-store.svelte.ts` | 194 | ok |
| `publish-flows.svelte.ts` | 169 | ok |

Total: ~47 source files, ~7663 LOC. **The rest of the codebase is well-portioned.** The blocker is entirely contained in one file. `AvEditor.svelte` (413) is in the watch band but coherent — it owns the AV editor surface end-to-end.

App.svelte is 1949 lines. It is explicitly called out in this review's brief and is confirmed as a presumptive blocker. There is no debate here.

---

## The Domino

App.svelte conflates six distinct concerns. The split should carve along those concerns, not by line-count arithmetic. Here are the modules and what each would own:

**1. `exhibit-session.svelte.ts`** — the per-exhibit annotation session (not UI).
Owns: `session`, `annDir`, `dirty`, `storeReady`, `save()`, `scheduleSave()`, `bump()`, `openExhibit()` (state machine minus view routing), `replaceProjectFrom()`, `loadAllLogs()`. This is pure data — it takes `currentSlug`, `lib`, `bnd`, `author`, `isTemplate` as deps and emits `{ session, dirty, storeReady, save, bump, openExhibit, loadAllLogs }`. No Svelte template. Testable headlessly.

**2. `ingest.svelte.ts`** (or `ingest-flows.ts`)  — object ingest flows.
Owns: `addObject()`, `addObjectFromFile()`, `addFiles()`, `addMapObject()`, `newExhibit()`, `newExhibitFromFolder()`, `newExhibitFromManifest()`, `importNotesCsv()`, `importNotesWadm()`, `keepCopy()`, `appendObject()`, `nextObjectId()`. Takes `lib`, `currentSlug`, `session`, `storeReady`, `assetUrls` as deps. These are all self-contained async flows with a common shape: plan → loop → status → summary. No Svelte reactivity needed; plain `.ts` exports work.

**3. `geo-notes.ts`** — geo-annotation geometry helpers.
Owns: `geoForTarget()`, `geoLabelOf()`, `lngLatToPixel`/`pixelToLngLat` wrappers, `seededGeo()`. These are pure functions of `TileSourceDescriptor` + coordinates. They have no business in a UI component file. Deletion test: remove from App → each call site re-imports from here. Seam: the geo surface is a clear vary-point from image/AV surfaces.

**4. `seed-data.ts`** — default exhibit seeds.
Owns: `DEFAULT_EXHIBITS`, `seededVoynich()`, `seededAtlas()`, `seededGeo()`, `seededFor()`, the `GEO_TEMPLATE`/`geoBasemap`/`geoRights` constants, the `voynich*` imports. This is static authored data. It has zero reactive dependencies. It belongs nowhere near a component.

**5. `note-editor.svelte.ts`** (or keep as a snippet/sub-component)  — the WADM edit form state.
Owns: `commentEl`, `notePos`, `noteManualPos`, `notePopoverPos`, `noteDragging`, `noteDragStart/Down/Move/Up`, `closeNote()`, `applyForm()`, `applyTime()`, `fmtMMSS()`, `parseMMSS()`, `timeOf()`, `commentOf()`, `bodies()`, `citeIntoComment()`, `pendingCiteInsert`, `requestCite()`, `insertCite()`, `requestVisualCite()`, `pickVisualCite()`, `buildCmdEntries()`, and the `noteForm` snippet. The form is already declared as a Svelte snippet — the natural boundary is already drawn in the template. Extract to a sub-component `NoteEditor.svelte` that takes `sel`, `currentReadings`, `session`, `rev`, and emits `onclose`, `ondelete`, `oncite`.

**6. `App.svelte`** — reduced shell (~300–400 lines).
After extraction: view routing (`view`, `currentSlug`, `currentObjectId`, navigation functions), modal state (`layoutPickerOpen`, `readingsOpen`, `mapModalOpen`, `helpOpen`, `cmdkOpen`, `mediaPickerOpen`), keyboard handler, the main template (3 view branches + the header + the rails). `selected`/`editing`/`creating` stay here because they drive the template's conditional rendering. The `$state` count drops from 41 to roughly 12.

**Seam test:** `exhibit-session` varies from `ingest`: session tracks one exhibit; ingest creates and populates many. `seed-data` varies from both: it's static. `geo-notes` varies from image logic: image notes need no coordinates. `note-editor` varies from nav: it's form state, not routing. The seams are real.

**Anti-pattern guard:** the split is not premature — each module has 2+ call sites within App.svelte today, and each concern is already commented as a distinct unit (the worklist comment trail confirms this was the original intent). The binding store and publish flows were already extracted by the same rationale; this is completing that arc.

---

## Findings

### **[BLOCKER] App.svelte is 1949 lines — six concerns in one file** — `App.svelte:1–1949` — Standard #1, #0

Described in full above under The Domino. The symptom count: 41 `$state` declarations, 23 `$derived` declarations, 5 async ingest flows, 3 seed-data factories, geo-coordinate functions, a WADM form, a keyboard handler, and navigation routing all co-resident. Every non-trivial edit requires understanding the full file.

Remedy: extract the five modules named under The Domino. Prioritize `seed-data.ts` (zero deps, zero risk) and `geo-notes.ts` (pure functions) first — they validate the seams with no reactive complexity. Then `ingest-flows.ts`, then `exhibit-session.svelte.ts`, then `NoteEditor.svelte`.

---

### **[HIGH] `replaceProjectFrom()` is a 20-line inline data mapping with bespoke optional-spreading** — `App.svelte:674–696` — Standard #5, #6

The object mapping at lines 688–691 manually spreads `summary`, `width`, `height`, `mediaType`, `duration`, `layout`, `mode`, and `rights` — each guarded with `!== undefined` ternaries — to strip `undefined` before inserting into the store. This is duplicated from the ingest flows and the seed factories. The pattern `...(x !== undefined ? { x } : {})` appears at least 15 times across App.svelte.

The same stripping is needed anywhere the app reads a `Library` shape (loaded from zip) back into `WorkingLibraryMeta`. `rightsOf()` (line 1250) does the same pattern for the rights sub-object.

Deletion test: if a canonical `libraryToWorkingMeta()` mapper lived in render-core (alongside the existing `workingToLibrary()`), every call site vanishes in favor of one import. The inverse direction is already provided (`workingToLibrary` at line 1242 — `Q-3` decision). The forward direction is not. This is a **missed code-judo move**: adding `workingToLibrary`'s inverse to render-core eliminates the whole optional-spread farm and makes the round-trip symmetrical.

Remedy: add `libraryToWorking(lib: Library): WorkingLibraryMeta` to render-core. Replace `replaceProjectFrom()`'s mapping and the `keepCopy()` object construction with it.

---

### **[HIGH] `openExhibit()` performs 7 sequential state mutations and two async boundaries in series — non-atomic** — `App.svelte:302–340` — Standard #7

`openExhibit()` does: cancel timer → save → set `currentSlug` → set `currentObjectId` → null `selected/editing/creating` → reset rdg → set `assetsReady = false` → resolve assets → check isTemplate → load or seed session → set `view`. Eight mutations, two awaits, all in sequence. In the middle of this function Svelte flushes the reactive graph (the comment on line 729 acknowledges this explicitly for `appendObject`). Any one of the intermediate partial-states — e.g. `currentSlug` changed but `session` not yet swapped — is visible to `$derived` subscribers.

This is not catastrophic (the derived state is read-only and the UI is not interactive during the async), but it represents accumulated fragility. Every new exhibit-open feature has to know the exact order of this cascade.

Remedy: once `exhibit-session.svelte.ts` is extracted (Domino step 1), `openExhibit()` becomes a two-step call: `await exhibitSession.open(slug)` then `view = ...`. The session module owns the ordering guarantee internally.

---

### **[MEDIUM] `seededFor()` dispatch table is a slug-string switch — not type-safe, not extensible** — `App.svelte:216–222` — Standard #2, #5

```ts
const seededFor = (slug: string): (() => AnnotationSession) | null =>
  slug === "voynich-rosettes" ? () => seededVoynich(...)
  : slug === "voynich" ? ...
  : slug === "language-atlas" ? seededAtlas
  : slug === "geo-map" ? seededGeo
  : null;
```

The DEFAULT_EXHIBITS array already enumerates these slugs. The dispatch table is a second representation of the same set, with no compile-time check that they agree. Adding a new default exhibit requires touching DEFAULT_EXHIBITS AND seededFor AND the seed function. The slug strings are load-bearing literals with no shared constant.

Remedy: add an optional `seed: () => AnnotationSession` field to `ExhibitMeta` (or to the local `DEFAULT_EXHIBITS` entries). `seededFor(slug)` is replaced by `DEFAULT_EXHIBITS.find(d => d.slug === slug)?.seed ?? null`. One place to update.

---

### **[MEDIUM] `rightsOf()` is a local helper for a pattern that should be in core** — `App.svelte:1250–1252` — Standard #6

`rightsOf(m)` strips undefined rights fields before spreading into a struct. It is called at lines 686, 689, 690, and inside `LibraryHome`'s prop construction (line 1331). The same stripping pattern appears inline at four other sites for non-rights fields (e.g., line 1351 constructs the rights prop for ExhibitOverview with a bespoke spread). `workingToLibrary` in render-core already handles rights projection outward. The inward path (`Library` → `WorkingMeta`) has no canonical helper (see Finding #2 above). `rightsOf()` exists because that canonical helper is missing.

Remedy: subsumed by the `libraryToWorking()` fix above. Once that exists, `rightsOf()` and every bespoke spread disappear.

---

### **[MEDIUM] `selected` / `editing` are two variables for one concept, with a side-channel `$effect`** — `App.svelte:848–853` — Standard #2, #3

```ts
let selected = $state<string | null>(null);
let editing = $state<string | null>(null);
$effect(() => { if (selected !== null) editing = selected; });
```

The comment (line 850) explains: `editing` doesn't follow `selected` to null because Annotorious fires a spurious deselect on every `setAnnotations` call. So `editing` is a lag-behind shadow of `selected` whose only divergence point is the null case.

This is a real constraint (Annotorious's behavior, not a design choice), but the two-variable pattern with a $effect coupling is fragile. Any code that sets `selected = null` to dismiss the form must also know to null `editing` explicitly (and it does, in 8 separate places). Any future author who only sets `selected = null` will leave the form open.

Remedy: encapsulate both into a small reactive object: `const sel = createSelectionState()` that exposes `select(id)`, `dismiss()`, `editing` (read-only). The Annotorious deselect guard lives once inside `createSelectionState`, not distributed across 8 call sites.

---

### **[LOW] `replaceProjectFrom()` line 688 uses `as { mode?: string }` cast on a typed `Library` object** — `App.svelte:688` — Standard #5

```ts
...((e as { mode?: string }).mode ? { mode: (e as { mode?: string }).mode } : {}),
```

`mode` is apparently not on the published `Library` type but is read from a loaded zip. This is a widening cast that bypasses the type system. Either `mode` belongs on the `Library.exhibit` type (in which case add it), or it is genuinely deprecated and should be stripped at load rather than cast.

---

### **[LOW] `imageDims()` creates a throwaway DOM `<Image>` element for a single probe** — `App.svelte:709–715` — Standard #4

`imageDims()` is a local helper that creates an `<img>` element, loads the URL, and returns `{ w, h }`. It is superseded by the `downscaleIfNeeded()` return value (which decodes the image and returns dims) in the orientation-1 path, making `imageDims()` redundant for local files. It is still used for network URLs (`addObject()` at line 746), where it is genuinely the right approach. The duplication is low-risk but the function could be a one-liner import from a shared browser util.

---

## Code-Judo Opportunities

**1. The inverse mapper (`libraryToWorking`)** — Standard #0, #6. A single function in render-core eliminates ~20 optional-spread ternaries, makes `replaceProjectFrom()` a 5-line function, and symmetrizes the round-trip. This is the highest-leverage single addition to render-core. No behavior change.

**2. Encapsulate `selected`/`editing` as a selection state object** — Standard #3. Deletes the `$effect`, reduces "clear both variables" from 8 call sites to 1 method call, and quarantines the Annotorious workaround in one place. Produces fewer moving pieces, not more.

**3. Add `seed?` to `ExhibitMeta` entries** — Standard #2. Collapses the `seededFor()` dispatch table into `DEFAULT_EXHIBITS.find(d => d.slug === slug)?.seed`. Removes a second representation of the default-slug set.

**4. Extract `seed-data.ts` and `geo-notes.ts` as zero-risk first moves** — Standard #0, #1. Both are pure functions and static data. They reduce App.svelte by ~200 lines with no reactive coupling to reason about. Do these first to validate the extraction pattern before touching stateful concerns.

---

## Self-Check

**Premature extraction?** No. Each proposed module is justified by the deletion test (removing it leaves named call sites that re-import from the module) and the seam test (each concern varies independently). The binding store and publish flows were already extracted by the same logic; this completes the arc the codebase's own comments describe.

**DRY as a rule?** The `rightsOf` / optional-spread finding is not "remove duplication for its own sake" — it's "a canonical mapper is missing from the layer that owns the type, causing bespoke reconstruction at every call site." The duplication symptom is evidence of the missing canonical; removing duplication is a side effect, not the goal.

**Premature decomposition?** The proposed `NoteEditor.svelte` sub-component extraction is the one to watch. The note form is already a snippet in the template, and its state (`commentEl`, `notePos`, drag state) is tightly coupled to `mainEl` and `editing`. The extraction is valid only if `NoteEditor` can receive its position state as a prop and own its own drag logic — which it can. If that coupling proves sticky in practice, the snippet-in-App approach is acceptable as-is and this finding degrades to a nit.

**Stopping-refactor-early?** The `binding-store.svelte.ts` and `publish-flows.svelte.ts` extractions (worklist 0.3) were the right moves. The comment trail ("cut 1", "cut 2") shows a planned decomposition in progress. This review is calling the remaining work as a blocker, not inventing new direction.

**Complecting?** The proposed `exhibit-session.svelte.ts` would own both the OPFS session state and the `openExhibit()` transition logic. These are genuinely one concern (what is the active annotation session, and how does it change?), not two. No complecting.

# HANDOFF — Archie implementation

_Last updated: 2026-05-25. Producer: Phase 0 implementation session._

## ▶ RESUME (read first — newest sections are at the BOTTOM; this is the live summary)
**Where we are:** the v1 adopted-tier tool works end-to-end, dogfooded on real fixtures.
- **Studio** (`apps/studio`, vite :5173): multi-exhibit Library home + per-exhibit OPFS persistence;
  draw/select/WADM-form/layers/merge; **import** local images (file/drag-drop, OPFS) + rename objects;
  thumbnail object rail; **Open .archie.zip** (replace project); **Publish** (whole library → zip + GitHub,
  incl. assets as base64 blobs). Two default exhibits: **Voynich** (5-folio grid) + **Bidar** (the real
  COMPOST annotated map, 25 reflections — NARRATIVE).
- **Viewer** (`apps/viewer`, astro :4321): gallery → `/voynich` (grid) + `/bidar` (narrative). Reads the
  **published static tree over HTTP** (`gen-published.mts` via vite-node → `public/published/`; pure-fetch
  `published.ts`). Markdown note bodies render (photos/audio inline). **Deep-link arrival** (`#/a/<id>`).
- **Design:** forest-green "scholar's ink" (`--accent #3a6b4c`); ALWAYS build UI via
  `/interface-design:interface-design` + `.interface-design/system.md` (user standing rule).
- **⌘K intra-Library linking — SHIPPED (2026-05-25):** Studio "Cite" palette (`CmdK.svelte`) cites any
  note/exhibit into the Comment at the cursor as `[label](archie:…)`; resolved to a real display URL on
  the heads-page PROJECTION at publish, kept RAW in the canonical history (round-trips); broken refs
  degrade to plain text + reported via `publishLibrary`→`{brokenLinks}`. Core: `encodeLinkRef`/
  `parseLinkRef`/`rewriteArchieLinks` in `link.ts`. See bottom detail §.
- **EXIF display-master bake — SHIPPED (2026-05-25):** importing a phone photo with EXIF orientation
  bakes an upright PNG master (coord layer stays orientation-blind); original preserved in
  `assets-original/`; provenance on `ObjectMeta`. Core reader `readExifOrientation` (`exif/read.ts`)
  + the 8-orientation gate (`exif/read.test.ts` vs `test/fixtures/exif/manifest.json`). See bottom detail §.
- **AV first-class note — SHIPPED (2026-05-25):** a Sound/Video object renders in a temporal
  `MediaPlayer` (Viewer) — `<audio>`/`<video>` + a transcript prose-spine; click a line → seek, playback
  → highlights the active cue. Core time helpers `parseTimeFragment`/`activeNoteIndex` (`av/time.ts`).
  New `/av` fixture exhibit (transcript built via the real `importTranscript`; self-contained silent WAV).
  AV *ingest* (codec/size) stays gated (§152). See bottom detail §.
- **Tests:** 294 green (core 258/mount 18/svelte 18). Both apps build clean (Studio 188 modules). **Use
  `~/.npm-global/bin/pnpm`** (corepack shim broken). ⚠ **[SNAG 2026-05-25] pnpm v10.32 needs Node ≥22.13**;
  if the shell's `node` is v20 (default `/usr/bin/node`), pnpm crashes with `ERR_UNKNOWN_BUILTIN_MODULE:
  node:sqlite` BEFORE running anything. Fix: `export PATH=/home/micah/.nvm/versions/node/v22.22.2/bin:$PATH`
  then run pnpm. Workaround for build only: run vite directly under node20 — `cd apps/studio && node
  node_modules/vite/bin/vite.js build` (vite itself is node20-fine; only pnpm's launcher needs 22).
  Viewer: `pnpm --filter @archie/viewer dev` (runs gen) OR `pnpm --filter @archie/viewer gen` then `astro dev`.
**v1 REMAINING (Phase 3 ⊂ v1; see docs/PRE-P3-UX-AUDIT.md):**
- **Edit-side AV HAND-annotation — SHIPPED (2026-05-25, user ruling archie-av Q-1, supersedes §81
  "import-only v1"):** the Studio routes a sound/video object to `AvEditor` (player + "Set in"→"Add note"
  marking; the temporal OSD-draw analogue) → creates a `t=start,end` supplementing note → shared WADM form
  with a conditional start/end time fieldset. mediaType inferred for URL-added objects (`mediaTypeFromSource`).
  **PLUS VTT/SRT transcript IMPORT** (AvEditor "⊕ Import VTT/SRT" → `importTranscript`, append-only) — so AV
  authoring is complete BOTH ways (by-hand + import). AV FILE INGEST (upload/codec/size) stays gated (§152).
  See bottom detail §.
gated inventions: **ALL 6 v1 inventions now BUILT (2026-05-25).** three-configs SHIPPED+VERIFIED;
identity-prompt + overview-as-canvas SHIPPED prototypes (gate/browser-verify owed). merge-summary +
conflict-card shipped earlier (MergeReview); playground→project verified. Detail §§ at the bottom of RESUME.
Non-gated polish brokenLinks-UI + AV mm:ss SHIPPED 2026-05-25. (Remaining = browser-verify + non-gated polish.)
**playground→project — SHIPPED, PER-EXHIBIT model (2026-05-25, user gate-approved "yes"; archie-persistence
Q-1; browser-verify owed):** §115 first-run mental model. First cut (session-wide `appMode` + two-door
`Landing.svelte`) FAILED the gate — user: "same examples in both buckets; each one's path in/out
different and not coherent" + "the New Exhibit one does not have the playground banner, the others do."
ROOT CAUSE: `DEFAULT_EXHIBITS` did double duty (Try-templates AND every project's auto-seeded content).
**CORRECT MODEL (rebuilt) = PER-EXHIBIT:** `isTemplate(slug)` = slug ∈ `DEFAULT_EXHIBITS`. A bundled
EXAMPLE is a template → playground: opening it shows the amber "Example — changes aren't saved. Keep a
copy" banner; `save()` no-ops + `openExhibit` seeds fresh (notes never hit OPFS). A USER-CREATED exhibit
= project: saved, no banner. `LibraryHome` marks examples (amber "Example" badge, dashed card). `keepCopy()`
forks the current example → a new saved user exhibit, carrying the current head notes RETARGETED to the
copy's canvas IRIs (fresh records). Library STRUCTURE always persists (`persistLibrary` = `saveLibraryMeta`,
ungated); only example ANNOTATIONS are ephemeral (save() gated on `isTemplate(currentSlug)`). Landing.svelte
DELETED; `appMode`/`convertToProject` removed. Builds (181 mods). **Browser-verify owed:** library shows
Examples (badged) + your exhibits + New; open an Example → banner, edits not saved on reload; "Keep a copy"
→ a saved copy with your notes; New Exhibit → no banner, saved. **Still OUT (= invention #3 gate):**
§116 Chromium-folder vs zip-as-file persistence; recent-projects list; project naming.
**layout-picker — SHIPPED + FUTURE-PROOFED (2026-05-25, user gate-approved "finalize"; archie-av Q-2):**
first cut read as "interchangeable templates"; redesigned around CONTEXT §43's TWO axes + advisor-reviewed.
- **Model (§43, `model.ts`):** `layout: LayoutType` = the SPATIAL-ARRANGEMENT axis (a new arrangement
  like compare = a new LayoutType, v1.1). `Exhibit.mode?`/`ExhibitMeta.mode?` (string, RESERVED) = the
  reading-MODE axis (slideshow of grid / scrollytelling of narrative attach HERE as variants — NOT new
  LayoutTypes). `readingFamily(layout)→object-led|prose-led` groups the picker; `isValidMode(layout,mode)`
  encodes the family-binding rule (v1: only `undefined` valid; v1.1 widens) + guards untrusted JSON.
  Unused in v1 → no published-file change, no migration. (Chose string+named-values over a `never`
  discriminator for JSON round-trip simplicity — advisor-offered alternative.)
- **Picker (`LayoutPicker.svelte`):** options GROUPED by reading family (Object-led / Prose-led headers +
  clause); each card = imperative stance + consequence; each family shows a "Later: …" line where v1.1
  modes attach — the additive future made visible (anti-template-sprawl). Header trigger "▦ {layout}" →
  `setLayout` persists `ExhibitMeta.layout`.
**Browser-verify owed:** open an exhibit → "▦" in header → the picker reads as a reading-relationship
choice; pick one → it persists + publishes. **Open follow-up (not blocking):** Narrative still needs Studio
section-authoring (separate piece) to read fully — the picker declares the intent.
Non-gated polish: publish `brokenLinks` in Publish.svelte UI · styled AV scrubber + mm:ss time inputs ·
publish-originals opt-in.
**Browser-verified ✓ (2026-05-25, by user):** EXIF bake (phone photo → upright master) · ⌘K
cite/insert/publish-rewrite · deep-link arrival · narrative map · markers · Open-zip · publish
round-trip. (Headless logic + these visual/OPFS/canvas paths now both confirmed.)
**Browser-verify owed:** AV player (Viewer `/av` → play, click a transcript line to seek, active line
highlights) · **Studio AV hand-annotation** (open the "A Field Recording from Bidar" exhibit → play →
"Set in" → "Add note" creates a note; the WADM form shows start/end seconds; click a note seeks the audio).
**three-configs persistence — SHIPPED, GATE PASSED (2026-05-25; archie-persistence Q-2; user: "it works";
browser-verified by user):** invention #3. A Library's canonical bytes live in one of three
places, capability-selected, capability HIDDEN: **UNBOUND** (OPFS, this-browser-only) / **FOLDER** (Chromium
`FsaFilesystem` autosave-in-place — `publishLibrary` writes the published IIIF tree = the git/GH-Pages
on-ramp) / **FILE** (`.archie.zip` on disk — Save downloads via `libraryToZip`, Open picks it; the
"Word-doc 2003" model). Folder-vs-file shows as the PLACE (folder name / file name), never "your browser
can't…".
- **Adaptation flagged at gate:** the per-exhibit Example model (Q-1) already carries §115's
  ephemeral-playground half, so the user-facing axis is **UNBOUND-vs-BOUND**, NOT the rejected two-door
  Playground/Project Landing (stays deleted). Binding chrome lives on **LibraryHome** (project bar: place +
  "● unsaved" dot + Save[⌘S] + "Open a library…" + Close + recents list + lost-binding recovery strip).
- **Write-through simplification (flag at gate):** folder autosave mirrors the published tree on `save()`;
  the purist "OPFS becomes irrelevant, folder IS the working store" is the v1.1 refinement.
- **Files:** pure model + recents algebra → `@render/core/fs/binding.ts` (**13 tests**: bindingLabel,
  recentFromBinding, addRecent/touchRecent/removeRecent, tolerant parse/serialize). Browser glue →
  `apps/studio/src/binding.ts` (capability detect, `showDirectoryPicker`, zip download, localStorage
  recents+lastBinding) + `apps/studio/src/handles-db.ts` (dep-free IndexedDB FSA-handle store +
  query/requestPermission; donor anvil). App.svelte: binding state + saveProject/openProjectFolder/openZip
  (now sets file binding)/openRecent/closeProject/autosaveToFolder + ⌘S; `replaceProjectFrom` extracted
  (shared by Open-zip + Open-folder). NO new persistence plumbing (reuses publishLibrary/loadLibrary/
  libraryToZip/openZip). **290 tests green; both apps build (Studio 184 modules).**
- **Browser-verify owed (FSA/IndexedDB/localStorage are headless-unverifiable):** Chromium → "Save to disk"
  → pick folder → the folder fills with the IIIF tree; edit → it autosaves; reload → "Folder · {name}" chip
  restored + recents present; "Open a library…" → pick a folder → loads. Non-Chromium → Save → downloads
  `.archie.zip`; Open → pick zip → loads; ⌘S + "● unsaved" dot behave. Lost binding (move/delete the folder)
  → amber recovery strip (Open… / Save as new), never a silent demote. Close → back to "this browser only",
  work preserved. Recents survive a reload; "× forget" removes one.
**identity-prompt — SHIPPED, GATED PROTOTYPE (2026-05-25; gate/browser-verify owed):** invention #6.
A local display name, prompted at the moment it acquires meaning — the FIRST "Import changes" (your work
mixes with a collaborator's), never at launch (CONTEXT UX principle #2). Skip → Anonymous. The name becomes
`author` = the clientId stamped as `lastEditor` in the merge DAG → shows as the "who" in MergeReview's
conflict cards. Files: `IdentityPrompt.svelte` (paper dialog); App.svelte: `identity: string|null` (null =
never asked → prompt; "" = Anonymous; else name) persisted in localStorage (`archie.displayName.v1`),
`author = $derived(asClientId(identity || "anonymous"))`, `importChanges()` gates on `identity===null` →
opens prompt → `setIdentity()` (rebuilds the live session with the new clientId, since AnnotationSession
captures it at construction) → runs the deferred import. "You · {name}" chip in the editor header.
**Browser-verify owed:** first "Import changes" with no name → prompt appears → Save "Alice" → merge panel
shows "Alice" as your side (not "demo"/"anonymous"); Skip → "Anonymous"; reload → not re-prompted; chip shows.
**Non-gated polish — SHIPPED (2026-05-25):** (1) brokenLinks surfaced in the Publish dialog (amber strip
listing the cited notes/exhibits that degrade to plain text; App scans via a MemoryFilesystem dry-run on
open). (2) AV time fieldset now mm:ss (tolerant parse: "1:30" or bare "90"); AvEditor already showed mm:ss.
(3) publish-originals opt-in — SHIPPED (2026-05-25): core `PublishOptions.getOriginal` + `AObject.originalName`
write `{slug}/assets-original/{name}` (+2 core tests); store `readOriginalBytes`; a "Include source originals
for citation" checkbox in the Publish dialog threads through `onpublish(target, {includeOriginals})`. Opt-in,
GH-publish path only (Download/folder-save omit originals — they're the working store; originals stay in OPFS).
Only fires for EXIF-baked imports (objects with provenance.originalName) — no seeded test data, headless-tested in core.
**overview-as-canvas — SHIPPED, GATE APPROVED (2026-05-25; archie-ux Q-1; user: "good" → 1a stands;
browser-verify still owed):** invention #1, the marquee gate. Opening a multi-object or narrative exhibit lands on an OVERVIEW scale:
its Objects as plates on a pannable/zoomable dark tableau in reading order — the 1a "same zoom metaphor"
(wheel zoom-to-cursor + drag-pan via a CSS transform), click a plate → `openObject` → the deep-zoom editor;
the editor's back button climbs to "← Overview". Single-object exhibits skip straight to the editor.
**1b fallback** = an explicit "List" view toggle inside the SAME component (the contrast the gate measures).
**THE REASON TO EXIST — drag-to-reorder reading order (2026-05-25, user gate Q "what does it afford that's
not afforded elsewhere?"):** the object rail only NAVIGATES; the overview now COMPOSES. Drag a plate (canvas)
or a row ⠿-handle (list) to set the reading order = the published Grid display order / Narrative sequence,
settable nowhere else. Native HTML5 DnD (transform-independent; works both modes); insert-before-target +
the "+ Add / Move to end" plate appends. `ExhibitOverview` emits `onreorder(orderedIds)`; App's
`reorderObjects` permutes the canonical `objects[]` array (one source of truth — array order IS reading
order, model.ts) + persists. FUTURE-PROOF: the move-by-id primitive is what narrative section-grouping will
reuse; no parallel `order` field introduced. (a11y gap: drag is mouse-only — keyboard reorder is a TODO on
the grip `<button>`.)
Files: `ExhibitOverview.svelte` (self-contained — built + verified to compile BEFORE wiring, so a mid-build
interruption couldn't break the open-exhibit flow); App.svelte: `view` gains `"overview"`, `hasOverview`
($derived: >1 object OR narrative), `openObject`/`backToOverview`, openExhibit lands on overview when
hasOverview. Section dividers for narrative DEFERRED (no Studio section-authoring → no section data).
**Affordance pass (2026-05-25, gate feedback "pan/zoom not obvious"):** added a top gesture legend
(✥ Drag to pan · ⊙ Scroll to zoom), a live zoom-% in the control cluster, an inset edge vignette (frame
reads as a window onto a larger surface), and more pannable padding (space-12). Re-verify discoverability.
Sizing (user): the overview is the **middle ~80vh band, FULL WIDTH and unframed** — `.overview` = 80vh,
width 100%, NO border/shadow (a framed-card version was rejected: "the canvas should be fully available");
`.overview-stage` (App) just vertically centres it (10vh above/below). Tableau content centres (justify/align center).
**Browser-verify owed (pointer/wheel transforms are headless-unverifiable):** open Voynich (grid, 5 objects)
→ lands on the canvas overview; drag pans, scroll zooms toward cursor, ± / Fit work; click a plate → opens
its deep-zoom editor; "← Overview" climbs back; "List" toggle shows the plain-list fallback; "+ Add object"
→ editor add-form. Single-object/AV exhibits open straight to the editor. **GATE QUESTION: does the canvas
read as a canvas, not a list pretending to be one? If not → CONTEXT fallback is 1b (the List toggle).**
**DEFERRED-WORK REGISTRY (2026-05-25):** added to `docs/IMPLEMENTATION-STRATEGY.md` (new §"Deferred-work
registry") — the full remaining frontier classified by the doc's reducibility cut (mechanical-now /
corpus-first / human-gate / orphan-gate / out-of-v1). That doc § is the canonical remaining-work list.
**NARRATIVE STUDIO SECTION-AUTHORING — IN PROGRESS (phase decomposed strat→tactic→phase→wave→task):**
the next mechanical phase (closes the one authoring gap — narrative is pickable but not authorable).
- **Wave 1 (source + testable core) — DONE:** `sectionsFromManifest(manifest)` added (`iiif/manifest.ts`,
  the inverse of `toRanges`) + `toRanges` now carries `prose` as the Range `summary` + `IIIFRange.summary`;
  round-trip test (sections → toManifest → sectionsFromManifest, prose+region preserved). **+2 core tests
  (294 total).** This unblocks the Viewer reading the spine from the published tree (not `sample-data`).
- **Wave 2 (authoring UI) — DONE (2026-05-25; browser-verify owed):** (a) `ExhibitMeta.sections` persists
  (store.ts, reuses core `Section`); (b) **`NarrativeEditor.svelte`** — GREENFIELD (confirmed: anvil has no
  NarrativeEditor; ADR-0002's "adopts anvil's" is wrong) — ordered section cards: title + object `<select>`
  + prose textarea + optional region + reorder(▲▼)/add/remove; (c) surfaced as a **"Sections" mode** in the
  overview's Canvas|List|Sections toggle (narrative-only; chose a mode-tab over §118's sidebar — more room
  for cards; flag at verify); (d) `setSections` persists to ExhibitMeta + `buildFullLibrary` includes
  `sections` → publishes as IIIF Ranges. **190 modules; 294 tests.**
  **[SNAG→FIXED 2026-05-25] "no Sections tab" (user verify #2) — TWO bugs, found in order:**
  (1) DOMINANT, missed on the first pass: App never passed `onsections`/`sections` props into
  `<ExhibitOverview>`, so `isNarrative = layout==="narrative" && onsections!==undefined` was **always false**
  → tab never rendered regardless of layout. (2) `<LayoutPicker>` was scoped to the editor `{:else}` branch,
  so the overview's ▦ couldn't open it (couldn't set narrative from the overview). FIXES: wired
  `sections={currentExhibit?.sections ?? []}` + `onsections={setSections}` into `<ExhibitOverview>` + added
  `sections` to `buildFullLibrary` (publish); moved `<LayoutPicker>` to global scope. **Lesson:** the first
  fix (picker) was correct but not the cause — traced the full chain only after the 2nd failure (should have
  verified onsections was wired before claiming fix). Builds (190 modules). **Re-verify:** Voynich overview
  → ▦ → Narrative → "Sections" tab appears in Canvas|List|Sections.
**USER VERIFY RESULTS (2026-05-25):** ✓ overview pan/zoom · ✓ identity-prompt · ✓ Studio AV hand-annotation ·
✓ brokenLinks-in-Publish · ✓ Viewer AV player · ✓ **narrative section-authoring** (after the 2-bug fix —
tab appears, sections persist across reload). ⏸ layout-picker reading-effect (#5) — deferred until the
narrative round-trips to the Viewer (Wave 3, in progress).
- **Wave 3 (round-trip) — DONE (2026-05-25):** `published.ts` `loadPublishedExhibit` now returns
  `sections = sectionsFromManifest(manifest)`; `ExhibitView` consumes `d.sections` (dropped the `sectionsFor`
  sample-data crutch); the viewer `library`'s bidar exhibit carries `sections: bidarSections` + `layout:
  "narrative"` so it PUBLISHES as Ranges. Verified by build: regenerated `bidar/manifest.json` has **25
  structures (Ranges) with prose `summary`**; viewer reads them back → narrative renders from the published
  tree, not sample-data. **The narrative source→manifest→consumer round-trip is now closed end-to-end.**
  **Re-verify (#5):** Viewer `/bidar` reads as a narrative (prose spine over the map) — now driven by the
  published manifest Ranges. **STILL REMAINING:** (e) overview **section dividers** (group plates by section).
**SECTION MODEL — LOCKED via /grill-with-docs (2026-05-25; archie-narrative Q-1; CONTEXT §Section sharpened):**
the round-trip exposed that "what a Section IS" was unresolved — 3 models in 3 places (NarrativeEditor=A,
bidar=B, Viewer NarrativeReader=B-by-index). RESOLVED **(A) self-contained third layer**: `Section =
{ objectId, start, prose }`, independent of Notes; note-refs via ⌘K-in-prose, NOT a structural ref. `start`
= a **media fragment** (`xywh=…` image / `t=…` AV). Spine may **switch objects** across sections. Reading
shows the **active object's** markers (§122 progressive → v1.1, redefined "region-passed"). Rejected (B)
tour-of-notes (welds narrative↔annotation, can't focus a non-Note region). **ADR-0005** written (narrative-section-model). **IMPLEMENTATION (in order):**
(1) **DONE (2026-05-25):** core `Section.xywh` → `Section.start` (full media fragment); `toRanges` →
`canvasId#${start}`; `sectionsFromManifest` parses any fragment (round-trip test updated; 258 core green);
`NarrativeEditor` field renamed (xywh→start, relabeled "Focus"). Studio 190 mods + viewer build clean.
(2) **DONE (2026-05-25; browser-verify owed) — the real fix:** new mount seam `MountSurface.fitRegion(fragment)`
(reuses `applyFitBounds`; fits an arbitrary region, NOT an annotation; `t=` no-ops on a spatial canvas);
`Canvas` gains a `focus` prop → `surface.fitRegion`; **`NarrativeReader` rewritten** to drive the canvas from
the ACTIVE section's object + `start` — **switches objects** (`{#key activeObject.id}` remounts OSD), renders
**MediaPlayer for an AV-object section**, markers = active object's notes; the section-`i`↔note-`i` index
coupling DELETED. `ExhibitView` passes `data.objects` + `canvasIdOf` + `annotationsByObject` + `title`.
(3) **DONE:** bidar sections carry explicit `start` (`xywh=pixel:…` from each note's region) — verified the
regenerated `bidar/manifest.json` Range start = `…/canvas/o1#xywh=pixel:713,1215,388,388`. **294 tests; both build.**
**Browser-VERIFIED 2026-05-25 (user: "/bidar zooms per section"):** clicking a section zooms the map to THAT
reflection's region via `fitRegion` (not note-select) — model (A) proven author→publish→read. Still owed (no
fixture): a hand-authored multi-object narrative switching canvases per section; an AV-object section's player. (4) **DONE (2026-05-25):** `NarrativeEditor` — the per-section "Focus" field is AV-aware (image-bound → "Region ·
xywh=…"; AV-bound → "Moment · t=start,end"); + an **"＋ from a note…"** dropdown seeds a new section's objectId +
`start` + prose from an existing Note (App derives `narrativeNotes` from the session → ExhibitOverview → editor).
190 modules; 294 tests. Browser-verify owed: Sections tab → "from a note" creates a seeded section; AV-bound section
shows the time-oriented focus hint.
(5) overview section dividers — **RECONSIDERED/DEFERRED:** under model (A) largely redundant (the "Sections" mode
already shows the full ordered spine; sections↔objects is many-to-one so plate-level dividers map muddily). Revisit
only if plate-level "in narrative §N" badges prove wanted. Narrative MODEL + read path shipped (model locked + ADR-0005 + steps 1–4; /bidar region-zoom user-verified).
**SECTION-AUTHORING PLACEMENT — CORRECTED (user, 2026-05-25; REWORK OWED):** section authoring must live in the
**EDITOR space** (canvas + object rail + sidebar), NOT the separate overview "Sections" tab I built (steps 2–4).
WHY: a section's camera (`start`) must be FRAMED on the object's canvas (like a note's geometry), and the rail
already gives multi-object movement — a separate screen divorces the spine from the canvas you need to frame it.
My overview-tab placement misread CONTEXT §118 (its sidebar LISTS sections, but §118's overview is the zoomed-OUT
ARRANGING view, not the authoring home). **REWORK:** (1) move `NarrativeEditor` out of the overview Sections-mode
INTO the editor sidebar as a "Narrative" spine panel beside the notes list; (2) author a section: rail → object,
**frame the camera on the canvas** (draw a box like a rect note / set in-out for AV → captures `start`), "add to
narrative" + prose, reorder in the panel; (3) overview-as-canvas stays VIEWING/arranging only. UNCHANGED: model (A),
ADR-0005, setSections, publish (toRanges), the Viewer read path, bidar. Only the HOST SURFACE moves (overview tab →
editor sidebar) + the typed `start` field becomes a canvas gesture. The NarrativeEditor component largely survives.
**This is the real "multi-object / AV narrative reads correctly" work** — the authoring (Wave 2) + round-trip
(Wave 3) are done; this makes the read side honor the model. ADR-worthy (offered, not yet written).
**OTHER NEXT (non-gated, see registry):** styled AV scrubber · KNOWN SCALING GAP (below) ·
browser-verify the owed prototypes (identity-prompt, overview pan/zoom, AV).
**KNOWN SCALING GAP (planned, not built):** the zip/save path is all in-memory (OPFS→Uint8Array→fflate→
Blob), so a multi-hundred-MB library can strain RAM — the folder sink already streams (fsa.ts createWritable),
the zip sink accumulates (zip.ts Map + zipSync, ~2×). Full mitigation treatment (size-estimate+route · link-
don't-embed · streaming-zip-to-file-handle · import downscale · OPFS→sink stream; cheapest-first, #1/#2 are
cheap-now) → **docs/plans/LARGE-MEDIA-MEMORY-CEILING.md**.

## Through-line

Implementing `docs/IMPLEMENTATION-STRATEGY.md` diligently, phase by phase, TDD throughout,
no reward-hacking. The durable artifacts (CONTEXT.md + docs/adr/ + this strategy + the seeds
DAG + mulch) ARE the implementer's working memory (strategy §79). Read-state → work →
write-state-back every phase.

## 📋 BACKLOG (user-requested 2026-05-25) → docs/plans/PHASE-2.md "Studio UX + real fixtures"
From dogfooding the multi-exhibit Studio. Tasks P2-5..P2-8 (see PHASE-2.md for detail):
- **P2-5 (BUG) — FIX APPLIED, needs browser confirm:** the annotation edit form closed after every
  change. ROOT CAUSE: edit → bump → setAnnotations → Annotorious deselect → Canvas onSelectChange
  sets `selected=null` → form (`{#if sel}` from selected) unmounts. FIX: form now derives from a new
  `editing` id that follows `selected` only on non-null (`$effect(() => { if (selected !== null)
  editing = selected; })`); builds clean. CONFIRM in browser: edit Comment/Tags repeatedly, form
  stays open. (Marker highlight still drops per edit — related, unfixed; see PHASE-2.md P2-5.)
- **P2-6:** easier object choosing (thumbnail switcher, bigger targets).
- **P2-7:** easier object importing (file picker + drag-drop + OPFS bytes; not URL-only).
- **P2-8 — VOYNICH IMPORTED (one-time):** `scripts/import-voynich.mjs` converts the anvil
  voynich-manuscript fixture → `apps/{viewer,studio}/src/voynich.ts` (5 objects + 25 notes, real
  dims) + copies images to `public/voynich/`. Viewer renders it (slug "voynich"); Studio default +
  seed = Voynich (non-destructive migration prepends it for existing OPFS, so no clear needed). Both
  build clean. Source B (`one.compost.digital`) still open — investigate via ctx_fetch_and_index
  (curl/WebFetch blocked).
- **MARKDOWN RENDERING (P2-8 follow-up) — DONE:** note bodies are authored markdown. Added
  `renderMarkdown` (snarkdown → sanitizeHtml) + `stripMarkdown` to `@render/svelte` (6 new tests,
  18 total). Viewer Reader renders markdown in the detail drawer (`{@html}`, sanitized) + plain lead
  (stripMarkdown, line-clamped) in the list/popup; Studio note cards show the stripped lead (form
  textarea edits raw md). Import script no longer strips `**` (keeps markdown). snarkdown added to
  render-svelte deps.

## BUGFIX: Bidar annotations bunched top-left (coordinate space) — 2026-05-25
COMPOST's viewer (js/micah.js) authored annotation x/y/r in a 1920×1358 REFERENCE space and placed
markers at OSD viewport (x/1920, 0.7*y/1358); OSD maps viewport→image pixels by image WIDTH. My
import used the raw x/y as full-map (4960×3508) pixels → all 25 landed in the top-left ~30%. FIX
(scripts/import-bidar.mjs): px=(x/1920)*4960, py=(0.7*y/1358)*4960, r=(r/1920)*4960. Re-ran → coords
now spread x 202–4301, y 402–2749. Because the object source was unchanged, the source-based
reconcile wouldn't reseed, so added `seedVersion` to ExhibitMeta — bidar default `seedVersion: 2`;
`isStale` also compares seedVersion → bumping it forces a clear+reseed of just that exhibit (voynich
seedVersion absent→0, preserved). RELOAD :5173 → bidar reseeds with correct positions.

## BUGFIX: stale persisted default exhibit shadowed the re-imported fixture — 2026-05-25
After re-importing bidar (cover → real map), the Studio "still showed the old object": library.json
persisted the OLD bidar (cover object) + its 4 old notes, and the migration only ADDED missing
defaults (bidar wasn't missing). FIX: self-healing reconcile in onMount — for each DEFAULT_EXHIBITS,
if its persisted copy is STALE (missing, or `objects[0].source`/count differs from the code default)
→ replace its structure + `clearExhibitAnnotations(slug)` (store.ts, raw-OPFS removeEntry recursive)
so it reseeds. Unchanged defaults (+ user edits, e.g. Voynich draw-tests) and user-created exhibits
are preserved. No version field — the object-source comparison self-detects drift; idempotent.
**User must RELOAD :5173 once** for the reconcile to run. Builds clean (171 modules).

## "Techno-Futures from Bidar" — the REAL annotated map (COMPOST fixture) — 2026-05-25
one.compost.digital is COMPOST magazine. The Bidar piece (Micah Alex) is an OpenSeadragon annotated
map. Found its data by fetching the page JS (`js/micah.js`): map = `/micah/nb-v24.jpg` (OSD
type:image), annotations = `/micah/micahsMapAnnotations.json` (25 items, each `{x,y,r,text,media[]}`
in MAP PIXELS). `scripts/import-bidar.mjs` (one-time; fetch via node, not Bash) converts each circle
→ xywh bbox `[x-r,y-r,2r,2r]`, real text → note body, image/audio media → appended markdown; emits
`apps/studio/src/bidar.ts` (object = the 4960×3508 map at the external URL; 25 real notes).
Wired as a 2nd DEFAULT exhibit (slug "bidar", single) beside Voynich (`DEFAULT_EXHIBITS[]`, per-slug
`seededFor`, migration prepends any missing default). Studio builds clean (171 modules). Exercises
the external-http-image path (resolveTileSource→image, OSD cross-origin). Media photos/audio are
markdown in the note bodies — render inline only in a markdown reader (Studio card shows the text
lead via stripMarkdown; form edits raw). CAVEAT: Bidar shows in the STUDIO (open it → real map + 25
regions, fitBounds-on-select). The bundled Viewer still renders only Voynich; Viewer-renders-any-
published-library is the deferred publish→Viewer-fetch slice (would surface Bidar + its photos).

## DEEP-LINK ARRIVAL (§82/§124) + interface-design standing rule — 2026-05-25
Viewer now lands in-context from a `#/a/<id>` deep-link: `ExhibitView` parses `location.hash`
(`parseNoteDeepLink`), finds the object whose annotations include the id, lands on it +
`initialSelected={id}` → the Reader/NarrativeReader start selected on that note → Canvas fitBounds
on initial select (§82). Cold-arrival chrome (§124): a fading forest-green "wax-seal" note ("You
followed a link to this note", `transition:fade`, auto-hide 6s, click-dismiss) — transparent, no
gate. Readers gained `initialSelected` (Reader guards its object-reset effect so it survives mount).
Viewer builds clean (3 pages). FOLLOW-UPS: breadcrumb/zoom-to-fit chrome (§124); referrer-based
trigger; IIIF Content-State (`?iiif-content`) arrival (encode/decodeContentState built in core).
- ⚙ DESIGN RULE (user, reinforced): **invoke /interface-design:interface-design for ALL Archie UI**;
  system.md is current (forest-green "scholar's ink" accent #3a6b4c; vermillion = error-only). Memory
  apply-interface-design-for-archie-ui updated.

## NARRATIVE layout (read-side) — v1 layout set COMPLETE — 2026-05-25
Single + Grid + Narrative all ship. The Bidar map is now a NARRATIVE exhibit: map on the dark canvas
+ an ordered prose-spine of its 25 field reflections (warm paper); click a reflection → map fitBounds
to its region; marker click → highlights its reflection; photos/audio render inline (renderMarkdown).
- `apps/viewer/src/components/NarrativeReader.svelte` (canvas + prose sections, section i ↔ annotation
  i by order).
- `sample-data.sectionsFor(slug)` — Bidar sections derived from bidarNotes (order-bound).
- `ExhibitView` builds the exhibit with `sections` → resolveLayout infers narrative → NarrativeReader.
- Viewer builds clean (3 pages). RULING applied: Narrative is v1 (Phase 3 ⊂ v1).
FOLLOW-UPS: (a) round-trip sections via manifest Ranges (`sectionsFromManifest` parser — toRanges
built) so sections come from the published tree not sample-data; (b) Studio narrative SECTION
AUTHORING (NarrativeEditor); (c) progressive marker reveal (§122). See docs/PRE-P3-UX-AUDIT.md.

## "Open .archie.zip" (storage chooser, Open half) + design restyle — 2026-05-25
- Studio Library home gained **"Open .archie.zip…"**: `App.openZip` reads a published zip via
  `loadLibrary` (ZipFilesystem.fromZip → publish↔load symmetry) and REPLACES the OPFS project
  (window.confirm-gated; clears outgoing annotation dirs; writes each imported exhibit's log). The
  symmetric inverse of Download. Builds clean (172 modules).
  DEFERRED (scope boundary, NOT crossed): **Open folder** (FsaFilesystem autosave-in-place) + the
  Playground/Project model = **invention #3 (gated)**. Recent-projects list. baseUrl subtlety:
  imported targets use the zip's publish base (demo zips use https://archie.demo/ → match canvasIdOf).
- DESIGN RESTYLE (user): accent vermillion → **forest green** ("scholar's ink", `--accent #3a6b4c`),
  added `--ink-on-accent: #fff`; updated in both apps' tokens.css + components (markers.css/Publish/
  LibraryHome/Reader). Coherent — tokens defined in both apps; builds clean. Use these tokens for new UI.

## RULING: Phase 3 ⊂ v1 (user) + A2/stroke-over-stroke markers — 2026-05-25
RULING: "Phase 3 is part of v1" — it's a sequencing/gate label, NOT post-v1. ⇒ Narrative is a v1
gap (build prose-pane); the 5 un-built inventions (overview-as-canvas, playground→project, three-
configs-as-Project, identity-prompt, layout-picker) are v1, each gated. See docs/PRE-P3-UX-AUDIT.md
(6 gaps + Narrative). Merge summary panel + conflict-card (inventions #4/#5) already prototyped.
DONE (audit gap #1): **A2 + stroke-over-stroke markers** — `apps/{studio,viewer}/src/markers.css`
(import AFTER Annotorious CSS). Annotorious default inner stroke is BLACK + outer hidden → invisible
on the dark table; override = light outer halo + vermillion inner (legible on any bg), low weight,
full on .selected. Both build clean. Browser-verify selected/hover emphasis.
REMAINING v1 (priority): storage chooser (Open folder/zip) · Narrative prose-pane · deep-link
arrival · EXIF bake · ⌘K linking · AV · the 5 gated inventions.

## REAL disk publish→fetch (vite-node) — 2026-05-25
The Viewer now reads the published library over HTTP from real files (was in-memory). Closes the
deploy loop: gen → static tree → fetch.
- `apps/viewer/scripts/gen-published.mts` (run with **vite-node** — the missing "node way to run the
  TS core"): publishLibrary → MemoryFilesystem → collectFiles → writes the tree to
  `apps/viewer/public/published/` (62 files: collection/exhibits/{slug}/manifest + canvas pages +
  history). `pnpm add -D vite-node` (viewer). Scripts: `gen`, and `predev`/`prebuild` auto-run it.
- `apps/viewer/src/published.ts` — now a PURE HTTP-fetch consumer: `fetch(/published/{slug}/
  manifest.json)` → objectsFromManifest (+ title from IIIF label) → fetch each
  `/published/{slug}/canvas/{objId}/annotations.json`. No in-app publish import. This is exactly the
  deployed GH-Pages consumer path (swap the base for the live origin).
- Verified: lifecycle build runs prebuild→gen (62 files) → 3 pages; dist/published/ copied; bidar
  manifest+25 annotations valid; canvas ids match canvasIdFor → markers resolve.
⚠ RUN NOTE: `predev`/`prebuild` only fire via `pnpm --filter @archie/viewer dev|build` (lifecycle).
`pnpm exec astro dev` BYPASSES them — run `pnpm --filter @archie/viewer gen` once first (or use the
lifecycle scripts). public/published/ is generated (regen when the library changes).

## Publish→Viewer: Viewer renders the whole published library — 2026-05-25
The Viewer now renders BOTH exhibits from the published form (client-side publish→read-back, no
toolchain): gallery → /voynich (5-folio grid) + /bidar (the COMPOST map). Closes the dogfood loop.
- `apps/viewer/src/bidar.ts` (import-bidar.mjs now writes BOTH apps); `sample-data.ts` = multi-exhibit
  Library (voynich + bidar), `canvasIdFor(slug,objId)`, `getLog(exhibitId)` by id; `published.ts`
  `loadPublishedExhibit(slug)` + `libraryCards`; `ExhibitView` takes a `slug` prop.
- Pages: `index.astro` gallery = 2 cards (→ /voynich, /bidar); `sample.astro`→`voynich.astro`
  (route /voynich); new `bidar.astro`. 3 pages build clean.
- Bidar's note media (photos/audio) are markdown → render in the Viewer's detail drawer
  (renderMarkdown). The map is an external URL (cross-origin OSD display).
SEAM NOTE: still in-memory publish→read-back (MemoryFilesystem), client-side. The remaining real-
deploy piece is generating the published tree to DISK + HTTP fetch (needs a node way to run the TS
core — no tsx; deferred). The contract + parsing are validated in-app, so that's mechanical.

## Whole-library publish — 2026-05-25
Download + GitHub publish now emit the WHOLE library (every exhibit), not just the current one — the
published site IS the library (collection.json + Gallery list all exhibits). `buildFullLibrary()`
maps all `libraryMeta.exhibits`; `loadAllLogs()` keys each exhibit's log by id for publishLibrary's
getLog — current exhibit = the live `session.entries` (freshest, incl. unsaved); others load from
their OPFS annotations dir. getAsset already per-slug. Publish dialog copy → "this whole library".
Builds clean (170 modules); tests unchanged (234 — no tested package touched).

## P2-X DONE: publish imported assets (zip + GitHub) — 2026-05-25
Imported-image exhibits now publish to BOTH `.archie.zip` AND GitHub Pages.
- `publishLibrary` `getAsset(slug,name)` writes asset bytes to `{slug}/assets/{name}` + rewrites the
  canvas image URL (backward-compatible). store.ts `readAssetBytes`; Studio Download + collectSiteFiles
  both pass getAsset.
- ghpages.ts is binary-aware: `FileContent = {text}|{base64}`; collectFiles base64-encodes
  image/av/pdf (chunked btoa), JSON as text; `publishToGitHub` uploads base64 entries as git blobs
  (POST /git/blobs {content,encoding:"base64"}) → sha tree entry. +3 core tests (site 6, ghpages 3;
  core 198, workspace 234). GitHub fetch sequence stays browser-verified (needs a real repo+PAT).

## P2-6: easier object CHOOSING (thumbnail rail) — 2026-05-25
The Studio object rail now shows a THUMBNAIL + label + note count per object (was text-only), so you
choose visually. `thumbSrc(o)` resolves each object's image (asset → blob: URL via assetUrls, else
its path/URL — reuses the P2-7 resolution). Builds clean (170 modules). Label ellipsis-clamped;
`title` tooltip carries the full label.

## Editable object labels — 2026-05-25
Object labels are now renameable (imported files get auto-labels from the filename). `renameObject`
(App.svelte) updates the label in `libraryMeta` + persists to library.json. Sidebar shows an
editable `.object-title` input (Cormorant title; reveals as editable on hover/focus) for the current
object; Enter/blur commits; rail tab + persistence update reactively. Works for any object (Voynich
folios too). Label is display-only — annotations key off objId, so renaming is safe. Builds clean.

## P2-7: easier object IMPORTING (file pick + drag-drop, OPFS-persisted) — 2026-05-25
Studio can now import LOCAL image files (was URL-only). Builds clean (170 modules).
- `store.ts`: `saveAssetFile(slug,name,file)` + `readAssetUrl(slug,name)` — RAW OPFS handles (binary
  bypasses the JSON seam). Bytes persist at `{PROJECT}/exhibits/{slug}/assets/{name}`.
- `App.svelte`: imported files get `source = "/assets/{name}"`; `resolveAssets(slug,objs)` reads them
  back to blob: URLs into `assetUrls` (objId→url) at `openExhibit`; `currentSource` resolves the
  Canvas source; Canvas gated behind `assetsReady`. Blob URLs REVOKED on `backToLibrary` + at the
  start of `resolveAssets` (no leak). `addObjectFromFile` reuses one blob URL for dims + display;
  `addFiles` handles multi-file; drag-drop onto `<main>` (`.drag-over` feedback) + a "Choose image…"
  file input in the +Object form; URL/path import retained.
- ⚠ Publishing imported-file objects does NOT work yet (source is OPFS-local) — that's **P2-X** in
  PHASE-2.md (publishLibrary must copy asset bytes into `{slug}/assets/` + rewrite the canvas URL).
  Voynich (real `/voynich/*` public paths) publishes fine.
- BUGFIX (import render): OSD tried to load `blob:.../info.json` (Security Error) — `resolveTileSource`
  (core iiif/resolve.ts) fell through to "IIIF base + /info.json" for the extensionless blob: URL.
  FIX: `blob:`/`data:` URLs classify as `{kind:"image"}` up front (+2 core tests, 195 total). The
  imported image now renders. Extensionless http URLs still treated as IIIF bases (intentional).
- Review fixes: file input resets value after pick (re-pick same file fires); `addObjectFromFile`
  guards on `storeReady` (no broken object when OPFS unsupported); `currentSource` falls back to the
  path (not blank) if an asset fails to resolve; `ondragleave` guarded against child-element flicker.
  BROWSER-VERIFY: drop image → reload → reopen exhibit → still renders (OPFS round-trip).

## BUGFIX: "Import changes" crash on plural heads (Q-6) — 2026-05-25
Clicking "Import changes" twice (or on a persisted conflict) threw `plural heads for {id} — resolve
the concurrent merge first (Q-6)`: the demo's `editNote(objNotes[0])` can't advance a note that
already has plural heads (correct spine behavior). FIX (apps/studio/src/App.svelte): importChanges
bails if `session.conflicts().length > 0` (surfaces them instead); the button is `disabled` while a
conflict is open; `openExhibit` sets `conflicts = session.conflicts()` so a persisted unresolved
merge shows in the panel on load. Resolve via MergeReview → button re-enables. Builds clean.

## ✅ DRAW CONFIRMED WORKING (user, 2026-05-25) — temp console.debug REMOVED from mount.ts.
The full Studio loop (draw → create → edit → multi-object switch → publish) is user-validated in
the browser. mount.ts diagnostics stripped (mount typecheck clean, 18 tests pass). The "DO NOT
strip" warnings in older sections below are now historical.

## Status (2026-05-25): v1 data layer + BOTH app surfaces built. 210 tests green, typecheck clean.

Data/logic layer complete in `@render/core` (TDD). Both surfaces now BUILD + RUN (browser-verify
pending): **Studio editor** (`apps/studio`, vite, :5173) and **Viewer** (`apps/viewer`, astro, :4321).
Body sanitization (XSS gate §151) added. Run: `cd apps/studio && ~/.npm-global/bin/pnpm exec vite`
· `cd apps/viewer && ~/.npm-global/bin/pnpm exec astro dev --port 4321`.

### Remaining (for a FRESH session — pick up here)
1. **Layouts**: Single ✅ + Grid ✅ (overview built 2026-05-25, see bottom section). Grid *slideshow
   sub-mode* (step through objects fullscreen) NOT built. **Narrative is PHASE 3, not here** —
   strategy §31/§36 list it as an invented, human-gated interaction (prose + Range-bound sections);
   build it as a Phase-3 prototype → STOP for the comprehension gate. Earlier HANDOFF lines that
   lumped Narrative into "Phase-2 remaining UI" were drift — corrected.
2. **Library multi-exhibit screen** (Studio): list/organize exhibits (the Q7 Library home).
3. **Storage chooser + live save/load**: OPFS backend (new, browser; mirror FsaFilesystem) + "Open folder / Open zip" + autosave.
4. **EXIF pixel transform** (canvas — browser; the orientation→transform MAPPING is done in `exif/orientation.ts`).
5. **Merge resolution** (Q-7): LOGIC DONE — `resolveConflict` (multi-parent mergeParents, 4 tests). REMAINING = only the conflict-card UI that drives it (Phase-3/browser).
6. **Phase-3 invention prototypes** (human-gated §83): merge summary panel, playground→project, overview-as-canvas, cold-arrival chrome. Build prototype → STOP for the user's comprehension test.
7. GH-Pages publish adapter (Contents API, ~200 LOC, browser/network over the zip primitive).

> Approach that held all session: logic in headless-tested plain-TS controllers (`AnnotationSession`,
> `CanvasController`, the spine, `sanitizeHtml`); thin Svelte/Astro shells verified by `vite build`/
> `astro build`; real OSD render = browser. Keep that split. Use `~/.npm-global/bin/pnpm` (corepack broken).

---
### (history) v1 data/logic layer (198 tests) — remaining was browser/human

**Built + verified headless (198 tests: core 174 / mount 18 / svelte 6):**
- **Spine** (Phase 0): append-only log · version-DAG merge (rev-based) · heads projection ·
  heads/history WADM serialize + **deserialize** (reload) · the pure-WADM-consumer interop GATE.
- **Extraction** (Phase 1): `@render/mount` OSD+Annotorious wiring + the fitBounds oracle gate ·
  `@render/svelte` `CanvasController` (the selection inversion).
- **Persistence**: `writeAnnotations`/`readAnnotations` over the Filesystem seam (round-trip).
- **IIIF**: `toManifest`/`objectsFromManifest` · `toCollection` · `toExhibitsJson` + `shouldRenderGallery` (UX-Q7).
- **Storage backends**: `MemoryFilesystem` · `ZipFilesystem` (fflate) · `FsaFilesystem` (DOM-typed) ·
  a **conformance suite** run against Memory+Zip (caught + fixed an empty-dir divergence).
- **Publish ↔ Load**: `publishLibrary` + `libraryToZip` (zip primitive) ↔ `loadLibrary` (round-trip).
  **Phase-2 interop GATE**: consumer traversal collection→manifest→canvas→per-canvas heads page
  (caught + fixed a real bug — the manifest pointed at heads pages publish didn't write).
- **AV**: `parseVtt`/`parseSrt` + `importTranscript` (supplementing time-range Notes).
- **Layers/Tags**: `filterByLayer`/`filterByTag` (+ `archie:layers` round-trip).
- **Schema migration**: `migrate`/`stamp` (§39 orphan gate — runner in place; exhibits.json stamped).
- **Linkability**: `buildLinkIndex` · `resolveLink` · `validateLink` (locked frame).
- **EXIF**: `orientationTransform`/`normalizeDimensions` (all 8; pixel-push is browser).
- **Bundle measurement** (`docs/bundle-size.json`): Archie core ~8KB gz; OSD+Annotorious floor
  **~223KB gz** — at the 240KB budget BEFORE UI (confirms §150; precise app number = dogfood).

**Decisions: Q-1..Q-7** (`docs/decisions/archie.md`) + ADR-0003 amendment (`rev`). Q-7 = merge
resolution needs multi-parent nodes — DEFERRED with the Phase-3 conflict-card UI.

## REMAINING = browser/human (cannot be done autonomously without reward-hacking, §89)
- **Phase 2 UI**: Studio editor (adopt anvil) + Viewer reader (adopt annomea) as Svelte/Astro;
  Single+Grid layouts; "Open folder / Open zip" chooser; GH-Pages publish walkthrough.
  The `@render/core` data layer they consume is DONE; wiring is browser-verified.
- **Dogfood + real bundle measurement** (strategy §33 response tiers) — human-run value gate.
- **Phase 3** (6 invention comprehension gates) — human-gated (§83); build prototype, STOP for user.
- **Phase 1 visual check** (real OSD render vs anvil-stock) — human, in a browser.
- **Render-layer bits deferrable to the adapter**: body sanitization (DOMPurify), EXIF pixel
  transform (canvas), empty/error/loading states, overlay-contrast — all browser/perceptual.
- **Merge resolution** (Q-7) — multi-parent model, build with the Phase-3 conflict-card UI.

---
## (history) Phase 0 ✅ · Phase 1 ✅ · Phase 2 SOURCE spine ✅ (UI/dogfood = browser/human)

**Phase 2 source side complete** (machine-verifiable; the UI projection is browser/human):
- `@render/core` persistence: `writeAnnotations`/`readAnnotations` over the Filesystem seam;
  `deserialize` (history pages carry `archie:` DAG metadata — the reload/merge source).
- IIIF projections: `toManifest` / `toCollection` / `toExhibitsJson` + `shouldRenderGallery` (UX-Q7).
- Storage backends behind the seam: `MemoryFilesystem`, `ZipFilesystem` (DownloadFilesystem core,
  fflate), `FsaFilesystem` (Chromium folder, typechecked vs DOM FSA — browser-verified).
- Publish: `publishLibrary` + `libraryToZip` (the architectural zip primitive).
- **Remaining Phase 2 = UI + dogfood** (Studio editor / Viewer reader / layouts / chooser /
  bundle measurement) — needs a real browser + human value-gate. Seed `Archie-79be` (needs-triage).
- Other v1 PURE features still buildable headless (in progress): VTT→WADM transcript adapter,
  tag/layer filtering, body sanitization, EXIF orientation mapping, schema migration runner.

---
## (earlier) Phase 0 ✅ + Phase 1 ✅ (logic-verified; one visual check owed)

**Phase 1 (extraction) complete at the logic level** — the spike's one ~1-week delamination is done:
- `@render/mount`: `createMount` wires real OSD + Annotorious (typechecks against real types),
  degenerate-guard carried verbatim, selection INVERTED into `onSelect` + `setSelected`,
  fitBounds routed through the pure `dispatchFitBounds` oracle.
- `@render/svelte`: `createCanvasController` (plain-TS binding logic, the inversion) + thin
  `Canvas.svelte` shell. **117 LOC total** (well under the <500 budget).
- THE GATE (`gate.test.ts`): the new path's fitBounds rect == the anvil-stock characterization
  oracle (`fitBoundsRect`, lifted from `fitForSidebar`), for rect + polygon + sidebar expansion.
- **117 tests green** workspace-wide (core 93, mount 18, svelte 6); typecheck clean.
- happy-dom is the mount test env (OSD touches `document` at import; recorded in mulch infra).

**⚠ OWED (Phase 1 partial):** real-OSD visual equivalence vs anvil-stock in a browser is a
HUMAN verification (the headless gate proves the *logic*; happy-dom only imports OSD, can't
render). mulch: `phase-1-gate-logic-proven-visual-owed`. Seed Archie-0454 closed `outcome:partial`.

---
## (history) Phase 0 — hard gate to Phase 1 passed

Monorepo + the data-model spine (the keystone) are built and green.

**Verify (run this first to confirm state):**
```
cd /mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie
~/.npm-global/bin/pnpm -r --no-bail test   # 96 tests: core 93, mount 2, svelte 1
~/.npm-global/bin/pnpm -r typecheck         # clean
```

> ⚠️ TOOLING: the corepack `pnpm` shim is BROKEN on this box (ERR_VM_DYNAMIC_IMPORT...).
> Always use the full path `~/.npm-global/bin/pnpm` (v10.32.1). Recorded in mulch infrastructure.

### What exists (`packages/`)
- **`@render/core`** (pure TS, the keystone) — all green:
  - `wadm/brand.ts` — branded ids: `LogicalId`, `RevId`, `VersionId`, `ClientId`, `ExhibitId`;
    ULID `mintLogicalId`/`mintRevId`; `{logicalId}/v{n}` version-id grammar.
  - `wadm/types.ts` — WADM structural types (local, NOT from Annotorious — keeps core pure;
    Phase 1 must verify structural compat at the `W3CImageFormat` mount seam) + `AnnotationRecord`.
  - `spine/log.ts` — append-only log: `append` + `appendNew/appendEdit/appendDelete` +
    `linearHead`. Single-writer invariants in helpers; log type tolerates plural-head collisions.
  - `spine/merge.ts` — version-DAG: `lineage/ancestors/commonAncestor/headsOf/mergeLogs/`
    `classifyMerge/classifyLogical/conflictTiebreak`. Walks by `rev`. modifiedAt tiebreaker-ONLY.
  - `spine/heads.ts` — `projectHeads` (pure, idempotent; plural heads; tombstone exclusion).
  - `spine/serialize.ts` — `toHeadsPage/toHistory/recordToAnnotation`; citation ids + Q-6 collision suffix.
  - `geometry/selector.ts` — `parseFragmentXYWH/parsePolygonPoints/polygonBBox/selectorBBox/`
    `isDegenerateSelectorValue/shapeLabel/isV1Shape` (lifted from anvil).
  - `url/deeplink.ts` — IIIF Content State `encode/decodeContentState` + `#/a/<id>` deep-link.
  - `iiif/resolve.ts` — `resolveTileSource` (image vs external info.json) + `isIiifImageInfo`.
  - `fs/seam.ts` — `Filesystem/FsDirectory/FsFile/FsWritable` interfaces (NO backends — Phase 2).
- **`@render/mount`** — stub declaring the imperative `MountSurface` contract (fitBounds/
  setSelected/destroy/onSelect). Filled in Phase 1 (spike-0001 module 1 delamination).
- **`@render/svelte`** — stub. Thin adapter, filled Phase 1.
- **`apps/studio`** (Svelte SPA) + **`apps/viewer`** (Astro+islands) — boundary shells;
  toolchain declared (vite.config / astro.config), NOT in the test gate, filled Phase 2.

### Decisions minted this phase (cite, don't relitigate — `docs/decisions/archie.md`)
- **Q-1** ADR-0001 exhibit-nested objects · **Q-2** ADR-0002 3-layer render + Svelte ·
  **Q-3** ADR-0003 annotation spine · **Q-4** ADR-0004 no wasm-vips · **Q-5** source-before-projection.
- **Q-6** concurrent-head version-id collision: log tolerates, serialization disambiguates
  (`~{rev}` suffix on the higher rev; renumbering REJECTED — breaks citation integrity).
- **ADR-0003 AMENDED (2026-05-25)**: added `rev` (per-record ULID DAG-node id) distinct from
  the `{logicalId}/v{n}` citation IRI — `parent` points to `rev`. Found during P0-4 (the
  version-id can't be both citation IRI and DAG node under 2nd-order concurrency). See the
  Refinement section in `docs/adr/0003-...md`.

### The GATE proven (strategy line 18)
`spine/interop.test.ts` — a pure WADM consumer sees exactly one head/logicalId, zero history
leak; plural heads on unresolved merge = honest degradation; tombstones hidden. The eventual
Mirador/UV test is still owed; this unit surrogate is the Phase-0 gate.

### Conventions worth knowing (code comments, surfaced here)
- **WADM `@context` is page-level ONLY**, never on per-item annotations (Q-3 "context never
  mixed"). `recordToAnnotation` defaults `withContext=false`. (mulch: wadm-context-page-level-only)
- Cross-package workspace imports are EXERCISED: `@render/mount` runtime-consumes
  `@render/core` (`boundsForSelector`); `@render/svelte` types against both. `workspace:*` +
  core's `exports` map (incl. `./spine`) work.

### Phase-1 PRECONDITION verified ✅
anvil's test suite runs + passes in this environment: `cd ../anvil/app && ~/.npm-global/bin/pnpm test`
→ **304 tests, 23 files, all green** (vitest 4.1.7). The characterization-testing oracle for
Phase 1 is real. anvil is a SIBLING of Archie: `/mnt/Ghar/2TA/DevStuff/Annotators/Image/anvil`.

## NEXT: Phase 2 — Adopted-core milestone (the working tool; ZERO inventions)

Per strategy §25-33 + §135. Skill rhythm: `executing-plans` · `dispatching-parallel-agents`
(Studio + Viewer proceed in PARALLEL once `@render/svelte` exists — it now does) ·
`verification-before-completion` · per-leaf `/thermo-nuclear-code-quality-review`.
**First do a Phase-2 decomposer pass** (`writing-plans` → `docs/plans/PHASE-2.md` + Phase-2 seeds).

Phase 2 = the thin end-to-end annotate-and-publish-to-GH-Pages tool:
- Single + Grid layouts, object-led reading default, markers visible (A2 + stroke-over-stroke).
- anvil's editor (canvas+sidebar) + annomea's reader (popup/drawer) via `@render/svelte`.
- list-UI Library; the full fitBounds nav contract (mount already supports it).
- **Storage: the `Filesystem` seam + BOTH backends** — `FsaFilesystem` (Chromium folder) +
  `DownloadFilesystem` (zip-as-canonical-file). Plain "Open folder / Open zip" chooser. The seam
  interface is already in `@render/core/fs/seam.ts`; backends are the Phase-2 projections.
  (Donor: anvil `lib/storage/backends/fsa.ts` + `handles-db.ts`.) Defer the *invented* entry-flow
  (Demo/Real door split, "Project" abstraction) to Phase 3 — keep that line crisp.
- GH-Pages publish via the GitHub Contents API.
- **DOGFOOD + measure the REAL bundle** (strategy §33): within ~2× of 240KB → ship + document;
  2–4× → tree-shake/lazy pass; >4× → escalate. 240KB was never validated — measurement triggers
  the action, don't re-debate the number.

**Before Phase 2:** the Phase-1 visual check above (human, in a browser) ideally clears first.
Also: the app shells (`apps/studio`, `apps/viewer`) have entry points but their toolchains
(`svelte`/`vite`/`astro`) are declared-not-yet-`pnpm dev`-run — first Phase-2 act is verifying
`pnpm --filter @archie/studio dev` serves the blank shell.

## ⚠ Phase 3 needs the HUMAN (cannot be done autonomously)
Strategy §83 + §196: the six invention comprehension gates ("does a non-technical author grok
the merge summary panel?") require real user-testing. An LLM CANNOT substitute. Phase 3 = build
the prototype → STOP for the user's gate. Don't ship inventions on the LLM's own say-so.

(Phase 1 donor refs retained below for history.)
### Phase 1 (done) donor refs
`anvil/app/src/lib/viewer.ts` (createViewer), `EmbeddedReader.svelte:288-338` (fitForSidebar),
`App.svelte:308` ($effect inversion). Use `~/.npm-global/bin/pnpm`; Docs MCP for OSD/Annotorious.

## Seeds / mulch
- All 9 Phase-0 seeds closed (`sd list`). Phase-1 seeds not yet created (decompose just-ahead).
- mulch `decisions` + `infrastructure` domains seeded; key records: pnpm-shim failure,
  wadm-types-local pattern, ADR-0003 amendment, phase-0-interop-gate-passed.

## Runnable verification demo (apps/studio)
`cd apps/studio && ~/.npm-global/bin/pnpm exec vite` → http://localhost:5173/. Self-contained
(public/sample.svg, no network). Demonstrates the full stack: spine→adapter→OSD+Annotorious,
fitBounds-on-select, layer filter, `Download .archie.zip` (libraryToZip). Real bundle 287KB gz
(mulch: studio-demo-real-bundle-287kb-gz). Mount gained `setAnnotations` + `canvasId`.

## Studio EDITOR built (browser-verify pending) — 2026-05-25
Viewer demo is now a real editor. Logic in `@render/core` `AnnotationSession` (5 tests). Mount
contract gained drawing + onCreate/onUpdate/onDelete + setAnnotations + canvasId. App.svelte =
draw→create→WADM form→edit/delete, layer filter, fitBounds-on-select, Download .archie.zip.
Run: `cd apps/studio && ~/.npm-global/bin/pnpm exec vite` → :5173. NEXT: Viewer app (Astro+islands) ·
layouts (Single/Grid/Narrative) · storage chooser+live save · sanitization/EXIF-pixel · merge resolution (Q-7) · Phase-3.

## Viewer app built (browser-verify pending) — 2026-05-25
apps/viewer (Astro + Svelte island). `Reader.svelte` = read-only OSD + annomea 3-state pane +
popup on select, reads published heads-page form. `index.astro` hosts it `client:only="svelte"`
(OSD can't SSR — touches document at import). astro build OK (267KB gz). Run: `cd apps/viewer &&
~/.npm-global/bin/pnpm exec astro dev` → :4321. NEXT remaining: layouts (Single/Grid/Narrative) ·
Library multi-exhibit screen · storage chooser + live save/load · sanitization · EXIF-pixel ·
merge resolution (Q-7 multi-parent) · Phase-3 invention prototypes.

## UI design system applied (2026-05-25)
Studio + Viewer restyled to `.interface-design/system.md` ("curator's study at night": dark
light-table canvas + warm-paper panels + vermillion accent; Cormorant/Crimson/Work Sans/JetBrains).
Canonical tokens: `apps/{studio,viewer}/src/tokens.css`. Both build clean. **Always apply the
interface-design skill + system.md when building Archie UI** (user directive; memory saved).

## Viewer Gallery landing + as-built patterns saved (2026-05-25)
`index.astro` = static Gallery (gallery-wall + exhibit cards, system.md §Gallery); reader at
`/sample`. 2 pages build clean. As-built component patterns appended to `.interface-design/system.md`
(toolbar / note-card / WADM form / reader drawer+popup / light-table header / eyebrow).
REMAINING UI (each via the design system): Grid/Narrative layouts (need multi-object sample) ·
Studio Library multi-exhibit screen · storage chooser + OPFS backend + live save · conflict-card UI
(drives the built `resolveConflict`) · GH-Pages publish walkthrough · Phase-3 invention prototypes.

## Live persistence + Merge UI built (2026-05-25)
- **Persistence**: Studio autosaves to OPFS (apps/studio/store.ts via FsaFilesystem) + load-on-mount
  + Save/dirty indicator. Edit→reload→persists (browser-verify).
- **Merge UI** (CONTEXT #1 invention): AnnotationSession.importChanges/conflicts/resolve (6 tests);
  apps/studio/MergeReview.svelte = "Import changes"→summary panel→conflict cards→resolveConflict.
  Q-7's UI half DONE; comprehension gate (user-run) remains. 215 tests, all builds clean.
REMAINING: Grid/Narrative layouts (multi-object sample) · Library multi-exhibit screen ·
empty/loading/error states (orphan gate §39) · GH-Pages publish walkthrough · EXIF pixel transform.

## ⚠ KNOWN BUG — draw doesn't create notes (fix FIRST, next session)
Clicking ▭ Rect / ⬠ Polygon then dragging on the canvas does NOT produce a note. The wiring
exists (Canvas `drawing`/`tool` props → `surface.setDrawingEnabled`/`setDrawingTool`; Annotorious
`createAnnotation` → `surface.onCreate` → `App.onCreate` → `session.createNote`). Suspects, in
priority order (debug in a browser with the console open):
1. ~~Tool names~~ RULED OUT — anvil uses `setDrawingTool('rectangle')` (App.svelte:1033), so
   `"rectangle"`/`"polygon"` are correct. **Strongest lead instead:** in `Canvas.svelte`, `surface`
   is a plain `let` (NOT `$state`), so the `$effect`s calling `setDrawingEnabled`/`setDrawingTool`
   may not run after `surface` is assigned in onMount. FIX: call `surface.setDrawingTool(tool)` +
   `surface.setDrawingEnabled(drawing)` explicitly at the END of onMount (after surface is set),
   and/or make `surface` reactive. Also confirm anvil pairs `setTool` with `setDrawingEnabled(true)`.
2. **`mountPlugin(annotator)` ordering / drawing not actually enabled** — verify `setDrawingEnabled(true)`
   takes effect; log it. Maybe needs the tool set first, or a different enable API.
3. **`createAnnotation` event** — log inside the `annotator.on("createAnnotation", …)` handler in
   `mount.ts` to confirm it fires on draw-complete; if it fires but `onCreate` doesn't, the
   listener-set wiring is the bug.
4. **degenerate-guard monkey-patch** (mount.ts store.addAnnotation) — likely NOT it (the store holds
   Annotorious's internal geometry format, so `selectorValue` returns undefined → not suppressed),
   but confirm it isn't swallowing the drawn shape.
Reproduce in `apps/studio` (:5173). Browser-only (can't headless-test OSD drawing).

## Roadmap remaining (after the draw fix)
multi-object exhibits + Grid layout · Narrative layout · Studio Library multi-exhibit screen ·
GH-Pages publish walkthrough (Contents API) · EXIF pixel transform (canvas) · Phase-3 invention
prototypes (playground→project, overview-as-canvas, cold-arrival chrome — human-gated §83).
All UI via the interface-design skill + `.interface-design/system.md`.

## Narrative data foundation + draw race-fix (2026-05-25)
- **Narrative**: model `Section` + `Exhibit.sections?`; `toRanges()` + `toManifest` `structures[]`
  (Section→IIIF Range, start=canvas/region). Pure, tested (187 core). Prose-pane UI remains (browser).
- **Draw**: Canvas.svelte now applies drawing state at end of onMount (mount-race fix). UNCONFIRMED
  root cause — re-verify in browser; if still broken, console-log `createAnnotation` firing + whether
  `session.notes()` grows on draw (see KNOWN BUG section).
Tests: 217 workspace (core 187). Roadmap left: Narrative prose-pane UI · multi-object+Grid ·
Library screen · GH-Pages publish adapter · EXIF pixel transform.

## Layout resolver (2026-05-25)
resolveLayout + Exhibit.layout (single/grid/narrative); v1 layout set data-complete (221 tests). Layout UI rendering remains (browser): grid thumbnails, narrative prose-pane.

## GH-Pages adapter core (2026-05-25)
publish/ghpages.ts: collectFiles + buildGitTree (pure, tested); publishToGitHub fetch-sequence sketched (browser). 223 tests. Publish logic-complete; "Connect to GitHub" token UI remains (browser).

## Draw bug — diagnostic logging added (2026-05-25)
TEMP console.debug in mount.ts: setDrawingEnabled / setDrawingTool / createAnnotation-fired. Reload :5173, open console, click Rect + drag.
Interpret: no "setDrawingEnabled true" on click -> Canvas $effect/wiring; enabled-but-no-"createAnnotation" -> drawing not really enabled in Annotorious (tool/plugin/gesture); createAnnotation-fires-but-no-note -> onCreate/createNote/setAnnotations render. REMOVE the TEMP logs after fix.

## DRAW BUG ROOT-CAUSED + FIXED (2026-05-25)
The App crashed on mount: notes {#each (r.logicalId)} collided under plural heads (unresolved conflict restored from OPFS) -> each_key_duplicate -> whole App dead -> draw appeared broken. FIX: key by r.rev. LESSON: never key/id UI by logicalId (plural heads share it); workingAnnotations id=logicalId has the same risk (Annotorious dup id under conflict) — change to rev if it surfaces. Temp console.debug logs in mount.ts still present — remove once draw confirmed.

## Draw debug — refined (2026-05-25)
Console on reload shows ONLY mount-time `setDrawingTool rectangle` + `setDrawingEnabled false`; clicking ▭ Rect logs NOTHING. So the toolbar click is not reaching Canvas. Two cases to isolate ON A CLEAN STATE (DevTools>Application>Storage>Clear site data, then HARD reload — the persisted unresolved-conflict OPFS state may still half-break the App):
  (a) If after clearing, clicking Rect logs `setDrawingEnabled true` + draw works -> it WAS the conflict-state (plural heads) breaking render; then also fix workingAnnotations id=logicalId -> use a unique id (rev-suffixed) so Annotorious does not get dup ids under a loaded conflict.
  (b) If clicking Rect STILL logs nothing on a clean state -> genuine wiring bug in App.svelte: the tool `<button onclick>` -> `mode`/`tool` $state -> `drawing={mode==="draw"}` prop -> Canvas `$effect(setDrawingEnabled(drawing))` chain. Check: is the header button actually clicked (add a console.log in the onclick)? Is `drawing` prop updating? Is the $effect re-running? Likely a Svelte 5 reactivity/prop issue or the button is covered.
Draw is the FIRST fix next session. Temp console.debug logs in mount.ts remain.

## DRAW BUG ACTUALLY FIXED (2026-05-25)
ROOT CAUSE: Canvas.svelte $effects used `surface?.setX(prop)` — surface undefined on first run (async mount) -> optional-chain short-circuits BEFORE reading the reactive prop -> effect never subscribes -> never re-runs on tool-click (no setDrawingEnabled log). FIX: read prop into a local first (`const d = drawing; if (surface) surface.setDrawingEnabled(d)`), all 4 effects. RULE: Svelte 5 $effect must read reactive deps before any short-circuiting guard. If confirmed working, REMOVE the temp console.debug in mount.ts.

## GRID LAYOUT built (Phase 2) — 2026-05-25
Phase-2 layout set now COMPLETE (Single + Grid). Strategy §27 = "Single + Grid layouts, object-led
reading default"; §31/§36 = Narrative/overview-as-canvas are Phase-3 inventions (gated) — kept OUT.
Built (viewer builds clean, 269KB gz island; 223 tests still green — core 193/mount 18/svelte 12):
- `apps/viewer/src/sample-data.ts` — a REAL typed `Exhibit` (3 objects: Portrait/Letter/Landscape,
  `layout:"grid"`) + per-object note logs projected via `toHeadsPage` (per-object canvas ids
  `…/{slug}/canvas/{objId}`). Honest projection through the model, not an ad-hoc literal.
- `apps/viewer/public/object-2.svg` + `object-3.svg` — 2 distinct sample objects (not crops).
- `components/ObjectGrid.svelte` — the exhibit's object overview: objects glow on the dark
  light-table (system.md signature). PLAIN thumbnail grid — deliberately NOT the Phase-3
  "overview-as-canvas" invention.
- `components/ExhibitView.svelte` — orchestrator: `resolveLayout(exhibit)` → ObjectGrid ⇄ Reader;
  holds `selectedObjectId`; single→straight to Reader, grid→pick object→read→back. Mounted by
  `sample.astro` (client:only). `index.astro` gallery card updated (3 objects · 8 notes).
- `components/Reader.svelte` — parameterized to `{object,annotations,onback}` props (was hardcoded
  inline data). `onback` returns to the object grid (only for multi-object exhibits).
SEAM (next data slice, NOT done): Grid renders from the in-island typed Exhibit, NOT yet from
published static JSON. The `publishLibrary → exhibits.json/manifest/heads-pages → Viewer fetch`
wiring is the separate "publish→serve" slice (adjacent to the GH-Pages "Connect to GitHub" UI).
STILL OPEN (Phase 2): Studio Library multi-exhibit screen · storage chooser + OPFS live save ·
"Connect to GitHub" publish UI · EXIF pixel transform · publish→Viewer data wiring · empty/loading/
error orphan-gate states before public ship. Phase 3 (gated): Narrative, overview-as-canvas, etc.
⚠ STILL DO NOT strip the temp console.debug in mount.ts — draw not yet user-confirmed since the fix.

## "CONNECT TO GITHUB" PUBLISH UI built (Phase 2, strategy §32) — 2026-05-25
Studio gained the GH-Pages publish walkthrough (closes the annotate→publish value loop — the
Phase-2 dogfood claim). Studio builds clean (161 modules, EXIT 0).
- `apps/studio/src/Publish.svelte` — warm-paper dialog over the dark studio (system.md dialog
  elevation). Form: owner/repo/branch(default gh-pages)/token. State machine idle→publishing→
  done(commit+Pages URL)→error. Token is a password input, `autocomplete=off`, dropped on
  done/error/close — NEVER persisted (CONTEXT paste-each-publish). bind:value on inputs (NOT
  value+oninput with an inline `as` cast — Svelte template parser chokes on casts; see below).
- `apps/studio/src/App.svelte` — `buildLibrary()` extracted as the ONE source both Download and
  Publish project from; `collectSiteFiles()` = publishLibrary→MemoryFilesystem→collectFiles (same
  projection as the zip, different sink); `publish(target)`=publishToGitHub(files,target). Header
  "Publish…" button → dialog.
VERIFIED: UI + wiring compiles; the PURE tree-building (collectFiles/buildGitTree) is headless-
tested in core. NOT verified (browser/human — needs a real repo + PAT): the actual GitHub git-trees
round-trip in `publishToGitHub` (sketched, never headless-run). Don't claim publish "works" until a
real push succeeds in a browser.
⚠ LSP NOISE: the Svelte language server flags inline `as` TypeScript casts in template event
handlers as "Unexpected token", and cross-package `.svelte` imports as "cannot find module", and
`onclick`/`onsubmit` as unknown props. ALL are false positives — `vite build`/`astro build` (the
real gate) compile fine. Trust the build, not the inline diagnostics. Prefer `bind:value` over
value+oninput-with-cast to sidestep the cast issue.

## STUDIO LIBRARY MULTI-EXHIBIT SCREEN (Phase 2, Q-7) — 2026-05-25
The Studio is now a real multi-exhibit authoring tool (was one hardcoded exhibit). Builds clean
(163 modules, EXIT 0; 223 tests green). Done in 4 phases (A→D), each built:
- **store.ts** (Phase A): per-exhibit annotation dirs — `{PROJECT}/exhibits/{slug}/annotations/`,
  EXCEPT "sample" keeps the LEGACY `{PROJECT}/annotations/` path (migration: don't orphan pre-
  refactor work). Added `loadLibraryMeta`/`saveLibraryMeta` (authored structure at
  `{PROJECT}/library.json`) + `ObjectMeta`/`ExhibitMeta`/`LibraryMeta` types.
- **App.svelte** (B/C/D): `view` router ("library" | "editor"); `libraryMeta` $state +
  `currentSlug` + derived `currentExhibit`/`OBJECTS`; `canvasIdOf` is slug-aware. `openExhibit`
  loads that exhibit's per-exhibit session (seeds sample if empty; blank otherwise). `newExhibit`
  (title→unique slug, empty objects) + `addObject` (URL + label, best-effort `Image()` dims) →
  persisted to library.json. Publish/Download project the CURRENT exhibit (whole-library publish =
  later). Object rail gained "+ Object"/empty-state; sidebar guards the no-object case.
- **LibraryHome.svelte**: the authoring index — exhibit cards on the dark table + a dashed
  "New exhibit" tile. (Counterpart to the Viewer's published Gallery.)
- ⚠ SEAM FIX: `Canvas.svelte` reads `source` ONLY in onMount (no source $effect), so switching
  objects must REMOUNT to load the new image. Wrapped the Studio Canvas in `{#key canvasId}`. This
  also corrects the earlier multi-object rail (which would have shown the old image on switch — the
  user confirmed "draw works" but likely didn't catch this). Viewer is unaffected (it remounts the
  Reader via the grid round-trip). If a future change keeps a Canvas mounted across source changes,
  either key it or give Canvas.svelte a source $effect (destroy+recreate the surface).
Post-review fixes (advisor): `save()` skips writing empty heads/history for an exhibit with no
notes (`session.entries.length > 0` guard); "Import changes" disabled when the current object has
no notes. KNOWN LIMITATION (dogfood): `addObject` accepts any image URL incl. cross-origin — `<img>`
gives dimensions fine, but OSD tile-fetch of a cross-origin source without CORS headers may fail;
the author resolves that (don't claim arbitrary URLs always render).
STILL OPEN: whole-library publish (all exhibits, not just current) · object reorder/remove ·
real disk-publish (node build-script toolchain — no tsx/vite-node/core-build present; deferred) ·
EXIF pixel transform · Phase-3 inventions (Narrative, overview-as-canvas — gated).

## PUBLISH→VIEWER CLOSE-THE-LOOP (Phase 2) — 2026-05-25
The Viewer now renders WHAT THE PUBLISH PIPELINE EMITS, not hand-projected data (the dogfood
claim). Client-side, no node build-script: `published.ts` runs the sample Library through
`publishLibrary` into a MemoryFilesystem, then reads it back exactly as a static GH-Pages consumer
would — `{slug}/manifest.json` → `objectsFromManifest` → objects; `{slug}/canvas/{objId}/
annotations.json` → that object's notes. Swap MemoryFilesystem for HTTP `fetch` (same JSON, same
paths) and it's the deployed Viewer. Viewer builds clean (2 pages, EXIT 0).
- `apps/viewer/src/sample-data.ts` — refactored to expose the raw typed `Library` + `getLog` (one
  log per exhibit; each note targets its object's canvas) instead of pre-projected items.
- `apps/viewer/src/published.ts` — `loadPublishedExhibit()`: publish→read-back → `{title, summary,
  objects, annotationsByObject}`.
- `apps/viewer/src/components/ExhibitView.svelte` — now async (onMount load) with loading + error
  states (system.md §Reader States). Builds an `Exhibit` from the read-back objects with NO layout
  field → `resolveLayout` INFERS "grid" from 3 objects (exercises the inference path; the published
  IIIF form carries no layout hint). Verified seam: `objectsFromManifest` recovers `id` as the
  trailing canvas segment ("o1") + `source` from the image body — matches the `canvas/{id}/` path
  and `canvasIdFor` so markers resolve.
SEAM NOTE: this proves publish→read→render over an in-memory FS. The remaining real-deploy piece is
generating the published tree to disk (a node build-script using the same publishLibrary) + an HTTP
`fetch` loader — but the contract + parsing are now validated in-app, so that's mechanical.

## MULTI-OBJECT STUDIO (Phase 2, "multi-object exhibits") — 2026-05-25
Studio can now author an exhibit of MULTIPLE objects (was hardwired to one). Builds clean (161
modules, EXIT 0). KEY MODEL INSIGHT (correct + minimal): the spine is ONE log per exhibit; each
note's `target.source` IS its object's canvas id (exactly how publishLibrary groups heads per
canvas). So multi-object needs NO per-object sessions and NO persistence change — one
AnnotationSession holds the whole exhibit; the editor shows the current object and filters notes
to its canvas. Changes (apps/studio/src/App.svelte + 2 copied SVGs):
- `OBJECTS` = the same 3-object world as the Viewer (Portrait/Letter/Landscape; SVGs copied into
  apps/studio/public). `canvasIdOf(objId)` = `{BASE}{SLUG}/canvas/{objId}`; `srcOf(target)` reads
  a target's source. `rectSel(canvas,x,y,w,h)` now takes the canvas. `seeded()` seeds across all 3.
- `currentObjectId` $state + `switchObject` (resets selected/mode). `notes`/`annotations` derive
  through `objNotes`/`objAnnotations` (filter `srcOf===canvasId`) THEN the layer filter.
- Object rail UI (`nav.objects`) — object tabs on the dark table, active=accent, with per-object
  note counts (`noteCountOf`). Sidebar header shows `{current.label} · N notes`.
- `buildLibrary()` emits ALL objects (layout:"grid") → Download/Publish include every object.
Studio + Viewer now tell ONE sample story (same 3 objects). Per-object persistence unchanged.

## ORPHAN-GATE empty states (Phase 2, strategy §39) — 2026-05-25
§39 gates "empty/error/loading states before the public Viewer ships." Audit: Reader/Canvas
already have loading+error (Canvas overlay) + empty (no notes). Added the two gaps (viewer builds
clean): ObjectGrid zero-objects ("No objects in this exhibit yet", dark-table dashed card) +
Gallery index.astro zero-exhibits ("No exhibits published yet", paper dashed card). Loading state
for the SSG gallery is moot (pre-rendered). Remaining orphan gates fire at their conditions: body
sanitization (DONE, sanitizeHtml) before user-authored HTML; EXIF-bake before first phone photo;
overlay-contrast before first institutional pilot.

## ⌘K intra-Library linking — SHIPPED (2026-05-25)
CONTEXT §95 "linkable + navigable" intra-Library half. The author CITES another note/exhibit while
writing a note; the picker drops a structured ref into the Comment; it resolves to a real published
URL at publish.

**Core (`packages/render-core/src/link/link.ts`, +7 tests):** the in-body ref is an `archie:` URI
encoding a `LinkTarget` — `encodeLinkRef(t)` = `resolveLink(t,{baseUrl:"archie:"})` (full symmetry),
`parseLinkRef(uri)` inverts it (reusing `parseNoteDeepLink`). `rewriteArchieLinks(md,{resolve,validate})`
→ `{md, broken}`: valid refs → resolved display URL, broken/malformed → degrade to plain text + report.

**LOAD-BEARING DECISION — where the structured ref lives (the source/projection split):** note bodies
are markdown (one source of truth, ADR-0003). The `archie:` ref lives IN the body and is rewritten to
a real URL ONLY on the heads-page PROJECTION at publish (`site.ts` maps `canvasHeads` bodies through
`rewriteArchieLinks` before `headsPageFromRecords`). The **history sidecar is NOT rewritten** — it is
the canonical source `loadLibrary`→`readAnnotations` round-trips through (persist.ts: "reconstructs the
DAG from history, NOT heads"). Rewriting it would lose the ref on Open-zip→edit→republish. Cost: a
foreign PROV-aware consumer reading raw history sees `archie:` link-text (sanitizer drops the
unknown-scheme href) = honest degradation per §85 — and it couldn't resolve an intra-Library ref
anyway. DOMPurify (html profile) strips non-standard schemes, which is WHY the rewrite must run before
any sanitize. `publishLibrary` now returns `{brokenLinks}`; `libraryToZip` returns `{zip,brokenLinks}`
(both Studio publish paths surface warnings; `download()` console.warns for now — Publish.svelte
surfacing is a follow-up).

**Studio (`apps/studio/src/CmdK.svelte` + App.svelte wiring):** ⌘K (or the "¶ Cite" link by the Comment
label) opens a warm-paper "catalog drawer" — NOT a dark IDE command bar (interface-design: rejected the
default; forest-green active row = §19 link affordance; rows are catalog cards in the sidebar note-card
idiom). Entries = every exhibit + every note (latest-non-deleted per logicalId) from `loadAllLogs`
(current exhibit uses the live/unsaved session). Pick → `insertCite` splices `[label](archie:ref)` at
the textarea cursor, `applyForm` persists, focus restored past the link. ↑↓/↵/esc; type to filter.

**Browser-verify owed (human):** open a note → ⌘K → cite another note → confirm the link inserts at the
cursor; publish → confirm the published `annotations.json` body has the resolved `…/#/a/<id>` URL and
the history page keeps `archie:`. **Follow-ups:** surface `brokenLinks` in Publish.svelte (not just
console); cross-Library "paste URL" + recent-targets (§95 cross-Library half); dock the drawer to the
note surface (currently centered).

## EXIF display-master bake — SHIPPED (2026-05-25)
CONTEXT §89.1 orphan-gate: a phone photo's EXIF orientation is baked into an UPRIGHT display master at
import, so OSD/Annotorious/publish are all orientation-blind (the decision's point: "ZERO
orientation-awareness in the coord layer"). The original is preserved untouched (provenance).

**Core reader (`packages/render-core/src/exif/read.ts`, +13 tests):** `readExifOrientation(ArrayBuffer)
→ 1..8` — a pure JPEG→APP1/Exif→TIFF/IFD0 parser (both byte orders; skips APP0/fill bytes; default 1
on non-JPEG/no-Exif/truncated/out-of-range). Pairs with the pre-existing `orientationTransform`/
`normalizeDimensions`/`isOrientationNoop` (`exif/orientation.ts`).

**The gate (`exif/read.test.ts`):** `test/fixtures/exif/manifest.json` is the SPEC; the test loads it
and asserts all 8 orientations — reader (synthesized EXIF segments, LE+BE, APP0-before-APP1) + transform
mapping (`swapsAxes`/`noop`) + dimension normalization (axis-swap sources 2×4 → 4×2). Incl. the
rarely-tested transpose(5)/transverse(7). Manifest `consumerStatus` flipped NOT-WIRED→WIRED(headless).

**Bake + preservation (Studio, browser):** `apps/studio/src/bake.ts` `bakeDisplayMaster(file)` =
`createImageBitmap(file,{imageOrientation:"from-image"})` → canvas → upright PNG (dims from the decoded
bitmap, deterministic). Wired into `App.svelte addObjectFromFile`: read orientation → if non-noop, bake
→ store master at `/assets/{id}-name.png`, preserve original via `store.saveOriginalFile` →
`assets-original/{name}` (NOT published unless opt-in — follow-up), record `ObjectMeta.provenance =
{exifOrientation, transform, originalName}`. Orientation-1 path unchanged (no bake, no original copy).
`store.ts assetsDir` gained a `sub` param; `saveOriginalFile` added. NB "lossless" here = lossless vs the
DECODED bitmap (JPEG→RGB→PNG), not bit-perfect vs the source JPEG codec — that's why the untouched
original is preserved alongside.

**Why dual-store (caught in review):** §89.1 mandates "keep original untouched (provenance)"; baking over
the asset name would destroy it and the gate "before first phone-photo public exhibit" couldn't pass.

**Browser-verify owed (human):** import a real phone photo shot in portrait (EXIF 6/8) → it shows UPRIGHT
in the Studio canvas, annotations land correctly, republish keeps it upright. **Follow-ups:** pixel-bearing
`exif-1.jpg..exif-8.jpg` fixtures for an end-to-end bake test; "include source for citation" opt-in to
publish `assets-original/`; original+master SHA in provenance (§89.1 names it).

## AV first-class note — SHIPPED (2026-05-25)
CONTEXT §81: a Sound/Video object is read against its transcript. The transcript adapter
(`importTranscript`/`cuesToNotes`) already wrote supplementing Notes at `t=start,end`; this slice READS
them back and renders the temporal surface. Import-only v1 (no recording); AV *ingest* (codec/size/
duration) stays gated (§152).

**Core time helpers (`packages/render-core/src/av/time.ts`, +10 tests):** `parseTimeFragment(value)` —
inverse of transcript.ts's `timeFragment`; accepts `t=start,end` + bare `start`/`start,`/`,end`, strips
`npt:`, null on malformed (neg/NaN/end<start/>2 parts). `activeNoteIndex(ranges, t)` — the cue active
at `t`, HALF-OPEN `[start,end)` (at exactly `t=end` the NEXT cue is active, matching HTML5 timeupdate);
point markers (no end) never "active"; on overlap the MOST-RECENTLY-STARTED wins (documented in-code).

**Viewer player (`apps/viewer/src/components/MediaPlayer.svelte`):** dark media stage (`<audio>`/`<video
>` native controls) + a warm-paper transcript prose-spine — the NarrativeReader idiom applied to time
(timecode = section number; active line inked forest-green). `timeupdate` → `activeNoteIndex` highlights;
click a line → `el.currentTime = start` + play. `ExhibitView` routes `activeData.mediaType` sound/video →
MediaPlayer (from `data.objects`, which carries mediaType via `objectsFromManifest`); works for single-AV
and AV-in-a-grid (the routing is per selected object, not per layout).

**Ready upstream (no changes needed):** model (`AObject.mediaType`/`duration`), manifest round-trip
(`toCanvas` emits Sound/Video+duration, `objectsFromManifest` recovers them), `published.ts` (returns
`AObject[]`). So the Viewer recovers AV typing from the published tree with zero manifest changes.

**Dogfood fixture (separate exhibit, does NOT restructure Voynich/Bidar):** `sample-data.ts` adds slug
`av` — one Sound object whose source is a REAL Bidar field recording (the dholak geet recorded on the PiZ
mesh at Faizpura, a COMPOST `annotation-assets/8/…mp3` already linked in Bidar's notes; the Bidar map +
media already depend on that CDN). Notes built by the REAL `importTranscript` from inline WebVTT — 4
DESCRIPTIVE listening-guide cues (not a verbatim transcript; times approximate, tune on verify). New
`pages/av.astro` (lean — no OSD CSS) + a waveform gallery card. Publishes to 68 files.

**Browser-verify owed (human):** open `/av` → audio plays; click a transcript line → audio seeks there;
as it plays the current line highlights forest-green. _If seek-to-cue doesn't move the audio (Safari can
be finicky setting `audio.currentTime` on a `data:` URL before metadata loads), the one-line fix is to
gate `seek()` on the `loadedmetadata` event — don't preempt it; only if verify finds it._ **Follow-ups:**
Studio AV upload + transcript-import UI (the §152 ingest gate — codec/size/duration); a styled scrubber
(native `<audio controls>` is unthemed); the "wire Bidar's real audio as an AV object" call is the
curator's, post-verify.

## Edit-side AV HAND-annotation — SHIPPED (2026-05-25)
User ruling (archie-av Q-1) made hand-annotation of AV a v1 deliverable, superseding §81's "import-only".
The Studio now annotates audio/video BY HAND (interactive), the temporal analogue of the OSD draw tool.
The `/av` Viewer fixture now uses a REAL Bidar recording (dholak geet on the PiZ mesh) — silent WAV gone.

**Core (+5 tests):** `mediaTypeFromSource(source, format?)` (`model/model.ts`) — `.mp3/.m4a/.ogg/.opus/.wav`
→ sound, `.mp4/.webm/.mov` → video, MIME wins over extension, else image. `timeFragmentValue(start,end?)`
(`av/time.ts`) — write-side inverse of parseTimeFragment; `transcript.ts`'s private `timeFragment` now
delegates to it (one source of truth for `t=`).

**Studio (`apps/studio/src/AvEditor.svelte` + App wiring):** `current.mediaType` sound/video → `AvEditor`
(in `{#key canvasId}` so the media element reloads on object switch) instead of the OSD `Canvas`; OSD draw
tools hidden for AV. AvEditor = `<audio>`/`<video controls>` + a marking bar: "Set in" captures a pending
in-point shown as a dismissable chip (In m:ss ✕), "Add note" creates from in→playhead (or a 5s region at
the playhead if no in-point). → `onCreateTime` → `session.createNote` with a `timeSel` (`t=start,end`,
motivation supplementing) → selects it → the SHARED WADM form opens. Form gained a CONDITIONAL time
fieldset (start/end **seconds** number inputs) shown only when the selected note's selector is a time
fragment (`timeOf`) → `applyTime` → editNote new time selector. Clicking a note in the sidebar seeks the
player (AvEditor `$effect` on `selected`). `ObjectMeta` gained `mediaType`/`duration` (passed through
buildFullLibrary + openZip so AV publishes as a Sound canvas + round-trips). `addObject` (URL path) infers
mediaType; `addObjectFromFile` still rejects non-images (AV FILE INGEST = §152 gate).

**Seeded dogfood:** a Studio default exhibit `av` (slug "av", `seedVersion:1`) mirrors the Viewer fixture
(same dholak-geet source + the same 4 descriptive cues, seeded via `seededAv`/`timeSel`). Open it in the
Studio to hand-annotate.

**Decisions baked in (advisor review):** pending in-point is visible + abandonable; the time fieldset is a
conditional row in the ONE form (not a forked AV form); transcript import is **append-only**.
**Transcript IMPORT (also shipped):** AvEditor "⊕ Import VTT/SRT" file-picker → `onImportTranscript` →
`importTranscript([], text, {source: canvasId, lastEditor: author})` → `session.createNote` per cue
(append-only — new notes even if overlapping; format-agnostic parser). Pairs with by-hand marking.
**Honest gaps / follow-ups:** time inputs are seconds, not mm:ss; native unthemed scrubber; AV file
upload stays gated (§152).

**Known minors (advisor-reviewed, intentionally NOT fixed):** clicking the SAME sidebar note twice won't
re-seek (the `prevSelected` guard avoids re-seeking during playback when nothing changed — trade-off, not
a bug). Time inputs are seconds (precise edit geometry), not mm:ss display.

**Browser-verify owed (human):** open the Studio "A Field Recording from Bidar" exhibit → audio plays →
"Set in" then "Add note" creates a note (form opens, type a comment) → the note shows start/end seconds →
click a note in the list and the audio seeks to it → publish → it renders in the Viewer `/av` player.
ALSO: "⊕ Import VTT/SRT" → pick a .vtt/.srt file → its cues append as time notes in the list.
_If "Set in" before the audio has loaded feels wrong (it marks in=0), the fix is a UI affordance: gate the
"Set in" button on the `loadedmetadata` event — don't preempt it; only if verify finds it warranted._

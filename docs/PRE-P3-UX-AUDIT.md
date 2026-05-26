# Pre-Phase-3 UX audit (CONTEXT.md vs shipped) — 2026-05-25

> **RULING (user, 2026-05-25): Phase 3 IS part of v1.** "Phase 3" is a sequencing/validation label
> (each invention earns a comprehension gate), NOT post-v1 scope. ⇒ Narrative is a **v1 gap** (build
> the prose-pane). The "Correctly deferred (Phase-3 inventions)" section below = **v1, gated** (not
> deferred). Full v1 remaining = the 6 gaps + Narrative + the 5 un-built inventions (overview-as-
> canvas, playground→project, three-configs-as-Project, identity-prompt, layout-picker), each gated.
> Truly out of v1 = only the explicit **v1.1** items (overlay-contrast-image-aware, curated landing,
> scrollytelling/compare, ellipse/freehand, search/embedding/AI).


"Did all the UX that must ship BEFORE Phase 3 (the gated inventions) actually ship?"
Pre-P3 = the **adopted tier** (ship-on-adoption, no gate) + **v1 locked frames** + **orphan gates**
that fire "before X ships". Cross-checked against the apps. Verdict: **NO — 6 gaps + 1 conflict.**

## ✅ Shipped (pre-P3)
- Editor: anvil canvas+sidebar, draw rect/polygon, WADM form, layers, delete (§78/§144). Studio.
- Reader: annomea 3-state pane + popup/drawer (§78/§144). Viewer.
- list-UI **Library** screen (§118/§144). LibraryHome.svelte.
- **Single + Grid** layouts (§92). resolveLayout / ObjectGrid / ExhibitView.
- `fitBounds` on sidebar/list select (§82) — PARTIAL (deep-link + narrative-link selects not wired; those features unbuilt).
- **Empty/error/loading** states (orphan §89.2). ObjectGrid/Gallery/Reader/Canvas/ExhibitView.
- **Schema version stamp** (orphan §89.3) — exhibits.json stamped; migrate runner exists.
- **Body sanitization** (gate §151) — sanitizeHtml + renderMarkdown (snarkdown→DOMPurify).
- Publish: zip + GitHub (incl. imported assets as base64 blobs) + **whole-library** + real disk→fetch.
- Gallery auto-grid (§138) — cards render. (Single-exhibit *collapse threshold* not implemented; moot at 2 exhibits.)
- Persistence: OPFS autosave + **Save/dirty indicator** (§116, partial).
- "Connect to GitHub" walkthrough (minor invention §142) — Publish.svelte token form.

## ❌ Gaps (pre-P3 per CONTEXT, NOT shipped)
1. ~~**Marker visual treatment — A2 + stroke-over-stroke** (§122).~~ **DONE 2026-05-25.**
   `apps/{studio,viewer}/src/markers.css` (imported AFTER Annotorious CSS in main.ts / the reader
   pages): Annotorious default = black inner stroke + hidden outer halo (invisible on the dark
   #181714 table). Override enables a light **outer halo** + **vermillion inner** (stroke-over-
   stroke → legible on any background), low weight at rest, full on `.selected`. Both build clean.
   Browser-verify the selected/hover emphasis (the `.selected` placement is best-effort).
2. **Storage chooser "Open folder / Open zip"** (§116 + strategy §30) — **PARTIAL (Open zip DONE 2026-05-25)**.
   `App.openZip` + LibraryHome "Open .archie.zip…": reads a published zip via `loadLibrary`
   (publish↔load symmetry) and REPLACES the OPFS project (confirm-gated; clears old annotation dirs;
   writes imported per-exhibit logs). Symmetric inverse of Download. Builds clean.
   STILL OPEN: **Open folder** (FsaFilesystem autosave-in-place) — this + the Playground/Project
   model is **invention #3 (gated)**, deferred (scope boundary, not crossed). Recent-projects list.
   SUBTLETY: imported note targets carry the zip's publish baseUrl; the demo zips use
   BASE="https://archie.demo/" so they match the Studio's canvasIdOf — an arbitrary-baseUrl zip would
   mismatch on edit (flag).
3. **Intra-Library linking UI — ⌘K — SHIPPED 2026-05-25.** Studio "Cite" palette (`CmdK.svelte`) inserts
   `[label](archie:ref)` at the Comment cursor; `link.ts` gained `encodeLinkRef`/`parseLinkRef`/
   `rewriteArchieLinks`; publish resolves refs on the heads projection (history stays raw — round-trips),
   reports `brokenLinks`. See HANDOFF "⌘K intra-Library linking — SHIPPED" for the source/projection
   decision. REMAINING (cross-Library half, §95): "paste URL" + recent-targets + "open it?" affordance
   for a non-loaded exhibit; surface brokenLinks in Publish.svelte. Browser-verify owed (human).
4. **Deep-link arrival** (§82 fitBounds-on-deep-link + §124 cold-arrival chrome). Core built
   (encode/decodeContentState, `#/a/<id>`); the Viewer doesn't read the hash, land-in-context, or
   show breadcrumb/zoom-to-fit/"you followed a link". NOTE: §124 calls this "adopted-plus-styling,
   NOT invention" (pre-P3) but §142 lists "cold-arrival chrome" among the 6 major inventions →
   BORDERLINE (the land-in-context wiring is adopted; the chrome styling is lightly gated).
5. **EXIF display-master bake** (orphan §89.1) — SHIPPED 2026-05-25. Core reader `readExifOrientation`
   (`exif/read.ts`) + the 8-orientation gate (`exif/read.test.ts` asserts all 8 vs the corpus manifest:
   reader LE/BE/APP0 + transform + dims). Studio import bakes an upright PNG master (`bake.ts` →
   `addObjectFromFile`) and PRESERVES the original in `assets-original/` with provenance on `ObjectMeta`.
   The headless gate passes; pixel-bearing `exif-N.jpg` fixtures + the bake itself are browser-verify
   owed (canvas can't run headless). See HANDOFF "EXIF display-master bake — SHIPPED". REMAINING:
   opt-in to publish originals; SHA in provenance.
6. **AV — first-class note + HAND-annotation** (§81; hand-annotation reclassified to v1 by user ruling
   archie-av Q-1, superseding "import-only v1") — SHIPPED 2026-05-25.
   • *Viewer (read):* `MediaPlayer.svelte` — `<audio>`/`<video>` + transcript prose-spine (click→seek,
   playback→highlight); `ExhibitView` routes `mediaType` sound/video → player. `/av` fixture = a REAL
   Bidar recording (dholak geet on the mesh).
   • *Studio (edit, BY HAND):* `AvEditor.svelte` — player + "Set in"→"Add note" marking (dismissable
   in-point chip) → `t=start,end` supplementing note → shared WADM form + conditional start/end time
   fieldset; click a note seeks. `mediaTypeFromSource` types URL-added AV objects.
   • *Studio (edit, by IMPORT):* AvEditor "⊕ Import VTT/SRT" → `importTranscript` (append-only) → time
   notes. So AV authoring is complete both by-hand AND by import.
   Core `parseTimeFragment`/`activeNoteIndex`/`timeFragmentValue` (`av/time.ts`). Browser-verify owed
   (all). See HANDOFF "AV first-class note" + "Edit-side AV HAND-annotation". **STILL GATED (§152):** only
   AV *file ingest* (upload/codec/size/duration) — referencing an AV URL + importing a transcript are done.

## ✅ Narrative layout — DONE 2026-05-25 (resolved: v1 per the ruling)
Built the **read-side** narrative (CONTEXT §92), completing the v1 layout set (Single+Grid+Narrative).
`apps/viewer/src/components/NarrativeReader.svelte` (canvas + ordered prose-spine pane; click a
section → map fitBounds to its region; marker click → highlights its section; photos/audio render
inline via renderMarkdown). `sample-data.sectionsFor("bidar")` derives sections from the 25 Bidar
reflections (order-bound to its annotations: section i ↔ annotation i). `ExhibitView` builds the
exhibit with `sections` → `resolveLayout` infers narrative → renders NarrativeReader. Viewer builds
clean (3 pages). FOLLOW-UPS: (a) round-trip sections through manifest Ranges (toRanges is built;
need a `sectionsFromManifest` parser so sections come from the published tree, not sample-data);
(b) Studio-side narrative SECTION AUTHORING (a NarrativeEditor); (c) progressive marker reveal (§122).

## ⚠ (resolved) Classification CONFLICT — Narrative layout
- **CONTEXT §92:** "Layout v1 set = Single + Grid + **Narrative**." Narrative is a v1 layout
  (prose-spine + N Sections/IIIF Ranges + click-activate via the nav contract). The DATA layer is
  built (model `Section`, `toRanges`, manifest `structures[]`); the **prose-pane UI is NOT**.
  Narrative is **absent from the §144 invention inventory** → CONTEXT treats it as v1/adopted.
- **IMPLEMENTATION-STRATEGY §31/§36:** explicitly lists "narrative" as a Phase-3 invented interaction.
- These disagree. If CONTEXT wins (it's the design source), **Narrative prose-pane UI is a pre-P3
  gap**. If the strategy wins, it's correctly deferred. **Needs a human ruling.**

## ✅ Correctly deferred (Phase-3 inventions, §144) — with status
- (1) overview-as-canvas — not built (deferred). (2) playground→project — not built. (3) three-
  configs-as-Project — not built. (6) identity-prompt — not built. layout-picker (minor) — not built.
- **AHEAD of schedule:** (4) merge **summary panel** + (5) **conflict-card-in-WADM** ARE built
  (MergeReview.svelte) — prototyped early; still owe their comprehension gate.
- v1.1 (correctly out): overlay-contrast image-aware (§89.4 / §122), curated landing (§138),
  scrollytelling/compare (§92), ellipse/freehand shapes (§76), search/embedding/AI (§142).

## Recommendation (priority within pre-P3)
A. **A2 + stroke-over-stroke markers** (#1) — small, real legibility win on the dark/photo canvases.
B. **Storage chooser + both backends** (#2) — the folder/zip on-ramp the GH-Pages story leans on.
C. **Resolve the Narrative conflict** (human ruling) → if v1, build the prose-pane.
D. **Deep-link arrival** (#4) — land-in-context + minimal chrome (core already there).
E. EXIF bake (#5) before exposing phone-photo import publicly; intra-Library ⌘K (#3); AV (#6) as their gates fire.

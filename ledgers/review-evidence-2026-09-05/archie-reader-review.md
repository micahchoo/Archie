# Reader/embed spec review — snapshot 91935b2

Read-only review: hubs/reading.md, hubs/embed.md, hubs/product.md, README, CONTEXT, ADRs 0009/0010/0019/0020/0021, relevant .claude rules; traced apps/viewer shell/load/navigation and packages/archie-viewer loading/target/readings/AV/note-media paths. No production files modified.

Focused source probe: `/tmp/archie-reader-entry.ts` bundled directly from current workspace source using esbuild to `/tmp/archie-reader-bundle.mjs`; `/tmp/archie-reader-probe.mjs` installs happy-dom and drives real exported controllers, a MemoryFilesystem produced by publishLibrary, and the actual generated Voynich tree. Run `node /tmp/archie-reader-probe.mjs`. This proves state/DOM contracts, not browser hit-testing or actual network requests. Root owns workspace test gates/browser drive.

## Four prioritized findings

### R1 — [P1] Apply offline policy to covers and note media, not only primary objects

**Location:** packages/archie-viewer/src/element.ts:855. Additional sinks: note-card.ts:247,254,302,311; objectCoverHtml at element.ts:969 onward.

**Trigger:** mount `<archie-viewer offline>` and open a local library (openFile/openLibraryFs) whose gallery cover, object thumbnail, or a note contains an HTTPS asset. A remote cover alone triggers this on gallery arrival, before opening an object.

**Impact:** DOM contains live remote img/video/audio sources despite the privacy/kiosk setting; browsers fetch visible images and metadata through these sinks. Primary object refusal cannot protect the gallery or note cards. A crafted archive can disclose the visitor's network identity to its chosen asset host even when the host explicitly selected offline mode.

**Proof:** source probe sets offline=true and adopts a real published MemoryFilesystem with cover https://tracker.test/pixel.png; shadow-root img.src is that URL. The same note-card renderer used inside offline readers renders https://tracker.test/note.png from a note body. It accepts no offline policy. Source assigns m.url directly after only scheme safety validation. No actual external request was issued by this probe.

**Contract:** README:280 and recipes/README:92-96 promise all remote tile/media fetch blocked; ADR-0021:27 calls it network-egress mitigation; ADR-0020 says offline handles hostile-archive egress. Searched docs/recipes for exceptions: none found. ADR-0009's accepted limitation that remote-IIIF media need network in ordinary portable mode is a separate condition; it does not weaken explicit offline mode.

**Fix direction:** one load policy consumed before *every* resource-bearing DOM src is assigned (covers, object thumbnails, note tiles/sheets, narrative prose as applicable), plus browser request-count assertion over a local archive containing remote media in these locations. Turning offline on mid-read also currently takes effect only next object open (element.ts:267); define that transition deliberately.

### R2 — [P2] Resolve reading-specific notes and activate their Reading on embed arrival

**Location:** packages/archie-viewer/src/target-resolve.ts:70-75 (especially :72). Related element.ts:625-628 onfind; reading-layer.ts:91-99.

**Trigger:** copy a published Viewer note URL for a note that belongs to an interpretive Reading into the embed's target attribute.

**Impact:** valid note is treated as missing and the embed falls back to the exhibit grid. Search can find the same note but opening its hit cannot show it while that Reading is inactive: searchExhibit scans reading pages, while the surface only receives base + active Reading, and onfind never activates the result's Reading.

**Proof on actual bundled fixture:** loaded `apps/viewer/public/published/voynich` through readExhibitTree; note `000000000C5M05B5H33KBKENTM` is in cipher on `ex-voynich.o1`, id `https://micahchoo.github.io/Archie/viewer/published/voynich/annotations/000000000C5M05B5H33KBKENTM/v1`. resolveExhibitTarget(exhibit,{view:'exhibit',slug:'voynich',noteId:'000000000C5M05B5H33KBKENTM'}) returns `{kind:'exhibit',degraded:'note-not-found'}`. A minimal fixture also produces a search hit for a reading-only note while createReadingLayer.notes() returns [].

**Contract:** ADR-0021 explicitly says a note deep-link auto-activates the note's Reading; ADR-0019 makes Readings and search required capabilities. Resolver comment saying per-reading pages aren't mounted is stale: reading-layer.ts and reader-chrome.ts implement them. This is not an accepted adaptation.

**Fix direction:** resolve an owner including object id, raw note id, Reading id using both published maps; carry/activate that Reading before mounting and use the same arrival path for search. Add a genuine published reading-only note to cite/search coverage.

### R3 — [P2] Open whole-recording note bodies when arriving at their citation

**Location:** packages/archie-viewer/src/av-player.ts:334-340.

**Trigger:** target an existing AV note whose target is the entire recording (no t= selector), e.g. `#/exhibit/a/note-id`.

**Impact:** object opens but its cited note card stays hidden. The note exists and can be opened by clicking its row; following its direct citation does not show that body. The arrival handler searches only timed cues, derives no target for a whole-recording note, and returns before card.showNote. Adding an explicit t= still does not show it because the card open is conditional on landCue.

**Proof:** real mountAvPlayer controller mounted in happy-dom with one whole-recording annotation and `initialSelect:'whole'`. Dispatching loadedmetadata leaves `.archie-note-card.hidden === true`. The same surface exposes `openNote('whole')`, which delegates to showWholeNote and can show it. Element passes resolved.selectId as initialSelect at element.ts:706, so the mismatch is on the normal cite path.

**Contract:** full note cite ladder in ADR-0021 and object-level notes as bare IRI in ADR-0018. ADR-0019's AV capability explicitly distinguishes timed rows and whole-recording rows; neither is an unsupported note type.

**Fix direction:** resolve/open selected note independently of whether it has a temporal cue; preserve no-seek behavior for the uncued case. Assert arrival from a whole-recording note URL, not only a direct row click.

### R4 — [P2] Invalidate pending embed navigation when target changes to the gallery

**Location:** packages/archie-viewer/src/element.ts:403-409.

**Trigger:** with a library loaded, host sets `el.target = '#/e/o/o1'`, then supersedes it with `el.target = '#/'` before the asynchronous exhibit read completes (ordinary on slow hosted trees).

**Impact:** gallery is painted briefly, then the obsolete request opens the previous object despite target still saying '#/'. The unknown-slug degradation branch has the same issue. These branches do not increment #loadSeq, whereas #openExhibit captures/checks that token at :423-426. They also bypass surface teardown.

**Proof:** focused probe opens an actual MemoryFilesystem library with an audio object, assigns those two target values in immediate sequence, then awaits async completion. Output: `{ target: '#/', renderedReader: true, renderedTitle: 'Audio' }`. Reproduces without network or timing load. The older read deterministically wins the final UI.

**Fix direction:** every address transition, including gallery/degrade/removal, should supersede prior navigation and tear down the current surface. Guard post-import/post-mount continuations too, rather than only the initial read. Add the two-successive-target regression.

## Product/PM recommendations (not additional defect counts)

1. Treat source + exhibit + locus as the reader's complete address. The feature is citable interpretation, so a copied note must preserve both the actual library and its active Reading. Measure copy/reopen equivalence across hosted, foreign-tree, zip, and embed consumers.
2. Extend capability tests along meaningful combinations rather than only capability existence: Reading-only note + direct target/search; local offline archive + remote cover/note media; source URL + navigation/reload; fast superseding target + slow read. Current happy-path tests can all pass while these contracts fail.
3. Keep accepted embed adaptations explicit: substring search rather than fuzzy; no prose hovercards; narrative stepper rather than scroll coupling; note sheet instead of separate media lightbox; docked chrome's height cost. These are deliberate ADR-0019 decisions and were not counted as parity bugs.
4. Offline is an unusually strong and useful institutional promise; retain it only with end-to-end resource policy coverage, including note prose and galleries, rather than treating a primary-tile gate as completion.

## Follow-up: source-preservation issue identified by code trace, browser confirmation pending

### Candidate — Preserve the external library source when rewriting Viewer addresses

**Location:** apps/viewer/src/components/ExhibitView.svelte:228-246. Additional normal navigation drops source at Gallery.svelte:134 and gallery-view wall href construction; breadcrumb paths similarly require source ownership.

**Trigger:** open a supported `#/some-exhibit?src=<foreign-tree-or-zip>` URL, or open `#/?src=...` then click an exhibit.

**Impact:** ExhibitView builds a fresh ViewerRoute with slug/locus but omits src, then replaceState replaces the entire hash. Gallery links also omit src. The external library remains in module memory, so it looks correct until refresh, copying the address, or reopening the tab: boot now sees no source and loads the canonical/default library. With a colliding slug this silently shows a different exhibit; otherwise it degrades. Share-by-URL and page refresh lose the document being read.

**Evidence:** full code trace: url/route.ts:25-34 extracts src only from hash query; its routeToHash supports preserving src but callers omit it. ViewerShell.svelte:140-146 opens a foreign library only when the parsed initial route has src. ExhibitView's unconditional successful-locus effect writes a hash without it at :246. No source prop/context is provided to its route builder. Browser interaction not performed for this case in this subreview; the source-loss path is direct, deterministic, and not dependent on network timing.

**Contract:** ADR-0009 explicitly defines `#/?src=` and `#/voynich/a/n3?src=` composition with every hash route. Accepted caveat is durability of the two hosts; no accepted exception allows dropping the source during navigation.

**Fix direction:** keep the active opened library's URL as shell-owned route context and include it in every navigation, locus/degrade writer, and copied address. Verify foreign source with a slug also present in the default library; reload must still show foreign title/content.

## Coverage limits

No production changes, no internet requests to asset hosts, and no full browser rendering of the probes. Security claim in R1 is grounded in emitted live DOM sources and browser resource semantics; actual wire request gate should be the verification for a fix. Broader app/Studio checks are owned by root. No claims of new XSS or tested exploit execution.

<script lang="ts">
  // Studio editor (Phase-2 UI, browser-verified later). Real annotate loop over the headless-
  // tested @render/core AnnotationSession: draw on the canvas → create note → edit body/tags/
  // layers in the WADM form → publish to .archie.zip. Logic lives in core; this is the thin shell.
  import { onMount, tick } from "svelte";
  import ReadingsModal from "./ReadingsModal.svelte";
  import ReadingsRail from "./ReadingsRail.svelte";
  // Canvas is lazy-loaded (see CanvasComp below) — it pulls OpenSeadragon + Annotorious, the studio's
  // largest dependency, and Studio boots into the library view that never mounts it. Keeping it out of
  // the static graph drops that weight from the startup bundle.
  import ResizeDivider from "@render/svelte/ResizeDivider.svelte";
  // Publish + PublishDialog are lazy-loaded with the publish flows (ensurePub) — see *Comp below.
  import LibraryHome from "./LibraryHome.svelte";
  // CmdK + MediaPicker components are lazy-loaded on first open (see *Comp below); PickItem is type-only.
  import type { PickItem } from "./MediaPicker.svelte";
  // AvEditor (AV objects) is lazy-loaded — see AvEditorComp below (kept out of the startup bundle).
  import ExhibitOverview from "./ExhibitOverview.svelte";
  // NarrativeEditor (narrative panel) is lazy-loaded — see NarrativeEditorComp below.
  import DetailsEditor from "./DetailsEditor.svelte";
  import PropsDrawer from "./PropsDrawer.svelte";
  import ShortcutsHelp from "./ShortcutsHelp.svelte";
  // AddMapModal (map add) is lazy-loaded — see AddMapModalComp below.
  import NoteEditor from "./NoteEditor.svelte";
  import { matches, typingInField } from "./shortcuts.js";
  import {
    AnnotationSession, asClientId, encodeLinkRef, stripMarkdown,
    timeFragmentValue, mediaFragmentValue, parseTimeFragment, importTranscript, thumbnailUrl,
    tagsOf, emphasisOf, readingMarkerStyle, workingToLibrary, resolveLayoutType,
    type LogicalId, type Library, type LayoutType, type W3CAnnotation, type W3CBody, type AnnotationRecord, type AnnotationLog, type Section, type Reading, type RightsFields, type Emphasis, type TileSourceDescriptor,
  } from "@render/core";
  import type { DrawTool, MarkerStyle } from "@render/mount";
  import { openExhibitAnnotationsDir, loadLibraryMeta, readAssetUrl, readThumbUrl, clearExhibitAnnotations, exhibitHasAnnotations, isAsset, ASSET_PREFIX, loadPendingNotes, savePendingNotes, type ExhibitMeta, type ObjectMeta, type PendingNote } from "./store.js";
  import { createLibraryStore } from "./library-meta.svelte.js";
  import { enqueueSave, saveStatus } from "./save-queue.svelte.js";
  import { zipNameFor } from "./binding.js";
  import { createBindingStore } from "./binding-store.svelte.js";
  // createPublishFlows is imported DYNAMICALLY (ensurePub below) so its fflate + dompurify + GitHub-publish
  // deps stay OUT of the startup bundle — publishing is a deliberate action, never needed at boot.
  import { createReadingState } from "./reading-state.svelte.js";
  import { narrativeCueReducer } from "./narrative-cue-reducer.js";
  // Seed / default-exhibit data lives in seed-data.ts (the DOMINO cut): DEFAULT_EXHIBITS, the per-slug
  // session factories (seededFor), and the shared region/time selector constructors + BASE.
  import { DEFAULT_EXHIBITS, seededFor, BASE, timeSel } from "./seed-data.js";
  // Geo-note selector math (pure, taking the tileSource explicitly) — the geo half of the DOMINO cut.
  import { geoLabelOf, geoForTarget, selectorValue } from "./geo-notes.js";
  // The ingest flows (object-add, exhibit-create, bulk-note import, library-replace) — the DOMINO cut.
  import { createIngestFlows } from "./ingest-flows.js";
  import { buildCsvTemplate, type CsvPendingNote } from "./csv-import.js";
  // The per-exhibit session state machine (session lifecycle + atomic open) — the DOMINO cut.
  import { createExhibitSession } from "./exhibit-session.svelte.js";

  // Local display name → the clientId stamped as lastEditor in the merge DAG (CONTEXT invention #6).
  // Persisted in localStorage (metadata, not content). null = never prompted (ask on first Import);
  // "" = skipped (Anonymous); else the chosen name. `author` derives from it for any NEW sess.session.
  const IDENTITY_KEY = "archie.displayName.v1";
  function loadIdentity(): string | null { try { return localStorage.getItem(IDENTITY_KEY); } catch { return null; } }
  let identity = $state<string | null>(loadIdentity());

  // The KEYSTONE matched-pair cue (ADR-0016 staging spec §3): adding the FIRST section flips the exhibit's
  // front door (the published surface leads with the narrative instead of the grid). A first-timer must be
  // told this once — but ONLY once per exhibit, so a later beat never re-announces it. Persist the "shown"
  // flag per slug in localStorage (metadata, not content — same idiom as IDENTITY_KEY). One-time / self-
  // dismissing; the reverse cue (last→0) is a transient confirm, not persisted (it must fire every time the
  // narrative is actually cleared).
  const FIRST_ADD_KEY = (slug: string) => `archie.narrativeFirstAddShown.v1.${slug}`;
  function firstAddSeen(slug: string): boolean { try { return localStorage.getItem(FIRST_ADD_KEY(slug)) === "1"; } catch { return false; } }
  function markFirstAddSeen(slug: string) { try { localStorage.setItem(FIRST_ADD_KEY(slug), "1"); } catch { /* private mode — cue simply re-shows, harmless */ } }
  const author = $derived(asClientId(identity || "anonymous"));
  const srcOf = (t: unknown): string | undefined => (typeof t === "string" ? t : (t as { source?: string } | null)?.source);

  // --- library / exhibit state (authored structure; persisted at {PROJECT}/library.json) ---
  const lib = createLibraryStore({ exhibits: DEFAULT_EXHIBITS }, { onAfterPersist: () => bnd.touch() });
  let view = $state<"library" | "overview" | "editor">("library");
  // Lazy deep-zoom canvas (OpenSeadragon + Annotorious — the largest dep). Loaded the moment the user
  // enters an exhibit (overview or editor), so it's warm by the time an object opens, while staying OUT
  // of the startup bundle (the library landing parses less JS). The editor's existing "Loading…" branch
  // covers the brief first-open gap. Loaded once, then cached.
  let CanvasComp = $state<typeof import("@render/svelte/Canvas.svelte").default | null>(null);
  $effect(() => {
    if (view !== "library" && !CanvasComp) void import("@render/svelte/Canvas.svelte").then((m) => { CanvasComp = m.default; });
  });
  // Lazy heavy editors, loaded only on the (rare) paths that use them — out of the startup bundle.
  let AvEditorComp = $state<typeof import("./AvEditor.svelte").default | null>(null);
  let AddMapModalComp = $state<typeof import("./AddMapModal.svelte").default | null>(null);
  let NarrativeEditorComp = $state<typeof import("./NarrativeEditor.svelte").default | null>(null);
  $effect(() => { if (openPanel === "narrative" && !NarrativeEditorComp) void import("./NarrativeEditor.svelte").then((m) => { NarrativeEditorComp = m.default; }); });
  // The publish dialogs load alongside the publish flows (ensurePub) — they only render under {#if pub}.
  let PublishDialogComp = $state<typeof import("./PublishDialog.svelte").default | null>(null);
  let PublishComp = $state<typeof import("./Publish.svelte").default | null>(null);
  // CmdK (⌘K palette) + MediaPicker (cite-by-image) load on first open — both rarely used at startup.
  let CmdKComp = $state<typeof import("./CmdK.svelte").default | null>(null);
  let MediaPickerComp = $state<typeof import("./MediaPicker.svelte").default | null>(null);
  $effect(() => { if (cmdkOpen && !CmdKComp) void import("./CmdK.svelte").then((m) => { CmdKComp = m.default; }); });
  $effect(() => { if (mediaPickerOpen && !MediaPickerComp) void import("./MediaPicker.svelte").then((m) => { MediaPickerComp = m.default; }); });
  // Per-exhibit Playground/Project (CONTEXT §115, the coherent model): a bundled EXAMPLE is a template —
  // opening it is a playground (banner, nothing saved); a USER-CREATED exhibit is a project (saved, no
  // banner). One role per exhibit, one path in/out. "Keep a copy" forks an example into a saved exhibit.
  // $state: the boot reconcile may RELEASE a slug back to the user (a reclaimed sunset slug that
  // carries user annotations stays a user exhibit — see onMount), and save()'s isTemplate gate
  // must see that release.
  let templateSlugs = $state(new Set(DEFAULT_EXHIBITS.map((d) => d.slug)));
  const isTemplate = (slug: string) => templateSlugs.has(slug);
  let currentSlug = $state(DEFAULT_EXHIBITS[0]!.slug);
  const currentExhibit = $derived(lib.meta.exhibits.find((e) => e.slug === currentSlug) ?? lib.meta.exhibits[0]);
  const OBJECTS = $derived(currentExhibit?.objects ?? []);
  // Canvas IRI for an object of the CURRENT exhibit (matches publishLibrary's grammar per slug).
  const canvasIdOf = (objId: string) => `${BASE}${currentSlug}/canvas/${objId}`;

  // --- imported-image assets: stored in OPFS, source "/assets/{name}", resolved to blob: URLs ---
  // ASSET_PREFIX / isAsset live in store.ts now (one definition — App + publish flows share it).
  let assetUrls = $state<Record<string, string>>({}); // objId -> full MASTER blob: URL (the canvas/OSD source)
  let thumbUrls = $state<Record<string, string>>({}); // objId -> baked THUMBNAIL blob: URL (overview/rail plates)
  let assetsReady = $state(false);
  function revokeAssetUrls() {
    for (const u of Object.values(assetUrls)) URL.revokeObjectURL(u);
    for (const u of Object.values(thumbUrls)) URL.revokeObjectURL(u);
    assetUrls = {};
    thumbUrls = {};
  }
  async function resolveAssets(slug: string, objs: ReadonlyArray<{ id: string; source: string }>) {
    revokeAssetUrls();
    // PERF: resolve every object's OPFS asset to a blob URL CONCURRENTLY — opening a multi-object exhibit
    // was a per-object read waterfall (one OPFS read + createObjectURL at a time). Independent files keyed
    // by object id, so fan them out; order doesn't matter. Masters (canvas/OSD source) AND baked thumbnails
    // (overview/rail plates) resolve in the same wave — the overview then DECODES small thumbs, not full
    // masters (a thumb is absent only for a pre-baked-feature import / an already-small image → master).
    const assets = objs.filter((o) => isAsset(o.source));
    const entry = (resolve: (slug: string, name: string) => Promise<string | null>) =>
      Promise.all(assets.map(async (o) => {
        const url = await resolve(slug, o.source.slice(ASSET_PREFIX.length));
        return url ? ([o.id, url] as const) : null;
      }));
    const keep = (es: ReadonlyArray<readonly [string, string] | null>) =>
      Object.fromEntries(es.filter((e): e is readonly [string, string] => e !== null));
    const [masters, thumbs] = await Promise.all([entry(readAssetUrl), entry(readThumbUrl)]);
    assetUrls = keep(masters);
    thumbUrls = keep(thumbs);
    assetsReady = true;
  }

  // --- per-exhibit annotation SESSION state machine (the DOMINO cut — exhibit-session.svelte.ts).
  // Owns session / annDir / storeReady / dirty + the autosave lifecycle + the ATOMIC open transition
  // (fix #3). The editor CURSOR (selected/editing/creating/currentObjectId/rev) stays in App (bind:-bound).
  // `bnd` deps are deferred getters (bnd is created below) — called only at action time, never at init. ---
  const sess = createExhibitSession({
    baseUrl: BASE,
    author: () => author,
    isTemplate,
    seedFor: (slug) => seededFor(author, slug),
    autosaveToFolder: () => void bnd.autosaveToFolder(),
    touchBinding: () => bnd.touch(),
  });
  // Thin App-side wrappers preserve the zero-arg save()/scheduleSave() call sites (they thread the live slug).
  const save = () => sess.save(currentSlug);
  const scheduleSave = () => sess.scheduleSave(currentSlug);

  // --- Library binding (invention #3, CONTEXT three-configs persistence): WHERE this Library's canonical
  // bytes live. unbound = OPFS-only (this browser); folder = Chromium FSA autosave-in-place; file = a
  // .archie.zip on disk (Save downloads it). Capability picks folder-vs-file; the user sees only "where". ---
  // Binding state machine lives in the binding store now (worklist 0.3 cut 1 — binding-store.svelte.ts);
  // `bnd` is created below the publish primitives it depends on. The App keeps only zip-open chrome.
  let collabNote = $state<string | null>(null); // ⑧: who-wrote-what after opening a zip (dismissible)
  const PROJECT_TITLE = "Archie Library";
  let zipInputEl = $state<HTMLInputElement | null>(null); // hidden picker for "Open" on non-Chromium
  let csvEl = $state<HTMLInputElement | null>(null); // hidden picker for the notes-CSV import (⑥)
  let wadmEl = $state<HTMLInputElement | null>(null); // hidden picker for the WADM/JSON import (⑦)
  // Boot into the Library. Load the authored library (or seed the defaults on first run). Self-healing
  // reconcile: for each bundled default, if its persisted copy is STALE (missing, or its object set
  // differs from the current code default — i.e. a fixture was re-imported), replace its structure and
  // clear its annotations so it reseeds. Unchanged defaults (+ user edits) + user exhibits are preserved.
  onMount(async () => {
    const meta = await loadLibraryMeta();
    if (meta && meta.exhibits.length > 0) {
      const isStale = (d: ExhibitMeta, p: ExhibitMeta | undefined): boolean =>
        !p || p.objects.length !== d.objects.length || p.objects[0]?.source !== d.objects[0]?.source
        || (p.seedVersion ?? 0) !== (d.seedVersion ?? 0); // seed content bumped → reseed
      const stale: string[] = [];
      const reconciled: ExhibitMeta[] = [];
      for (const d of DEFAULT_EXHIBITS) {
        const p = meta.exhibits.find((e) => e.slug === d.slug);
        if (!isStale(d, p)) { reconciled.push(p!); continue; }
        // A stale copy with STORED annotations is a user's work, not a stale seed: templates never
        // save (the isTemplate gate), so notes can only exist if this slug spent time as a user
        // exhibit (e.g. `bidar` during its sunset). Reclaiming it would silently destroy those
        // notes — instead the user keeps the slug and the bundled template yields this boot.
        if (p && (await exhibitHasAnnotations(d.slug))) {
          templateSlugs = new Set([...templateSlugs].filter((s) => s !== d.slug));
          reconciled.push(p);
          continue;
        }
        stale.push(d.slug);
        reconciled.push(d);
      }
      const userExhibits = meta.exhibits.filter((e) => !templateSlugs.has(e.slug) && !reconciled.some((r) => r.slug === e.slug));
      lib.setMeta({ ...lib.meta, exhibits: [...reconciled, ...userExhibits] }); // set-only: persist stays conditional
      for (const slug of stale) await clearExhibitAnnotations(slug); // discard stale seed notes → reseed
      if (stale.length) await lib.persist();
    } else {
      await lib.persist(); // first run — persist the defaults
    }
    // Restore recents + the active-binding DESCRIPTOR so the chip shows continuity ("bound to X");
    // the folder handle's permission re-grants lazily on the next write (binding store boot).
    bnd.boot();
  });

  // Open an exhibit into the editor: load its per-exhibit annotation log (seed the sample if empty).
  async function openExhibit(slug: string) {
    const prevSlug = currentSlug;
    const ex = lib.meta.exhibits.find((e) => e.slug === slug);
    // The editor CURSOR + reading display are App-owned VIEW state — reset them synchronously up front
    // (cheap, no await), matching the original ordering where currentSlug moves before the async load.
    currentSlug = slug;
    currentObjectId = ex?.objects[0]?.id ?? "o1";
    editingObjectId = null; // drop any overview pencil edit-cursor from the outgoing exhibit
    selected = null;
    editing = null;
    creating = null;
    placingPendingId = null; // drop any armed placement from the outgoing exhibit
    void loadPendingNotes().then((m) => { pendingNotes = m[slug] ?? []; }); // this exhibit's coordinate-free imports awaiting a box
    rdg.resetForExhibit(); // fresh exhibit = everything visible, pen on base (fixes the cross-exhibit leak)
    firstAddCueSlug = null; pendingClear = null; clearedSlug = null; // drop any narrative-staging cue from the outgoing exhibit
    assetsReady = false;
    // The SESSION swap is now one ATOMIC transition (fix #3): exhibit-session.open flushes the OUTGOING
    // exhibit, resolves THIS exhibit's assets, then loads/seeds + installs session/annDir/storeReady in a
    // single synchronous batch — no subscriber ever sees a half-opened exhibit (the old inline version
    // interleaved 7 mutations across 2 awaits). Asset resolution stays App-owned (assetUrls/assetsReady),
    // injected into the transition so it lands inside the same atomic open.
    await sess.open(prevSlug, {
      slug,
      resolveAssets: () => resolveAssets(slug, ex?.objects ?? []), // OPFS /assets → blob: URLs (sets assetsReady)
    });
    rev += 1;
    // Land at the exhibit's OVERVIEW scale (invention #1) UNLESS it's exactly one object, which goes
    // straight to its annotation surface (auto-open the only object; the back affordance is suppressed).
    // An EMPTY (0-object) exhibit also lands at the overview — that's the only place to name it + add
    // objects (the Details drawer lives there). The overview is an OBJECT-COUNT affordance only: sections
    // (a narrative) do NOT trigger it (ADR-0016 — narrative is an emergent reading mode of the published
    // exhibit, not an authoring gate). MUST stay in sync with `hasOverview` below (same predicate).
    view = (ex?.objects.length ?? 0) !== 1 ? "overview" : "editor";
  }
  async function backToLibrary() {
    sess.cancelPendingSave();
    await save();
    revokeAssetUrls(); // free the previous exhibit's blob: URLs
    assetsReady = false;
    editingObjectId = null; // drop any overview pencil edit-cursor as we leave the overview
    view = "library";
  }
  // Overview ↔ object (invention #1): descend from a plate into close annotation, then climb back. Going
  // back to the overview KEEPS the resolved thumbnails (unlike backToLibrary, which frees them).
  function openObject(objId: string) { editingObjectId = null; switchObject(objId); view = "editor"; }
  async function backToOverview() { editingObjectId = null; await save(); view = "overview"; }

  // --- Destructive removes (Archie-3f4c). Object → tombstone its notes (ADR-0003 append-only; recoverable
  // via history, orphaned tombstones don't project), then drop the object. Exhibit → clear its annotation
  // log, then drop it; the LAST exhibit leaves a truly-empty library (no DEFAULT_EXHIBITS reseed). ---
  // Tombstone an object's notes (ADR-0003 append-only; recoverable via history) then drop it from meta. The
  // shared core: removeCurrentObject navigates afterwards; the overview pencil's removeObjectById stays put.
  async function deleteObjectNotesAndMeta(objId: string) {
    const cid = canvasIdOf(objId);
    for (const r of sess.session.notes().filter((n) => !n.deleted && srcOf(n.target) === cid)) sess.session.deleteNote(r.logicalId as LogicalId);
    bump();
    await lib.removeObject(currentSlug, objId);
  }
  async function removeCurrentObject() {
    const objId = currentObjectId;
    const remaining = OBJECTS.filter((o) => o.id !== objId);
    await deleteObjectNotesAndMeta(objId);
    if (remaining[0]) switchObject(remaining[0].id);
    else { selected = null; editing = null; creating = null; await backToOverview(); } // last object → empty exhibit overview (valid post-e5c0)
  }
  // Overview pencil-CRUD delete (Archie-79be): remove ANY object without opening it; stay in the overview.
  // If the cursor pointed at the removed object, advance it to a survivor so the (unmounted) editor stays valid.
  async function removeObjectById(objId: string) {
    await deleteObjectNotesAndMeta(objId);
    // Keep the view==overview ⟺ hasOverview invariant: openExhibit routes a 1-object exhibit straight to the
    // editor, so deleting down to a lone survivor drops into ITS editor, not a 1-plate "overview" the rest of
    // the app never enters. (0 survivors → stay; an empty overview is valid, the only place to re-add.)
    if (OBJECTS.length === 1) { switchObject(OBJECTS[0]!.id); view = "editor"; return; }
    if (objId === currentObjectId) { const surv = OBJECTS.find((o) => o.id !== objId); if (surv) switchObject(surv.id); }
  }
  // Remove an exhibit by slug — meta + on-disk annotation log. Safe for a NON-loaded exhibit (library-grid
  // pencil CRUD, Archie-79be): session/asset teardown runs ONLY when the target is the loaded exhibit, so
  // deleting another exhibit can't tear down the one currently in the session.
  async function removeExhibitById(slug: string) {
    const isLoaded = slug === currentSlug;
    // forgetCurrent (not just cancelPendingSave): nulls the session's annDir so the NEXT openExhibit's
    // outgoing-flush can't re-create the log we're about to clear (Archie-79be — newly easy to hit now that
    // the library grid can delete the loaded exhibit; the pre-existing overview-remove path is fixed too).
    if (isLoaded) sess.forgetCurrent();
    await clearExhibitAnnotations(slug); // wipe its annotation log on disk (do NOT re-save it via backToLibrary)
    await lib.removeExhibit(slug);
    if (isLoaded) { revokeAssetUrls(); assetsReady = false; }
  }
  async function removeCurrentExhibit() {
    await removeExhibitById(currentSlug);
    view = "library";
  }
  // --- The KEYSTONE matched-pair cue state (staging spec §3 / §7). The leading published surface is a pure
  // function of sections.length (ADR-0016 contract): 0→1 flips the front door TO the narrative; last→0 flips
  // it BACK to the grid. setSections is the one place every section mutation funnels through, so it owns
  // detecting both crossings and raising the paired cue.
  // - 0→1: commit immediately (non-blocking), then raise the inline FIRST-ADD cue (once per exhibit).
  // - last→0: this REVERTS the front door, so guard it — hold the empty array pending an inline confirm
  //   ("Remove the last section?…") rather than silently clearing. Confirm commits; cancel discards.
  let firstAddCueSlug = $state<string | null>(null); // slug whose inline "now opens with your narrative" cue is showing
  let pendingClear = $state<{ slug: string } | null>(null); // a last→0 removal awaiting the inline confirm
  let clearedSlug = $state<string | null>(null); // slug whose narrative was JUST cleared → NarrativeEditor shows the "cleared" copy
  function dismissFirstAddCue() { firstAddCueSlug = null; }

  // Persist the authored narrative spine (NarrativeEditor onchange) → ExhibitMeta.sections → publishes as
  // IIIF Ranges (buildFullLibrary → toRanges). Library STRUCTURE persists ungated (sections aren't notes).
  // Thin dispatcher over the PURE narrativeCueReducer (the keystone crossing logic; staging spec §3/§7).
  // The reducer decides commit-intent + which cue to raise from the count transition; App owns the side
  // effects it can't (localStorage "seen" flag, patchExhibit, the $state cue vars).
  function setSections(sections: Section[]) {
    const prev = currentExhibit?.sections?.length ?? 0;
    const v = narrativeCueReducer(prev, sections.length, firstAddSeen(currentSlug));
    // last→0 (commit:false, cue:"clear"): reverting the front door is consequential — stash the (empty)
    // intent pending the inline confirm strip ("Remove" → confirmClear, "Keep" → cancelClear). Don't commit.
    if (!v.commit) { pendingClear = { slug: currentSlug }; return; }
    lib.patchExhibit(currentSlug, { sections });
    // MF-2: every committed write retires any pending last→0 confirm. Resolving a last-remove by ADDING (or
    // editing a title while the strip is up) commits a non-empty spine — the strip's "Remove the last
    // section?" copy is now false and confirmClear would wipe the spine without a fresh confirm. Reset it.
    pendingClear = null;
    if (sections.length > 0) clearedSlug = null; // any add/edit retires the "just cleared" empty-state copy
    // 0→1 (cue:"first-add"): the exhibit just became narrative-led. Announce the front-door flip once per
    // exhibit; markSeen at fire-time (the reducer gates on the seen flag we passed in) so a refresh before
    // dismiss won't re-fire.
    if (v.cue === "first-add") firstAddCueSlug = currentSlug;
    if (v.markSeen) markFirstAddSeen(currentSlug);
  }
  // The last→0 confirm resolved "Remove": commit the clear (the front door reverts to the grid; the
  // NarrativeEditor's empty state then shows the "Narrative cleared…" copy). A pending FIRST-ADD cue can't
  // coexist with a clear, but defensively drop it.
  function confirmClear() {
    if (!pendingClear) return;
    lib.patchExhibit(pendingClear.slug, { sections: [] });
    firstAddCueSlug = null;
    clearedSlug = pendingClear.slug; // arm the NarrativeEditor's "Narrative cleared…" empty-state copy
    pendingClear = null;
  }
  function cancelClear() { pendingClear = null; }
  // --- narrative camera FRAMING (ADR-0005 + placement correction 2026-05-25) ---
  // A Section's camera (`start`) is set by FRAMING it on the editor canvas — the same gesture as a note's
  // geometry — not by typing a fragment. "Frame camera" on a section rail-JUMPS to that section's object
  // (an explicit, visible move — never an implicit rebind), then arms the canvas draw; the next drawn box
  // (or AV in-out) becomes the camera instead of creating a note. A section is bound to its object at
  // creation; navigating between objects (navigateToSection) WALKS the spine, it never rebinds.
  let framingSectionId = $state<string | null>(null);
  function startFraming(sectionId: string) {
    const s = (currentExhibit?.sections ?? []).find((x) => x.id === sectionId);
    if (!s) return;
    switchObject(s.objectId); // jump the rail to the section's object so you frame on the right canvas
    creating = null; // framing and new-note are mutually exclusive gestures
    framingSectionId = sectionId; // arms the OSD box draw via drawArmed (image objects); AV frames via "Set in"
  }
  function cancelFraming() { framingSectionId = null; }
  // Capture a framed camera onto the section (objectId = the object now in view, set when framing began).
  function setSectionStart(sectionId: string, start: string) {
    setSections((currentExhibit?.sections ?? []).map((s) => (s.id === sectionId ? { ...s, start, objectId: currentObjectId } : s)));
  }

  // --- narrative card NAVIGATION (mirrors the viewer's NarrativeReader.activate) ---
  // A narrative card is the control that MOVES between the exhibit's objects: clicking it jumps the rail to
  // the section's object and FOCUSES its framed region on the canvas, so the author sees exactly what the
  // section shows — the editor counterpart of the reader's focus={activeSection.start} (NarrativeReader.svelte).
  let focusSectionId = $state<string | null>(null);
  function navigateToSection(sectionId: string) {
    const s = (currentExhibit?.sections ?? []).find((x) => x.id === sectionId);
    if (!s) return;
    switchObject(s.objectId); // rail-jump to the section's object (no-op when already there; clears focusSectionId)
    focusSectionId = sectionId; // set AFTER switchObject → drives the canvas focus fragment + the lit "active" card
  }
  // The framed region the active card points at, passed to Canvas.focus to fit the viewport to it (ADR-0005
  // Section.start). Gated on object-match so a stale fragment never fits the wrong canvas; a temporal `t=` AV
  // fragment no-ops on the spatial canvas anyway (AV uses AvEditor, which takes no focus).
  const focusSection = $derived((currentExhibit?.sections ?? []).find((s) => s.id === focusSectionId) ?? null);
  const canvasFocus = $derived(focusSection && focusSection.objectId === currentObjectId ? (focusSection.start ?? null) : null);
  // Section count for the Narrative accordion header (shown even when that panel is collapsed).
  const narrativeSectionCount = $derived((currentExhibit?.sections ?? []).length);
  // Section creation lives in App now (NarrativeEditor is display-only): the narrative panel's create row —
  // OUTSIDE the collapsing body, always reachable — calls these. A new section is anchored to the item you're
  // viewing; "from a note" seeds object + camera + prose from an existing Note (ADR-0005 model-(A) mitigation).
  const newSectionId = () => `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  function addSection() {
    if (!currentObjectId) return;
    const secs = currentExhibit?.sections ?? [];
    setSections([...secs, { id: newSectionId(), title: `Section ${secs.length + 1}`, objectId: currentObjectId }]);
    openPanelTo("narrative"); // auto-expand: reveal the new section in the spine
  }
  function addSectionFromNote(n: { objectId: string; start?: string; lead: string }) {
    const secs = currentExhibit?.sections ?? [];
    setSections([...secs, { id: newSectionId(), title: `Section ${secs.length + 1}`, objectId: n.objectId, ...(n.start ? { start: n.start } : {}), prose: n.lead }]);
    openPanelTo("narrative"); // auto-expand: reveal the new section in the spine
  }

  // --- note editing POPOVER (ADR-0006): the WADM form anchors to the selected marker on the image canvas
  // instead of sitting at the bottom of a scrolling sidebar. `notePos` is streamed up from Canvas
  // (onmarkerrect) and OSD re-anchors it on every pan/zoom (donor: annotorious-svelte). The user can DRAG
  // it; the manual position pins to THAT note (keyed by id) so a fresh selection re-anchors to its marker. ---
  let notePos = $state<{ left: number; top: number } | null>(null);
  let noteManualPos = $state<{ id: string; left: number; top: number } | null>(null);
  let mainEl = $state<HTMLElement | null>(null); // the canvas pane — the popover (position:fixed) falls back INSIDE it
  const notePopoverPos = $derived.by(() => {
    if (noteManualPos && noteManualPos.id === editing) return { left: noteManualPos.left, top: noteManualPos.top };
    if (notePos) return notePos;
    // Marker rect not resolved yet → anchor inside the canvas pane (viewport coords), NEVER the viewport
    // corner (which is over the left sidebar). Re-derives once notePos arrives.
    void rev;
    const r = mainEl?.getBoundingClientRect();
    return r ? { left: r.left + 24, top: r.top + 24 } : { left: 380, top: 96 };
  });
  let noteDragging = false;
  let noteDragStart = { x: 0, y: 0, left: 0, top: 0 };
  function noteDragDown(e: PointerEvent) {
    if (editing === null) return;
    noteDragging = true;
    noteDragStart = { x: e.clientX, y: e.clientY, left: notePopoverPos.left, top: notePopoverPos.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function noteDragMove(e: PointerEvent) {
    if (!noteDragging || editing === null) return;
    noteManualPos = { id: editing, left: noteDragStart.left + (e.clientX - noteDragStart.x), top: noteDragStart.top + (e.clientY - noteDragStart.y) };
  }
  function noteDragUp(e: PointerEvent) {
    noteDragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  // Resizable / collapsible notes+spine sidebar (Phase-2 expandability). `asideWidth` is a px OVERRIDE
  // of the responsive clamp() default (null ⇒ default); persisted per the archie.*.v1 metadata idiom
  // (same as IDENTITY_KEY). The drag math is headless-tested in @render/core; ResizeDivider is the handle.
  const ASIDE_W_KEY = "archie.notesAsideWidth.v1";
  const ASIDE_COLLAPSED_KEY = "archie.notesAsideCollapsed.v1";
  function loadAsideW(): number | null { try { const v = localStorage.getItem(ASIDE_W_KEY); return v ? (Number(v) || null) : null; } catch { return null; } }
  function loadAsideCollapsed(): boolean { try { return localStorage.getItem(ASIDE_COLLAPSED_KEY) === "1"; } catch { return false; } }
  let asideWidth = $state<number | null>(loadAsideW());
  let asideCollapsed = $state<boolean>(loadAsideCollapsed());
  function persistAside(s: { width: number | null; collapsed: boolean }) {
    try {
      if (s.width == null) localStorage.removeItem(ASIDE_W_KEY); else localStorage.setItem(ASIDE_W_KEY, String(Math.round(s.width)));
      localStorage.setItem(ASIDE_COLLAPSED_KEY, s.collapsed ? "1" : "0");
    } catch { /* private mode — size simply resets next load, harmless */ }
  }

  // Editor-sidebar ACCORDION: the exhibit-wide Narrative spine and the object-local Notes were fighting for
  // vertical space with no signal they're different SCOPES. They're now two EXCLUSIVE panels — opening one
  // collapses the other, so only one ever takes space. `openPanel` is the single open panel, or null = both
  // collapsed to their (scope + count) headers. Persisted per the archie.*.v1 metadata idiom. Default: Notes
  // (the per-object annotate loop is the most frequent task; the Narrative is reached deliberately).
  const PANEL_KEY = "archie.editorPanel.v1";
  function loadPanel(): "narrative" | "notes" | "place" | "info" | null { try { const v = localStorage.getItem(PANEL_KEY); return v === "narrative" ? "narrative" : v === "place" ? "place" : v === "info" ? "info" : v === "none" ? null : "notes"; } catch { return "notes"; } }
  let openPanel = $state<"narrative" | "notes" | "place" | "info" | null>(loadPanel());
  function togglePanel(p: "narrative" | "notes" | "place" | "info") {
    openPanel = openPanel === p ? null : p; // click the open one → collapse all; click a collapsed one → open it (the other closes)
    try { localStorage.setItem(PANEL_KEY, openPanel ?? "none"); } catch { /* private mode — resets next load, harmless */ }
  }
  // AUTO-EXPAND rules — because the create tools sit OUTSIDE the panels (always reachable), completing a create
  // action opens the matching panel so you SEE the result:
  //   • Narrative opens when you ADD A SECTION (addSection / addSectionFromNote).
  //   • Notes opens when you CREATE A NOTE — draw a region (onCreate), mark an AV moment (onCreateTime), or
  //     import notes (CSV / WADM / transcript).
  // Framing a camera and card-navigation DON'T auto-expand: those controls live in the spine body, so the
  // Narrative panel is already open. TRANSIENT — auto-expand does NOT persist (only a manual togglePanel writes
  // the default); a single create shouldn't silently change which panel opens next session.
  function openPanelTo(p: "narrative" | "notes" | "place" | "info") {
    if (openPanel === p) return;
    openPanel = p; // no localStorage write — transient reveal, not a persisted preference (see note above)
  }

  // Pin the note editor to a docked side inspector (ADR-0006's sanctioned fallback) instead of the
  // floating marker popover — deep editing without the cramped 320px column. SAME form, different home.
  const NOTE_PINNED_KEY = "archie.noteInspectorPinned.v1";
  function loadNotePinned(): boolean { try { return localStorage.getItem(NOTE_PINNED_KEY) === "1"; } catch { return false; } }
  let notePinned = $state<boolean>(loadNotePinned());
  function persistPinned() { try { localStorage.setItem(NOTE_PINNED_KEY, notePinned ? "1" : "0"); } catch { /* private mode — harmless */ } }
  // "Save" on the note editor: commit any uncommitted comment text (edits already autosave live, but a click
  // might not have blurred the textarea first), then deselect → the popover hides (selected drives `sel`).
  function closeNote() {
    if (sel && commentEl) applyForm(commentEl.value, tagsOf(sel).join(", "));
    selected = null;
    editing = null;
  }
  // Reorder the current exhibit's objects to a new id sequence (the overview's drag-reorder). Object array
  // ORDER is the canonical reading order (Grid display order / Narrative sequence; ADR model.ts) — the
  // published projection derives from it, so this is real structure, settable nowhere else in the app.
  function reorderObjects(orderedIds: string[]) {
    const ex = currentExhibit;
    if (!ex) return;
    const byId = new Map(ex.objects.map((o) => [o.id, o]));
    const next: ObjectMeta[] = [];
    for (const id of orderedIds) { const o = byId.get(id); if (o) next.push(o); }
    for (const o of ex.objects) if (!orderedIds.includes(o.id)) next.push(o); // safety: keep any unlisted
    lib.patchExhibit(ex.slug, { objects: next });
  }

  // "Keep a copy" (§115 conversion): fork the current EXAMPLE (playground) into a saved, user-owned
  // exhibit, carrying the current notes (retargeted to the copy's canvas IRIs) — so the work you did
  // while trying the template isn't lost. The copy is a project (persists; no banner). Single example
  // in hand ⇒ nothing else to lose (§146 trap avoided by construction).
  let keeping = $state(false);
  async function keepCopy() {
    const ex = lib.meta.exhibits.find((e) => e.slug === currentSlug);
    if (!ex || !isTemplate(currentSlug)) return;
    keeping = true;
    const from = currentSlug;
    let slug = `${ex.slug}-copy`, n = 2;
    while (lib.meta.exhibits.some((e) => e.slug === slug)) slug = `${ex.slug}-copy-${n++}`;
    const { seedVersion: _omit, ...rest } = ex; // a user copy is not a reconciled default
    const copy: ExhibitMeta = { ...rest, id: `ex-${slug}`, slug, title: `${ex.title} (copy)`, objects: ex.objects.map((o) => ({ ...o })) };
    lib.setMeta({ ...lib.meta, exhibits: [...lib.meta.exhibits, copy] });
    // Re-create the current head notes against the copy's canvas IRIs (fresh records — it's new content).
    const fromBase = `${BASE}${from}/canvas/`, toBase = `${BASE}${slug}/canvas/`;
    const carried = sess.session.notes().filter((r) => !r.deleted).map((r) => {
      const src = srcOf(r.target);
      const target = src && src.startsWith(fromBase) && typeof r.target !== "string"
        ? { ...(r.target as object), source: toBase + src.slice(fromBase.length) } : r.target;
      return { target, body: r.body, motivation: r.motivation, layers: r.layers, reading: r.reading };
    });
    await lib.persist();
    await openExhibit(slug); // not a template → persists; seeds empty
    for (const c of carried) sess.session.createNote({ target: c.target, ...(c.body !== undefined ? { body: c.body } : {}), ...(c.motivation !== undefined ? { motivation: c.motivation } : {}), ...(c.layers !== undefined ? { layers: c.layers } : {}), ...(c.reading !== undefined ? { reading: c.reading } : {}) });
    rev += 1;
    await save();
    keeping = false;
  }
  // Create a new exhibit (no objects yet — add them in the editor), persist, and open it.
  async function newExhibit(title: string) {
    const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exhibit";
    let slug = base, n = 2;
    while (lib.meta.exhibits.some((e) => e.slug === slug)) slug = `${base}-${n++}`;
    // No `layout` written (ADR-0016): the leading surface is DERIVED from content by resolveLayout
    // (sections → narrative, >1 object → grid, else single). The field is deprecated; Studio never writes it.
    await lib.addExhibit({ id: `ex-${slug}`, slug, title: title.trim() || "Untitled exhibit", objects: [] });
    await openExhibit(slug);
  }
  // The ingest flows (file/URL/AV/map object-add, folder/manifest exhibit-create, CSV/WADM bulk-note
  // import, and the destructive open-zip/open-folder replace) live in ingest-flows.ts now (the DOMINO
  // cut). `flows` is constructed below — after the $state + the lifecycle callbacks it closes over.
  // `newExhibitFromFolder` lands at the LIBRARY scale (several new exhibits) — App finishes the nav.
  async function newExhibitFromFolder(files: File[]) {
    const r = await flows.newExhibitFromFolder(files);
    if (r && r.groups > 1) await backToLibrary(); // multi-folder import → where they're all visible
  }
  // Open a .archie.zip then bind to it (the zip is now this Library's canonical file) — App keeps the
  // binding-chip update on its side (the flow stays binding-agnostic).
  async function openZipFile(file: File) {
    const r = await flows.openZip(file);
    if (r) bnd.bindToFile(file.name);
  }

  // --- add an object to the current exhibit (Phase D authoring) ---
  let addingObject = $state(false);
  // Import feedback (AV ingest/upload UX): a large recording can take a beat to land in OPFS, so show
  // which file is importing; `importNote` carries a transient curator-voice message (unsupported file,
  // or a gentle link-by-URL nudge for very large media). Cleared at the start of each new import.
  let importStatus = $state<{ name: string; index: number; total: number } | null>(null);
  let importNote = $state("");
  let addSource = $state("");
  let addLabel = $state("");
  // Add-map modal (Phase 3 / Q3 — invented UX, human-gated): a Map is an Object whose source is its tile
  // template and which carries the tileSource descriptor (medium = Map). The modal supplies template + bounds.
  // The add-map FLOW (addMapObject) lives in ingest-flows.ts; this `$state` backs the modal's open chrome.
  let mapModalOpen = $state(false);
  // Drag-and-drop onto the canvas area → the ingest flows' addFiles.
  let dragOver = $state(false);
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    void flows.addFiles(e.dataTransfer?.files ?? null);
  }

  let rev = $state(0);
  const bump = () => { rev += 1; sess.markDirty(); scheduleSave(); };
  let selected = $state<string | null>(null);
  // `editing` drives the WADM form. It FOLLOWS `selected` on real selections but NOT on the null
  // deselect Annotorious fires when setAnnotations replaces the set (which happens on every edit) —
  // otherwise the form would close after every change (P2-5). Cleared explicitly on delete/switch.
  let editing = $state<string | null>(null);
  $effect(() => { if (selected !== null) editing = selected; });
  // ADR-0011: creation is gesture-initiated, not a sticky tool mode. Selection is ambient (the canvas
  // resting state). `creating` is the transient armed state for a NEW NOTE — null = not drawing; a chosen
  // shape = "draw the next region, then disarm". Narrative camera framing (framingSectionId) shares the
  // same draw path. The two are mutually exclusive. No persistent Select|Rect|Polygon palette anymore.
  let creating = $state<DrawTool | null>(null);
  // Coordinate-free CSV imports (Archie-79c0 sub-cycle B): notes whose TEXT arrived without a region,
  // staged exhibit-scoped (persisted via the pending-notes sidecar) until the author draws each box.
  // `placingPendingId` arms that draw — geometry comes from onCreate, exactly like narrative framing.
  let pendingNotes = $state<PendingNote[]>([]);
  let placingPendingId = $state<string | null>(null);
  const drawArmed = $derived(creating !== null || framingSectionId !== null || placingPendingId !== null); // canvas in draw mode while any gesture is live
  const drawShape = $derived<DrawTool>(creating ?? "rectangle"); // framing always frames a box
  // P-2 (archie-ux Q-2): reading DISPLAY state — visible SET + active pen, never conflated.
  // The rail (ReadingsRail, on the canvas) is the one home; the old dropdown is retired.
  const rdg = createReadingState();
  $effect(() => { rdg.reconcile(currentReadings); });
  // The unified Readings modal: name+colour+description in ONE place, the concept explained in its
  // header. Replaces the ADR-0007 first-add gate (ReadingHelp + localStorage flag) — the teaching
  // copy lives permanently in the modal, so there's nothing to remember or re-nag about.
  let readingsOpen = $state(false);
  // Which object of the exhibit the editor is showing. Switching resets transient view state.
  let currentObjectId = $state("o1");
  const current = $derived(OBJECTS.find((o) => o.id === currentObjectId) ?? OBJECTS[0]);
  // The overview pencil's edit target (pencil-CRUD, Archie-79be) — a transient cursor independent of
  // currentObjectId, so editing a plate's details opens a drawer WITHOUT navigating into the object.
  let editingObjectId = $state<string | null>(null);
  const editingObject = $derived(currentExhibit?.objects.find((o) => o.id === editingObjectId) ?? null);
  const canvasId = $derived(canvasIdOf(currentObjectId));
  // AV objects (sound/video) get the temporal AvEditor instead of the OSD Canvas (draw tools too).
  const isAvCurrent = $derived(current?.mediaType === "sound" || current?.mediaType === "video");
  $effect(() => { if (view === "editor" && isAvCurrent && !AvEditorComp) void import("./AvEditor.svelte").then((m) => { AvEditorComp = m.default; }); });
  // Map objects (geo-annotation): a tileSource descriptor mounts a slippy-map basemap on the same OSD
  // Canvas. The pin tool + lng/lat readout are gated on this.
  const currentTileSource = $derived(current?.tileSource);
  const isMapCurrent = $derived(!!current?.tileSource);
  // The image URL the Canvas mounts: imported (/assets) objects resolve to their blob: URL.
  const currentSource = $derived(current ? (isAsset(current.source) ? (assetUrls[current.id] ?? current.source) : current.source) : "");
  // Resolved image URL for an object's rail thumbnail (asset → blob: URL; else a RENDERABLE derivative —
  // a bare IIIF service base isn't an image, so thumbnailUrl derives a sized JPEG; plain files pass through).
  const thumbSrc = (o: { id: string; source: string; tileSource?: TileSourceDescriptor }): string => (
    o.tileSource ? thumbnailUrl(o.tileSource, 240) // a Map → its z0 world tile (thumbnailUrl handles the descriptor)
    // Prefer the baked thumbnail blob (small) over the full master — the overview/rail decode a shrunk
    // plate, not a ~2048px master. Falls back to the master when no thumbnail was baked.
    : isAsset(o.source) ? (thumbUrls[o.id] ?? assetUrls[o.id] ?? "") : thumbnailUrl(o.source, 240)
  );
  function switchObject(id: string) {
    if (id === currentObjectId) return;
    currentObjectId = id;
    selected = null;
    editing = null;
    creating = null; // cancel any armed new-note gesture when changing objects
    placingPendingId = null; // …and any armed pending-placement (a manual switch leaves the bound object)
    focusSectionId = null; // a manual rail switch drops the narrative card's frame focus (navigateToSection re-sets it)
  }
  // --- pending notes (coordinate-free imports → "Set area" placement; Archie-79c0 sub-cycle B) ---
  const objectLabelOf = (id: string) => OBJECTS.find((o) => o.id === id)?.label ?? id;
  const newPendingId = () => `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  // Persist the current exhibit's pending list into the slug-keyed sidecar (whole-map I/O; single writer).
  async function persistPending() {
    const map = await loadPendingNotes();
    if (pendingNotes.length) map[currentSlug] = [...pendingNotes]; else delete map[currentSlug];
    await savePendingNotes(map);
  }
  // IngestContext hook: stage coordinate-free CSV rows, deduped by (object, comment). Returns the NEW count.
  function addPendingNotes(incoming: CsvPendingNote[]): number {
    const key = (p: { objectId: string; comment: string }) => `${p.objectId} ${p.comment}`;
    const seen = new Set(pendingNotes.map(key));
    let added = 0;
    for (const n of incoming) {
      if (seen.has(key(n))) continue;
      seen.add(key(n));
      pendingNotes.push({ id: newPendingId(), ...n });
      added++;
    }
    if (added > 0) void persistPending();
    return added;
  }
  function removePending(id: string) {
    pendingNotes = pendingNotes.filter((p) => p.id !== id);
    if (pendingNotes.length === 0 && openPanel === "place") openPanelTo("notes"); // worklist emptied → reveal Notes
    void persistPending();
  }
  // "Set area" on a pending note: jump to its bound object, arm the draw; onCreate consumes the next box.
  function startPlacing(id: string) {
    const p = pendingNotes.find((n) => n.id === id);
    if (!p) return;
    switchObject(p.objectId); // pending notes span the exhibit — land on the right canvas first
    creating = null; framingSectionId = null;
    placingPendingId = id; // arm AFTER the switch (switchObject nulls it)
  }
  function cancelPlacing() { placingPendingId = null; }
  const placingPending = $derived(placingPendingId ? (pendingNotes.find((p) => p.id === placingPendingId) ?? null) : null);
  // "Fill in the blank" on-ramp: download a starter CSV seeded with THIS exhibit's items (csv-import).
  function downloadCsvTemplate() {
    const csv = buildCsvTemplate(OBJECTS.map((o) => ({ id: o.id, label: o.label, ...(o.mediaType ? { mediaType: o.mediaType } : {}) })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${currentSlug || "exhibit"}-notes-template.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  // Step to the previous/next object on the rail ([ / ] shortcuts).
  function stepObject(dir: -1 | 1) {
    if (OBJECTS.length < 2) return;
    const i = OBJECTS.findIndex((o) => o.id === currentObjectId);
    const j = Math.max(0, Math.min(OBJECTS.length - 1, i + dir));
    if (OBJECTS[j]) switchObject(OBJECTS[j]!.id);
  }
  // Rename an object (its label is authored structure → persist to library.json). Empty = ignored.
  function renameObject(objId: string, label: string) {
    const l = label.trim();
    if (!l) return;
    lib.patchObject(currentSlug, objId, { label: l });
  }

  // --- Reading mode (ADR-0016 "narrative as an emergent reading mode"): the leading surface is a PURE
  // FUNCTION OF CONTENT — no stored/picked layout. DELEGATES to render-core's single-source discriminant
  // (resolveLayoutType); drives only display (the overview intent line). The deprecated stored
  // `exhibit.layout` is NEVER read or written here. The LayoutPicker is retired.
  const currentLayout = $derived<LayoutType>(
    currentExhibit ? resolveLayoutType(currentExhibit.objects, currentExhibit.sections) : "single",
  );
  const currentReadings = $derived<Reading[]>(currentExhibit?.readings ?? []);
  // (Marginalia cuts D+E reverted 2026-06-11 on user review — "does not look good". The ENGINE
  // survives headless-tested for a future presentation redesign: core layoutMarginalia(+pinId),
  // mount markerScreenRects, Canvas rectIds/onmarkerrects, render-svelte MarginColumn. See
  // IMPROVEMENT-WORKLIST ledger + the marginalia-redesign seeds issue.)
  // Whether this exhibit has an overview scale (invention #1): NOT exactly one object (so: 0 to name/fill,
  // or >1 to arrange). An OBJECT-COUNT affordance only — sections/narrative do NOT trigger it (ADR-0016).
  // MUST stay in sync with openExhibit's routing predicate above.
  const hasOverview = $derived((currentExhibit?.objects.length ?? 0) !== 1);
  // The current exhibit's notes, shaped for the NarrativeEditor's "add section from a Note" shortcut
  // (ADR-0005 mitigation): objectId from the target canvas, start = the selector fragment, lead = the prose.
  const narrativeNotes = $derived.by(() => {
    void rev; // re-derive when the log changes
    return sess.session.notes().filter((r) => !r.deleted).map((r) => {
      const objectId = (srcOf(r.target) ?? "").split("/canvas/")[1] ?? "";
      const start = selectorValue(r);
      return { id: r.logicalId, objectId, ...(start ? { start } : {}), lead: stripMarkdown(commentOf(r)).slice(0, 80) || "(untitled)" };
    });
  });
  // --- Readings (ADR-0007): the exhibit's curated interpretive passes. Persisted on ExhibitMeta,
  // published as a registry + per-reading AnnotationPages. A note belongs to ONE reading or none (base). ---
  function setReadings(readings: Reading[]) {
    lib.patchExhibit(currentSlug, { readings });
  }
  // Reading colours (ADR-0007: colour identifies the reading; the viewer legend is a colour radio). The
  // curator may PICK one (Archie-1489) — auto-cycled as the sensible default so naming-and-go still works.
  const READING_PALETTE = ["#3A8C5D", "#a3553a", "#4c5d8a", "#8a6d3b", "#6b4c8a", "#3a7d8a"];
  function setNoteReading(reading: string | null) {
    if (!editing) return;
    sess.session.editNote(editing as LogicalId, { reading });
    bump();
  }
  // Per-note emphasis (Archie-1489): EMPHASIS ONLY — opacity/weight, never hue (hue = the reading, ADR-0007).
  function setNoteEmphasis(emphasis: Emphasis) {
    if (!editing) return;
    sess.session.editNote(editing as LogicalId, { emphasis });
    bump();
  }

  // --- Rights & credit (rights grill Phase 2): the shared RightsEditor sets these at all three levels.
  // Each replaces the level's rights fields with the editor's emitted next-state, then persists. ---
  function setObjectRights(next: RightsFields) {
    const objId = currentObjectId;
    lib.patchObject(currentSlug, objId, { rights: next.rights, requiredStatement: next.requiredStatement });
  }
  function setExhibitRights(next: RightsFields) {
    lib.patchExhibit(currentSlug, { rights: next.rights, requiredStatement: next.requiredStatement });
  }
  function setLibraryRights(next: RightsFields) {
    lib.patchLibrary({ rights: next.rights, requiredStatement: next.requiredStatement });
  }

  // --- Title + description editing (Phase 4): library/exhibit/object identity, editable wherever the
  // level's details surface lives. Object TITLE is the inline rail label (renameObject); object DESCRIPTION
  // (summary) is set here. Empty string clears (stripped at publish). ---
  function setLibraryTitle(v: string) { lib.patchLibrary({ title: v }); }
  function setLibrarySummary(v: string) { lib.patchLibrary({ summary: v }); }
  function setExhibitTitle(v: string) {
    lib.patchExhibit(currentSlug, { title: v });
  }
  function setExhibitSummary(v: string) {
    lib.patchExhibit(currentSlug, { summary: v });
  }
  function setObjectSummary(v: string) {
    const objId = currentObjectId;
    lib.patchObject(currentSlug, objId, { summary: v });
  }

  // --- Per-item metadata edit (pencil CRUD, Archie-79be): id-parameterized siblings of the cursor wrappers
  // above. The library grid edits any EXHIBIT and the overview edits any OBJECT without opening it, so these
  // take an explicit id instead of reading currentSlug/currentObjectId. Object edits target the open exhibit. ---
  function patchExhibitMeta(slug: string, fields: Partial<ExhibitMeta>) { lib.patchExhibit(slug, fields); }
  function patchObjectMeta(objId: string, fields: Partial<ObjectMeta>) { lib.patchObject(currentSlug, objId, fields); }

  // Notes + working annotations are scoped to the CURRENT object's canvas (then the layer filter).
  const allNotes = $derived((rev, sess.session.notes()));
  const objNotes = $derived(allNotes.filter((r) => srcOf(r.target) === canvasId));
  const notes = $derived(
    objNotes.filter((r) => rdg.noteVisible(r)), // visibility = the reading-state set (canvas + margin share it)
  );
  const objAnnotations = $derived<W3CAnnotation[]>((rev, sess.session.workingAnnotations().filter((a) => srcOf(a.target) === canvasId)));
  // O(1) marker lookup for the live styler: Annotorious calls styleOf per marker on every restyle
  // (hover / solo / reading toggle), so a per-call array scan was O(n²) across the canvas. Rebuilt only
  // when the working-annotation set changes.
  const annById = $derived(new Map(objAnnotations.map((a) => [a.id, a] as const)));
  const annotations = $derived<W3CAnnotation[]>(
    objAnnotations.filter((a) => rdg.isVisible(((a as Record<string, unknown>)["archie:reading"] as string | undefined) ?? "base")),
  );
  const sel = $derived(notes.find((r) => r.logicalId === editing));
  // Note count per canvas, built ONCE per allNotes change — the overview/library lists call this per
  // object, so the old per-call filter was O(objects × notes) on every `rev` bump. O(1) lookup now.
  const noteCountByCanvas = $derived.by(() => {
    const m = new Map<string, number>();
    for (const r of allNotes) { const c = srcOf(r.target); m.set(c, (m.get(c) ?? 0) + 1); }
    return m;
  });
  const noteCountOf = (objId: string) => noteCountByCanvas.get(canvasIdOf(objId)) ?? 0;
  // Live marker styling (Archie-1489) — mirrors the viewer's readingStyleOf so the curator authors against
  // what a visitor sees. Colour = the note's reading (ADR-0007); reading-less notes get a neutral forest-
  // green default (so base marks are visible). Per-note emphasis modulates opacity/weight ONLY, never hue.
  const BASE_MARKER = "#3A8C5D"; // forest green — the base (reading-less) note default
  // The active reading (the pen's destination), shaped for the draw-time cue (P1): name + colour,
  // falling back to base ("General notes" / the base hue) when the pen is on base. `find ?? null`
  // dodges the BASE-url collision — base is never in currentReadings, so a miss means base.
  const activeReading = $derived(currentReadings.find((r) => r.id === rdg.active) ?? null);
  const activeReadingLabel = $derived(activeReading?.name ?? "General notes");
  const activeReadingColour = $derived(activeReading?.colour ?? BASE_MARKER);
  // Solo (rail-row hover, B4): the soloed reading's fill returns while comparing. null = none.
  let soloReading = $state<string | null>(null);
  // Per-NOTE solo: hovering a note in the list lights its mark on the canvas (the rail's hover
  // affordance applied to annotations). null = none.
  let hoverNote = $state<string | null>(null);
  // Canvas re-applies styles only when the styleOf PROP IDENTITY changes ($effect dep) — a stable
  // function would freeze the comparing/solo regime (browser-harness finding). This derived mints
  // a fresh identity whenever the display state (visibility/solo/hover/readings/log) changes.
  const styleOfLive = $derived.by(() => {
    void rdg.comparing(currentReadings);
    void soloReading;
    void hoverNote;
    void rev;
    return (id: string) => markerStyleOf(id);
  });
  function markerStyleOf(id: string): MarkerStyle | undefined {
    const a = annById.get(id);
    if (!a) return undefined;
    const rid = (a as Record<string, unknown>)["archie:reading"] as string | undefined;
    const colour = (rid ? currentReadings.find((r) => r.id === rid)?.colour : undefined) ?? BASE_MARKER;
    // ONE style source for both apps (render-core readingMarkerStyle) carrying the comparing
    // regime (archie-ux Q-2): 2+ readings visible → outline-only; solo-on-hover restores a fill.
    return readingMarkerStyle(colour, emphasisOf(a), {
      comparing: rdg.comparing(currentReadings),
      soloed: soloReading !== null && (rid ?? "base") === soloReading,
      highlighted: hoverNote === id, // the hovered list note's mark is momentarily the brightest thing
    });
  }

  // --- canvas lifecycle ---
  function onCreate(a: W3CAnnotation) {
    if (framingSectionId) {
      // Framing a narrative camera, not creating a note: the drawn box's xywh fragment becomes the camera.
      const frag = (a.target as { selector?: { value?: string } } | undefined)?.selector?.value;
      if (frag) setSectionStart(framingSectionId, frag);
      framingSectionId = null;
      return;
    }
    if (placingPendingId) {
      // Placing a coordinate-free import: the drawn box gives the staged note its geometry, then it's
      // consumed from the tray. Body mirrors importNotesCsv (comment + tags); reading + geo carried too.
      const p = pendingNotes.find((n) => n.id === placingPendingId);
      if (p) {
        const geo = isMapCurrent ? geoForTarget(a.target, currentTileSource) : undefined;
        const id = sess.session.createNote({
          target: a.target,
          body: [
            { type: "TextualBody", value: p.comment, purpose: "commenting" },
            ...p.tags.map((t) => ({ type: "TextualBody" as const, value: t, purpose: "tagging" as const })),
          ],
          ...(geo ? { geo } : {}),
          ...(p.reading ? { reading: p.reading } : {}),
        });
        removePending(p.id); // drop from the worklist + persist (reveals Notes once the list empties)
        bump();
        selected = id;
      }
      placingPendingId = null;
      return;
    }
    // On a Map, capture the region's geo-truth (lng/lat) alongside the pixel selector (Q4/ADR-0015).
    const geo = isMapCurrent ? geoForTarget(a.target, currentTileSource) : undefined;
    const id = sess.session.createNote({ target: a.target, ...(geo ? { geo } : {}), ...(rdg.newNoteReading() !== undefined ? { reading: rdg.newNoteReading()! } : {}) }); // the PEN, never visibility (Q1)
    bump();
    selected = id;
    creating = null; // the gesture produced its note; disarm back to ambient selection (ADR-0011)
    openPanelTo("notes"); // auto-expand: the new note lands in the present-notes list
  }
  // Geometry edit on canvas → re-derive geo-truth on a Map (null clears it if the new shape is unparseable).
  const onUpdate = (a: W3CAnnotation) => { sess.session.editNote(a.id as LogicalId, { target: a.target, ...(isMapCurrent ? { geo: geoForTarget(a.target, currentTileSource) ?? null } : {}) }); bump(); };
  const onDelete = (id: string) => { sess.session.deleteNote(id as LogicalId); bump(); if (selected === id) selected = null; if (editing === id) editing = null; };
  // Hand-annotate AV: AvEditor marked a [start,end] region → create a supplementing time note, then
  // select it so the WADM form opens to type the note (the temporal analogue of onCreate for OSD draws).
  function onCreateTime(start: number, end: number, box?: { x: number; y: number; w: number; h: number }) {
    // A video region note is SPATIOTEMPORAL — `t=…&xywh=percent:…` (ADR-0006); audio/whole-frame stay `t=`.
    const value = box ? mediaFragmentValue({ time: { start, end }, box, unit: "percent" }) : timeFragmentValue(start, end);
    if (framingSectionId) {
      // Framing an AV-bound narrative camera: the moment (± region) becomes the section's `start`, not a note.
      setSectionStart(framingSectionId, value);
      framingSectionId = null;
      return;
    }
    const target = { type: "SpecificResource" as const, source: canvasId, selector: { type: "FragmentSelector" as const, conformsTo: "http://www.w3.org/TR/media-frags/", value } };
    const id = sess.session.createNote({ target, body: [{ type: "TextualBody", value: "", purpose: "supplementing" }], motivation: "supplementing" });
    bump();
    selected = id;
    openPanelTo("notes"); // auto-expand: the new time note lands in the present-notes list
  }
  // Import a WebVTT/SRT transcript for the current AV object → supplementing time notes. APPEND-ONLY
  // (archie-av Q-1, advisor): each cue becomes a new note even if it overlaps existing ones — no
  // destructive replace, no heuristic merge. Format-agnostic (importTranscript's parser handles both).
  function onImportTranscript(text: string) {
    const cued = importTranscript([], text, { source: canvasId, lastEditor: author });
    let n = 0;
    for (const r of cued) { sess.session.createNote({ target: r.target, ...(r.body !== undefined ? { body: r.body } : {}), ...(r.motivation !== undefined ? { motivation: r.motivation } : {}) }); n++; }
    if (n > 0) { bump(); openPanelTo("notes"); } // auto-expand: reveal the imported transcript time-notes (mirrors CSV/WADM)
  }

  // --- WADM form helpers ---
  const bodies = (r: AnnotationRecord): W3CBody[] => (Array.isArray(r.body) ? r.body : r.body ? [r.body] : []);
  const commentOf = (r: AnnotationRecord) => { const b = bodies(r).find((x) => { const p = (x as { purpose?: string }).purpose; return p === undefined || p === "commenting"; }); return (b as { value?: string } | undefined)?.value ?? ""; };
  // tagsOf now routes to @render/core's canonical filter.ts (Standard 6). NOTE: core's tagsOf drops
  // empty/whitespace tag values; the prior local impl kept "" — empty tag chips no longer render.

  function applyForm(comment: string, tagsCsv: string) {
    if (!editing) return;
    const body: W3CBody[] = [{ type: "TextualBody", value: comment, purpose: "commenting" }];
    for (const t of tagsCsv.split(",").map((s) => s.trim()).filter(Boolean)) body.push({ type: "TextualBody", value: t, purpose: "tagging" });
    sess.session.editNote(editing as LogicalId, { body }); // reading carries forward; change it via setNoteReading
    bump();
  }
  // AV note time range (for the WADM form's conditional time fieldset). Null for image (xywh) notes.
  // selectorValue + the geo selector math (geoLabelOf / geoForTarget) live in geo-notes.ts now — pure
  // helpers taking `currentTileSource` explicitly (the DOMINO cut). App calls them with that descriptor.
  const timeOf = (r: AnnotationRecord) => parseTimeFragment(selectorValue(r));
  function applyTime(start: number, end: number) {
    if (!editing) return;
    sess.session.editNote(editing as LogicalId, { target: timeSel(canvasId, Math.max(0, start), Math.max(start, end)) });
    bump();
  }
  // mm:ss ⇄ seconds for the AV time fieldset moved into NoteEditor.svelte (the WADM form owns them now).

  // --- ⌘K intra-Library linking (CONTEXT §95): cite another note/exhibit into the Comment ---
  interface CmdEntry { id: string; kind: "note" | "exhibit"; exhibitSlug: string; exhibitTitle: string; label: string; ref: string; }
  let cmdkOpen = $state(false);
  let cmdkEntries = $state<CmdEntry[]>([]);
  let commentEl = $state<HTMLTextAreaElement | null>(null);
  // A link label sits inside `[...]`, so strip brackets/newlines and keep it short + scannable.
  const linkLabel = (s: string) => s.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 70) || "(untitled note)";

  // The catalog: EVERY exhibit's notes (latest non-deleted per logicalId) + each exhibit itself.
  // Built from loadAllLogs so the current exhibit's live/unsaved notes are citable too.
  async function buildCmdEntries(): Promise<CmdEntry[]> {
    const logsById = await loadAllLogs();
    const out: CmdEntry[] = [];
    for (const ex of lib.meta.exhibits) {
      out.push({ id: `ex:${ex.slug}`, kind: "exhibit", exhibitSlug: ex.slug, exhibitTitle: ex.title, label: linkLabel(ex.title), ref: encodeLinkRef({ exhibitSlug: ex.slug }) });
      const heads = new Map<string, AnnotationRecord>();
      for (const r of logsById[ex.id] ?? []) heads.set(r.logicalId, r); // append-only → last wins
      for (const r of heads.values()) {
        if (r.deleted) continue;
        out.push({ id: `n:${ex.slug}:${r.logicalId}`, kind: "note", exhibitSlug: ex.slug, exhibitTitle: ex.title, label: linkLabel(stripMarkdown(commentOf(r))), ref: encodeLinkRef({ exhibitSlug: ex.slug, noteLogicalId: r.logicalId }) });
      }
    }
    return out;
  }
  // The cite palette (⌘K) is FIELD-AGNOSTIC: a requester supplies an `insert` closure that splices the
  // chosen `[label](ref)` into ITS OWN text field — a note's Comment, or a Section's prose (the spine→note
  // bridge, ADR-0005). One palette, many targets. (This abstraction survives Wave 2 — the note Comment moves
  // into the marker popover, but its insert closure comes with it.)
  let pendingCiteInsert: ((md: string) => void) | null = null;
  async function requestCite(insert: (md: string) => void) {
    pendingCiteInsert = insert;
    cmdkEntries = await buildCmdEntries();
    cmdkOpen = true;
  }
  function insertCite(entry: CmdEntry) {
    pendingCiteInsert?.(`[${entry.label}](${entry.ref})`);
    pendingCiteInsert = null;
    cmdkOpen = false;
    // Confirm the outcome via the existing status idiom — the dogfood gap was "wasn't sure what the cite did".
    importNote = `Added a link to “${entry.label}”. Readers can click through to it in your published exhibit.`;
  }
  // The VISUAL companion to ⌘K (Archie-ea50): same `pendingCiteInsert` target, eyes-first surface. Tiles
  // are THIS exhibit's notes shown by their media (the resolvable + thumbnail-bearing set; cross-exhibit
  // citing stays on ⌘K's text path). Picking inserts the same `[label](ref)` — one insertion, two doors.
  let mediaPickerOpen = $state(false);
  let mediaPickerItems = $state<PickItem[]>([]);
  function requestVisualCite(insert: (md: string) => void) {
    pendingCiteInsert = insert;
    mediaPickerItems = allNotes
      .filter((r) => !r.deleted)
      .map((r) => {
        const objId = (srcOf(r.target) ?? "").split("/canvas/")[1] ?? "";
        const obj = OBJECTS.find((o) => o.id === objId);
        return { id: r.logicalId, label: linkLabel(stripMarkdown(commentOf(r))), thumb: obj ? thumbSrc(obj) : "", sub: obj?.label ?? "" };
      });
    mediaPickerOpen = true;
  }
  function pickVisualCite(it: PickItem) {
    const ref = encodeLinkRef({ exhibitSlug: currentSlug, noteLogicalId: it.id as LogicalId });
    pendingCiteInsert?.(`[${it.label}](${ref})`);
    pendingCiteInsert = null;
    mediaPickerOpen = false;
    importNote = `Added a link to “${it.label}”. Readers can click through to it in your published exhibit.`;
  }
  // The note-Comment cite target: splice at the cursor, persist via applyForm, restore focus past the link.
  async function citeIntoComment(md: string) {
    if (!sel) return;
    const full = commentEl?.value ?? commentOf(sel);
    const start = commentEl?.selectionStart ?? full.length;
    const end = commentEl?.selectionEnd ?? full.length;
    const next = full.slice(0, start) + md + full.slice(end);
    applyForm(next, tagsOf(sel).join(", "));
    await tick();
    const pos = start + md.length;
    commentEl?.focus();
    commentEl?.setSelectionRange(pos, pos);
  }
  let helpOpen = $state(false); // the `?` shortcuts cheat-sheet
  // Global + image-editor keyboard shortcuts (registry-driven; AV shortcuts live in AvEditor, palette in CmdK).
  function onGlobalKey(e: KeyboardEvent) {
    // ? toggles the cheat-sheet (not while typing); Esc closes it first.
    if (matches(e, "?") && !typingInField(e)) { e.preventDefault(); helpOpen = !helpOpen; return; }
    if (helpOpen && matches(e, "Esc")) { e.preventDefault(); helpOpen = false; return; }
    // ⌘K — cite into the note being edited (works inside the textarea too). With nothing selected, give a
    // hint instead of a silent no-op (shortcuts.ts advertises ⌘K; the dead-key was a dogfood gap).
    if (matches(e, "⌘K") && view === "editor") {
      e.preventDefault();
      if (sel) void requestCite(citeIntoComment);
      else importNote = "Open a note first — then ⌘K cites another note or exhibit into it.";
      return;
    }
    // Esc dismiss-ladder: palette (self-closes) → note popover → camera framing → overview → library.
    if (matches(e, "Esc")) {
      if (cmdkOpen || mediaPickerOpen) return; // those dialogs handle their own Esc
      if (creating) { e.preventDefault(); creating = null; return; } // disarm a new-note gesture first
      if (framingSectionId) { e.preventDefault(); cancelFraming(); return; }
      if (placingPendingId) { e.preventDefault(); cancelPlacing(); return; } // disarm a pending-note placement
      if (sel) { e.preventDefault(); selected = null; editing = null; return; }
      if (view === "editor" && hasOverview) { e.preventDefault(); void backToOverview(); return; }
      if (view === "overview") { e.preventDefault(); void backToLibrary(); return; }
      return;
    }
    // Image-canvas shortcuts — bare letters, so skip while typing / on AV / while framing.
    if (typingInField(e) || view !== "editor" || isAvCurrent || framingSectionId) return;
    if (matches(e, "⌫") && editing) { e.preventDefault(); onDelete(editing); }
    else if (matches(e, "[")) { e.preventDefault(); stepObject(-1); }
    else if (matches(e, "]")) { e.preventDefault(); stepObject(1); }
  }

  // Publish/Download project the WHOLE library — every exhibit (the published site IS the library:
  // collection.json + the Gallery list all exhibits). Each exhibit's notes live in its own log.
  function buildFullLibrary(opts: { includeTemplates?: boolean } = {}): Library {
    // Exclude bundled EXAMPLE exhibits by default (CONTEXT §"Local view loop": "avoid the template
    // ones, or opt-in") — a template is a Playground example, not the author's content. The mapping
    // itself is core's workingToLibrary (Q-3: one mapper with the Viewer's live source, no drift);
    // the Studio passes its LIVE template set — a reclaimed sunset slug can be RELEASED back to the
    // user (onMount reconcile), which seedVersion presence alone can't see.
    return workingToLibrary(lib.meta, {
      fallbackTitle: PROJECT_TITLE,
      ...(opts.includeTemplates !== undefined ? { includeTemplates: opts.includeTemplates } : {}),
      isTemplate: (ex: ExhibitMeta) => isTemplate(ex.slug),
    });
  }
  /** Spread the present `RightsFields` (credit/license) off a store meta — used at every level in
   *  buildFullLibrary so library/exhibit/object project their authored rights (rights grill Phase 2). */
  function rightsOf(m: RightsFields): RightsFields {
    return { ...(m.rights ? { rights: m.rights } : {}), ...(m.requiredStatement ? { requiredStatement: m.requiredStatement } : {}) };
  }
  // Load EVERY exhibit's annotation log for publish, keyed by exhibit id (publishLibrary's getLog):
  // the current exhibit uses the live session (freshest, incl. unsaved); others load from their dir.
  async function loadAllLogs(): Promise<Record<string, AnnotationLog>> {
    const map: Record<string, AnnotationLog> = {};
    for (const ex of lib.meta.exhibits) {
      if (ex.slug === currentSlug) { map[ex.id] = sess.session.entries; continue; }
      const dir = await openExhibitAnnotationsDir(ex.slug);
      map[ex.id] = dir ? (await AnnotationSession.load(dir, author)).entries : [];
    }
    return map;
  }

  // The ingest flows (DOMINO cut): object-add (file/URL/AV/map), folder/manifest exhibit-create,
  // CSV/WADM bulk-note import, and the destructive open-zip/open-folder replace. Every component-scope
  // dependency arrives through the explicit context — reactive reads are getters (live value at call
  // time), mutations are setters. Created BEFORE bnd (which consumes flows.replaceProjectFrom).
  const flows = createIngestFlows({
    baseUrl: BASE,
    lib,
    author: () => author,
    currentSlug: () => currentSlug,
    storeReady: () => sess.storeReady,
    objects: () => OBJECTS,
    currentObjectId: () => currentObjectId,
    currentReadings: () => currentReadings,
    session: () => sess.session,
    setAssetUrl: (id, url) => { assetUrls = { ...assetUrls, [id]: url }; },
    setCurrentObjectId: (id) => { currentObjectId = id; },
    setImportStatus: (s) => { importStatus = s; },
    setImportNote: (s) => { importNote = s; },
    addPendingNotes,
    setAddingObject: (v) => { addingObject = v; },
    clearAddForm: () => { addSource = ""; addLabel = ""; },
    setMapModalOpen: (v) => { mapModalOpen = v; },
    setCollabNote: (s) => { collabNote = s; },
    canvasIdOf,
    switchObject,
    toEditor: () => { view = "editor"; },
    newExhibit,
    openExhibit,
    bump,
    cancelPendingSave: () => sess.cancelPendingSave(),
    finishReplace: () => { currentSlug = lib.meta.exhibits[0]!.slug; view = "library"; pendingNotes = []; void savePendingNotes({}); }, // destructive replace wipes the old project's pending sidecar
    confirmReplace: (msg) => window.confirm(msg),
    alert: (msg) => window.alert(msg),
  });

  // The publish flows (worklist 0.3 cut 2): every Library→world path — the unified Publish menu's
  // two destinations (local folder / GitHub Pages), the zip download, the site projection + cache,
  // broken-links advisory, and the large-library size guards — lives in publish-flows.svelte.ts.
  // Deps are function declarations above (hoisted) or deferred reads of `bnd` (created below;
  // called only at action time, never during init).
  // Lazy publish flows (fflate + dompurify + GitHub publisher live behind this dynamic import). Created on
  // first publish / save-to-folder action, then cached — so none of that weight is in the startup bundle.
  let pub = $state<ReturnType<typeof import("./publish-flows.svelte.js").createPublishFlows> | null>(null);
  async function ensurePub() {
    if (pub) return pub;
    const { createPublishFlows } = await import("./publish-flows.svelte.js");
    const created = createPublishFlows({
      baseUrl: BASE,
      flushExhibit: () => save(),
      loadAllLogs,
      buildFullLibrary: () => buildFullLibrary(),
      exhibits: () => lib.meta.exhibits,
      canFolder: () => bnd.canFolder,
      currentZipName: () => (bnd.binding.kind === "file" && bnd.binding.name ? bnd.binding.name : zipNameFor(lib.meta.title || PROJECT_TITLE)),
    });
    pub = created;
    // Load the publish dialog UI now too (they render under {#if pub} once ready).
    void import("./PublishDialog.svelte").then((m) => { PublishDialogComp = m.default; });
    void import("./Publish.svelte").then((m) => { PublishComp = m.default; });
    return created;
  }
  // The binding store (worklist 0.3 cut 1): the three-configs state machine + its Save/Open/Close/
  // autosave flows live in binding-store.svelte.ts; its disk sinks lazy-load the publish flows on first use.
  const bnd = createBindingStore({
    flushExhibit: () => save(),
    writeToFolder: async (h) => (await ensurePub()).writeToFolder(h),
    downloadProjectZip: async () => (await ensurePub()).downloadProjectZip(),
    replaceProjectFrom: (loaded) => flows.replaceProjectFrom(loaded),
    zipName: () => zipNameFor(lib.meta.title || PROJECT_TITLE),
  });
  /** The capability-routed Open (folder on Chromium, else the zip file picker). */
  function openProject() { if (bnd.canFolder) void bnd.openProjectFolder(); else zipInputEl?.click(); }
  function onBindingKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void bnd.saveProject(); }
  }
</script>

<svelte:window onkeydown={(e) => { onGlobalKey(e); onBindingKey(e); }} />
<input bind:this={zipInputEl} type="file" accept=".zip,application/zip" style="display:none"
  onchange={(e) => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void openZipFile(f); el.value = ""; }} />

<div class="app">
{#if view === "library"}
  {#if collabNote}
    <!-- ⑧ collaboration summary (draft copy — human-gated): amber=transient, the playground
         banner's tone family at library scale. -->
    <div class="collab-note" role="status">
      <span class="cn-msg">{collabNote}</span>
      <button type="button" class="cn-x" onclick={() => (collabNote = null)} aria-label="Dismiss">✕</button>
    </div>
  {/if}
  <header>
    <span class="wordmark">Archie</span><span class="sub">Studio</span>
  </header>
  <LibraryHome
    exhibits={lib.meta.exhibits}
    onopen={openExhibit}
    oncreate={newExhibit}
    oncreatefromfolder={(files) => { newExhibitFromFolder(files).catch((e) => { console.error("Folder add failed", e); window.alert("Couldn't add that folder."); }); }}
    oncreatefrommanifest={(url) => { flows.newExhibitFromManifest(url).catch((e) => { console.error("IIIF add failed", e); window.alert("Couldn't load that IIIF link."); }); }}
    {isTemplate}
    binding={bnd.binding}
    bindingDirty={bnd.dirty}
    bindingBusy={bnd.busy}
    bindingError={bnd.error}
    recents={bnd.recents}
    onsave={() => void bnd.saveProject()}
    onopenproject={openProject}
    onopenrecent={(r) => void bnd.openRecent(r, openProject)}
    onforgetrecent={(r) => bnd.forgetRecent(r)}
    onclose={() => bnd.closeProject()}
    onrecover={() => { bnd.closeProject(); void bnd.saveProject(); }}
    ondismisserror={() => bnd.dismissError()}
    rights={{ ...(lib.meta.rights ? { rights: lib.meta.rights } : {}), ...(lib.meta.requiredStatement ? { requiredStatement: lib.meta.requiredStatement } : {}) }}
    onrights={setLibraryRights}
    libTitle={lib.meta.title}
    librarySummary={lib.meta.summary}
    ontitle={setLibraryTitle}
    onsummary={setLibrarySummary}
    onpatchexhibit={patchExhibitMeta}
    onremoveexhibit={(slug) => void removeExhibitById(slug)}
  />
{:else if view === "overview"}
  <div class="overview-stage">
    <ExhibitOverview
      title={currentExhibit.title}
      layout={currentLayout}
      objects={OBJECTS}
      {noteCountOf}
      thumbFor={(o) => (o.mediaType && o.mediaType !== "image") ? "" : thumbSrc(o)}
      sections={currentExhibit.sections ?? []}
      onopenobject={openObject}
      oneditobject={(objId) => (editingObjectId = objId)}
      onaddobject={() => { editingObjectId = null; view = "editor"; addingObject = true; }}
      onback={backToLibrary}
      onreorder={reorderObjects}
      onstartnarrative={() => openObject(OBJECTS[0]?.id ?? currentObjectId)}
      rights={{ ...(currentExhibit.rights ? { rights: currentExhibit.rights } : {}), ...(currentExhibit.requiredStatement ? { requiredStatement: currentExhibit.requiredStatement } : {}) }}
      onrights={setExhibitRights}
      summary={currentExhibit.summary}
      ontitle={setExhibitTitle}
      onsummary={setExhibitSummary}
      onremove={removeCurrentExhibit}
    />
    <!-- Object pencil-CRUD drawer (Archie-79be): edit ANY plate's details (title/description/rights) +
         remove, without descending into the object. App-owned because it holds the full ObjectMeta + the
         object mutation wrappers; the overview only signals which object via oneditobject. -->
    <PropsDrawer open={!!editingObject} title="Media details" onclose={() => (editingObjectId = null)}>
      {#if editingObject}
        <DetailsEditor
          title={editingObject.label}
          summary={editingObject.summary ?? ""}
          rights={{ ...(editingObject.rights ? { rights: editingObject.rights } : {}), ...(editingObject.requiredStatement ? { requiredStatement: editingObject.requiredStatement } : {}) }}
          scope="object"
          ontitle={(v) => renameObject(editingObject!.id, v)}
          onsummary={(v) => patchObjectMeta(editingObject!.id, { summary: v })}
          onrights={(next) => patchObjectMeta(editingObject!.id, { rights: next.rights, requiredStatement: next.requiredStatement })}
          onremove={() => { const id = editingObject!.id; editingObjectId = null; void removeObjectById(id); }}
        />
      {/if}
    </PropsDrawer>
  </div>
{:else}
  <header>
    <button class="exhibit-back" onclick={hasOverview ? backToOverview : backToLibrary}>← {hasOverview ? "Overview" : "Exhibits"}</button>
    <!-- Breadcrumb: Exhibit › Object — surfaces the two scales (the spine lives at the exhibit level, notes
         at the object level; the crumb names where you are). -->
    <h1 class="wordmark">{currentExhibit.title}</h1>{#if current}<span class="crumb">› {current.label}</span>{/if}<span class="sub">Studio</span>
    <span class="spacer"></span>
    <!-- ADR-0011: no persistent tool palette. Selection is ambient; drawing arms only from a CREATE act
         ("New note" in the notes pane, or narrative camera framing). -->
    <!-- The reading dropdown is RETIRED (archie-ux Q-2, grill Q3): the RAIL on the canvas is the
         one home for visibility + the pen; "Manage readings…" on the rail opens the modal. -->
    <!-- The layout-picker trigger is RETIRED (ADR-0016): the reading mode is an EMERGENT property of
         content (sections → narrative, >1 object → grid, else single), no longer an author choice. -->
    {#if sess.storeReady}
      <span class="savestate" class:dirty={sess.dirty} class:error={saveStatus.health === "error"} title={saveStatus.error ?? undefined}>
        {saveStatus.health === "error" ? "⚠ Save failed" : sess.dirty ? "● Unsaved" : "Saved"}</span>
      <button onclick={() => void save()} disabled={!sess.dirty}>Save</button>
    {/if}
    <button class="publish-signal" onclick={() => void ensurePub().then((p) => p.openDialog())}>Publish & share…</button>
    <button class="help-btn" onclick={() => (helpOpen = true)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts (press ?)">?</button>
  </header>

  <ReadingsModal open={readingsOpen} readings={currentReadings} palette={READING_PALETTE} onchange={setReadings} onadd={(id) => rdg.setActive(id)} onclose={() => (readingsOpen = false)} />

  {#if isTemplate(currentSlug)}
    <!-- Per-exhibit playground banner (§115): an EXAMPLE is a template — exploring it is honest play,
         stated plainly, with the keep-path right here. Amber = transient/attention (not green=action,
         not vermillion=error). A user's own exhibit shows no banner (it's saved). -->
    <div class="playground-banner" role="status">
      <span class="pg-tag">Example</span>
      <span class="pg-msg">This is a template — your changes here aren't saved. Keep a copy to make it your own.</span>
      <button class="pg-keep" onclick={() => void keepCopy()} disabled={keeping}>{keeping ? "Keeping…" : "Keep a copy"}</button>
    </div>
  {/if}

  <!-- Object rail — the exhibit's objects on the light table; pick which one to annotate. -->
  <nav class="objects" aria-label="Exhibit objects">
    {#if OBJECTS.length === 0}
      <span class="no-objects">No media yet — add one below to start adding notes.</span>
    {/if}
    {#each OBJECTS as o (o.id)}
      <button class="obj" class:on={o.id === currentObjectId} onclick={() => switchObject(o.id)} title={o.label}>
        <span class="obj-thumb" style={`background-image:url(${thumbSrc(o)})`}></span>
        <span class="obj-meta">
          <span class="obj-label">{o.label}</span>
          <span class="obj-count">{noteCountOf(o.id)} notes</span>
        </span>
      </button>
    {/each}
    {#if addingObject}
      <form class="add-obj" aria-label={`Add media to ${currentExhibit?.title ?? "this exhibit"}`} onsubmit={(e) => { e.preventDefault(); void flows.addObject(addSource, addLabel); }}>
        <span class="add-obj-head">Add media to “{currentExhibit?.title ?? "this exhibit"}”</span>
        <label class="file-btn">Choose file…<input type="file" accept="image/*,audio/*,video/*" multiple onchange={(e) => { const el = e.currentTarget as HTMLInputElement; void flows.addFiles(el.files).then(() => (el.value = "")); }} /></label>
        <span class="or">or</span>
        <input bind:value={addSource} placeholder="Link to an image, audio, or video" aria-label="Object source URL" title="A link points to the media where it lives, so your library stays small." />
        <input class="lbl" bind:value={addLabel} placeholder="Label" aria-label="Object label" />
        <button type="submit" disabled={addSource.trim() === ""}>Add</button>
        <button type="button" class="cancel" onclick={() => { addingObject = false; addSource = ""; addLabel = ""; }}>✕</button>
        <span class="add-obj-hint">Files live in this browser. Use <strong>Publish</strong> to save them as a shareable file.</span>
      </form>
    {:else}
      <button class="add-obj-toggle" onclick={() => (addingObject = true)}>+ Media</button>
      <button class="add-obj-toggle" onclick={() => { mapModalOpen = true; void import("./AddMapModal.svelte").then((m) => (AddMapModalComp = m.default)); }} title="Add a map (geo-annotation)">+ Map</button>
    {/if}
    {#if mapModalOpen && AddMapModalComp}{@const AddMap = AddMapModalComp}<AddMap onadd={(m) => { void flows.addMapObject(m); }} onclose={() => (mapModalOpen = false)} />{/if}
    {#if importStatus}
      <span class="import-status" role="status" aria-live="polite">
        <span class="import-spinner" aria-hidden="true"></span>
        Adding “{importStatus.name}”…{#if importStatus.total > 1} ({importStatus.index} of {importStatus.total}){/if}
      </span>
    {/if}
    {#if importNote}
      <span class="import-note" role="status" aria-live="polite">{importNote}<button type="button" class="import-note-x" onclick={() => (importNote = "")} aria-label="Dismiss">✕</button></span>
    {/if}
  </nav>

  {#if framingSectionId}
    <!-- Loud cue that the canvas is in camera-framing mode, not note-drawing — with the way out. -->
    <div class="framing-banner" role="status">
      <span class="fb-tag">Setting the view</span>
      <span class="fb-msg">{isAvCurrent ? "Mark a moment on the recording to set where this section opens — the view, not a note." : "Draw a box to set what this section shows — the view, not a note."}</span>
      <button class="fb-cancel" onclick={cancelFraming}>Cancel <kbd>Esc</kbd></button>
    </div>
  {:else if creating}
    <!-- Worklist 1.2 (visible drawing mode): once armed, drag means DRAW where a second ago it meant
         pan — the state must live somewhere besides the cursor. Same banner idiom as framing. -->
    <div class="framing-banner" role="status">
      <span class="fb-tag">Drawing a region</span>
      <span class="fb-msg">Draw the {creating === "rectangle" ? "box" : "outline"} on the {isMapCurrent ? "map" : "image"} — it becomes your note’s place{isMapCurrent ? ", anchored to its longitude/latitude" : ""}. Drag pans again once you’ve drawn.</span>
      <span class="fb-into" title="This note files into the active reading (the pen in the readings panel).">Filing into <span class="fb-rd" style={`border-color:${activeReadingColour}`}>{activeReadingLabel}</span></span>
      <button class="fb-cancel" onclick={() => (creating = null)}>Cancel <kbd>Esc</kbd></button>
    </div>
  {/if}

  <!-- The WADM edit form (ADR-0006) is the NoteEditor component now (the DOMINO cut). It renders as a
       marker-anchored POPOVER over the canvas (below, in <main>), keyed to the selected record `sel`. -->

  <div class="body">
    <!-- ONE WADM form definition (ADR-0006), rendered into EITHER the floating marker popover OR the
         docked inspector below — never forked. Declared at .body scope so both sites can {@render} it. -->
    {#snippet noteForm()}
      <NoteEditor sel={sel!} editing={editing!} {currentReadings} bind:commentEl
        {commentOf} {tagsOf} {timeOf}
        {applyForm} {applyTime} {setNoteReading} {setNoteEmphasis} {requestCite} {requestVisualCite} {citeIntoComment} {closeNote} {onDelete} />
    {/snippet}
    <aside class:collapsed={asideCollapsed} style:--studio-aside-w={asideWidth != null ? `${asideWidth}px` : null}>
      <!-- The narrative spine is ALWAYS mounted (ADR-0016): a narrative exists iff sections.length>0, and
           authoring it is no longer gated by a picked layout — adding the first section IS the act that turns
           this exhibit into a narrative (the published reading mode emerges from the content). Exhibit scope
           on top (persists across rail switches), object scope below (swaps). -->
      {#if firstAddCueSlug === currentSlug}
        <!-- KEYSTONE matched-pair cue, FIRST-ADD (0→1): the one-time, non-blocking, dismissible note that
             adding beat #1 changed the exhibit's published front door. Sits directly above the spine card so
             it reads as "about this thing you just did." Dismisses on "Got it" and never re-shows for this
             exhibit (the localStorage flag set at fire-time). -->
        <div class="narrative-cue" role="status">
          <p class="nc-msg">This exhibit now opens with your narrative. Visitors see your sections first; the media grid becomes a list they can still reach. <span class="nc-aside">(Remove every section to go back to a plain grid.)</span></p>
          <div class="nc-actions">
            <!-- No in-Studio narrative preview surface exists yet (Publish writes the whole site to the
                 Viewer's folder — not a lightweight in-place preview). Per the build rule, this is a marked
                 TODO, NOT a fabricated preview. [SNAG] Owed: an in-Studio "preview how it opens" reader. -->
            <button type="button" class="nc-preview" disabled title="Coming soon — preview the visitor's reading view from the Studio">Preview how it opens</button>
            <button type="button" class="nc-dismiss" onclick={dismissFirstAddCue} aria-label="Dismiss">Got it</button>
          </div>
        </div>
      {/if}
      {#if pendingClear?.slug === currentSlug}
        <!-- KEYSTONE matched-pair cue, LAST-REMOVE (last→0): removing the final section reverts the front
             door, so confirm first (the only section delete that confirms; non-last deletes are silent).
             Transient — NOT persisted; it must fire every time the narrative is genuinely cleared. -->
        <div class="narrative-cue confirm" role="alert" aria-label="Remove the last section">
          <p class="nc-msg">Remove the last section? Your exhibit will open with the media grid instead.</p>
          <div class="nc-actions">
            <button type="button" class="nc-keep" onclick={cancelClear}>Keep it</button>
            <button type="button" class="nc-remove" onclick={confirmClear}>Remove</button>
          </div>
        </div>
      {/if}
      <!-- ── PANEL 1 · NARRATIVE (exhibit-wide) — the spine spans EVERY item in this exhibit and persists as you
           switch objects on the rail. EXCLUSIVE accordion with Notes below (togglePanel): opening one collapses
           the other, so the two scopes never fight for height. The header carries scope + count when collapsed. -->
      <section class="panel" class:open={openPanel === "narrative"}>
        <button type="button" class="panel-head" aria-expanded={openPanel === "narrative"} aria-controls={openPanel === "narrative" ? "panel-body-narrative" : undefined} onclick={() => togglePanel("narrative")}>
          <span class="ph-caret" aria-hidden="true">{openPanel === "narrative" ? "▾" : "▸"}</span>
          <span class="ph-title">Narrative</span>
          <span class="ph-scope">{OBJECTS.length > 0 ? "Spans every item" : "Exhibit-wide"}</span>
          {#if openPanel !== "narrative" && narrativeSectionCount > 0}
            <!-- Collapsed with hidden content → the count shows as a pill (you can see N sections are under it). -->
            <span class="count-pill" aria-label={`${narrativeSectionCount} ${narrativeSectionCount === 1 ? "section" : "sections"}`}>{narrativeSectionCount}</span>
          {:else}
            <span class="ph-count">{narrativeSectionCount > 0 ? `${narrativeSectionCount} ${narrativeSectionCount === 1 ? "section" : "sections"}` : "Not started"}</span>
          {/if}
        </button>
        <!-- Creation lives OUTSIDE the collapsing body (always reachable, even when the spine is collapsed):
             add a section, or seed one from an existing note. App owns the add — the spine is display-only. -->
        <div class="panel-create">
          <button type="button" class="create-add" onclick={addSection} disabled={OBJECTS.length === 0} title="Add a new section to this exhibit's narrative">＋ Add a section</button>
          {#if narrativeNotes.length > 0}
            <select class="from-note" aria-label="Add a section from an existing note"
              onchange={(e) => { const el = e.currentTarget as HTMLSelectElement; const n = narrativeNotes.find((x) => x.id === el.value); if (n) addSectionFromNote(n); el.selectedIndex = 0; }}>
              <option value="">＋ from a note…</option>
              {#each narrativeNotes as n (n.id)}<option value={n.id}>{n.lead.slice(0, 40)}</option>{/each}
            </select>
          {/if}
        </div>
        {#if openPanel === "narrative"}
          <div class="panel-body" id="panel-body-narrative">
            {#if NarrativeEditorComp}
              {@const NE = NarrativeEditorComp}
              <NE
                sections={currentExhibit?.sections ?? []}
                objects={OBJECTS}
                {currentObjectId}
                activeSectionId={focusSectionId}
                framingId={framingSectionId}
                cleared={clearedSlug === currentSlug}
                onchange={setSections}
                onframe={startFraming}
                oncancelframe={cancelFraming}
                onnavigate={navigateToSection}
                onrequestcite={requestCite}
              />
            {/if}
          </div>
        {/if}
      </section>

      <!-- ── PANEL 2 · NOTES (this item) — notes are OBJECT-LOCAL: they belong to the one media item you're viewing
           and SWAP as you switch objects (unlike the exhibit-wide spine above). Two groups inside: "Add a note"
           (the creation tools) and "On this item" (the notes already present). -->
      <section class="panel" class:open={openPanel === "notes"}>
        <button type="button" class="panel-head" aria-expanded={openPanel === "notes"} aria-controls={openPanel === "notes" ? "panel-body-notes" : undefined} onclick={() => togglePanel("notes")}>
          <span class="ph-caret" aria-hidden="true">{openPanel === "notes" ? "▾" : "▸"}</span>
          <span class="ph-title">Notes</span>
          <span class="ph-scope">This item only{current ? ` · ${current.label}` : ""}</span>
          {#if openPanel !== "notes" && notes.length > 0}
            <!-- Collapsed with hidden content → the count shows as a pill (you can see N notes are under it). -->
            <span class="count-pill" aria-label={`${notes.length} ${notes.length === 1 ? "note" : "notes"}`}>{notes.length}</span>
          {:else}
            <span class="ph-count">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
          {/if}
        </button>
        <!-- Creation OUTSIDE the collapsing body (always reachable): the note-drawing tools + bulk import. The
             panel body below holds only what's already on this item — the present-notes list. -->
        <div class="panel-create notes-create">
          {#if current && !isAvCurrent}
            <!-- ADR-0011: drawing is armed only by creating a note. Choose a shape, draw the region on the
                 image, and the note is created at that locus — the canvas then returns to ambient selection. -->
            {#if creating}
              <div class="new-note armed" role="status">
                <span class="nn-msg">Draw the {creating === "rectangle" ? "box" : "outline"} on the {isMapCurrent ? "map" : "image"}</span>
                <span class="nn-into" title="New notes file into the active reading — the ✎ pen below sets which.">→ <span class="nn-rd" style={`border-color:${activeReadingColour}`}>{activeReadingLabel}</span></span>
                <button type="button" class="nn-cancel" onclick={() => (creating = null)}>Cancel <kbd>Esc</kbd></button>
              </div>
            {:else}
              <div class="new-note">
                <span class="nn-lead">New note</span>
                <!-- Geo-annotations reuse Box/Outline on a Map (no pin tool — 2026-06-18 grilling Q4); geo-truth is captured on draw. -->
                <button type="button" onclick={() => (creating = "rectangle")} title={isMapCurrent ? "Draw a rectangular region on the map" : "Draw a rectangular region"}>▭ Box</button>
                <button type="button" onclick={() => (creating = "polygon")} title={isMapCurrent ? "Trace an irregular region on the map" : "Trace an irregular outline"}>⬠ Outline</button>
              </div>
            {/if}
          {/if}
          {#if current && !isAvCurrent}
            <!-- Bulk on-ramp for spreadsheet-first authors (⑥): regions are xywh, so image objects only. -->
            <button type="button" class="csv-import" onclick={() => csvEl?.click()} title="Import notes from a CSV. Columns: object, comment — x, y, w, h, tags, reading all optional, header row first. Rows with no x,y,w,h arrive as “needs placement”: draw each box with Set area. Use a media item’s label in the object column, or leave it blank for the current one.">… or add notes from a CSV</button>
            <input bind:this={csvEl} type="file" accept=".csv,text/csv" style="display:none" aria-label="Add notes from a CSV file"
              onchange={(e) => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void flows.importNotesCsv(f).then(() => openPanelTo("notes")).catch((err) => { console.error("CSV add failed", err); window.alert("Couldn't add those notes."); }); el.value = ""; }} />
            <button type="button" class="csv-import" onclick={downloadCsvTemplate} title="Download a starter CSV pre-filled with this exhibit's items. Fill in the blanks in Excel or Sheets, then add it back — rows without x,y,w,h become “needs placement”.">… or download a starter CSV to fill in</button>
          {/if}
          <!-- WADM on-ramp (⑦): annotations exported by Archie, Recogito, or any W3C producer. -->
          <button type="button" class="csv-import" onclick={() => wadmEl?.click()} title="Import notes from Archie or another annotation tool.">… or add notes from a file</button>
          <input bind:this={wadmEl} type="file" accept=".json,application/json,application/ld+json" style="display:none" aria-label="Add notes from a file"
            onchange={(e) => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void flows.importNotesWadm(f).then(() => openPanelTo("notes")).catch((err) => { console.error("Notes add failed", err); window.alert("Couldn't add those notes."); }); el.value = ""; }} />
          <p class="hint">{isAvCurrent ? "Play the recording · “Mark start” then “Add note” pins a note to that moment · click any note to jump back and edit." : "Pick a shape · draw the region · click a marker to edit — the editor stays pinned as you pan and zoom."}</p>
        </div>
        {#if openPanel === "notes"}
          <div class="panel-body notes-body" id="panel-body-notes">
            {#if current}
              <!-- editable object label (authored structure; persists). Enter or blur commits. -->
              <input
                class="object-title"
                value={current.label}
                onchange={(e) => renameObject(currentObjectId, (e.currentTarget as HTMLInputElement).value)}
                onkeydown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                aria-label="Object label"
              />
            {/if}
            <!-- What's already on this item — the present-notes list (empty-state when none or all hidden). -->
            {#if notes.length === 0}
              <p class="empty">{isAvCurrent ? "No notes on this recording yet. Mark a moment, then add a note to pin it." : objNotes.length > 0 ? "This media item has notes, but they’re hidden. Turn on a reading to show them." : "No notes on this media item yet. Pick Box or Outline above, then draw the region."}</p>
            {/if}
            <ul>
              {#each notes as r (r.rev)}
                <!-- Hovering a note solos its MARK on the canvas (the rail's hover affordance, per-note). -->
                <li class:sel={editing === r.logicalId} onmouseenter={() => (hoverNote = r.logicalId)} onmouseleave={() => (hoverNote = null)}>
                  <button onclick={() => (selected = r.logicalId)}>
                    <div class="comment">{stripMarkdown(commentOf(r)) || "(untitled)"}</div>
                    <div class="meta">
                      {#if isMapCurrent}{@const g = geoLabelOf(r, currentTileSource)}{#if g}<span class="geo" title="Longitude and latitude — the centre of this region on the map.">📍 {g}</span>{/if}{/if}
                      {#each tagsOf(r) as t}<span class="tag">#{t}</span>{/each}
                      <!-- border carries the reading colour; text stays ink so ANY user colour passes AA on paper (viewer Reader's border-only pattern) -->
                      {#if r.reading}{@const rd = currentReadings.find((x) => x.id === r.reading)}<span class="layer" style={rd?.colour ? `border-color:${rd.colour}` : ""}>{rd?.name ?? r.reading}</span>{:else if currentReadings.length > 0}<span class="layer" style={`border-color:${BASE_MARKER}`}>General notes</span>{/if}
                    </div>
                  </button>
                </li>
              {/each}
            </ul>

            <!-- All notes (image / audio / video) edit in the marker popover anchored to their locus (in <main>);
                 the sidebar is creation + the present-notes list — no inline form (ADR-0006). -->

          </div>
        {/if}
      </section>

      <!-- ── PANEL 3 · TO PLACE (exhibit-wide worklist) — notes imported WITHOUT a region (CSV sub-cycle B,
           Archie-79c0). NOT a creation tool: a worklist you READ, then place each on the image. Its own panel
           (was wrongly nested in the Notes create tools). Only present when there's something to place. -->
      {#if pendingNotes.length > 0}
        <section class="panel" class:open={openPanel === "place"}>
          <button type="button" class="panel-head" aria-expanded={openPanel === "place"} aria-controls={openPanel === "place" ? "panel-body-place" : undefined} onclick={() => togglePanel("place")}>
            <span class="ph-caret" aria-hidden="true">{openPanel === "place" ? "▾" : "▸"}</span>
            <span class="ph-title">To place</span>
            <span class="ph-scope">imported notes, no spot yet</span>
            <span class="count-pill" aria-label={`${pendingNotes.length} to place`}>{pendingNotes.length}</span>
          </button>
          {#if openPanel === "place"}
            <div class="panel-body place-body" id="panel-body-place">
              <p class="hint">Read a note, then “Place on image” and draw its box on the picture — that turns it into a real note there. The card stays lit while you draw, so you can keep reading it.</p>
              <ul class="np-list">
                {#each pendingNotes as p (p.id)}
                  <li class="np-row" class:placing={p.id === placingPendingId}>
                    <p class="np-cmt">“{p.comment}”</p>
                    <div class="np-meta">
                      <span class="np-obj">on {objectLabelOf(p.objectId)}</span>
                      {#if p.tags.length}<span class="np-tags">{p.tags.map((t) => "#" + t).join(" ")}</span>{/if}
                    </div>
                    <div class="np-actions">
                      {#if p.id === placingPendingId}
                        <span class="np-drawing">Drawing… pick a spot on the {isMapCurrent ? "map" : "image"}</span>
                        <button type="button" class="np-del" onclick={cancelPlacing}>Cancel</button>
                      {:else}
                        <button type="button" class="np-set" onclick={() => startPlacing(p.id)} title="Go to {objectLabelOf(p.objectId)} and draw this note’s box on the image">Place on image</button>
                        <button type="button" class="np-del" onclick={() => removePending(p.id)} title="Remove this imported note">Remove</button>
                      {/if}
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </section>
      {/if}

      <!-- ── PANEL 4 · DETAIL (this item) — the object's description + credit/licence (rights grill Q6). Promoted
           from an inline disclosure at the foot of the Notes list to its own panel, so metadata isn't buried. -->
      {#if current}
        <section class="panel" class:open={openPanel === "info"}>
          <button type="button" class="panel-head" aria-expanded={openPanel === "info"} aria-controls={openPanel === "info" ? "panel-body-info" : undefined} onclick={() => togglePanel("info")}>
            <span class="ph-caret" aria-hidden="true">{openPanel === "info" ? "▾" : "▸"}</span>
            <span class="ph-title">Detail</span>
            <span class="ph-scope">This item only{current ? ` · ${current.label}` : ""}</span>
            {#if current.summary || current.rights || current.requiredStatement}<span class="count-pill" title="Description or credit set for this item" aria-label="Details set">●</span>{/if}
          </button>
          {#if openPanel === "info"}
            <div class="panel-body info-body" id="panel-body-info">
              <DetailsEditor
                showTitle={false}
                summary={current.summary ?? ""}
                rights={{ ...(current.rights ? { rights: current.rights } : {}), ...(current.requiredStatement ? { requiredStatement: current.requiredStatement } : {}) }}
                scope="object"
                onsummary={setObjectSummary}
                onrights={setObjectRights}
                onremove={removeCurrentObject}
              />
            </div>
          {/if}
        </section>
      {/if}
    </aside>
    <ResizeDivider side="left" label="notes" min={260} max={760} bind:width={asideWidth} bind:collapsed={asideCollapsed} oncommit={persistAside} />
    <main
      bind:this={mainEl}
      class:drawing={drawArmed}
      class:drag-over={dragOver}
      ondrop={onDrop}
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={(e) => { if (e.target === e.currentTarget) dragOver = false; }}
    >
      <!-- {#key} forces a fresh mount when the object changes: Canvas reads `source` only in
           onMount (no source $effect), so switching objects must remount to load the new image.
           Gated on assetsReady so an OPFS-backed source is resolved before mount. -->
      {#if current && isAvCurrent}
        <!-- AV object → temporal editor (remount on object switch so the media element reloads). -->
        {#key canvasId}
          {#if AvEditorComp}
            {@const Av = AvEditorComp}
            <Av source={currentSource} label={current.label} mediaType={current.mediaType} {annotations} bind:selected oncreate={onCreateTime} onimport={onImportTranscript}
              onmarkerrect={(r) => { notePos = r ? { left: r.right + 14, top: r.top } : null; }} />
          {:else}
            <div class="no-canvas">Loading…</div>
          {/if}
        {/key}
      {:else if current && assetsReady}
        {#key canvasId}
          {#if CanvasComp}
            <CanvasComp source={currentSource} tileSource={currentTileSource} {canvasId} {annotations} focus={canvasFocus} tool={drawShape} drawing={drawArmed} styleOf={styleOfLive} locator bind:selected oncreate={onCreate} onupdate={onUpdate} ondelete={onDelete}
              onmarkerrect={(r) => { notePos = r ? { left: r.right + 14, top: r.top } : null; }} />
          {:else}
            <div class="no-canvas">Loading…</div>
          {/if}
        {/key}
        {#if isMapCurrent && currentTileSource?.attribution}
          <!-- Basemap attribution (REQUIRED by the tile provider's terms — DESIGN.md D6). -->
          <div class="map-attribution">{currentTileSource.attribution}</div>
        {/if}
      {:else if current}
        <div class="no-canvas">Loading…</div>
      {:else}
        <div class="no-canvas">Add media — drop an image here, or use “+ Media” above.</div>
      {/if}

      {#if sel && !drawArmed && !notePinned}
        <!-- The WADM form anchored to the selected marker (ADR-0006): an image's canvas marker OR an audio
             cue's waveform region (both stream their screen-rect via onmarkerrect → notePos). Offset off the
             marker, follows the surface, draggable by the grip; stopPropagation so dragging never pans OSD.
             HIDDEN in draw mode — a position:fixed popover would otherwise intercept the canvas pointer events
             that Annotorious needs to draw a new shape (it reappears on the new note once mode → select).
             The ⤢ pin lifts the SAME form into the docked inspector (below) for roomier editing. -->
        <div class="note-popover" role="group" aria-label="Note editor" style={`left:${notePopoverPos.left}px; top:${notePopoverPos.top}px`} onpointerdown={(e) => e.stopPropagation()}>
          <div class="np-head">
            <button type="button" class="np-grip" onpointerdown={noteDragDown} onpointermove={noteDragMove} onpointerup={noteDragUp} onpointercancel={noteDragUp} title="Drag to move" aria-label="Move the note editor">⠿</button>
            <button type="button" class="np-pin" onclick={() => { notePinned = true; persistPinned(); }} title="Pin to a side panel" aria-label="Pin the note editor to a side panel">⤢</button>
          </div>
          {@render noteForm()}
        </div>
      {/if}

      <!-- The readings RAIL (P-2 / archie-ux Q-2) — the permanent home: visibility set + the pen,
           counts for THIS object, solo-on-hover, and the one "manage…" entry to the modal. -->
      {#if current}
        <ReadingsRail readings={currentReadings} {rdg}
          countOf={(id) => objNotes.filter((r) => r.reading === id).length}
          baseCount={objNotes.filter((r) => !r.reading).length}
          onsolo={(k) => (soloReading = k)}
          onmanage={() => (readingsOpen = true)} />
      {/if}
    </main>
    {#if sel && !drawArmed && notePinned}
      <!-- Pinned inspector (ADR-0006 sanctioned fallback): the SAME WADM form, docked full-height on the
           right (opposite the notes aside), detached from the marker. ⤡ unpins back to the float. -->
      <aside class="note-inspector" aria-label="Note editor">
        <header class="ni-head">
          <span class="ni-title">Editing note</span>
          <button type="button" class="ni-unpin" onclick={() => { notePinned = false; persistPinned(); }} title="Unpin — float at the marker" aria-label="Unpin the note editor">⤡ Unpin</button>
        </header>
        {@render noteForm()}
      </aside>
    {/if}
  </div>

  {#if pub && PublishDialogComp && PublishComp}
    {@const p = pub}
    {@const PD = PublishDialogComp}
    {@const Pub = PublishComp}
    <PD
      open={p.dialogOpen}
      canFolder={bnd.canFolder}
      onclose={() => p.closeDialog()}
      onfolder={p.localPublishFolder}
      onzip={p.localPublishZip}
      ongithub={() => { p.closeDialog(); void p.openPublish(); }}
      ondownload={p.download}
    />
    <Pub open={p.publishOpen} onclose={() => p.closePublish()} onpublish={p.publish} brokenLinks={p.brokenLinks} />
  {/if}
  {#if cmdkOpen && CmdKComp}{@const CK = CmdKComp}<CK open={cmdkOpen} entries={cmdkEntries} onpick={insertCite} onclose={() => (cmdkOpen = false)} />{/if}
  {#if mediaPickerOpen && MediaPickerComp}{@const MP = MediaPickerComp}<MP open={mediaPickerOpen} title="Cite a note by its image" items={mediaPickerItems} onpick={pickVisualCite} onclose={() => (mediaPickerOpen = false)} />{/if}
{/if}
<!-- GLOBAL: the ? shortcuts cheat-sheet (generated from the registry) — reachable from any view. -->
<ShortcutsHelp open={helpOpen} onclose={() => (helpOpen = false)} />
</div>

<style>
  /* Soft Static: the header + canvas float on the warm gradient ground; the notes sidebar is a
     warm-paper notebook; signal-orange is rationed to the one publish action. */
  .app { display: flex; flex-direction: column; height: 100vh; background: var(--surface-canvas); }

  /* Header — a soft warm-paper band, separated by tone + a whisper-soft border (no hard frame) */
  header {
    display: flex; align-items: baseline; gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    background: var(--surface-canvas-raised);
    border-bottom: 1px solid var(--border-canvas);
  }
  /* Wordmark / title → Fraunces, low weight, sentence case (no uppercase, no text-shadow) */
  .wordmark { font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; color: var(--ink-canvas-primary); letter-spacing: 0; margin: 0; }
  h1.wordmark { font-weight: 300; color: var(--ink-canvas-primary); text-shadow: var(--shadow-text-haze); }
  .sub { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .spacer { flex: 1; }
  /* Vertically centres the full-width ~80vh overview band (breathing room above/below; no frame). */
  .overview-stage { min-height: 100vh; display: flex; align-items: center; background: var(--surface-canvas); }
  .exhibit-back { background: none; border: none; cursor: pointer; padding: var(--space-2) var(--space-2) var(--space-2) 0; /* 24px+ hit box (Fitts) */ font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-canvas-secondary); align-self: center; transition: color 160ms ease; }
  .exhibit-back:hover { color: var(--accent-2); }
  .no-objects { font-family: var(--font-ui); font-size: 0.78rem; color: var(--ink-canvas-secondary); align-self: center; }
  .no-canvas { display: flex; align-items: center; justify-content: center; height: 100%; padding: var(--space-8); text-align: center; font-family: var(--font-body); font-size: 1.125rem; line-height: 1.6; color: var(--ink-canvas-secondary); }
  /* Header buttons → quiet .soft-btn idiom (warm paper, soft border, ink text). The ONE signal
     (publish) is promoted separately below — every other header action stays quiet. */
  header > button {
    font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.06em;
    padding: var(--space-1) var(--space-3);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); cursor: pointer;
    transition: color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }
  header > button:hover { color: var(--ink-canvas-primary); background: var(--surface-canvas-overlay); box-shadow: var(--shadow-lift-low); }
  header > button:disabled { color: var(--ink-canvas-muted); border-color: var(--border-canvas); background: var(--surface-canvas-raised); box-shadow: none; cursor: default; }
  /* The ONE rationed signal on the editor surface: Publish & Share. */
  header > button.publish-signal { background: var(--accent); color: var(--ink-on-accent); border: none; box-shadow: var(--shadow-signal-glow); }
  header > button.publish-signal:hover { background: var(--accent-hover); color: var(--ink-on-accent); box-shadow: var(--shadow-signal-glow); }
  .savestate { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .savestate.dirty { color: var(--accent-2); }
  .savestate.error { color: var(--semantic-error); }
  /* (.swatch / .you rules removed — that UI moved into ReadingsModal/IdentityPrompt; the rules were dead.) */
  /* The ? shortcuts button — a round, quiet affordance for the cheat-sheet. */
  header > button.help-btn { border-radius: 50%; min-width: 1.9rem; padding: var(--space-1) 0; text-align: center; font-weight: 400; }

  /* Playground banner — honest ephemerality (§115). Warm clay-tinted card; the keep action stays a
     quiet .soft-btn (signal-orange is rationed to Publish, not spent here). */
  .playground-banner { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-5); margin: var(--space-3) var(--space-5) 0; background: var(--accent-3-muted); border: none; border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); }

  /* ⑧ collaboration summary — warm transient card (the playground banner's tone, library scale). */
  .collab-note {
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
    margin: var(--space-4) var(--space-8) 0; padding: var(--space-3) var(--space-4);
    background: var(--accent-3-muted); border: none; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
  }
  .cn-msg { font-family: var(--font-body); font-size: var(--text-ui-sm); line-height: 1.6; color: var(--ink-canvas-primary); }
  .cn-x { background: none; border: none; cursor: pointer; padding: 6px var(--space-2); font-size: 1rem; color: var(--ink-canvas-secondary); }
  .cn-x:hover { color: var(--ink-canvas-primary); }
  .pg-tag { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .pg-msg { flex: 1; font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-canvas-secondary); }
  .pg-keep { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 500; letter-spacing: 0.06em; padding: var(--space-2) var(--space-4); background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); transition: background 160ms ease, box-shadow 160ms ease; }
  .pg-keep:hover { background: var(--surface-canvas-overlay); box-shadow: var(--shadow-lift-low); }
  .pg-keep:disabled { opacity: 0.6; cursor: default; box-shadow: none; }

  /* Breadcrumb crumb — the object level of "Exhibit › Object" (the spine is exhibit-level, notes object-level). */
  .crumb { font-family: var(--font-display); font-size: 1.2rem; font-weight: 300; color: var(--ink-canvas-secondary); margin-left: var(--space-1); }
  /* New-note affordance (ADR-0011): the create entry in the notes pane. Choose a shape → draw the
     region. Paper surface (it lives in the sidebar). "Armed" state turns accent while drawing. */
  .new-note { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
  /* "New note" is the core daily action — lift it out of the muted eyebrow tier so it reads as a label
     for something to DO, and give the shape buttons weight + a cord-blue (accent-2) border so they read
     as actions, not the neutral import chips around them. Signal-orange stays rationed to the header CTA
     (tokens.css §accent); :not(.nn-cancel) keeps the armed-state Cancel button on its own muted styling. */
  .new-note .nn-lead { font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  .new-note > button:not(.nn-cancel) { font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 500; letter-spacing: 0.04em; padding: var(--space-1) var(--space-3); background: var(--surface-paper-card); color: var(--ink-paper-primary); border: 1px solid var(--accent-2-paper); border-radius: var(--radius-sm); cursor: pointer; transition: background 160ms ease, box-shadow 160ms ease, border-color 160ms ease; }
  .new-note > button:not(.nn-cancel):hover { color: var(--ink-paper-primary); background: var(--accent-2-muted); border-color: var(--accent-2-hover); box-shadow: var(--shadow-lift-low); }
  .new-note.armed { gap: var(--space-3); padding: var(--space-2) var(--space-3); background: var(--accent-muted); border: none; border-radius: var(--radius-sm); }
  .new-note .nn-msg { flex: 1; font-family: var(--font-body); font-size: var(--text-ui-sm); color: var(--ink-paper-primary); }
  .new-note .nn-cancel { font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.04em; background: var(--surface-paper-card); color: var(--ink-paper-secondary); border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm); padding: var(--space-1) var(--space-2); cursor: pointer; transition: color 160ms ease, box-shadow 160ms ease; }
  .new-note .nn-cancel:hover { color: var(--ink-paper-primary); box-shadow: var(--shadow-lift-low); }
  /* P1: the active-reading destination, shown beside the armed "draw" cue (paper-toned sidebar). */
  .new-note .nn-into { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-paper-secondary); }
  .new-note .nn-rd { font-weight: 500; color: var(--ink-paper-primary); background: var(--surface-paper-card); border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm); padding: 1px var(--space-2); }

  /* Framing banner — the canvas is capturing a SECTION camera, not a note. A quiet accent-muted card;
     the active signal is a soft left dot of accent, not a hard bar. */
  .framing-banner { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-5); margin: var(--space-3) var(--space-5) 0; background: var(--accent-muted); border: none; border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); }
  .framing-banner .fb-tag { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); }
  .framing-banner .fb-msg { flex: 1; font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-canvas-primary); }
  .framing-banner .fb-cancel { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 500; letter-spacing: 0.04em; padding: var(--space-1) var(--space-3); background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: var(--space-2); transition: box-shadow 160ms ease; }
  .framing-banner .fb-cancel kbd { font-family: var(--font-mono); font-size: 0.62rem; color: var(--ink-canvas-muted); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); padding: 0 var(--space-1); }
  .framing-banner .fb-cancel:hover { box-shadow: var(--shadow-lift-low); color: var(--ink-canvas-primary); }
  /* P1: where the note will file (the active reading) — surfaced at draw time, on the canvas-toned banner. */
  .framing-banner .fb-into { display: inline-flex; align-items: center; gap: var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.04em; color: var(--ink-canvas-secondary); }
  .framing-banner .fb-rd { font-weight: 500; letter-spacing: 0; color: var(--ink-canvas-primary); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); padding: 1px var(--space-2); }

  /* Scope separator — the line between exhibit-level (spine, above) and object-level (notes, below). */
  /* Editor-sidebar ACCORDION (replaces the old flat scope-sep): the exhibit-wide Narrative spine and the
     object-local Notes are two EXCLUSIVE panels (togglePanel) — opening one collapses the other so the two
     scopes never fight for height. Each header carries its scope + count even when collapsed. Full-bleed to
     the aside edges (negative margin cancels the aside's space-5 gutter) so the headers read as bands. */
  .panel { margin: 0 calc(-1 * var(--space-5)); border-bottom: 1px solid var(--border-paper); }
  .panel:first-of-type { border-top: 1px solid var(--border-paper); }
  .panel-head { display: flex; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-3) var(--space-5); background: none; border: none; cursor: pointer; text-align: left; transition: background 140ms ease; }
  .panel-head:hover, .panel.open > .panel-head { background: var(--surface-paper-hover); }
  .panel-head .ph-caret { font-size: 0.7rem; line-height: 1; color: var(--ink-paper-muted); }
  .panel-head .ph-title { font-family: var(--font-display); font-weight: 400; font-size: 1.15rem; line-height: 1; color: var(--ink-paper-primary); }
  .panel-head .ph-scope { flex: 0 1 auto; min-width: 0; overflow-wrap: anywhere; font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  .panel-head .ph-count { margin-left: auto; flex: none; font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); letter-spacing: 0.04em; color: var(--ink-paper-muted); }
  /* Count pill — on a COLLAPSED accordion with hidden content, the item count shows as a pill so you can see
     there are N things under it without expanding. (Open panels show the descriptive count text instead.) */
  .panel-head .count-pill { margin-left: auto; flex: none; display: inline-flex; align-items: center; justify-content: center; min-width: 1.45rem; padding: 1px var(--space-2); font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600; line-height: 1.5; color: var(--ink-paper-primary); background: var(--surface-paper-card); border: 1px solid var(--border-paper-emphasis); border-radius: 999px; }
  .panel-body { padding: var(--space-2) var(--space-5) var(--space-4); }
  /* Always-visible CREATE row, between a panel's header and its (collapsing) body — the creation tools live
     OUTSIDE the accordion so you can add a section / note without expanding the panel. Full-bleed gutter like
     the header; when the panel is open, a hairline separates create from the content below. */
  .panel-create { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); padding: var(--space-2) var(--space-5) var(--space-3); }
  .panel.open > .panel-create { border-bottom: 1px solid var(--border-paper); }
  /* Notes create stacks its rows (draw tools → import links → hint); narrative create stays inline. */
  .notes-create { flex-direction: column; align-items: stretch; }
  /* Primary CTA — the ONE rationed signal here: signal-orange fill, warm body text, soft glow. */
  .create-add { align-self: flex-start; cursor: pointer; font-family: var(--font-body); font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.01em; padding: var(--space-2) var(--space-3); background: var(--accent); color: var(--ink-on-accent); border: none; border-radius: var(--radius-sm); box-shadow: var(--shadow-signal-glow); transition: background 140ms ease; }
  .create-add:hover:not(:disabled) { background: var(--accent-hover); }
  .create-add:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); box-shadow: none; cursor: default; }
  /* "+ from a note…" — a quiet secondary select beside the Add CTA (seed a section from an existing note). */
  .from-note { font-family: var(--font-ui); font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; padding: var(--space-2); cursor: pointer; background: var(--surface-canvas-raised); color: var(--ink-paper-secondary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); transition: color 120ms ease, border-color 120ms ease; }
  .from-note:hover { border-color: var(--accent-2); color: var(--accent-2); }

  /* KEYSTONE matched-pair cue — a quiet teaching note on warm paper, attached above the spine card. Forest
     green reads here (paper, not grey), used only on the accent left-rule; the body stays ink. Non-blocking,
     never a modal. (Sidebar is the paper surface — paper tokens throughout.) */
  .narrative-cue { display: flex; flex-direction: column; gap: var(--space-2); margin: 0 0 var(--space-3); padding: var(--space-3); background: var(--surface-paper-card); border-left: 3px solid var(--accent); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); }
  .narrative-cue .nc-msg { margin: 0; font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; color: var(--ink-paper-primary); }
  .narrative-cue .nc-aside { color: var(--ink-paper-secondary); }
  .narrative-cue .nc-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .narrative-cue button { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 500; letter-spacing: 0.04em; padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); transition: color 120ms ease, border-color 120ms ease, background 120ms ease; }
  /* "Preview how it opens" — wired to a marked TODO (no in-Studio preview yet), so it sits disabled, not absent. */
  .nc-preview { background: var(--surface-paper); color: var(--ink-paper-muted); border: 1px solid var(--border-paper); }
  .nc-preview:disabled { opacity: 0.6; cursor: default; }
  .nc-dismiss { background: var(--surface-paper); color: var(--accent); border: 1px solid var(--border-paper-emphasis); }
  .nc-dismiss:hover { border-color: var(--accent); }
  /* The last-remove confirm: vermillion ONLY on the destructive "Remove" (the design-system inline-confirm
     idiom, Archie-3f4c); the rule turns vermillion too so the strip reads as a guard, not a tip. */
  .narrative-cue.confirm { border-left-color: var(--semantic-error); }
  .nc-keep { background: var(--surface-paper); color: var(--ink-paper-secondary); border: 1px solid var(--border-paper-emphasis); }
  .nc-keep:hover { color: var(--ink-paper-primary); border-color: var(--ink-paper-secondary); }
  .nc-remove { background: var(--semantic-error); color: var(--ink-on-accent); border: 1px solid var(--semantic-error); }
  .nc-remove:hover { filter: brightness(0.94); }

  /* Object rail — the exhibit's works laid along the table edge; the active one marked by a quiet
     accent tint + soft lift (not a loud orange fill — the signal is rationed to Publish). */
  .objects {
    display: flex; gap: var(--space-2); align-items: stretch;
    padding: var(--space-3) var(--space-5);
    background: var(--surface-canvas-raised); border-bottom: 1px solid var(--border-canvas);
    overflow-x: auto; /* many objects scroll the rail, not the page (12 plates pushed the page to ~2900px) */
  }
  /* Object tab — a thumbnail + label so you choose visually (P2-6), not by name alone. */
  .obj {
    display: flex; align-items: center; gap: var(--space-2); cursor: pointer; text-align: left; max-width: 16rem;
    padding: var(--space-2);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: none; border-radius: var(--radius-sm);
    transition: color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }
  .obj:hover { color: var(--ink-canvas-primary); background: var(--surface-canvas-overlay); box-shadow: var(--shadow-lift-low); }
  .obj.on { background: var(--accent-muted); color: var(--ink-canvas-primary); box-shadow: var(--shadow-lift-low); }
  .obj-thumb { flex-shrink: 0; width: 40px; height: 32px; border-radius: var(--radius-sm); background-color: var(--surface-canvas); background-size: cover; background-position: center; box-shadow: var(--shadow-inset-fog); }
  .obj-meta { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .obj-label { font-family: var(--font-display); font-size: 1.0625rem; font-weight: 400; line-height: 1.1; overflow-wrap: anywhere; }
  .obj-count { font-family: var(--font-mono); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-canvas-muted); }
  .obj.on .obj-count { color: var(--accent); }

  /* Add-object affordance on the rail */
  .add-obj-toggle {
    align-self: center; cursor: pointer; padding: var(--space-2) var(--space-3);
    background: none; color: var(--ink-canvas-secondary);
    border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.04em; transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
  }
  .add-obj-toggle:hover { color: var(--accent-2); border-color: var(--accent-2); background: var(--surface-canvas-overlay); }
  .add-obj { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .add-obj-head { flex-basis: 100%; font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.04em; color: var(--ink-canvas-primary); }
  .add-obj-hint { flex-basis: 100%; max-width: 28rem; font-family: var(--font-body); font-size: var(--text-ui-xs); line-height: 1.5; color: var(--ink-canvas-muted); }
  .add-obj-hint strong { color: var(--ink-canvas-secondary); font-weight: 600; }
  .add-obj input {
    font-family: var(--font-body); font-size: 0.875rem; padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); width: 14rem;
  }
  .add-obj input.lbl { width: 8rem; }
  .add-obj input:focus { outline: none; border-color: var(--accent-2); }
  .add-obj button { cursor: pointer; padding: var(--space-2) var(--space-3); font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.04em; background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); transition: background 160ms ease, box-shadow 160ms ease; }
  .add-obj button:hover { background: var(--surface-canvas-overlay); box-shadow: var(--shadow-lift-low); }
  .add-obj button:disabled { background: var(--surface-canvas-raised); color: var(--ink-canvas-muted); box-shadow: none; cursor: default; }
  .add-obj .cancel { background: none; color: var(--ink-canvas-secondary); }
  .add-obj .cancel:hover { color: var(--ink-canvas-primary); }
  /* Import feedback on the rail (AV ingest/upload UX): understated, floating on the warm ground. The
     spinner is the accent; the note is a quiet soft card you can dismiss. */
  .import-status { display: inline-flex; align-items: center; gap: var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-canvas-secondary); overflow-wrap: anywhere; }
  .import-spinner { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--accent-muted); border-top-color: var(--accent); animation: import-spin 0.7s linear infinite; }
  @keyframes import-spin { to { transform: rotate(360deg); } }
  .import-note { display: inline-flex; align-items: center; gap: var(--space-2); max-width: 30rem; font-family: var(--font-body); font-size: var(--text-ui-sm); line-height: 1.5; color: var(--ink-canvas-secondary); padding: var(--space-2) var(--space-3); background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-sm); box-shadow: var(--shadow-lift-low); white-space: normal; }
  .import-note-x { flex-shrink: 0; cursor: pointer; background: none; border: none; color: var(--ink-canvas-muted); font-size: var(--text-ui-xs); padding: 0 var(--space-1); }
  .import-note-x:hover { color: var(--ink-canvas-primary); }
  /* File-pick button (hides the native input) + the "or" separator */
  .file-btn { display: inline-flex; align-items: center; cursor: pointer; padding: var(--space-2) var(--space-3); font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.04em; color: var(--ink-canvas-primary); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); transition: color 160ms ease, box-shadow 160ms ease; }
  .file-btn:hover { color: var(--accent-2); box-shadow: var(--shadow-lift-low); }
  .file-btn input { display: none; }
  .add-obj .or { font-family: var(--font-ui); font-size: var(--text-ui-xs); text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-canvas-muted); }

  .body { display: flex; flex: 1; min-height: 0; }
  main { flex: 1; min-width: 0; background: var(--surface-canvas); position: relative; }
  /* The armed canvas wears its mode — soft inset accent ring + crosshair, gone on disarm. */
  /* Geo-annotation: basemap attribution credit (REQUIRED by the tile provider — DESIGN.md D6). Bottom-left
     so it clears the bottom-right OSD locator mini-map. Warm charcoal scrim keeps it legible over map tiles. */
  .map-attribution {
    position: absolute; left: var(--space-2); bottom: var(--space-2); z-index: 25; pointer-events: none;
    font-family: var(--font-ui, system-ui), sans-serif; font-size: 0.7rem; letter-spacing: 0.02em; color: var(--paper);
    background: rgba(59, 49, 56, 0.55); padding: 3px var(--space-2); border-radius: var(--radius-sm);
  }
  main.drawing { cursor: crosshair; }
  main.drawing::after { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 30; border-radius: var(--radius-md); box-shadow: inset 0 0 0 2px var(--accent), var(--shadow-inset-fog); }
  /* Drag-and-drop import feedback over the canvas */
  main.drag-over { outline: 2px dashed var(--accent-2); outline-offset: -8px; border-radius: var(--radius-md); }

  /* Marker-anchored note editor (ADR-0006) — a warm-paper card floating over the canvas, positioned by
     Canvas's onmarkerrect (+14px off the marker, donor PADDING) and following it on pan/zoom. */
  .note-popover {
    /* Responsive: grows on wide monitors, never below 320px; still clamped to the viewport. */
    position: fixed; z-index: 50; width: clamp(320px, 23vw, 440px); max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
    overflow-y: auto; box-sizing: border-box;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: none; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-mid);
  }
  .np-grip {
    display: block; width: 100%; cursor: grab; text-align: center; user-select: none;
    padding: 4px 0; font-size: 0.8rem; line-height: 1.4; color: var(--ink-paper-muted);
    background: var(--surface-paper-hover); border: none; border-bottom: 1px solid var(--border-paper);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }
  .np-grip:hover { color: var(--accent); }
  .np-grip:active { cursor: grabbing; }
  /* Popover header — the drag grip fills, the ⤢ pin button sits at the right; together they own the top edge. */
  .np-head { display: flex; align-items: stretch; border-radius: var(--radius-md) var(--radius-md) 0 0; overflow: hidden; }
  .np-head .np-grip { flex: 1; width: auto; border-radius: 0; }
  .np-pin {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center; width: 2rem; cursor: pointer;
    background: var(--surface-paper-hover); border: none; border-bottom: 1px solid var(--border-paper);
    color: var(--ink-paper-muted); font-size: 0.95rem; line-height: 1; transition: color 160ms ease;
  }
  .np-pin:hover { color: var(--accent-2); }

  /* Pinned note inspector (ADR-0006 sanctioned fallback) — the SAME WADM form, docked full-height on the
     RIGHT (opposite the notes aside), detached from the marker. One form definition; the wadm sheds its
     in-popover top frame here too (the header IS the frame). */
  .note-inspector {
    width: clamp(320px, 24vw, 460px); flex-shrink: 0; overflow: auto; box-sizing: border-box;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  .ni-head { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-paper); }
  .ni-title { font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); }
  .ni-unpin { cursor: pointer; font-family: var(--font-ui); font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; padding: 2px var(--space-2); background: var(--surface-paper-card); color: var(--ink-paper-secondary); border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm); transition: color 160ms ease, box-shadow 160ms ease; }
  .ni-unpin:hover { color: var(--accent-2); box-shadow: var(--shadow-lift-low); }
  .note-inspector :global(.wadm) { margin-top: 0; border-top: none; padding-top: 0; padding: var(--space-4); }
  /* The .wadm form CSS (incl. the in-popover override) lives in NoteEditor.svelte now (the DOMINO cut). */

  /* Notes sidebar — the notebook (warm paper) */
  aside {
    /* Width = a token so it's responsive by default (clamp) AND drag-resizable (Phase 2 sets --studio-aside-w inline). */
    width: var(--studio-aside-w, clamp(320px, 26vw, 520px)); flex-shrink: 0; overflow: auto; box-sizing: border-box;
    padding: var(--space-5);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  /* Collapsed = give the canvas the whole width (image-first). The divider stays (anti-trap: always expandable). */
  aside.collapsed { width: 0; min-width: 0; padding: 0; border-left: 0; overflow: hidden; }
  /* Editable object label — reads as a Fraunces title, reveals as an input on hover/focus */
  .object-title {
    display: block; width: 100%; box-sizing: border-box; margin: 0 0 var(--space-1);
    font-family: var(--font-display); font-size: 1.7rem; font-weight: 300; line-height: 1.15; color: var(--ink-paper-primary);
    background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    transition: background 160ms ease, box-shadow 160ms ease;
  }
  .object-title:hover { background: var(--surface-paper-hover); }
  .object-title:focus { outline: none; background: var(--surface-paper-card); box-shadow: var(--shadow-lift-low); }
  ul { list-style: none; margin: 0; padding: 0; }

  /* Annotation note card — warm paper, soft rounded, separated by tone + shadow (no hard border) */
  li button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4); margin-bottom: var(--space-2);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 2px solid transparent;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    transition: background 160ms ease, box-shadow 160ms ease;
  }
  li button:hover { background: var(--surface-paper-hover); box-shadow: var(--shadow-lift-mid); }
  /* Selected = a quiet signal: a soft accent left-edge + faint tint, never a loud fill. */
  li.sel button { border-left-color: var(--accent); background: var(--accent-muted); }
  .comment { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }
  .meta { margin-top: var(--space-2); display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
  .tag { font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-2); }
  /* Geo-annotation: the pin's lng/lat readout in the note list (derived from its basemap position). */
  .geo { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.02em; color: var(--ink-paper-secondary); }
  .layer { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-paper-secondary); background: var(--surface-paper-hover); border: 1px solid var(--border-paper); padding: 2px var(--space-2); border-radius: var(--radius-sm); }
  .hint { font-family: var(--font-body); font-size: var(--text-ui-md); color: var(--ink-paper-secondary); line-height: 1.6; margin-top: var(--space-4); }
  .csv-import { align-self: flex-start; background: none; border: none; cursor: pointer; padding: 6px 0; font-family: var(--font-ui); font-size: var(--text-ui-md); color: var(--ink-paper-secondary); transition: color 160ms ease; } /* 24px+ hit box */
  .csv-import:hover { color: var(--accent-2); }
  /* "To place" worklist cards (Archie-79c0 sub-cycle B) — width-responsive: text WRAPS, never truncates. */
  .np-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .np-row { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 8px; border: 1px solid var(--ink-paper-muted); border-radius: var(--radius-md); font-family: var(--font-ui); font-size: var(--text-ui-md); }
  .np-row.placing { border-color: var(--accent-2); box-shadow: 0 0 0 1px var(--accent-2); }
  .np-cmt { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .np-meta { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; color: var(--ink-paper-muted); }
  .np-obj { min-width: 0; overflow-wrap: anywhere; }
  .np-tags { min-width: 0; overflow-wrap: anywhere; color: var(--accent-2); }
  .np-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 2px; }
  .np-drawing { color: var(--accent-2); overflow-wrap: anywhere; }
  .np-set { background: none; border: 1px solid var(--accent-2); border-radius: var(--radius-md); cursor: pointer; padding: 3px 10px; font: inherit; color: var(--accent-2); transition: filter 160ms ease; }
  .np-set:hover { filter: brightness(1.2); }
  .np-del { background: none; border: none; cursor: pointer; padding: 3px 6px; color: var(--ink-paper-muted); font: inherit; }
  .np-del:hover { color: var(--accent-2); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-4); border: 1px dashed var(--border-paper-emphasis); border-radius: var(--radius-md); }

  /* The WADM form CSS (.wadm family + .save/.del/.wadm-actions) lives in NoteEditor.svelte now. */
</style>

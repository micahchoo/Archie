<script module lang="ts">
  // Session-only transient screen state (ADR-0024 #6): how a PLACE looks beyond its address — the
  // overview's canvas pan-zoom. Module-level so it survives a component remount WITHIN the session (leave
  // an exhibit, come back, find it framed as you left it) but resets on a fresh load (the URL alone is
  // honored then). Best-effort — a plain Map keyed by exhibit slug. (The Canvas/List mode is a persisted
  // view preference owned elsewhere, NOT a transient — excluded here.) Library transient (search text) is
  // one place, so it rides App-instance state instead (see gallerySearch).
  type OverviewScreen = { tx: number; ty: number; z: number };
  const overviewScreens = new Map<string, OverviewScreen>();
</script>

<script lang="ts">
  // Studio editor (Phase-2 UI, browser-verified later). Real annotate loop over the headless-
  // tested @render/core AnnotationSession: draw on the canvas → create note → edit body/tags/
  // layers in the WADM form → publish to .archie.zip. Logic lives in core; this is the thin shell.
  import { onMount, tick } from "svelte";
  import ReadingsModal from "./ReadingsModal.svelte";
  // The readings RAIL that floated over the canvas is RETIRED from the editor (Archie-b671): its
  // controls now live as a subordinate panel in the sidebar's "This object" zone (see the body markup).
  import SafetyState from "./SafetyState.svelte";
  // Canvas is lazy-loaded (see CanvasComp below) — it pulls OpenSeadragon + Annotorious, the studio's
  // largest dependency, and Studio boots into the library view that never mounts it. Keeping it out of
  // the static graph drops that weight from the startup bundle.
  import ResizeDivider from "@render/svelte/ResizeDivider.svelte";
  // Publish (the merged chooser + wizard surface, Archie-1921) is lazy-loaded with the publish flows
  // (ensurePub) — see PublishComp below.
  import LibraryHome from "./LibraryHome.svelte";
  // CmdK is lazy-loaded on first open (see CmdKComp below). Cite-by-image is CmdK's internal Browse tab
  // now (Archie-5968) — the old standalone MediaPicker surface was already orphaned and is deleted.
  // AvEditor (AV objects) is lazy-loaded — see AvEditorComp below (kept out of the startup bundle).
  import ExhibitOverview from "./ExhibitOverview.svelte";
  // The scoped add-media chooser (Archie-56cf): the SAME dialog LibraryHome uses to mint exhibits,
  // opened here in "add-to-exhibit" scope so the overview Add-media plate + the editor "+ Add media"
  // button funnel every "bring something in" through one surface (folder / IIIF / Map). It absorbed the
  // retired AddMapModal's Map path, so there is no longer a standalone map modal to lazy-load.
  import CreateExhibitDialog from "./CreateExhibitDialog.svelte";
  // NarrativeEditor (narrative panel) is lazy-loaded — see NarrativeEditorComp below.
  import DetailsEditor from "./DetailsEditor.svelte";
  import PropsDrawer from "./PropsDrawer.svelte";
  import ShortcutsHelp from "./ShortcutsHelp.svelte";
  import TutorialModal from "./TutorialModal.svelte";
  import HelpMenu from "./HelpMenu.svelte";
  import NoteEditor from "./NoteEditor.svelte";
  import { matches, typingInField } from "./shortcuts.js";
  // The shared modality gate (Archie-5968): App owns the single global keydown, so the Esc dismissal
  // ladder (topmost floater → the one scrimmed surface) routes through `modality.handleEsc()` here.
  import { modality } from "./modality.svelte";
  import { applyClick, selectAll as selectAllIds, applyMarquee, type ClickMods } from "./overview-selection.js";
  import {
    AnnotationSession, asClientId, encodeLinkRef, stripMarkdown,
    timeFragmentValue, mediaFragmentValue, parseTimeFragment, importTranscript, thumbnailUrl,
    tagsOf, emphasisOf, readingMarkerStyle, workingToLibrary, resolveLayoutType,
    isWholeObjectFor, wholeObjectFlagOf, selectorOf, selectorBBox,
    type LogicalId, type Library, type LayoutType, type W3CAnnotation, type W3CBody, type AnnotationRecord, type AnnotationLog, type Section, type Reading, type RightsFields, type Emphasis, type TileSourceDescriptor,
  } from "@render/core";
  import type { DrawTool, MarkerStyle, FrameOverlay } from "@render/mount";
  import { openExhibitAnnotationsDir, openExhibitStructureDir, loadLibraryMeta, readAssetUrl, readThumbUrl, clearExhibitAnnotations, exhibitHasAnnotations, isAsset, ASSET_PREFIX, loadPendingNotes, savePendingNotes, WORKING_STORE_ID, type ExhibitMeta, type ObjectMeta, type PendingNote } from "./store.js";
  import { createLibraryStore } from "./library-meta.svelte.js";
  import { enqueueSave, saveStatus, setWriterGate } from "./save-queue.svelte.js";
  import { createWriterLock } from "./writer-lock.svelte.js";
  import { zipNameFor } from "./binding.js";
  import { createBindingStore } from "./binding-store.svelte.js";
  // createPublishFlows is imported DYNAMICALLY (ensurePub below) so its fflate + dompurify + GitHub-publish
  // deps stay OUT of the startup bundle — publishing is a deliberate action, never needed at boot.
  import { createReadingState } from "./reading-state.svelte.js";
  import { hasRealWorkIn } from "./safety-state.svelte.js";
  // Persisted editor-chrome view preferences (Archie-c7ef): the filmstrip's collapsed state + the docked
  // note editor's width. Same module the overview Canvas/List + library lens live in.
  import { viewPrefs } from "./view-prefs.svelte.js";
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
  // Structure rev-log behind archie.structureRevlog (Archie-42f3) — default OFF; the session module
  // is inert when the flag is off (no reads, no writes, no structure/ dir).
  import { createStructureSession } from "./structure-session.svelte.js";
  import { structureRevlogEnabled } from "./feature-flags.js";
  import { createAssetUrls } from "./asset-urls.svelte.js";
  // Place-addressable navigation (ADR-0024): the pure place model (parse/serialize/resolve) + Tauri detection.
  import { parsePlace, serializePlace, resolvePlace, librarySnapshot, LIBRARY, type Place, type Missing } from "./place.js";
  import { isTauri } from "./tauri-fs.js";

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
  const lib = createLibraryStore({ exhibits: DEFAULT_EXHIBITS }, {
    // touch() marks the binding unsaved; the incremental folder mirror (spike-0002) then drains whatever
    // onDirty accumulated — one trigger per (debounced) persist, so a keystroke burst coalesces into one.
    onAfterPersist: () => { bnd.touch(); void bnd.autosaveToFolder(); },
    onDirty: (d) => {
      if (d.kind === "library") bnd.markLibraryDirty();
      else if (d.kind === "exhibit-assets") bnd.markAssetsDirty(d.slug);
      else if (d.kind === "exhibit-removed") bnd.markExhibitRemoved(d.slug);
      else bnd.markExhibitDirty(d.slug);
    },
  });
  let view = $state<"library" | "overview" | "editor">("library");

  // --- Place-addressable navigation (ADR-0024). A *place* — library | overview(slug) | editor(slug,objId)
  // — is mirrored to the URL as a hash route (docs/research/routing-mechanism.md). Every place change pushes
  // a history entry (#3), and back/forward + a pasted bookmark drive the view through resolvePlace, which
  // degrades an unresolvable place to its nearest surviving ancestor (#4). Modals/drawers are NOT places
  // (currentPlace reads only the view triple), so they never enter history (#6). ---
  let fallbackNotice = $state<string | null>(null); // the "what wasn't found" strip after a degrade (#4)
  // committedUrl = the hash currently reflected in history; syncUrl pushes only when currentPlace diverges.
  // navReady gates out the pre-boot library render; the suspend COUNT silences intermediate states during a
  // multi-step async transition. All three are plain lets (NOT $state) — mutating them must never re-run the
  // sync effect (that would recurse); the effect is driven by currentPlace alone.
  let committedUrl: string | null = null;
  let navReady = false;
  let navSyncSuspendCount = 0;
  function suspendSync() { navSyncSuspendCount++; }
  function resumeSync() { navSyncSuspendCount = Math.max(0, navSyncSuspendCount - 1); }
  // Desktop (Tauri) has no address bar: the last place is remembered in localStorage and restored on launch
  // through the SAME resolver, so a stale remembered place degrades per #4. Read ONCE at init, before any
  // effect can overwrite it (the persist effect writes on every place change).
  const LAST_PLACE_KEY = "archie.lastPlace.v1";
  const savedLastPlace: Place = (() => { try { return parsePlace(localStorage.getItem(LAST_PLACE_KEY) ?? ""); } catch { return LIBRARY; } })();

  // --- Transient screen state mirrors (ADR-0024 #6). Bound into the child screens; App remembers them
  // across the child's remount within the session. Overview pan-zoom is per-slug (overviewScreens map); the
  // library search is one place, so App-instance state is its session memory (resets on reload). (The two
  // toggles — overview Canvas/List, library Exhibits/All-images — are PERSISTED prefs owned elsewhere.) ---
  let ovTx = $state(0), ovTy = $state(0), ovZ = $state(1);
  let gallerySearch = $state("");
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
  let NarrativeEditorComp = $state<typeof import("./NarrativeEditor.svelte").default | null>(null);
  $effect(() => { if (view === "editor" && !NarrativeEditorComp) void import("./NarrativeEditor.svelte").then((m) => { NarrativeEditorComp = m.default; }); });
  // The Publish surface loads alongside the publish flows (ensurePub) — it only renders under {#if pub}.
  // ONE component now (Archie-1921 — PublishDialog + the Publish wizard merged into one scrimmed surface).
  let PublishComp = $state<typeof import("./Publish.svelte").default | null>(null);
  // CmdK (⌘K cite palette — text Search + image Browse in one surface) loads on first open (rare at startup).
  let CmdKComp = $state<typeof import("./CmdK.svelte").default | null>(null);
  $effect(() => { if (cmdkOpen && !CmdKComp) void import("./CmdK.svelte").then((m) => { CmdKComp = m.default; }); });
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
  // SafetyState's "Action needed" input, shared by the editor + overview header mounts (Archie-c76d): true
  // once any exhibit is real (non-template) work OR library-level meta has been authored (title/summary/
  // credit — decision (d); extended app-locally in hasRealWorkIn, no model fields added).
  const safetyHasRealWork = $derived(hasRealWorkIn(lib.meta.exhibits, isTemplate, {
    ...(lib.meta.title !== undefined ? { title: lib.meta.title } : {}),
    ...(lib.meta.summary !== undefined ? { summary: lib.meta.summary } : {}),
    ...(lib.meta.rights !== undefined ? { rights: lib.meta.rights } : {}),
    ...(lib.meta.requiredStatement !== undefined ? { requiredStatement: lib.meta.requiredStatement } : {}),
  }));
  // Canvas IRI for an object of the CURRENT exhibit (matches publishLibrary's grammar per slug).
  const canvasIdOf = (objId: string) => `${BASE}${currentSlug}/canvas/${objId}`;

  // --- imported-image assets: stored in OPFS, source "/assets/{name}", resolved to blob: URLs ---
  // ASSET_PREFIX / isAsset live in store.ts now (one definition — App + publish flows share it).
  // Masters-on-demand (SCALE-GALLERY Phase 1.2 — asset-urls.svelte.ts): thumbs resolve EAGERLY for the
  // whole exhibit (the grid needs every plate); the full-res master (canvas/OSD source) is minted only
  // for the object in view. Injected readers/revoke keep the mint lifecycle unit-testable.
  const assets = createAssetUrls({
    readMaster: readAssetUrl,
    readThumb: readThumbUrl,
    revoke: (u) => URL.revokeObjectURL(u),
    assetName: (src) => (isAsset(src) ? src.slice(ASSET_PREFIX.length) : null),
  });

  // --- per-exhibit annotation SESSION state machine (the DOMINO cut — exhibit-session.svelte.ts).
  // Owns session / annDir / storeReady / dirty + the autosave lifecycle + the ATOMIC open transition
  // (fix #3). The editor CURSOR (selected/editing/creating/currentObjectId/rev) stays in App (bind:-bound).
  // `bnd` deps are deferred getters (bnd is created below) — called only at action time, never at init. ---
  const sess = createExhibitSession({
    baseUrl: BASE,
    author: () => author,
    isTemplate,
    seedFor: (slug) => seededFor(author, slug),
    autosaveToFolder: (slug) => { bnd.markExhibitDirty(slug); void bnd.autosaveToFolder(); },
    touchBinding: () => bnd.touch(),
    // Torn/corrupt annotation store on open (Issue 19): surface it (the readable notes still load and
    // nothing is overwritten — the session refuses to seed-fresh-over a torn store). Same window.alert
    // channel the file/IIIF/CSV load errors already use.
    onLoadCorruption: (slug, corrupt) => {
      console.warn(`Archie: annotation store for "${slug}" is partially unreadable`, corrupt);
      window.alert(`Some notes in this exhibit couldn't be read (${corrupt.length} damaged page${corrupt.length === 1 ? "" : "s"}). The readable notes are shown and nothing was overwritten — export a backup before editing further.`);
    },
  });
  // Thin App-side wrappers preserve the zero-arg save()/scheduleSave() call sites (they thread the live slug).
  const save = () => sess.save(currentSlug);
  const scheduleSave = () => sess.scheduleSave(currentSlug);

  // --- Structure rev-log (Archie-42f3), behind archie.structureRevlog — read ONCE at boot. OFF (the
  // default): everything below is inert — no structure/ dir, no reads/writes, setSections behaves
  // byte-identically to the pre-revlog build. ON: section mutations reconcile into the append-only
  // structure log (spine/structure.ts), persist beside the annotation history, and library.json's
  // `sections` becomes the log's projection snapshot. Conflict RESOLUTION UI is Studio-UX map
  // territory (Archie-d71c/90f1) — here plural heads only GATE editing (NarrativeEditor conflictedIds).
  const STRUCTURE_REVLOG = structureRevlogEnabled();
  const structure = createStructureSession({
    author: () => author,
    openStructDir: openExhibitStructureDir,
    enqueue: enqueueSave,
    isTemplate,
  });
  // Load the entered exhibit's structure log (once per slug; seeds from a pre-revlog `sections` array
  // on the first flag-on run). Reruns on meta changes but ensureLoaded no-ops once loaded.
  $effect(() => {
    if (!STRUCTURE_REVLOG || view === "library") return;
    const ex = currentExhibit;
    if (!ex) return;
    void structure.ensureLoaded(ex.slug, ex.id, ex.sections ?? []);
  });
  // Flag-ON commit hook (called from setSections/confirmClear AFTER today's patch): reconcile the
  // array into the log; when the log's projection disagrees with the array (a gated conflict kept a
  // row, an un-delete restored content), re-snapshot the PROJECTION into library.json — the log is
  // the source when the flag is on, library.json its snapshot.
  function applyStructure(slug: string, sections: Section[]) {
    const ex = lib.meta.exhibits.find((e) => e.slug === slug);
    if (!ex) return;
    const ws = structure.apply(slug, ex.id, sections);
    if (ws && JSON.stringify(ws.sections) !== JSON.stringify(sections)) lib.patchExhibit(slug, { sections: ws.sections });
  }

  // --- Library binding (invention #3, CONTEXT three-configs persistence): WHERE this Library's canonical
  // bytes live. unbound = OPFS-only (this browser); folder = Chromium FSA autosave-in-place; file = a
  // .archie.zip on disk (Save downloads it). Capability picks folder-vs-file; the user sees only "where". ---
  // Binding state machine lives in the binding store now (worklist 0.3 cut 1 — binding-store.svelte.ts);
  // `bnd` is created below the publish primitives it depends on. The App keeps only zip-open chrome.
  let collabNote = $state<string | null>(null); // ⑧: who-wrote-what after opening a zip (dismissible)
  const PROJECT_TITLE = "Archie Library";
  // Cross-tab single-writer (Issue 22 / ledgers/TABS.md): the first tab to open this working library holds
  // the Web Lock and may save; a second tab is read-only (the save-queue gate refuses its writes) until it
  // takes over. claimed + wired to the queue gate in onMount.
  const writerLock = createWriterLock(WORKING_STORE_ID);
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
    // Issue 22: acquire the writer lock for this working library; a second tab is read-only. The queue
    // gate reads canWrite so a reader tab cannot overwrite the writer's edits. Web Locks auto-release on
    // tab close; the beforeunload release is for the BroadcastChannel fallback's "bye".
    writerLock.claim();
    setWriterGate(() => writerLock.canWrite);
    window.addEventListener("beforeunload", () => writerLock.release());
    // Restore a saved GitHub session (Task 13) — desktop only; web / no stored token resolves null with
    // no network. Non-blocking: the publish machine's live `initialSession` getter picks it up whenever
    // it lands, so a return visit opens straight on the one-click update. Dynamic import keeps the deploy
    // module out of the startup parse.
    void import("./deploy/deploy-flows.svelte.js").then((m) => m.restoreSession()).then((sess) => { initialSession = sess; }).catch(() => {});
    // --- Place-addressable navigation boot (ADR-0024 #5). Wire back/forward + manual hash edits, then install
    // the INITIAL place through the resolver. Web: the URL is authoritative (a bare URL is Library Home).
    // Desktop (Tauri, no address bar): restore the remembered place. Both degrade a stale place per #4. Runs
    // AFTER the library meta is loaded above so resolvePlace sees the real exhibits. replaceState (not push)
    // so boot leaves exactly one history entry. ---
    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    navReady = true;
    await applyPlace(isTauri() ? savedLastPlace : parsePlace(location.hash), "replace");
  });

  // Open an exhibit: load its per-exhibit annotation log (seed the sample if empty) and land on its
  // Overview. Wrapped in suspend/resume so this multi-step async transition pushes ONE history entry — the
  // settled landing place — not the intermediate cursor mutations (see syncUrl).
  async function openExhibit(slug: string) {
    suspendSync();
    try {
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
    clearSel(); selectMode = false; // selection is exhibit-scoped (Phase 2) — the incoming exhibit starts clean
    void loadPendingNotes().then((m) => { pendingNotes = m[slug] ?? []; }); // this exhibit's coordinate-free imports awaiting a box
    rdg.resetForExhibit(); // fresh exhibit = everything visible, pen on base (fixes the cross-exhibit leak)
    firstAddCueSlug = null; pendingClear = null; clearedSlug = null; // drop any narrative-staging cue from the outgoing exhibit
    // The SESSION swap is now one ATOMIC transition (fix #3): exhibit-session.open flushes the OUTGOING
    // exhibit, resolves THIS exhibit's thumbs, then loads/seeds + installs session/annDir/storeReady in a
    // single synchronous batch — no subscriber ever sees a half-opened exhibit (the old inline version
    // interleaved 7 mutations across 2 awaits). Thumb resolution stays App-owned (the `assets` store),
    // injected into the transition so it lands inside the same atomic open. The current object's MASTER is
    // minted separately, on `current` change (the $effect below) — masters-on-demand, Phase 1.2.
    await sess.open(prevSlug, {
      slug,
      resolveAssets: () => assets.resolveThumbs(slug, ex?.objects ?? []), // OPFS /assets → thumb blob: URLs
    });
    rev += 1;
    // ADR-0024 #2: Overview is MANDATORY. Every exhibit — one object, many, or empty — lands on its
    // Overview; the old single-object skip (→ editor) is removed, so the same click always reaches the
    // same screen and the editor is always one explicit step deeper. Single-object exhibits still need
    // the overview's narrative strip, details, and add-media surface — the skip stranded those.
    enterOverview(slug);
    } finally {
      resumeSync();
      syncUrl(); // push the settled landing place (no-op if a caller/history replay is still suspending)
    }
  }
  // Enter the overview scale for `slug`, restoring the transient look (mode + pan-zoom) remembered for it
  // within this session (ADR-0024 #6). The single funnel for "show overview" so restore never gets skipped.
  function enterOverview(slug: string) {
    restoreOverviewScreen(slug);
    view = "overview";
  }
  async function backToLibrary() {
    sess.cancelPendingSave();
    await save();
    assets.revokeAll(); // free the previous exhibit's blob: URLs (thumbs + master slot)
    editingObjectId = null; // drop any overview pencil edit-cursor as we leave the overview
    view = "library";
  }
  // Overview ↔ object (invention #1): descend from a plate into close annotation, then climb back. Going
  // back to the overview KEEPS the resolved thumbnails (unlike backToLibrary, which frees them).
  // A plain plate/rail open must drop any stale beat focus itself: switchObject's focusSectionId reset is
  // guarded by `id === currentObjectId` (early return), so re-opening the object a deep link just landed on
  // (e.g. overview → beat → back → same object's plate) would otherwise leave the old focusSectionId armed —
  // NarrativeEditor's activeSectionId effect would then steal focus/scroll/pulse on a click that meant
  // nothing more than "open this object" (code review, Archie-696d follow-up).
  function openObject(objId: string) { editingObjectId = null; switchObject(objId); focusSectionId = null; view = "editor"; }
  // Library-Gallery wall click-through (Phase 3.2): open an object in ITS exhibit's editor. ALWAYS
  // openExhibit first — `currentSlug` is a cursor, NOT a "this exhibit is loaded" flag: after
  // backToLibrary (assets.revokeAll emptied the thumbs) or at boot/post-replace, currentSlug can name a
  // slug whose SESSION isn't installed, so a same-slug shortcut would open an editor with blank rails.
  // The card path already re-opens same-slug via openExhibit — pay the same (cheap) cost.
  async function openObjectInExhibit(slug: string, objId: string) {
    await openExhibit(slug);
    openObject(objId);
  }
  async function backToOverview() { editingObjectId = null; await save(); enterOverview(currentSlug); }

  // --- Destructive removes (Archie-3f4c). Object → tombstone its notes (ADR-0003 append-only; recoverable
  // via history, orphaned tombstones don't project), then drop the object. Exhibit → clear its annotation
  // log, then drop it; the LAST exhibit leaves a truly-empty library (no DEFAULT_EXHIBITS reseed). ---
  // Tombstone an object's notes (ADR-0003 append-only; recoverable via history) then drop it from meta. The
  // shared core: removeCurrentObject navigates afterwards; the overview pencil's removeObjectById stays put.
  async function deleteObjectNotesAndMeta(objId: string) {
    const cid = canvasIdOf(objId);
    for (const r of sess.session.notes().filter((n) => !n.deleted && srcOf(n.target) === cid)) sess.session.deleteNote(r.logicalId as LogicalId);
    bump();
    // Tag the incremental mirror BEFORE removeObject so the trigger it fires (via onAfterPersist) sees the
    // removal: rewrite the exhibit's manifest AND prune the object's orphaned tree files (spike-0002). The
    // removeObject reducer can't do this — only here do we still know the object's imported-asset name.
    const gone = OBJECTS.find((o) => o.id === objId);
    const assetName = gone && isAsset(gone.source) ? gone.source.slice(ASSET_PREFIX.length) : undefined;
    bnd.markObjectRemoved(currentSlug, objId, assetName);
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
    // ADR-0024 #2: Overview is mandatory at every object count, so a delete from the overview STAYS on the
    // overview (even down to one, or zero — the empty overview is the only place to re-add). Just keep the
    // (unmounted) editor cursor valid: if it pointed at the removed object, advance it to a survivor.
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
    if (isLoaded) assets.revokeAll();
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
    // Flag-ON (Archie-42f3): the committed array ALSO reconciles into the structure rev-log (the
    // appends are the source; the patch above is its snapshot). Inert when the flag is off.
    if (STRUCTURE_REVLOG) applyStructure(currentSlug, sections);
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
    if (STRUCTURE_REVLOG) applyStructure(pendingClear.slug, []); // the clear tombstones every section in the log too
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
    // rail-jump to the section's object. switchObject early-returns (no-op, INCLUDING skipping its own
    // focusSectionId reset) when already on that object — harmless here because the next line sets
    // focusSectionId unconditionally regardless of which branch switchObject took.
    switchObject(s.objectId);
    focusSectionId = sectionId; // set AFTER switchObject → drives the canvas focus fragment + the lit "active" card
  }
  // --- Spine deep link (Archie-696d, decision Archie-da38): each read-only overview spine row is a beat
  // link — "editor at the beat's object with the Narrative panel scrolled to that section". ADR-0024 #1
  // ("selected notes/panels/scroll are never in the URL") rules out a new URL rung for the section, so the
  // PLACE pushed is the ordinary editor place (unchanged grammar; browser back lands on the overview place
  // that's already in history — no special-casing needed). WHICH section to focus is transient screen state,
  // carried through the same focusSectionId channel the in-editor "Go to" card control already drives
  // (navigateToSection, above) — NarrativeEditor turns a focusSectionId change into scroll + a one-shot
  // highlight pulse. ExhibitOverview only renders a row as a link when the beat's object still exists
  // (degraded rows never call this), so the guard below is belt-and-suspenders against a stale click.
  function openBeat(sectionId: string) {
    const s = (currentExhibit?.sections ?? []).find((x) => x.id === sectionId);
    if (!s || !OBJECTS.some((o) => o.id === s.objectId)) return;
    editingObjectId = null;
    view = "editor";
    navigateToSection(sectionId);
  }
  // Which object of the exhibit the editor is showing. Switching resets transient view state. Declared here
  // (not with the other object state below) because canvasFocus reads it — svelte-check flags the TDZ (Issue 12).
  let currentObjectId = $state("o1");

  // --- Place navigation machinery (declared here — after currentObjectId, which currentPlace reads). ---
  // The current place is a pure function of the view triple. Reading ONLY view/slug/object means modals,
  // panels, selections and viewports can never leak into the URL (ADR-0024 #6, the "not a place" guarantee).
  const currentPlace = $derived<Place>(
    view === "library" ? LIBRARY
    : view === "overview" ? { kind: "overview", slug: currentSlug }
    : { kind: "editor", slug: currentSlug, objectId: currentObjectId },
  );
  // STATE → URL. Runs after any SETTLED place change and pushes a NEW history entry (ADR-0024 #3 — including
  // filmstrip object switches, which flow through currentObjectId). Suspended during multi-step transitions
  // and history replay; a hash-only URL keeps the /studio/ pathname, so this is base-path/static-host safe.
  function syncUrl() {
    if (!navReady || navSyncSuspendCount > 0) return;
    const url = serializePlace(currentPlace);
    if (url === committedUrl) return;
    committedUrl = url;
    history.pushState({ url }, "", url);
    rememberLastPlace(url);
    fallbackNotice = null; // any successful (push) navigation clears a stale degrade notice (N2)
  }
  $effect(() => { void currentPlace; syncUrl(); });
  // Desktop-only: remember the last place so a relaunch (no address bar) can restore it (ADR-0024 #5).
  function rememberLastPlace(url: string) {
    if (!isTauri()) return;
    try { localStorage.setItem(LAST_PLACE_KEY, url); } catch { /* best-effort — private mode just won't restore */ }
  }
  // Best-effort session memory for the overview's transient look (ADR-0024 #6): snapshot the tableau
  // pan-zoom under the current slug whenever it changes while the overview is showing.
  function restoreOverviewScreen(slug: string) {
    const s = overviewScreens.get(slug);
    ovTx = s?.tx ?? 0; ovTy = s?.ty ?? 0; ovZ = s?.z ?? 1;
  }
  $effect(() => {
    // Skip while a transition is in flight (navSyncSuspendCount > 0): during openExhibit, currentSlug
    // moves to the NEW slug synchronously while view is still "overview" and ovTx/ovTy/ovZ still hold the
    // OUTGOING exhibit's pan-zoom — an unguarded write would stamp A's transform under B's slug (N1). Once
    // settled, restoreOverviewScreen has loaded the right values and the count is 0, so this snapshots B.
    if (view !== "overview" || navSyncSuspendCount > 0) return;
    overviewScreens.set(currentSlug, { tx: ovTx, ty: ovTy, z: ovZ });
  });

  // URL → STATE. Apply a place to the view, degrading an unresolvable one to its nearest surviving ancestor
  // (ADR-0024 #4) and naming what was missing. Suspends the sync effect for the whole transition, then does
  // its OWN history bookkeeping: push a fresh entry, replace the bar in place (boot + a degrade correction),
  // or stay silent (a back/forward we're only reflecting).
  async function applyPlace(target: Place, history_: "push" | "replace" | "silent") {
    const res = resolvePlace(target, librarySnapshot(lib.meta.exhibits));
    fallbackNotice = noticeFor(res.missing);
    // Commit the URL + guard SYNCHRONOUSLY, before the first await (B1). A single back/forward fires
    // popstate AND hashchange back-to-back; the second handler runs after this function's synchronous
    // prefix (JS is single-threaded, and gotoPlace's await is below). If committedUrl were only updated
    // after that await, the second event would see a stale guard and start a CONCURRENT applyPlace
    // (double backToLibrary/save/revoke, a second openExhibit flushing mid-open). Updating it here — and
    // doing the history op here — closes that window before we ever yield.
    const url = serializePlace(res.place);
    committedUrl = url;
    rememberLastPlace(url);
    const mode = history_ === "silent" && res.degraded ? "replace" : history_;
    if (mode === "push") history.pushState({ url }, "", url);
    else if (mode === "replace") history.replaceState({ url }, "", url);
    // Now move the view (async — session load). Suspended so intermediate cursor states don't re-push;
    // currentPlace settles on res.place, which already equals committedUrl, so the resumed effect no-ops.
    suspendSync();
    try { await gotoPlace(res.place); }
    finally { resumeSync(); }
  }
  // Move the view to a (already-resolved) place, reusing the real transitions so sessions load exactly as a
  // click would. currentSlug is only a cursor (see openObjectInExhibit), so re-open unless we're already
  // inside this exhibit at a non-library scale.
  async function gotoPlace(place: Place) {
    if (place.kind === "library") {
      if (view !== "library") await backToLibrary(); else view = "library";
      return;
    }
    if (view === "library" || currentSlug !== place.slug) await openExhibit(place.slug); // lands overview (#2)
    if (place.kind === "overview") enterOverview(place.slug);
    else openObject(place.objectId); // switchObject + view = editor
  }
  // The fallback strip copy (ADR-0024 #4): one plain sentence naming what wasn't found (WWWWH-first).
  function noticeFor(m: Missing | null): string | null {
    if (!m) return null;
    if (m.kind === "exhibit") return `That exhibit (“${m.slug}”) isn’t in this library anymore, so this is your library.`;
    const title = lib.meta.exhibits.find((e) => e.slug === m.slug)?.title ?? m.slug;
    return `That item isn’t in “${title}” anymore, so this is the exhibit.`;
  }
  // Back/forward AND a manually-typed hash both land here (popstate + hashchange). The committedUrl guard
  // dedupes the two events browsers fire together and ignores echoes of the place we already show.
  function onLocationChange() {
    const place = parsePlace(location.hash);
    if (serializePlace(place) === committedUrl) return;
    void applyPlace(place, "silent");
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
  }
  function addSectionFromNote(n: { objectId: string; start?: string; lead: string }) {
    const secs = currentExhibit?.sections ?? [];
    setSections([...secs, { id: newSectionId(), title: `Section ${secs.length + 1}`, objectId: n.objectId, ...(n.start ? { start: n.start } : {}), prose: n.lead }]);
  }

  // --- Docked note editor (Archie-b671): the WADM form is a STABLE right-edge element, not a floater. It
  // replaces both the marker-anchored popover AND the pinned inspector (their drag/pin machinery is gone).
  // The dock is layout, so nothing streams a marker screen-rect anymore; selecting a note or a canvas marker
  // populates it, Esc deselects (the existing Esc ladder), and its width is a persisted view preference. ---
  // Docked-editor width: a px OVERRIDE of the CSS clamp() default (null ⇒ default ~320px), persisted via
  // view-prefs (Archie-c7ef). Local $state mirrors the pref so ResizeDivider can bind it; oncommit writes back.
  let dockWidth = $state<number | null>(viewPrefs.dockWidth);

  // Resizable / collapsible sidebar (Phase-2 expandability). `asideWidth` is a px OVERRIDE
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

  // The editor sidebar is now two labeled, always-visible SCOPE ZONES (Archie-5e96) — an "Exhibit" zone
  // (the narrative spine) above a "This object" zone (readings, notes, detail). Sticky zone headers hold the
  // boundary while the object zone scrolls. The old exclusive Narrative/Notes accordion (openPanel /
  // togglePanel / openPanelTo) is retired: both scopes are present at once, so nothing to expand or reveal.

  // "Save" on the note editor: commit any uncommitted comment text (edits already autosave live, but a click
  // might not have blurred the textarea first), then deselect → the dock returns to its empty state.
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

  // --- Overview multi-select (SCALE-GALLERY Phase 2). Selection lives HERE, not in ExhibitOverview: bulk
  // delete rides App's removal path, ⌘A/Delete/Esc dispatch from onGlobalKey, and a future bulk-move is
  // library-scope — all need selection reachable above the one component. The math is the pure
  // overview-selection reducer; ExhibitOverview emits intents (onselect/onmarquee/onclear) + the drag block.
  let selection = $state<Set<string>>(new Set());
  let selAnchor = $state<string | null>(null);
  let selectMode = $state(false); // App-owned so the Esc ladder can exit it (§5) — the toolbar toggles it
  let bulkConfirming = $state(false); // armed second-click guard for bulk delete (inline, on-brand — DetailsEditor idiom)
  // The VISIBLE object order (filtered/sorted) as ExhibitOverview renders it — reported up via onvisible.
  // Shift-range + ⌘A run over THIS, not the canonical array, so they never touch objects hidden by the
  // active filter (canonical ranging would silently select filtered-out items a bulk delete then removes
  // unseen). Falls back to canonical before the overview has reported (e.g. select-all with no toolbar use).
  let visibleIds = $state<string[]>([]);
  const rangeIds = () => (visibleIds.length ? visibleIds : OBJECTS.map((o) => o.id));
  function clearSel() { selection = new Set(); selAnchor = null; bulkConfirming = false; }
  function onOverviewSelect(id: string, mods: ClickMods) {
    bulkConfirming = false; // changing the selection disarms a pending bulk delete
    const r = applyClick({ selection, anchor: selAnchor }, id, mods, rangeIds());
    selection = r.selection; selAnchor = r.anchor;
  }
  function onOverviewMarquee(ids: string[]) {
    bulkConfirming = false;
    const r = applyMarquee(ids);
    selection = r.selection; selAnchor = r.anchor;
  }
  function selectAllObjects() {
    bulkConfirming = false;
    const r = selectAllIds(rangeIds()); // all VISIBLE when filtered; the full set when not
    selection = r.selection; selAnchor = r.anchor;
  }
  // Bulk delete — ONE persist + ONE mirror (spike-0002 dirty-set coalesces N removedObjects). Mirrors
  // deleteObjectNotesAndMeta per id (tombstone notes + markObjectRemoved for orphan cleanup) BUT batches
  // the meta mutation into the single lib.removeObjects call, instead of N awaited removeObject writes.
  async function bulkRemove(ids: ReadonlySet<string>) {
    // Canonical order, NOT rangeIds(): a delete must honor the whole selection even when a live
    // search filter hides some selected plates — visible-order here would silently skip them.
    const present = OBJECTS.map((o) => o.id);
    const list = present.filter((id) => ids.has(id)); // canonical order, only ids still in the exhibit
    if (list.length === 0) { clearSel(); return; }
    for (const objId of list) {
      const cid = canvasIdOf(objId);
      for (const r of sess.session.notes().filter((n) => !n.deleted && srcOf(n.target) === cid)) sess.session.deleteNote(r.logicalId as LogicalId);
      const gone = OBJECTS.find((o) => o.id === objId);
      const assetName = gone && isAsset(gone.source) ? gone.source.slice(ASSET_PREFIX.length) : undefined;
      bnd.markObjectRemoved(currentSlug, objId, assetName); // per-id orphan cleanup (asset name known only here)
    }
    bump();
    await lib.removeObjects(currentSlug, list); // single persist → single onAfterPersist mirror
    clearSel(); selectMode = false;
    // ADR-0024 #2 (mirror removeObjectById): bulk delete from the overview STAYS on the overview at any
    // object count; just keep the (unmounted) editor cursor valid if the open object was among the deleted.
    if (list.includes(currentObjectId)) { const surv = OBJECTS.find((o) => !list.includes(o.id)); if (surv) switchObject(surv.id); }
  }
  // Two-step inline confirm (DetailsEditor idiom — no window.confirm, off-brand for the study): first call
  // arms (the toolbar button morphs to the guard); second commits. Keyboard Delete + the button share this.
  function requestBulkDelete() {
    if (selection.size === 0) return;
    if (!bulkConfirming) { bulkConfirming = true; return; }
    bulkConfirming = false;
    void bulkRemove(selection);
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
    // setMeta bypasses onDirty (bulk rebuild) — tag the copy for the incremental mirror ourselves: a
    // brand-new exhibit has no prior manifest to recover from, so its byte passes must run (spike-0002).
    bnd.markAssetsDirty(slug);
    // Re-create the current head notes against the copy's canvas IRIs (fresh records — it's new content).
    const fromBase = `${BASE}${from}/canvas/`, toBase = `${BASE}${slug}/canvas/`;
    const carried = sess.session.notes().filter((r) => !r.deleted).map((r) => {
      const src = srcOf(r.target);
      const target = src && src.startsWith(fromBase) && typeof r.target !== "string"
        ? { ...(r.target as object), source: toBase + src.slice(fromBase.length) } : r.target;
      // Carry EVERY authored note attribute onto the copy (a faithful copy). `layers` was migrated into
      // body tags (migrate.ts foldLayersIntoTags) and rides `body`; emphasis/wholeObject/geo are real
      // AnnotationRecord fields the copy silently dropped (added post-copy-path: ADR-0015 geo, ADR-0018
      // wholeObject, §1489 emphasis) — a field omission `tsc` can't see, surfaced by the vestigial
      // `layers` type error (ISSUES.md Issue 12).
      return { target, body: r.body, motivation: r.motivation, reading: r.reading, emphasis: r.emphasis, wholeObject: r.wholeObject, geo: r.geo };
    });
    await lib.persist();
    await openExhibit(slug); // not a template → persists; seeds empty
    for (const c of carried) sess.session.createNote({ target: c.target, ...(c.body !== undefined ? { body: c.body } : {}), ...(c.motivation !== undefined ? { motivation: c.motivation } : {}), ...(c.reading !== undefined ? { reading: c.reading } : {}), ...(c.emphasis !== undefined ? { emphasis: c.emphasis } : {}), ...(c.wholeObject !== undefined ? { wholeObject: c.wholeObject } : {}), ...(c.geo !== undefined ? { geo: c.geo } : {}) });
    rev += 1;
    await save();
    keeping = false;
  }
  // Create a new exhibit (no objects yet — add them in the editor), persist, and open it.
  async function newExhibit(title: string) {
    const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exhibit";
    // "sample" is RESERVED (Issue 19e): openExhibitAnnotationsDir special-cases that slug to the LEGACY
    // top-level {project}/annotations/ dir (the pre-multi-exhibit SAMPLE_SLUG path), so a user exhibit
    // slugged "sample" would silently alias any legacy data there. Skip it like a taken slug → "sample-2".
    let slug = base, n = 2;
    while (slug === "sample" || lib.meta.exhibits.some((e) => e.slug === slug)) slug = `${base}-${n++}`;
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

  // --- add media to the current exhibit (Archie-56cf: one scoped chooser) ---
  // The overview Add-media plate + the editor "+ Add media" button both open the SAME CreateExhibitDialog
  // in add-to-exhibit scope (folder / IIIF / Map paths). This flag backs that dialog's open chrome; the
  // ingest FLOWS it routes to (addFiles / addManifestToExhibit / addMapObject) live in ingest-flows.ts.
  let addMediaOpen = $state(false);
  // Import feedback (AV ingest/upload UX): a large recording can take a beat to land in OPFS, so show
  // which file is importing; `importNote` carries a transient curator-voice message (unsupported file,
  // or a gentle link-by-URL nudge for very large media). Cleared at the start of each new import.
  let importStatus = $state<{ name: string; index: number; total: number } | null>(null);
  let importNote = $state("");
  // Drag-and-drop onto the canvas area → the ingest flows' addFiles.
  let dragOver = $state(false);
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    // SILENCE row 2 (tend Issue 4): addFiles had no .catch() anywhere in its call chain, so an OPFS
    // write failure (e.g. quota) was an unhandled rejection — invisible, unlike every sibling ingest path.
    flows.addFiles(e.dataTransfer?.files ?? null).catch((err) => { console.error("File add failed", err); window.alert("Couldn't add that file."); });
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
  // When set, the NEXT drawn box/outline re-targets THIS note (Scope control's "Draw a region" / "Redraw
  // bounds", ADR-0018) instead of creating a new note. Cleared after the draw. null = ordinary create.
  let retargetingNoteId = $state<string | null>(null);
  // Coordinate-free CSV imports (Archie-79c0 sub-cycle B): notes whose TEXT arrived without a region,
  // staged exhibit-scoped (persisted via the pending-notes sidecar) until the author draws each box.
  // `placingPendingId` arms that draw — geometry comes from onCreate, exactly like narrative framing.
  let pendingNotes = $state<PendingNote[]>([]);
  let placingPendingId = $state<string | null>(null);
  const drawArmed = $derived(creating !== null || framingSectionId !== null || placingPendingId !== null); // canvas in draw mode while any gesture is live
  const drawShape = $derived<DrawTool>(creating ?? "rectangle"); // framing always frames a box
  // P-2 (archie-ux Q-2): reading DISPLAY state — visible SET + active pen, never conflated.
  // The subordinate Readings panel in the sidebar's "This object" zone is the one home (Archie-b671);
  // the floating canvas rail and the old dropdown are both retired.
  const rdg = createReadingState();
  $effect(() => { rdg.reconcile(currentReadings); });
  // The unified Readings modal: name+colour+description in ONE place, the concept explained in its
  // header. Replaces the ADR-0007 first-add gate (ReadingHelp + localStorage flag) — the teaching
  // copy lives permanently in the modal, so there's nothing to remember or re-nag about.
  let readingsOpen = $state(false);
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
  // The image URL the Canvas mounts: imported (/assets) objects resolve to their on-demand master blob;
  // non-asset (IIIF/remote) objects use their source directly (the `assets` store owns the distinction).
  const currentSource = $derived(assets.canvasSource(currentSlug, current));
  // Mint the CURRENT object's master ON DEMAND (Phase 1.2). Thumbs are resolved eagerly for the whole
  // exhibit at open; the full-res master (canvas/OSD source) is read only for the object in view, and
  // re-read on object/exhibit switch. ensureMaster id-guards so a rapid switch commits only the last mint.
  $effect(() => { void assets.ensureMaster(currentSlug, current); });
  // Resolved image URL for an object's rail thumbnail (asset → baked-thumb blob, or a master fallback for
  // a legacy no-thumb import; else a RENDERABLE derivative — a bare IIIF service base isn't an image, so
  // thumbnailUrl derives a sized JPEG; plain files pass through).
  const thumbSrc = (o: { id: string; source: string; tileSource?: TileSourceDescriptor }): string => (
    o.tileSource ? thumbnailUrl(o.tileSource, 240) // a Map → its z0 world tile (thumbnailUrl handles the descriptor)
    : isAsset(o.source) ? assets.thumbFor(o.id) : thumbnailUrl(o.source, 240)
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
  // Keep the ACTIVE rail tile on screen at scale: narrative jumps, [ / ] stepping, and wall click-through
  // all move currentObjectId without a rail click, and at 100+ objects the tile is usually off-screen.
  // $effect runs post-DOM-update, so .obj.on is already the new tile.
  let railEl = $state<HTMLElement | null>(null);
  $effect(() => {
    void currentObjectId;
    railEl?.querySelector(".obj.on")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });
  const currentObjectIndex = $derived(OBJECTS.findIndex((o) => o.id === currentObjectId));
  // --- pending notes (coordinate-free imports → "Set area" placement; Archie-79c0 sub-cycle B) ---
  const objectLabelOf = (id: string) => OBJECTS.find((o) => o.id === id)?.label ?? id;
  const newPendingId = () => `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  // Persist the current exhibit's pending list into the slug-keyed sidecar (whole-map I/O; single writer).
  // Routed through the save queue (SILENCE row 1, tend Issue 4): a direct OPFS write here had no catch
  // anywhere in its call chain, so a quota/permission failure was an unhandled rejection — invisible.
  async function persistPending() {
    const map = await loadPendingNotes();
    if (pendingNotes.length) map[currentSlug] = [...pendingNotes]; else delete map[currentSlug];
    await enqueueSave("pending-notes", "Pending notes", () => savePendingNotes(map));
  }
  // IngestContext hook: stage coordinate-free CSV rows, deduped by (object, comment). Returns the NEW count.
  function addPendingNotes(incoming: CsvPendingNote[]): number {
    const key = (p: { objectId: string; comment: string }) => `${p.objectId}\0${p.comment}`;
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
    // The "To place" group lives inside the always-visible Notes zone now; it simply disappears at 0.
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
  // ADR-0024 #2: Overview is mandatory for every exhibit (the single-object skip is gone), so the editor
  // always sits one explicit step below an Overview — the back affordance and the Esc ladder are
  // unconditional (`← Overview`, editor→overview→library). `hasOverview` is retired.
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

  // A W3C annotation target is `W3CTarget | W3CTarget[]`; Archie authors ONE target per note, so
  // normalize to the single target wherever a single is required (createNote/editNote/geoForTarget).
  const oneTarget = <T,>(t: T | T[]): T => (Array.isArray(t) ? (t[0] as T) : t);
  // Notes + working annotations are scoped to the CURRENT object's canvas (then the layer filter).
  // `void rev;` registers the revision counter as a reactive dep (bumped on every log write) without the
  // bare-comma idiom svelte-check flags as an unused expression.
  // Hide-by-ancestry (Archie-42f3, flag-on only): notes attributed to a TOMBSTONED section are
  // filtered from the working surfaces at data level (spine/visibility.ts hiddenNoteIds). Flag off
  // ⇒ structure.hiddenIds returns the constant empty set and both filters are identity.
  const hiddenByStructure = $derived.by<ReadonlySet<string>>(() => { void rev; return structure.hiddenIds(currentSlug, sess.session.entries); });
  // Sections with plural heads (unresolved concurrent edits) — gates the NarrativeEditor's edit
  // affordances (merge contract C4). Empty set whenever the flag is off.
  const conflictedSectionIds = $derived<ReadonlySet<string>>(structure.conflictedLocalIds(currentSlug));
  const allNotes = $derived.by(() => { void rev; return sess.session.notes().filter((r) => !hiddenByStructure.has(r.logicalId)); });
  const objNotes = $derived(allNotes.filter((r) => srcOf(r.target) === canvasId));
  const notes = $derived(
    objNotes.filter((r) => rdg.noteVisible(r)), // visibility = the reading-state set (canvas + margin share it)
  );
  const objAnnotations = $derived.by<W3CAnnotation[]>(() => { void rev; return sess.session.workingAnnotations().filter((a) => srcOf(a.target) === canvasId && !hiddenByStructure.has(a.id)); });
  // O(1) marker lookup for the live styler: Annotorious calls styleOf per marker on every restyle
  // (hover / solo / reading toggle), so a per-call array scan was O(n²) across the canvas. Rebuilt only
  // when the working-annotation set changes.
  const annById = $derived(new Map(objAnnotations.map((a) => [a.id, a] as const)));
  const annotations = $derived<W3CAnnotation[]>(
    objAnnotations.filter((a) => rdg.isVisible(((a as unknown as Record<string, unknown>)["archie:reading"] as string | undefined) ?? "base")),
  );
  const sel = $derived(notes.find((r) => r.logicalId === editing));
  // Note count per canvas, built ONCE per allNotes change — the overview/library lists call this per
  // object, so the old per-call filter was O(objects × notes) on every `rev` bump. O(1) lookup now.
  const noteCountByCanvas = $derived.by(() => {
    const m = new Map<string, number>();
    for (const r of allNotes) { const c = srcOf(r.target); if (c === undefined) continue; m.set(c, (m.get(c) ?? 0) + 1); }
    return m;
  });
  const noteCountOf = (objId: string) => noteCountByCanvas.get(canvasIdOf(objId)) ?? 0;
  // Recency per canvas for the overview's "recently-annotated" sort (Phase 2) — MAX modifiedAt over the
  // object's notes, built ONCE per allNotes change (same shape as noteCountByCanvas). modifiedAt is an ISO
  // string, so lexicographic MAX = chronological MAX; "" (no notes) sorts oldest. Exhibit-scoped, which is
  // exactly the overview's scope (the session holds one exhibit's log).
  const lastAnnotatedByCanvas = $derived.by(() => {
    const m = new Map<string, string>();
    for (const r of allNotes) { const c = srcOf(r.target); if (c === undefined) continue; const t = r.modifiedAt ?? ""; const cur = m.get(c); if (cur === undefined || t > cur) m.set(c, t); }
    return m;
  });
  const lastAnnotatedOf = (objId: string) => lastAnnotatedByCanvas.get(canvasIdOf(objId)) ?? "";
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
    const rid = (a as unknown as Record<string, unknown>)["archie:reading"] as string | undefined;
    const colour = (rid ? currentReadings.find((r) => r.id === rid)?.colour : undefined) ?? BASE_MARKER;
    // ONE style source for both apps (render-core readingMarkerStyle) carrying the comparing
    // regime (archie-ux Q-2): 2+ readings visible → outline-only; solo-on-hover restores a fill.
    return readingMarkerStyle(colour, emphasisOf(a), {
      comparing: rdg.comparing(currentReadings),
      soloed: soloReading !== null && (rid ?? "base") === soloReading,
      highlighted: hoverNote === id, // the hovered list note's mark is momentarily the brightest thing
    });
  }

  // Whole-object frame for the STUDIO canvas (ADR-0018): the first note that frames the WHOLE object —
  // a bare-IRI note (no selector) or a ≥75%/override region note. Mirrors the viewer's ExhibitView.frameFor
  // so a created/converted whole-object note is VISIBLE while authoring (it has no marker of its own). AV
  // objects have no OSD canvas, so no frame there (their whole-track band lives in the viewer's MediaPlayer).
  const frameMark = $derived.by<{ markId: string; colour: string } | null>(() => {
    if (isAvCurrent) return null;
    const w = current?.width, h = current?.height;
    for (const a of annotations) {
      if (!a.id) continue;
      if (isWholeObjectFor(selectorOf(a), w ?? 0, h ?? 0, wholeObjectFlagOf(a))) {
        const rid = (a as unknown as Record<string, unknown>)["archie:reading"] as string | undefined;
        const colour = (rid ? currentReadings.find((r) => r.id === rid)?.colour : undefined) ?? BASE_MARKER;
        return { markId: a.id, colour };
      }
    }
    return null;
  });
  // The OSD frame overlay; its corners activate (select) the framed note, like a marker click.
  const studioFrame = $derived<FrameOverlay | null>(
    frameMark ? { colour: frameMark.colour, onActivate: () => (selected = frameMark.markId) } : null,
  );
  // Drop the framed note's own rect from the canvas array (a ≥75% region note would otherwise draw rect +
  // frame); a bare-IRI whole-object note has no rect, so this is a no-op for the common case.
  const canvasAnnotations = $derived(frameMark ? annotations.filter((a) => a.id !== frameMark!.markId) : annotations);

  // Co-located notes — a "stack" of notes whose hitboxes overlap so much you can't separate them by
  // clicking the canvas (e.g. the cipher/hoax/abjad reading notes share one region). The note editor cycles
  // through them so every note at a spot is reachable. Overlap = bbox IoU ≥ 0.5 on the SAME object.
  type Bx = { x: number; y: number; w: number; h: number };
  const bboxOf = (t: unknown): Bx | null => { const s = selectorOf({ target: t }); return s ? selectorBBox(s) : null; };
  const bboxIoU = (a: Bx, b: Bx): number => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const inter = ix * iy, uni = a.w * a.h + b.w * b.h - inter;
    return uni > 0 ? inter / uni : 0;
  };
  const coLocated = $derived.by<AnnotationRecord[]>(() => {
    if (!sel) return [];
    const sb = bboxOf(sel.target);
    if (!sb) return []; // whole-object / no-region selected → no stack to step through
    return objNotes.filter((r) => { const b = bboxOf(r.target); return !!b && bboxIoU(sb, b) >= 0.5; });
  });
  const coLocatedIndex = $derived(coLocated.findIndex((r) => r.logicalId === editing));
  function cycleCoLocated(dir: 1 | -1) {
    if (coLocated.length < 2) return;
    const i = ((coLocatedIndex < 0 ? 0 : coLocatedIndex) + dir + coLocated.length) % coLocated.length;
    selected = coLocated[i]!.logicalId;
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
        const geo = isMapCurrent ? geoForTarget(oneTarget(a.target), currentTileSource?.kind === "xyz" ? currentTileSource : undefined) : undefined;
        const id = sess.session.createNote({
          target: oneTarget(a.target),
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
    // Re-target the OPEN note (ADR-0018): the Scope control's "Draw a region" (whole→region) and "Redraw
    // bounds" (replace a region's geometry) arm a draw that EDITS the open note's target instead of making a
    // new note. Only fires when explicitly armed (retargetingNoteId), so an ordinary draw still creates.
    if (retargetingNoteId) {
      const cgeo = isMapCurrent ? geoForTarget(oneTarget(a.target), currentTileSource?.kind === "xyz" ? currentTileSource : undefined) ?? null : undefined;
      sess.session.editNote(retargetingNoteId as LogicalId, { target: oneTarget(a.target), ...(cgeo !== undefined ? { geo: cgeo } : {}) });
      bump();
      retargetingNoteId = null;
      creating = null;
      return;
    }
    // On a Map, capture the region's geo-truth (lng/lat) alongside the pixel selector (Q4/ADR-0015).
    const geo = isMapCurrent ? geoForTarget(oneTarget(a.target), currentTileSource?.kind === "xyz" ? currentTileSource : undefined) : undefined;
    const id = sess.session.createNote({ target: oneTarget(a.target), ...(geo ? { geo } : {}), ...(rdg.newNoteReading() !== undefined ? { reading: rdg.newNoteReading()! } : {}) }); // the PEN, never visibility (Q1)
    bump();
    selected = id;
    creating = null; // the gesture produced its note; disarm back to ambient selection (ADR-0011)
  }
  // Is the open note a region note (has a spatial/temporal selector)? Drives the note-form Scope control.
  const selHasSelector = (r: AnnotationRecord | undefined): boolean =>
    !!r && typeof r.target !== "string" && (r.target as { selector?: unknown }).selector != null;
  // Whole-object (Object-level) Note — a BARE canvas IRI target, no selector (ADR-0018). The toolbar toggle
  // CREATES one (there's no region to draw). CONVERTING an existing note is a separate, EXPLICIT affordance
  // in the note's own form (`setNoteScope`) — not an overload of this create button.
  function createWholeObjectNote() {
    const id = sess.session.createNote({ target: canvasId, ...(rdg.newNoteReading() !== undefined ? { reading: rdg.newNoteReading()! } : {}) });
    bump();
    selected = id;
    creating = null;
  }
  // Change the OPEN note's scope (ADR-0018) — the explicit conversion affordance, surfaced in the note form
  // beside the note it acts on. "whole" drops the selector → bare IRI (clearing any geo); "region" arms a box
  // so the next draw gives the note geometry (onCreate's whole→region branch performs the edit). Both are
  // versioned `target` edits, reversible.
  function setNoteScope(scope: "whole" | "region") {
    if (!editing) return;
    if (scope === "whole") {
      if (!selHasSelector(sel)) return; // already whole-object — no-op
      sess.session.editNote(editing as LogicalId, { target: srcOf(sel!.target) ?? canvasId, ...(isMapCurrent ? { geo: null } : {}) });
      bump();
    } else {
      // "Draw a region" (whole→region) OR "Redraw bounds" (replace a region): arm a draw that re-targets
      // THIS note. Default to a box; the toolbar can switch to Outline before drawing (retarget persists).
      retargetingNoteId = editing;
      creating = "rectangle";
    }
  }
  // Geometry edit on canvas → re-derive geo-truth on a Map (null clears it if the new shape is unparseable).
  const onUpdate = (a: W3CAnnotation) => { sess.session.editNote(a.id as LogicalId, { target: oneTarget(a.target), ...(isMapCurrent ? { geo: geoForTarget(oneTarget(a.target), currentTileSource?.kind === "xyz" ? currentTileSource : undefined) ?? null } : {}) }); bump(); };
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
  }
  // Import a WebVTT/SRT transcript for the current AV object → supplementing time notes. APPEND-ONLY
  // (archie-av Q-1, advisor): each cue becomes a new note even if it overlaps existing ones — no
  // destructive replace, no heuristic merge. Format-agnostic (importTranscript's parser handles both).
  function onImportTranscript(text: string) {
    const cued = importTranscript([], text, { source: canvasId, lastEditor: author });
    let n = 0;
    for (const r of cued) { sess.session.createNote({ target: r.target, ...(r.body !== undefined ? { body: r.body } : {}), ...(r.motivation !== undefined ? { motivation: r.motivation } : {}) }); n++; }
    if (n > 0) {
      bump();
      importNote = `Added ${n} note${n === 1 ? "" : "s"} from your captions.`;
    } else {
      // parseCues found no `-->` cue lines — a malformed file or the wrong format entirely. Without
      // this, an unparseable .vtt/.srt gave zero feedback: no alert, no toast (tend Issue 7, NEGSPACE
      // row 1/2) — the user couldn't tell the import from a no-op success.
      importNote = "That file didn't have any usable captions — check it's a valid .vtt or .srt file.";
    }
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
  interface CmdEntry { id: string; kind: "note" | "exhibit" | "object"; exhibitSlug: string; exhibitTitle: string; label: string; ref: string; thumb?: string; }
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
      // Thumbnails feed the picker's Browse (tile) view — the cite-by-image path (Archie-5968). Resolve
      // them for the CURRENT exhibit only — thumbSrc works against the live OBJECTS there; cross-exhibit
      // objects stay text-only in Browse (no thumb), so image-citing is scoped to this exhibit's media.
      const isCur = ex.slug === currentSlug;
      const objThumb = (objId: string): string => {
        if (!isCur || !objId) return "";
        const obj = OBJECTS.find((o) => o.id === objId);
        return obj ? thumbSrc(obj) : "";
      };
      out.push({ id: `ex:${ex.slug}`, kind: "exhibit", exhibitSlug: ex.slug, exhibitTitle: ex.title, label: linkLabel(ex.title), ref: encodeLinkRef({ exhibitSlug: ex.slug }), thumb: isCur && OBJECTS[0] ? thumbSrc(OBJECTS[0]) : "" });
      // Whole-Object cites (ADR-0018) — each object is a Browse tile and a Search row ("cite this folio").
      for (const obj of ex.objects ?? []) {
        out.push({ id: `o:${ex.slug}:${obj.id}`, kind: "object", exhibitSlug: ex.slug, exhibitTitle: ex.title, label: linkLabel(obj.label ?? obj.id), ref: encodeLinkRef({ exhibitSlug: ex.slug, objectId: obj.id }), thumb: objThumb(obj.id) });
      }
      const heads = new Map<string, AnnotationRecord>();
      for (const r of logsById[ex.id] ?? []) heads.set(r.logicalId, r); // append-only → last wins
      for (const r of heads.values()) {
        if (r.deleted) continue;
        const objId = (srcOf(r.target) ?? "").split("/canvas/")[1] ?? "";
        out.push({ id: `n:${ex.slug}:${r.logicalId}`, kind: "note", exhibitSlug: ex.slug, exhibitTitle: ex.title, label: linkLabel(stripMarkdown(commentOf(r))), ref: encodeLinkRef({ exhibitSlug: ex.slug, noteLogicalId: r.logicalId }), thumb: objThumb(objId) });
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
  // Cite-by-image is CmdK's internal Browse tab now (Archie-5968): the palette's `entries` already carry
  // per-note thumbnails (buildCmdEntries), so the eyes-first path is one view of the one surface — no
  // separate MediaPicker surface, no second `pendingCiteInsert` door. (The old requestVisualCite was
  // already unreachable; its removal completes "MediaPicker becomes the image tab inside CmdK".)
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
  let tutorialOpen = $state(false); // the onboarding tutorial modal (embeds the learn decks)
  // Global + image-editor keyboard shortcuts (registry-driven; AV shortcuts live in AvEditor, palette in CmdK).
  function onGlobalKey(e: KeyboardEvent) {
    // ? opens the shortcuts cheat-sheet when NOTHING is scrimmed (not while typing). When ShortcutsHelp IS
    // the open scrim, ? also closes it (the sheet's own toggle, handled in the gate); while any OTHER scrim
    // is open, ? is swallowed by the gate below like every shortcut — it never silently replaces that surface.
    if (matches(e, "?") && !typingInField(e) && !modality.hasScrim) { e.preventDefault(); helpOpen = true; return; }
    // A scrimmed surface owns the keyboard while open (single-scrim, focus-trapped, CONTEXT.md → Surfaces):
    // route Esc through the shared ladder and swallow every OTHER global shortcut so none leaks to the page
    // behind the scrim — but let ordinary typing reach the surface's own fields (no preventDefault there).
    // ⌘S is the ONE deliberate exception: SafetyState's own window listener still flushes while a scrim is
    // open (it preventDefaults the browser Save dialog; autosave makes the flush lossless — CONTEXT.md
    // Persistence). (Archie-5968; this one gate replaces the old scattered `if (cmdkOpen) return` cases.)
    if (modality.hasScrim) {
      if (matches(e, "Esc")) { e.preventDefault(); modality.handleEsc(); }
      else if (matches(e, "?") && helpOpen && !typingInField(e)) { e.preventDefault(); helpOpen = false; } // ? closes the shortcuts sheet
      return;
    }
    // No scrim, but a floater (e.g. the help menu) is open: Esc closes it first — the ladder's top rung.
    if (matches(e, "Esc") && modality.hasFloater) { e.preventDefault(); modality.handleEsc(); return; }
    // ADR-0024 #5: the Tauri webview has no browser chrome, so wire Alt+←/→ to its history (the web target
    // already has the browser's own back/forward + Alt+Arrow). NOT while a field is focused — Option+arrow
    // is word-navigation inside macOS text inputs, so stealing it there would break typing (N3).
    if (isTauri() && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !typingInField(e)) {
      e.preventDefault();
      if (e.key === "ArrowLeft") history.back(); else history.forward();
      return;
    }
    // ⌘K — cite into the note being edited (works inside the textarea too). With nothing selected, give a
    // hint instead of a silent no-op (shortcuts.ts advertises ⌘K; the dead-key was a dogfood gap).
    if (matches(e, "⌘K") && view === "editor") {
      e.preventDefault();
      if (sel) void requestCite(citeIntoComment);
      else importNote = "Open a note first — then ⌘K cites another note or exhibit into it.";
      return;
    }
    // Overview organizing (Phase 2): select-all + bulk delete, only at the overview scale and not while
    // typing in the toolbar search. ⌘A must preventDefault or the browser selects the whole page's text.
    if (matches(e, "⌘A") && view === "overview" && !typingInField(e)) { e.preventDefault(); selectAllObjects(); return; }
    if (matches(e, "⌫") && view === "overview" && !typingInField(e) && selection.size > 0) { e.preventDefault(); requestBulkDelete(); return; }
    // Esc page-level ladder (only reached with NO scrimmed surface open — the modality gate above returns
    // first): disarm a new-note gesture → camera framing → pending placement → SELECTION → select-mode →
    // overview → library.
    if (matches(e, "Esc")) {
      if (creating) { e.preventDefault(); creating = null; return; } // disarm a new-note gesture first
      if (framingSectionId) { e.preventDefault(); cancelFraming(); return; }
      if (placingPendingId) { e.preventDefault(); cancelPlacing(); return; } // disarm a pending-note placement
      if (sel) { e.preventDefault(); selected = null; editing = null; return; }
      // Phase 2 rungs — clear a selection first, then leave select-mode, BEFORE backing out of the overview.
      if (view === "overview" && selection.size > 0) { e.preventDefault(); clearSel(); return; }
      if (view === "overview" && selectMode) { e.preventDefault(); selectMode = false; return; }
      if (view === "editor") { e.preventDefault(); void backToOverview(); return; }
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
    seedMaster: (slug, id, url) => assets.seedMaster(slug, id, url),
    setPlate: (id, url) => assets.setPlate(id, url),
    setCurrentObjectId: (id) => { currentObjectId = id; },
    setImportStatus: (s) => { importStatus = s; },
    setImportNote: (s) => { importNote = s; },
    addPendingNotes,
    // The inline add-media form + standalone map modal these three drove are retired (Archie-56cf): the
    // scoped CreateExhibitDialog owns its own open state and closes itself on submit, so these post-add
    // "close the add chrome" hooks are now no-ops kept only to satisfy the IngestContext contract.
    setAddingObject: () => {},
    clearAddForm: () => {},
    setMapModalOpen: () => {},
    setCollabNote: (s) => { collabNote = s; },
    canvasIdOf,
    switchObject,
    toEditor: () => { view = "editor"; },
    newExhibit,
    openExhibit,
    bump,
    cancelPendingSave: () => sess.cancelPendingSave(),
    finishReplace: () => { currentSlug = lib.meta.exhibits[0]!.slug; view = "library"; pendingNotes = []; void enqueueSave("pending-notes", "Pending notes", () => savePendingNotes({})); }, // destructive replace wipes the old project's pending sidecar
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
  // Desktop "Publish to the web" seams (Task 13). `df` is the deploy-flows MODULE (sign-in / persist /
  // repo pre-flight / picker / Pages recheck — all token-in-only); `deploy` is the one-motion deploy over
  // the SAME site projection every sink uses (`pub.projectSiteFs`). Both load with the publish flows
  // (ensurePub) so their weight stays out of the startup bundle. `initialSession` is restored separately
  // at startup (onMount) — the publish machine reads it through a live getter once it lands, opening a
  // return visit straight on the one-click update.
  let df = $state<typeof import("./deploy/deploy-flows.svelte.js") | null>(null);
  let deploy = $state<ReturnType<typeof import("./deploy/deploy-flows.svelte.js").createDeployFlows> | null>(null);
  let initialSession = $state<import("./deploy/types.js").DeploySession | null>(null);
  // Stable id for the remembered deploy target: the Studio edits one library per project, so a single id
  // is correct. It needn't match the projected site's library id ("demo" from workingToLibrary) — this
  // only keys "where this Studio last deployed" in deploy-flows' rememberedTarget store.
  const DEPLOY_LIBRARY_ID = "archie-studio-library";
  const deployLibrary = $derived({ id: DEPLOY_LIBRARY_ID, title: lib.meta.title || PROJECT_TITLE });
  // The machine's platform seams, packaged only once the deploy flows have loaded (null before then, so
  // the <Publish> mount stays gated). rememberedTarget re-reads on recompute (a library switch).
  const deployProps = $derived(df && deploy ? {
    deviceFlowAvailable: df.deviceFlowAvailable,
    remembered: df.rememberedTarget(deployLibrary.id),
    signIn: df.signInWithGitHub,
    persistSession: df.persistSession,
    signOut: df.signOut,
    deployToPages: deploy.deployToPages,
    checkRepoExists: df.checkRepoExists,
    listRepos: df.listRepos,
    recheckPages: df.recheckPages,
  } : null);
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
    // The desktop deploy seams: the module (sign-in / repo helpers) + the one-motion deploy bound to the
    // library's SAME site projection (no duplicated tiling). Awaited here so the machine has them the
    // moment the dialog opens.
    const deployMod = await import("./deploy/deploy-flows.svelte.js");
    df = deployMod;
    deploy = deployMod.createDeployFlows({ library: deployLibrary, projectSite: () => created.projectSiteFs() });
    // Load the Publish surface UI now too (it renders under {#if pub} once ready).
    void import("./Publish.svelte").then((m) => { PublishComp = m.default; });
    return created;
  }
  // The binding store (worklist 0.3 cut 1): the three-configs state machine + its Save/Open/Close/
  // autosave flows live in binding-store.svelte.ts; its disk sinks lazy-load the publish flows on first use.
  const bnd = createBindingStore({
    flushExhibit: () => save(),
    writeToFolder: async (fs) => (await ensurePub()).writeToFolder(fs),
    downloadProjectZip: async () => (await ensurePub()).downloadProjectZip(),
    replaceProjectFrom: (loaded) => flows.replaceProjectFrom(loaded),
    zipName: () => zipNameFor(lib.meta.title || PROJECT_TITLE),
  });
  /** The capability-routed Open (folder on Chromium, else the zip file picker). */
  function openProject() { if (bnd.canFolder) void bnd.openProjectFolder(); else zipInputEl?.click(); }
  // ⌘S is owned by SafetyState now (Archie-c76d (a)): whichever SafetyState is mounted (library / overview /
  // editor headers — mutually exclusive views, so exactly one is ever live) runs the universal flush. The old
  // App-level onBindingKey ⌘S branch is deleted — it double-fired under a Saved flash and opened a picker.
</script>

<svelte:window onkeydown={onGlobalKey} />
<input bind:this={zipInputEl} type="file" accept=".zip,application/zip" style="display:none"
  onchange={(e) => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void openZipFile(f); el.value = ""; }} />

<div class="app">
{#if writerLock.otherTabActive && !writerLock.canWrite}
  <!-- Issue 22 single-writer: this tab is read-only because another tab holds the writer lock. Editing
       here won't save (the save-queue gate refuses it) until the user takes over. Reuses the amber
       banner styling (attention, not error). -->
  <div class="playground-banner" role="status">
    <span class="pg-tag">Read-only</span>
    <span class="pg-msg">This library is open in another tab that's editing it — changes here won't save, to protect that tab's work.</span>
    <button class="pg-keep" onclick={() => writerLock.takeOver()}>Take over editing</button>
  </div>
{/if}
{#if fallbackNotice}
  <!-- ADR-0024 #4: the place in the URL no longer resolved, so we degraded to its nearest surviving
       ancestor. Name what wasn't found so this isn't a silent redirect. Dismissible; reuses the
       collab-note info strip. Modals/drawers never trigger this — only unresolvable PLACES do. -->
  <div class="collab-note" role="status">
    <span class="cn-msg">{fallbackNotice}</span>
    <button type="button" class="cn-x" onclick={() => (fallbackNotice = null)} aria-label="Dismiss">✕</button>
  </div>
{/if}
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
    onopenobject={(slug, objId) => void openObjectInExhibit(slug, objId)}
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
    ontutorial={() => (tutorialOpen = true)}
    onshortcuts={() => (helpOpen = true)}
    bind:gallerySearch
  />
{:else if view === "overview" && currentExhibit}
  <div class="overview-stage">
    <!-- The one save UI (Archie-0b7b / Archie-c76d), threaded into the overview header's save slot as a
         snippet — the SAME SafetyState the editor + library mount, so ⌘S + the indicator are identical here. -->
    {#snippet overviewSafety()}
      <SafetyState sessDirty={sess.storeReady && sess.dirty} saveHealth={saveStatus.health}
        bindingKind={bnd.binding.kind} bindingDirty={bnd.dirty} bindingBusy={bnd.busy} bindingError={bnd.error}
        hasRealWork={safetyHasRealWork} onflush={() => void bnd.saveProject()} />
    {/snippet}
    <ExhibitOverview
      safety={overviewSafety}
      title={currentExhibit.title}
      layout={currentLayout}
      objects={OBJECTS}
      {noteCountOf}
      thumbFor={(o) => (o.mediaType && o.mediaType !== "image") ? "" : thumbSrc(o)}
      sections={currentExhibit.sections ?? []}
      onopenobject={openObject}
      onopenbeat={openBeat}
      oneditobject={(objId) => (editingObjectId = objId)}
      onaddobject={() => (addMediaOpen = true)}
      onback={backToLibrary}
      onreorder={reorderObjects}
      {lastAnnotatedOf}
      {selection}
      {selectMode}
      onselectmode={() => { selectMode = !selectMode; if (!selectMode) clearSel(); }}
      onselect={onOverviewSelect}
      onmarquee={onOverviewMarquee}
      onclear={clearSel}
      onbulkdelete={requestBulkDelete}
      {bulkConfirming}
      onvisible={(ids) => (visibleIds = ids)}
      bind:tx={ovTx}
      bind:ty={ovTy}
      bind:z={ovZ}
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
    <button class="exhibit-back" onclick={backToOverview}>← Overview</button>
    <!-- Breadcrumb: Exhibit › Object — surfaces the two scales (the spine lives at the exhibit level, notes
         at the object level; the crumb names where you are). -->
    <h1 class="wordmark">{currentExhibit?.title}</h1>{#if current}<span class="crumb">› {current.label}</span>{/if}<span class="sub">Studio</span>
    <span class="spacer"></span>
    <!-- ADR-0011: no persistent tool palette. Selection is ambient; drawing arms only from a CREATE act
         ("New note" in the notes pane, or narrative camera framing). -->
    <!-- The reading dropdown is RETIRED (archie-ux Q-2, grill Q3): the RAIL on the canvas is the
         one home for visibility + the pen; "Manage readings…" on the rail opens the modal. -->
    <!-- The layout-picker trigger is RETIRED (ADR-0016): the reading mode is an EMERGENT property of
         content (sections → narrative, >1 object → grid, else single), no longer an author choice. -->
    <!-- The one save UI (Archie-0b7b / Archie-c76d) — replaces the old savestate span + Save button. Inert
         text when Saved/Saving, the control itself when Action needed/Failed; owns ⌘S. sessDirty is passed
         explicitly (optional prop — silent under-report if omitted, save-reviewer contract). -->
    <SafetyState sessDirty={sess.storeReady && sess.dirty} saveHealth={saveStatus.health}
      bindingKind={bnd.binding.kind} bindingDirty={bnd.dirty} bindingBusy={bnd.busy} bindingError={bnd.error}
      hasRealWork={safetyHasRealWork} onflush={() => void bnd.saveProject()} />
    <button class="publish-signal" onclick={() => void ensurePub().then((p) => p.openMenu())}>Publish & share…</button>
    <HelpMenu ontutorial={() => (tutorialOpen = true)} onshortcuts={() => (helpOpen = true)} />
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

  <!-- Filmstrip rail (Archie-5e96) — NAVIGATION ONLY now: pick which object to annotate. The +Media/+Map
       adders left for the EXHIBIT-zone header (adding media is an exhibit action); the mode/toast
       banners left for the status strip below. A collapse control shrinks the rail to a slim strip; its
       collapsed state is a persisted view preference (Archie-c7ef), default EXPANDED (Archie-b671).
       Horizontal overflow scrolls; a vertical wheel maps onto it. -->
  <div class="rail-region" class:collapsed={viewPrefs.railCollapsed}>
    <button type="button" class="rail-collapse" onclick={() => viewPrefs.setRailCollapsed(!viewPrefs.railCollapsed)}
      aria-label={viewPrefs.railCollapsed ? "Expand the object filmstrip" : "Collapse the object filmstrip"}
      title={viewPrefs.railCollapsed ? "Expand the filmstrip" : "Collapse the filmstrip"}>
      <span class="chev" aria-hidden="true">‹</span>
    </button>
    <nav class="objects" aria-label="Exhibit objects" bind:this={railEl}
      onwheel={(e) => { const el = e.currentTarget as HTMLElement; if (el.scrollWidth <= el.clientWidth || e.deltaY === 0) return; el.scrollLeft += e.deltaY; e.preventDefault(); }}>
      {#if OBJECTS.length === 0}
        <span class="no-objects">No media yet — add one from the “Exhibit” panel.</span>
      {/if}
      {#if OBJECTS.length > 1}
        <!-- Orientation at scale: sticky, so "where am I" survives scrolling a 100+ rail. -->
        <span class="rail-pos" aria-live="polite">{currentObjectIndex + 1} / {OBJECTS.length}</span>
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
    </nav>
  </div>

  <!-- Status strip (Archie-5e96 / Archie-b671) — ABSENT when idle. Between the rail and the canvas: the ONE
       slim bar the rail's non-nav cargo moved into — mode banners (framing / drawing) and import toasts,
       off the rail and off the canvas. role="status" so a screen reader announces the mode/toast. -->
  {#if framingSectionId || creating || importStatus || importNote}
    <div class="status-strip" role="status">
      {#if framingSectionId}
        <span class="ss-tag">Setting the view</span>
        <span class="ss-msg">{isAvCurrent ? "Mark a moment on the recording to set where this section opens — the view, not a note." : "Draw a box to set what this section shows — the view, not a note."}</span>
        <button type="button" class="ss-cancel" onclick={cancelFraming}>Cancel <kbd>Esc</kbd></button>
      {:else if creating}
        <span class="ss-tag">Drawing a region</span>
        <span class="ss-msg">Draw the {creating === "rectangle" ? "box" : "outline"} on the {isMapCurrent ? "map" : "image"} — it becomes your note’s place{isMapCurrent ? ", anchored to its longitude/latitude" : ""}. Drag pans again once you’ve drawn.</span>
        <span class="ss-into" title="This note files into the active reading (the pen in the readings panel).">Filing into <span class="ss-rd" style={`border-color:${activeReadingColour}`}>{activeReadingLabel}</span></span>
        <button type="button" class="ss-cancel" onclick={() => (creating = null)}>Cancel <kbd>Esc</kbd></button>
      {/if}
      {#if importStatus}
        <span class="ss-import"><span class="import-spinner" aria-hidden="true"></span> Adding “{importStatus.name}”…{#if importStatus.total > 1} ({importStatus.index} of {importStatus.total}){/if}</span>
      {/if}
      {#if importNote}
        <span class="ss-note">{importNote}<button type="button" class="ss-note-x" onclick={() => (importNote = "")} aria-label="Dismiss">✕</button></span>
      {/if}
    </div>
  {/if}

  <div class="body">
    <!-- ONE WADM form definition (ADR-0006), rendered into EITHER the floating marker popover OR the
         docked inspector below — never forked. Declared at .body scope so both sites can {@render} it. -->
    {#snippet noteForm()}
      <NoteEditor sel={sel!} editing={editing!} {currentReadings} bind:commentEl
        {commentOf} {tagsOf} {timeOf}
        {applyForm} {applyTime} {setNoteReading} {setNoteEmphasis} {setNoteScope} {requestCite} {citeIntoComment} {closeNote} {onDelete}
        {coLocatedIndex} coLocatedCount={coLocated.length} {cycleCoLocated} />
    {/snippet}
    <!-- Two-zone sidebar (Archie-5e96): a labeled "Exhibit" scope zone (the narrative spine — ADR-0016
         always-present) over a "This object" scope zone (readings, notes, detail). Sticky zone headers hold
         the boundary while the object zone scrolls; the object zone re-labels with the active object.
         Resizable / collapsible via the left ResizeDivider (unchanged). -->
    <aside class="sidebar" class:collapsed={asideCollapsed} style:--studio-aside-w={asideWidth != null ? `${asideWidth}px` : null}>

      <!-- ── ZONE 1 · EXHIBIT — spans EVERY item; persists across rail switches. The narrative spine is
           ALWAYS mounted (ADR-0016): a narrative exists iff sections.length>0, and adding the first section
           IS the act that turns this exhibit narrative-led (the published reading mode emerges from content). -->
      <section class="zone zone-exhibit">
        <header class="zone-header">
          <span class="zone-kicker">Exhibit</span>
          <span class="zone-name">{currentExhibit?.title}</span>
          <!-- ONE "bring something in" affordance (Archie-beb6 / Archie-56cf): the split +Media / +Map
               pair is retired for a single "+ Add media" that opens the scoped chooser (folder / IIIF /
               Map) in add-to-exhibit scope — the same dialog the overview plate opens. Adding media grows
               the EXHIBIT's collection, so it lives in the Exhibit zone, not the object nav. -->
          <div class="obj-add">
            <button type="button" class="add-obj-toggle" onclick={() => (addMediaOpen = true)}>+ Add media</button>
          </div>
        </header>
        <div class="zone-body">
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
          <!-- Narrative (exhibit-wide) — the spine spans every item and persists across rail switches. Always
               visible now (no accordion): the create row (add / from-a-note) sits above the display-only spine. -->
          <div class="panel-title-row">
            <h3 class="panel-title">Narrative</h3>
            <span class="panel-note">{narrativeSectionCount > 0 ? `${narrativeSectionCount} ${narrativeSectionCount === 1 ? "section" : "sections"}` : "Not started"}</span>
          </div>
          <div class="panel-create">
            <button type="button" class="create-add" onclick={addSection} disabled={OBJECTS.length === 0} title="Add a new section to this exhibit's narrative">＋ Add a section</button>
            {#if narrativeNotes.length > 0}
              <select class="from-note" aria-label="Add a section from an existing note" title="Turn an existing note into a new section"
                onchange={(e) => { const el = e.currentTarget as HTMLSelectElement; const n = narrativeNotes.find((x) => x.id === el.value); if (n) addSectionFromNote(n); el.selectedIndex = 0; }}>
                <option value="">＋ from a note…</option>
                {#each narrativeNotes as n (n.id)}<option value={n.id}>{n.lead.slice(0, 40)}</option>{/each}
              </select>
            {/if}
          </div>
          {#if NarrativeEditorComp}
            {@const NE = NarrativeEditorComp}
            <NE
              sections={currentExhibit?.sections ?? []}
              objects={OBJECTS}
              {currentObjectId}
              conflictedIds={conflictedSectionIds}
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
      </section>

      <!-- ── ZONE 2 · THIS OBJECT — object-LOCAL: readings, notes and detail belong to the one media item in
           view and SWAP as you switch objects on the rail (unlike the exhibit-wide spine above). -->
      <section class="zone zone-object">
        <header class="zone-header">
          <span class="zone-kicker">This object</span>
          {#if current}
            <!-- THE object title — editable in place (Enter or blur commits via renameObject). Was doubled:
                 this header span + a big .object-title input above the note list; the input had no edit
                 affordance and clipped long labels with no ellipsis (usability pass 2026-07-18). The ✎ is
                 the affordance; title= carries the full label when it ellipsizes. -->
            <input class="zone-name-edit" value={current.label} title={current.label}
              onchange={(e) => renameObject(currentObjectId, (e.currentTarget as HTMLInputElement).value)}
              onkeydown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
              aria-label="Object label" />
            <span class="zone-name-pen" aria-hidden="true">✎</span>
          {:else}
            <span class="zone-name">No media yet</span>
          {/if}
        </header>
        <div class="zone-body">
          <!-- Notes (this item) — the object-local annotate loop. Title, the readings legend (now grouped
               inside the Notes group), create tools, the present-notes list, and the folded "To place"
               worklist group below. -->
          <div class="panel-title-row">
            <h3 class="panel-title">Notes</h3>
            <span class="panel-note">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
          </div>
          <!-- Readings — SUBORDINATE to Notes (Archie-b671 amendment): a quiet legend, not a peer workspace.
               Visibility checkbox + colour swatch + name + count on THIS object + the file-into pen radio;
               "Manage readings…" opens the existing ReadingsModal. (The floating rail is retired.)
               Sits UNDER the Notes header now, so the subordination reads in layout, not just type style
               (usability pass 2026-07-18). -->
          {#if current}
            <section class="readings-panel" aria-label="Readings">
              <h3 class="panel-title subordinate">Readings</h3>
              <div class="readings-rows">
                {#each [{ id: "base", name: "General notes", colour: "var(--accent)" }, ...currentReadings] as r (r.id)}
                  <div class="reading-row" class:active-reading={rdg.active === r.id}
                    onmouseenter={() => (soloReading = r.id)} onmouseleave={() => (soloReading = null)} role="group" aria-label={r.name}>
                    <input type="checkbox" class="rd-vis" checked={rdg.isVisible(r.id)} onchange={() => rdg.toggle(r.id)} aria-label={`Show ${r.name} notes`} title={`Show “${r.name}” notes on the image`} />
                    <span class="reading-dot" style={`background:${r.colour ?? "var(--accent)"}`}></span>
                    <span class="reading-name">{r.name}</span>
                    <span class="reading-count">{r.id === "base" ? objNotes.filter((n) => !n.reading).length : objNotes.filter((n) => n.reading === r.id).length}</span>
                    <label class="reading-pen" title={`File new notes into “${r.name}”`}>
                      <input type="radio" name="active-reading" value={r.id} checked={rdg.active === r.id} onchange={() => rdg.setActive(r.id)} aria-label={`Draw new notes into ${r.name}`} />
                      <span aria-hidden="true">✎</span>
                    </label>
                  </div>
                {/each}
              </div>
              <button type="button" class="readings-manage" onclick={() => (readingsOpen = true)}>{currentReadings.length === 0 ? "+ New reading" : "Manage readings…"}</button>
            </section>
          {/if}
        <div class="notes-create">
          {#if current && !isAvCurrent}
            <!-- ADR-0011: drawing is armed only by creating a note. Choose a shape, draw the region on the
                 image; the armed "drawing" cue lives in the status strip now (off the sidebar). -->
            <div class="new-note">
              <span class="nn-lead">New note</span>
              <!-- Geo-annotations reuse Box/Outline on a Map (no pin tool — 2026-06-18 grilling Q4); geo-truth is captured on draw. -->
              <button type="button" onclick={() => (creating = "rectangle")} title={isMapCurrent ? "Draw a rectangular region on the map" : "Draw a rectangular region"}>▭ Box</button>
              <button type="button" onclick={() => (creating = "polygon")} title={isMapCurrent ? "Trace an irregular region on the map" : "Trace an irregular outline"}>⬠ Outline</button>
              <!-- Whole-object Note (ADR-0018): no region — targets the bare canvas IRI, frames the whole
                   object. (Converting an EXISTING note is the Scope control in the note form, not here.) -->
              <button type="button" onclick={() => createWholeObjectNote()} title={isMapCurrent ? "Note on the whole map (no region)" : "Note on the whole image (no region)"}>▣ Whole {isMapCurrent ? "map" : "image"}</button>
            </div>
          {/if}
          <p class="hint">{isAvCurrent ? "Play the recording · “Mark start” then “Add note” pins a note to that moment · click any note to jump back and edit." : "Pick a shape · draw the region · click a marker to edit it in the dock on the right."}</p>
          <!-- Bulk on-ramps (⑥ CSV, ⑦ WADM) folded into ONE quiet disclosure — three always-visible
               "… or add notes from…" rows crowded the create column (usability pass 2026-07-18). Native
               <details>, the "To place" idiom. -->
          <details class="import-notes">
            <summary>Import notes…</summary>
            {#if current && !isAvCurrent}
              <!-- Bulk on-ramp for spreadsheet-first authors (⑥): regions are xywh, so image objects only. -->
              <button type="button" class="csv-import" onclick={() => csvEl?.click()} title="Import notes from a CSV. Columns: object, comment — x, y, w, h, tags, reading all optional, header row first. Rows with no x,y,w,h arrive as “needs placement”: draw each box with Set area. Use a media item’s label in the object column, or leave it blank for the current one.">From a CSV</button>
              <input bind:this={csvEl} type="file" accept=".csv,text/csv" style="display:none" aria-label="Add notes from a CSV file"
                onchange={(e) => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void flows.importNotesCsv(f).catch((err) => { console.error("CSV add failed", err); window.alert("Couldn't add those notes."); }); el.value = ""; }} />
              <button type="button" class="csv-import" onclick={downloadCsvTemplate} title="Download a starter CSV pre-filled with this exhibit's items. Fill in the blanks in Excel or Sheets, then add it back — rows without x,y,w,h become “needs placement”.">Download a starter CSV to fill in</button>
            {/if}
            <!-- WADM on-ramp (⑦): annotations exported by Archie, Recogito, or any W3C producer. -->
            <button type="button" class="csv-import" onclick={() => wadmEl?.click()} title="Import notes from Archie or another annotation tool.">From an annotation file</button>
            <input bind:this={wadmEl} type="file" accept=".json,application/json,application/ld+json" style="display:none" aria-label="Add notes from a file"
              onchange={(e) => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void flows.importNotesWadm(f).catch((err) => { console.error("Notes add failed", err); window.alert("Couldn't add those notes."); }); el.value = ""; }} />
          </details>
        </div>
        <div class="notes-body">
          <!-- What's already on this item — the present-notes list (empty-state when none or all hidden). -->
          {#if notes.length === 0}
            <p class="empty">{isAvCurrent ? "No notes on this recording yet. Mark a moment, then add a note to pin it." : objNotes.length > 0 ? "This media item has notes, but they’re hidden. Turn on a reading to show them." : "No notes on this media item yet. Pick Box or Outline above, then draw the region."}</p>
          {/if}
          <ul class="notes-list">
            {#each notes as r (r.rev)}
              <!-- Hovering a note solos its MARK on the canvas (the rail's hover affordance, per-note). -->
              <li class:sel={editing === r.logicalId} onmouseenter={() => (hoverNote = r.logicalId)} onmouseleave={() => (hoverNote = null)}>
                <button onclick={() => (selected = r.logicalId)}>
                  <div class="comment">{stripMarkdown(commentOf(r)) || "(untitled)"}</div>
                  <div class="meta">
                    {#if isMapCurrent}{@const g = geoLabelOf(r, currentTileSource?.kind === "xyz" ? currentTileSource : undefined)}{#if g}<span class="geo" title="Longitude and latitude — the centre of this region on the map.">📍 {g}</span>{/if}{/if}
                    {#each tagsOf(r) as t}<span class="tag">#{t}</span>{/each}
                    <!-- border carries the reading colour; text stays ink so ANY user colour passes AA on paper (viewer Reader's border-only pattern) -->
                    {#if r.reading}{@const rd = currentReadings.find((x) => x.id === r.reading)}<span class="layer" style={rd?.colour ? `border-color:${rd.colour}` : ""}>{rd?.name ?? r.reading}</span>{:else if currentReadings.length > 0}<span class="layer" style={`border-color:${BASE_MARKER}`}>General notes</span>{/if}
                  </div>
                </button>
              </li>
            {/each}
          </ul>
          <!-- All notes (image / audio / video) edit in the docked editor on the right (ADR-0006 / Archie-b671);
               the sidebar is creation + the present-notes list — no inline form. -->
        </div>

        {#if pendingNotes.length > 0}
          <!-- "To place" (Archie-b671) — FOLDED INTO Notes as a collapsible group (was its own panel). NOT a
               creation tool: a worklist you READ, then place each on the image. Native <details> = a real,
               labelled disclosure. Absent at 0. -->
          <details class="to-place" open>
            <summary><span class="tp-label">To place</span><span class="count-badge">{pendingNotes.length}</span></summary>
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
          </details>
        {/if}

          <!-- Detail (this item) — the object's description + credit/licence (rights grill Q6). Always visible
               in the object zone now (was a separate accordion panel). -->
          {#if current}
            <div class="panel-title-row">
              <h3 class="panel-title">Detail</h3>
              {#if current.summary || current.rights || current.requiredStatement}<span class="panel-note" title="Description or credit set for this item">Set</span>{/if}
            </div>
            <DetailsEditor
              showTitle={false}
              summary={current.summary ?? ""}
              rights={{ ...(current.rights ? { rights: current.rights } : {}), ...(current.requiredStatement ? { requiredStatement: current.requiredStatement } : {}) }}
              scope="object"
              onsummary={setObjectSummary}
              onrights={setObjectRights}
              onremove={removeCurrentObject}
            />
          {/if}
        </div>
      </section>
    </aside>
    <ResizeDivider side="left" label="sidebar" min={260} max={760} bind:width={asideWidth} bind:collapsed={asideCollapsed} oncommit={persistAside} />
    <main
      class:drawing={drawArmed}
      class:drag-over={dragOver}
      ondrop={onDrop}
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={(e) => { if (e.target === e.currentTarget) dragOver = false; }}
    >
      <!-- {#key} forces a fresh mount when the object changes: Canvas reads `source` only in
           onMount (no source $effect), so switching objects must remount to load the new image.
           Gated on sourceReadyFor(current) so the object's on-demand master (Phase 1.2) is minted AND
           in the slot before mount — a non-asset (IIIF) source is ready at once. -->
      {#if current && isAvCurrent && assets.sourceReadyFor(currentSlug, current)}
        <!-- AV object → temporal editor (remount on object switch so the media element reloads). -->
        {#key canvasId}
          {#if AvEditorComp}
            {@const Av = AvEditorComp}
            <Av source={currentSource} label={current.label} mediaType={current.mediaType}
              slug={currentSlug} assetName={isAsset(current.source) ? current.source.slice(ASSET_PREFIX.length) : null}
              {annotations} bind:selected oncreate={onCreateTime} oncreatewhole={createWholeObjectNote} onimport={onImportTranscript}
              onimporterror={(msg) => (importNote = msg)} />
          {:else}
            <div class="no-canvas">Loading…</div>
          {/if}
        {/key}
      {:else if current && assets.sourceReadyFor(currentSlug, current)}
        {#key canvasId}
          {#if CanvasComp}
            <!-- noteViewFraction 0.5: selecting a note frames it at HALF the view, not edge-to-edge —
                 an editing canvas needs the surrounding context and the shape's resize handles on
                 screen, and a full-bleed fit shoved the marker under the viewport edges. Section
                 camera targets (focus) still frame exactly as authored (fitRegion pins fraction=1). -->
            <CanvasComp source={currentSource} tileSource={currentTileSource} {canvasId} annotations={canvasAnnotations} frame={studioFrame} focus={canvasFocus} tool={drawShape} drawing={drawArmed} styleOf={styleOfLive} locator bind:selected getFitOptions={() => ({ containerW: 0, sidebarW: 0, sidebarIsSheet: true, detailOpen: false, noteViewFraction: 0.5 })} oncreate={onCreate} onupdate={onUpdate} ondelete={onDelete} />
          {:else}
            <div class="no-canvas">Loading…</div>
          {/if}
        {/key}
        {#if isMapCurrent && currentTileSource?.kind === "xyz" && currentTileSource.attribution}
          <!-- Basemap attribution (REQUIRED by the tile provider's terms — DESIGN.md D6). Narrowed to the
               xyz (basemap) variant: only XyzTileSource carries attribution, DZI is an image pyramid (Issue 12). -->
          <div class="map-attribution">{currentTileSource.attribution}</div>
        {/if}
      {:else if current}
        <div class="no-canvas">Loading…</div>
      {:else}
        <div class="no-canvas">Add media — drop an image here, or use “+ Media” in the “Exhibit” panel.</div>
      {/if}
      <!-- The canvas carries ZERO chrome now (Archie-a9fc / Archie-b671): the note editor is docked to the
           right edge (below), the readings controls live in the sidebar, and mode/toast messaging lives in the
           status strip. Nothing floats over the artefact. -->
    </main>
    <!-- Docked note editor (Archie-b671) — a STABLE right-edge element (layout, not a floater): selecting a
         note in the sidebar list OR a marker on the canvas populates it; Esc deselects (the editor's Esc
         ladder); its width is a persisted view preference, resizable via the ResizeDivider (280 min, ~320
         default). Replaces BOTH the floating popover and the pinned inspector. -->
    <ResizeDivider side="right" label="note editor" min={280} max={560} collapsible={false} bind:width={dockWidth} oncommit={(s) => viewPrefs.setDockWidth(s.width)} />
    <aside class="dock" style:--studio-dock-w={dockWidth != null ? `${dockWidth}px` : null} aria-label="Note editor">
      {#if sel && !drawArmed}
        {@render noteForm()}
      {:else}
        <div class="dock-empty">
          <p class="de-lead">Select a note or a marker to edit it here.</p>
          <p class="de-sub">The note editor is docked to the right edge — nothing floats over the canvas.</p>
        </div>
      {/if}
    </aside>
  </div>

  {#if pub && PublishComp}
    {@const p = pub}
    {@const Pub = PublishComp}
    {@const dp = deployProps}
    <!-- ONE merged Publish & Share surface (Archie-1921): the old PublishDialog (destination chooser) +
         Publish (GitHub wizard) are now one component with one open flag. The GitHub-specific seams below
         degrade gracefully (optional props, `?.`) for the brief window before `deployProps` resolves —
         the destination chooser itself is available the moment `pub`/PublishComp are ready, same as
         PublishDialog was before the merge. -->
    <Pub
      open={p.open}
      canFolder={bnd.canFolder}
      onclose={() => p.close()}
      onfolder={p.localPublishFolder}
      onzip={p.localPublishZip}
      ondownload={p.download}
      onenterweb={p.openPublish}
      library={deployLibrary}
      deviceFlowAvailable={dp?.deviceFlowAvailable ?? false}
      remembered={dp?.remembered ?? null}
      initialSession={initialSession}
      signIn={dp?.signIn}
      persistSession={dp?.persistSession}
      signOut={dp?.signOut}
      deploy={dp?.deployToPages}
      checkRepoExists={dp?.checkRepoExists}
      listRepos={dp?.listRepos}
      recheckPages={dp?.recheckPages}
      onpublish={p.publish}
      brokenLinks={p.brokenLinks}
      incompleteCanvases={p.incompleteCanvases}
    />
  {/if}
  {#if cmdkOpen && CmdKComp}{@const CK = CmdKComp}<CK open={cmdkOpen} entries={cmdkEntries} onpick={insertCite} onclose={() => (cmdkOpen = false)} />{/if}
{/if}
<!-- GLOBAL: the scoped add-media chooser (Archie-56cf). ONE instance, opened in add-to-exhibit scope by
     BOTH the overview Add-media plate (onaddobject) and the editor "+ Add media" button. Its paths route
     to the into-exhibit ingest flows: folder → addFiles (straight into this exhibit), IIIF →
     addManifestToExhibit, Map → addMapObject (the flow the retired AddMapModal used). Start-empty/oncreate
     never fire in this scope. Mounted only with a current exhibit so the scope's slug/title are real. -->
{#if currentExhibit}
  <CreateExhibitDialog
    open={addMediaOpen}
    scope={{ kind: "add-to-exhibit", slug: currentSlug, title: currentExhibit.title }}
    oncreate={() => {}}
    oncreatefromfolder={(files) => { flows.addFiles(files).catch((e) => { console.error("Folder add failed", e); window.alert("Couldn't add those files."); }); }}
    oncreatefrommanifest={(url) => { flows.addManifestToExhibit(url).catch((e) => { console.error("IIIF add failed", e); window.alert("Couldn't load that IIIF link."); }); }}
    onaddmap={(m) => { void flows.addMapObject(m); }}
    onclose={() => (addMediaOpen = false)}
  />
{/if}
<!-- GLOBAL: the ? shortcuts cheat-sheet (generated from the registry) — reachable from any view. -->
<ShortcutsHelp open={helpOpen} onclose={() => (helpOpen = false)} />
<!-- GLOBAL: the onboarding tutorial (embeds docs/learn decks from public/learn). -->
<TutorialModal open={tutorialOpen} onclose={() => (tutorialOpen = false)} />
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
  /* The save indicator + Save button are the shared <SafetyState> now (Archie-0b7b / Archie-c76d) — its
     styles live in SafetyState.svelte; the old .savestate rules are retired with the span it styled. */
  /* The ? shortcuts button — a round, quiet affordance for the cheat-sheet. */
  /* The ? help control is now the shared <HelpMenu> component (used here + on the library home). */

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
  /* New-note affordance (ADR-0011): the create entry in the notes pane. Choose a shape → draw the region.
     Paper surface (it lives in the sidebar). The armed "drawing" cue lives in the status strip now, so the
     buttons stay steady while drawing. */
  .new-note { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
  .new-note .nn-lead { font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  .new-note > button { font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 500; letter-spacing: 0.04em; padding: var(--space-1) var(--space-3); background: var(--surface-paper-card); color: var(--ink-paper-primary); border: 1px solid var(--accent-2-paper); border-radius: var(--radius-sm); cursor: pointer; transition: background 160ms ease, box-shadow 160ms ease, border-color 160ms ease; }
  .new-note > button:hover { color: var(--ink-paper-primary); background: var(--accent-2-muted); border-color: var(--accent-2-hover); box-shadow: var(--shadow-lift-low); }

  /* Status strip (Archie-5e96 / Archie-b671) — ABSENT when idle. The ONE slim bar between the rail and the
     canvas where the rail's non-nav cargo went: mode banners (framing / drawing) + import toasts. Canvas-toned
     (it belongs to the canvas region), a soft accent left-rule marks it live. */
  .status-strip { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2) var(--space-3); padding: var(--space-2) var(--space-5); background: var(--surface-canvas-raised); border-bottom: 1px solid var(--border-canvas); box-shadow: inset 3px 0 0 var(--accent); font-family: var(--font-body); font-size: 0.85rem; line-height: 1.5; color: var(--ink-canvas-secondary); }
  .status-strip .ss-tag { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); }
  .status-strip .ss-msg { color: var(--ink-canvas-primary); }
  .status-strip .ss-into { display: inline-flex; align-items: center; gap: var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.04em; color: var(--ink-canvas-secondary); }
  .status-strip .ss-rd { font-weight: 500; letter-spacing: 0; color: var(--ink-canvas-primary); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); padding: 1px var(--space-2); }
  .status-strip .ss-cancel { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 500; letter-spacing: 0.04em; padding: var(--space-1) var(--space-3); background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: var(--space-2); transition: box-shadow 160ms ease; }
  .status-strip .ss-cancel:hover { box-shadow: var(--shadow-lift-low); }
  .status-strip .ss-cancel kbd { font-family: var(--font-mono); font-size: 0.62rem; color: var(--ink-canvas-muted); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); padding: 0 var(--space-1); }
  .status-strip .ss-import { display: inline-flex; align-items: center; gap: var(--space-2); margin-left: auto; overflow-wrap: anywhere; }
  .status-strip .ss-note { display: inline-flex; align-items: center; gap: var(--space-2); margin-left: auto; overflow-wrap: anywhere; }
  .status-strip .ss-note-x { flex-shrink: 0; cursor: pointer; background: none; border: none; color: var(--ink-canvas-muted); font-size: var(--text-ui-xs); padding: 0 var(--space-1); }
  .status-strip .ss-note-x:hover { color: var(--ink-canvas-primary); }

  /* Two labeled SCOPE zones (Archie-5e96): "Exhibit" over "This object", each with a sticky header that
     holds the boundary while the object zone scrolls. Full-bleed bands (negative margin cancels the aside
     gutter). */
  .zone { margin: 0 calc(-1 * var(--space-5)); }
  .zone-object { border-top: 3px solid var(--surface-canvas); }
  .zone-header { position: sticky; top: 0; z-index: 3; display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--space-1) var(--space-3); padding: var(--space-3) var(--space-5); background: var(--surface-paper); border-bottom: 1px solid var(--border-paper); }
  .zone-object .zone-header { background: var(--surface-paper-hover); }
  .zone-kicker { flex-basis: 100%; font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-paper-muted); }
  .zone-object .zone-kicker { color: var(--accent-2); }
  .zone-name { font-family: var(--font-display); font-size: 1.15rem; font-weight: 400; line-height: 1.2; color: var(--ink-paper-primary); overflow-wrap: anywhere; }
  .zone-name-edit { flex: 1 1 auto; min-width: 0; margin: 0; font-family: var(--font-display); font-size: 1.15rem; font-weight: 400; line-height: 1.2; color: var(--ink-paper-primary); background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); padding: 0 var(--space-1); text-overflow: ellipsis; transition: background 160ms ease, box-shadow 160ms ease; }
  .zone-name-edit:hover { background: var(--surface-paper-hover); }
  .zone-name-edit:focus { outline: none; background: var(--surface-paper-card); box-shadow: var(--shadow-lift-low); }
  .zone-name-pen { align-self: center; font-size: 0.8rem; color: var(--ink-paper-muted); opacity: 0.55; transition: color 120ms ease, opacity 120ms ease; }
  .zone-header:hover .zone-name-pen, .zone-header:focus-within .zone-name-pen { color: var(--accent-2); opacity: 1; }
  .zone-body { padding: var(--space-3) var(--space-5) var(--space-4); }
  /* The +Media / +Map adders, in the exhibit-zone header (adding media is an exhibit action). */
  .obj-add { margin-left: auto; display: flex; gap: var(--space-2); }
  /* Section title inside a zone body — a quiet eyebrow with an optional count/note on the right. */
  .panel-title-row { display: flex; align-items: baseline; gap: var(--space-3); margin: var(--space-4) 0 var(--space-2); }
  .panel-title-row:first-child { margin-top: 0; }
  .panel-title { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 1.1rem; line-height: 1; color: var(--ink-paper-primary); }
  /* Readings is SUBORDINATE to Notes (Archie-b671): a smaller, quieter eyebrow, not a peer title. */
  .panel-title.subordinate { font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-paper-secondary); margin: 0 0 var(--space-1); }
  .panel-note { margin-left: auto; font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); letter-spacing: 0.04em; color: var(--ink-paper-muted); }
  .panel-create { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
  /* Notes create stacks its rows (draw tools → import links → hint). */
  .notes-create { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-2); margin-bottom: var(--space-3); }

  /* Readings panel (subordinate) — a quiet legend in the object zone: visibility checkbox + swatch + name +
     count + the file-into pen; retired the floating canvas rail. Rows are compact so it reads as SECONDARY. */
  .readings-panel { margin-bottom: var(--space-3); }
  .readings-rows { display: flex; flex-direction: column; gap: 1px; }
  .reading-row { display: flex; align-items: center; gap: var(--space-2); padding: 2px var(--space-1); border-radius: var(--radius-sm); transition: background 0.16s ease; }
  .reading-row:hover { background: var(--surface-paper-hover); }
  .reading-row.active-reading { background: var(--surface-paper-card); box-shadow: inset 2px 0 0 var(--accent); }
  .reading-row .rd-vis { margin: 0; accent-color: var(--accent-2); cursor: pointer; }
  .reading-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--border-paper); flex: none; }
  .reading-name { flex: 1; min-width: 0; font-size: var(--text-ui-sm); color: var(--ink-paper-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .reading-count { font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--ink-paper-muted); }
  .reading-pen { display: inline-flex; align-items: center; cursor: pointer; color: var(--ink-paper-muted); }
  .reading-pen input { position: absolute; opacity: 0; pointer-events: none; }
  .reading-pen span { padding: 0 var(--space-1); border-radius: var(--radius-sm); transition: color 0.16s ease; }
  .reading-pen input:checked + span { color: var(--accent-2); }
  .reading-pen:hover span { color: var(--accent-2); }
  .readings-manage { margin-top: var(--space-1); cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-xs); letter-spacing: 0.12em; text-transform: uppercase; padding: var(--space-1) var(--space-2); background: none; color: var(--ink-paper-secondary); border: 1px solid var(--border-paper); border-radius: var(--radius-sm); transition: color 0.16s ease, border-color 0.16s ease; }
  .readings-manage:hover { color: var(--accent-2); border-color: var(--accent-2); }

  /* "To place" — a folded collapsible group inside Notes (Archie-b671), native <details>. The same
     summary dress covers .import-notes (the folded bulk on-ramps, usability pass 2026-07-18). */
  .to-place { margin: 0 0 var(--space-3); }
  .import-notes { margin: 0; }
  .import-notes .csv-import { display: block; padding: 4px 0 4px 1.05rem; } /* indent under the ▸ caret */
  .to-place > summary, .import-notes > summary { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; list-style: none; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-paper-secondary); padding: var(--space-1) 0; }
  .to-place > summary::-webkit-details-marker, .import-notes > summary::-webkit-details-marker { display: none; }
  .to-place > summary::before, .import-notes > summary::before { content: "▸"; font-size: 0.7rem; color: var(--ink-paper-muted); transition: transform 0.16s ease; }
  .to-place[open] > summary::before, .import-notes[open] > summary::before { content: "▾"; }
  .to-place .count-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 1.4rem; padding: 1px var(--space-2); font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600; color: var(--ink-paper-primary); background: var(--surface-paper-card); border: 1px solid var(--border-paper-emphasis); border-radius: 999px; }
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

  /* Filmstrip rail region (Archie-5e96) — the nav-only band: a collapse control + the scrolling object
     strip. Collapsing (viewPrefs.railCollapsed) shrinks the tiles to slim ticks so the canvas gets the room. */
  .rail-region { display: flex; align-items: stretch; gap: var(--space-2); padding: var(--space-2) var(--space-5); background: var(--surface-canvas-raised); border-bottom: 1px solid var(--border-canvas); }
  .rail-collapse { flex: none; display: flex; align-items: center; justify-content: center; width: 26px; cursor: pointer; background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); transition: color 160ms ease, box-shadow 160ms ease; }
  .rail-collapse:hover { color: var(--ink-canvas-primary); box-shadow: var(--shadow-lift-low); }
  .rail-collapse .chev { display: inline-block; transition: transform 160ms ease; }
  .rail-region.collapsed .rail-collapse .chev { transform: rotate(180deg); }
  /* Object rail — the exhibit's works laid along the table edge; the active one marked by a quiet
     accent tint + soft lift (not a loud orange fill — the signal is rationed to Publish). */
  .objects {
    display: flex; gap: var(--space-2); align-items: stretch; flex: 1; min-width: 0;
    overflow-x: auto; /* many objects scroll the rail, not the page (12 plates pushed the page to ~2900px) */
  }
  /* Collapsed = a slim strip: the thumbnail + counter shrink to ticks, labels hide (image-first). */
  .rail-region.collapsed .objects { gap: var(--space-1); }
  .rail-region.collapsed .obj { max-width: none; padding: var(--space-1); }
  .rail-region.collapsed .obj-thumb { width: 16px; height: 26px; }
  .rail-region.collapsed .obj-meta { display: none; }
  /* Slim strip: the sticky "n / N" counter shrinks to match the ticks, so it doesn't loom oversized. */
  .rail-region.collapsed .rail-pos { font-size: 0.55rem; padding: 0 var(--space-1); }
  /* Object tab — a thumbnail + label so you choose visually (P2-6), not by name alone. */
  .obj {
    display: flex; align-items: center; gap: var(--space-2); cursor: pointer; text-align: left; max-width: 13rem;
    /* Never shrink below content: the rail SCROLLS at scale (overflow-x above). Without this, 20+
       siblings crush each tile to its one-character min-content (overflow-wrap:anywhere) — the
       ransom-note rail. Label is clamped to 2 lines below; title= carries the full text. */
    flex-shrink: 0;
    /* 100+ objects: skip layout/paint for off-screen tiles (the Viewer-grid pattern; estimate ≈ tile box). */
    content-visibility: auto; contain-intrinsic-size: auto 9rem auto 3.75rem;
    padding: var(--space-2);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: none; border-radius: var(--radius-sm);
    transition: color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }
  .obj:hover { color: var(--ink-canvas-primary); background: var(--surface-canvas-overlay); box-shadow: var(--shadow-lift-low); }
  .obj.on { background: var(--accent-muted); color: var(--ink-canvas-primary); box-shadow: var(--shadow-lift-low); }
  /* The IMAGE is the tile's identity (you choose visually, P2-6): thumb leads, caption recedes. */
  .obj-thumb { flex-shrink: 0; width: 72px; height: 54px; border-radius: var(--radius-sm); background-color: var(--surface-canvas); background-size: cover; background-position: center; box-shadow: var(--shadow-inset-fog); }
  .obj-meta { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .obj-label {
    font-family: var(--font-ui); font-size: 0.75rem; font-weight: 400; line-height: 1.2; overflow-wrap: anywhere;
    color: var(--ink-canvas-muted);
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden;
    max-width: 8rem; /* long filenames get 2 quiet lines + clip; full title in the tooltip */
  }
  .obj.on .obj-label, .obj:hover .obj-label { color: var(--ink-canvas-secondary); }
  .obj-count { font-family: var(--font-mono); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-canvas-muted); white-space: nowrap; }
  /* Sticky position chip — orientation while scrolling a long rail. */
  .rail-pos {
    position: sticky; left: 0; z-index: 1; align-self: center; flex-shrink: 0;
    padding: var(--space-1) var(--space-2); margin-right: var(--space-1);
    /* overlay + border so the chip reads as floating ABOVE tiles it scrolls over (raised-on-raised vanished) */
    background: var(--surface-canvas-overlay); border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm); box-shadow: var(--shadow-lift-low);
    font-family: var(--font-mono); font-size: 0.65rem; letter-spacing: 0.08em; color: var(--ink-canvas-muted);
    white-space: nowrap;
  }
  .obj.on .obj-count { color: var(--accent); }

  /* The "+ Add media" affordance in the Exhibit zone header (opens the scoped chooser, Archie-56cf). */
  .add-obj-toggle {
    align-self: center; cursor: pointer; padding: var(--space-2) var(--space-3);
    background: none; color: var(--ink-canvas-secondary);
    border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.04em; transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
  }
  .add-obj-toggle:hover { color: var(--accent-2); border-color: var(--accent-2); background: var(--surface-canvas-overlay); }
  /* Import spinner (the status strip's "Adding…" toast) — the accent, spinning. */
  .import-spinner { flex-shrink: 0; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--accent-muted); border-top-color: var(--accent); animation: import-spin 0.7s linear infinite; }
  @keyframes import-spin { to { transform: rotate(360deg); } }

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

  /* Docked note editor (Archie-b671) — a STABLE right-edge element (layout, not a floater). Replaces both
     the floating popover and the pinned inspector; nothing floats over the canvas. Width is a persisted view
     preference (--studio-dock-w, set by the ResizeDivider), clamp() default lands near 320px. */
  .dock {
    width: var(--studio-dock-w, clamp(280px, 22vw, 420px)); flex-shrink: 0; overflow: auto; box-sizing: border-box;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  .dock :global(.wadm) { margin-top: 0; border-top: none; padding: var(--space-4); }
  .dock-empty { padding: var(--space-6) var(--space-4); text-align: center; color: var(--ink-paper-muted); }
  .dock-empty .de-lead { margin: 0; font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .dock-empty .de-sub { margin: var(--space-2) 0 0; font-family: var(--font-body); font-size: var(--text-ui-sm); line-height: 1.5; }

  /* Sidebar — the two-zone notebook (warm paper) */
  .sidebar {
    /* Width = a token so it's responsive by default (clamp) AND drag-resizable (Phase 2 sets --studio-aside-w inline). */
    width: var(--studio-aside-w, clamp(320px, 26vw, 520px)); flex-shrink: 0; overflow: auto; box-sizing: border-box;
    padding: var(--space-5);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  /* Collapsed = give the canvas the whole width (image-first). The divider stays (anti-trap: always expandable). */
  .sidebar.collapsed { width: 0; min-width: 0; padding: 0; border-left: 0; overflow: hidden; }
  ul { list-style: none; margin: 0; padding: 0; }
  /* Long note lists scroll HERE (the spine .cards 50vh idiom, NarrativeEditor) so Detail and Remove
     never sink arbitrarily deep in the single sidebar scroll (usability pass 2026-07-18). */
  .notes-list { max-height: 45vh; overflow-y: auto; }

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
  .comment { font-family: var(--font-body); font-size: var(--text-note); line-height: 1.6; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }
  .meta { margin-top: var(--space-2); display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
  .tag { font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-2); }
  /* Geo-annotation: the pin's lng/lat readout in the note list (derived from its basemap position). */
  .geo { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.02em; color: var(--ink-paper-secondary); }
  .layer { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-paper-secondary); background: var(--surface-paper-hover); border: 1px solid var(--border-paper); padding: 2px var(--space-2); border-radius: var(--radius-sm); }
  .hint { font-family: var(--font-body); font-size: var(--text-ui-md); color: var(--ink-paper-secondary); line-height: 1.6; margin: 0; }
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

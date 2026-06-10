<script lang="ts">
  // Studio editor (Phase-2 UI, browser-verified later). Real annotate loop over the headless-
  // tested @render/core AnnotationSession: draw on the canvas → create note → edit body/tags/
  // layers in the WADM form → publish to .archie.zip. Logic lives in core; this is the thin shell.
  import { onMount, tick } from "svelte";
  import { inferredMime, planFolderImportGroups } from "./folder-import.js";
  import { manifestToExhibit, ManifestImportError, type ManifestPlan } from "./iiif-import.js";
  import { planCsvImport } from "./csv-import.js";
  import { collabBreakdown, collabSummaryText } from "./collab.js";
  import PropsDrawer from "./PropsDrawer.svelte";
  import ReadingsEditor from "./ReadingsEditor.svelte";
  import { atlasTitle, atlasSummary, atlasRights, atlasReadings, atlasObjects, atlasNotes } from "../../viewer/src/atlas.js";
  import { planWadmImport } from "./wadm-import.js";
  import Canvas from "@render/svelte/Canvas.svelte";
  import { stripMarkdown } from "@render/svelte";
  import Publish from "./Publish.svelte";
  import PublishDialog from "./PublishDialog.svelte";
  import ReadingHelp from "./ReadingHelp.svelte";
  import LibraryHome from "./LibraryHome.svelte";
  import CmdK from "./CmdK.svelte";
  import MediaPicker, { type PickItem } from "./MediaPicker.svelte";
  import AvEditor from "./AvEditor.svelte";
import LayoutPicker from "./LayoutPicker.svelte";
  import ExhibitOverview from "./ExhibitOverview.svelte";
  import NarrativeEditor from "./NarrativeEditor.svelte";
  import DetailsEditor from "./DetailsEditor.svelte";
  import ShortcutsHelp from "./ShortcutsHelp.svelte";
  import { matches, typingInField } from "./shortcuts.js";
  import {
    AnnotationSession, libraryToZipFs, asClientId, mintRevId, encodeLinkRef,
    MemoryFilesystem, ZipFilesystem, FsaFilesystem, publishLibrary, loadLibrary, collectFiles, publishToGitHub,
    readExifOrientation, isOrientationNoop, orientationTransform,
    mediaTypeFromSource, timeFragmentValue, mediaFragmentValue, parseTimeFragment, importTranscript, thumbnailUrl,
    MAX_MASTER_DIM,
    bindingLabel, recentFromBinding, addRecent, removeRecent,
    tagsOf, emphasisOf, emphasisModifiers,
    type LogicalId, type Library, type LayoutType, type W3CAnnotation, type W3CBody, type AnnotationRecord, type AnnotationLog, type FsDirectory, type GitHubTarget, type PublishProgress, type Binding, type RecentProject, type BrokenLink, type Section, type Reading, type RightsFields, type Emphasis,
    readExifCaptureDate,
  } from "@render/core";
  import type { DrawTool, MarkerStyle } from "@render/mount";
  import { bakeDisplayMaster, downscaleIfNeeded } from "./bake.js";
  import { openExhibitAnnotationsDir, loadLibraryMeta, saveAssetFile, saveOriginalFile, readAssetUrl, readAssetBlob, readOriginalBytes, assetSize, clearExhibitAnnotations, exhibitHasAnnotations, type ExhibitMeta, type ObjectMeta, type ObjectProvenance } from "./store.js";
  import { createLibraryStore } from "./library-meta.svelte.js";
  import { supportsFolderPicker, supportsFileStreamSave, pickFolder, saveZipToDisk, zipNameFor, loadRecents, saveRecents, loadLastBinding, saveLastBinding } from "./binding.js";
  import { putHandle, getHandle, deleteHandle, requestPermission } from "./handles-db.js";
  // Phase-4 A2 surgery: the Studio's duplicate voynich.ts was deleted; the ONE seed lives in the
  // Viewer (apps/viewer/src/voynich.ts) and both apps read it (single source of truth, §A).
  import { voynichObjects, voynichNotes, voynichReadings, voynichReadingNotes, voynichAvNotes, voynichSections } from "../../viewer/src/voynich.js";

  const BASE = "https://archie.demo/";
  // Local display name → the clientId stamped as lastEditor in the merge DAG (CONTEXT invention #6).
  // Persisted in localStorage (metadata, not content). null = never prompted (ask on first Import);
  // "" = skipped (Anonymous); else the chosen name. `author` derives from it for any NEW session.
  const IDENTITY_KEY = "archie.displayName.v1";
  function loadIdentity(): string | null { try { return localStorage.getItem(IDENTITY_KEY); } catch { return null; } }
  function saveIdentity(name: string): void { try { localStorage.setItem(IDENTITY_KEY, name); } catch { /* storage off */ } }
  // First-add teaching for "+ Reading" (ADR-0007): show the explainer once, then never re-nag.
  // Dismissing OR proceeding both count as "seen" — the flag is about whether the curator has met the
  // concept, not whether they acted on it. Global (the concept is the same across every exhibit).
  const READING_HELP_KEY = "archie.readingHelpSeen.v1";
  function readingHelpSeen(): boolean { try { return localStorage.getItem(READING_HELP_KEY) === "1"; } catch { return false; } }
  function markReadingHelpSeen(): void { try { localStorage.setItem(READING_HELP_KEY, "1"); } catch { /* storage off */ } }
  let identity = $state<string | null>(loadIdentity());
  const author = $derived(asClientId(identity || "anonymous"));
  const srcOf = (t: unknown): string | undefined => (typeof t === "string" ? t : (t as { source?: string } | null)?.source);

  // The default exhibits on first run: the imported Voynich manuscript (../../viewer/src/voynich.ts),
  // one shared seed rendered three ways (rosettes / grid / narrative).
  // §B object set: 11 IIIF-direct images + 1 sound (o12). Spread width/height/mediaType/duration
  // conditionally — o12 (sound) carries no dims, and exactOptionalPropertyTypes forbids `width: undefined`.
  const voynichObjMeta = voynichObjects.map((o) => ({ id: o.id, source: o.source, label: o.label, ...(o.width !== undefined ? { width: o.width } : {}), ...(o.height !== undefined ? { height: o.height } : {}), ...(o.mediaType ? { mediaType: o.mediaType } : {}), ...(o.duration !== undefined ? { duration: o.duration } : {}) }));
  const DEFAULT_EXHIBITS: ExhibitMeta[] = [
    // THE THREE-LAYOUT EXERCISE — one shared seed (../../viewer/src/voynich.ts), three exhibits, each a
    // different Archie layout. The authored readings/sections come from the SHARED voynich.ts (§G / ADR-0007).
    // seedVersion forces the onMount reconcile to treat a pre-exercise persisted copy as STALE and reseed
    // (the old single `voynich` was narrative @seedVersion 1 → bumped to 2 now it's the GRID main).
    // SINGLE — only o9 (the Rosettes foldout); no sections → single.
    { id: "ex-voynich-rosettes", slug: "voynich-rosettes", title: "The Rosettes", layout: "single", seedVersion: 1, readings: voynichReadings, objects: voynichObjMeta.filter((o) => o.id === "o9") },
    // GRID — all 11 folios + the sounded page; NO sections → grid (the main voynich slug).
    { id: "ex-voynich", slug: "voynich", title: "The Whole Manuscript", layout: "grid", seedVersion: 2, readings: voynichReadings, objects: voynichObjMeta },
    // NARRATIVE — all + the sounded page, the 6-beat spine → narrative.
    { id: "ex-voynich-reading", slug: "voynich-reading", title: "Reading the Unreadable", layout: "narrative", seedVersion: 1, readings: voynichReadings, sections: voynichSections as Section[], objects: voynichObjMeta },
    // MAP/CLASSROOM — the segment-diverse template (③+⑬, Archie-eaae; user-decided in the grill):
    // UNESCO's endangered-languages atlas via the Internet Archive (CC BY-SA 4.0 — template-content
    // rule: third-party rights-clean, never the author's personal work). Two Readings demonstrate
    // the rival-interpretations differentiator in a non-manuscript register. DRAFT — human-gated.
    { id: "ex-atlas", slug: "language-atlas", title: atlasTitle, summary: atlasSummary, layout: "grid", seedVersion: 1, readings: atlasReadings, ...atlasRights, objects: atlasObjects.map((o) => ({ ...o, ...atlasRights })) },
  ];

  // --- library / exhibit state (authored structure; persisted at {PROJECT}/library.json) ---
  const lib = createLibraryStore({ exhibits: DEFAULT_EXHIBITS }, { onAfterPersist: touchBinding });
  let view = $state<"library" | "overview" | "editor">("library");
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
  const ASSET_PREFIX = "/assets/";
  const isAsset = (src: string | undefined): boolean => !!src && src.startsWith(ASSET_PREFIX);
  let assetUrls = $state<Record<string, string>>({}); // objId -> blob: URL (revoke on nav)
  let assetsReady = $state(false);
  function revokeAssetUrls() {
    for (const u of Object.values(assetUrls)) URL.revokeObjectURL(u);
    assetUrls = {};
  }
  async function resolveAssets(slug: string, objs: ReadonlyArray<{ id: string; source: string }>) {
    revokeAssetUrls();
    const map: Record<string, string> = {};
    for (const o of objs) {
      if (!isAsset(o.source)) continue;
      const url = await readAssetUrl(slug, o.source.slice(ASSET_PREFIX.length));
      if (url) map[o.id] = url;
    }
    assetUrls = map;
    assetsReady = true;
  }

  const rectSel = (canvas: string, x: number, y: number, w: number, h: number) => ({
    type: "SpecificResource" as const, source: canvas,
    selector: { type: "FragmentSelector" as const, conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${x},${y},${w},${h}` },
  });
  // Temporal selector (AV notes) — the time analogue of rectSel; one source of truth for `t=` is core.
  const timeSel = (canvas: string, start: number, end: number) => ({
    type: "SpecificResource" as const, source: canvas,
    selector: { type: "FragmentSelector" as const, conformsTo: "http://www.w3.org/TR/media-frags/", value: timeFragmentValue(start, end) },
  });
  // Seed a default exhibit's notes so it isn't empty on first run (pre-OPFS). Per-slug because the
  // three default exhibits share one seed (the Voynich folios) rendered three ways.
  // Seed the Voynich from the SHARED authored content (../../viewer/src/voynich.ts) — the SAME source the
  // Viewer publishes from, so the Studio boots with the full Readings exhibit (it previously looped only the
  // empty voynichNotes and booted empty — the runtime bug). Order mirrors sample-data: base notes → the 33
  // reading notes (xywh + reading + tag bodies) → the 4 AV notes on the o12 sound canvas.
  // Seed ONE Voynich exhibit's notes from the SHARED authored content, slug-parameterized: notes target
  // ${BASE}{slug}/canvas/{objId}, matching publishLibrary's per-slug grammar. The three-layout exercise
  // seeds three slugs off the same data — rosettes = only o9 (no AV); voynich/voynich-reading = all + AV.
  function seededVoynich(slug: string, opts: { objectIds?: Set<string>; includeAv: boolean }): AnnotationSession {
    const keep = (objectId: string) => !opts.objectIds || opts.objectIds.has(objectId);
    const s = new AnnotationSession(author);
    for (const n of voynichNotes) {
      if (!keep(n.objectId)) continue;
      const [x, y, w, h] = n.region;
      s.createNote({ target: rectSel(`${BASE}${slug}/canvas/${n.objectId}`, x, y, w, h), body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }] });
    }
    for (const n of voynichReadingNotes) {
      if (!keep(n.objectId)) continue;
      const [x, y, w, h] = n.xywh.split(",").map(Number) as [number, number, number, number];
      const body: W3CBody[] = [
        { type: "TextualBody", value: n.comment, purpose: "commenting" },
        ...(n.tags ?? []).map((tg) => ({ type: "TextualBody" as const, value: tg, purpose: "tagging" })),
      ];
      s.createNote({ target: rectSel(`${BASE}${slug}/canvas/${n.objectId}`, x, y, w, h), body, ...(n.reading ? { reading: n.reading } : {}) });
    }
    if (opts.includeAv && keep("o12")) {
      for (const a of voynichAvNotes) {
        const [start, end] = a.t.split(",").map(Number) as [number, number];
        const body: W3CBody[] = [
          { type: "TextualBody", value: a.comment, purpose: "commenting" },
          ...(a.tags ?? []).map((tg) => ({ type: "TextualBody" as const, value: tg, purpose: "tagging" })),
        ];
        s.createNote({ target: timeSel(`${BASE}${slug}/canvas/o12`, start, end), body, ...(a.reading ? { reading: a.reading } : {}) });
      }
    }
    return s;
  }
  function seededAtlas(): AnnotationSession {
    const s = new AnnotationSession(author);
    for (const n of atlasNotes) {
      const [x, y, w, h] = n.region;
      s.createNote({
        target: rectSel(`${BASE}language-atlas/canvas/${n.objectId}`, x, y, w, h),
        body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }],
        ...(n.reading ? { reading: n.reading } : {}),
      });
    }
    return s;
  }
  const seededFor = (slug: string): (() => AnnotationSession) | null =>
    slug === "voynich-rosettes" ? () => seededVoynich("voynich-rosettes", { objectIds: new Set(["o9"]), includeAv: false })
    : slug === "voynich" ? () => seededVoynich("voynich", { includeAv: true })
    : slug === "voynich-reading" ? () => seededVoynich("voynich-reading", { includeAv: true })
    : slug === "language-atlas" ? seededAtlas
    : null;
  let session = $state(new AnnotationSession(author));

  // --- persistence (OPFS working store; per-exhibit annotations + autosave) ---
  let annDir: FsDirectory | null = null;
  let dirty = $state(false);
  let storeReady = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  // --- Library binding (invention #3, CONTEXT three-configs persistence): WHERE this Library's canonical
  // bytes live. unbound = OPFS-only (this browser); folder = Chromium FSA autosave-in-place; file = a
  // .archie.zip on disk (Save downloads it). Capability picks folder-vs-file; the user sees only "where". ---
  const canFolder = supportsFolderPicker();
  let binding = $state<Binding>({ kind: "unbound" });
  let recents = $state<RecentProject[]>([]);
  let bindingDirty = $state(false);   // unsaved-to-disk at the Library scale (distinct from per-exhibit `dirty`)
  let bindingBusy = $state(false);    // a Save/Open is in flight (guards overlap + disables chrome)
  let bindingError = $state<string | null>(null); // a bound location couldn't be reopened (lost-binding recovery)
  let collabNote = $state<string | null>(null); // ⑧: who-wrote-what after opening a zip (dismissible)
  const PROJECT_TITLE = "Archie Library";
  const bindingPlace = $derived(bindingLabel(binding));
  let zipInputEl = $state<HTMLInputElement | null>(null); // hidden picker for "Open" on non-Chromium
  let csvEl: HTMLInputElement | null = null; // hidden picker for the notes-CSV import (⑥)
  let wadmEl: HTMLInputElement | null = null; // hidden picker for the WADM/JSON import (⑦)
  // The library STRUCTURE always persists (which exhibits exist is real; examples are bundled defaults
  // reconciled on boot). Only an EXAMPLE's annotations are ephemeral — gated in save() on isTemplate.
  // persist lives in the library-meta store now (saveLibraryMeta + injected touchBinding).
  async function save() {
    if (!annDir || isTemplate(currentSlug)) return; // Examples are playgrounds — their notes aren't saved
    // Don't write empty heads/history pages for a note-less exhibit; library.json records existence.
    if (session.entries.length > 0) await session.save(annDir, { baseUrl: BASE });
    dirty = false;
    void autosaveToFolder(); // a folder-bound Project mirrors the tree to disk in place (no-op otherwise)
  }
  function scheduleSave() {
    touchBinding(); // an edit means the bound location is now behind (only counts once bound)
    if (!annDir) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), 800);
  }
  // Boot into the Library. Load the authored library (or seed the defaults on first run). Self-healing
  // reconcile: for each bundled default, if its persisted copy is STALE (missing, or its object set
  // differs from the current code default — i.e. a fixture was re-imported), replace its structure and
  // clear its annotations so it reseeds. Unchanged defaults (+ user edits) + user exhibits are preserved.
  onMount(async () => {
    recents = loadRecents();
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
    // Restore the active-binding DESCRIPTOR so the chip shows continuity ("bound to X"); the folder
    // handle's permission re-grants lazily on the next write. Boot counts as in-sync — the next edit
    // marks it unsaved-to-disk (we don't auto-reload from disk without a user gesture).
    binding = loadLastBinding();
    bindingDirty = false;
  });

  // Open an exhibit into the editor: load its per-exhibit annotation log (seed the sample if empty).
  async function openExhibit(slug: string) {
    currentSlug = slug;
    const ex = lib.meta.exhibits.find((e) => e.slug === slug);
    currentObjectId = ex?.objects[0]?.id ?? "o1";
    selected = null;
    editing = null;
    creating = null;
    assetsReady = false;
    await resolveAssets(slug, ex?.objects ?? []); // OPFS /assets → blob: URLs (sets assetsReady)
    const seed = seededFor(slug);
    if (isTemplate(slug)) {
      // Example = playground: in-memory only — never touch OPFS (so "nothing is saved" is literally
      // true), and always seed fresh so a prior session's persisted notes can't leak into the template.
      annDir = null;
      storeReady = false;
      session = seed ? seed() : new AnnotationSession(author);
    } else {
      annDir = await openExhibitAnnotationsDir(slug);
      storeReady = annDir !== null;
      if (annDir) {
        const loaded = await AnnotationSession.load(annDir, author);
        if (loaded.notes().length > 0) session = loaded;
        else { session = seed ? seed() : new AnnotationSession(author); await save(); }
      } else {
        session = seed ? seed() : new AnnotationSession(author);
      }
    }
    rev += 1;
    // Land at the exhibit's OVERVIEW scale (invention #1) UNLESS it's exactly one object (non-narrative),
    // which goes straight to its annotation surface. An EMPTY (0-object) exhibit also lands at the overview
    // — that's the only place to name it + add objects (the Details drawer lives there). MUST stay in sync
    // with `hasOverview` below (same predicate).
    view = ((ex?.objects.length ?? 0) !== 1 || (ex?.layout ?? "grid") === "narrative") ? "overview" : "editor";
  }
  async function backToLibrary() {
    clearTimeout(saveTimer);
    await save();
    revokeAssetUrls(); // free the previous exhibit's blob: URLs
    assetsReady = false;
    view = "library";
  }
  // Overview ↔ object (invention #1): descend from a plate into close annotation, then climb back. Going
  // back to the overview KEEPS the resolved thumbnails (unlike backToLibrary, which frees them).
  function openObject(objId: string) { switchObject(objId); view = "editor"; }
  async function backToOverview() { await save(); view = "overview"; }

  // --- Destructive removes (Archie-3f4c). Object → tombstone its notes (ADR-0003 append-only; recoverable
  // via history, orphaned tombstones don't project), then drop the object. Exhibit → clear its annotation
  // log, then drop it; the LAST exhibit leaves a truly-empty library (no DEFAULT_EXHIBITS reseed). ---
  async function removeCurrentObject() {
    const objId = currentObjectId;
    const cid = canvasIdOf(objId);
    for (const r of session.notes().filter((n) => !n.deleted && srcOf(n.target) === cid)) session.deleteNote(r.logicalId as LogicalId);
    bump();
    const remaining = OBJECTS.filter((o) => o.id !== objId);
    await lib.removeObject(currentSlug, objId);
    if (remaining[0]) switchObject(remaining[0].id);
    else { selected = null; editing = null; creating = null; await backToOverview(); } // last object → empty exhibit overview (valid post-e5c0)
  }
  async function removeCurrentExhibit() {
    const slug = currentSlug;
    clearTimeout(saveTimer);
    await clearExhibitAnnotations(slug); // wipe its annotation log on disk (do NOT re-save it via backToLibrary)
    await lib.removeExhibit(slug);
    revokeAssetUrls();
    assetsReady = false;
    view = "library";
  }
  // Persist the authored narrative spine (NarrativeEditor onchange) → ExhibitMeta.sections → publishes as
  // IIIF Ranges (buildFullLibrary → toRanges). Library STRUCTURE persists ungated (sections aren't notes).
  function setSections(sections: Section[]) {
    lib.patchExhibit(currentSlug, { sections });
  }
  // --- narrative camera FRAMING (ADR-0005 + placement correction 2026-05-25) ---
  // A Section's camera (`start`) is set by FRAMING it on the editor canvas — the same gesture as a note's
  // geometry — not by typing a fragment. "Frame camera" on a section rail-JUMPS to that section's object
  // (an explicit, visible move — never an implicit rebind), then arms the canvas draw; the next drawn box
  // (or AV in-out) becomes the camera instead of creating a note. Re-binding a section to a different
  // object is the separate, explicit "Move here" action in the spine panel.
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
    const carried = session.notes().filter((r) => !r.deleted).map((r) => {
      const src = srcOf(r.target);
      const target = src && src.startsWith(fromBase) && typeof r.target !== "string"
        ? { ...(r.target as object), source: toBase + src.slice(fromBase.length) } : r.target;
      return { target, body: r.body, motivation: r.motivation, layers: r.layers, reading: r.reading };
    });
    await lib.persist();
    await openExhibit(slug); // not a template → persists; seeds empty
    for (const c of carried) session.createNote({ target: c.target, ...(c.body !== undefined ? { body: c.body } : {}), ...(c.motivation !== undefined ? { motivation: c.motivation } : {}), ...(c.layers !== undefined ? { layers: c.layers } : {}), ...(c.reading !== undefined ? { reading: c.reading } : {}) });
    rev += 1;
    await save();
    keeping = false;
  }
  // Create a new exhibit (no objects yet — add them in the editor), persist, and open it.
  async function newExhibit(title: string) {
    const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exhibit";
    let slug = base, n = 2;
    while (lib.meta.exhibits.some((e) => e.slug === slug)) slug = `${base}-${n++}`;
    await lib.addExhibit({ id: `ex-${slug}`, slug, title: title.trim() || "Untitled exhibit", layout: "grid", objects: [] });
    await openExhibit(slug);
  }
  // Folder → exhibit in one gesture (contributor-broadening ① sub-cycle A, Archie-e1d6): the folder
  // names the exhibit; its media files become objects in reading order. Each file goes through the
  // SAME ingest as a hand-picked one (addObjectFromFile: EXIF bake, OPFS, AV branch) — no second path.
  async function newExhibitFromFolder(files: File[]) {
    // EXIF pre-pass (⑫): capture date per image so photo folders sort by SHOT time; only the
    // first 128 KB is read (APP1 sits at the front), only for image-MIME files.
    // Chunked at 8 (review r9): thousands of photos must not slice concurrently (memory/handles).
    const picked: { name: string; relativePath: string; type: string; capturedAt: number | null; file: File }[] = [];
    for (let i = 0; i < files.length; i += 8) {
      picked.push(...(await Promise.all(files.slice(i, i + 8).map(async (file) => {
        let capturedAt: number | null = null;
        if (file.type.startsWith("image/")) {
          try { capturedAt = readExifCaptureDate(await file.slice(0, 131072).arrayBuffer()); } catch { capturedAt = null; }
        }
        return { name: file.name, relativePath: file.webkitRelativePath || file.name, type: file.type, capturedAt, file };
      }))));
    }
    // One exhibit per first-level subfolder (slice B, user-decided); loose files = a root exhibit.
    const groups = planFolderImportGroups(picked);
    if (groups.length === 0) {
      window.alert("No images, audio, or video found in that folder.");
      return;
    }
    let failed = 0, imported = 0;
    try {
      for (const g of groups) {
        await newExhibit(g.name);
        // storeReady is PER-EXHIBIT state — openExhibit (inside newExhibit) just set it. Without
        // it, addObjectFromFile would no-op per file = titled, silently-empty exhibits; stop loudly.
        if (!storeReady) {
          window.alert("Created the exhibit, but this browser can't persist imported files (private window, or storage unavailable) — import stopped.");
          return;
        }
        for (let i = 0; i < g.files.length; i++) {
          const p = g.files[i]!;
          importStatus = { name: p.name, index: i + 1, total: g.files.length };
          // Re-wrap typeless files (.tiff, .avif on some platforms) with the inferred MIME the
          // plan admitted them under — addObjectFromFile branches on File.type.
          const file = p.file.type ? p.file : new File([p.file], p.file.name, { type: inferredMime(p) });
          try {
            await addObjectFromFile(file);
            imported++;
          } catch {
            failed++; // skip-and-tally: one corrupt scan must not abort the rest of the folder
          }
        }
      }
    } finally {
      importStatus = null;
    }
    const summary = `Imported ${imported} file${imported === 1 ? "" : "s"} into ${groups.length} exhibit${groups.length === 1 ? "" : "s"}.${failed > 0 ? ` ${failed} couldn't be imported.` : ""}`;
    if (groups.length > 1) {
      // Several new exhibits — land where they're all visible; the rail's importNote isn't
      // rendered there, so the summary uses the app's dialog chrome.
      await backToLibrary();
      window.alert(summary);
    } else if (failed > 0) {
      importNote = summary;
    }
  }
  // IIIF manifest URL → exhibit (contributor-broadening ②, Archie-bc01): one paste bootstraps from
  // any institutional IIIF collection. Parsing is the lifted cozy-iiif algorithm subset
  // (iiif-import.ts); objects reference the REMOTE images (service base preferred — deep-zoomable),
  // so nothing is downloaded: the manifest's dims ride along and no OPFS bytes are written.
  async function newExhibitFromManifest(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    let json: unknown;
    try {
      const resp = await fetch(trimmed);
      if (!resp.ok) { window.alert(`Couldn't fetch that URL (HTTP ${resp.status}).`); return; }
      json = await resp.json();
    } catch {
      window.alert("Couldn't fetch that URL — check it's reachable (most IIIF servers allow cross-origin reads).");
      return;
    }
    let plan: ManifestPlan;
    try {
      plan = manifestToExhibit(json, trimmed);
    } catch (e) {
      window.alert(e instanceof ManifestImportError ? e.message : `Couldn't read that manifest: ${String(e)}`);
      return;
    }
    await newExhibit(plan.title);
    try {
      for (let i = 0; i < plan.objects.length; i++) {
        const o = plan.objects[i]!;
        importStatus = { name: o.label, index: i + 1, total: plan.objects.length };
        const ex = lib.meta.exhibits.find((e) => e.slug === currentSlug);
        if (!ex) break;
        await appendObject({ id: nextObjectId(ex), ...o });
      }
    } finally {
      importStatus = null;
    }
  }
  // CSV → notes bulk import (contributor-broadening ⑥ sub-cycle A, Archie-79c0): authors who live
  // in Excel/Sheets annotate THERE (object,x,y,w,h,comment[,tags][,reading] — header-driven) and
  // bulk-load the result through the SAME createNote path the seeds use. Skip-and-tally per row.
  async function importNotesCsv(file: File) {
    const plan = planCsvImport(await file.text(), {
      objects: OBJECTS.map((o) => ({ id: o.id, label: o.label, ...(o.mediaType ? { mediaType: o.mediaType } : {}) })),
      readings: currentReadings.map((r) => ({ id: r.id, name: r.name })),
      currentObjectId,
    });
    // Fix-and-retry friendly: re-importing a corrected CSV must not double the rows that were
    // already good — dedupe on target+comment against the live session.
    const keyFor = (target: unknown, comment: string) => `${JSON.stringify(target)}|${comment}`;
    const existing = new Set(session.entries.map((e) => keyFor(e.target, (Array.isArray(e.body) ? e.body : []).find((b) => b?.type === "TextualBody" && b.purpose !== "tagging")?.value ?? "")));
    let imported = 0, dup = 0;
    for (const n of plan.notes) {
      const [x, y, w, h] = n.region;
      const target = rectSel(canvasIdOf(n.objectId), x, y, w, h);
      const k = keyFor(target, n.comment);
      if (existing.has(k)) { dup++; continue; }
      existing.add(k);
      session.createNote({
        target,
        body: [
          { type: "TextualBody", value: n.comment, purpose: "commenting" },
          ...n.tags.map((t) => ({ type: "TextualBody" as const, value: t, purpose: "tagging" as const })),
        ],
        ...(n.reading ? { reading: n.reading } : {}),
      });
      imported++;
    }
    if (imported > 0) bump(); // rev + dirty + scheduleSave (a template stays playground-only per save()'s gate)
    const head = `Imported ${imported} note${imported === 1 ? "" : "s"} from CSV.`;
    const dupNote = dup > 0 ? ` ${dup} already imported.` : "";
    importNote = plan.skipped.length > 0
      ? `${head}${dupNote} Skipped ${plan.skipped.length}: ${plan.skipped.slice(0, 3).map((s) => `line ${s.row} — ${s.reason}`).join("; ")}${plan.skipped.length > 3 ? "; …" : ""}`
      : head + dupNote;
  }
  // W3C/WADM annotation import (contributor-broadening ⑦ slice A): an AnnotationPage from Archie's
  // own publish, Recogito, or any standard WADM producer lands on this exhibit — re-anchored by the
  // /canvas/<id> tail, selector + bodies verbatim, deduped like the CSV path.
  async function importNotesWadm(file: File) {
    let json: unknown;
    try { json = JSON.parse(await file.text()); }
    catch { importNote = `"${file.name}" isn't valid JSON.`; return; }
    const plan = planWadmImport(json, { objectIds: new Set(OBJECTS.map((o) => o.id)) });
    // Dedupe key spans target + ALL body values (tag-only annotations must not collapse together).
    const keyFor = (target: unknown, body: unknown) => `${JSON.stringify(target)}|${JSON.stringify(body)}`;
    const existing = new Set(session.entries.map((e) => keyFor(e.target, e.body ?? [])));
    let imported = 0, dup = 0;
    for (const n of plan.notes) {
      const target = { type: "SpecificResource" as const, source: canvasIdOf(n.objectId), selector: n.selector };
      const k = keyFor(target, n.body);
      if (existing.has(k)) { dup++; continue; }
      existing.add(k);
      session.createNote({ target, body: n.body }); // typed by the planner's rebuild — no casts
      imported++;
    }
    if (imported > 0) bump();
    const head = `Imported ${imported} annotation${imported === 1 ? "" : "s"}.`;
    const dupNote = dup > 0 ? ` ${dup} already imported.` : "";
    importNote = plan.skipped.length > 0
      ? `${head}${dupNote} Skipped ${plan.skipped.length}: ${plan.skipped.slice(0, 3).map((s) => `#${s.index} — ${s.reason}`).join("; ")}${plan.skipped.length > 3 ? "; …" : ""}`
      : head + dupNote;
  }
  // Open a published .archie.zip as the project — the symmetric inverse of Download: read it via
  // loadLibrary (publish↔load symmetry), then REPLACE the current OPFS project with its structure +
  // per-exhibit logs. In-lane: stays in the single OPFS project (the folder-autosave-in-place +
  // multi-"Project" abstraction is invention #3, gated — deferred). Destructive ⇒ confirm-gated.
  async function openZip(file: File) {
    let loaded: Awaited<ReturnType<typeof loadLibrary>>;
    try {
      loaded = await loadLibrary(ZipFilesystem.fromZip(new Uint8Array(await file.arrayBuffer())));
    } catch {
      window.alert("Couldn't read that file as an .archie.zip.");
      return;
    }
    if (loaded.library.exhibits.length === 0) { window.alert("That archive has no exhibits."); return; }
    if (!window.confirm("Open this archive as your project? Your current project will be replaced.")) return;
    await replaceProjectFrom(loaded);
    binding = { kind: "file", name: file.name }; // the zip you opened is now this Library's canonical file
    bindingError = null;
    bindingDirty = false;
    rememberBinding();
    // ⑧ (Archie-59a8): the summary panel — who wrote what in the copy you just opened. This IS
    // live co-editing's serverless approximation (the "N notes since your last import" indicator).
    collabNote = collabSummaryText(file.name, collabBreakdown(loaded.logs, author));
  }
  // Replace the current OPFS project with a loaded library (the shared body of "Open zip" + "Open folder"):
  // clear outgoing annotation dirs (no orphans under reused slugs), write each imported log, swap the meta.
  async function replaceProjectFrom(loaded: Awaited<ReturnType<typeof loadLibrary>>) {
    for (const e of lib.meta.exhibits) await clearExhibitAnnotations(e.slug);
    for (const e of loaded.library.exhibits) {
      const dir = await openExhibitAnnotationsDir(e.slug);
      if (dir) await new AnnotationSession(author, loaded.logs[e.slug] ?? []).save(dir, { baseUrl: BASE });
    }
    lib.setMeta({
      ...(loaded.library.title !== undefined ? { title: loaded.library.title } : {}),
      ...(loaded.library.summary !== undefined ? { summary: loaded.library.summary } : {}),
      ...rightsOf(loaded.library),
      exhibits: loaded.library.exhibits.map((e) => ({
        id: e.id, slug: e.slug, title: e.title, ...(e.summary !== undefined ? { summary: e.summary } : {}), ...(e.layout ? { layout: e.layout } : {}), ...((e as { mode?: string }).mode ? { mode: (e as { mode?: string }).mode } : {}),
        ...rightsOf(e),
        objects: e.objects.map((o) => ({ id: o.id, source: o.source, label: o.label, ...(o.summary !== undefined ? { summary: o.summary } : {}), ...(o.width !== undefined ? { width: o.width } : {}), ...(o.height !== undefined ? { height: o.height } : {}), ...(o.mediaType ? { mediaType: o.mediaType } : {}), ...(o.duration !== undefined ? { duration: o.duration } : {}), ...rightsOf(o) })),
      })),
    });
    await lib.persist();
    currentSlug = lib.meta.exhibits[0]!.slug;
    view = "library";
  }

  // --- add an object to the current exhibit (Phase D authoring) ---
  let addingObject = $state(false);
  // Import feedback (AV ingest/upload UX): a large recording can take a beat to land in OPFS, so show
  // which file is importing; `importNote` carries a transient curator-voice message (unsupported file,
  // or a gentle link-by-URL nudge for very large media). Cleared at the start of each new import.
  let importStatus = $state<{ name: string; index: number; total: number } | null>(null);
  let importNote = $state("");
  const LARGE_MEDIA_BYTES = 100 * 1024 * 1024; // ~100 MB — above this, suggest linking by URL (never blocks)
  let addSource = $state("");
  let addLabel = $state("");
  // Best-effort natural dimensions (IIIF wants them); resolves null if the URL can't be loaded.
  function imageDims(src: string): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  function nextObjectId(ex: ExhibitMeta): string {
    const existing = new Set(ex.objects.map((o) => o.id));
    let n = ex.objects.length + 1, id = `o${n}`;
    while (existing.has(id)) id = `o${++n}`;
    return id;
  }
  // Append an object to the current exhibit + persist; for imported files, keep its blob: URL.
  async function appendObject(obj: ObjectMeta, blobUrl?: string) {
    // Register the blob URL BEFORE the awaited persist (Archie-9db6): lib.appendObject sync-mutates the
    // store then awaits the OPFS write, and Svelte flushes the reactive graph during that await — so
    // `current` flips to this object before the await resolves. Setting assetUrls first means
    // `currentSource` resolves to the blob (not the raw /assets/ path) the instant Canvas mounts,
    // closing the first-import OSD open-failed race.
    if (blobUrl) assetUrls = { ...assetUrls, [obj.id]: blobUrl };
    await lib.appendObject(currentSlug, obj);
    currentObjectId = obj.id;
    addSource = "";
    addLabel = "";
    addingObject = false;
  }
  // Add by URL / public path (e.g. /voynich/herbal.jpg, or an audio/video URL → the AV editor).
  // AV INGEST (uploading a media file) stays gated (§152); referencing an existing AV URL does not.
  async function addObject(source: string, label: string) {
    const src = source.trim();
    if (!src) return;
    const ex = lib.meta.exhibits.find((e) => e.slug === currentSlug);
    if (!ex) return;
    const id = nextObjectId(ex);
    const mt = mediaTypeFromSource(src); // .mp3/.mp4/… → sound/video; else image (OSD)
    const dims = mt === "image" ? await imageDims(src) : null; // dimension-probe only makes sense for images
    await appendObject({ id, source: src, label: label.trim() || "Untitled object", ...(dims ? { width: dims.w, height: dims.h } : {}), ...(mt !== "image" ? { mediaType: mt } : {}) });
  }
  // Add a LOCAL image file: store bytes in OPFS (persists), source "/assets/{name}". For phone photos
  // with EXIF orientation (≠1), BAKE an upright display master (CONTEXT §89.1) — the original is
  // preserved beside it (assets-original/), provenance records the transform, and the object targets
  // the upright master so the coord layer stays orientation-blind.
  async function addObjectFromFile(file: File) {
    if (!storeReady) return; // OPFS unavailable — don't create an object whose bytes can't persist
    const ex = lib.meta.exhibits.find((e) => e.slug === currentSlug);
    if (!ex) return;
    const id = nextObjectId(ex);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    // AV INGEST (§152 gate lifted 2026-05-26, user): store an audio/video file as an OPFS asset — no EXIF/dims.
    // It renders in AvEditor (WaveSurfer waveform for audio · <video> for video). Local blob → no CORS on decode.
    if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
      const mediaType: "sound" | "video" = file.type.startsWith("video/") ? "video" : "sound";
      const avName = `${id}-${safe}`;
      await saveAssetFile(currentSlug, avName, file);
      await appendObject({ id, source: `${ASSET_PREFIX}${avName}`, label: file.name.replace(/\.[^.]+$/, "") || "Untitled object", mediaType }, URL.createObjectURL(file));
      if (file.size > LARGE_MEDIA_BYTES) {
        importNote = `Imported “${file.name}” (${Math.round(file.size / (1024 * 1024))} MB). For very large recordings, pasting a source URL keeps your library light — the archive links it instead of bundling the bytes.`;
      }
      return;
    }
    if (!file.type.startsWith("image/")) {
      importNote = `Archie can’t read “${file.name}” — add an image, audio, or video file.`;
      return;
    }

    const orientation = readExifOrientation(await file.arrayBuffer());
    let master: Blob = file;
    let name = `${id}-${safe}`;
    let dims: { w: number; h: number } | null = null;
    let provenance: ObjectProvenance | undefined;

    if (!isOrientationNoop(orientation)) {
      // EXIF path: upright PNG master, capped to the §80 display size; the untouched original is
      // preserved for citation (the master differs by rotation — provenance records the transform).
      const baked = await bakeDisplayMaster(file, { maxDim: MAX_MASTER_DIM }); // upright PNG; capped
      master = baked.blob;
      dims = { w: baked.width, h: baked.height };
      name = `${id}-${safe.replace(/\.[^.]+$/, "")}.png`;
      const originalName = `${id}-${safe}`;
      await saveOriginalFile(currentSlug, originalName, file); // preserve the untouched original
      provenance = { exifOrientation: orientation, transform: orientationTransform(orientation), originalName };
    } else {
      // No rotation needed. If the image exceeds the §80 cap, downscale to a display master PRESERVING
      // the source format (LARGE-MEDIA-MEMORY-CEILING #4) — a big JPEG stays JPEG. Under the cap → keep
      // the raw file untouched. No separate original: per §80 the bundle holds a display-sized image,
      // not an archive (the user's full-res source stays on their own disk; giant → external IIIF).
      // Decode ONCE to read dims; downscale only if over the cap, preserving the source format (a big JPEG
      // stays JPEG); under the cap the raw file is kept untouched (POLISH P6: one decode, no <img> probe).
      const prepared = await downscaleIfNeeded(file, MAX_MASTER_DIM, file.type || "image/jpeg");
      master = prepared.blob;
      dims = { w: prepared.width, h: prepared.height };
    }

    const blobUrl = URL.createObjectURL(master);
    if (!dims) dims = await imageDims(blobUrl); // orientation-1 path: probe the (upright) master
    await saveAssetFile(currentSlug, name, master);
    await appendObject(
      { id, source: `${ASSET_PREFIX}${name}`, label: file.name.replace(/\.[^.]+$/, "") || "Untitled object", ...(dims ? { width: dims.w, height: dims.h } : {}), ...(provenance ? { provenance } : {}) },
      blobUrl,
    );
  }
  async function addFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files);
    importNote = "";
    try {
      for (let i = 0; i < list.length; i++) {
        importStatus = { name: list[i]!.name, index: i + 1, total: list.length };
        await addObjectFromFile(list[i]!);
      }
    } finally {
      importStatus = null;
    }
  }
  // Drag-and-drop onto the canvas area.
  let dragOver = $state(false);
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    void addFiles(e.dataTransfer?.files ?? null);
  }

  let rev = $state(0);
  const bump = () => { rev += 1; dirty = true; scheduleSave(); };
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
  const drawArmed = $derived(creating !== null || framingSectionId !== null); // canvas in draw mode while either gesture is live
  const drawShape = $derived<DrawTool>(creating ?? "rectangle"); // framing always frames a box
  let readingFilter = $state("all"); // "all" | "base" | a reading id — scopes the list + new-note default (ADR-0007)
  let readingsOpen = $state(false); // the unified Readings drawer (name+colour+description in ONE place)
  let readingHelpOpen = $state(false); // first-add teaching modal (ADR-0007); gated by readingHelpSeen()
  // "+ Reading" click: teach the concept once (modal), then drop into the name input. Once seen, jump
  // straight to the input — the existing flow, untouched. Proceed/dismiss both mark it seen (no re-nag).
  function openReadings() {
    if (readingHelpSeen()) { readingsOpen = true; return; }
    readingHelpOpen = true; // first time: explain what a Reading IS, then open the drawer
  }
  function readingHelpProceed() { markReadingHelpSeen(); readingHelpOpen = false; readingsOpen = true; }
  function readingHelpClose() { markReadingHelpSeen(); readingHelpOpen = false; }
  // Which object of the exhibit the editor is showing. Switching resets transient view state.
  let currentObjectId = $state("o1");
  const current = $derived(OBJECTS.find((o) => o.id === currentObjectId) ?? OBJECTS[0]);
  const canvasId = $derived(canvasIdOf(currentObjectId));
  // AV objects (sound/video) get the temporal AvEditor instead of the OSD Canvas (draw tools too).
  const isAvCurrent = $derived(current?.mediaType === "sound" || current?.mediaType === "video");
  // The image URL the Canvas mounts: imported (/assets) objects resolve to their blob: URL.
  const currentSource = $derived(current ? (isAsset(current.source) ? (assetUrls[current.id] ?? current.source) : current.source) : "");
  // Resolved image URL for an object's rail thumbnail (asset → blob: URL; else a RENDERABLE derivative —
  // a bare IIIF service base isn't an image, so thumbnailUrl derives a sized JPEG; plain files pass through).
  const thumbSrc = (o: { id: string; source: string }): string => (isAsset(o.source) ? (assetUrls[o.id] ?? "") : thumbnailUrl(o.source, 240));
  function switchObject(id: string) {
    if (id === currentObjectId) return;
    currentObjectId = id;
    selected = null;
    editing = null;
    creating = null; // cancel any armed new-note gesture when changing objects
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

  // --- layout-picker (PROTOTYPE; CONTEXT §142): declare the exhibit's reading intent (single/grid/narrative).
  // Layout is authored structure → persist; it shapes the PUBLISHED exhibit (resolveLayout/Viewer), not this view.
  let layoutPickerOpen = $state(false);
  const currentLayout = $derived<LayoutType>(currentExhibit?.layout ?? "grid");
  const currentReadings = $derived<Reading[]>(currentExhibit?.readings ?? []);
  // Whether this exhibit has an overview scale (invention #1): NOT exactly one object (so: 0 to name/fill,
  // or >1 to arrange), or a narrative. MUST stay in sync with openExhibit's routing predicate above.
  const hasOverview = $derived((currentExhibit?.objects.length ?? 0) !== 1 || currentLayout === "narrative");
  // The current exhibit's notes, shaped for the NarrativeEditor's "add section from a Note" shortcut
  // (ADR-0005 mitigation): objectId from the target canvas, start = the selector fragment, lead = the prose.
  const narrativeNotes = $derived.by(() => {
    void rev; // re-derive when the log changes
    return session.notes().filter((r) => !r.deleted).map((r) => {
      const objectId = (srcOf(r.target) ?? "").split("/canvas/")[1] ?? "";
      const start = selectorValue(r);
      return { id: r.logicalId, objectId, ...(start ? { start } : {}), lead: stripMarkdown(commentOf(r)).slice(0, 80) || "(untitled)" };
    });
  });
  function setLayout(l: LayoutType) {
    lib.patchExhibit(currentSlug, { layout: l });
    layoutPickerOpen = false;
  }

  // --- Readings (ADR-0007): the exhibit's curated interpretive passes. Persisted on ExhibitMeta,
  // published as a registry + per-reading AnnotationPages. A note belongs to ONE reading or none (base). ---
  function setReadings(readings: Reading[]) {
    lib.patchExhibit(currentSlug, { readings });
  }
  // Reading colours (ADR-0007: colour identifies the reading; the viewer legend is a colour radio). The
  // curator may PICK one (Archie-1489) — auto-cycled as the sensible default so naming-and-go still works.
  const READING_PALETTE = ["#3a6b4c", "#a3553a", "#4c5d8a", "#8a6d3b", "#6b4c8a", "#3a7d8a"];
  function setNoteReading(reading: string | null) {
    if (!editing) return;
    session.editNote(editing as LogicalId, { reading });
    bump();
  }
  // Per-note emphasis (Archie-1489): EMPHASIS ONLY — opacity/weight, never hue (hue = the reading, ADR-0007).
  function setNoteEmphasis(emphasis: Emphasis) {
    if (!editing) return;
    session.editNote(editing as LogicalId, { emphasis });
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

  // Notes + working annotations are scoped to the CURRENT object's canvas (then the layer filter).
  const allNotes = $derived((rev, session.notes()));
  const objNotes = $derived(allNotes.filter((r) => srcOf(r.target) === canvasId));
  const notes = $derived(
    readingFilter === "all" ? objNotes : readingFilter === "base" ? objNotes.filter((r) => !r.reading) : objNotes.filter((r) => r.reading === readingFilter),
  );
  const objAnnotations = $derived<W3CAnnotation[]>((rev, session.workingAnnotations().filter((a) => srcOf(a.target) === canvasId)));
  const annotations = $derived<W3CAnnotation[]>(
    readingFilter === "all"
      ? objAnnotations
      : readingFilter === "base"
        ? objAnnotations.filter((a) => !(a as Record<string, unknown>)["archie:reading"])
        : objAnnotations.filter((a) => (a as Record<string, unknown>)["archie:reading"] === readingFilter),
  );
  const sel = $derived(notes.find((r) => r.logicalId === editing));
  const noteCountOf = (objId: string) => allNotes.filter((r) => srcOf(r.target) === canvasIdOf(objId)).length;
  // Live marker styling (Archie-1489) — mirrors the viewer's readingStyleOf so the curator authors against
  // what a visitor sees. Colour = the note's reading (ADR-0007); reading-less notes get a neutral forest-
  // green default (so base marks are visible). Per-note emphasis modulates opacity/weight ONLY, never hue.
  const BASE_MARKER = "#3a6b4c"; // forest green — the base (reading-less) note default
  function markerStyleOf(id: string): MarkerStyle | undefined {
    const a = objAnnotations.find((x) => x.id === id);
    if (!a) return undefined;
    const rid = (a as Record<string, unknown>)["archie:reading"] as string | undefined;
    const colour = (rid ? currentReadings.find((r) => r.id === rid)?.colour : undefined) ?? BASE_MARKER;
    const m = emphasisModifiers(emphasisOf(a));
    return { fill: colour, fillOpacity: Math.min(1, 0.18 * m.opacityMul), stroke: colour, strokeOpacity: Math.min(1, 0.95 * m.opacityMul), strokeWidth: 2 * m.strokeWidthMul };
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
    const id = session.createNote({ target: a.target, ...(readingFilter !== "all" && readingFilter !== "base" ? { reading: readingFilter } : {}) });
    bump();
    selected = id;
    creating = null; // the gesture produced its note; disarm back to ambient selection (ADR-0011)
  }
  const onUpdate = (a: W3CAnnotation) => { session.editNote(a.id as LogicalId, { target: a.target }); bump(); };
  const onDelete = (id: string) => { session.deleteNote(id as LogicalId); bump(); if (selected === id) selected = null; if (editing === id) editing = null; };
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
    const id = session.createNote({ target, body: [{ type: "TextualBody", value: "", purpose: "supplementing" }], motivation: "supplementing" });
    bump();
    selected = id;
  }
  // Import a WebVTT/SRT transcript for the current AV object → supplementing time notes. APPEND-ONLY
  // (archie-av Q-1, advisor): each cue becomes a new note even if it overlaps existing ones — no
  // destructive replace, no heuristic merge. Format-agnostic (importTranscript's parser handles both).
  function onImportTranscript(text: string) {
    const cued = importTranscript([], text, { source: canvasId, lastEditor: author });
    let n = 0;
    for (const r of cued) { session.createNote({ target: r.target, ...(r.body !== undefined ? { body: r.body } : {}), ...(r.motivation !== undefined ? { motivation: r.motivation } : {}) }); n++; }
    if (n > 0) { bump(); }
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
    session.editNote(editing as LogicalId, { body }); // reading carries forward; change it via setNoteReading
    bump();
  }
  // AV note time range (for the WADM form's conditional time fieldset). Null for image (xywh) notes.
  const selectorValue = (r: AnnotationRecord): string => ((r.target as { selector?: { value?: string } } | undefined)?.selector?.value) ?? "";
  const timeOf = (r: AnnotationRecord) => parseTimeFragment(selectorValue(r));
  function applyTime(start: number, end: number) {
    if (!editing) return;
    session.editNote(editing as LogicalId, { target: timeSel(canvasId, Math.max(0, start), Math.max(start, end)) });
    bump();
  }
  // mm:ss ⇄ seconds for the AV time fieldset (listening notes are second-precision). Parse is tolerant:
  // "1:30" or bare "90" both work; floor on display keeps it from ever rendering "1:60".
  const fmtMMSS = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function parseMMSS(v: string): number {
    const t = v.trim();
    if (t.includes(":")) { const [m, s] = t.split(":"); return (parseInt(m || "0", 10) || 0) * 60 + (parseFloat(s || "0") || 0); }
    return parseFloat(t) || 0;
  }

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
    // ⌘K — cite into the note/section being edited (works inside the textarea too).
    if (matches(e, "⌘K") && view === "editor" && sel) { e.preventDefault(); void requestCite(citeIntoComment); return; }
    // Esc dismiss-ladder: palette (self-closes) → note popover → camera framing → overview → library.
    if (matches(e, "Esc")) {
      if (cmdkOpen || mediaPickerOpen) return; // those dialogs handle their own Esc
      if (creating) { e.preventDefault(); creating = null; return; } // disarm a new-note gesture first
      if (framingSectionId) { e.preventDefault(); cancelFraming(); return; }
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
    // ones, or opt-in") — a template is a Playground example, not the author's content. Reuses the
    // existing isTemplate machinery; opt-in via includeTemplates for a populated demo publish.
    const source = opts.includeTemplates ? lib.meta.exhibits : lib.meta.exhibits.filter((ex) => !isTemplate(ex.slug));
    return {
      id: "demo",
      title: lib.meta.title ?? PROJECT_TITLE,
      ...(lib.meta.summary ? { summary: lib.meta.summary } : {}),
      ...rightsOf(lib.meta),
      exhibits: source.map((ex) => ({
        id: ex.id, slug: ex.slug, title: ex.title,
        ...(ex.summary ? { summary: ex.summary } : {}),
        ...(ex.layout ? { layout: ex.layout } : {}),
        ...(ex.mode ? { mode: ex.mode } : {}),
        ...(ex.sections && ex.sections.length ? { sections: ex.sections } : {}),
        ...(ex.readings && ex.readings.length ? { readings: ex.readings } : {}),
        ...rightsOf(ex),
        objects: ex.objects.map((o) => ({ id: o.id, source: o.source, label: o.label, ...(o.summary ? { summary: o.summary } : {}), ...(o.width !== undefined ? { width: o.width } : {}), ...(o.height !== undefined ? { height: o.height } : {}), ...(o.mediaType ? { mediaType: o.mediaType } : {}), ...(o.duration !== undefined ? { duration: o.duration } : {}), ...(o.provenance?.originalName ? { originalName: o.provenance.originalName } : {}), ...rightsOf(o) })),
      })),
    };
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
      if (ex.slug === currentSlug) { map[ex.id] = session.entries; continue; }
      const dir = await openExhibitAnnotationsDir(ex.slug);
      map[ex.id] = dir ? (await AnnotationSession.load(dir, author)).entries : [];
    }
    return map;
  }

  async function download() {
    // A.1 (LARGE-MEDIA-MEMORY-CEILING #3): build the publish tree, then STREAM the zip straight to a
    // file handle on Chromium (showSaveFilePicker) so the archive never fully materializes; elsewhere
    // fall back to the eager in-memory zip + anchor download. The 2× size guard applies ONLY to that
    // eager path — streaming holds ≈1× (the Map), not the zip copy on top.
    if (!supportsFileStreamSave() && !(await zipSizeOk())) return false; // large-library guard (#1), eager path only
    const logs = await loadAllLogs();
    const { fs, brokenLinks } = await libraryToZipFs(buildFullLibrary(), (id) => logs[id] ?? [], { baseUrl: BASE, getAsset: (slug, name) => readAssetBlob(slug, name) });
    if (brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
    // Returns whether a save actually HAPPENED — the dialog's done-download phase must not claim a
    // save the user cancelled in the picker (review: silent-failure family).
    try {
      await saveZipToDisk(fs, zipNameFor(PROJECT_TITLE));
      return true;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return false; // picker cancelled — not an error
      throw e;
    }
  }

  // --- publish (GH-Pages) ---
  let publishOpen = $state(false);
  let brokenLinks = $state<BrokenLink[]>([]); // intra-Library links that degrade to plain text on publish (surfaced in the dialog)
  let cachedSiteFs: MemoryFilesystem | null = null; // the no-originals projection from openPublish, reused by publish (no second projection)
  // Project the Library into the static site tree (in a MemoryFilesystem). Same projection the zip uses
  // — different sink. getAsset writes imported-image bytes in so collectFiles base64-encodes them for GH.
  // withOriginals (opt-in, chosen in the dialog) re-projects with preserved source files included.
  async function projectSite(withOriginals: boolean): Promise<{ fs: MemoryFilesystem; brokenLinks: BrokenLink[] }> {
    const logs = await loadAllLogs();
    const fs = new MemoryFilesystem();
    const { brokenLinks } = await publishLibrary(fs, buildFullLibrary(), (id) => logs[id] ?? [], { baseUrl: BASE, getAsset, ...(withOriginals ? { getOriginal: (slug: string, name: string) => readOriginalBytes(slug, name) } : {}) });
    if (brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
    return { fs, brokenLinks };
  }
  // Flatten the projected tree to the path→FileContent map the git-trees push consumes. A no-originals
  // publish reuses the tree openPublish already built; an originals publish re-projects (rare, opt-in).
  async function collectSiteFiles(withOriginals = false) {
    const fs = withOriginals || !cachedSiteFs ? (await projectSite(withOriginals)).fs : cachedSiteFs;
    return collectFiles(await fs.root());
  }
  // includeOriginals (opt-in from the Publish dialog) ships preserved originals to the public site for citation.
  // onProgress (from the dialog) reports the upload/commit/Pages steps so the long push isn't opaque.
  const publish = async (target: GitHubTarget, opts?: { includeOriginals?: boolean }, onProgress?: (p: PublishProgress) => void) =>
    publishToGitHub(await collectSiteFiles(opts?.includeOriginals ?? false), target, onProgress);
  // Size guard for the publish path — parity with download's zipSizeOk (publish has no streaming and
  // uploads file-by-file, so a huge library risks GitHub rate limits). Same threshold; publish-specific steer.
  async function publishSizeOk(): Promise<boolean> {
    const bytes = await estimateLibraryBytes();
    if (bytes < ZIP_WARN_BYTES) return true;
    const mb = Math.round(bytes / (1024 * 1024));
    return window.confirm(`This library is about ${mb} MB. Publishing uploads every file to GitHub one at a time, so a library this size may be slow or hit GitHub's rate limits.\n\nPublish anyway?`);
  }
  // Open the GitHub dialog immediately (no invisible gap), then project ONCE: caches the tree for the
  // publish itself and surfaces broken intra-Library links so the author sees them before publishing.
  async function openPublish() {
    if (!(await publishSizeOk())) return; // size guard before the network push (its confirm IS the feedback)
    brokenLinks = [];
    cachedSiteFs = null;
    publishOpen = true;
    const { fs, brokenLinks: bl } = await projectSite(false);
    cachedSiteFs = fs;
    brokenLinks = bl;
  }

  // Unified Publish menu (CONTEXT §"Local view loop") — ONE entry, two destinations: Locally (preview
  // in the Viewer) or GitHub Pages. The menu makes the host choice; each opens its flow dialog.
  // Templates already excluded by buildFullLibrary; "publish = same tree → per-host adapter".
  let publishDialogOpen = $state(false);
  /** Local flow: pick a folder + write the published tree; returns the folder name (null = cancelled). */
  async function localPublishFolder(): Promise<string | null> {
    await save(); // flush current edits so the published tree is current
    const handle = await pickFolder();
    if (!handle) return null;
    await writeToFolder(handle);
    return handle.name;
  }
  /** Local flow (non-Chromium, no folder picker): save the project zip; returns its filename. */
  async function localPublishZip(): Promise<string> {
    await save();
    await downloadProjectZip();
    return binding.kind === "file" && binding.name ? binding.name : zipNameFor(PROJECT_TITLE);
  }

  // --- Library-binding actions (invention #3). The persistence PRIMITIVES are reused as-is
  // (publishLibrary→folder · libraryToZip→download · loadLibrary←both) — the invention is the model +
  // chrome, not new plumbing. Folder = autosave-in-place (Chromium); file = explicit Save downloads the zip. ---
  const getAsset = (slug: string, name: string) => readAssetBlob(slug, name);
  let folderHandle: FileSystemDirectoryHandle | null = null; // cached so autosave doesn't re-hit IndexedDB
  let autosaving = false;
  /** Mark the Library unsaved-to-disk (only meaningful once bound). */
  function touchBinding() { if (binding.kind !== "unbound") bindingDirty = true; }
  function rememberBinding() {
    saveLastBinding(binding);
    const rec = recentFromBinding(binding, Date.now());
    if (rec) { recents = addRecent(recents, rec); saveRecents(recents); }
  }
  /** Write the whole published tree into a bound folder (the git / GH-Pages on-ramp). */
  async function writeToFolder(handle: FileSystemDirectoryHandle) {
    const logs = await loadAllLogs();
    await publishLibrary(new FsaFilesystem(handle), buildFullLibrary(), (id) => logs[id] ?? [], { baseUrl: BASE, getAsset });
  }
  // --- large-library memory guard (LARGE-MEDIA-MEMORY-CEILING #1): the .archie.zip is built ENTIRELY in
  // memory (~2× peak), so before a zip Save we sum the imported assets (metadata only — File.size, no byte
  // read) and, over a threshold, warn + STEER to the streaming sink (folder) or the no-bundle path (URL).
  // The folder sink streams to disk and isn't guarded; external-URL media is referenced, never summed. ---
  const ZIP_WARN_BYTES = 250 * 1024 * 1024; // ~250 MB
  async function estimateLibraryBytes(): Promise<number> {
    let total = 0;
    for (const ex of lib.meta.exhibits) {
      for (const o of ex.objects) {
        if (isAsset(o.source)) total += await assetSize(ex.slug, o.source.slice(ASSET_PREFIX.length));
      }
    }
    return total;
  }
  /** True = ok to build the in-memory zip. Over the threshold, confirm + steer (folder / link-by-URL). */
  async function zipSizeOk(): Promise<boolean> {
    const bytes = await estimateLibraryBytes();
    if (bytes < ZIP_WARN_BYTES) return true;
    const mb = Math.round(bytes / (1024 * 1024));
    const steer = canFolder
      ? "On this browser, “Save to disk” → choose a folder writes straight to disk without holding the whole archive in memory — better for a library this size."
      : "Tip: link large media by URL (paste a source URL in “+ Object”) so the archive references it instead of bundling the bytes.";
    return window.confirm(`This library is about ${mb} MB. A single .archie.zip is built entirely in memory and may be slow or fail on a library this large.\n\n${steer}\n\nBuild the zip anyway?`);
  }
  /** Download the whole library as a .archie.zip (non-Chromium "the zip IS the file"). False = user declined. */
  async function downloadProjectZip(): Promise<boolean> {
    if (!supportsFileStreamSave() && !(await zipSizeOk())) return false; // size guard (#1), eager path only
    const logs = await loadAllLogs();
    const { fs } = await libraryToZipFs(buildFullLibrary(), (id) => logs[id] ?? [], { baseUrl: BASE, getAsset });
    const name = binding.kind === "file" && binding.name ? binding.name : zipNameFor(PROJECT_TITLE);
    const r = await saveZipToDisk(fs, name); // Chromium streams to disk (A.1); else eager download
    return r.kind !== "cancelled"; // dismissed the picker → stay unsaved
  }
  /** Re-acquire a folder binding's handle + permission (needs a user gesture). Null + bindingError if lost. */
  async function reacquireFolder(): Promise<FileSystemDirectoryHandle | null> {
    if (binding.kind !== "folder") return null;
    const handle = folderHandle ?? (binding.handleKey ? await getHandle(binding.handleKey) : null);
    if (!handle) { bindingError = `Couldn't find "${binding.name}" — save as a new project to keep working.`; return null; }
    if ((await requestPermission(handle)) !== "granted") { bindingError = `Access to "${binding.name}" was declined — grant it, or save as a new project.`; return null; }
    folderHandle = handle;
    return handle;
  }
  /** Save to the bound location; if unbound, establish a binding (Save As). ⌘S / the Library Save button. */
  async function saveProject() {
    if (bindingBusy) return;
    bindingBusy = true; bindingError = null;
    try {
      await save(); // flush the current exhibit's edits to OPFS so the published tree is current
      if (binding.kind === "unbound") {
        if (canFolder) {
          const handle = await pickFolder();
          if (!handle) return;
          folderHandle = handle;
          binding = { kind: "folder", name: handle.name, handleKey: crypto.randomUUID() };
          await putHandle(binding.handleKey!, handle);
          await writeToFolder(handle);
        } else {
          binding = { kind: "file", name: zipNameFor(PROJECT_TITLE) };
          if (!(await downloadProjectZip())) return; // declined the large-library zip → stay unsaved
        }
      } else if (binding.kind === "folder") {
        const handle = await reacquireFolder();
        if (!handle) return;
        await writeToFolder(handle);
      } else {
        if (!(await downloadProjectZip())) return; // declined the large-library zip → stay unsaved
      }
      bindingDirty = false;
      rememberBinding();
    } finally { bindingBusy = false; }
  }
  /** Open a folder as the project (Chromium): pick → loadLibrary ← FsaFilesystem → replace OPFS project. */
  async function openProjectFolder() {
    if (bindingBusy) return;
    const handle = await pickFolder();
    if (!handle) return;
    bindingBusy = true; bindingError = null;
    try {
      let loaded: Awaited<ReturnType<typeof loadLibrary>>;
      try { loaded = await loadLibrary(new FsaFilesystem(handle)); }
      catch { window.alert("That folder doesn't hold an Archie library (no collection.json)."); return; }
      if (loaded.library.exhibits.length === 0) { window.alert("That folder has no exhibits."); return; }
      if (!window.confirm("Open this folder as your project? Your current project will be replaced.")) return;
      await replaceProjectFrom(loaded);
      folderHandle = handle;
      binding = { kind: "folder", name: handle.name, handleKey: crypto.randomUUID() };
      await putHandle(binding.handleKey!, handle);
      bindingDirty = false; rememberBinding();
    } finally { bindingBusy = false; }
  }
  /** The capability-routed Open (folder on Chromium, else the zip file picker). */
  function openProject() { if (canFolder) void openProjectFolder(); else zipInputEl?.click(); }
  /** Re-open a remembered project. Folder + reopenable → re-acquire its stored handle; else → the picker
   *  (browser security forbids silent file re-open — recents are hints, the "Word-doc 2003" model). */
  async function openRecent(r: RecentProject) {
    if (bindingBusy) return;
    if (!(r.kind === "folder" && r.reopenable)) { openProject(); return; }
    bindingBusy = true; bindingError = null;
    try {
      const handle = await getHandle(r.id);
      if (!handle || (await requestPermission(handle)) !== "granted") {
        bindingError = `Couldn't reopen "${r.name}" — open it again to re-grant access.`; return;
      }
      let loaded: Awaited<ReturnType<typeof loadLibrary>>;
      try { loaded = await loadLibrary(new FsaFilesystem(handle)); }
      catch { bindingError = `"${r.name}" no longer holds an Archie library.`; return; }
      if (!window.confirm(`Open "${r.name}"? Your current project will be replaced.`)) return;
      await replaceProjectFrom(loaded);
      folderHandle = handle;
      binding = { kind: "folder", name: handle.name, handleKey: r.id };
      bindingDirty = false; rememberBinding();
    } finally { bindingBusy = false; }
  }
  function forgetRecent(r: RecentProject) {
    recents = removeRecent(recents, r.id);
    saveRecents(recents);
    if (r.kind === "folder") void deleteHandle(r.id);
  }
  /** Detach from disk → back to this-browser-only. Keeps the OPFS working copy (Close ≠ delete). */
  function closeProject() {
    if (binding.kind === "folder" && binding.handleKey) void deleteHandle(binding.handleKey);
    folderHandle = null;
    binding = { kind: "unbound" };
    bindingError = null; bindingDirty = false;
    saveLastBinding(binding);
  }
  /** Folder autosave-in-place: mirror the tree to the bound folder after an OPFS save(). Fire-and-forget,
   *  guarded against overlap; if permission isn't yet granted it leaves bindingDirty for the explicit Save. */
  async function autosaveToFolder() {
    if (binding.kind !== "folder" || autosaving) return;
    autosaving = true;
    try {
      const handle = folderHandle ?? (binding.handleKey ? await getHandle(binding.handleKey) : null);
      if (handle && (await requestPermission(handle)) === "granted") {
        folderHandle = handle;
        await writeToFolder(handle);
        bindingDirty = false;
      }
    } catch { /* keep bindingDirty; explicit Save will surface the error */ }
    finally { autosaving = false; }
  }
  function onBindingKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveProject(); }
  }
</script>

<svelte:window onkeydown={(e) => { onGlobalKey(e); onBindingKey(e); }} />
<input bind:this={zipInputEl} type="file" accept=".zip,application/zip" style="display:none"
  onchange={(e) => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void openZip(f); el.value = ""; }} />

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
    oncreatefromfolder={(files) => { newExhibitFromFolder(files).catch((e) => window.alert(`Folder import failed: ${String(e)}`)); }}
    oncreatefrommanifest={(url) => { newExhibitFromManifest(url).catch((e) => window.alert(`Manifest import failed: ${String(e)}`)); }}
    {isTemplate}
    {binding}
    {bindingDirty}
    {bindingBusy}
    {bindingError}
    {recents}
    onsave={saveProject}
    onopenproject={openProject}
    onopenrecent={openRecent}
    onforgetrecent={forgetRecent}
    onclose={closeProject}
    onrecover={() => { closeProject(); void saveProject(); }}
    ondismisserror={() => (bindingError = null)}
    rights={{ ...(lib.meta.rights ? { rights: lib.meta.rights } : {}), ...(lib.meta.requiredStatement ? { requiredStatement: lib.meta.requiredStatement } : {}) }}
    onrights={setLibraryRights}
    libTitle={lib.meta.title}
    librarySummary={lib.meta.summary}
    ontitle={setLibraryTitle}
    onsummary={setLibrarySummary}
  />
{:else if view === "overview"}
  <div class="overview-stage">
    <ExhibitOverview
      title={currentExhibit.title}
      layout={currentLayout}
      objects={OBJECTS}
      {noteCountOf}
      thumbFor={(o) => (o.mediaType && o.mediaType !== "image") ? "" : thumbSrc(o)}
      onopenobject={openObject}
      onaddobject={() => { view = "editor"; addingObject = true; }}
      onsetlayout={() => (layoutPickerOpen = true)}
      onback={backToLibrary}
      onreorder={reorderObjects}
      rights={{ ...(currentExhibit.rights ? { rights: currentExhibit.rights } : {}), ...(currentExhibit.requiredStatement ? { requiredStatement: currentExhibit.requiredStatement } : {}) }}
      onrights={setExhibitRights}
      summary={currentExhibit.summary}
      ontitle={setExhibitTitle}
      onsummary={setExhibitSummary}
      onremove={removeCurrentExhibit}
    />
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
    <label>Reading
      <select bind:value={readingFilter}>
        <option value="all">All notes</option>
        <option value="base">Base only</option>
        {#each currentReadings as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
    </label>
    <button class="add-reading" onclick={openReadings} title="Name, colour, and describe the ways of reading this source — rival readings coexist, never merged">✎ Readings…</button>
    <button class="layout-trigger" onclick={() => (layoutPickerOpen = true)} title="How visitors read this exhibit (reading intent)">▦ {currentLayout}</button>
    {#if storeReady}
      <span class="savestate" class:dirty>{dirty ? "● Unsaved" : "Saved"}</span>
      <button onclick={() => void save()} disabled={!dirty}>Save</button>
    {/if}
    <button onclick={() => (publishDialogOpen = true)}>Publish & Share…</button>
    <button class="help-btn" onclick={() => (helpOpen = true)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts (press ?)">?</button>
  </header>

  <PropsDrawer open={readingsOpen} title="Readings" onclose={() => (readingsOpen = false)}>
    <ReadingsEditor readings={currentReadings} palette={READING_PALETTE} onchange={setReadings} onadd={(id) => (readingFilter = id)} />
  </PropsDrawer>

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
      <span class="no-objects">No objects yet — add one below to start annotating.</span>
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
      <form class="add-obj" onsubmit={(e) => { e.preventDefault(); void addObject(addSource, addLabel); }}>
        <label class="file-btn">Choose file…<input type="file" accept="image/*,audio/*,video/*" multiple onchange={(e) => { const el = e.currentTarget as HTMLInputElement; void addFiles(el.files).then(() => (el.value = "")); }} /></label>
        <span class="or">or</span>
        <input bind:value={addSource} placeholder="Source URL or /path (image / audio / video)" aria-label="Object source URL" title="Best for LARGE media: a URL links the file (the archive references it, never bundles the bytes) — keeps your .archie.zip small." />
        <input class="lbl" bind:value={addLabel} placeholder="Label" aria-label="Object label" />
        <button type="submit" disabled={addSource.trim() === ""}>Add</button>
        <button type="button" class="cancel" onclick={() => { addingObject = false; addSource = ""; addLabel = ""; }}>✕</button>
      </form>
    {:else}
      <button class="add-obj-toggle" onclick={() => (addingObject = true)}>+ Object</button>
    {/if}
    {#if importStatus}
      <span class="import-status" role="status" aria-live="polite">
        <span class="import-spinner" aria-hidden="true"></span>
        Importing “{importStatus.name}”…{#if importStatus.total > 1} ({importStatus.index} of {importStatus.total}){/if}
      </span>
    {/if}
    {#if importNote}
      <span class="import-note" role="status" aria-live="polite">{importNote}<button type="button" class="import-note-x" onclick={() => (importNote = "")} aria-label="Dismiss">✕</button></span>
    {/if}
  </nav>

  {#if framingSectionId}
    <!-- Loud cue that the canvas is in camera-framing mode, not note-drawing — with the way out. -->
    <div class="framing-banner" role="status">
      <span class="fb-tag">Framing camera</span>
      <span class="fb-msg">{isAvCurrent ? "Use “Set in” on the recording to mark this section’s moment." : "Draw a box on the canvas to frame this section’s camera — it isn’t a note."}</span>
      <button class="fb-cancel" onclick={cancelFraming}>Cancel <kbd>Esc</kbd></button>
    </div>
  {/if}

  <!-- The WADM edit form, declared ONCE as a snippet (ADR-0006): rendered as a marker-anchored POPOVER over
       the image canvas (below, in <main>), or INLINE in the sidebar for an AV object (no spatial marker yet —
       Wave-2 WaveSurfer). Declared at branch scope so both <aside> and <main> can @render it. -->
  {#snippet noteForm()}
    {#if sel}
      {@const comment = commentOf(sel)}
      {@const tags = tagsOf(sel).join(", ")}
      {@const reading = sel.reading ?? null}
      {@const emphasis = sel.emphasis ?? "normal"}
      {@const trange = timeOf(sel)}
      <form class="wadm" onsubmit={(e) => { e.preventDefault(); }}>
        <h3>Edit note</h3>
        <label>
          <span class="field-head">Comment<button type="button" class="cite" onclick={() => void requestCite(citeIntoComment)} title="Cite a note or exhibit (⌘K)">¶ Cite <kbd>⌘K</kbd></button><button type="button" class="cite" onclick={() => requestVisualCite(citeIntoComment)} title="Cite a note by its image">▦ Browse</button></span>
          <textarea bind:this={commentEl} rows="3" value={comment} onchange={(e) => applyForm((e.currentTarget as HTMLTextAreaElement).value, tags)}></textarea>
        </label>
        {#if trange}
          <fieldset class="time">
            <legend>Time (m:ss)</legend>
            <label class="t">Start<input type="text" inputmode="numeric" placeholder="m:ss" value={fmtMMSS(trange.start)} onchange={(e) => applyTime(parseMMSS((e.currentTarget as HTMLInputElement).value), trange.end ?? trange.start)} /></label>
            <label class="t">End<input type="text" inputmode="numeric" placeholder="m:ss" value={fmtMMSS(trange.end ?? trange.start)} onchange={(e) => applyTime(trange.start, parseMMSS((e.currentTarget as HTMLInputElement).value))} /></label>
          </fieldset>
        {/if}
        <label>Tags (comma-separated)<input value={tags} onchange={(e) => applyForm(comment, (e.currentTarget as HTMLInputElement).value)} /></label>
        <label>Reading
          <select value={reading ?? ""} onchange={(e) => setNoteReading((e.currentTarget as HTMLSelectElement).value || null)}>
            <option value="">— None (base) —</option>
            {#each currentReadings as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
          </select>
        </label>
        <label>Emphasis
          <select value={emphasis} onchange={(e) => setNoteEmphasis((e.currentTarget as HTMLSelectElement).value as Emphasis)} title="How much this mark stands out — its weight, not its colour (colour follows the reading)">
            <option value="muted">Muted — recede</option>
            <option value="normal">Normal</option>
            <option value="strong">Strong — stand out</option>
          </select>
        </label>
        <div class="wadm-actions">
          <button type="button" class="save" onclick={closeNote}>Save</button>
          <button type="button" class="del" onclick={() => onDelete(editing!)}>Delete note</button>
        </div>
      </form>
    {/if}
  {/snippet}

  <div class="body">
    <aside>
      {#if currentLayout === "narrative"}
        <!-- The narrative spine lives HERE, beside the object-local notes (placement correction): exhibit
             scope on top (persists across rail switches), object scope below (swaps). -->
        <NarrativeEditor
          sections={currentExhibit?.sections ?? []}
          objects={OBJECTS}
          {currentObjectId}
          framingId={framingSectionId}
          notes={narrativeNotes}
          onchange={setSections}
          onframe={startFraming}
          oncancelframe={cancelFraming}
          onrequestcite={requestCite}
        />
        <div class="scope-sep"><span>This object</span></div>
      {/if}
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
      <h2 class="eyebrow">{notes.length} notes</h2>
      {#if current && !isAvCurrent}
        <!-- ADR-0011: drawing is armed only by creating a note. Choose a shape, draw the region on the
             image, and the note is created at that locus — the canvas then returns to ambient selection. -->
        {#if creating}
          <div class="new-note armed" role="status">
            <span class="nn-msg">Draw the {creating === "rectangle" ? "box" : "outline"} on the image</span>
            <button type="button" class="nn-cancel" onclick={() => (creating = null)}>Cancel <kbd>Esc</kbd></button>
          </div>
        {:else}
          <div class="new-note">
            <span class="nn-lead">New note</span>
            <button type="button" onclick={() => (creating = "rectangle")} title="Draw a rectangular region">▭ Box</button>
            <button type="button" onclick={() => (creating = "polygon")} title="Trace an irregular outline">⬠ Outline</button>
          </div>
        {/if}
      {/if}
      {#if notes.length === 0}
        <p class="empty">{isAvCurrent ? "No notes on this recording yet. Play it, then “Set in” → “Add note” to mark a moment." : readingFilter === "all" ? "No notes on this object yet. Start a note above — choose Box or Outline, then draw the region." : readingFilter === "base" ? "No base notes here — switch Reading to “All notes”, or start a new note." : `No notes in the “${currentReadings.find((r) => r.id === readingFilter)?.name ?? readingFilter}” reading on this object.`}</p>
      {/if}
      <ul>
        {#each notes as r (r.rev)}
          <li class:sel={editing === r.logicalId}>
            <button onclick={() => (selected = r.logicalId)}>
              <div class="comment">{stripMarkdown(commentOf(r)) || "(untitled)"}</div>
              <div class="meta">
                {#each tagsOf(r) as t}<span class="tag">#{t}</span>{/each}
                <!-- border carries the reading colour; text stays ink so ANY user colour passes AA on paper (viewer Reader's border-only pattern) -->
                {#if r.reading}{@const rd = currentReadings.find((x) => x.id === r.reading)}<span class="layer" style={rd?.colour ? `border-color:${rd.colour}` : ""}>{rd?.name ?? r.reading}</span>{/if}
              </div>
            </button>
          </li>
        {/each}
      </ul>
      {#if current && !isAvCurrent}
        <!-- Bulk on-ramp for spreadsheet-first authors (⑥): regions are xywh, so image objects only. -->
        <button type="button" class="csv-import" onclick={() => csvEl?.click()} title="Columns: object, x, y, w, h, comment — optional tags, reading. Header row required; object may be an id, a label, or blank for this object.">… or import notes from a CSV</button>
        <input bind:this={csvEl} type="file" accept=".csv,text/csv" style="display:none" aria-label="Import notes from a CSV file"
          onchange={(e) => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void importNotesCsv(f).catch((err) => window.alert(`CSV import failed: ${String(err)}`)); el.value = ""; }} />
      {/if}
      <!-- WADM on-ramp (⑦): annotations exported by Archie, Recogito, or any W3C producer. -->
      <button type="button" class="csv-import" onclick={() => wadmEl?.click()} title="A W3C AnnotationPage (or Annotation array) — targets matching this exhibit's /canvas/<id> land on their objects.">… or import W3C annotations (JSON)</button>
      <input bind:this={wadmEl} type="file" accept=".json,application/json,application/ld+json" style="display:none" aria-label="Import W3C annotations from a JSON file"
        onchange={(e) => { const el = e.currentTarget as HTMLInputElement; const f = el.files?.[0]; if (f) void importNotesWadm(f).catch((err) => window.alert(`Annotation import failed: ${String(err)}`)); el.value = ""; }} />
      <p class="hint">{isAvCurrent ? "Play it · “Set in” → “Add note” marks a moment (video: “+ Region on frame” adds a box) · click a note to seek + edit it in the popover." : "Start a new note → choose a shape → draw the region · click a marker to edit it right there · its editor follows it as you pan/zoom."}</p>

      <!-- All notes (image / audio / video) edit in the marker popover anchored to their locus (in <main>);
           the sidebar is nav + the narrative spine only — no inline form (ADR-0006). -->

      <!-- Object-level rights (rights grill Q6): an INLINE disclosure in the object editor — you're
           already editing this object, so no separate drawer. Object = the truest provenance level. -->
      {#if current}
        <details class="rights-disc">
          <summary>Details &amp; rights{#if current.summary || current.rights || current.requiredStatement}<span class="dot" title="Set for this object">●</span>{/if}</summary>
          <DetailsEditor
            showTitle={false}
            summary={current.summary ?? ""}
            rights={{ ...(current.rights ? { rights: current.rights } : {}), ...(current.requiredStatement ? { requiredStatement: current.requiredStatement } : {}) }}
            scope="object"
            onsummary={setObjectSummary}
            onrights={setObjectRights}
            onremove={removeCurrentObject}
          />
        </details>
      {/if}
    </aside>
    <main
      bind:this={mainEl}
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
          <AvEditor source={currentSource} label={current.label} mediaType={current.mediaType} {annotations} bind:selected oncreate={onCreateTime} onimport={onImportTranscript}
            onmarkerrect={(r) => { notePos = r ? { left: r.right + 14, top: r.top } : null; }} />
        {/key}
      {:else if current && assetsReady}
        {#key canvasId}
          <Canvas source={currentSource} {canvasId} {annotations} tool={drawShape} drawing={drawArmed} styleOf={markerStyleOf} bind:selected oncreate={onCreate} onupdate={onUpdate} ondelete={onDelete}
            onmarkerrect={(r) => { notePos = r ? { left: r.right + 14, top: r.top } : null; }} />
        {/key}
      {:else if current}
        <div class="no-canvas">Loading…</div>
      {:else}
        <div class="no-canvas">Add an object — drop an image here, or use “+ Object” on the rail.</div>
      {/if}

      {#if sel && !drawArmed}
        <!-- The WADM form anchored to the selected marker (ADR-0006): an image's canvas marker OR an audio
             cue's waveform region (both stream their screen-rect via onmarkerrect → notePos). Offset off the
             marker, follows the surface, draggable by the grip; stopPropagation so dragging never pans OSD.
             HIDDEN in draw mode — a position:fixed popover would otherwise intercept the canvas pointer events
             that Annotorious needs to draw a new shape (it reappears on the new note once mode → select). -->
        <div class="note-popover" role="group" aria-label="Note editor" style={`left:${notePopoverPos.left}px; top:${notePopoverPos.top}px`} onpointerdown={(e) => e.stopPropagation()}>
          <button type="button" class="np-grip" onpointerdown={noteDragDown} onpointermove={noteDragMove} onpointerup={noteDragUp} onpointercancel={noteDragUp} title="Drag to move" aria-label="Move the note editor">⠿</button>
          {@render noteForm()}
        </div>
      {/if}
    </main>
  </div>

  <PublishDialog
    open={publishDialogOpen}
    canFolder={canFolder}
    onclose={() => (publishDialogOpen = false)}
    onfolder={localPublishFolder}
    onzip={localPublishZip}
    ongithub={() => { publishDialogOpen = false; void openPublish(); }}
    ondownload={download}
  />
  <Publish open={publishOpen} onclose={() => (publishOpen = false)} onpublish={publish} {brokenLinks} />
  <CmdK open={cmdkOpen} entries={cmdkEntries} onpick={insertCite} onclose={() => (cmdkOpen = false)} />
  <MediaPicker open={mediaPickerOpen} title="Cite a note by its image" items={mediaPickerItems} onpick={pickVisualCite} onclose={() => (mediaPickerOpen = false)} />
{/if}
{#if layoutPickerOpen}
  <!-- GLOBAL (outside the view branches): the layout picker is opened from BOTH the editor header AND the
       overview header. When it was scoped to the editor branch, the overview's ▦ could never render it —
       so a narrative layout couldn't be set from the overview → the "Sections" tab never appeared. -->
  <LayoutPicker current={currentLayout} onpick={setLayout} onclose={() => (layoutPickerOpen = false)} />
{/if}
<!-- GLOBAL: the ? shortcuts cheat-sheet (generated from the registry) — reachable from any view. -->
<ShortcutsHelp open={helpOpen} onclose={() => (helpOpen = false)} />
<!-- GLOBAL: first-add teaching for readings (ADR-0007) — shown once, then remembered. -->
<ReadingHelp open={readingHelpOpen} onproceed={readingHelpProceed} onclose={readingHelpClose} />
</div>

<style>
  /* "Curator's study at night": the header + canvas are the dark light table; the notes
     sidebar is a warm-paper notebook; forest green is the scholar's-ink accent. */
  .app { display: flex; flex-direction: column; height: 100vh; background: var(--surface-canvas); }

  /* Header — the light table's frame */
  header {
    display: flex; align-items: baseline; gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    background: var(--surface-canvas-raised);
    border-bottom: 1px solid var(--border-canvas);
  }
  .wordmark { font-family: var(--font-display); font-size: 1.4rem; font-weight: 600; color: var(--ink-canvas-primary); letter-spacing: 0.01em; margin: 0; }
  .sub { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-canvas-secondary); }
  .spacer { flex: 1; }
  /* Vertically centres the full-width ~80vh overview band (breathing room above/below; no frame). */
  .overview-stage { min-height: 100vh; display: flex; align-items: center; background: var(--surface-canvas); }
  .exhibit-back { background: none; border: none; cursor: pointer; padding: var(--space-2) var(--space-2) var(--space-2) 0; /* 24px+ hit box (Fitts) */ font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-canvas-secondary); align-self: center; }
  .exhibit-back:hover { color: var(--accent-2); }
  .no-objects { font-family: var(--font-ui); font-size: 0.78rem; color: var(--ink-canvas-secondary); align-self: center; }
  .no-canvas { display: flex; align-items: center; justify-content: center; height: 100%; padding: var(--space-8); text-align: center; font-family: var(--font-body); font-size: 1.125rem; color: var(--ink-canvas-secondary); }
  header label { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-canvas-secondary); display: flex; align-items: center; gap: var(--space-2); }

  header select, header > button {
    font-family: var(--font-ui); font-size: var(--text-ui-sm);
    padding: var(--space-1) var(--space-3);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-secondary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); cursor: pointer;
    transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
  }
  header > button:hover { color: var(--ink-canvas-primary); border-color: var(--border-canvas-emphasis); }
  header > button { color: var(--ink-canvas-primary); }
  header > button:disabled { color: var(--ink-canvas-muted); border-color: var(--border-canvas); cursor: default; }
  .savestate { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .savestate.dirty { color: var(--accent-2); }
  /* Reading-colour picker (Archie-1489): colour dots beside the new-reading name input. */
  .swatch { width: 15px; height: 15px; border-radius: 50%; padding: 0; cursor: pointer; border: 1px solid var(--border-canvas-emphasis); transition: box-shadow 100ms ease; }
  /* Identity chip — your name in the shared history (invention #6); mono like other identifiers. */
  .you { font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas); border-radius: 999px; padding: 1px var(--space-3); }
  /* The ? shortcuts button — a round, quiet affordance for the cheat-sheet. */
  header > button.help-btn { border-radius: 999px; min-width: 1.9rem; padding: var(--space-1) 0; text-align: center; font-weight: 700; }

  /* Playground banner — honest ephemerality (§115). Amber tint = transient/attention; the keep button
     carries the action accent (green). */
  .playground-banner { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-5); background: rgba(196, 155, 54, 0.1); border-bottom: 1px solid var(--border-canvas); border-left: 3px solid var(--semantic-warning); }

  /* ⑧ collaboration summary — amber transient family (the playground banner's tone, library scale). */
  .collab-note {
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
    margin: var(--space-4) var(--space-8) 0; padding: var(--space-3) var(--space-4);
    background: rgba(214, 162, 62, 0.1); border: 1px solid var(--accent-2); border-radius: var(--radius-sm);
  }
  .cn-msg { font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-canvas-primary); }
  .cn-x { background: none; border: none; cursor: pointer; padding: 6px var(--space-2); font-size: 1rem; color: var(--ink-canvas-secondary); }
  .pg-tag { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--semantic-warning); }
  .pg-msg { flex: 1; font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-canvas-secondary); }
  .pg-keep { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 600; padding: var(--space-1) var(--space-4); background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); }
  .pg-keep:hover { background: var(--accent-hover); }
  .pg-keep:disabled { opacity: 0.6; cursor: default; }

  /* Breadcrumb crumb — the object level of "Exhibit › Object" (the spine is exhibit-level, notes object-level). */
  .crumb { font-family: var(--font-display); font-size: 1.15rem; font-weight: 500; color: var(--ink-canvas-secondary); margin-left: var(--space-1); }
  /* New-note affordance (ADR-0011): the create entry in the notes pane. Choose a shape → draw the
     region. Paper surface (it lives in the sidebar). "Armed" state turns accent while drawing. */
  .new-note { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
  .new-note .nn-lead { font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 600; letter-spacing: 0.02em; color: var(--ink-paper-secondary); }
  .new-note > button { font-family: var(--font-ui); font-size: var(--text-ui-sm); padding: var(--space-1) var(--space-3); background: var(--surface-paper-card); color: var(--ink-paper-primary); border: 1px solid var(--border-paper); border-radius: var(--radius-sm); cursor: pointer; transition: color 120ms ease, border-color 120ms ease; }
  .new-note > button:hover { color: var(--accent); border-color: var(--accent); }
  .new-note.armed { gap: var(--space-3); padding: var(--space-2) var(--space-3); background: var(--accent-muted); border: 1px solid var(--accent); border-radius: var(--radius-sm); }
  .new-note .nn-msg { flex: 1; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 600; color: var(--accent); }
  .new-note .nn-cancel { font-family: var(--font-ui); font-size: var(--text-ui-sm); background: transparent; color: var(--ink-paper-secondary); border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm); padding: var(--space-1) var(--space-2); cursor: pointer; }
  .new-note .nn-cancel:hover { color: var(--ink-paper-primary); border-color: var(--ink-paper-secondary); }

  /* Framing banner — the canvas is capturing a SECTION camera, not a note (accent = action, with the way out). */
  .framing-banner { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-5); background: var(--accent-muted); border-bottom: 1px solid var(--border-canvas); border-left: 3px solid var(--accent); }
  .framing-banner .fb-tag { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
  .framing-banner .fb-msg { flex: 1; font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-canvas-primary); }
  .framing-banner .fb-cancel { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 600; padding: var(--space-1) var(--space-3); background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: var(--space-2); }
  .framing-banner .fb-cancel kbd { font-family: var(--font-mono); font-size: 0.62rem; color: var(--ink-canvas-muted); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); padding: 0 var(--space-1); }
  .framing-banner .fb-cancel:hover { border-color: var(--accent); color: var(--accent); }

  /* Scope separator — the line between exhibit-level (spine, above) and object-level (notes, below). */
  .scope-sep { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-3); }
  .scope-sep::after { content: ""; flex: 1; height: 1px; background: var(--border-paper); }
  .scope-sep span { font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-paper-muted); }

  /* Object rail — the exhibit's works laid along the table edge; the active one marked in forest green. */
  .objects {
    display: flex; gap: var(--space-2); align-items: stretch;
    padding: var(--space-2) var(--space-5);
    background: var(--surface-canvas-raised); border-bottom: 1px solid var(--border-canvas);
    overflow-x: auto; /* many objects scroll the rail, not the page (12 plates pushed the page to ~2900px) */
  }
  /* Object tab — a thumbnail + label so you choose visually (P2-6), not by name alone. */
  .obj {
    display: flex; align-items: center; gap: var(--space-2); cursor: pointer; text-align: left; max-width: 16rem;
    padding: var(--space-1) var(--space-2);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-secondary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
    transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
  }
  .obj:hover { color: var(--ink-canvas-primary); border-color: var(--border-canvas-emphasis); }
  .obj.on { background: var(--accent); color: var(--ink-on-accent); border-color: var(--accent); }
  .obj-thumb { flex-shrink: 0; width: 40px; height: 32px; border-radius: var(--radius-sm); background-color: var(--surface-canvas); background-size: cover; background-position: center; border: 1px solid var(--border-canvas); }
  .obj.on .obj-thumb { border-color: rgba(255,255,255,0.35); }
  .obj-meta { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .obj-label { font-family: var(--font-display); font-size: 1.0625rem; font-weight: 600; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .obj-count { font-family: var(--font-mono); font-size: 0.6rem; color: var(--accent-2); }
  .obj.on .obj-count { color: rgba(255,255,255,0.85); }

  /* Add-object affordance on the rail */
  .add-obj-toggle {
    align-self: center; cursor: pointer; padding: var(--space-1) var(--space-3);
    background: none; color: var(--ink-canvas-secondary);
    border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: var(--text-ui-sm); transition: color 120ms ease, border-color 120ms ease;
  }
  .add-obj-toggle:hover { color: var(--accent-2); border-color: var(--accent-2); }
  .add-obj { display: flex; align-items: center; gap: var(--space-2); }
  .add-obj input {
    font-family: var(--font-body); font-size: 0.875rem; padding: var(--space-1) var(--space-2);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); width: 14rem;
  }
  .add-obj input.lbl { width: 8rem; }
  .add-obj input:focus { outline: none; border-color: var(--accent-2); }
  .add-obj button { cursor: pointer; padding: var(--space-1) var(--space-3); font-family: var(--font-ui); font-size: var(--text-ui-sm); background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); }
  .add-obj button:disabled { background: var(--accent-muted); color: var(--ink-canvas-muted); border-color: transparent; cursor: default; }
  .add-obj .cancel { background: none; color: var(--ink-canvas-secondary); border-color: var(--border-canvas); }
  .add-obj .cancel:hover { color: var(--ink-canvas-primary); }
  /* Import feedback on the rail (AV ingest/upload UX): understated, over the dark light-table. The
     spinner is the scholar's-ink accent; the note is a quiet warning-toned line you can dismiss. */
  .import-status { display: inline-flex; align-items: center; gap: var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-canvas-secondary); white-space: nowrap; }
  .import-spinner { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--accent-muted); border-top-color: var(--accent); animation: import-spin 0.7s linear infinite; }
  @keyframes import-spin { to { transform: rotate(360deg); } }
  .import-note { display: inline-flex; align-items: center; gap: var(--space-2); max-width: 30rem; font-family: var(--font-ui); font-size: var(--text-ui-sm); line-height: 1.4; color: var(--ink-canvas-secondary); padding: var(--space-1) var(--space-3); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-left: 3px solid var(--semantic-warning); border-radius: var(--radius-sm); white-space: normal; }
  .import-note-x { flex-shrink: 0; cursor: pointer; background: none; border: none; color: var(--ink-canvas-muted); font-size: var(--text-ui-xs); padding: 0 var(--space-1); }
  .import-note-x:hover { color: var(--ink-canvas-primary); }
  /* File-pick button (hides the native input) + the "or" separator */
  .file-btn { display: inline-flex; align-items: center; cursor: pointer; padding: var(--space-1) var(--space-3); font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-canvas-primary); background: var(--surface-canvas-overlay); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); }
  .file-btn:hover { border-color: var(--accent-2); color: var(--accent-2); }
  .file-btn input { display: none; }
  .add-obj .or { font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-canvas-muted); }

  .body { display: flex; flex: 1; min-height: 0; }
  main { flex: 1; min-width: 0; background: var(--surface-canvas); position: relative; }
  /* Drag-and-drop import feedback over the light table */
  main.drag-over { outline: 2px dashed var(--accent-2); outline-offset: -8px; }

  /* Marker-anchored note editor (ADR-0006) — a paper card floating over the dark canvas, positioned by
     Canvas's onmarkerrect (+14px off the marker, donor PADDING) and following it on pan/zoom. */
  .note-popover {
    position: fixed; z-index: 50; width: 320px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
    overflow-y: auto; box-sizing: border-box;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-md);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  }
  .np-grip {
    display: block; width: 100%; cursor: grab; text-align: center; user-select: none;
    padding: 2px 0; font-size: 0.8rem; line-height: 1.4; color: var(--ink-paper-muted);
    background: var(--surface-paper-hover); border: none; border-bottom: 1px solid var(--border-paper);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }
  .np-grip:hover { color: var(--accent); }
  .np-grip:active { cursor: grabbing; }
  /* Inside the popover the form provides its own padding (the sidebar used to give it the surrounding space). */
  .note-popover .wadm { margin-top: 0; border-top: none; padding-top: 0; padding: var(--space-4); }

  /* Notes sidebar — the notebook (warm paper) */
  aside {
    width: 352px; flex-shrink: 0; overflow: auto; box-sizing: border-box;
    padding: var(--space-5);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  aside h2 { color: var(--ink-paper-secondary); margin: 0 0 var(--space-4); }
  /* Editable object label — reads as a title, reveals as an input on hover/focus */
  .object-title {
    display: block; width: 100%; box-sizing: border-box; margin: 0 0 var(--space-1);
    font-family: var(--font-display); font-size: 1.6rem; font-weight: 600; line-height: 1.1; color: var(--ink-paper-primary);
    background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm);
    padding: var(--space-1) 0;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .object-title:hover { border-color: var(--border-paper); }
  .object-title:focus { outline: none; background: var(--surface-paper-card); border-color: var(--accent); }
  ul { list-style: none; margin: 0; padding: 0; }

  /* Annotation note card */
  li button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4); margin-bottom: var(--space-2);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper); border-left: 3px solid transparent;
    border-radius: var(--radius-md);
    transition: background 120ms ease, border-color 120ms ease;
  }
  li button:hover { background: var(--surface-paper-hover); }
  li.sel button { border-color: var(--border-paper); border-left-color: var(--accent); background: var(--accent-muted); }
  .comment { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }
  .meta { margin-top: var(--space-2); display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
  .tag { font-family: var(--font-mono); font-size: 0.7rem; color: var(--accent); }
  .layer { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-paper-secondary); background: rgba(107,98,80,0.1); padding: 2px var(--space-2); border-radius: 999px; }
  .hint { font-family: var(--font-ui); font-size: var(--text-ui-md); color: var(--ink-paper-secondary); line-height: 1.6; margin-top: var(--space-4); }
  .csv-import { align-self: flex-start; background: none; border: none; cursor: pointer; padding: 6px 0; font-family: var(--font-ui); font-size: var(--text-ui-md); color: var(--ink-paper-secondary); } /* 24px+ hit box */
  .csv-import:hover { color: var(--accent); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.5; color: var(--ink-paper-secondary); padding: var(--space-4); border: 1px dashed var(--border-paper-emphasis); border-radius: var(--radius-md); }
  /* Object-level rights disclosure — tucked at the foot of the object editor (rights grill Q6). */
  .rights-disc { margin-top: var(--space-4); border-top: 1px solid var(--border-paper); padding-top: var(--space-3); }
  .rights-disc > summary {
    cursor: pointer; list-style: none; display: flex; align-items: center; gap: var(--space-2);
    font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-paper-secondary);
  }
  .rights-disc > summary::-webkit-details-marker { display: none; }
  .rights-disc > summary::before { content: "▸"; color: var(--ink-paper-muted); transition: transform 0.15s; }
  .rights-disc[open] > summary::before { content: "▾"; }
  .rights-disc > summary .dot { color: var(--accent); font-size: 0.6rem; }
  .rights-disc > :global(.rights) { margin-top: var(--space-3); }

  /* WADM form — editing on paper */
  .wadm { margin-top: var(--space-5); border-top: 1px solid var(--border-paper); padding-top: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
  .wadm h3 { margin: 0; font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; color: var(--ink-paper-primary); }
  .wadm label { display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  /* Comment field header: label + the ⌘K "Cite" link affordance (forest-green, system.md §19). */
  .wadm .field-head { display: flex; align-items: center; justify-content: space-between; }
  .wadm .cite {
    display: inline-flex; align-items: center; gap: var(--space-1); cursor: pointer;
    background: none; border: none; padding: 0;
    font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.03em; text-transform: none;
    color: var(--accent);
  }
  .wadm .cite:hover { color: var(--accent-hover); }
  .wadm .cite kbd { font-family: var(--font-mono); font-size: 0.62rem; color: var(--ink-paper-muted); background: var(--surface-paper-hover); border: 1px solid var(--border-paper); border-radius: var(--radius-sm); padding: 0 var(--space-1); }
  .wadm textarea, .wadm input:not([type]) {
    font-family: var(--font-body); font-size: 1rem; padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm);
  }
  .wadm textarea:focus, .wadm input:focus { outline: none; border-color: var(--accent); }
  .wadm fieldset { border: 1px solid var(--border-paper); border-radius: var(--radius-sm); display: flex; gap: var(--space-4); padding: var(--space-2) var(--space-3); }
  /* AV time fieldset — start/end mm:ss inputs (the time note's geometry) */
  .wadm .time .t { flex-direction: column; gap: var(--space-1); }
  .wadm .time input {
    width: 6rem; font-family: var(--font-mono); font-size: 0.9rem; padding: var(--space-1) var(--space-2);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm);
  }
  .wadm .time input:focus { outline: none; border-color: var(--accent); }
  .wadm legend { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-paper-muted); padding: 0 var(--space-1); }
  .del { align-self: flex-start; font-family: var(--font-ui); font-size: 0.8rem; padding: var(--space-1) var(--space-3); background: none; color: var(--accent); border: 1px solid var(--accent-muted); border-radius: var(--radius-sm); cursor: pointer; }
  .del:hover { background: var(--accent-muted); border-color: var(--accent); }
  /* Note-editor action row — Save (commit + close the popover) beside Delete. */
  .wadm-actions { display: flex; align-items: center; gap: var(--space-3); }
  .save { cursor: pointer; font-family: var(--font-ui); font-size: 0.8rem; font-weight: 600; padding: var(--space-1) var(--space-4); background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); }
  .save:hover { background: var(--accent-hover); }
</style>

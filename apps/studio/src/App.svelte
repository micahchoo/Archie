<script lang="ts">
  // Studio editor (Phase-2 UI, browser-verified later). Real annotate loop over the headless-
  // tested @render/core AnnotationSession: draw on the canvas → create note → edit body/tags/
  // layers in the WADM form → publish to .archie.zip. Logic lives in core; this is the thin shell.
  import { onMount, tick } from "svelte";
  import Canvas from "@render/svelte/Canvas.svelte";
  import { stripMarkdown } from "@render/svelte";
  import MergeReview from "./MergeReview.svelte";
  import Publish from "./Publish.svelte";
  import LibraryHome from "./LibraryHome.svelte";
  import CmdK from "./CmdK.svelte";
  import AvEditor from "./AvEditor.svelte";
  import LayoutPicker from "./LayoutPicker.svelte";
  import IdentityPrompt from "./IdentityPrompt.svelte";
  import ExhibitOverview from "./ExhibitOverview.svelte";
  import {
    AnnotationSession, libraryToZip, asClientId, mintRevId, encodeLinkRef,
    MemoryFilesystem, ZipFilesystem, FsaFilesystem, publishLibrary, loadLibrary, collectFiles, publishToGitHub,
    readExifOrientation, isOrientationNoop, orientationTransform,
    mediaTypeFromSource, timeFragmentValue, parseTimeFragment, importTranscript,
    bindingLabel, recentFromBinding, addRecent, removeRecent,
    type LogicalId, type Library, type LayoutType, type W3CAnnotation, type W3CBody, type AnnotationRecord, type AnnotationLog, type FsDirectory, type GitHubTarget, type Binding, type RecentProject, type BrokenLink, type Section,
  } from "@render/core";
  import type { DrawTool } from "@render/mount";
  import { bakeDisplayMaster } from "./bake.js";
  import { openExhibitAnnotationsDir, loadLibraryMeta, saveLibraryMeta, saveAssetFile, saveOriginalFile, readAssetUrl, readAssetBytes, readOriginalBytes, clearExhibitAnnotations, type ExhibitMeta, type LibraryMeta, type ObjectMeta, type ObjectProvenance } from "./store.js";
  import { supportsFolderPicker, pickFolder, downloadZip, zipNameFor, loadRecents, saveRecents, loadLastBinding, saveLastBinding } from "./binding.js";
  import { putHandle, getHandle, deleteHandle, requestPermission } from "./handles-db.js";
  import { voynichObjects, voynichNotes, voynichTitle } from "./voynich.js";
  import { bidarObject, bidarNotes, bidarTitle } from "./bidar.js";

  const BASE = "https://archie.demo/";
  // Local display name → the clientId stamped as lastEditor in the merge DAG (CONTEXT invention #6).
  // Persisted in localStorage (metadata, not content). null = never prompted (ask on first Import);
  // "" = skipped (Anonymous); else the chosen name. `author` derives from it for any NEW session.
  const IDENTITY_KEY = "archie.displayName.v1";
  function loadIdentity(): string | null { try { return localStorage.getItem(IDENTITY_KEY); } catch { return null; } }
  function saveIdentity(name: string): void { try { localStorage.setItem(IDENTITY_KEY, name); } catch { /* storage off */ } }
  let identity = $state<string | null>(loadIdentity());
  const author = $derived(asClientId(identity || "anonymous"));
  const srcOf = (t: unknown): string | undefined => (typeof t === "string" ? t : (t as { source?: string } | null)?.source);

  // AV fixture — MIRRORS the Viewer's `av` exhibit (same real Bidar recording + same descriptive cues),
  // so authoring matches what publishes. A dholak geet recorded on the PiZ mesh; cues are descriptive
  // listening notes (supplementing), not a verbatim transcript.
  const AV_SOURCE = "https://one.compost.digital/micah/annotation-assets/8/DholakGeet_Recording_on_the_PiZ_Network_recorder_by_Woman_Singer_at_Faizpura-_02.mp3";
  const AV_CUES: { start: number; end: number; text: string }[] = [
    { start: 0, end: 20, text: "A dholak sets the pulse; a woman's voice enters over the drum — a geet carried on the mesh from Faizpura." },
    { start: 20, end: 50, text: "The melody settles into its refrain; you can hear the room — the recorder is a Raspberry Pi node on the network." },
    { start: 50, end: 90, text: "Other voices answer around her; the song is communal, sung with the room rather than performed for the mic." },
    { start: 90, end: 180, text: "It loosens into talk and ambient sound — the field recording keeps running past the song." },
  ];

  // The default exhibits on first run: the imported Voynich manuscript (./voynich.ts, grid), the
  // "Techno-Futures from Bidar" COMPOST piece (./bidar.ts, single), and an AV exhibit (the mesh recording).
  const DEFAULT_EXHIBITS: ExhibitMeta[] = [
    { id: "ex-voynich", slug: "voynich", title: voynichTitle, layout: "grid", objects: voynichObjects.map((o) => ({ id: o.id, source: o.source, label: o.label, width: o.width, height: o.height })) },
    { id: "ex-bidar", slug: "bidar", title: bidarTitle, layout: "single", seedVersion: 2, objects: [{ id: bidarObject.id, source: bidarObject.source, label: bidarObject.label, width: bidarObject.width, height: bidarObject.height }] },
    { id: "ex-av", slug: "av", title: "A Field Recording from Bidar", layout: "single", seedVersion: 1, objects: [{ id: "o1", source: AV_SOURCE, label: "Dholak Geet — recorded on the mesh, Faizpura", mediaType: "sound" }] },
  ];

  // --- library / exhibit state (authored structure; persisted at {PROJECT}/library.json) ---
  let libraryMeta = $state<LibraryMeta>({ exhibits: DEFAULT_EXHIBITS });
  let view = $state<"library" | "overview" | "editor">("library");
  // Per-exhibit Playground/Project (CONTEXT §115, the coherent model): a bundled EXAMPLE is a template —
  // opening it is a playground (banner, nothing saved); a USER-CREATED exhibit is a project (saved, no
  // banner). One role per exhibit, one path in/out. "Keep a copy" forks an example into a saved exhibit.
  const templateSlugs = new Set(DEFAULT_EXHIBITS.map((d) => d.slug));
  const isTemplate = (slug: string) => templateSlugs.has(slug);
  let currentSlug = $state(DEFAULT_EXHIBITS[0]!.slug);
  const currentExhibit = $derived(libraryMeta.exhibits.find((e) => e.slug === currentSlug) ?? libraryMeta.exhibits[0]);
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
  // two default exhibits carry their own real content (Voynich folios; the Bidar piece's prose).
  function seededVoynich(): AnnotationSession {
    const s = new AnnotationSession(author);
    for (const n of voynichNotes) {
      const [x, y, w, h] = n.region;
      s.createNote({ target: rectSel(`${BASE}voynich/canvas/${n.objectId}`, x, y, w, h), body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }] });
    }
    return s;
  }
  function seededBidar(): AnnotationSession {
    const s = new AnnotationSession(author);
    for (const n of bidarNotes) {
      const [x, y, w, h] = n.region;
      s.createNote({ target: rectSel(`${BASE}bidar/canvas/o1`, x, y, w, h), body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }] });
    }
    return s;
  }
  function seededAv(): AnnotationSession {
    const s = new AnnotationSession(author);
    for (const c of AV_CUES) {
      s.createNote({ target: timeSel(`${BASE}av/canvas/o1`, c.start, c.end), body: [{ type: "TextualBody", value: c.text, purpose: "supplementing" }], motivation: "supplementing" });
    }
    return s;
  }
  const seededFor = (slug: string): (() => AnnotationSession) | null =>
    slug === "voynich" ? seededVoynich : slug === "bidar" ? seededBidar : slug === "av" ? seededAv : null;
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
  const PROJECT_TITLE = "Archie Library";
  const bindingPlace = $derived(bindingLabel(binding));
  let zipInputEl = $state<HTMLInputElement | null>(null); // hidden picker for "Open" on non-Chromium
  // The library STRUCTURE always persists (which exhibits exist is real; examples are bundled defaults
  // reconciled on boot). Only an EXAMPLE's annotations are ephemeral — gated in save() on isTemplate.
  async function persistLibrary(): Promise<void> { await saveLibraryMeta(libraryMeta); touchBinding(); }
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
      const reconciled = DEFAULT_EXHIBITS.map((d) => {
        const p = meta.exhibits.find((e) => e.slug === d.slug);
        if (isStale(d, p)) { stale.push(d.slug); return d; }
        return p!;
      });
      const userExhibits = meta.exhibits.filter((e) => !templateSlugs.has(e.slug));
      libraryMeta = { exhibits: [...reconciled, ...userExhibits] };
      for (const slug of stale) await clearExhibitAnnotations(slug); // discard stale seed notes → reseed
      if (stale.length) await persistLibrary();
    } else {
      await persistLibrary(); // first run — persist the defaults
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
    const ex = libraryMeta.exhibits.find((e) => e.slug === slug);
    currentObjectId = ex?.objects[0]?.id ?? "o1";
    selected = null;
    editing = null;
    mode = "select";
    conflicts = [];
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
    conflicts = session.conflicts(); // surface any persisted unresolved merge in the panel
    rev += 1;
    // Land at the exhibit's OVERVIEW scale (invention #1) when there's more than one object to arrange,
    // or it's a narrative; a single-object exhibit goes straight to its annotation surface.
    view = ((ex?.objects.length ?? 0) > 1 || (ex?.layout ?? "grid") === "narrative") ? "overview" : "editor";
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
  // Persist the authored narrative spine (NarrativeEditor onchange) → ExhibitMeta.sections → publishes as
  // IIIF Ranges (buildFullLibrary → toRanges). Library STRUCTURE persists ungated (sections aren't notes).
  function setSections(sections: Section[]) {
    libraryMeta = { exhibits: libraryMeta.exhibits.map((e) => (e.slug === currentSlug ? { ...e, sections } : e)) };
    void persistLibrary();
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
    libraryMeta = { exhibits: libraryMeta.exhibits.map((e) => (e.slug === ex.slug ? { ...e, objects: next } : e)) };
    void persistLibrary();
  }

  // "Keep a copy" (§115 conversion): fork the current EXAMPLE (playground) into a saved, user-owned
  // exhibit, carrying the current notes (retargeted to the copy's canvas IRIs) — so the work you did
  // while trying the template isn't lost. The copy is a project (persists; no banner). Single example
  // in hand ⇒ nothing else to lose (§146 trap avoided by construction).
  let keeping = $state(false);
  async function keepCopy() {
    const ex = libraryMeta.exhibits.find((e) => e.slug === currentSlug);
    if (!ex || !isTemplate(currentSlug)) return;
    keeping = true;
    const from = currentSlug;
    let slug = `${ex.slug}-copy`, n = 2;
    while (libraryMeta.exhibits.some((e) => e.slug === slug)) slug = `${ex.slug}-copy-${n++}`;
    const { seedVersion: _omit, ...rest } = ex; // a user copy is not a reconciled default
    const copy: ExhibitMeta = { ...rest, id: `ex-${slug}`, slug, title: `${ex.title} (copy)`, objects: ex.objects.map((o) => ({ ...o })) };
    libraryMeta = { exhibits: [...libraryMeta.exhibits, copy] };
    // Re-create the current head notes against the copy's canvas IRIs (fresh records — it's new content).
    const fromBase = `${BASE}${from}/canvas/`, toBase = `${BASE}${slug}/canvas/`;
    const carried = session.notes().filter((r) => !r.deleted).map((r) => {
      const src = srcOf(r.target);
      const target = src && src.startsWith(fromBase) && typeof r.target !== "string"
        ? { ...(r.target as object), source: toBase + src.slice(fromBase.length) } : r.target;
      return { target, body: r.body, motivation: r.motivation, layers: r.layers };
    });
    await persistLibrary();
    await openExhibit(slug); // not a template → persists; seeds empty
    for (const c of carried) session.createNote({ target: c.target, ...(c.body !== undefined ? { body: c.body } : {}), ...(c.motivation !== undefined ? { motivation: c.motivation } : {}), ...(c.layers !== undefined ? { layers: c.layers } : {}) });
    rev += 1;
    await save();
    keeping = false;
  }
  // Create a new exhibit (no objects yet — add them in the editor), persist, and open it.
  async function newExhibit(title: string) {
    const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exhibit";
    let slug = base, n = 2;
    while (libraryMeta.exhibits.some((e) => e.slug === slug)) slug = `${base}-${n++}`;
    libraryMeta = { exhibits: [...libraryMeta.exhibits, { id: `ex-${slug}`, slug, title: title.trim() || "Untitled exhibit", layout: "grid", objects: [] }] };
    await persistLibrary();
    await openExhibit(slug);
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
  }
  // Replace the current OPFS project with a loaded library (the shared body of "Open zip" + "Open folder"):
  // clear outgoing annotation dirs (no orphans under reused slugs), write each imported log, swap the meta.
  async function replaceProjectFrom(loaded: Awaited<ReturnType<typeof loadLibrary>>) {
    for (const e of libraryMeta.exhibits) await clearExhibitAnnotations(e.slug);
    for (const e of loaded.library.exhibits) {
      const dir = await openExhibitAnnotationsDir(e.slug);
      if (dir) await new AnnotationSession(author, loaded.logs[e.slug] ?? []).save(dir, { baseUrl: BASE });
    }
    libraryMeta = {
      exhibits: loaded.library.exhibits.map((e) => ({
        id: e.id, slug: e.slug, title: e.title, ...(e.layout ? { layout: e.layout } : {}), ...((e as { mode?: string }).mode ? { mode: (e as { mode?: string }).mode } : {}),
        objects: e.objects.map((o) => ({ id: o.id, source: o.source, label: o.label, ...(o.width !== undefined ? { width: o.width } : {}), ...(o.height !== undefined ? { height: o.height } : {}), ...(o.mediaType ? { mediaType: o.mediaType } : {}), ...(o.duration !== undefined ? { duration: o.duration } : {}) })),
      })),
    };
    await persistLibrary();
    currentSlug = libraryMeta.exhibits[0]!.slug;
    view = "library";
  }

  // --- add an object to the current exhibit (Phase D authoring) ---
  let addingObject = $state(false);
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
    libraryMeta = { exhibits: libraryMeta.exhibits.map((e) => (e.slug === currentSlug ? { ...e, objects: [...e.objects, obj] } : e)) };
    await persistLibrary();
    if (blobUrl) assetUrls = { ...assetUrls, [obj.id]: blobUrl };
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
    const ex = libraryMeta.exhibits.find((e) => e.slug === currentSlug);
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
    if (!file.type.startsWith("image/")) return;
    if (!storeReady) return; // OPFS unavailable — don't create an object whose bytes can't persist
    const ex = libraryMeta.exhibits.find((e) => e.slug === currentSlug);
    if (!ex) return;
    const id = nextObjectId(ex);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const orientation = readExifOrientation(await file.arrayBuffer());
    let master: Blob = file;
    let name = `${id}-${safe}`;
    let dims: { w: number; h: number } | null = null;
    let provenance: ObjectProvenance | undefined;

    if (!isOrientationNoop(orientation)) {
      const baked = await bakeDisplayMaster(file); // upright PNG; dims from the decoded bitmap
      master = baked.blob;
      dims = { w: baked.width, h: baked.height };
      name = `${id}-${safe.replace(/\.[^.]+$/, "")}.png`;
      const originalName = `${id}-${safe}`;
      await saveOriginalFile(currentSlug, originalName, file); // preserve the untouched original
      provenance = { exifOrientation: orientation, transform: orientationTransform(orientation), originalName };
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
    for (const f of Array.from(files)) await addObjectFromFile(f);
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
  let mode = $state<"select" | "draw">("select");
  let tool = $state<DrawTool>("rectangle");
  let layerFilter = $state("all");
  // Which object of the exhibit the editor is showing. Switching resets transient view state.
  let currentObjectId = $state("o1");
  const current = $derived(OBJECTS.find((o) => o.id === currentObjectId) ?? OBJECTS[0]);
  const canvasId = $derived(canvasIdOf(currentObjectId));
  // AV objects (sound/video) get the temporal AvEditor instead of the OSD Canvas (draw tools too).
  const isAvCurrent = $derived(current?.mediaType === "sound" || current?.mediaType === "video");
  // The image URL the Canvas mounts: imported (/assets) objects resolve to their blob: URL.
  const currentSource = $derived(current ? (isAsset(current.source) ? (assetUrls[current.id] ?? current.source) : current.source) : "");
  // Resolved image URL for an object's rail thumbnail (asset → blob: URL, else its path/URL).
  const thumbSrc = (o: { id: string; source: string }): string => (isAsset(o.source) ? (assetUrls[o.id] ?? "") : o.source);
  function switchObject(id: string) {
    if (id === currentObjectId) return;
    currentObjectId = id;
    selected = null;
    editing = null;
    mode = "select";
  }
  // Rename an object (its label is authored structure → persist to library.json). Empty = ignored.
  function renameObject(objId: string, label: string) {
    const l = label.trim();
    if (!l) return;
    libraryMeta = { exhibits: libraryMeta.exhibits.map((e) => (e.slug === currentSlug ? { ...e, objects: e.objects.map((o) => (o.id === objId ? { ...o, label: l } : o)) } : e)) };
    void persistLibrary();
  }

  // --- layout-picker (PROTOTYPE; CONTEXT §142): declare the exhibit's reading intent (single/grid/narrative).
  // Layout is authored structure → persist; it shapes the PUBLISHED exhibit (resolveLayout/Viewer), not this view.
  let layoutPickerOpen = $state(false);
  const currentLayout = $derived<LayoutType>(currentExhibit?.layout ?? "grid");
  // Whether this exhibit has an overview scale (invention #1): >1 object to arrange, or a narrative.
  const hasOverview = $derived((currentExhibit?.objects.length ?? 0) > 1 || currentLayout === "narrative");
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
    libraryMeta = { exhibits: libraryMeta.exhibits.map((e) => (e.slug === currentSlug ? { ...e, layout: l } : e)) };
    void persistLibrary();
    layoutPickerOpen = false;
  }

  // --- collaboration (Import changes → review) ---
  let conflicts = $state<string[]>([]);
  let synced = $state(0);
  let identityOpen = $state(false); // the first-Import display-name prompt (invention #6)
  // Adopt a display name (or "" = Anonymous), then run the deferred import. The live session captured the
  // OLD clientId at open, so rebuild it (keeping the log) with the new clientId — else this session's
  // edits would still read as the old name in the merge panel.
  function setIdentity(name: string) {
    identity = name;
    saveIdentity(name);
    identityOpen = false;
    session = new AnnotationSession(asClientId(name || "anonymous"), session.entries);
    rev += 1;
    doImportChanges();
  }
  // First Import = the moment identity acquires meaning (your work mixes with a collaborator's) → ask
  // who you are before merging (CONTEXT invention #6). Already-named (incl. skipped→Anonymous) → straight in.
  function importChanges() {
    if (identity === null) { identityOpen = true; return; }
    doImportChanges();
  }
  function doImportChanges() {
    const first = objNotes[0]; // the CURRENT object's first note, so the demo lands on what's shown
    if (!first) return;
    // Can't advance a note that already has plural heads (Q-6) — resolve the open merge first.
    // Without this guard, re-running the demo over an unresolved conflict throws in editNote.
    const open = session.conflicts();
    if (open.length > 0) { conflicts = open; synced = 1; return; }
    const baseRev = first.rev;
    // I advance the note locally...
    session.editNote(first.logicalId, { body: { type: "TextualBody", value: "My reading: original ground, not a later addition." } });
    // ...while a colleague advanced the SAME note concurrently (from the shared base) + added one.
    const theirs: AnnotationRecord = { logicalId: first.logicalId, rev: mintRevId(), version: first.version + 1, parent: baseRev, modifiedAt: new Date().toISOString(), lastEditor: asClientId("colleague"), deleted: false, target: first.target, body: { type: "TextualBody", value: "Colleague: I read this as a later addition." } };
    const fresh = new AnnotationSession(asClientId("colleague"));
    fresh.createNote({ target: rectSel(canvasIdOf(currentObjectId), 960, 220, 420, 300), body: { type: "TextualBody", value: "Colleague's new note on the hands.", purpose: "commenting" } });
    conflicts = session.importChanges([theirs, ...fresh.entries]);
    synced = 1;
    bump();
  }

  // Notes + working annotations are scoped to the CURRENT object's canvas (then the layer filter).
  const allNotes = $derived((rev, session.notes()));
  const objNotes = $derived(allNotes.filter((r) => srcOf(r.target) === canvasId));
  const notes = $derived(layerFilter === "all" ? objNotes : objNotes.filter((r) => (r.layers ?? []).includes(layerFilter)));
  const objAnnotations = $derived<W3CAnnotation[]>((rev, session.workingAnnotations().filter((a) => srcOf(a.target) === canvasId)));
  const annotations = $derived<W3CAnnotation[]>(
    layerFilter === "all" ? objAnnotations : objAnnotations.filter((a) => ((a as Record<string, unknown>)["archie:layers"] as string[] | undefined ?? []).includes(layerFilter)),
  );
  const sel = $derived(notes.find((r) => r.logicalId === editing));
  const noteCountOf = (objId: string) => allNotes.filter((r) => srcOf(r.target) === canvasIdOf(objId)).length;

  // --- canvas lifecycle ---
  function onCreate(a: W3CAnnotation) {
    const id = session.createNote({ target: a.target, ...(layerFilter !== "all" ? { layers: [layerFilter] } : {}) });
    bump();
    selected = id;
    mode = "select";
  }
  const onUpdate = (a: W3CAnnotation) => { session.editNote(a.id as LogicalId, { target: a.target }); bump(); };
  const onDelete = (id: string) => { session.deleteNote(id as LogicalId); bump(); if (selected === id) selected = null; if (editing === id) editing = null; };
  // Hand-annotate AV: AvEditor marked a [start,end] region → create a supplementing time note, then
  // select it so the WADM form opens to type the note (the temporal analogue of onCreate for OSD draws).
  function onCreateTime(start: number, end: number) {
    const id = session.createNote({ target: timeSel(canvasId, start, end), body: [{ type: "TextualBody", value: "", purpose: "supplementing" }], motivation: "supplementing" });
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
  const tagsOf = (r: AnnotationRecord) => bodies(r).filter((x) => (x as { purpose?: string }).purpose === "tagging").map((x) => (x as { value?: string }).value ?? "");

  function applyForm(comment: string, tagsCsv: string, layers: string[]) {
    if (!editing) return;
    const body: W3CBody[] = [{ type: "TextualBody", value: comment, purpose: "commenting" }];
    for (const t of tagsCsv.split(",").map((s) => s.trim()).filter(Boolean)) body.push({ type: "TextualBody", value: t, purpose: "tagging" });
    session.editNote(editing as LogicalId, { body, layers });
    bump();
  }
  function toggleLayer(layer: string, on: boolean) {
    if (!sel) return;
    const cur = new Set(sel.layers ?? []);
    if (on) cur.add(layer); else cur.delete(layer);
    applyForm(commentOf(sel), tagsOf(sel).join(", "), [...cur]);
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
    for (const ex of libraryMeta.exhibits) {
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
  async function openCmdK() {
    if (!sel) return; // ⌘K cites INTO the note being edited
    cmdkEntries = await buildCmdEntries();
    cmdkOpen = true;
  }
  // Splice `[label](archie:ref)` at the Comment cursor, persist, then restore focus past the link.
  async function insertCite(entry: CmdEntry) {
    if (!sel) return;
    const md = `[${entry.label}](${entry.ref})`;
    const full = commentEl?.value ?? commentOf(sel);
    const start = commentEl?.selectionStart ?? full.length;
    const end = commentEl?.selectionEnd ?? full.length;
    const next = full.slice(0, start) + md + full.slice(end);
    applyForm(next, tagsOf(sel).join(", "), sel.layers ?? []);
    cmdkOpen = false;
    await tick();
    const pos = start + md.length;
    commentEl?.focus();
    commentEl?.setSelectionRange(pos, pos);
  }
  function onGlobalKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && view === "editor" && sel) {
      e.preventDefault();
      void openCmdK();
    }
  }

  // Publish/Download project the WHOLE library — every exhibit (the published site IS the library:
  // collection.json + the Gallery list all exhibits). Each exhibit's notes live in its own log.
  function buildFullLibrary(): Library {
    return {
      id: "demo", title: "Archie demo",
      exhibits: libraryMeta.exhibits.map((ex) => ({
        id: ex.id, slug: ex.slug, title: ex.title,
        ...(ex.layout ? { layout: ex.layout } : {}),
        ...(ex.mode ? { mode: ex.mode } : {}),
        ...(ex.sections && ex.sections.length ? { sections: ex.sections } : {}),
        objects: ex.objects.map((o) => ({ id: o.id, source: o.source, label: o.label, ...(o.width !== undefined ? { width: o.width } : {}), ...(o.height !== undefined ? { height: o.height } : {}), ...(o.mediaType ? { mediaType: o.mediaType } : {}), ...(o.duration !== undefined ? { duration: o.duration } : {}), ...(o.provenance?.originalName ? { originalName: o.provenance.originalName } : {}) })),
      })),
    };
  }
  // Load EVERY exhibit's annotation log for publish, keyed by exhibit id (publishLibrary's getLog):
  // the current exhibit uses the live session (freshest, incl. unsaved); others load from their dir.
  async function loadAllLogs(): Promise<Record<string, AnnotationLog>> {
    const map: Record<string, AnnotationLog> = {};
    for (const ex of libraryMeta.exhibits) {
      if (ex.slug === currentSlug) { map[ex.id] = session.entries; continue; }
      const dir = await openExhibitAnnotationsDir(ex.slug);
      map[ex.id] = dir ? (await AnnotationSession.load(dir, author)).entries : [];
    }
    return map;
  }

  async function download() {
    const logs = await loadAllLogs();
    const { zip: bytes, brokenLinks } = await libraryToZip(buildFullLibrary(), (id) => logs[id] ?? [], { baseUrl: BASE, getAsset: (slug, name) => readAssetBytes(slug, name) });
    if (brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/zip" }));
    a.download = "demo.archie.zip";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // --- publish (GH-Pages) ---
  let publishOpen = $state(false);
  let brokenLinks = $state<BrokenLink[]>([]); // intra-Library links that degrade to plain text on publish (surfaced in the dialog)
  // Project the Library into the static site tree (in a MemoryFilesystem), then flatten it to the
  // path→FileContent map the git-trees push consumes. Same projection the zip uses — different sink.
  // getAsset writes imported-image bytes into the tree so collectFiles base64-encodes them for GH.
  async function collectSiteFiles(withOriginals = false) {
    const logs = await loadAllLogs();
    const fs = new MemoryFilesystem();
    const { brokenLinks } = await publishLibrary(fs, buildFullLibrary(), (id) => logs[id] ?? [], { baseUrl: BASE, getAsset: (slug, name) => readAssetBytes(slug, name), ...(withOriginals ? { getOriginal: (slug: string, name: string) => readOriginalBytes(slug, name) } : {}) });
    if (brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
    return collectFiles(await fs.root());
  }
  // includeOriginals (opt-in from the Publish dialog) ships preserved originals to the public site for citation.
  const publish = async (target: GitHubTarget, opts?: { includeOriginals?: boolean }) => publishToGitHub(await collectSiteFiles(opts?.includeOriginals ?? false), target);
  // Scan the publish projection for broken intra-Library links FIRST, then open the dialog so the author
  // sees which cited notes/exhibits will degrade to plain text before publishing (was console-only).
  async function openPublish() {
    const logs = await loadAllLogs();
    const res = await publishLibrary(new MemoryFilesystem(), buildFullLibrary(), (id) => logs[id] ?? [], { baseUrl: BASE, getAsset });
    brokenLinks = res.brokenLinks;
    publishOpen = true;
  }

  // --- Library-binding actions (invention #3). The persistence PRIMITIVES are reused as-is
  // (publishLibrary→folder · libraryToZip→download · loadLibrary←both) — the invention is the model +
  // chrome, not new plumbing. Folder = autosave-in-place (Chromium); file = explicit Save downloads the zip. ---
  const getAsset = (slug: string, name: string) => readAssetBytes(slug, name);
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
  /** Download the whole library as a .archie.zip (non-Chromium "the zip IS the file"). */
  async function downloadProjectZip() {
    const logs = await loadAllLogs();
    const { zip } = await libraryToZip(buildFullLibrary(), (id) => logs[id] ?? [], { baseUrl: BASE, getAsset });
    downloadZip(zip, binding.kind === "file" && binding.name ? binding.name : zipNameFor(PROJECT_TITLE));
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
          await downloadProjectZip();
        }
      } else if (binding.kind === "folder") {
        const handle = await reacquireFolder();
        if (!handle) return;
        await writeToFolder(handle);
      } else {
        await downloadProjectZip();
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
  <header>
    <span class="wordmark">Archie</span><span class="sub">Studio</span>
  </header>
  <LibraryHome
    exhibits={libraryMeta.exhibits}
    onopen={openExhibit}
    oncreate={newExhibit}
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
      sections={currentExhibit?.sections ?? []}
      onsections={setSections}
      notes={narrativeNotes}
    />
  </div>
{:else}
  <header>
    <button class="exhibit-back" onclick={hasOverview ? backToOverview : backToLibrary}>← {hasOverview ? "Overview" : "Exhibits"}</button>
    <span class="wordmark">{currentExhibit.title}</span><span class="sub">Studio</span>
    <span class="spacer"></span>
    {#if !isAvCurrent}
      <div class="tools">
        <button class:on={mode === "select"} onclick={() => (mode = "select")}>Select</button>
        <button class:on={mode === "draw" && tool === "rectangle"} onclick={() => { mode = "draw"; tool = "rectangle"; }}>▭ Rect</button>
        <button class:on={mode === "draw" && tool === "polygon"} onclick={() => { mode = "draw"; tool = "polygon"; }}>⬠ Polygon</button>
      </div>
    {/if}
    <label>Layer
      <select bind:value={layerFilter}>
        <option value="all">All</option><option value="conservation">Conservation</option><option value="iconography">Iconography</option>
      </select>
    </label>
    <button class="layout-trigger" onclick={() => (layoutPickerOpen = true)} title="How visitors read this exhibit (reading intent)">▦ {currentLayout}</button>
    {#if storeReady}
      <span class="savestate" class:dirty>{dirty ? "● Unsaved" : "Saved"}</span>
      <button onclick={() => void save()} disabled={!dirty}>Save</button>
    {/if}
    {#if identity !== null}<span class="you" title="Your name in the shared history (merge attribution)">You · {identity || "Anonymous"}</span>{/if}
    <button onclick={importChanges} disabled={objNotes.length === 0 || conflicts.length > 0} title={conflicts.length > 0 ? "Resolve the open merge first" : ""}>Import changes</button>
    <button onclick={download}>Download .archie.zip</button>
    <button onclick={() => void openPublish()}>Publish…</button>
  </header>

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
        <label class="file-btn">Choose image…<input type="file" accept="image/*" multiple onchange={(e) => { const el = e.currentTarget as HTMLInputElement; void addFiles(el.files).then(() => (el.value = "")); }} /></label>
        <span class="or">or</span>
        <input bind:value={addSource} placeholder="Source URL or /path (image / audio / video)" aria-label="Object source URL" />
        <input class="lbl" bind:value={addLabel} placeholder="Label" aria-label="Object label" />
        <button type="submit" disabled={addSource.trim() === ""}>Add</button>
        <button type="button" class="cancel" onclick={() => { addingObject = false; addSource = ""; addLabel = ""; }}>✕</button>
      </form>
    {:else}
      <button class="add-obj-toggle" onclick={() => (addingObject = true)}>+ Object</button>
    {/if}
  </nav>

  <div class="body">
    <aside>
      <MergeReview {session} {conflicts} {synced} onchange={() => { conflicts = session.conflicts(); bump(); }} />
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
      {#if notes.length === 0}
        <p class="empty">{isAvCurrent ? "No notes on this recording yet. Play it, then “Set in” → “Add note” to mark a moment." : layerFilter === "all" ? "No notes on this object yet. Pick ▭ Rect or ⬠ Polygon and draw to begin." : `No notes in the “${layerFilter}” layer on this object.`}</p>
      {/if}
      <ul>
        {#each notes as r (r.rev)}
          <li class:sel={editing === r.logicalId}>
            <button onclick={() => (selected = r.logicalId)}>
              <div class="comment">{stripMarkdown(commentOf(r)) || "(untitled)"}</div>
              <div class="meta">
                {#each tagsOf(r) as t}<span class="tag">#{t}</span>{/each}
                {#each r.layers ?? [] as l}<span class="layer">{l}</span>{/each}
              </div>
            </button>
          </li>
        {/each}
      </ul>
      <p class="hint">{isAvCurrent ? "Play the recording · “Set in” then “Add note” marks a region (or add a 5s region at the playhead) · click a note to seek · edit it below." : "Draw a Rect/Polygon to add a note · click a note to zoom to it (fitBounds) · edit it below."}</p>

      {#if sel}
        {@const comment = commentOf(sel)}
        {@const tags = tagsOf(sel).join(", ")}
        {@const layers = sel.layers ?? []}
        {@const trange = timeOf(sel)}
        <form class="wadm" onsubmit={(e) => { e.preventDefault(); }}>
          <h3>Edit note</h3>
          <label>
            <span class="field-head">Comment<button type="button" class="cite" onclick={() => void openCmdK()} title="Cite a note or exhibit (⌘K)">¶ Cite <kbd>⌘K</kbd></button></span>
            <textarea bind:this={commentEl} rows="3" value={comment} onchange={(e) => applyForm((e.currentTarget as HTMLTextAreaElement).value, tags, layers)}></textarea>
          </label>
          {#if trange}
            <!-- AV note: the time range IS its geometry (the OSD shape's analogue). mm:ss (bare seconds also accepted). -->
            <fieldset class="time">
              <legend>Time (m:ss)</legend>
              <label class="t">Start<input type="text" inputmode="numeric" placeholder="m:ss" value={fmtMMSS(trange.start)} onchange={(e) => applyTime(parseMMSS((e.currentTarget as HTMLInputElement).value), trange.end ?? trange.start)} /></label>
              <label class="t">End<input type="text" inputmode="numeric" placeholder="m:ss" value={fmtMMSS(trange.end ?? trange.start)} onchange={(e) => applyTime(trange.start, parseMMSS((e.currentTarget as HTMLInputElement).value))} /></label>
            </fieldset>
          {/if}
          <label>Tags (comma-separated)<input value={tags} onchange={(e) => applyForm(comment, (e.currentTarget as HTMLInputElement).value, layers)} /></label>
          <fieldset>
            <legend>Layers</legend>
            {#each ["conservation", "iconography"] as l}
              <label class="cb"><input type="checkbox" checked={layers.includes(l)} onchange={(e) => toggleLayer(l, (e.currentTarget as HTMLInputElement).checked)} /> {l}</label>
            {/each}
          </fieldset>
          <button type="button" class="del" onclick={() => onDelete(editing!)}>Delete note</button>
        </form>
      {/if}
    </aside>
    <main
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
          <AvEditor source={currentSource} label={current.label} mediaType={current.mediaType} {annotations} bind:selected oncreate={onCreateTime} onimport={onImportTranscript} />
        {/key}
      {:else if current && assetsReady}
        {#key canvasId}
          <Canvas source={currentSource} {canvasId} {annotations} {tool} drawing={mode === "draw"} bind:selected oncreate={onCreate} onupdate={onUpdate} ondelete={onDelete} />
        {/key}
      {:else if current}
        <div class="no-canvas">Loading…</div>
      {:else}
        <div class="no-canvas">Add an object — drop an image here, or use “+ Object” on the rail.</div>
      {/if}
    </main>
  </div>

  <Publish open={publishOpen} onclose={() => (publishOpen = false)} onpublish={publish} {brokenLinks} />
  <IdentityPrompt open={identityOpen} onsave={(n) => setIdentity(n)} onskip={() => setIdentity("")} />
  <CmdK open={cmdkOpen} entries={cmdkEntries} onpick={insertCite} onclose={() => (cmdkOpen = false)} />
{/if}
{#if layoutPickerOpen}
  <!-- GLOBAL (outside the view branches): the layout picker is opened from BOTH the editor header AND the
       overview header. When it was scoped to the editor branch, the overview's ▦ could never render it —
       so a narrative layout couldn't be set from the overview → the "Sections" tab never appeared. -->
  <LayoutPicker current={currentLayout} onpick={setLayout} onclose={() => (layoutPickerOpen = false)} />
{/if}
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
  .wordmark { font-family: var(--font-display); font-size: 1.4rem; font-weight: 600; color: var(--ink-canvas-primary); letter-spacing: 0.01em; }
  .sub { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-canvas-secondary); }
  .spacer { flex: 1; }
  /* Vertically centres the full-width ~80vh overview band (breathing room above/below; no frame). */
  .overview-stage { min-height: 100vh; display: flex; align-items: center; background: var(--surface-canvas); }
  .exhibit-back { background: none; border: none; cursor: pointer; padding: 0 var(--space-2) 0 0; font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-canvas-secondary); align-self: center; }
  .exhibit-back:hover { color: var(--accent); }
  .no-objects { font-family: var(--font-ui); font-size: 0.78rem; color: var(--ink-canvas-secondary); align-self: center; }
  .no-canvas { display: flex; align-items: center; justify-content: center; height: 100%; padding: var(--space-8); text-align: center; font-family: var(--font-body); font-size: 1.125rem; color: var(--ink-canvas-secondary); }
  header label { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-canvas-secondary); display: flex; align-items: center; gap: var(--space-2); }

  .tools { display: flex; gap: var(--space-1); }
  .tools button, header select, header > button {
    font-family: var(--font-ui); font-size: var(--text-ui-sm);
    padding: var(--space-1) var(--space-3);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-secondary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); cursor: pointer;
    transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
  }
  .tools button:hover, header > button:hover { color: var(--ink-canvas-primary); border-color: var(--border-canvas-emphasis); }
  .tools button.on { background: var(--accent); color: var(--ink-on-accent); border-color: var(--accent); }
  header > button { color: var(--ink-canvas-primary); }
  header > button:disabled { color: var(--ink-canvas-muted); border-color: var(--border-canvas); cursor: default; }
  .savestate { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .savestate.dirty { color: var(--accent); }
  /* Identity chip — your name in the shared history (invention #6); mono like other identifiers. */
  .you { font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas); border-radius: 999px; padding: 1px var(--space-3); }

  /* Playground banner — honest ephemerality (§115). Amber tint = transient/attention; the keep button
     carries the action accent (green). */
  .playground-banner { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-5); background: rgba(196, 155, 54, 0.1); border-bottom: 1px solid var(--border-canvas); border-left: 3px solid var(--semantic-warning); }
  .pg-tag { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--semantic-warning); }
  .pg-msg { flex: 1; font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-canvas-secondary); }
  .pg-keep { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 600; padding: var(--space-1) var(--space-4); background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); }
  .pg-keep:hover { background: var(--accent-hover); }
  .pg-keep:disabled { opacity: 0.6; cursor: default; }

  /* Object rail — the exhibit's works laid along the table edge; the active one marked in forest green. */
  .objects {
    display: flex; gap: var(--space-2); align-items: stretch;
    padding: var(--space-2) var(--space-5);
    background: var(--surface-canvas-raised); border-bottom: 1px solid var(--border-canvas);
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
  .obj-count { font-family: var(--font-mono); font-size: 0.6rem; color: var(--accent); }
  .obj.on .obj-count { color: rgba(255,255,255,0.85); }

  /* Add-object affordance on the rail */
  .add-obj-toggle {
    align-self: center; cursor: pointer; padding: var(--space-1) var(--space-3);
    background: none; color: var(--ink-canvas-secondary);
    border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: var(--text-ui-sm); transition: color 120ms ease, border-color 120ms ease;
  }
  .add-obj-toggle:hover { color: var(--accent); border-color: var(--accent); }
  .add-obj { display: flex; align-items: center; gap: var(--space-2); }
  .add-obj input {
    font-family: var(--font-body); font-size: 0.875rem; padding: var(--space-1) var(--space-2);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); width: 14rem;
  }
  .add-obj input.lbl { width: 8rem; }
  .add-obj input:focus { outline: none; border-color: var(--accent); }
  .add-obj button { cursor: pointer; padding: var(--space-1) var(--space-3); font-family: var(--font-ui); font-size: var(--text-ui-sm); background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); }
  .add-obj button:disabled { background: var(--accent-muted); color: var(--ink-canvas-muted); border-color: transparent; cursor: default; }
  .add-obj .cancel { background: none; color: var(--ink-canvas-secondary); border-color: var(--border-canvas); }
  .add-obj .cancel:hover { color: var(--ink-canvas-primary); }
  /* File-pick button (hides the native input) + the "or" separator */
  .file-btn { display: inline-flex; align-items: center; cursor: pointer; padding: var(--space-1) var(--space-3); font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-canvas-primary); background: var(--surface-canvas-overlay); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); }
  .file-btn:hover { border-color: var(--accent); color: var(--accent); }
  .file-btn input { display: none; }
  .add-obj .or { font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-canvas-muted); }

  .body { display: flex; flex: 1; min-height: 0; }
  main { flex: 1; min-width: 0; background: var(--surface-canvas); }
  /* Drag-and-drop import feedback over the light table */
  main.drag-over { outline: 2px dashed var(--accent); outline-offset: -8px; }

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
  .hint { font-family: var(--font-ui); font-size: var(--text-ui-md); color: var(--ink-paper-muted); line-height: 1.6; margin-top: var(--space-4); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.5; color: var(--ink-paper-secondary); padding: var(--space-4); border: 1px dashed var(--border-paper-emphasis); border-radius: var(--radius-md); }

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
  .wadm .cb { flex-direction: row; align-items: center; gap: var(--space-2); text-transform: none; letter-spacing: 0; font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-paper-primary); }
  .del { align-self: flex-start; font-family: var(--font-ui); font-size: 0.8rem; padding: var(--space-1) var(--space-3); background: none; color: var(--accent); border: 1px solid var(--accent-muted); border-radius: var(--radius-sm); cursor: pointer; }
  .del:hover { background: var(--accent-muted); border-color: var(--accent); }
</style>

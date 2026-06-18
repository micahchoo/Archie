// Object / library ingest flows (the DOMINO cut out of App.svelte). The five object-add paths (file
// import, URL add, AV import, map add, folder/manifest exhibit creation) plus the bulk-note imports
// (CSV / WADM) and the destructive library-replace (open-zip / open-folder). The PURE planners already
// live in folder-import.ts / iiif-import.ts / csv-import.ts / wadm-import.ts; this is the effectful glue
// that wires a planner to the live session + OPFS store. Factored as a `create*(ctx)` factory (cf.
// publish-flows.svelte.ts / binding-store.svelte.ts): every component-scope dependency arrives through
// an explicit IngestContext — store handles, reactive getters, and state setters — so nothing closes
// over App's module scope. App constructs the context once and spreads the returned flows.
import {
  AnnotationSession, loadLibrary, ZipFilesystem, libraryToWorking,
  mediaTypeFromSource, readExifOrientation, isOrientationNoop, orientationTransform, MAX_MASTER_DIM,
  readExifCaptureDate,
  type Library, type ClientId, type TileSourceDescriptor, type W3CTextualBody,
  type WorkingObjectMeta as ObjectMeta,
} from "@render/core";
import { bakeDisplayMaster, downscaleIfNeeded } from "./bake.js";
import {
  openExhibitAnnotationsDir, saveAssetFile, saveOriginalFile, clearExhibitAnnotations,
  ASSET_PREFIX, type ExhibitMeta, type ObjectProvenance,
} from "./store.js";
import { inferredMime, planFolderImportGroups } from "./folder-import.js";
import { manifestToExhibit, ManifestImportError, type ManifestPlan } from "./iiif-import.js";
import { planCsvImport } from "./csv-import.js";
import { planWadmImport } from "./wadm-import.js";
import { collabBreakdown, collabSummaryText } from "./collab.js";
import { rectSel } from "./seed-data.js";
import type { LibraryStore } from "./library-meta.svelte.js";

const LARGE_MEDIA_BYTES = 100 * 1024 * 1024; // ~100 MB — above this, suggest linking by URL (never blocks)

/** Everything the ingest flows touch in App.svelte's reactive scope, passed explicitly. Reactive reads
 *  are getters (so the flow sees the live value at call time); mutations are setters/store methods. */
export interface IngestContext {
  baseUrl: string;
  lib: LibraryStore;
  /** The live editor identity (reactive — read per call). */
  author: () => ClientId;
  // Live reads of the current-exhibit context.
  currentSlug: () => string;
  storeReady: () => boolean;
  objects: () => ReadonlyArray<ObjectMeta>;
  currentObjectId: () => string;
  currentReadings: () => ReadonlyArray<{ id: string; name: string }>;
  session: () => AnnotationSession;
  // State writers (the $state setters live in App).
  setAssetUrl: (objId: string, url: string) => void;
  setCurrentObjectId: (id: string) => void;
  setImportStatus: (s: { name: string; index: number; total: number } | null) => void;
  setImportNote: (s: string) => void;
  setAddingObject: (v: boolean) => void;
  clearAddForm: () => void;
  setMapModalOpen: (v: boolean) => void;
  setCollabNote: (s: string | null) => void;
  // Navigation / lifecycle callbacks owned by App.
  canvasIdOf: (objId: string) => string;
  switchObject: (id: string) => void;
  toEditor: () => void;
  newExhibit: (title: string) => Promise<void>;
  openExhibit: (slug: string) => Promise<void>;
  /** rev++ / dirty / scheduleSave — fired after a bulk note import. */
  bump: () => void;
  /** Cancel the pending debounced autosave before a destructive replace (Archie-788e). */
  cancelPendingSave: () => void;
  /** Land on the freshly-replaced project: select its first exhibit + return to the Library scale.
   *  Runs at the END of replaceProjectFrom so BOTH callers (open-zip + the binding store's open-folder /
   *  open-recent) get the same atomic finish — the original inline version set currentSlug + view here. */
  finishReplace: () => void;
  /** Confirmation gate for the destructive open (window.confirm wrapper). */
  confirmReplace: (msg: string) => boolean;
  alert: (msg: string) => void;
}

export function createIngestFlows(ctx: IngestContext) {
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
  const exhibit = (): ExhibitMeta | undefined => ctx.lib.meta.exhibits.find((e) => e.slug === ctx.currentSlug());

  // Append an object to the current exhibit + persist; for imported files, keep its blob: URL.
  async function appendObject(obj: ObjectMeta, blobUrl?: string) {
    // Register the blob URL BEFORE the awaited persist (Archie-9db6): lib.appendObject sync-mutates the
    // store then awaits the OPFS write, and Svelte flushes the reactive graph during that await — so
    // `current` flips to this object before the await resolves. Setting assetUrls first means
    // `currentSource` resolves to the blob (not the raw /assets/ path) the instant Canvas mounts,
    // closing the first-import OSD open-failed race.
    if (blobUrl) ctx.setAssetUrl(obj.id, blobUrl);
    await ctx.lib.appendObject(ctx.currentSlug(), obj);
    ctx.setCurrentObjectId(obj.id);
    ctx.clearAddForm();
    ctx.setAddingObject(false);
  }
  // Add by URL / public path (e.g. /voynich/herbal.jpg, or an audio/video URL → the AV editor).
  // AV INGEST (uploading a media file) stays gated (§152); referencing an existing AV URL does not.
  async function addObject(source: string, label: string) {
    const src = source.trim();
    if (!src) return;
    const ex = exhibit();
    if (!ex) return;
    const id = nextObjectId(ex);
    const mt = mediaTypeFromSource(src); // .mp3/.mp4/… → sound/video; else image (OSD)
    const dims = mt === "image" ? await imageDims(src) : null; // dimension-probe only makes sense for images
    await appendObject({ id, source: src, label: label.trim() || "Untitled object", ...(dims ? { width: dims.w, height: dims.h } : {}), ...(mt !== "image" ? { mediaType: mt } : {}) });
  }
  // Add-map modal (Phase 3 / Q3 — invented UX, human-gated): a Map is an Object whose source is its tile
  // template and which carries the tileSource descriptor (medium = Map). The modal supplies template + bounds.
  async function addMapObject(m: { label: string; tileSource: TileSourceDescriptor }) {
    const ex = exhibit();
    if (!ex) return;
    const id = nextObjectId(ex);
    await appendObject({ id, source: m.tileSource.template, label: m.label, tileSource: m.tileSource });
    ctx.setMapModalOpen(false);
    ctx.switchObject(id);
    ctx.toEditor();
  }
  // Add a LOCAL image file: store bytes in OPFS (persists), source "/assets/{name}". For phone photos
  // with EXIF orientation (≠1), BAKE an upright display master (CONTEXT §89.1) — the original is
  // preserved beside it (assets-original/), provenance records the transform, and the object targets
  // the upright master so the coord layer stays orientation-blind.
  async function addObjectFromFile(file: File) {
    if (!ctx.storeReady()) return; // OPFS unavailable — don't create an object whose bytes can't persist
    const ex = exhibit();
    if (!ex) return;
    const slug = ctx.currentSlug();
    const id = nextObjectId(ex);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    // AV INGEST (§152 gate lifted 2026-05-26, user): store an audio/video file as an OPFS asset — no EXIF/dims.
    // It renders in AvEditor (WaveSurfer waveform for audio · <video> for video). Local blob → no CORS on decode.
    if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
      const mediaType: "sound" | "video" = file.type.startsWith("video/") ? "video" : "sound";
      const avName = `${id}-${safe}`;
      await saveAssetFile(slug, avName, file);
      await appendObject({ id, source: `${ASSET_PREFIX}${avName}`, label: file.name.replace(/\.[^.]+$/, "") || "Untitled object", mediaType }, URL.createObjectURL(file));
      if (file.size > LARGE_MEDIA_BYTES) {
        ctx.setImportNote(`Added “${file.name}” (${Math.round(file.size / (1024 * 1024))} MB). For very large recordings, paste a link instead — it keeps your library small.`);
      }
      return;
    }
    if (!file.type.startsWith("image/")) {
      ctx.setImportNote(`Archie can’t read “${file.name}”. Add an image, audio, or video file.`);
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
      await saveOriginalFile(slug, originalName, file); // preserve the untouched original
      provenance = { exifOrientation: orientation, transform: orientationTransform(orientation), originalName };
    } else {
      // No rotation needed. If the image exceeds the §80 cap, downscale to a display master PRESERVING
      // the source format (LARGE-MEDIA-MEMORY-CEILING #4) — a big JPEG stays JPEG. Under the cap → keep
      // the raw file untouched. Decode ONCE to read dims; downscale only if over the cap (POLISH P6).
      const prepared = await downscaleIfNeeded(file, MAX_MASTER_DIM, file.type || "image/jpeg");
      master = prepared.blob;
      dims = { w: prepared.width, h: prepared.height };
    }

    const blobUrl = URL.createObjectURL(master);
    if (!dims) dims = await imageDims(blobUrl); // orientation-1 path: probe the (upright) master
    await saveAssetFile(slug, name, master);
    await appendObject(
      { id, source: `${ASSET_PREFIX}${name}`, label: file.name.replace(/\.[^.]+$/, "") || "Untitled object", ...(dims ? { width: dims.w, height: dims.h } : {}), ...(provenance ? { provenance } : {}) },
      blobUrl,
    );
  }
  async function addFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files);
    ctx.setImportNote("");
    try {
      for (let i = 0; i < list.length; i++) {
        ctx.setImportStatus({ name: list[i]!.name, index: i + 1, total: list.length });
        await addObjectFromFile(list[i]!);
      }
    } finally {
      ctx.setImportStatus(null);
    }
  }

  // Folder → exhibit in one gesture (contributor-broadening ① sub-cycle A, Archie-e1d6): the folder
  // names the exhibit; its media files become objects in reading order. Each file goes through the
  // SAME ingest as a hand-picked one (addObjectFromFile: EXIF bake, OPFS, AV branch) — no second path.
  async function newExhibitFromFolder(files: File[]) {
    // EXIF pre-pass (⑫): capture date per image so photo folders sort by SHOT time; only the
    // first 128 KB is read (APP1 sits at the front), only for image-MIME files. Chunked at 8 (review r9).
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
      ctx.alert("No images, audio, or video found in that folder.");
      return;
    }
    let failed = 0, imported = 0;
    try {
      for (const g of groups) {
        await ctx.newExhibit(g.name);
        // storeReady is PER-EXHIBIT state — openExhibit (inside newExhibit) just set it. Without
        // it, addObjectFromFile would no-op per file = titled, silently-empty exhibits; stop loudly.
        if (!ctx.storeReady()) {
          ctx.alert("Made the exhibit, but this browser can't save files — you may be in a private window. Adding files stopped.");
          return;
        }
        for (let i = 0; i < g.files.length; i++) {
          const p = g.files[i]!;
          ctx.setImportStatus({ name: p.name, index: i + 1, total: g.files.length });
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
      ctx.setImportStatus(null);
    }
    const summary = `Added ${imported} file${imported === 1 ? "" : "s"} to ${groups.length} exhibit${groups.length === 1 ? "" : "s"}.${failed > 0 ? ` ${failed} couldn't be added.` : ""}`;
    if (groups.length > 1) {
      // Several new exhibits — surface the summary via the app's dialog chrome (the rail's importNote
      // isn't rendered at the Library scale). NB: the caller navigates back to the Library separately.
      ctx.alert(summary);
    } else if (failed > 0) {
      ctx.setImportNote(summary);
    }
    return { groups: groups.length };
  }
  // IIIF manifest URL → exhibit (contributor-broadening ②, Archie-bc01): one paste bootstraps from any
  // institutional IIIF collection. Objects reference the REMOTE images (service base preferred), so
  // nothing is downloaded: the manifest's dims ride along and no OPFS bytes are written.
  async function newExhibitFromManifest(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    let json: unknown;
    try {
      const resp = await fetch(trimmed);
      if (!resp.ok) { console.error("IIIF fetch failed", resp.status, trimmed); ctx.alert("Couldn't open that link — the server returned an error. Check the address and try again."); return; }
      json = await resp.json();
    } catch {
      ctx.alert("Couldn't open that link. Check the address is correct and reachable.");
      return;
    }
    let plan: ManifestPlan;
    try {
      plan = manifestToExhibit(json, trimmed);
    } catch (e) {
      console.error("IIIF manifest parse failed", e);
      ctx.alert(e instanceof ManifestImportError ? e.message : "Couldn't read that IIIF link — it doesn't look like a valid manifest.");
      return;
    }
    await ctx.newExhibit(plan.title);
    try {
      for (let i = 0; i < plan.objects.length; i++) {
        const o = plan.objects[i]!;
        ctx.setImportStatus({ name: o.label, index: i + 1, total: plan.objects.length });
        const ex = exhibit();
        if (!ex) break;
        await appendObject({ id: nextObjectId(ex), ...o });
      }
    } finally {
      ctx.setImportStatus(null);
    }
  }
  // CSV → notes bulk import (contributor-broadening ⑥ sub-cycle A, Archie-79c0): authors who live in
  // Excel/Sheets annotate THERE (object,x,y,w,h,comment[,tags][,reading]) and bulk-load through the
  // SAME createNote path the seeds use. Skip-and-tally per row; fix-and-retry deduped on target+comment.
  async function importNotesCsv(file: File) {
    const session = ctx.session();
    const plan = planCsvImport(await file.text(), {
      objects: ctx.objects().map((o) => ({ id: o.id, label: o.label, ...(o.mediaType ? { mediaType: o.mediaType } : {}) })),
      readings: ctx.currentReadings().map((r) => ({ id: r.id, name: r.name })),
      currentObjectId: ctx.currentObjectId(),
    });
    const keyFor = (target: unknown, comment: string) => `${JSON.stringify(target)}|${comment}`;
    // The note's COMMENT body: the first TextualBody that isn't a tag (purpose !== "tagging"). The typed
    // predicate narrows W3CBody → W3CTextualBody so `.value` is in scope (App's inline version relied on
    // the .svelte file not being typechecked; the extracted .ts module is).
    const commentValue = (body: typeof session.entries[number]["body"]): string => {
      const arr = Array.isArray(body) ? body : body ? [body] : [];
      const b = arr.find((x): x is W3CTextualBody => x.type === "TextualBody" && x.purpose !== "tagging");
      return b?.value ?? "";
    };
    const existing = new Set(session.entries.map((e) => keyFor(e.target, commentValue(e.body))));
    let imported = 0, dup = 0;
    for (const n of plan.notes) {
      const [x, y, w, h] = n.region;
      const target = rectSel(ctx.canvasIdOf(n.objectId), x, y, w, h);
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
    if (imported > 0) ctx.bump(); // rev + dirty + scheduleSave (a template stays playground-only per save()'s gate)
    const head = `Added ${imported} note${imported === 1 ? "" : "s"} from your CSV.`;
    const dupNote = dup > 0 ? ` ${dup} already added.` : "";
    ctx.setImportNote(plan.skipped.length > 0
      ? `${head}${dupNote} Skipped ${plan.skipped.length}: ${plan.skipped.slice(0, 3).map((s) => `line ${s.row}: ${s.reason}`).join("; ")}${plan.skipped.length > 3 ? "; …" : ""}`
      : head + dupNote);
  }
  // W3C/WADM annotation import (contributor-broadening ⑦ slice A): an AnnotationPage from Archie's own
  // publish, Recogito, or any standard WADM producer lands on this exhibit — re-anchored by the
  // /canvas/<id> tail, selector + bodies verbatim, deduped like the CSV path.
  async function importNotesWadm(file: File) {
    const session = ctx.session();
    let json: unknown;
    try { json = JSON.parse(await file.text()); }
    catch { ctx.setImportNote(`Couldn't read “${file.name}” — it isn't a valid notes file.`); return; }
    const plan = planWadmImport(json, { objectIds: new Set(ctx.objects().map((o) => o.id)) });
    const keyFor = (target: unknown, body: unknown) => `${JSON.stringify(target)}|${JSON.stringify(body)}`;
    const existing = new Set(session.entries.map((e) => keyFor(e.target, e.body ?? [])));
    let imported = 0, dup = 0;
    for (const n of plan.notes) {
      const target = { type: "SpecificResource" as const, source: ctx.canvasIdOf(n.objectId), selector: n.selector };
      const k = keyFor(target, n.body);
      if (existing.has(k)) { dup++; continue; }
      existing.add(k);
      session.createNote({ target, body: n.body }); // typed by the planner's rebuild — no casts
      imported++;
    }
    if (imported > 0) ctx.bump();
    const head = `Added ${imported} note${imported === 1 ? "" : "s"}.`;
    const dupNote = dup > 0 ? ` ${dup} already added.` : "";
    ctx.setImportNote(plan.skipped.length > 0
      ? `${head}${dupNote} Skipped ${plan.skipped.length}: ${plan.skipped.slice(0, 3).map((s) => `#${s.index}: ${s.reason}`).join("; ")}${plan.skipped.length > 3 ? "; …" : ""}`
      : head + dupNote);
  }
  // Replace the current OPFS project with a loaded library (the shared body of "Open zip" + "Open folder"):
  // clear outgoing annotation dirs (no orphans under reused slugs), write each imported log, swap the meta.
  async function replaceProjectFrom(loaded: Awaited<ReturnType<typeof loadLibrary>>) {
    // Archie-788e: cancel a pending debounced save — the user confirmed replacement, and a timer
    // firing mid-replace would write the OUTGOING session into the incoming project's dirs.
    ctx.cancelPendingSave();
    const author = ctx.author();
    for (const e of ctx.lib.meta.exhibits) await clearExhibitAnnotations(e.slug);
    for (const e of loaded.library.exhibits) {
      const dir = await openExhibitAnnotationsDir(e.slug);
      if (dir) await new AnnotationSession(author, loaded.logs[e.slug] ?? []).save(dir, { baseUrl: ctx.baseUrl });
    }
    // core's libraryToWorking is the faithful inverse of workingToLibrary (Q-3: one mapper pair, no
    // drift) — it replaces the ~8-field hand-spread this did inline AND carries `tileSource` (the inline
    // version DROPPED it, losing Map basemaps on zip-open). NB provenance doesn't round-trip (a Library
    // object lacks exifOrientation+transform) — same as the inline version, which never reconstructed it.
    ctx.lib.setMeta(libraryToWorking(loaded.library));
    await ctx.lib.persist();
    ctx.finishReplace(); // currentSlug = first exhibit; view = "library" (atomic for BOTH callers)
  }
  // Open a published .archie.zip as the project — the symmetric inverse of Download: read it via
  // loadLibrary, then REPLACE the current OPFS project with its structure + per-exhibit logs.
  // Destructive ⇒ confirm-gated. Returns the loaded library on success (App finishes binding + nav).
  async function openZip(file: File): Promise<{ loaded: Awaited<ReturnType<typeof loadLibrary>> } | null> {
    let loaded: Awaited<ReturnType<typeof loadLibrary>>;
    try {
      loaded = await loadLibrary(ZipFilesystem.fromZip(new Uint8Array(await file.arrayBuffer())));
    } catch {
      ctx.alert("Couldn't open that file — choose a published .archie.zip file.");
      return null;
    }
    if (loaded.library.exhibits.length === 0) { ctx.alert("That file has no exhibits to open."); return null; }
    if (!ctx.confirmReplace("Open this library? Your current library will be replaced.")) return null;
    await replaceProjectFrom(loaded);
    // ⑧ (Archie-59a8): the summary panel — who wrote what in the copy you just opened.
    ctx.setCollabNote(collabSummaryText(file.name, collabBreakdown(loaded.logs, ctx.author())));
    return { loaded };
  }

  return {
    imageDims, nextObjectId, appendObject, addObject, addMapObject, addObjectFromFile, addFiles,
    newExhibitFromFolder, newExhibitFromManifest, importNotesCsv, importNotesWadm,
    replaceProjectFrom, openZip,
  };
}
export type IngestFlows = ReturnType<typeof createIngestFlows>;
export type { Library };

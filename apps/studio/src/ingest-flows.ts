// Object / library ingest flows (the DOMINO cut out of App.svelte). The five object-add paths (file
// import, URL add, AV import, map add, folder/manifest exhibit creation) plus the bulk-note imports
// (CSV / WADM) and the destructive library-replace (open-zip / open-folder). The PURE planners already
// live in folder-import.ts / iiif-import.ts / csv-import.ts / wadm-import.ts; this is the effectful glue
// that wires a planner to the live session + OPFS store. Factored as a `create*(ctx)` factory (cf.
// publish-flows.svelte.ts / binding-store.svelte.ts): every component-scope dependency arrives through
// an explicit IngestContext — store handles, reactive getters, and state setters — so nothing closes
// over App's module scope. App constructs the context once and spreads the returned flows.
import {
  AnnotationSession, loadLibrary, openArchieLibrary, libraryToWorking, mintObjectId,
  mediaTypeFromSource, readExifOrientation, isOrientationNoop, orientationTransform, MAX_MASTER_DIM,
  readExifCaptureDate,
  type Filesystem, type FsDirectory,
  type Library, type ClientId, type XyzTileSource, type W3CTextualBody,
  type WorkingObjectMeta as ObjectMeta,
} from "@render/core";
import { bakeDisplayMaster, downscaleIfNeeded, bakeThumbnail } from "./bake.js";
import { isTiffMime, transcodeTiff } from "./tiff-transcode.js";
import {
  openExhibitAnnotationsDir, openExhibitStructureDir, saveAssetFile, saveOriginalFile, saveThumbFile, clearExhibitAnnotations,
  migrateResidentStoreIds, resetIdSchemeState, loadLibraryMeta,
  ASSET_PREFIX, type ExhibitMeta, type ObjectProvenance,
} from "./store.js";
import { mergeImportedStructure, migrateSectionLogIds } from "./structure-import.js";
import { structureRevlogEnabled } from "./feature-flags.js";
import { inferredMime, planFolderImportGroups } from "./folder-import.js";
import { manifestToExhibit, ManifestImportError, classifyIiifDocument, labelToString, type ManifestPlan } from "./iiif-import.js";
import { traverseCollection, urlSegment, type DiscoveredManifest, type TraverseResult } from "./collection-import.js";
import { planCsvImport, type CsvPendingNote } from "./csv-import.js";
import { planWadmImport } from "./wadm-import.js";
import { createImportRunTracker, type ImportTone } from "./ingest-activity.js";
import { collabBreakdown, collabSummaryText } from "./collab.js";
import { recordImportFreshness } from "./import-freshness.js";
import { rectSel } from "./seed-data.js";
import { enqueueSave } from "./save-queue.svelte.js";
import { reportStorageFailure, reportStorageOk, requestPersistence } from "./storage-quota.svelte.js";
import type { LibraryStore } from "./library-meta.svelte.js";

const LARGE_MEDIA_BYTES = 100 * 1024 * 1024; // ~100 MB — above this, suggest linking by URL (never blocks)
const THUMB_DIM = 640; // grid/overview thumbnail longest-edge px — covers retina plates, tiny vs the master
const ASSET_THUMB_PREFIX = "/assets-thumb/"; // working ref for a baked thumbnail (sibling of ASSET_PREFIX)

// A remote IIIF manifest is JSON, not media — even a huge institutional collection's manifest runs a
// few MB. 32 MB is generous headroom; above it something is wrong (or hostile) rather than merely big.
// Distinct from @render/core's SRC_MAX_BYTES (the untrusted-.archie.zip byte cap), which caps a DIFFERENT
// trust boundary — this one guards an arbitrary-JSON fetch that had NO cap at all (tend Issue 7,
// ledgers/NEGSPACE.md row 5). Exported (Archie-51cc) so create-exhibit-dialog.ts's validation-preview
// fetch enforces the SAME cap as the real import below — one definition, not a second copy that could drift.
export const IIIF_MANIFEST_MAX_BYTES = 32 * 1024 * 1024;

// The three local-file bulk-import vectors (CSV notes, WADM notes, VTT/SRT captions) had no size cap
// either — a many-hundred-MB file gets `.text()`-read then synchronously parsed on the main thread with
// nothing to stop it (tend Issue 7, ledgers/NEGSPACE.md rows 6-8). These are hand-authored annotation
// files; legitimate ones are KBs to low MBs even for thousands of notes.
export const LOCAL_TEXT_IMPORT_MAX_BYTES = 64 * 1024 * 1024;

// The fetch + double-cap + parse CORE, shared by the single-manifest head (fetchManifestPlan), the
// collection preview (fetchCollectionPreview), and the traversal's per-sub-collection fetch (Archie-656a,
// PLAN §5). ONE definition of the IIIF_MANIFEST_MAX_BYTES discipline (declared content-length THEN actual
// byteLength, mirroring @render/core's fetchArchieLibraryBytes) so a manifest fetch, a collection doc, and
// a background hydration fetch can never drift on the cap — the same "one fetch head" contract the
// untrusted-archive-open seam enforces. Throws a TYPED error the caller maps to voice: fetchManifestPlan
// re-derives its exact pre-656a alert copy, and traverseCollection turns a throw into a counted
// `fetch-failed` skip carrying the message. Honors an AbortSignal so a paste-time preview is abortable.
class IiifHttpError extends Error { constructor(readonly status: number) { super(`HTTP ${status}`); } }
class IiifTooLargeError extends Error {}
async function fetchJsonCapped(url: string, signal?: AbortSignal): Promise<unknown> {
  const resp = await fetch(url, signal ? { signal } : {});
  if (!resp.ok) throw new IiifHttpError(resp.status);
  const declared = Number(resp.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > IIIF_MANIFEST_MAX_BYTES) throw new IiifTooLargeError("That IIIF link is too large to open here.");
  const buf = await resp.arrayBuffer();
  if (buf.byteLength > IIIF_MANIFEST_MAX_BYTES) throw new IiifTooLargeError("That IIIF link is too large to open here.");
  return JSON.parse(new TextDecoder().decode(buf));
}
// Map a fetchJsonCapped throw to fetchManifestPlan's EXACT pre-656a alert copy (byte-identical voice + the
// same console line): an HTTP status vs. an over-cap vs. a network/parse throw each keep their message.
function manifestFetchFailureMessage(e: unknown, url: string): string {
  if (e instanceof IiifHttpError) { console.error("IIIF fetch failed", e.status, url); return "Couldn't open that link. Check the address and try again."; }
  if (e instanceof IiifTooLargeError) return "That IIIF link is too large to open here.";
  return "Couldn't open that link. Check the address is correct and reachable.";
}
// Is this thrown value an abort (fetch's AbortError)? Detected by the DOM's `AbortError` name so a
// debounce-abort of the paste-time preview is handled as a silent discard, never a "couldn't open" alert.
function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** Paste-time preview head for the create dialog (Archie-656a, consumed by the dialog ticket Archie-a9e2).
 *  A discriminated result the dialog routes on:
 *   - `manifest`   → route to the existing single-manifest path (no traversal). Carries the already-parsed
 *                    `plan` (Archie-cbf6 / D2): the root doc was fetched AND classified here, so parsing it
 *                    into a plan lets the dialog show title + canvas count WITHOUT a second fetch of the same
 *                    URL (the pre-cbf6 shape carried no payload, forcing the dialog to re-fetch via
 *                    previewManifest);
 *   - `collection` → the traversal (its `status` distinguishes ok from over-manifest-cap, with the exact
 *                    `manifestCount` for a refuse-with-count) plus the root title for the picker header;
 *   - `error`      → a message the dialog renders;
 *   - `aborted`    → the caller cancelled this preview (a newer keystroke superseded it). CONTRACT: the
 *                    dialog DISCARDS this outcome silently — no alert fired, and NO partial/phantom
 *                    TraverseResult is surfaced (an abort mid-traversal is never returned as `collection`
 *                    with fetch-failed skips). It exists so a debounced preview can be abandoned per
 *                    keystroke without a modal or a misleading result. */
export type CollectionPreview =
  | { kind: "manifest"; plan: ManifestPlan }
  | { kind: "collection"; rootTitle: string; result: TraverseResult }
  | { kind: "error"; message: string }
  | { kind: "aborted" };

/** The result of a collection import batch (Archie-cbf6, PLAN §6/§8) — the created slugs in commit order
 *  (the "Import batch" the dialog's summary + Undo read), the manifest-side skips, whether a user cancel
 *  stopped it early, and a fatal storage message when a commit threw. Returned by newExhibitsFromCollection
 *  (which NEVER throws) and awaited by the dialog to render its summary state. */
export type CollectionImportOutcome = {
  createdSlugs: string[];
  skipped: { id: string; label?: string; reason: string }[];
  cancelled: boolean;
  fatal: string | null;
};

// Binary-asset persistence routes through the save-queue (ISSUES.md Issue 26 / ledgers/ASSETQ.md): the
// queue header promises "NO failure is silent," but the OPFS asset writers (store.ts saveAssetFile /
// saveOriginalFile / saveThumbFile) were called directly, so a failed write never reached saveStatus.
// enqueueSave NEVER throws — it returns false on failure — so the caller MUST branch on the boolean and
// refuse to append the object on false; that preserves the reference-after-bytes invariant (a
// library.json ref only lands once its bytes did) while making the failure visible in the chrome.
// (The former STORAGE_FAIL_NOTE constant became REFUSAL_COPY.storage below, so the storage failure is
// counted and phrased by the same machinery as every other per-file refusal instead of by a lone string.)

/** Why one file was refused during a batch add.
 *
 *  Classified by WHICH PHASE failed — a fact the code holds with certainty — and never by inspecting the
 *  thrown error. `createImageBitmap` rejects with a host DOMException whose `.name` differs across
 *  engines, so sniffing it would be a guess wearing the costume of a diagnosis; which `await` was running
 *  when it threw is not a guess. `storage` deliberately does NOT split quota-vs-permission: `enqueueSave`
 *  collapses the cause to a boolean and the read-only flag is library-wide rather than per-job, so that
 *  split is genuinely unknowable here — the copy stays honest about it instead of naming a cause. */
type AddFileRefusal = "unsupported" | "unreadable" | "undecodable" | "storage";

/** One clause per reason, in both numbers — so a batch that loses 200 files reads as ONE sentence naming
 *  the cause, not 200 stacked notes. Exactly one file gets NAMED (identifying, and short); two or more
 *  collapse to a count, because listing them is the wall of text the band can't show. */
const REFUSAL_COPY: Record<AddFileRefusal, { one: (name: string) => string; many: (n: number) => string }> = {
  unsupported: {
    one: (f) => `Archie can’t open “${f}” — it opens images, audio, and video.`,
    many: (n) => `${n} files weren't added — Archie opens images, audio, and video.`,
  },
  unreadable: {
    one: (f) => `Couldn't read “${f}” from this device — it may have been moved or renamed since you chose it.`,
    many: (n) => `${n} files couldn't be read from this device — they may have been moved or renamed since you chose them.`,
  },
  undecodable: {
    one: (f) => `“${f}” isn't a readable image — the file may be damaged, or in a format this browser can't open.`,
    many: (n) => `${n} images couldn't be read — the files may be damaged, or in a format this browser can't open.`,
  },
  storage: {
    one: (f) => `Couldn't store “${f}” on this device — check the save indicator, and free some space.`,
    many: (n) => `${n} files couldn't be stored on this device — check the save indicator, and free some space.`,
  },
};

/** Fold a batch's per-file refusals into at most three clauses (the file's established `; …` cap idiom).
 *  Callers pass every refusal in order; identical reasons merge. Returns [] when nothing was refused. */
function refusalSentences(refusals: ReadonlyArray<{ reason: AddFileRefusal; name: string }>): string[] {
  const byReason = new Map<AddFileRefusal, string[]>();
  for (const r of refusals) byReason.set(r.reason, [...(byReason.get(r.reason) ?? []), r.name]);
  const out = [...byReason].map(([reason, names]) =>
    names.length === 1 ? REFUSAL_COPY[reason].one(names[0]!) : REFUSAL_COPY[reason].many(names.length));
  // Past three distinct reasons the sentence stops being readable; the per-file console.warn each refusal
  // already emits is the full record, so nothing is lost — only the band's rendering is capped.
  return out.length > 3 ? [...out.slice(0, 3), "…"] : out;
}
/** Persist one exhibit's asset bytes through the queue (serialized per exhibit). False = write failed
 *  (recorded in saveStatus); the caller must NOT append the referencing object. This is also the ONE
 *  seam that tells the storage chip the truth: a failed asset write is the only observable "storage
 *  full" signal (the estimate() quota is a privacy constant — see the STOPPED_EARLY header comment),
 *  and a successful one proves recovery. */
async function persistAsset(slug: string, write: () => Promise<void>): Promise<boolean> {
  requestPersistence(); // one-shot, first asset write: ask the engine to exempt this origin from eviction
  const ok = await enqueueSave(`assets:${slug}`, "Media", write);
  if (ok) reportStorageOk(); else reportStorageFailure();
  return ok;
}
// NO quota preflight — deliberately (reverses Issue 26 Phase 3; docs/research/browser-storage-quota.md).
// Chromium's estimate() reports quota as `usage + 10 GiB` (a static anti-fingerprinting constant,
// kStaticStorageQuota, Dec 2024) — so "quota - usage" is ALWAYS ~10 GiB, and a preflight against it
// refuses any batch over ~9.5 GB regardless of real headroom (the enforced quota is ~60% of disk and
// deliberately unobservable). Measured here: a 17.8 GB import refused on a disk with ~1 TB of real
// origin headroom. The only truthful signal is the write itself failing (QuotaExceededError →
// persistAsset false → the "storage" refusal), so the import loops attempt, then STOP EARLY on the
// first storage refusal — reference-after-bytes already guarantees a failed write leaves no dangling
// library.json entry, and stopping avoids grinding through hundreds of doomed writes.
const STOPPED_EARLY = (n: number) =>
  `The remaining ${n} file${n === 1 ? " was" : "s were"} not attempted.`;

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
  /** Seed a just-imported object's MASTER blob into the on-demand slot before it becomes current, so the
   *  canvas mounts against the blob (not the `/assets/` path) — closes the first-import OSD race. The
   *  slug keys the slot (object ids repeat across exhibits). */
  seedMaster: (slug: string, objId: string, url: string) => void;
  /** Register a just-imported IMAGE object's rail/overview plate (its baked thumb, or its master when no
   *  thumb baked) so the grid shows it before the next exhibit reopen re-runs the eager thumb wave. */
  setPlate: (objId: string, url: string) => void;
  setCurrentObjectId: (id: string) => void;
  /** The ONE live-progress slot App renders. Flows never call this directly — they tick a per-run
   *  handle from `importRuns` (createImportRunTracker), which arbitrates overlapping runs in front of
   *  this setter so concurrent imports can't alternate in the band or blank each other's progress. */
  setImportStatus: (s: { name: string; index: number; total: number } | null) => void;
  /** The terminal message for an import. `tone` defaults to "ok" — pass "problem" when the message
   *  reports a REFUSAL or a failure, so the overview's ingest band can pick its glyph honestly. Proven
   *  necessary by driving the real app: a browser without OPFS refused an import, and a band deriving
   *  tone from "did the promise reject?" painted the refusal with a ✓ — these flows compose a failure
   *  note and RESOLVE, so rejection is not the signal. Only the producer knows. */
  setImportNote: (s: string, tone?: ImportTone) => void;
  /** Stage coordinate-free CSV rows for "Set area" placement (Archie-79c0 sub-cycle B). Returns how many
   *  were NEWLY staged after dedup, so importNotesCsv can report all three buckets (placed/pending/skipped). */
  addPendingNotes: (notes: CsvPendingNote[]) => number;
  setCollabNote: (s: string | null) => void;
  // Navigation / lifecycle callbacks owned by App.
  canvasIdOf: (objId: string) => string;
  switchObject: (id: string) => void;
  toEditor: () => void;
  newExhibit: (title: string) => Promise<void>;
  /** Create an exhibit in the library and return its slug WITHOUT navigating into it (Archie-cbf6). The
   *  collection batch uses this instead of `newExhibit`: opening each of N imported exhibits would thrash the
   *  session/thumb machinery AND unmount the create dialog that hosts the import's progress/summary (it only
   *  renders at the Library view). `newExhibit` = this + openExhibit, so the single-manifest path is unchanged. */
  newExhibitInLibrary: (title: string) => Promise<string>;
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
  /** The archie.structureRevlog flag, read ONCE at boot by the App (feature-flags.ts contract) and
   *  passed down — injectable for tests. Absent = read the flag directly at flows creation. */
  structureRevlog?: boolean;
}

export function createIngestFlows(ctx: IngestContext) {
  // Boot-cached flag read (feature-flags.ts contract: callers read once, never mid-session). The
  // App passes its own boot-cached STRUCTURE_REVLOG const; the fallback covers direct construction.
  const STRUCTURE_REVLOG = ctx.structureRevlog ?? structureRevlogEnabled();
  // ALL ticking flows go through this tracker, never ctx.setImportStatus directly: every ingest call
  // site is fire-and-forget, so two runs can overlap, and with four flows writing the one unkeyed
  // slot their ticks alternated in the band and the first `finally` to fire blanked the survivor
  // mid-run. The tracker (ingest-activity.ts) keys each run and lets the oldest reported one lead.
  const importRuns = createImportRunTracker(ctx.setImportStatus);
  // Best-effort natural dimensions (IIIF wants them); resolves null if the URL can't be loaded.
  function imageDims(src: string): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  const exhibitBySlug = (slug: string): ExhibitMeta | undefined => ctx.lib.meta.exhibits.find((e) => e.slug === slug);

  // Objects committed to library.json per durable persist during a multi-object import. THE scale fix: the
  // old loops did one lib.appendObject → one whole-library.json rewrite PER object (O(N²) cumulative bytes;
  // 100 exhibits × 100 objects = ~10,000 rewrites). A batch folds a run into ONE rewrite. Chunked (not a
  // single end-of-import persist) DELIBERATELY: a single flush is O(N) bytes but a crash mid-import loses the
  // WHOLE import; chunking bounds crash-loss to <25 objects (roughly the per-object durability granularity
  // the old code paid O(N²) for) while cutting rewrites 25×. A typical IIIF manifest (≤25 canvases) is thus
  // exactly ONE persist — the collection path's "1 per manifest" target — and only a pathologically large
  // single manifest takes several.
  const IMPORT_PERSIST_CHUNK = 25;

  // Object ids are library-global ULIDs (mintObjectId, object-id.ts / Archie-9ea8). A ULID is unique the
  // instant it's minted — it never reads live meta — so the old cross-flow collision risk is gone at the
  // root: a manual add (addObject / addMapObject / paste-a-file) firing mid-batch can't mint an id a batch
  // has queued-but-not-yet-flushed, because no mint site derives an id from the (batch-delayed) object set.
  // That's why there's no reservation registry here anymore: the ordinal `o${n}` mint it guarded against
  // (defect 2, superseded by Archie-9ea8) no longer exists. appendObjectIn's bare push is safe — every id
  // it's ever handed is distinct.

  /** A durable-append batch for ONE pinned exhibit: collect built objects and commit them to library.json in
   *  ONE persist per chunk instead of one-per-object. Media byte-writes (per file, separate save-queue keys)
   *  and view seeding (seedMaster) still happen per object — only the library.json append coalesces. The view
   *  is steered to the freshly-landed tail only AFTER its chunk is durable (mirrors the per-object
   *  appendObject's "persist THEN setCurrentObjectId" ordering), so `current` never points at an object not
   *  yet in the reactive meta. Ids come from mintObjectId (ULIDs), so the batch needs no id reservation —
   *  a queued-but-not-flushed object can't collide with any concurrent add. */
  function beginBatch(slug: string) {
    let pending: ObjectMeta[] = [];
    let lastId: string | null = null;
    const persistChunk = async (): Promise<void> => {
      if (pending.length === 0) return;
      const chunk = pending;
      pending = [];
      await ctx.lib.appendObjects(slug, chunk);
      if (lastId && slug === ctx.currentSlug()) ctx.setCurrentObjectId(lastId);
    };
    return {
      add(obj: ObjectMeta, blobUrl?: string): void {
        if (blobUrl) ctx.seedMaster(slug, obj.id, blobUrl); // blob ready before `current` ever flips to it
        pending.push(obj);
        lastId = obj.id;
      },
      flushIfFull(): Promise<void> { return pending.length >= IMPORT_PERSIST_CHUNK ? persistChunk() : Promise.resolve(); },
      flush(): Promise<void> { return persistChunk(); },
    };
  }
  type AppendBatch = ReturnType<typeof beginBatch>;
  const exhibit = (): ExhibitMeta | undefined => exhibitBySlug(ctx.currentSlug());

  // Append an object to `targetSlug` (defaults to whatever's current) + persist; for imported files,
  // keep its blob: URL. `targetSlug` matters for multi-item loops (newExhibitFromFolder,
  // newExhibitFromManifest, addFiles): each PINS the exhibit it's importing into at the start, so a
  // user switching exhibits mid-import can't silently misdirect later items onto the wrong one (tend
  // Issue 7, ledgers/NEGSPACE.md — mid-flow-interruption rows). Only steer the view to this object
  // when the target is still the one open; a background loop must not yank the user back.
  async function appendObject(obj: ObjectMeta, blobUrl?: string, targetSlug: string = ctx.currentSlug()) {
    // Seed the master blob BEFORE the awaited persist (Archie-9db6): lib.appendObject sync-mutates the
    // store then awaits the OPFS write, and Svelte flushes the reactive graph during that await — so
    // `current` flips to this object before the await resolves. Seeding the master slot first means
    // `currentSource` resolves to the blob (not the raw /assets/ path) the instant Canvas mounts,
    // closing the first-import OSD open-failed race.
    if (blobUrl) ctx.seedMaster(targetSlug, obj.id, blobUrl);
    await ctx.lib.appendObject(targetSlug, obj);
    if (targetSlug === ctx.currentSlug()) {
      ctx.setCurrentObjectId(obj.id);
    }
  }
  // Add by URL / public path (e.g. /voynich/herbal.jpg, or an audio/video URL → the AV editor).
  // AV INGEST (uploading a media file) stays gated (§152); referencing an existing AV URL does not.
  async function addObject(source: string, label: string) {
    const src = source.trim();
    if (!src) return;
    const ex = exhibit();
    if (!ex) return;
    const id = mintObjectId(); // library-global ULID — unique regardless of live meta, so no cross-flow collision (Archie-9ea8)
    const mt = mediaTypeFromSource(src); // .mp3/.mp4/… → sound/video; else image (OSD)
    const dims = mt === "image" ? await imageDims(src) : null; // dimension-probe only makes sense for images
    await appendObject({ id, source: src, label: label.trim() || "Untitled object", ...(dims ? { width: dims.w, height: dims.h } : {}), ...(mt !== "image" ? { mediaType: mt } : {}) });
  }
  // Add MANY remote-URL objects in one run — the folder-by-URL confirm (CreateExhibitDialog's folder
  // picker → selectedLinks). Each entry lands exactly as addObject would store it (a zero-copy remote
  // reference; nothing is downloaded beyond the same best-effort dimension probe). This exists apart
  // from a per-entry addObject loop for the two reasons addFiles does: the target exhibit is PINNED
  // up front (mid-flow exhibit-switch protection, tend Issue 7 / ledgers/NEGSPACE.md) and the
  // library.json appends are batched (one persist per IMPORT_PERSIST_CHUNK, not per object). No quota
  // preflight and no storeReady gate, deliberately: no OPFS bytes are written — the references live in
  // library.json alone, same as a single hand-pasted link.
  async function addUrlObjects(links: { source: string; label: string }[]) {
    const opened = exhibit();
    if (!opened) {
      ctx.setImportNote("Open an exhibit first.", "problem");
      return;
    }
    if (links.length === 0) return;
    ctx.setImportNote("");
    const targetSlug = opened.slug;
    const batch = beginBatch(targetSlug);
    let added = 0;
    const run = importRuns.begin();
    try {
      for (let i = 0; i < links.length; i++) {
        const { source, label } = links[i]!;
        const src = source.trim();
        if (!src) continue;
        run.tick({ name: label, index: i + 1, total: links.length });
        const mt = mediaTypeFromSource(src);
        const dims = mt === "image" ? await imageDims(src) : null; // best-effort, same as addObject
        batch.add({
          id: mintObjectId(),
          source: src,
          label: label.trim() || "Untitled object",
          ...(dims ? { width: dims.w, height: dims.h } : {}),
          ...(mt !== "image" ? { mediaType: mt } : {}),
        });
        added++;
        await batch.flushIfFull();
      }
      await batch.flush(); // durable-before-return, same tail contract as addFiles
    } finally {
      run.end();
    }
    const where = exhibitBySlug(targetSlug)?.title ?? "this exhibit";
    if (added > 0) ctx.setImportNote(`Added ${added} linked image${added === 1 ? "" : "s"} to “${where}” — they stay on their server; Archie keeps the links.`);
  }
  // Add-map modal (Phase 3 / Q3 — invented UX, human-gated): a Map is an Object whose source is its tile
  // template and which carries the tileSource descriptor (medium = Map). The modal supplies template + bounds.
  async function addMapObject(m: { label: string; tileSource: XyzTileSource }) {
    const ex = exhibit();
    if (!ex) return;
    const id = mintObjectId();
    await appendObject({ id, source: m.tileSource.template, label: m.label, tileSource: m.tileSource });
    ctx.switchObject(id);
    ctx.toEditor();
  }
  // Add a LOCAL image file: store bytes in OPFS (persists), source "/assets/{name}". For phone photos
  // with EXIF orientation (≠1), BAKE an upright display master (CONTEXT §89.1) — the original is
  // preserved beside it (assets-original/), provenance records the transform, and the object targets
  // the upright master so the coord layer stays orientation-blind.
  // Returns whether an object was created + any per-file advisory (large-AV nudge / unsupported), so the
  // caller (addFiles / folder import) composes ONE message instead of each file clobbering the surface.
  // `targetSlug` (defaults to current) is the pinned exhibit a multi-file loop is importing into — see
  // appendObject's comment; every OPFS path below must use it too, or bytes would save under the right
  // slug while metadata drifted (or vice versa) once the user switches exhibits mid-import.
  // `batch` (ingest-batch scale-fix): when a multi-file caller passes one, the built object is QUEUED onto it
  // (committed to library.json in ONE persist per chunk) instead of appended-and-persisted per file. Ids are
  // ULIDs (mintObjectId) either way, so the batch delay never affects id uniqueness. Absent (single-file
  // callers) → the pre-batch immediate appendObject per file. Media byte-writes are per file either way.
  async function addObjectFromFile(file: File, targetSlug: string = ctx.currentSlug(), batch?: AppendBatch): Promise<{ added: boolean; note?: string; reason?: AddFileRefusal }> {
    if (!ctx.storeReady()) return { added: false }; // OPFS unavailable — caller surfaces this once
    const ex = exhibitBySlug(targetSlug);
    if (!ex) return { added: false };
    const slug = targetSlug;
    // Both the batch and single-file paths mint the same way: a library-global ULID (mintObjectId,
    // Archie-9ea8). A ULID is unique the instant it's minted — it never reads live meta — so a manual add
    // concurrent with a batch import can't collide with a queued-but-not-yet-flushed id. Nothing to reserve
    // or release; the id is settled the moment it's minted.
    const id = mintObjectId();
    // Queue onto the batch (durable at the next chunk flush) or append-and-persist now — same object either way.
    const place = (obj: ObjectMeta, blobUrl?: string): Promise<void> =>
      batch ? (batch.add(obj, blobUrl), Promise.resolve()) : appendObject(obj, blobUrl, targetSlug);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    // AV INGEST (§152 gate lifted 2026-05-26, user): store an audio/video file as an OPFS asset — no EXIF/dims.
    // It renders in AvEditor (WaveSurfer waveform for audio · <video> for video). Local blob → no CORS on decode.
    if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
      const mediaType: "sound" | "video" = file.type.startsWith("video/") ? "video" : "sound";
      const avName = `${id}-${safe}`;
      // Bytes THROUGH the queue, then the object (reference-after-bytes): a failed write is now visible
      // in saveStatus AND aborts the add, so library.json never references bytes that didn't land.
      if (!(await persistAsset(slug, () => saveAssetFile(slug, avName, file)))) return { added: false, reason: "storage" };
      await place({ id, source: `${ASSET_PREFIX}${avName}`, label: file.name.replace(/\.[^.]+$/, "") || "Untitled object", mediaType }, URL.createObjectURL(file));
      return file.size > LARGE_MEDIA_BYTES
        ? { added: true, note: `“${file.name}” is large (${Math.round(file.size / (1024 * 1024))} MB). For very large recordings, paste a link instead — it keeps your library small.` }
        : { added: true };
    }
    if (!file.type.startsWith("image/")) {
      return { added: false, reason: "unsupported" };
    }

    // Reading the bytes off the device is its own phase, and its own reason: a file chosen minutes ago can
    // be gone, renamed, or on a disconnected volume by the time the batch reaches it. Isolated in its own
    // try so nothing else can be mistaken for it.
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch (e) {
      console.warn(`[ingest] could not read ${file.name} from disk`, e);
      return { added: false, reason: "unreadable" };
    }
    const orientation = readExifOrientation(bytes);
    let master: Blob = file;
    let masterMime = file.type || "image/jpeg"; // the stored master's encoding (drives the thumbnail's)
    let name = `${id}-${safe}`;
    let dims: { w: number; h: number } | null = null;
    let provenance: ObjectProvenance | undefined;

    // DECODE PHASE. bakeDisplayMaster / downscaleIfNeeded both route through createImageBitmap, which
    // rejects on bytes it can't decode — a damaged file, or a format this engine lacks. That throw used to
    // escape to the callers' bare `catch { failed++ }`, which is why a corrupt file could only ever be
    // counted, never explained. Catching it HERE (where the phase is known) turns it into a reason.
    // The persistAsset early-returns inside are ordinary returns, not throws — they keep their own reason.
    try {
    if (isTiffMime(file.type)) {
      // TIFF PATH (docs/research/browser-storage-quota.md follow-up 3): browsers have no TIFF decoder,
      // so this format used to pass the image/* gate and then die in createImageBitmap — counted, never
      // explained, 375 files at once in the Gawan import. Decode via UTIF, store as a WebP display
      // master (measured 8–15× smaller than the LZW source at equivalent quality). The TIFF original is
      // deliberately NOT kept in OPFS — retaining it would cancel the storage win; archival masters
      // belong outside the working store (the research doc's Figma lesson). A throw here (damaged file,
      // exotic layout UTIF can't parse) falls to the decode-phase catch → the "undecodable" refusal.
      const t = await transcodeTiff(bytes, MAX_MASTER_DIM);
      master = t.blob;
      masterMime = "image/webp";
      dims = { w: t.width, h: t.height };
      name = `${id}-${safe.replace(/\.[^.]+$/, "")}.webp`;
    } else if (!isOrientationNoop(orientation)) {
      // EXIF path: upright PNG master, capped to the §80 display size; the untouched original is
      // preserved for citation (the master differs by rotation — provenance records the transform).
      const baked = await bakeDisplayMaster(file, { maxDim: MAX_MASTER_DIM }); // upright PNG; capped
      master = baked.blob;
      masterMime = "image/png"; // bakeDisplayMaster's default output is PNG
      dims = { w: baked.width, h: baked.height };
      name = `${id}-${safe.replace(/\.[^.]+$/, "")}.png`;
      const originalName = `${id}-${safe}`;
      // Through the queue: a failed original write aborts the add (no provenance ref to absent bytes).
      if (!(await persistAsset(slug, () => saveOriginalFile(slug, originalName, file)))) return { added: false, reason: "storage" };
      provenance = { exifOrientation: orientation, transform: orientationTransform(orientation), originalName };
    } else {
      // No rotation needed. If the image exceeds the §80 cap, downscale to a display master PRESERVING
      // the source format (LARGE-MEDIA-MEMORY-CEILING #4) — a big JPEG stays JPEG. Under the cap → keep
      // the raw file untouched. Decode ONCE to read dims; downscale only if over the cap (POLISH P6).
      const prepared = await downscaleIfNeeded(file, MAX_MASTER_DIM, file.type || "image/jpeg");
      master = prepared.blob;
      dims = { w: prepared.width, h: prepared.height };
    }
    } catch (e) {
      console.warn(`[ingest] could not decode ${file.name}`, e);
      return { added: false, reason: "undecodable" };
    }

    const blobUrl = URL.createObjectURL(master);
    if (!dims) dims = await imageDims(blobUrl); // orientation-1 path: probe the (upright) master
    // Master bytes THROUGH the queue, before appendObject (reference-after-bytes): a failed write is
    // visible in saveStatus AND aborts the add — library.json never references an asset that didn't land.
    if (!(await persistAsset(slug, () => saveAssetFile(slug, name, master)))) return { added: false, reason: "storage" };
    // Bake a small grid/overview thumbnail from the master (null when the master is already within
    // THUMB_DIM). A thumbnail is a PURE optimization — its failure must NEVER block an import (the grid
    // falls back to the master via thumbnailUrl). Same name, sibling assets-thumb/ dir.
    let thumbnail: string | undefined;
    let plateBlob: Blob = master; // the rail/overview plate: the baked thumb when we get one, else the master
    try {
      const thumb = await bakeThumbnail(master, THUMB_DIM, masterMime);
      // Through the queue for VISIBILITY, but NON-blocking: a thumbnail is a pure optimization, so a
      // failed thumb write is recorded in saveStatus yet never aborts the import — the object is added
      // without a `thumbnail` ref (the grid falls back to the master), so there is no dangling reference.
      if (thumb && (await persistAsset(slug, () => saveThumbFile(slug, name, thumb)))) {
        thumbnail = `${ASSET_THUMB_PREFIX}${name}`;
        plateBlob = thumb;
      }
    } catch (e) {
      console.warn(`[ingest] thumbnail bake skipped for ${name}`, e);
    }
    // Register the plate under a SEPARATE blob URL from the master slot: the slot is revoked on the next
    // object switch, but the grid plate must survive until the exhibit is left (masters-on-demand, 1.2).
    ctx.setPlate(id, URL.createObjectURL(plateBlob));
    await place(
      { id, source: `${ASSET_PREFIX}${name}`, label: file.name.replace(/\.[^.]+$/, "") || "Untitled object", ...(dims ? { width: dims.w, height: dims.h } : {}), ...(thumbnail ? { thumbnail } : {}), ...(provenance ? { provenance } : {}) },
      blobUrl,
    );
    return { added: true };
  }
  // Accepts a FileList (drag-drop / file-input) OR a File[] (the create dialog's folder path in
  // add-to-exhibit scope, Archie-56cf — folder files add straight INTO the current exhibit, no
  // per-subfolder split, which is a new-exhibit concept). Array.from normalizes both.
  async function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    ctx.setImportNote("");
    // OPFS unavailable (e.g. a private window): warn ONCE up front. Without this the per-file no-op
    // (addObjectFromFile → storeReady false) left the user with a spinner flash and no explanation —
    // the inverse of the folder-import path, which already warns. (Archie image-upload UX fix.)
    if (!ctx.storeReady()) {
      ctx.setImportNote("This browser can’t store files here — you may be in a private window. Use a normal window to add media.", "problem");
      return;
    }
    const opened = exhibit();
    if (!opened) {
      ctx.setImportNote("Open an exhibit first.", "problem");
      return;
    }
    // Pin the exhibit this drop targets (tend Issue 7, ledgers/NEGSPACE.md): a multi-file drop has the
    // same mid-flow-interruption exposure as the folder/manifest loops below — without this, switching
    // exhibits partway through a drop would silently redirect the remaining files.
    const targetSlug = opened.slug;
    // Batch the library.json appends (scale-fix): one persist per IMPORT_PERSIST_CHUNK files, not per file.
    // Per-file asset byte-writes (inside addObjectFromFile) and the per-file progress status are unchanged.
    const batch = beginBatch(targetSlug);
    let added = 0, unexplained = 0, notAttempted = 0;
    const notes: string[] = [];
    const refusals: { reason: AddFileRefusal; name: string }[] = [];
    const run = importRuns.begin();
    try {
      for (let i = 0; i < list.length; i++) {
        run.tick({ name: list[i]!.name, index: i + 1, total: list.length });
        // Skip-and-tally (code-review defect 1): addObjectFromFile can THROW — bakeDisplayMaster /
        // downscaleIfNeeded reject on a corrupt/undecodable image (createImageBitmap), realistic in a big
        // drop. An escaping throw would skip the trailing flush and LOSE the successfully-processed files
        // still in batch.pending (their asset bytes already written → orphaned). Swallow, tally, keep going —
        // exactly what the sibling newExhibitFromFolder loop does; the flush below still commits the survivors.
        try {
          const r = await addObjectFromFile(list[i]!, targetSlug, batch);
          if (r.added) added++;
          // A refusal now carries WHY. Note the old shape double-counted: a file refused WITH a note both
          // incremented `failed` AND pushed the note, so one storage failure read "Couldn't store that on
          // this device… 1 couldn't be added." — the same event reported twice, the second time blankly.
          else if (r.reason) refusals.push({ reason: r.reason, name: list[i]!.name });
          else unexplained++; // storeReady/exhibit-gone: the caller already surfaced those up front
          if (r.note) notes.push(r.note); // advisories on a SUCCESSFUL add (the large-AV nudge)
          // A storage refusal is TERMINAL for the batch (no-preflight contract, header comment at
          // STOPPED_EARLY): the device is actually full, so every remaining write is doomed — stop,
          // count what wasn't attempted, and let the flush commit the survivors.
          if (r.reason === "storage") { notAttempted = list.length - (i + 1); break; }
        } catch (e) {
          // addObjectFromFile classifies its own throws now, so reaching here means something outside the
          // read/decode phases failed. Log it — an unexplained tally the console can't explain either is
          // the hole this whole change exists to close.
          console.error(`[ingest] unclassified failure adding ${list[i]!.name}`, e);
          unexplained++;
        }
        await batch.flushIfFull();
      }
      await batch.flush(); // durable-before-return: the batch's tail is committed before we compose the summary
    } finally {
      run.end();
    }
    // Confirm the add AND name where it landed (reuses the importNote idiom that already confirms cites).
    // Compose one message so a mixed batch (some added, some unreadable) reads cleanly.
    const where = exhibitBySlug(targetSlug)?.title ?? "this exhibit";
    const parts: string[] = [];
    if (added > 0) parts.push(`Added ${added} file${added === 1 ? "" : "s"} to “${where}”.`);
    parts.push(...notes);
    // Successes first, then the caveats — the house order (mirrors the CSV/WADM summaries). Each refusal
    // clause names its CAUSE, so "1 couldn't be added." is gone in favour of what actually went wrong.
    parts.push(...refusalSentences(refusals));
    if (notAttempted > 0) parts.push(STOPPED_EARLY(notAttempted));
    // Only a failure nothing could classify falls back to a bare count — and it says so, rather than
    // implying a reason exists that we simply declined to give.
    if (unexplained > 0) parts.push(`${unexplained} file${unexplained === 1 ? "" : "s"} couldn't be added, for no reason Archie could identify.`);
    // A batch that lost files is NOT a clean success, even when most of them landed: the overview band's
    // glyph is the loudest thing in it and the first thing scanned, so a partial loss must not wear a ✓.
    const lost = refusals.length + unexplained + notAttempted;
    if (parts.length > 0) ctx.setImportNote(parts.join(" "), lost > 0 ? "problem" : "ok");
  }

  // Folder → exhibit in one gesture (contributor-broadening ① sub-cycle A, Archie-e1d6): the folder
  // names the exhibit; its media files become objects in reading order. Each file goes through the
  // SAME ingest as a hand-picked one (addObjectFromFile: EXIF bake, OPFS, AV branch) — no second path.
  // `title` (Archie-46bf, restoring the create dialog's editable-title path) is the dialog's optional
  // override — it only ever arrives non-blank when the folder produced exactly ONE group (the dialog's
  // title field is hidden in the "per-subfolder" multi-group branch), so it's applied only then; a
  // multi-group import always names each exhibit from its own subfolder, override or not.
  async function newExhibitFromFolder(files: File[], title?: string) {
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
    const titleOverride = groups.length === 1 && title && title.trim() !== "" ? title.trim() : undefined;
    let failed = 0, imported = 0, notAttempted = 0, exhibitsMade = 0;
    const refusals: { reason: AddFileRefusal; name: string }[] = [];
    const run = importRuns.begin();
    try {
      // No whole-folder quota preflight (no-preflight contract, header comment at STOPPED_EARLY): the
      // estimate() headroom is a ~10 GiB privacy constant, so gating on it refused folders the device
      // could hold. The storage-refusal break below is the honest replacement — it stops before minting
      // further titled-but-empty exhibits, which is the trail the old preflight existed to prevent.
      groupLoop: for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi]!;
        await ctx.newExhibit(titleOverride ?? g.name);
        exhibitsMade++;
        // Pin THIS group's exhibit slug right after creating it (tend Issue 7, ledgers/NEGSPACE.md):
        // the per-file loop below has awaits the user can act during, and a multi-folder import
        // navigates through several exhibits in turn — without pinning, switching exhibits mid-group
        // would silently redirect that group's remaining files onto whatever's now current.
        const targetSlug = ctx.currentSlug();
        // storeReady is PER-EXHIBIT state — openExhibit (inside newExhibit) just set it. Without
        // it, addObjectFromFile would no-op per file = titled, silently-empty exhibits; stop loudly.
        if (!ctx.storeReady()) {
          ctx.alert("Made the exhibit, but this browser can't store files — open a normal window to add them.");
          return;
        }
        // One batch per group (scale-fix): this group's files commit to library.json in ONE persist per
        // chunk, not per file. Per-file asset writes + per-file progress are unchanged.
        const batch = beginBatch(targetSlug);
        for (let i = 0; i < g.files.length; i++) {
          const p = g.files[i]!;
          run.tick({ name: p.name, index: i + 1, total: g.files.length });
          // Re-wrap typeless files (.tiff, .avif on some platforms) with the inferred MIME the
          // plan admitted them under — addObjectFromFile branches on File.type.
          const file = p.file.type ? p.file : new File([p.file], p.file.name, { type: inferredMime(p) });
          try {
            const r = await addObjectFromFile(file, targetSlug, batch);
            if (r.added) imported++;
            else if (r.reason) refusals.push({ reason: r.reason, name: file.name });
            else failed++;
            if (r.note) ctx.setImportNote(r.note); // large-AV nudge; the end-of-import summary overrides it if any
            // Terminal storage refusal — same contract as addFiles: the device is full, every later
            // write is doomed. Count the rest of THIS group plus every whole later group, flush this
            // group's survivors, and stop before minting the next (empty) exhibit.
            if (r.reason === "storage") {
              notAttempted = g.files.length - (i + 1)
                + groups.slice(gi + 1).reduce((n, later) => n + later.files.length, 0);
              await batch.flush();
              break groupLoop;
            }
          } catch (e) {
            console.error(`[ingest] unclassified failure adding ${file.name}`, e);
            failed++; // skip-and-tally: one corrupt scan must not abort the rest of the folder
          }
          await batch.flushIfFull();
        }
        await batch.flush(); // commit this group's tail before minting the next group's exhibit
      }
    } finally {
      run.end();
    }
    // Same shape as addFiles': the head, then a clause per refusal REASON, then the unclassifiable
    // remainder as a bare count that admits it is one.
    const tail = [
      ...refusalSentences(refusals),
      ...(notAttempted > 0 ? [STOPPED_EARLY(notAttempted)] : []),
      ...(failed > 0 ? [`${failed} file${failed === 1 ? "" : "s"} couldn't be added, for no reason Archie could identify.`] : []),
    ];
    // `exhibitsMade`, not `groups.length` — a storage stop mid-folder means later groups never got
    // their exhibits, and the summary must not claim they did.
    const summary = [`Added ${imported} file${imported === 1 ? "" : "s"} to ${exhibitsMade} exhibit${exhibitsMade === 1 ? "" : "s"}.`, ...tail].join(" ");
    const lost = refusals.length + failed + notAttempted;
    if (groups.length > 1) {
      // Several new exhibits — surface the summary via the app's dialog chrome (the rail's importNote
      // isn't rendered at the Library scale). NB: the caller navigates back to the Library separately.
      ctx.alert(summary);
    } else if (lost > 0) {
      ctx.setImportNote(summary, "problem"); // this branch fires ONLY on a partial loss — never a clean ✓
    }
    return { groups: groups.length };
  }
  // Fetch + cap + parse a IIIF manifest into a plan — the SHARED head of both manifest flows (new
  // exhibit vs. add into the current one, Archie-56cf). ONE definition of the fetch/cap/parse so the
  // into-exhibit path can't drift from the new-exhibit path (same drift the untrusted-archive seam
  // guards against). Returns null AFTER surfacing the failure via ctx.alert — the callers just bail.
  // Cap enforced twice (mirrors @render/core's fetchArchieLibraryBytes, a DIFFERENT trust boundary —
  // see IIIF_MANIFEST_MAX_BYTES): first cheaply against a declared content-length before reading the
  // body, then against the actual received size — a missing/lying header can't bypass it.
  // `opts.signal` (Archie-656a) makes the fetch abortable for the collection preview/import; absent = the
  // pre-656a always-on behavior. `opts.onError` redirects the failure message away from ctx.alert for the
  // BATCH caller (newExhibitsFromCollection), which composes ONE summary from N skip reasons per PLAN §6
  // instead of firing N modal alerts — it defaults to ctx.alert, so the single-manifest callers are
  // byte-identical (same messages, same console line, same null returns) to before.
  async function fetchManifestPlan(url: string, opts: { signal?: AbortSignal; onError?: (msg: string) => void } = {}): Promise<ManifestPlan | null> {
    const trimmed = url.trim();
    if (!trimmed) return null;
    const onError = opts.onError ?? ctx.alert;
    let json: unknown;
    try {
      json = await fetchJsonCapped(trimmed, opts.signal);
    } catch (e) {
      onError(manifestFetchFailureMessage(e, trimmed));
      return null;
    }
    try {
      return manifestToExhibit(json, trimmed);
    } catch (e) {
      console.error("IIIF manifest parse failed", e);
      onError(e instanceof ManifestImportError ? e.message : "Couldn't read that IIIF link — it doesn't look like a valid manifest.");
      return null;
    }
  }
  // Append a plan's objects onto `targetSlug`. Pinned slug (tend Issue 7, ledgers/NEGSPACE.md): the
  // per-object loop awaits per object, and nothing blocks the user from navigating elsewhere mid-import —
  // without pinning, a later object would silently land on whatever exhibit is now current.
  async function importManifestObjects(plan: ManifestPlan, targetSlug: string) {
    // Batch the appends (scale-fix): the manifest's canvases commit to library.json in ONE persist per chunk
    // (a typical manifest = one persist), not one full-library.json rewrite per canvas. Progress still ticks
    // per object. A flush throwing (storage broken) PROPAGATES — the collection drain catches it as fatal.
    const batch = beginBatch(targetSlug);
    const run = importRuns.begin();
    try {
      for (let i = 0; i < plan.objects.length; i++) {
        const o = plan.objects[i]!;
        run.tick({ name: o.label, index: i + 1, total: plan.objects.length });
        if (!exhibitBySlug(targetSlug)) break; // exhibit vanished (deleted mid-import) — stop; a flush is a no-op on it
        batch.add({ id: mintObjectId(), ...o });
        await batch.flushIfFull();
      }
      await batch.flush();
    } finally {
      run.end();
    }
  }
  // IIIF manifest URL → NEW exhibit (contributor-broadening ②, Archie-bc01): one paste bootstraps from any
  // institutional IIIF collection. Objects reference the REMOTE images (service base preferred), so
  // nothing is downloaded: the manifest's dims ride along and no OPFS bytes are written.
  // `title` (Archie-46bf) is the dialog's optional override of the manifest's own label — used only
  // when non-blank, so a caller that never offers the title field (or leaves it untouched) sees the
  // exact same derived-name behavior as before.
  // The plan→exhibit TAIL shared by the single-manifest flow and the collection batch (Archie-656a): mint
  // the exhibit, optionally stamp a provenance description onto its `summary`, then append the plan's
  // objects. Returns the created slug (the collection batch records it for undo). Both opts are passed only
  // by the collection path — newExhibitFromManifest omits them, so its behavior is byte-identical to the
  // old inline `newExhibit + importManifestObjects` pair. patchExhibit's write coalesces into the append's
  // persist below (a valid plan always has ≥1 object, so the summary is always flushed durably).
  // `onCreated` fires the INSTANT the exhibit is minted (before the append that can throw), so the batch
  // can sweep a half-minted exhibit for undo even when a later storage write rejects — see the drain catch.
  // `navigate` (Archie-cbf6): the single-manifest flow lands the user IN the new exhibit (newExhibit →
  // openExhibit); the collection batch passes `false` so it does NOT open each of N exhibits (opening 520
  // editors would thrash session/thumb loading AND unmount the dialog hosting the import's progress/summary,
  // which only renders at the Library view). newExhibitInLibrary creates + returns the slug without nav.
  async function createExhibitFromPlan(plan: ManifestPlan, title: string, opts: { summary?: string; onCreated?: (slug: string) => void; navigate?: boolean } = {}): Promise<string> {
    let slug: string;
    if (opts.navigate ?? true) {
      await ctx.newExhibit(title);
      slug = ctx.currentSlug();
    } else {
      slug = await ctx.newExhibitInLibrary(title);
    }
    opts.onCreated?.(slug);
    // Stamp the manifest's own descriptive data onto the minted exhibit (Archie-c6bf): summary /
    // rights / credit land on the NATIVE fields, the mapped `metadata` pairs on the entries. The
    // collection batch's provenance description (opts.summary) WINS over the manifest's own summary —
    // it's the caller's deliberate stamp (PLAN §6). Per-object entries ride importManifestObjects's
    // `{ ...o }` spread. Safe on a FRESH exhibit only — addManifestToExhibit deliberately does NOT
    // stamp these (importing into an existing exhibit must not overwrite its authored fields).
    const summary = opts.summary ?? plan.summary;
    const stamp = {
      ...(summary !== undefined ? { summary } : {}),
      ...(plan.rights !== undefined ? { rights: plan.rights } : {}),
      ...(plan.requiredStatement !== undefined ? { requiredStatement: plan.requiredStatement } : {}),
      ...(plan.metadata && plan.metadata.length ? { metadata: plan.metadata } : {}),
    };
    if (Object.keys(stamp).length > 0) ctx.lib.patchExhibit(slug, stamp);
    await importManifestObjects(plan, slug);
    return slug;
  }
  async function newExhibitFromManifest(url: string, title?: string) {
    const plan = await fetchManifestPlan(url);
    if (!plan) return;
    // Failure containment (scale-fix): createExhibitFromPlan mints the exhibit (ctx.newExhibit) then appends
    // its objects. A save failure is already non-throwing (it surfaces in saveStatus via the save queue), but
    // exhibit creation can reject — catch it so the single-manifest path never leaks an unhandled rejection,
    // and surface it through the same ctx.alert channel the fetch/parse failures use. The exhibit may be
    // left partially populated (its committed prefix persisted durably); the alert tells the user to check.
    try {
      await createExhibitFromPlan(plan, title && title.trim() !== "" ? title.trim() : plan.title);
    } catch (e) {
      console.error("IIIF manifest import failed", e);
      ctx.alert("Couldn't finish importing that manifest to this device — some of it may not have been added. Check the save indicator.");
    }
  }
  // IIIF manifest URL → append into the CURRENT exhibit (Archie-56cf — the create dialog's IIIF path in
  // add-to-exhibit scope). Same fetch/cap/parse + append as newExhibitFromManifest; the ONLY difference is
  // it lands the manifest's pages on the open exhibit instead of minting a fresh one.
  async function addManifestToExhibit(url: string) {
    const targetSlug = ctx.currentSlug();
    if (!exhibitBySlug(targetSlug)) return;
    const plan = await fetchManifestPlan(url);
    if (!plan) return;
    await importManifestObjects(plan, targetSlug);
  }
  // Paste-time collection preview (PLAN §5, Archie-656a). Fetch + double-cap + parse the ROOT document
  // under the SAME IIIF_MANIFEST_MAX_BYTES discipline as a manifest, classify it, then:
  //  • manifest   → signal the dialog to route to the existing single-manifest path (no traversal);
  //  • collection → traverse it (each sub-collection doc fetched under the same cap, honoring `signal`),
  //                 returning the TraverseResult (its `status` carries over-manifest-cap + the exact
  //                 `manifestCount` for the dialog's refuse-with-count) and the root title for the picker;
  //  • neither    → an error the dialog renders.
  // A network failure alerts in fetchManifestPlan's voice — the ONE place this preview drives chrome; per
  // the design note it otherwise returns DATA and lets the dialog own the UI.
  async function fetchCollectionPreview(url: string, signal?: AbortSignal): Promise<CollectionPreview> {
    const trimmed = url.trim();
    if (!trimmed) return { kind: "error", message: "Paste a IIIF manifest or collection URL." };
    let rootJson: unknown;
    try {
      rootJson = await fetchJsonCapped(trimmed, signal);
    } catch (e) {
      // A debounce-abort must be SILENT and discardable — never a modal (the dialog fires one preview per
      // keystroke). Check the signal too, in case the environment's abort surfaces as a non-AbortError.
      if (signal?.aborted || isAbortError(e)) return { kind: "aborted" };
      const message = manifestFetchFailureMessage(e, trimmed);
      ctx.alert(message); // network-failure voice — matches fetchManifestPlan's single-manifest path
      return { kind: "error", message };
    }
    const kind = classifyIiifDocument(rootJson);
    if (kind === "manifest") {
      // D2 (Archie-cbf6): the root doc is already fetched AND classified here, so parse it into a plan and
      // carry it — the dialog's single-manifest fall-through then renders title + canvas count WITHOUT a
      // second fetch of the same URL (the pre-cbf6 payload-less `manifest` result forced a re-fetch via
      // previewManifest). manifestToExhibit can still reject a manifest-shaped doc it can't plan (no
      // canvases, unreadable bodies) — map that to the same plain-language error voice as a bad paste.
      try {
        return { kind: "manifest", plan: manifestToExhibit(rootJson, trimmed) };
      } catch (e) {
        console.error("IIIF manifest parse failed", e);
        return { kind: "error", message: e instanceof ManifestImportError ? e.message : "Couldn't read that IIIF link — it doesn't look like a valid manifest." };
      }
    }
    if (kind !== "collection") return { kind: "error", message: "That URL didn't return a IIIF manifest." };
    const rootTitle = labelToString((rootJson as Record<string, unknown>)["label"], urlSegment(trimmed));
    // Traverse with an abort-aware fetcher: once the signal fires, throw an AbortError instead of feeding
    // fetches, so traverseCollection stops charging its budget on doomed sub-collection loads. traverse
    // still folds that throw into a fetch-failed skip (its contract), so we DISCARD the whole result on
    // abort below — a cancelled traversal must NEVER surface as a `collection` full of phantom skips.
    const result = await traverseCollection(rootJson, trimmed, (u) => {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return fetchJsonCapped(u, signal);
    });
    if (signal?.aborted) return { kind: "aborted" };
    return { kind: "collection", rootTitle, result };
  }
  // IIIF Collection URL → N new exhibits (PLAN §5–6, Archie-656a). Imports the CHECKED subset the dialog
  // collected. A worker pool of 4 fetches manifests concurrently; a REORDER BUFFER commits exhibits in
  // `selected` order however out-of-order the fetches land, so the same collection always yields the same
  // library order. Skip-and-continue per manifest (render-core "corrupt ≠ empty" per-item tolerance): a
  // failed/null plan skips its slot with a reason and the batch proceeds — no retry (PLAN §6). `planCache`
  // is the dialog's hydration cache keyed by manifest URL, so a plan already fetched at preview time is NOT
  // refetched. Provenance (§8): each exhibit's `summary` is stamped "From: {trail}" (the plan carries no
  // description of its own). Returns the created slugs IN COMMIT ORDER (the Import batch the next ticket
  // wires to Undo), the manifest-side skips, `cancelled` (true when a user abort stopped it early), and
  // `fatal` (a storage-error message when a commit threw). Three distinct stop conditions the dialog reads:
  // a user abort (`cancelled`) and a storage failure (`fatal`) both stop launching and commit nothing
  // further while KEEPING the committed prefix; per-manifest failures go in `skipped` and the batch
  // continues. The function NEVER throws — even a mid-commit storage rejection returns the summary.
  async function newExhibitsFromCollection(
    selected: DiscoveredManifest[],
    opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; planCache?: Map<string, ManifestPlan> } = {},
  ): Promise<CollectionImportOutcome> {
    const { signal, onProgress, planCache } = opts;
    const total = selected.length;
    const createdSlugs: string[] = [];
    const skipped: { id: string; label?: string; reason: string }[] = [];
    // One slot per selected manifest: its resolved plan (null = skip, with the reason) once `settled`.
    const slots: { plan: ManifestPlan | null; reason: string; settled: boolean }[] =
      selected.map(() => ({ plan: null, reason: "", settled: false }));
    let nextCommit = 0; // lowest slot not yet committed/skipped — the reorder buffer's read cursor
    let cancelled = false;
    // A commit (storage-side) failure message, once one occurs. FATAL by design: a commit throw means the
    // OPFS write path is broken (appendObject/persist rejected), which won't heal within this batch — so we
    // stop launching and stop committing rather than grind through hundreds more doomed writes. Distinct
    // from `cancelled` (user abort) and from per-manifest `skipped` (manifest-side): the dialog shows a
    // storage-problem message, but STILL gets `createdSlugs` (the undo record for what did commit).
    let fatal: string | null = null;
    let committing = false; // serializes the async commit drain (commits are awaited and must land in order)

    // Commit every in-order settled slot we can, in `selected` order. Reentrancy-guarded: a fetch settling
    // during an in-flight commit re-enters here, finds the guard up, and returns — the running drain picks
    // its slot up on the next loop turn (settled flags are monotonic and re-read every iteration, and the
    // guard can only be up while some worker awaits this drain, so no settled slot is ever left undrained).
    const drainCommits = async (): Promise<void> => {
      if (committing) return;
      committing = true;
      try {
        while (nextCommit < total && slots[nextCommit]!.settled) {
          if (signal?.aborted) { cancelled = true; break; } // check BEFORE each commit (PLAN §6 cancel)
          if (fatal) break; // a prior commit hit a storage failure — stop the batch (see `fatal` above)
          const i = nextCommit;
          const ref = selected[i]!;
          const { plan, reason } = slots[i]!;
          if (plan) {
            let mintedSlug: string | null = null; // set by onCreated the instant newExhibit succeeds
            try {
              const slug = await createExhibitFromPlan(plan, plan.title, { summary: "From: " + ref.trail.join(" › "), onCreated: (s) => { mintedSlug = s; }, navigate: false });
              createdSlugs.push(slug);
            } catch (e) {
              // The commit threw — a STORAGE-side failure, not a manifest-side one. ctx.newExhibit may have
              // ALREADY minted the exhibit before the append rejected, so this slot must NEVER be retried:
              // advance past it and mark the batch fatal so no further slot commits. The function still
              // RETURNS its summary — a poisoned store never makes this reject.
              // ORPHAN SWEEP: if the exhibit WAS minted (mintedSlug set), record its slug in createdSlugs so
              // the undo batch removes the half-imported exhibit; if newExhibit itself threw, mintedSlug is
              // null → nothing to sweep. createdSlugs and skipped OVERLAP by design for a fatal slot —
              // createdSlugs = "slugs undo should remove", skipped = "manifests that didn't fully import";
              // a slot that minted an exhibit then failed its append is BOTH.
              if (mintedSlug) createdSlugs.push(mintedSlug);
              fatal = e instanceof Error ? e.message : String(e);
              skipped.push({ id: ref.id, ...(ref.label !== undefined ? { label: ref.label } : {}), reason: "Couldn't save this exhibit to this device — import stopped." });
              nextCommit++; // step past the poisoned slot BEFORE bailing so no re-entrant drain retries it
              onProgress?.(nextCommit, total);
              break;
            }
          } else {
            skipped.push({ id: ref.id, ...(ref.label !== undefined ? { label: ref.label } : {}), reason });
          }
          nextCommit++;
          onProgress?.(nextCommit, total);
        }
      } finally {
        committing = false;
      }
    };

    let cursor = 0; // shared next-to-fetch index across the pool
    const worker = async (): Promise<void> => {
      while (true) {
        if (signal?.aborted) { cancelled = true; return; } // check BETWEEN jobs (PLAN §6 cancel)
        if (fatal) return; // a commit hit a fatal storage failure — stop launching new fetches
        const i = cursor++;
        if (i >= total) return;
        const ref = selected[i]!;
        const cached = planCache?.get(ref.id);
        if (cached) {
          slots[i] = { plan: cached, reason: "", settled: true };
        } else {
          let reason = "";
          // Conditional-spread `signal` (not `{ signal }`) to satisfy exactOptionalPropertyTypes — an
          // explicitly-undefined optional property is a type error under the .ts gate (tsc --noEmit).
          const plan = await fetchManifestPlan(ref.id, { onError: (m) => { reason = m; }, ...(signal ? { signal } : {}) });
          slots[i] = { plan, reason: plan ? "" : (reason || "Couldn't import this manifest."), settled: true };
        }
        await drainCommits();
      }
    };

    await Promise.all(Array.from({ length: Math.min(4, total) }, () => worker()));
    await drainCommits(); // flush any tail the reentrancy guard deferred (a no-op if the pool already drained)
    return { createdSlugs, skipped, cancelled, fatal };
  }
  // CSV → notes bulk import (contributor-broadening ⑥ sub-cycle A, Archie-79c0): authors who live in
  // Excel/Sheets annotate THERE (object,x,y,w,h,comment[,tags][,reading]) and bulk-load through the
  // SAME createNote path the seeds use. Skip-and-tally per row; fix-and-retry deduped on target+comment.
  async function importNotesCsv(file: File) {
    if (file.size > LOCAL_TEXT_IMPORT_MAX_BYTES) {
      ctx.setImportNote(`“${file.name}” is too large (${Math.round(file.size / (1024 * 1024))} MB) to import as notes — check it's really a CSV of your annotations.`, "problem");
      return;
    }
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
      // ADR-0026 note (review of f344114): a user-supplied `objectId` here is target-AUTHORING, not a
      // migration input — the note is being attached to whatever object the id names. A pasted LEGACY
      // `o<n>` in a migrated library therefore DANGLES (points at nothing), it does not resurrect an
      // object — the same read-time tolerance every `archie:` ref has. This is a pre-existing contract;
      // flagged for a future id-validation/normalization pass, no behavior change here.
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
    // Coordinate-free rows (no x,y,w,h) stage for "Set area" instead of importing — they can't enter the
    // log without geometry (session.ts). addPendingNotes dedups + persists, returning the NEW count.
    const staged = ctx.addPendingNotes(plan.pending);
    // Compose ONE message across the three buckets (mirrors addFiles' parts idiom) so a mixed CSV reads cleanly.
    const parts: string[] = [];
    if (imported > 0) parts.push(`Added ${imported} note${imported === 1 ? "" : "s"} from your CSV.`);
    if (dup > 0) parts.push(`${dup} already added.`);
    if (staged > 0) parts.push(`${staged} need${staged === 1 ? "s" : ""} a region — pick “Set area” to draw ${staged === 1 ? "it" : "them"}.`);
    if (plan.skipped.length > 0) parts.push(`Skipped ${plan.skipped.length}: ${plan.skipped.slice(0, 3).map((s) => `line ${s.row}: ${s.reason}`).join("; ")}${plan.skipped.length > 3 ? "; …" : ""}`);
    // Skipped rows, or a CSV that yielded nothing at all, are outcomes the user needs to act on — not ✓.
    ctx.setImportNote(parts.length > 0 ? parts.join(" ") : "That CSV had no notes to add.",
      plan.skipped.length > 0 || parts.length === 0 ? "problem" : "ok");
  }
  // W3C/WADM annotation import (contributor-broadening ⑦ slice A): an AnnotationPage from Archie's own
  // publish, Recogito, or any standard WADM producer lands on this exhibit — re-anchored by the
  // /canvas/<id> tail, selector + bodies verbatim, deduped like the CSV path.
  async function importNotesWadm(file: File) {
    if (file.size > LOCAL_TEXT_IMPORT_MAX_BYTES) {
      ctx.setImportNote(`“${file.name}” is too large (${Math.round(file.size / (1024 * 1024))} MB) to import as notes — check it's really a notes file.`, "problem");
      return;
    }
    const session = ctx.session();
    let json: unknown;
    try { json = JSON.parse(await file.text()); }
    catch { ctx.setImportNote(`Couldn't read “${file.name}” — it isn't a valid notes file.`, "problem"); return; }
    const plan = planWadmImport(json, { objectIds: new Set(ctx.objects().map((o) => o.id)) });
    const keyFor = (target: unknown, body: unknown) => `${JSON.stringify(target)}|${JSON.stringify(body)}`;
    const existing = new Set(session.entries.map((e) => keyFor(e.target, e.body ?? [])));
    let imported = 0, dup = 0;
    for (const n of plan.notes) {
      // ADR-0026 note (review of f344114): as in importNotesCsv, `n.objectId` is target-AUTHORING —
      // planWadmImport already gates it against the exhibit's live object ids, and a pasted legacy id
      // that no longer matches simply dangles (no resurrection). Pre-existing contract; a future
      // id-validation pass may normalize/reject, but this migration wiring changes nothing here.
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
      : head + dupNote,
      plan.skipped.length > 0 ? "problem" : "ok"); // same rule as the CSV path: a skip is not a clean ✓
  }
  // Replace the current OPFS project with a loaded library (the shared body of "Open zip" + "Open folder"):
  // clear outgoing annotation dirs (no orphans under reused slugs), write each imported log, swap the meta.
  // `srcFs` (Archie-2a9a) is the SOURCE filesystem the library was loaded from (zip or folder) — the
  // structure rev-log's history pages are not part of `loadLibrary`'s return shape, so the flag-ON
  // structure merge below re-reads them from the source tree. Absent (or flag OFF) the structure
  // stores are never touched — byte-identical to the pre-2a9a replace.
  async function replaceProjectFrom(loaded: Awaited<ReturnType<typeof loadLibrary>>, srcFs?: Filesystem) {
    // Archie-788e: cancel a pending debounced save — the user confirmed replacement, and a timer
    // firing mid-replace would write the OUTGOING session into the incoming project's dirs.
    ctx.cancelPendingSave();
    // ADR-0026 trigger 2 (adoption), STEP 1 — clear the OUTGOING library's id-scheme marker + pre-migration
    // snapshot BEFORE any incoming byte lands. This ordering is a crash-window fix (review of f344114): the
    // marker is the migration engine's commit point, so it must be absent for the whole window in which the
    // store holds incoming content of an UNKNOWN scheme. If we cleared it last, a hard crash after incoming
    // LEGACY content had landed but before the clear would leave legacy ids under the stale scheme-2 marker —
    // next boot's readIdScheme sees 2, the engine passes through, and the legacy ids never migrate (the
    // forbidden coexistence, NOT self-healing). Clearing first means a crash ANYWHERE in the replace leaves a
    // MARKERLESS store, which trigger 1 re-migrates idempotently on the next boot. Deleting the outgoing
    // snapshot early is safe: the replace is destructive + confirm-gated, so that library is being discarded
    // wholesale, and a markerless composed-content store just re-marks as a no-op rewrite with a fresh snapshot.
    await resetIdSchemeState();
    const author = ctx.author();
    for (const e of ctx.lib.meta.exhibits) await clearExhibitAnnotations(e.slug);
    for (const e of loaded.library.exhibits) {
      const dir = await openExhibitAnnotationsDir(e.slug);
      if (dir) await new AnnotationSession(author, loaded.logs[e.slug] ?? []).save(dir, { baseUrl: ctx.baseUrl });
    }
    // Carry the incoming library's media BYTES into the working store — the Studio half of
    // loadLibrary's `/assets/{name}` source recovery (render-core site.ts, 2026-07-19 round-trip
    // fix). Without this, recovered sources render broken in the editor AND the next publish's
    // getAsset finds nothing, exporting an assetless zip that still references its images (the
    // silent loss the recovery exists to close). Publish writes three byte dirs per exhibit
    // (site.ts: assets/, assets-thumb/, assets-original/); mirror each to its store sibling.
    // Per-item tolerant: one unreadable/unwritable file skips-and-reports — it never aborts the
    // replace (the corruption→absence rule: the rest of the import must land).
    if (srcFs) {
      const bytesRoot = await srcFs.root();
      const sinks = [
        ["assets", saveAssetFile],
        ["assets-thumb", saveThumbFile],
        ["assets-original", saveOriginalFile],
      ] as const;
      for (const e of loaded.library.exhibits) {
        for (const [sub, save] of sinks) {
          let dir: FsDirectory;
          try {
            dir = await (await bytesRoot.getDirectory(e.slug)).getDirectory(sub);
          } catch {
            continue; // this exhibit's tree publishes no such dir — nothing to carry
          }
          for await (const entry of dir.entries()) {
            if (entry.kind !== "file") continue;
            try {
              await save(e.slug, entry.name, await (await dir.getFile(entry.name)).getFile());
            } catch (err) {
              console.warn(`[import] ${e.slug}: couldn't carry ${sub}/${entry.name} into the library's storage — that item will show as missing`, err);
            }
          }
        }
      }
    }
    // Flag-ON structure-log merge (Archie-2a9a): an incoming exhibit that carries structure/history/
    // pages MERGES them into the local exhibit's log — the same mergeLogs contract annotations use —
    // so exchanged copies keep section history and concurrent section edits surface as plural heads
    // (gated by 42f3's conflicted set, resolved by d71c/90f1 territory, never auto-resolved here).
    // Absent incoming pages → nothing is written and the next open seeds from the array as today.
    if (STRUCTURE_REVLOG && srcFs) {
      const srcRoot = await srcFs.root();
      // ADR-0026 trigger 3: the local store is already on the composed scheme (trigger 1 ran at boot),
      // so an incoming legacy-scheme section log must be composed BEFORE it merges. Cross-links in
      // section prose name their target exhibit by slug, so the migrator needs the whole incoming
      // library's slug → exhibitId map, not just the enclosing exhibit's.
      const exhibitIdBySlug = new Map(loaded.library.exhibits.map((e) => [e.slug, e.id] as const));
      for (const e of loaded.library.exhibits) {
        let exDir: FsDirectory;
        try {
          exDir = await srcRoot.getDirectory(e.slug);
        } catch {
          continue; // no per-exhibit dir in the source tree — nothing to merge
        }
        // e.id is the id this exhibit will carry post-replace (libraryToWorking keeps it), i.e. the
        // id structure-session's ensureLoaded will read the merged log back under.
        const res = await mergeImportedStructure(exDir, e.id, () => openExhibitStructureDir(e.slug),
          (log) => migrateSectionLogIds(log, e.id, exhibitIdBySlug));
        if (res.corruptIncoming.length > 0) {
          console.warn(`[structure] ${e.slug}: ${res.corruptIncoming.length} incoming structure page(s) couldn't be read and were skipped`, res.corruptIncoming);
        }
        if (res.action === "local-torn") {
          console.warn(`[structure] ${e.slug}: local structure store is torn — refusing to merge imported section history over it (nothing was overwritten).`);
        }
      }
    }
    // core's libraryToWorking is the faithful inverse of workingToLibrary (Q-3: one mapper pair, no
    // drift) — it replaces the ~8-field hand-spread this did inline AND carries `tileSource` (the inline
    // version DROPPED it, losing Map basemaps on zip-open). NB provenance doesn't round-trip (a Library
    // object lacks exifOrientation+transform) — same as the inline version, which never reconstructed it.
    ctx.lib.setMeta(libraryToWorking(loaded.library));
    await ctx.lib.persist();
    // ADR-0026 trigger 2 (adoption), STEP 2 — the incoming library now sits in the resident OPFS store
    // under NO marker (STEP 1 cleared it), with WHATEVER id scheme it was published under (legacy if it
    // predates the migration). The open seam itself (open.ts) does NOT migrate: it hands back a
    // ZipFilesystem in the published-tree LAYOUT (root `archie.json`/`collection.json`/`exhibits.json`,
    // per-exhibit dirs at root), which the working-store-shaped engine can't read — migration runs HERE,
    // where the data has landed in the working-store layout the engine understands (see the note in
    // open.ts). A markerless store reads as legacy, so the engine migrates + snapshots it fresh; it is
    // idempotent, so an already-composed archive is a no-op rewrite that just (re)writes the scheme-2
    // marker. Reload the migrated meta so the in-memory library matches disk (else the next save would
    // write legacy ids back over the composed store).
    const migration = await migrateResidentStoreIds();
    if (migration?.migrated) {
      const reloaded = await loadLibraryMeta();
      if (reloaded) ctx.lib.setMeta(reloaded);
    }
    ctx.finishReplace(); // currentSlug = first exhibit; view = "library" (atomic for BOTH callers)
  }
  // Open a published .archie.zip as the project — the symmetric inverse of Download: read it via
  // loadLibrary, then REPLACE the current OPFS project with its structure + per-exhibit logs.
  // Destructive ⇒ confirm-gated. Returns the loaded library on success (App finishes binding + nav).
  async function openZip(file: File): Promise<{ loaded: Awaited<ReturnType<typeof loadLibrary>> } | null> {
    let loaded: Awaited<ReturnType<typeof loadLibrary>>;
    let srcFs: Filesystem;
    try {
      // openArchieLibrary (@render/core) is the canonical untrusted-zip open seam (ISSUES.md Issue 5):
      // ZipFilesystem.fromZip's zip-bomb caps (ZIP_LIMITS) AND validateArchieMarker's ADR-0020 reject
      // both throw a specific, user-facing message, surfaced verbatim below (SILENCE row, tend Issue 4).
      // Before this migration, this call skipped validateArchieMarker entirely — a wrong-schema zip fell
      // through to loadLibrary's generic parse failure instead of the specific "different version of
      // Archie" message the other two open paths (load.ts, published.ts) already surfaced.
      srcFs = await openArchieLibrary(file);
      loaded = await loadLibrary(srcFs);
    } catch (e) {
      ctx.alert(e instanceof Error ? e.message : "Couldn't open that file — choose a published .archie.zip file.");
      return null;
    }
    if (loaded.library.exhibits.length === 0) { ctx.alert("That file has no exhibits to open."); return null; }
    if (!ctx.confirmReplace("Open this library? Your current library will be replaced.")) return null;
    await replaceProjectFrom(loaded, srcFs);
    // ⑧ (Archie-59a8): the summary panel — who wrote what in the copy you just opened.
    ctx.setCollabNote(collabSummaryText(file.name, collabBreakdown(loaded.logs, ctx.author())));
    // Freshness watermark (Archie-abf9, decision Archie-d71c part 3c): a merge/import from a colleague
    // just landed — snapshot each imported exhibit's others'-note count so the library card can show
    // "+N since your last import" next time. App-local localStorage only (import-freshness.ts); never
    // touches the model.
    for (const [slug, log] of Object.entries(loaded.logs)) recordImportFreshness(slug, log, ctx.author());
    return { loaded };
  }

  return {
    imageDims, appendObject, addObject, addUrlObjects, addMapObject, addObjectFromFile, addFiles,
    newExhibitFromFolder, newExhibitFromManifest, addManifestToExhibit, fetchManifestPlan, fetchCollectionPreview, newExhibitsFromCollection,
    importNotesCsv, importNotesWadm, replaceProjectFrom, openZip,
  };
}
export type IngestFlows = ReturnType<typeof createIngestFlows>;
export type { Library };

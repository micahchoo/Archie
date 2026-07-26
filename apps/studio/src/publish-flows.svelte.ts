// The publish flows (worklist 0.3 cut 2 out of App.svelte). One module for every "Library → the
// world" path: the unified Publish menu's two destinations (local folder / GitHub Pages), the
// project-zip download, the site projection + its cache, the broken-links advisory, and the
// large-library size guards. The App injects its DATA primitives (logs, library, exhibit flush);
// the binding store consumes `writeToFolder`/`downloadProjectZip` from here — "publish = zip
// primitive + per-host adapters" now has one home. A `.svelte.ts` rune module (cf.
// library-meta.svelte.ts): the $state container is never reassigned, getters stay live.
import {
  MemoryFilesystem, ZipFilesystem, publishLibrary, collectFiles, publishToGitHub, renderMarkdown, readStructureReport, asExhibitId,
  type Filesystem, type Library, type AnnotationLog, type BrokenLink, type IncompleteCanvas, type MissingAsset, type GitHubTarget, type PublishProgress, type IncrementalScope, type SectionLog, type PublishResult,
} from "@render/core";
import { supportsStreamingZipSave, openStreamingZipSave, saveZipToDisk, downloadHtml } from "./binding.js";
import type { CorruptLogFinding } from "./publish-warnings.js";
import { pickFolderBinding } from "./folder-backend.js";
import { sliceToDziAuto } from "./dzi-slice-pool.js";
import { resolveTileSource, type AObject } from "@render/core";
import { readAssetBlob, readOriginalBytes, readThumbBytes, assetSize, isAsset, ASSET_PREFIX, openExhibitStructureDirIfExists, type ExhibitMeta } from "./store.js";
// ADR-0014 (static archival pages): note bodies render through the SAME sanitize pipeline the
// live Viewer uses (P-1 Q3 no-drift invariant) — renderMarkdown is canonical in @render/core now
// (sanitize moved into core; @render/svelte only re-exports for back-compat).
import archieConfig from "../../../archie.config.json";

const CANONICAL_VIEWER = `${archieConfig.canonicalOrigin}${archieConfig.viewerPath}`;
/** Shared static-page options for every publish sink (folder / zip / GH / memory projection). */
const STATIC_PAGE_OPTS = { viewerBase: CANONICAL_VIEWER, renderBody: renderMarkdown } as const;

/** What the binding store hands `writeToFolder` (spike-0002): the incremental scope (absent = full write)
 *  plus the orphan removals, which apply to full writes too. Mirrors the matching `PublishOptions` fields. */
export interface FolderWritePlan {
  incremental?: IncrementalScope;
  removedExhibits?: string[];
  removedObjects?: { slug: string; objId: string; assetName?: string }[];
}

/** The Publish dialog's working-copy export options: a custom `.archie.zip` file name (the OS save
 *  dialog remains the final arbiter) and/or the subset of exhibit slugs to include. Absent field =
 *  the derived/bound name, the whole library. */
export interface ZipExportOpts {
  name?: string;
  slugs?: string[];
}

export interface PublishDeps {
  /** The base to bake into manifest / canvas / annotation ids, resolved AT PUBLISH TIME (2026-07-26).
   *  Was a fixed `BASE` = `WORKING_IRI_BASE` (`https://archie.demo/`), so every published tree carried
   *  ids on a domain nobody owns and ADR-0021's cite ladder resolved to nothing. Now: the library's
   *  live URL if it has ever deployed, else `""` (relative ids) — see deploy/remembered.ts
   *  `publishBaseFor`. A first-ever deploy overrides it explicitly, since `pagesUrlFor` knows the
   *  destination before staging. */
  publishBase: () => string;
  /** Flush the CURRENT exhibit's edits to OPFS (App's save()) so the published tree is current. */
  flushExhibit: () => Promise<void>;
  /** Per-exhibit annotation logs for the publish builders. */
  loadAllLogs: () => Promise<Record<string, AnnotationLog>>;
  /** The publishable Library (authored structure; templates excluded). */
  buildFullLibrary: () => Library;
  /** Torn ANNOTATION-store findings from the LAST publish-path loadAllLogs (Archie-a690): loadAllLogs
   *  detects annotation corruption (warnAnnotationPublishCorruption) as it reads each exhibit, so this
   *  returns what that pass just found. Read immediately after `loadAllLogs()` in `projectSite`, where
   *  it's combined with the structure-side findings into the dialog's pre-publish advisory. Optional —
   *  absent (e.g. the structure-only test harness) simply contributes no annotation advisory; the
   *  console warns fire independently inside loadAllLogs regardless. */
  annotationCorruption?: () => CorruptLogFinding[];
  /** Authored exhibits (for the metadata-only size estimate). */
  exhibits: () => ExhibitMeta[];
  /** Whether the folder sink exists on this browser (steers the size-guard copy). */
  canFolder: () => boolean;
  /** The zip filename for downloads — binding-aware (a file-bound Library keeps its name). */
  currentZipName: () => string;
}

// The .archie.zip / GH upload guard threshold (LARGE-MEDIA-MEMORY-CEILING #1).
const ZIP_WARN_BYTES = 250 * 1024 * 1024; // ~250 MB
// Hard early-abort ceiling for the EAGER in-memory assembly — now only the floor for a browser with
// neither `showSaveFilePicker` nor OPFS `createWritable` (Chromium, Firefox/Safari, and Tauri all
// STREAM via openStreamingZipSave, which needs no ceiling — the tree never accumulates; its only
// bound is the .zip format itself, ZIP_FORMAT_LIMITS). The eager path holds the whole tree in a Map
// AND toZip() builds a 2nd full copy → peak ≈2×; a browser tab OOMs on ArrayBuffer allocation around
// a couple GB. 1 GiB uncompressed (≈2 GiB peak) is the backstop — past it ZipFilesystem throws an
// actionable "publish to a folder / link by URL" error instead of OOMing (SCALE requirement #2).
const EAGER_ZIP_CEILING_BYTES = 1024 * 1024 * 1024; // 1 GiB

export function createPublishFlows(deps: PublishDeps) {
  // ONE open flag (Archie-1921 — PublishDialog + the Publish wizard merged into one scrimmed surface):
  // the old `dialogOpen`/`publishOpen` pair (one per dialog, toggled in lockstep by the chooser's
  // "Publish to the web" card) is gone now that there's only one surface to show or hide.
  const s = $state<{ open: boolean; brokenLinks: BrokenLink[]; incompleteCanvases: IncompleteCanvas[]; corruptLogs: CorruptLogFinding[]; missingAssets: MissingAsset[] }>({
    open: false, // the merged Publish & Share surface
    brokenLinks: [], // intra-Library links that degrade to plain text on publish (dialog advisory)
    incompleteCanvases: [], // Image objects publishing with no width/height (IIIF Pres 3 §5.3; dialog advisory)
    corruptLogs: [], // torn annotation/structure stores publishing under-represented (Archie-a690; dialog advisory)
    missingAssets: [], // imported-asset sources whose bytes the store couldn't produce — published dangling (round-trip loss advisory)
  });
  let cachedSiteFs: MemoryFilesystem | null = null; // the no-originals projection from openPublish, reused by publish

  const getAsset = (slug: string, name: string) => readAssetBlob(slug, name);
  // Structure rev-log lookup for every publish sink (Archie-aef4): read the exhibit's persisted
  // section history off OPFS so the published/exported tree carries {slug}/structure/history/ —
  // the pages the zip/folder import merge (mergeImportedStructure) reads on the other side.
  // Driven by log EXISTENCE, deliberately NOT by the archie.structureRevlog flag (see
  // PublishOptions.getStructure): the dir probe is non-creating, so an exhibit without a log
  // contributes nothing and no structure/ dir ever appears as a publish side effect.
  //
  // Torn-store posture — a KNOWN rule-2 tension, shared with the annotation publish path
  // (loadAllLogs → AnnotationSession.load → `.entries`, which ships the readable subset and warns
  // via publish-warnings.ts#warnAnnotationPublishCorruption, Archie-a690): publish exports what READS.
  // A partially-corrupt store therefore exports its readable pages; an ALL-corrupt store exports
  // NOTHING, and the published artifact is indistinguishable from "never authored" — a receiving
  // import will seed-from-array (the corruption→absence collapse rule #2 exists to prevent).
  // Parity decision (Archie-aef4 review): match the annotation posture rather than invent a
  // structure-only refusal; the distinct warns below make each collapse visible instead of
  // silent. Surfacing/repairing a torn store in the publish UI (for BOTH log families) is future
  // work — the session layer already refuses incremental saves over torn stores (Issue 19), so
  // the source of truth is protected; only the exported copy under-represents it.
  // Factory so `projectSite` can pass a `collect` sink that carries per-exhibit structure findings into
  // the dialog advisory (Archie-a690), while the zip/folder sinks use the plain `getStructure()` — same
  // read + same console warns either way (the warns are NEVER gated on `collect`, so every publish path
  // stays loud). `collect` is called ONLY when there's corruption, mirroring the annotation-side finding.
  const makeGetStructure = (collect?: (f: CorruptLogFinding) => void) => async (exhibitId: string, slug: string): Promise<SectionLog> => {
    const dir = await openExhibitStructureDirIfExists(slug);
    if (!dir) return [];
    const { log, corrupt } = await readStructureReport(dir, asExhibitId(exhibitId));
    const allCorrupt = corrupt.length > 0 && log.length === 0;
    if (allCorrupt) {
      console.warn(`Publish: exhibit "${slug}" section history was NOT exported — all ${corrupt.length} of its history page(s) are unreadable, so the published library will look as if it never had section history. The local store is untouched; repair it before sharing.`, corrupt);
    } else if (corrupt.length > 0) {
      console.warn(`Publish: exhibit "${slug}" has ${corrupt.length} unreadable structure history page(s); publishing the readable history`, corrupt);
    }
    if (corrupt.length > 0) collect?.({ slug, family: "sections", corruptCount: corrupt.length, allCorrupt });
    return log;
  };
  const getStructure = makeGetStructure();
  // Baked grid/overview thumbnails ride along every publish sink (folder / zip / GH / memory) so the
  // published viewer's overview loads small plates, not full masters. Absent → publishLibrary drops the ref.
  const getThumbnail = (slug: string, name: string) => readThumbBytes(slug, name);
  // Publish-time DZI tiling (Q-9, Q-11): slice an oversized imported master into a Deep Zoom pyramid so the
  // published viewer deep-zooms from fast LOCAL tiles instead of streaming the full master (or a slow remote
  // IIIF). Browser-only (OffscreenCanvas) — injected into publishLibrary so render-core stays platform-free.
  // Returns null (→ single image, unchanged) for small images or an undecodable blob.
  const TILE_MIN_EDGE = 4096; // longer edge over this → deep-zoom pays off; smaller stays a single master
  const tileObject = async (_slug: string, name: string, bytes: ArrayBuffer | Blob) => {
    let bmp: ImageBitmap;
    let blob: Blob;
    let mime = "image/jpeg";
    try {
      // MATERIALIZE before decode (Archie-623e): on desktop `bytes` is the lazy Tauri File whose bytes
      // live behind an OVERRIDDEN arrayBuffer() — createImageBitmap (like URL.createObjectURL /
      // createWritable().write) reads the Blob's INTERNAL byte sequence, which is EMPTY on that File, NOT
      // the override. So copy into a real in-memory Blob first (`src.arrayBuffer()` hits the override →
      // real bytes on every backend). A tile candidate is decoded whole here anyway (materialize-once,
      // seam.ts). A read/decode failure degrades to null (untiled) — never a failed publish, since the
      // master already shipped via getAsset (site.ts writes it before calling this).
      const src = bytes instanceof Blob ? bytes : new Blob([bytes]);
      blob = new Blob([await src.arrayBuffer()], src.type ? { type: src.type } : {});
      if (blob.type) mime = blob.type;
      bmp = await createImageBitmap(blob);
    } catch {
      return null; // unreadable, or not a decodable raster (svg/odd mime) — leave it a single source
    }
    // Dimensions were the only reason to decode here, and the pooled slicer decodes its own copies —
    // so release this one (96-192 MB for a tile candidate) BEFORE handing the blob over, rather than
    // holding it alive across the whole slice as the pre-pool version did.
    const { width, height } = bmp;
    bmp.close();
    if (Math.max(width, height) <= TILE_MIN_EDGE) return null;
    // Throws propagate exactly as before (sliceToDziAuto has already tried the inline slicer) — a
    // decode failure degrades to null above, a slice failure is still a failed publish.
    return await sliceToDziAuto(blob, width, height, `${name}_files`, mime);
  };
  // The full-resolution image URL for a remote source: a IIIF service → `{base}/full/max/0/default.jpg`
  // (Image API 3.0); a direct image URL → itself; structured xyz/dzi → null (not a remote raster).
  const iiifFullImageUrl = (source: string): string | null => {
    const ts = resolveTileSource(source);
    if (ts.kind === "iiif") return `${ts.infoUrl.replace(/\/info\.json(\?.*)?$/i, "")}/full/max/0/default.jpg`;
    if (ts.kind === "image") return ts.url;
    return null;
  };
  // Remote-IIIF → local tiles (Q-9): ONE-TIME, one-way copy at publish — fetch the remote full-res image,
  // slice it, and the published tree persists the pyramid locally so the viewer no longer depends on a slow
  // / cross-origin IIIF service. Persisting a remote source's pixels is a rights consideration (the object's
  // requiredStatement/rights ride along in the manifest). Returns null on fetch/decode failure or if small.
  const tileRemote = async (_slug: string, obj: AObject) => {
    const url = iiifFullImageUrl(obj.source);
    if (!url) return null;
    let blob: Blob;
    try {
      const r = await fetch(url, { mode: "cors" });
      if (!r.ok) return null;
      blob = await r.blob();
    } catch {
      return null; // remote down (e.g. archive.org 504) / CORS — leave the object pointing at the remote
    }
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(blob);
    } catch {
      return null;
    }
    // Same release-before-slice as tileObject — remote masters are the UNCAPPED case (no
    // MAX_MASTER_DIM on a IIIF /full/max fetch), so holding the decode across the slice hurts most here.
    const { width, height } = bmp;
    bmp.close();
    if (Math.max(width, height) <= TILE_MIN_EDGE) return null;
    return await sliceToDziAuto(blob, width, height, `${obj.id}_files`, blob.type || "image/jpeg");
  };

  // Metadata-only imported-asset byte estimate (File.size — never reads bytes). `slugs` = only these
  // exhibits count (a partial working-copy export); absent = the whole library.
  async function estimateLibraryBytes(slugs?: string[]): Promise<number> {
    let total = 0;
    for (const ex of deps.exhibits()) {
      if (slugs && !slugs.includes(ex.slug)) continue;
      for (const o of ex.objects) {
        if (isAsset(o.source)) total += await assetSize(ex.slug, o.source.slice(ASSET_PREFIX.length));
      }
    }
    return total;
  }
  /** True = ok to build the in-memory zip. Over the threshold, confirm + steer (folder / link-by-URL). */
  async function zipSizeOk(slugs?: string[]): Promise<boolean> {
    const bytes = await estimateLibraryBytes(slugs);
    if (bytes < ZIP_WARN_BYTES) return true;
    const mb = Math.round(bytes / (1024 * 1024));
    const steer = deps.canFolder()
      ? "On this browser, “Save to disk” → choose a folder writes straight to disk without holding the whole library in memory — better for a library this size."
      : "Tip: link large media by URL (paste a source URL in “+ Media”) so your library links the file instead of copying it in.";
    return window.confirm(`This library is about ${mb} MB, which may be slow to build and download.\n\n${steer}\n\nBuild the zip anyway?`);
  }
  // Size guard for the GH publish path — parity with zipSizeOk (publish uploads file-by-file).
  async function publishSizeOk(): Promise<boolean> {
    const bytes = await estimateLibraryBytes();
    if (bytes < ZIP_WARN_BYTES) return true;
    const mb = Math.round(bytes / (1024 * 1024));
    return window.confirm(`This library is about ${mb} MB, which may make publishing slow or hit GitHub's rate limits.\n\nPublish anyway?`);
  }
  // Project the Library into the static site tree (in a MemoryFilesystem). Same projection the zip
  // uses — different sink. withOriginals (opt-in) re-projects with preserved source files included.
  /** One resolution point for the publish base, so the three sinks cannot disagree. `override` is the
   *  first-deploy case (the URL is known from owner+repo before we stage). */
  const baseFor = (override?: string) => override ?? deps.publishBase();

  async function projectSite(withOriginals: boolean, baseOverride?: string): Promise<{ fs: MemoryFilesystem; brokenLinks: BrokenLink[]; incompleteCanvases: IncompleteCanvas[]; missingAssets: MissingAsset[]; corruptLogs: CorruptLogFinding[] }> {
    // Torn-store advisory (Archie-a690): the annotation findings come back from the loadAllLogs pass
    // (which just warned on them); the structure findings are collected as publishLibrary reads each
    // exhibit's section log via this per-run `collect` sink. Combined, they feed the dialog advisory.
    const structureCorruption: CorruptLogFinding[] = [];
    const logs = await deps.loadAllLogs();
    const annotationCorruption = deps.annotationCorruption?.() ?? [];
    const fs = new MemoryFilesystem();
    const { brokenLinks, incompleteCanvases, missingAssets } = await publishLibrary(fs, deps.buildFullLibrary(), (id: string) => logs[id] ?? [], { baseUrl: baseFor(baseOverride), getAsset, getThumbnail, tileObject, tileRemote, getStructure: makeGetStructure((f) => structureCorruption.push(f)), ...STATIC_PAGE_OPTS, ...(withOriginals ? { getOriginal: (slug: string, name: string) => readOriginalBytes(slug, name) } : {}) });
    if (brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
    if (incompleteCanvases.length > 0) console.warn(`Publish: ${incompleteCanvases.length} image object(s) publishing with no width/height (IIIF Pres 3 §5.3)`, incompleteCanvases);
    if (missingAssets.length > 0) console.warn(`Publish: ${missingAssets.length} imported image(s) have no stored bytes — they publish as broken references`, missingAssets);
    return { fs, brokenLinks, incompleteCanvases, missingAssets, corruptLogs: [...annotationCorruption, ...structureCorruption] };
  }
  // Flatten the projected tree to the path→FileContent map the git-trees push consumes. A no-originals
  // publish reuses the tree openPublish already built; an originals publish re-projects (rare, opt-in).
  async function collectSiteFiles(withOriginals = false) {
    const fs = withOriginals || !cachedSiteFs ? (await projectSite(withOriginals)).fs : cachedSiteFs;
    return collectFiles(await fs.root());
  }
  // The publish opts shared by every zip sink (streaming + eager): the SAME projection (media tiling,
  // baked thumbnails, structure/history sidecars, static pages) the folder/GH sinks use.
  const zipPublishOpts = () => ({ baseUrl: baseFor(), getAsset, getThumbnail, tileObject, tileRemote, getStructure, ...STATIC_PAGE_OPTS });
  // The library a zip export ships: the full build, optionally narrowed to the chosen exhibits (the
  // Publish dialog's working-copy chooser). Filtering AFTER buildFullLibrary keeps the template
  // exclusion and every mapper in one place; a cite into an omitted exhibit degrades to plain text
  // via publishLibrary's link index, surfaced in brokenLinks like any other unresolvable cite.
  function libraryForZip(slugs?: string[]): Library {
    const lib = deps.buildFullLibrary();
    return slugs ? { ...lib, exhibits: lib.exhibits.filter((ex) => slugs.includes(ex.slug)) } : lib;
  }
  // Publish the library into ANY Filesystem sink (a streaming zip target OR an eager ZipFilesystem).
  // ONE projection for the two zip paths (streaming disk save / eager download); returns the advisories.
  async function publishInto(fs: Filesystem, slugs?: string[]): Promise<PublishResult> {
    const logs = await deps.loadAllLogs();
    return publishLibrary(fs, libraryForZip(slugs), (id: string) => logs[id] ?? [], zipPublishOpts());
  }
  // Assemble the whole site into an in-memory ZipFilesystem (the EAGER path — Tauri/non-Chromium).
  // Ceiling-guarded (EAGER_ZIP_CEILING_BYTES) so a library that balloons past what a webview can hold
  // aborts early with an actionable error instead of OOMing (SCALE #2).
  async function buildZipFs(slugs?: string[]): Promise<{ fs: ZipFilesystem } & PublishResult> {
    const fs = new ZipFilesystem({ maxUncompressedBytes: EAGER_ZIP_CEILING_BYTES });
    const result = await publishInto(fs, slugs);
    return { fs, ...result };
  }
  // Save the library as a .archie.zip. All first-class platforms stream the whole tree in bounded
  // memory (SCALE #1 — media never accumulates): Chromium via the save picker, Tauri via the native
  // dialog + plugin-fs, Firefox/Safari via OPFS staging + disk-backed download. Only a browser with
  // none of those falls back to the size-guarded eager build. Returns whether a save happened + the
  // publish advisories.
  // `opts` comes from the dialog's working-copy chooser: a custom file name (the OS dialog remains the
  // final arbiter) and/or a subset of exhibits; absent = the current name, the whole library.
  async function saveProjectZip(opts: ZipExportOpts = {}): Promise<{ saved: boolean; name?: string } & Partial<PublishResult>> {
    const name = opts.name?.trim() || deps.currentZipName();
    if (supportsStreamingZipSave()) {
      const target = await openStreamingZipSave(name); // picker; null = dismissed
      if (!target) return { saved: false };
      try {
        const result = await publishInto(target.fs, opts.slugs); // writes straight to disk, media released as it goes
        await target.finish(); // central directory + close the handle
        return { saved: true, name: target.name, ...result }; // target.name = what the picker actually chose
      } catch (e) {
        await target.abort(); // discard the partial file (never throws)
        if ((e as Error)?.name === "AbortError") return { saved: false }; // handle revoked mid-write
        throw e;
      }
    }
    // Eager fallback (Tauri desktop / non-Chromium): size-guard BEFORE assembly, then build + save.
    if (!(await zipSizeOk(opts.slugs))) return { saved: false };
    const { fs, brokenLinks, incompleteCanvases, missingAssets } = await buildZipFs(opts.slugs);
    const res = await saveZipToDisk(fs, name);
    if (res.kind === "cancelled") return { saved: false, brokenLinks, incompleteCanvases, missingAssets };
    return { saved: true, name: res.name, brokenLinks, incompleteCanvases, missingAssets };
  }
  // ONE folder writer for the two folder sinks (binding autosave/Save + local publish). Takes the
  // Filesystem seam directly (FSA or Tauri), so the caller owns capability selection (folder-backend).
  // `plan` (spike-0002) carries the incremental scope AND the orphan removals — absent = full publish.
  // Removals apply to full writes too (a full republish never prunes), so they're spread in regardless of
  // `incremental`. loadAllLogs stays whole-library even on the incremental path: the intra-Library link
  // index (publishLibrary) validates cross-exhibit archie: cites against EVERY log, so a partial map would
  // wrongly degrade a valid cite in the dirty exhibit to plain text. Reading histories is cheap; re-tiling
  // was the cost we cut.
  async function writeTree(fs: Filesystem, plan: FolderWritePlan = {}) {
    const logs = await deps.loadAllLogs();
    await publishLibrary(fs, deps.buildFullLibrary(), (id: string) => logs[id] ?? [], { baseUrl: baseFor(), getAsset, getThumbnail, tileObject, tileRemote, getStructure, ...STATIC_PAGE_OPTS, ...plan });
  }
  /** Download the library as .archie.zip. False = the user declined/cancelled. Chromium streams to
   *  disk in bounded memory; else the size-guarded eager path. `opts` = the save surfaces' custom
   *  name / exhibit subset (ZipExportFields); absent = bound name, whole library. */
  async function downloadProjectZip(opts?: ZipExportOpts): Promise<boolean> {
    return (await saveProjectZip(opts)).saved;
  }

  return {
    // — reactive chrome state —
    get open(): boolean { return s.open; },
    get brokenLinks(): BrokenLink[] { return s.brokenLinks; },
    get incompleteCanvases(): IncompleteCanvas[] { return s.incompleteCanvases; },
    get corruptLogs(): CorruptLogFinding[] { return s.corruptLogs; },
    get missingAssets(): MissingAsset[] { return s.missingAssets; },
    openMenu() { s.open = true; },
    close() { s.open = false; },

    /**
     * The published tree, in memory, for an in-Studio preview (archie-ux Q-6) — handed straight to
     * `<archie-viewer>`'s `openLibraryFs`, never serialized.
     *
     * Reuses `projectSite(false)` rather than `buildZipFs` for three reasons: it is the SAME
     * projection the GH-Pages deploy pushes (so a preview is evidence about what readers actually
     * get, not a second rendering path), it skips deflate entirely, and it stays clear of the eager
     * zip path's ~2× memory peak (see the LARGE-MEDIA note at the top of this file) and its
     * EAGER_ZIP_CEILING_BYTES abort — neither of which a preview has any reason to pay.
     *
     * Originals are excluded (`withOriginals: false`): a preview reads, it does not archive.
     */
    previewTree: () => projectSite(false),

    /**
     * The SELF-CONTAINED export (archie-linkability Q-3): one .html file holding the viewer and the
     * library, openable by double-click with no server, no hosted Archie, and no network.
     *
     * Unlike `previewTree` this deliberately DOES take the zip path — `.archie.zip` is the portable
     * format the element's `openFile` already reads, and an export is a heavyweight, explicitly-
     * requested action where the eager path's cost is the same one `download` already pays. The size
     * guard runs first for exactly that reason, and it is stricter here: base64 inflates the payload
     * by ~33%, so the same library costs more as an export than as a zip.
     *
     * The bundle is fetched with a DYNAMIC import so ~900KB of viewer source does not land in
     * Studio's startup chunk — Vite splits it into its own chunk, loaded the first time an author
     * exports. `?raw` because the text is data here, not code this app runs.
     *
     * Returns false when the size guard declined; the caller surfaces nothing (the guard already did).
     */
    async exportSelfContained(opts?: ZipExportOpts): Promise<boolean> {
      if (!(await zipSizeOk(opts?.slugs))) return false;
      const [{ buildSingleFileHtml }, bundleMod, { fs }] = await Promise.all([
        import("./single-file-export.js"),
        import("@render/archie-viewer/single?raw"),
        buildZipFs(opts?.slugs),
      ]);
      const html = buildSingleFileHtml({
        bundle: (bundleMod as { default: string }).default,
        libraryBytes: fs.toZip(),
        title: deps.buildFullLibrary().title ?? "",
      });
      downloadHtml(html, (opts?.name ?? deps.currentZipName()).replace(/\.archie\.zip$/, "") || "library");
      return true;
    },

    /** Write the whole published tree into a bound folder's Filesystem (FSA or Tauri — the git /
     *  GH-Pages on-ramp; also the binding store's folder sink). */
    writeToFolder: writeTree,
    downloadProjectZip,
    /** The Publish-dialog zip download (SCALE #1: Chromium streams straight to disk in bounded memory;
     *  surfaces brokenLinks via console). Returns whether a save actually HAPPENED — done-download must
     *  not claim a save the user cancelled. */
    async download(opts?: ZipExportOpts): Promise<boolean> {
      const { saved, brokenLinks, incompleteCanvases, missingAssets } = await saveProjectZip(opts);
      if (brokenLinks && brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
      if (incompleteCanvases && incompleteCanvases.length > 0) console.warn(`Publish: ${incompleteCanvases.length} image object(s) publishing with no width/height (IIIF Pres 3 §5.3)`, incompleteCanvases);
      // The round-trip-loss advisory (2026-07-19): a save that references images it doesn't contain
      // must be VISIBLE — the done-download screen reads this reactively, so set it before returning.
      s.missingAssets = missingAssets ?? [];
      if (s.missingAssets.length > 0) console.warn(`Publish: ${s.missingAssets.length} imported image(s) have no stored bytes — the saved zip references them but does not contain them`, s.missingAssets);
      return saved;
    },
    /** GH publish (includeOriginals opt-in from the dialog; onProgress reports upload/commit/Pages). */
    publish: async (target: GitHubTarget, opts?: { includeOriginals?: boolean }, onProgress?: (p: PublishProgress) => void) =>
      publishToGitHub(await collectSiteFiles(opts?.includeOriginals ?? false), target, onProgress),
    /** The projected static-site tree for the desktop one-motion deploy (Task 13). The SAME projection
     *  (media tiling / baked thumbnails) every other sink uses — deploy-flows flattens it into one git
     *  pack, so it never has to duplicate the browser-only tiling closures. Flushes the current exhibit
     *  first (parity with `localPublishFolder`) so the pushed tree is current; also surfaces the
     *  broken-links / incomplete-canvas advisories the same way `openPublish` does. */
    async projectSiteFs(baseUrl?: string): Promise<Filesystem> {
      await deps.flushExhibit();
      // `baseUrl` is the deploy path's known destination (pagesUrlFor, before staging). Absent for
      // every other caller, which then resolves through `publishBase()`.
      const { fs, brokenLinks, incompleteCanvases, missingAssets, corruptLogs } = await projectSite(false, baseUrl);
      s.brokenLinks = brokenLinks;
      s.incompleteCanvases = incompleteCanvases;
      s.missingAssets = missingAssets;
      s.corruptLogs = corruptLogs;
      return fs;
    },
    /** Entering the GitHub wizard step from the destination chooser (Archie-1921 — one merged surface
     *  now, so this no longer flips its own open flag). Returns false (stay on the chooser) if the
     *  size-guard confirm was declined — the confirm dialog IS the feedback. Returns true as soon as that
     *  guard passes, WITHOUT waiting for the site projection: the caller flips to the wizard screen right
     *  away (no invisible gap staring at the chooser while a large library tiles/projects), and the
     *  projection keeps running in the background, filling in `brokenLinks`/`incompleteCanvases`
     *  reactively once it lands — same timing the old two-dialog code had (PublishDialog closed and the
     *  GitHub dialog opened immediately; only the advisory warnings arrived a moment later). */
    async openPublish(): Promise<boolean> {
      if (!(await publishSizeOk())) return false; // size guard before the network push
      s.brokenLinks = [];
      s.incompleteCanvases = [];
      s.corruptLogs = [];
      s.missingAssets = [];
      cachedSiteFs = null;
      void projectSite(false).then(({ fs, brokenLinks: bl, incompleteCanvases: ic, missingAssets: ma, corruptLogs: cl }) => {
        cachedSiteFs = fs;
        s.brokenLinks = bl;
        s.incompleteCanvases = ic;
        s.missingAssets = ma;
        s.corruptLogs = cl;
      }).catch((e) => {
        // A projection failure here degrades to "no cached tree yet" — collectSiteFiles() re-projects on
        // demand at actual publish time, so this is a lost warm cache, not a lost publish. Log rather
        // than swallow silently (this is now a fire-and-forget promise with no caller to report to).
        console.error("Publish: background site projection failed", e);
      });
      return true;
    },
    /** Local flow: pick a folder + write the published tree; returns the folder name (null = cancelled). */
    async localPublishFolder(): Promise<string | null> {
      await deps.flushExhibit(); // flush current edits so the published tree is current
      const fb = await pickFolderBinding();
      if (!fb) return null;
      await writeTree(fb.fs);
      return fb.name;
    },
    /** Local flow (non-Chromium, no folder picker): save the project zip; returns its filename. */
    async localPublishZip(opts?: ZipExportOpts): Promise<string> {
      await deps.flushExhibit();
      const { name } = await saveProjectZip(opts);
      return name ?? (opts?.name?.trim() || deps.currentZipName());
    },
  };
}
export type PublishFlows = ReturnType<typeof createPublishFlows>;

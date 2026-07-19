// The publish flows (worklist 0.3 cut 2 out of App.svelte). One module for every "Library → the
// world" path: the unified Publish menu's two destinations (local folder / GitHub Pages), the
// project-zip download, the site projection + its cache, the broken-links advisory, and the
// large-library size guards. The App injects its DATA primitives (logs, library, exhibit flush);
// the binding store consumes `writeToFolder`/`downloadProjectZip` from here — "publish = zip
// primitive + per-host adapters" now has one home. A `.svelte.ts` rune module (cf.
// library-meta.svelte.ts): the $state container is never reassigned, getters stay live.
import {
  MemoryFilesystem, ZipFilesystem, publishLibrary, collectFiles, publishToGitHub, renderMarkdown, readStructureReport, asExhibitId,
  type Filesystem, type Library, type AnnotationLog, type BrokenLink, type IncompleteCanvas, type GitHubTarget, type PublishProgress, type IncrementalScope, type SectionLog, type PublishResult,
} from "@render/core";
import { supportsStreamingZipSave, openStreamingZipSave, saveZipToDisk } from "./binding.js";
import { pickFolderBinding } from "./folder-backend.js";
import { sliceToDzi } from "./dzi-slicer.js";
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

export interface PublishDeps {
  baseUrl: string;
  /** Flush the CURRENT exhibit's edits to OPFS (App's save()) so the published tree is current. */
  flushExhibit: () => Promise<void>;
  /** Per-exhibit annotation logs for the publish builders. */
  loadAllLogs: () => Promise<Record<string, AnnotationLog>>;
  /** The publishable Library (authored structure; templates excluded). */
  buildFullLibrary: () => Library;
  /** Authored exhibits (for the metadata-only size estimate). */
  exhibits: () => ExhibitMeta[];
  /** Whether the folder sink exists on this browser (steers the size-guard copy). */
  canFolder: () => boolean;
  /** The zip filename for downloads — binding-aware (a file-bound Library keeps its name). */
  currentZipName: () => string;
}

// The .archie.zip / GH upload guard threshold (LARGE-MEDIA-MEMORY-CEILING #1).
const ZIP_WARN_BYTES = 250 * 1024 * 1024; // ~250 MB
// Hard early-abort ceiling for the EAGER in-memory assembly (Tauri desktop / non-Chromium). That path
// holds the whole tree in a Map AND toZip() builds a 2nd full copy → peak ≈2×; a browser tab OOMs on
// ArrayBuffer allocation around a couple GB. 1 GiB uncompressed (≈2 GiB peak) is the backstop — past
// it ZipFilesystem throws an actionable "publish to a folder / link by URL" error instead of OOMing
// (SCALE requirement #2). It catches media the pre-assembly asset-size estimate can't see (generated
// DZI tiles, remote bakes). The Chromium STREAMING path needs no ceiling — it never accumulates the tree.
const EAGER_ZIP_CEILING_BYTES = 1024 * 1024 * 1024; // 1 GiB

export function createPublishFlows(deps: PublishDeps) {
  // ONE open flag (Archie-1921 — PublishDialog + the Publish wizard merged into one scrimmed surface):
  // the old `dialogOpen`/`publishOpen` pair (one per dialog, toggled in lockstep by the chooser's
  // "Publish to the web" card) is gone now that there's only one surface to show or hide.
  const s = $state<{ open: boolean; brokenLinks: BrokenLink[]; incompleteCanvases: IncompleteCanvas[] }>({
    open: false, // the merged Publish & Share surface
    brokenLinks: [], // intra-Library links that degrade to plain text on publish (dialog advisory)
    incompleteCanvases: [], // Image objects publishing with no width/height (IIIF Pres 3 §5.3; dialog advisory)
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
  const getStructure = async (exhibitId: string, slug: string): Promise<SectionLog> => {
    const dir = await openExhibitStructureDirIfExists(slug);
    if (!dir) return [];
    const { log, corrupt } = await readStructureReport(dir, asExhibitId(exhibitId));
    if (corrupt.length > 0 && log.length === 0) {
      console.warn(`Publish: exhibit "${slug}" section history was NOT exported — all ${corrupt.length} of its history page(s) are unreadable, so the published library will look as if it never had section history. The local store is untouched; repair it before sharing.`, corrupt);
    } else if (corrupt.length > 0) {
      console.warn(`Publish: exhibit "${slug}" has ${corrupt.length} unreadable structure history page(s); publishing the readable history`, corrupt);
    }
    return log;
  };
  // Baked grid/overview thumbnails ride along every publish sink (folder / zip / GH / memory) so the
  // published viewer's overview loads small plates, not full masters. Absent → publishLibrary drops the ref.
  const getThumbnail = (slug: string, name: string) => readThumbBytes(slug, name);
  // Publish-time DZI tiling (Q-9, Q-11): slice an oversized imported master into a Deep Zoom pyramid so the
  // published viewer deep-zooms from fast LOCAL tiles instead of streaming the full master (or a slow remote
  // IIIF). Browser-only (OffscreenCanvas) — injected into publishLibrary so render-core stays platform-free.
  // Returns null (→ single image, unchanged) for small images or an undecodable blob.
  const TILE_MIN_EDGE = 4096; // longer edge over this → deep-zoom pays off; smaller stays a single master
  const tileObject = async (_slug: string, name: string, bytes: ArrayBuffer | Blob) => {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes]);
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(blob);
    } catch {
      return null; // not a decodable raster (e.g. an svg/odd mime) — leave it a single source
    }
    try {
      if (Math.max(bmp.width, bmp.height) <= TILE_MIN_EDGE) return null;
      return await sliceToDzi(bmp, `${name}_files`, blob.type || "image/jpeg");
    } finally {
      bmp.close();
    }
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
    try {
      if (Math.max(bmp.width, bmp.height) <= TILE_MIN_EDGE) return null;
      return await sliceToDzi(bmp, `${obj.id}_files`, blob.type || "image/jpeg");
    } finally {
      bmp.close();
    }
  };

  // Metadata-only imported-asset byte estimate (File.size — never reads bytes).
  async function estimateLibraryBytes(): Promise<number> {
    let total = 0;
    for (const ex of deps.exhibits()) {
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
  async function projectSite(withOriginals: boolean): Promise<{ fs: MemoryFilesystem; brokenLinks: BrokenLink[]; incompleteCanvases: IncompleteCanvas[] }> {
    const logs = await deps.loadAllLogs();
    const fs = new MemoryFilesystem();
    const { brokenLinks, incompleteCanvases } = await publishLibrary(fs, deps.buildFullLibrary(), (id: string) => logs[id] ?? [], { baseUrl: deps.baseUrl, getAsset, getThumbnail, tileObject, tileRemote, getStructure, ...STATIC_PAGE_OPTS, ...(withOriginals ? { getOriginal: (slug: string, name: string) => readOriginalBytes(slug, name) } : {}) });
    if (brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
    if (incompleteCanvases.length > 0) console.warn(`Publish: ${incompleteCanvases.length} image object(s) publishing with no width/height (IIIF Pres 3 §5.3)`, incompleteCanvases);
    return { fs, brokenLinks, incompleteCanvases };
  }
  // Flatten the projected tree to the path→FileContent map the git-trees push consumes. A no-originals
  // publish reuses the tree openPublish already built; an originals publish re-projects (rare, opt-in).
  async function collectSiteFiles(withOriginals = false) {
    const fs = withOriginals || !cachedSiteFs ? (await projectSite(withOriginals)).fs : cachedSiteFs;
    return collectFiles(await fs.root());
  }
  // The publish opts shared by every zip sink (streaming + eager): the SAME projection (media tiling,
  // baked thumbnails, structure/history sidecars, static pages) the folder/GH sinks use.
  const zipPublishOpts = () => ({ baseUrl: deps.baseUrl, getAsset, getThumbnail, tileObject, tileRemote, getStructure, ...STATIC_PAGE_OPTS });
  // Publish the full library into ANY Filesystem sink (a streaming zip target OR an eager ZipFilesystem).
  // ONE projection for the two zip paths (streaming disk save / eager download); returns the advisories.
  async function publishInto(fs: Filesystem): Promise<PublishResult> {
    const logs = await deps.loadAllLogs();
    return publishLibrary(fs, deps.buildFullLibrary(), (id: string) => logs[id] ?? [], zipPublishOpts());
  }
  // Assemble the whole site into an in-memory ZipFilesystem (the EAGER path — Tauri/non-Chromium).
  // Ceiling-guarded (EAGER_ZIP_CEILING_BYTES) so a library that balloons past what a webview can hold
  // aborts early with an actionable error instead of OOMing (SCALE #2).
  async function buildZipFs(): Promise<{ fs: ZipFilesystem } & PublishResult> {
    const fs = new ZipFilesystem({ maxUncompressedBytes: EAGER_ZIP_CEILING_BYTES });
    const result = await publishInto(fs);
    return { fs, ...result };
  }
  // Save the library as a .archie.zip. Chromium streams the whole tree straight to disk in bounded
  // memory (SCALE #1 — media never accumulates); elsewhere (Tauri / non-Chromium) fall back to the
  // size-guarded eager build. Returns whether a save happened + the publish advisories.
  async function saveProjectZip(): Promise<{ saved: boolean } & Partial<PublishResult>> {
    const name = deps.currentZipName();
    if (supportsStreamingZipSave()) {
      const target = await openStreamingZipSave(name); // picker; null = dismissed
      if (!target) return { saved: false };
      try {
        const result = await publishInto(target.fs); // writes straight to disk, media released as it goes
        await target.finish(); // central directory + close the handle
        return { saved: true, ...result };
      } catch (e) {
        await target.abort(); // discard the partial file (never throws)
        if ((e as Error)?.name === "AbortError") return { saved: false }; // handle revoked mid-write
        throw e;
      }
    }
    // Eager fallback (Tauri desktop / non-Chromium): size-guard BEFORE assembly, then build + save.
    if (!(await zipSizeOk())) return { saved: false };
    const { fs, brokenLinks, incompleteCanvases } = await buildZipFs();
    const res = await saveZipToDisk(fs, name);
    return { saved: res.kind !== "cancelled", brokenLinks, incompleteCanvases };
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
    await publishLibrary(fs, deps.buildFullLibrary(), (id: string) => logs[id] ?? [], { baseUrl: deps.baseUrl, getAsset, getThumbnail, tileObject, tileRemote, getStructure, ...STATIC_PAGE_OPTS, ...plan });
  }
  /** Download the library as .archie.zip. False = the user declined/cancelled. Chromium streams to
   *  disk in bounded memory; else the size-guarded eager path. */
  async function downloadProjectZip(): Promise<boolean> {
    return (await saveProjectZip()).saved;
  }

  return {
    // — reactive chrome state —
    get open(): boolean { return s.open; },
    get brokenLinks(): BrokenLink[] { return s.brokenLinks; },
    get incompleteCanvases(): IncompleteCanvas[] { return s.incompleteCanvases; },
    openMenu() { s.open = true; },
    close() { s.open = false; },

    /** Write the whole published tree into a bound folder's Filesystem (FSA or Tauri — the git /
     *  GH-Pages on-ramp; also the binding store's folder sink). */
    writeToFolder: writeTree,
    downloadProjectZip,
    /** The Publish-dialog zip download (SCALE #1: Chromium streams straight to disk in bounded memory;
     *  surfaces brokenLinks via console). Returns whether a save actually HAPPENED — done-download must
     *  not claim a save the user cancelled. */
    async download(): Promise<boolean> {
      const { saved, brokenLinks, incompleteCanvases } = await saveProjectZip();
      if (brokenLinks && brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
      if (incompleteCanvases && incompleteCanvases.length > 0) console.warn(`Publish: ${incompleteCanvases.length} image object(s) publishing with no width/height (IIIF Pres 3 §5.3)`, incompleteCanvases);
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
    async projectSiteFs(): Promise<Filesystem> {
      await deps.flushExhibit();
      const { fs, brokenLinks, incompleteCanvases } = await projectSite(false);
      s.brokenLinks = brokenLinks;
      s.incompleteCanvases = incompleteCanvases;
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
      cachedSiteFs = null;
      void projectSite(false).then(({ fs, brokenLinks: bl, incompleteCanvases: ic }) => {
        cachedSiteFs = fs;
        s.brokenLinks = bl;
        s.incompleteCanvases = ic;
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
    async localPublishZip(): Promise<string> {
      await deps.flushExhibit();
      await downloadProjectZip();
      return deps.currentZipName();
    },
  };
}
export type PublishFlows = ReturnType<typeof createPublishFlows>;

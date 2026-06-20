// The publish flows (worklist 0.3 cut 2 out of App.svelte). One module for every "Library → the
// world" path: the unified Publish menu's two destinations (local folder / GitHub Pages), the
// project-zip download, the site projection + its cache, the broken-links advisory, and the
// large-library size guards. The App injects its DATA primitives (logs, library, exhibit flush);
// the binding store consumes `writeToFolder`/`downloadProjectZip` from here — "publish = zip
// primitive + per-host adapters" now has one home. A `.svelte.ts` rune module (cf.
// library-meta.svelte.ts): the $state container is never reassigned, getters stay live.
import {
  MemoryFilesystem, FsaFilesystem, publishLibrary, libraryToZipFs, collectFiles, publishToGitHub, renderMarkdown,
  type Library, type AnnotationLog, type BrokenLink, type GitHubTarget, type PublishProgress, type LogicalId,
} from "@render/core";
import { supportsFileStreamSave, pickFolder, saveZipToDisk } from "./binding.js";
import { readAssetBlob, readOriginalBytes, readThumbBytes, assetSize, isAsset, ASSET_PREFIX, type ExhibitMeta } from "./store.js";
// ADR-0014 (static archival pages): note bodies render through the SAME sanitize pipeline the
// live Viewer uses (P-1 Q3 no-drift invariant) — renderMarkdown is canonical in @render/core now
// (sanitize moved into core; @render/svelte only re-exports for back-compat).
import archieConfig from "../../../archie.config.json";

const CANONICAL_VIEWER = `${archieConfig.canonicalOrigin}${archieConfig.viewerPath}`;
/** Shared static-page options for every publish sink (folder / zip / GH / memory projection). */
const STATIC_PAGE_OPTS = { viewerBase: CANONICAL_VIEWER, renderBody: renderMarkdown } as const;

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

export function createPublishFlows(deps: PublishDeps) {
  const s = $state<{ publishOpen: boolean; dialogOpen: boolean; brokenLinks: BrokenLink[] }>({
    publishOpen: false, // the GitHub publish dialog
    dialogOpen: false, // the unified Publish & Share menu
    brokenLinks: [], // intra-Library links that degrade to plain text on publish (dialog advisory)
  });
  let cachedSiteFs: MemoryFilesystem | null = null; // the no-originals projection from openPublish, reused by publish

  const getAsset = (slug: string, name: string) => readAssetBlob(slug, name);
  // Baked grid/overview thumbnails ride along every publish sink (folder / zip / GH / memory) so the
  // published viewer's overview loads small plates, not full masters. Absent → publishLibrary drops the ref.
  const getThumbnail = (slug: string, name: string) => readThumbBytes(slug, name);

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
  async function projectSite(withOriginals: boolean): Promise<{ fs: MemoryFilesystem; brokenLinks: BrokenLink[] }> {
    const logs = await deps.loadAllLogs();
    const fs = new MemoryFilesystem();
    const { brokenLinks } = await publishLibrary(fs, deps.buildFullLibrary(), (id: LogicalId) => logs[id] ?? [], { baseUrl: deps.baseUrl, getAsset, getThumbnail, ...STATIC_PAGE_OPTS, ...(withOriginals ? { getOriginal: (slug: string, name: string) => readOriginalBytes(slug, name) } : {}) });
    if (brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
    return { fs, brokenLinks };
  }
  // Flatten the projected tree to the path→FileContent map the git-trees push consumes. A no-originals
  // publish reuses the tree openPublish already built; an originals publish re-projects (rare, opt-in).
  async function collectSiteFiles(withOriginals = false) {
    const fs = withOriginals || !cachedSiteFs ? (await projectSite(withOriginals)).fs : cachedSiteFs;
    return collectFiles(await fs.root());
  }
  // ONE zip builder for the three zip paths (project Save / dialog download / local publish).
  async function buildZipFs() {
    const logs = await deps.loadAllLogs();
    return libraryToZipFs(deps.buildFullLibrary(), (id: LogicalId) => logs[id] ?? [], { baseUrl: deps.baseUrl, getAsset, getThumbnail, ...STATIC_PAGE_OPTS });
  }
  // ONE folder writer for the two folder sinks (binding autosave/Save + local publish).
  async function writeTree(handle: FileSystemDirectoryHandle) {
    const logs = await deps.loadAllLogs();
    await publishLibrary(new FsaFilesystem(handle), deps.buildFullLibrary(), (id: LogicalId) => logs[id] ?? [], { baseUrl: deps.baseUrl, getAsset, getThumbnail, ...STATIC_PAGE_OPTS });
  }
  /** Download the library as .archie.zip (size-guarded). False = the user declined/cancelled. */
  async function downloadProjectZip(): Promise<boolean> {
    if (!supportsFileStreamSave() && !(await zipSizeOk())) return false; // size guard (#1), eager path only
    const { fs } = await buildZipFs();
    const r = await saveZipToDisk(fs, deps.currentZipName()); // Chromium streams to disk (A.1); else eager download
    return r.kind !== "cancelled"; // dismissed the picker → stay unsaved
  }

  return {
    // — reactive chrome state —
    get publishOpen(): boolean { return s.publishOpen; },
    get dialogOpen(): boolean { return s.dialogOpen; },
    get brokenLinks(): BrokenLink[] { return s.brokenLinks; },
    openDialog() { s.dialogOpen = true; },
    closeDialog() { s.dialogOpen = false; },
    closePublish() { s.publishOpen = false; },

    /** Write the whole published tree into a folder handle (the git / GH-Pages on-ramp; also the
     *  binding store's folder sink). */
    writeToFolder: writeTree,
    downloadProjectZip,
    /** The Publish-dialog zip download (A.1 streaming; surfaces brokenLinks via console). Returns
     *  whether a save actually HAPPENED — done-download must not claim a save the user cancelled. */
    async download(): Promise<boolean> {
      if (!supportsFileStreamSave() && !(await zipSizeOk())) return false; // large-library guard, eager path only
      const { fs, brokenLinks } = await buildZipFs();
      if (brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
      try {
        await saveZipToDisk(fs, deps.currentZipName());
        return true;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return false; // picker cancelled — not an error
        throw e;
      }
    },
    /** GH publish (includeOriginals opt-in from the dialog; onProgress reports upload/commit/Pages). */
    publish: async (target: GitHubTarget, opts?: { includeOriginals?: boolean }, onProgress?: (p: PublishProgress) => void) =>
      publishToGitHub(await collectSiteFiles(opts?.includeOriginals ?? false), target, onProgress),
    /** Open the GitHub dialog immediately (no invisible gap), then project ONCE: caches the tree and
     *  surfaces broken intra-Library links so the author sees them before publishing. */
    async openPublish() {
      if (!(await publishSizeOk())) return; // size guard before the network push (its confirm IS the feedback)
      s.brokenLinks = [];
      cachedSiteFs = null;
      s.publishOpen = true;
      const { fs, brokenLinks: bl } = await projectSite(false);
      cachedSiteFs = fs;
      s.brokenLinks = bl;
    },
    /** Local flow: pick a folder + write the published tree; returns the folder name (null = cancelled). */
    async localPublishFolder(): Promise<string | null> {
      await deps.flushExhibit(); // flush current edits so the published tree is current
      const handle = await pickFolder();
      if (!handle) return null;
      await writeTree(handle);
      return handle.name;
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

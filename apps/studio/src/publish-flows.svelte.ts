// The publish flows (worklist 0.3 cut 2 out of App.svelte). One module for every "Library → the
// world" path: the unified Publish menu's two destinations (local folder / GitHub Pages), the
// project-zip download, the site projection + its cache, the broken-links advisory, and the
// large-library size guards. The App injects its DATA primitives (logs, library, exhibit flush);
// the binding store consumes `writeToFolder`/`downloadProjectZip` from here — "publish = zip
// primitive + per-host adapters" now has one home. A `.svelte.ts` rune module (cf.
// library-meta.svelte.ts): the $state container is never reassigned, getters stay live.
import {
  MemoryFilesystem, ZipFilesystem, publishLibrary, collectFiles, publishToGitHub, pagesUrlFor, renderMarkdown, readStructureReport, asExhibitId,
  preflightTree, rightsCoverageFinding, blocksPublish, writeBag, type PreflightFinding,
  type Filesystem, type Library, type AnnotationLog, type BrokenLink, type IncompleteCanvas, type MissingAsset, type GitHubTarget, type PublishProgress, type IncrementalScope, type SectionLog, type PublishResult,
  type SelectorScale, type UnscaledSelector, type ViewerBundleFiles,
} from "@render/core";
import { probeArchive, type ArchiveProbe } from "./archive-probe.js";
import { libraryInventory } from "./archive-inventory.js";
import { folderSinkSupported } from "./folder-backend.js";
import { supportsStreamingZipSave, openStreamingZipSave, saveZipToDisk, saveBagZip, downloadHtml } from "./binding.js";
import type { CorruptLogFinding } from "./publish-warnings.js";
import { pickFolderBinding } from "./folder-backend.js";
import { sliceToDziAuto } from "./dzi-slice-pool.js";
import { resolveTileSource, type AObject } from "@render/core";
import { readAssetBlob, readOriginalBytes, readThumbBytes, assetSize, isAsset, ASSET_PREFIX, openExhibitStructureDirIfExists, type ExhibitMeta } from "./store.js";
import { bakeDisplayMasterAsync } from "./bake-async.js";
import {
  DEFAULT_TIER, applyTier, assetMime, capsFor, projectLibraryForTier, resetTierFallbacks, selectorScaleOf, tierDecision, tierFallbackCount,
  type QualityTier, type TierEncoders, type TierRescale,
} from "./publish-tier.js";
// The browser video path (Archie-7e6f H3). Cheap to import: `mediabunny` itself sits behind an
// `await import` inside both of these, so a library with no video never downloads the muxer.
import { pickBrowserTarget, probeBrowserVideoCaps, transcodeVideoInBrowser } from "./video-transcode-web.js";
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
  /** Ship the embed under `_viewer/` so the written tree carries its own reader (Archie-e09d).
   *
   *  TRUE for the folder DESTINATION (a site someone visits), FALSE for the binding store's folder
   *  autosave — which uses the same writer but is the author's working copy, and paying +959 KB on
   *  every autosave for a reader nobody opens there would be a real regression for no benefit.
   *  Deliberately NOT a `PublishOptions` field pass-through: it is stripped before the spread. */
  withViewer?: boolean;
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
  /** The QUALITY TIER this publish projects at (Archie-4b0a). Absent = `DEFAULT_TIER`, i.e.
   *  "archival" — the bytes as ingested, which is exactly today's behaviour, so wiring the tier
   *  engine in changes nothing until a caller asks otherwise. Archie-c367's publish surface is what
   *  will supply the author's choice; the engine deliberately ships no opinion about pre-checking. */
  tier?: () => QualityTier;
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

// The single-file export's HARD cap — a refusal, not a confirm, and the only guard in this file shaped
// that way. Every other size guard here warns and lets the author proceed, which is right when the
// browser's own download/progress UI carries the wait. The single-file export has no such cover:
// the cost is the browser TOKENIZING one enormous HTML document, which happens BEFORE any script in
// it runs, so nothing we ship can draw a spinner. The user sees a blank window and nothing else.
//
// Measured in Chromium from file:// with the real bundle (payload → .html size → time to open):
//     1 MB →   2.2 MB → 0.05 s        50 MB →  68 MB → 0.9 s
//    10 MB →  14.2 MB → 0.15 s       150 MB → 201 MB → 6.3 s
//                                    300 MB → 401 MB → 22.1 s
// It never crashed — atob is cheap and linear (636 ms at 300 MB). Document parse is the cost and it
// is superlinear. So the ceiling is patience, not capacity, which is exactly why proceed-anyway is
// the wrong shape: a 22-second blank window reads as a broken file, not a slow one.
/** Exported so the export MENU can grey the single-file row before the author enters a flow that
 *  cannot finish (Q-15). One definition — a UI copy of this literal is exactly the drift that makes
 *  a greyed row disagree with the guard behind it. */
export const SINGLE_FILE_MAX_BYTES = 50 * 1024 * 1024; // ~50 MB in, ~68 MB out, under a second to open

/** Which half of the publish surface the author asked for (Q-15): a SITE (a place that stays
 *  updated) or a FILE (an artifact you carry away). One entry point, two verbs. */
export type PublishIntent = "publish" | "export";

/** What the single-file export reports back. `too-large` carries the size so the UI can say the number. */
export type SelfContainedResult = { ok: true } | { ok: false; reason: "too-large"; mb: number };

export function createPublishFlows(deps: PublishDeps) {
  // ONE open flag (Archie-1921 — PublishDialog + the Publish wizard merged into one scrimmed surface):
  // the old `dialogOpen`/`publishOpen` pair (one per dialog, toggled in lockstep by the chooser's
  // "Publish to the web" card) is gone now that there's only one surface to show or hide.
  const s = $state<{ open: boolean; intent: PublishIntent; brokenLinks: BrokenLink[]; incompleteCanvases: IncompleteCanvas[]; corruptLogs: CorruptLogFinding[]; missingAssets: MissingAsset[]; preflight: PreflightFinding[]; tierRescaled: TierRescale[]; unscaledSelectors: UnscaledSelector[]; tierFallbacks: number; tier: QualityTier | null; probe: ArchiveProbe | null; probing: boolean }>({
    open: false, // the merged Publish & Share surface
    intent: "publish" as PublishIntent, // which half of the surface the author asked for (Q-15)
    brokenLinks: [], // intra-Library links that degrade to plain text on publish (dialog advisory)
    incompleteCanvases: [], // Image objects publishing with no width/height (IIIF Pres 3 §5.3; dialog advisory)
    corruptLogs: [], // torn annotation/structure stores publishing under-represented (Archie-a690; dialog advisory)
    missingAssets: [], // imported-asset sources whose bytes the store couldn't produce — published dangling (round-trip loss advisory)
    // Pre-push preflight over the BUILT tree + rights coverage (Archie-0cd6 / Archie-8772). The
    // severity model lives in render-core's preflight.ts; this just carries the findings to the
    // dialog, which renders them into the advisory surface it already has.
    preflight: [],
    // Web-tier reporting (Archie-4b0a). `tierRescaled` is INFORMATIONAL as of the selector-rescale fix:
    // every object whose published pixel space differs from the authored one — worth telling an author
    // (their 6000 px plate ships at 2400 px), no longer a correctness warning, because the same report
    // is what feeds `publishLibrary`'s `scaleSelectors` and moves the notes with the image.
    // `unscaledSelectors` is the residue that IS a correctness finding: a selector the scaler could not
    // move exactly (an imported `<path>`, an SVG with a transform), shipped in the authored pixel space.
    // `tierFallbacks` is the count of assets that shipped archival bytes inside a web publish — a tier
    // that quietly did less than it promised. All three are zero for an archival publish, the default.
    tierRescaled: [],
    unscaledSelectors: [],
    tierFallbacks: 0,
    // The author's quality choice on the publish surface (Archie-c367). `null` = they have not chosen,
    // so `tierFor` falls through to the host dep / DEFAULT_TIER. Set by `setTier` when the surface's
    // control moves, INCLUDING when it is pre-set from the probe's recommendation — a pre-selected
    // control that the engine cannot see would publish at a tier the surface never showed.
    tier: null,
    // The last archive probe (Archie-7280), and whether one is running. The surface reads both; a
    // second `probe()` while one is in flight is refused rather than queued (see `probe`).
    probe: null,
    probing: false,
  });
  let cachedSiteFs: MemoryFilesystem | null = null; // the no-originals projection from openPublish, reused by publish
  // The base `cachedSiteFs` was projected AT (Archie-19c5 / Archie-3504). The cache is only sound for
  // a publish going to that same base — `openPublish` runs before the author has typed a repo name, so
  // its tree is projected at whatever `publishBase()` knew then (relative, for a first-ever publish).
  // Reusing it for a push to a NOW-KNOWN destination is what shipped every id on the wrong origin.
  let cachedSiteBase: string | null = null;
  // The TIER the cached tree was projected at (Archie-4b0a). A web-tier tree carries different bytes
  // under different file names from an archival one, so reusing one for the other would ship 2400px
  // WebP under an "archival" publish (or the reverse) with nothing saying so. Same shape, and same
  // reason, as `cachedSiteBase` above: the cache is only sound for the inputs it was built from.
  let cachedSiteTier: QualityTier | null = null;

  // The imported-asset byte reads (`readAssetBlob`) and the baked grid/overview thumbnails
  // (`readThumbBytes`) are BOTH wired through `tierRun` below rather than passed straight to
  // `publishLibrary`: the tier decides what bytes those two callbacks return and under what published
  // name. At the archival tier they are exactly the pass-through they always were.
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
  /** Walk the built tree for pre-push findings and fold in the rights-coverage report. One place, so
   *  every destination that projects a site gets the same gate. */
  async function runPreflight(fs: Filesystem): Promise<PreflightFinding[]> {
    const findings = await preflightTree(await fs.root());
    const rights = rightsCoverageFinding(deps.buildFullLibrary());
    return rights ? [...findings, rights] : findings;
  }

  /** One resolution point for the publish base, so the three sinks cannot disagree. `override` is the
   *  first-deploy case (the URL is known from owner+repo before we stage). */
  const baseFor = (override?: string) => override ?? deps.publishBase();

  /**
   * THE SELF-CONTAINED TREE (Archie-e09d), default ON for the destinations that produce a SITE.
   *
   * `getViewerBundle` makes `publishLibrary` write the embed under `{root}/_viewer/` plus a
   * `viewer.html` and a `.nojekyll` beside it, so the published tree opens in a browser with no
   * hosted Archie anywhere in the picture.
   *
   * THE BUNDLE IS THE IIFE SINGLE-FILE BUILD — the SAME `@render/archie-viewer/single?raw` module
   * `exportSelfContained` already ships, not a second ESM copy. The spike this replaces
   * (`spike/self-contained-studio-wiring`) pulled in the multi-file `dist/` build via a virtual
   * module and measured **+304.9 KB gz on Studio's own dist**, because Studio then carried the same
   * viewer twice. Sharing one copy makes Studio's cost for this feature zero. The trade: the tree's
   * `viewer.html` eager-loads the whole viewer (~950 KB raw, 278 KB gz measured) instead of the ESM
   * build's ~39 KB gz lazy arrival — acceptable for a self-contained tree, and an IIFE has no
   * sibling chunks to 404. `viewer.html` loads the entry via `<script type="module">`; an IIFE is
   * valid module code, so the same file serves both this tree and the file:// single-file export.
   *
   * WHICH SINKS. The folder and GitHub sinks get it — they produce a site someone visits. The `.zip`
   * deliberately does NOT: an `.archie.zip` is opened BY a viewer (Studio, or the embed via `?src=`),
   * so carrying one inside it is a megabyte of redundancy. That split is e09d's own recommendation.
   * The deposit bag inherits the zip's opts and so is likewise lean, which is right — a bag is
   * payload for a repository, not a browsable site.
   *
   * LAZY, and it must stay lazy: the bundle is ~950 KB of text, and a static import would put every
   * byte of it in Studio's startup chunk. Same shape and the same reason as
   * `import("@render/archie-viewer/single?raw")` in `exportSelfContained` — it IS that import, so
   * both features resolve to one chunk in Studio's dist.
   *
   * Returning `null` on failure is the degradation `site.ts` documents: the tree then links to the
   * hosted `viewerBase` exactly as if the callback had never been supplied, rather than shipping a
   * `viewer.html` whose `_viewer/` is empty.
   */
  async function loadViewerBundle(): Promise<ViewerBundleFiles | null> {
    try {
      const mod = (await import("@render/archie-viewer/single?raw")) as { default: string };
      const text = mod.default;
      // `ViewerBundleFiles` is a Map keyed by the FLAT name the file takes under `_viewer/` — the
      // entry name is the one `viewer.html` loads by contract (`site.ts` rejects anything else).
      return text ? new Map([["archie-viewer.js", text]]) : null;
    } catch (e) {
      console.warn("Publish: the embedded viewer bundle could not be loaded — the published tree will link to the hosted viewer instead", e);
      return null;
    }
  }
  /** The `getViewerBundle` option for a SITE sink. Spread, so a null bundle is an absent key rather
   *  than a present callback that returns nothing. */
  const viewerBundleOpt = { getViewerBundle: loadViewerBundle } as const;
  /** The same, for the quality tier — one resolution point so no sink can publish at a tier the
   *  cache key was not computed from.
   *
   *  THREE sources, narrowest first: an explicit per-call override; the author's choice on the publish
   *  surface (`setTier`, Archie-c367 — the tier control the engine deliberately shipped no opinion
   *  about); the host's dep. Absent all three = `DEFAULT_TIER` ("archival"), i.e. today's behaviour.
   *  No cache invalidation is needed on a change: `collectSiteFiles` already compares `cachedSiteTier`
   *  against this, so a tier switch re-projects by construction (Archie-4b0a). */
  const tierFor = (override?: QualityTier) => override ?? s.tier ?? deps.tier?.() ?? DEFAULT_TIER;

  /** The browser-side WebP re-encode the web tier needs, reusing the ingest bake's worker pool rather
   *  than opening a second one — `bakeDisplayMasterAsync` already owns a process-wide pool with a
   *  DOM-canvas fallback and its own `bakeFallbackCount()`, which is the pattern
   *  `.claude/rules/perf-measure-the-flow.md` says a third worker path must NOT duplicate. */
  const tierEncoders: TierEncoders = {
    encodeImage: async (src, maxDim, quality) => (await bakeDisplayMasterAsync(src, { maxDim, mime: "image/webp", quality })).blob,
    // No `encodeAudio`: WebCodecs AudioEncoder is widely available now but emits raw Opus packets with
    // no container, and this repo ships no Ogg/WebM muxer. See publish-tier.ts `audioEncodeAvailable`
    // for the matrix and what closing it needs. Until then audio takes the counted passthrough.
  };

  /**
   * The video encoder for this platform, resolved ONCE and only when a web-tier publish asks.
   *
   * Memoised on the PROMISE rather than on its value, so two projections started together share one
   * probe instead of racing two. Capability cannot change within a session, so there is no staleness
   * to invalidate — and the probe is not free: `probeBrowserVideoCaps` constructs real encoders to
   * ask, which is the whole reason it is not re-asked per file.
   *
   * WHY THE BROWSER PATH ONLY, stated plainly rather than left as an apparent oversight. The desktop
   * sidecar (`transcodeVideo`) is genuinely better — its ffmpeg reaches H.264 that Chromium's encoder
   * pool cannot pair with AAC — but it takes ABSOLUTE FILE PATHS in and out, while `applyTier` holds
   * a `Blob` and expects a `Blob` back. Bridging them needs a temp-file seam (write blob → invoke →
   * read back → clean up) plus a Tauri fs capability grant for that directory, and neither exists
   * today. Writing one here would be code no gate in this repo can execute: there is no packaged
   * desktop run available, and `.claude/rules/svelte-no-typecheck-net.md` is explicit that compiling
   * is not carrying. So the desktop wiring is a NAMED follow-up on Archie-7e6f, not a silent gap —
   * and until it lands a desktop web-tier publish takes the counted `no-video-encoder` passthrough,
   * which is visible in `tierFallbacksByReason()` and `videoSkipCount()` rather than invisible.
   */
  let videoEncoderOnce: Promise<Pick<TierEncoders, "encodeVideo" | "videoTarget">> | null = null;
  function resolveVideoEncoder() {
    videoEncoderOnce ??= (async () => {
      const target = pickBrowserTarget(await probeBrowserVideoCaps());
      // No reachable profile ⇒ BOTH members stay absent. `capsFor` treats a half-configured pair as
      // no capability at all, but leaving neither is what makes that guard unreachable rather than
      // merely correct.
      if (!target) return {};
      return { videoTarget: target, encodeVideo: (src: Blob) => transcodeVideoInBrowser(src, { target }) };
    })();
    return videoEncoderOnce;
  }

  /**
   * Everything one projection needs in order to publish at `tier`: the rewritten library, the two
   * tier-aware byte callbacks, and the rescale report.
   *
   * The seam is deliberately HERE and not in render-core. `publish/site.ts` derives an asset's
   * published file name from the model's own `source` (`:514`) and writes the bytes `getAsset`
   * returns under that name (`:523`, `:527`), so handing it a library that already says `folio.webp`
   * plus a `getAsset` that maps the published name back to the stored one is enough to re-tier a
   * whole publish without touching the writer. `getOriginal` is intentionally NOT tiered — it reads
   * `o.originalName` and `assets-original/` is the archival copy by definition.
   *
   * Fallback counters are zeroed per projection so a reported count belongs to THIS publish. That
   * assumes projections do not overlap, which holds: the Publish surface is a modal, scrimmed dialog
   * and every sink awaits its own projection.
   */
  async function tierRun(tier: QualityTier, lib: Library) {
    resetTierFallbacks();
    // ASYNC only because video capability is. The probe is skipped entirely at the archival tier —
    // today's default — so the ordinary publish pays nothing for a question it never asks. Resolving
    // it HERE, before `projectLibraryForTier`, is not incidental: the profile decides the published
    // file's extension and MIME, so a target that arrived after the projection would name files the
    // encoder does not produce.
    const enc: TierEncoders = tier === "archival" ? tierEncoders : { ...tierEncoders, ...(await resolveVideoEncoder()) };
    const caps = capsFor(enc);
    const proj = projectLibraryForTier(lib, tier, caps);
    const read = (source: (slug: string, name: string) => Promise<Blob | null>) => async (slug: string, published: string): Promise<Blob | null> => {
      const stored = proj.stored.get(slug)?.get(published) ?? published;
      const src = await source(slug, stored);
      if (!src || tier === "archival") return src;
      // The stored name is the honest MIME source: `Blob.type` is "" for an OPFS read on some
      // backends, and the extension is what ingest itself agreed the file was (`assetMime`).
      const srcMime = assetMime(stored, src.type || undefined);
      // Always through `applyTier`, including for a passthrough: a passthrough the tier was FORCED
      // into (no encoder for a type it owns) is a counted degradation, and short-circuiting here
      // would be exactly the silent fallback this engine is not allowed to have.
      return (await applyTier(src, tierDecision(srcMime, tier, caps), enc, srcMime)).bytes;
    };
    // SELECTOR RESCALE (Archie-4b0a). The projection already knows, per object, how far the pixel
    // space moved — that report was the ticket's evidence that the web tier misplaced every note.
    // Handing it to `publishLibrary` as `scaleSelectors` is what turns the report into the fix: the
    // published heads pages and Range `start`s are projected into the SERVED image's pixel space, so
    // the manifest's canvas dimensions and the annotation coordinates agree by construction.
    //
    // Keyed by slug AND object id because an object id is only unique within its exhibit. `null` for
    // an object that did not move is the contract render-core expects (and is what every object
    // returns at the archival tier, where `rescaled` is empty and the callback is a constant `null` —
    // byte-identical output, pinned by site-rescale.test.ts).
    const scales = new Map<string, SelectorScale>();
    for (const r of proj.rescaled) scales.set(`${r.slug} ${r.objectId}`, selectorScaleOf(r));
    const scaleSelectors = (slug: string, objectId: string): SelectorScale | null => scales.get(`${slug} ${objectId}`) ?? null;
    return { library: proj.library, rescaled: proj.rescaled, scaleSelectors, getAsset: read(readAssetBlob), getThumbnail: read(readThumbBytes) };
  }

  async function projectSite(withOriginals: boolean, baseOverride?: string, tierOverride?: QualityTier, withViewer = false): Promise<{ fs: MemoryFilesystem; brokenLinks: BrokenLink[]; incompleteCanvases: IncompleteCanvas[]; missingAssets: MissingAsset[]; corruptLogs: CorruptLogFinding[]; tierRescaled: TierRescale[]; unscaledSelectors: UnscaledSelector[]; tierFallbacks: number }> {
    // Torn-store advisory (Archie-a690): the annotation findings come back from the loadAllLogs pass
    // (which just warned on them); the structure findings are collected as publishLibrary reads each
    // exhibit's section log via this per-run `collect` sink. Combined, they feed the dialog advisory.
    const structureCorruption: CorruptLogFinding[] = [];
    const logs = await deps.loadAllLogs();
    const annotationCorruption = deps.annotationCorruption?.() ?? [];
    const fs = new MemoryFilesystem();
    const run = await tierRun(tierFor(tierOverride), deps.buildFullLibrary());
    const { brokenLinks, incompleteCanvases, missingAssets, unscaledSelectors, danglingRefs } = await publishLibrary(fs, run.library, (id: string) => logs[id] ?? [], { baseUrl: baseFor(baseOverride), getAsset: run.getAsset, getThumbnail: run.getThumbnail, scaleSelectors: run.scaleSelectors, tileObject, tileRemote, getStructure: makeGetStructure((f) => structureCorruption.push(f)), ...STATIC_PAGE_OPTS, ...(withViewer ? viewerBundleOpt : {}), ...(withOriginals ? { getOriginal: (slug: string, name: string) => readOriginalBytes(slug, name) } : {}) });
    if (brokenLinks.length > 0) console.warn(`Publish: ${brokenLinks.length} broken intra-Library link(s) degraded to plain text`, brokenLinks);
    if (incompleteCanvases.length > 0) console.warn(`Publish: ${incompleteCanvases.length} image object(s) publishing with no width/height (IIIF Pres 3 §5.3)`, incompleteCanvases);
    if (missingAssets.length > 0) console.warn(`Publish: ${missingAssets.length} imported image(s) have no stored bytes — they publish as broken references`, missingAssets);
    // Archie-19d7: a manifest ref with no file behind it — the repeating-404 class. Deliberately a
    // console warning and not a Publish-panel banner: unlike missingAssets (the author can fix it by
    // re-adding the image), this one means the PUBLISHED TREE disagrees with itself, which is a bug
    // report about the publisher rather than a task for the author. The console is where the defect was
    // originally reported from, so it is where the signal belongs until someone can act on it in the UI.
    if (danglingRefs.length > 0) console.warn(`Publish: ${danglingRefs.length} manifest ref(s) point at files the published tree does not contain — this is a publisher bug, please report it (Archie-19d7)`, danglingRefs);
    warnTier(run.rescaled, unscaledSelectors);
    return { fs, brokenLinks, incompleteCanvases, missingAssets, corruptLogs: [...annotationCorruption, ...structureCorruption], tierRescaled: run.rescaled, unscaledSelectors, tierFallbacks: tierFallbackCount() };
  }
  /** The web tier's console readout for every sink — the dialog only sees the two paths that go
   *  through `projectSite`, and a folder/zip publish deserves the same lines.
   *
   *  THREE LINES, THREE SEVERITIES, and the middle one changed meaning when Archie-4b0a's selector
   *  rescale landed. `rescaled` used to say "every note on these objects is now misplaced"; the same
   *  report is now the INPUT that prevents that, so it is `console.info` — a fact about the artifact,
   *  not a defect. `unscaledSelectors` is the residue that IS still a defect (a `<path>` or a
   *  transform the scaler refuses to move rather than mangle), so it keeps the warning. */
  function warnTier(rescaled: TierRescale[], unscaled: UnscaledSelector[] = []): void {
    const fell = tierFallbackCount();
    if (fell > 0) console.warn(`Publish: ${fell} asset(s) shipped their ARCHIVAL bytes inside a web-tier publish — the published site is larger than the tier promised`);
    if (rescaled.length > 0) {
      console.info(`Publish: the web tier re-encoded ${rescaled.length} object(s) at smaller pixel dimensions; their annotation selectors and narrative regions were rescaled to match (Archie-4b0a).`, rescaled);
    }
    if (unscaled.length > 0) {
      console.warn(`Publish: ${unscaled.length} selector(s) could not be rescaled exactly and ship in the AUTHORED pixel space — they will land in the wrong place on a re-encoded object (Archie-4b0a).`, unscaled);
    }
  }
  // Flatten the projected tree to the path→FileContent map the git-trees push consumes.
  //
  // The cache is keyed on the BASE it was projected at, not merely on existence (Archie-19c5). The
  // ordering is the whole point: `openPublish` bakes a tree the moment the author enters the GitHub
  // step — before any owner/repo is typed — so on a first-ever publish that tree is relative. The push
  // then knows its destination (`pagesUrlFor(owner, repo)`, a pure function of owner+repo) and passes
  // it here; a base that disagrees with the cached one re-projects rather than shipping stale ids.
  // Same-base pushes (a repeat publish, or a library that had already deployed) still reuse the warm
  // tree, so the cache keeps doing the job it was added for.
  async function collectSiteFiles(withOriginals = false, baseOverride?: string) {
    const base = baseFor(baseOverride);
    const tier = tierFor();
    const reusable = !withOriginals && cachedSiteFs !== null && cachedSiteBase === base && cachedSiteTier === tier;
    let fs: MemoryFilesystem;
    if (reusable) {
      fs = cachedSiteFs!;
    } else {
      fs = (await projectSite(withOriginals, base, tier, true)).fs;
      // Only the no-originals tree is the shareable one openPublish caches; an originals projection is
      // a one-off (opt-in, rare) and must not become the tree a later plain push reuses.
      //
      // Caching the push's own projection matters because a retry is the common case (a bad token, a
      // taken repo name) and re-projecting re-tiles every large image. It is safe for the same reason
      // openPublish's cache is: the Publish surface is a modal, scrimmed dialog, so the library cannot
      // be edited between the projection and the push.
      if (!withOriginals) { cachedSiteFs = fs; cachedSiteBase = base; cachedSiteTier = tier; }
    }
    return collectFiles(await fs.root());
  }
  // The publish opts shared by every zip sink (streaming + eager): the SAME projection (media tiling,
  // baked thumbnails, structure/history sidecars, static pages) the folder/GH sinks use. The tier's
  // two byte callbacks come from the caller's `tierRun` so the opts and the library it publishes are
  // built from ONE projection — a `getAsset` from a different run would be handed published names it
  // has no map for and would read straight through, silently un-tiering the bytes.
  const zipPublishOpts = (run: Awaited<ReturnType<typeof tierRun>>) => ({ baseUrl: baseFor(), getAsset: run.getAsset, getThumbnail: run.getThumbnail, scaleSelectors: run.scaleSelectors, tileObject, tileRemote, getStructure, ...STATIC_PAGE_OPTS });
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
    const run = await tierRun(tierFor(), libraryForZip(slugs));
    const result = await publishLibrary(fs, run.library, (id: string) => logs[id] ?? [], zipPublishOpts(run));
    warnTier(run.rescaled, result.unscaledSelectors);
    return result;
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
    const { withViewer = false, ...writeOpts } = plan;
    const logs = await deps.loadAllLogs();
    const run = await tierRun(tierFor(), deps.buildFullLibrary());
    const result = await publishLibrary(fs, run.library, (id: string) => logs[id] ?? [], { baseUrl: baseFor(), getAsset: run.getAsset, getThumbnail: run.getThumbnail, scaleSelectors: run.scaleSelectors, tileObject, tileRemote, getStructure, ...STATIC_PAGE_OPTS, ...(withViewer ? viewerBundleOpt : {}), ...writeOpts });
    warnTier(run.rescaled, result.unscaledSelectors);
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
    /** Which half the entry point asked for — the surface opens on the export menu for "export" and
     *  on the home card / setup flow for "publish". Read on OPEN only; the surface navigates freely
     *  afterwards. */
    get intent(): PublishIntent { return s.intent; },
    get brokenLinks(): BrokenLink[] { return s.brokenLinks; },
    get incompleteCanvases(): IncompleteCanvas[] { return s.incompleteCanvases; },
    get corruptLogs(): CorruptLogFinding[] { return s.corruptLogs; },
    get preflight(): PreflightFinding[] { return s.preflight; },
    /** Does the preflight refuse this publish? The dialog's gate — one call, one definition. */
    get publishBlocked(): boolean { return blocksPublish(s.preflight); },
    get missingAssets(): MissingAsset[] { return s.missingAssets; },
    /** Objects the LAST projection published at smaller pixel dimensions than they were authored at
     *  (web tier only). INFORMATIONAL since Archie-4b0a's selector rescale: the notes on these objects
     *  moved with the image, so this reports what the artifact IS, not what is wrong with it. The
     *  correctness residue is `unscaledSelectors`. */
    get tierRescaled(): TierRescale[] { return s.tierRescaled; },
    /** Selectors the LAST projection could NOT rescale exactly and therefore shipped in the authored
     *  pixel space — an imported `<path>`, or an SVG carrying a `transform`. Non-empty means those
     *  specific notes land in the wrong place on a re-encoded object; everything else is correct. */
    get unscaledSelectors(): UnscaledSelector[] { return s.unscaledSelectors; },
    /** Assets the LAST projection shipped at archival bytes despite a web-tier decision (no encoder,
     *  or an encode that threw). Non-zero = the tier under-delivered; the site is bigger than the
     *  estimate the probe gave. */
    get tierFallbacks(): number { return s.tierFallbacks; },
    /** The tier the next projection will run at — one read for the surface, so it can never disagree
     *  with what the engine resolves. */
    get tier(): QualityTier { return tierFor(); },
    /** The author's quality choice (Archie-c367). Every sink resolves through `tierFor`, so this one
     *  call re-tiers the folder, zip, deposit and GitHub paths alike; the projection cache is keyed on
     *  the tier, so the next publish re-projects rather than shipping the old bytes. */
    setTier(t: QualityTier) { s.tier = t; },
    /** The last archive probe, or null before one has run. */
    get probe(): ArchiveProbe | null { return s.probe; },
    /** True while an inventory pass is walking the library's assets. */
    get probing(): boolean { return s.probing; },
    /**
     * Probe the OPEN LIBRARY: what it weighs, which destinations it fits, and which (destination, tier)
     * pair to pre-select (Archie-7280 / Archie-c367).
     *
     * The expensive half is the inventory — one OPFS stat per stored asset — so it runs chunked with a
     * yield between chunks (`archive-inventory.ts`) and reports progress. `probeArchive` itself is
     * arithmetic and runs in one go.
     *
     * A second call while one is in flight is REFUSED (returns the probe in hand, or null): the surface
     * re-probes on open and on nothing else, so a concurrent pass would only be a double-open, and two
     * inventory walks racing over the same OPFS handles is a cost with no upside.
     */
    async probeLibrary(onProgress?: (done: number, total: number) => void): Promise<ArchiveProbe | null> {
      if (s.probing) return s.probe;
      s.probing = true;
      try {
        const exhibits = deps.exhibits();
        const files = await libraryInventory(exhibits, onProgress);
        const probe = probeArchive(files, {
          // `folderSinkSupported()` is the ONE definition of "can this platform write a folder"
          // (`folder-backend.ts`) — read here rather than re-derived, so the greyed folder and
          // object-storage rows carry the same answer the sink itself would give. Firefox/Safari get
          // `false` and both rows come back unavailable WITH their reason (Archie-c85f / Archie-c367).
          capabilities: { folderSink: folderSinkSupported() },
          exhibitCount: Math.max(1, exhibits.length),
        });
        s.probe = probe;
        return probe;
      } finally {
        s.probing = false;
      }
    },
    /**
     * "Deposit a copy" (Archie-039e): the same published bytes arranged as a BagIt bag — payload under
     * `data/`, a SHA-256 for every file, and the `bag-info.txt` a repository's ingest workflow reads.
     *
     * EAGER, not streamed, and that is structural rather than lazy: `writeBag` re-reads two files it
     * just wrote (the fixity manifest and `archie.json`) in order to hash them, and a streaming zip
     * target is write-only. So it builds in memory under the same ceiling the eager zip path uses, with
     * the same size guard in front of it.
     *
     * Returns whether a save happened — a cancelled picker or a declined guard is not a deposit.
     */
    async depositBag(opts: ZipExportOpts = {}): Promise<{ saved: boolean; name?: string; oxum?: string; payloadFiles?: number }> {
      if (!(await zipSizeOk(opts.slugs))) return { saved: false };
      await deps.flushExhibit();
      const logs = await deps.loadAllLogs();
      const run = await tierRun(tierFor(), libraryForZip(opts.slugs));
      const fs = new ZipFilesystem({ maxUncompressedBytes: EAGER_ZIP_CEILING_BYTES });
      const result = await writeBag(fs, run.library, (id: string) => logs[id] ?? [], zipPublishOpts(run), {
        // RFC 8493 §2.2.2 wants YYYY-MM-DD. Injected here rather than defaulted inside `bag.ts` so the
        // bag's bytes stay a pure function of the library in tests; product code is the one place that
        // is allowed to read the clock.
        baggingDate: new Date().toISOString().slice(0, 10),
      });
      warnTier(run.rescaled, result.unscaledSelectors);
      const base = (opts.name?.trim() || deps.currentZipName()).replace(/\.archie\.zip$/, "") || "library";
      const name = await saveBagZip(fs.toZip(), `${base}-bag`);
      if (name === null) return { saved: false };
      return { saved: true, name, oxum: result.oxum, payloadFiles: result.payloadFiles };
    },
    openMenu(intent: PublishIntent = "publish") { s.intent = intent; s.open = true; },
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
    async exportSelfContained(opts?: ZipExportOpts): Promise<SelfContainedResult> {
      // HARD cap, not a confirm — see SINGLE_FILE_MAX_BYTES. The other size guards in this file are
      // warn-and-proceed because the browser's own download UI shows progress; this one cannot be.
      const bytes = await estimateLibraryBytes(opts?.slugs);
      if (bytes >= SINGLE_FILE_MAX_BYTES) {
        return { ok: false, reason: "too-large", mb: Math.round(bytes / (1024 * 1024)) };
      }
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
      return { ok: true };
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
    /** GH publish (includeOriginals opt-in from the dialog; onProgress reports upload/commit/Pages).
     *
     *  The destination is knowable BEFORE the tree is projected — `pagesUrlFor` is a pure function of
     *  owner+repo — so the base is derived here and handed to the projection, exactly as the desktop
     *  deploy already does (`deploy-flows.svelte.ts` computes the same URL before it stages). Without
     *  this the push shipped whatever `openPublish` had cached before the author typed a repo name.
     *  (Archie-19c5 / Archie-3504.) */
    publish: async (target: GitHubTarget, opts?: { includeOriginals?: boolean }, onProgress?: (p: PublishProgress) => void) =>
      publishToGitHub(await collectSiteFiles(opts?.includeOriginals ?? false, pagesUrlFor(target.owner, target.repo)), target, onProgress),
    /** The projected static-site tree for the desktop one-motion deploy (Task 13). The SAME projection
     *  (media tiling / baked thumbnails) every other sink uses — deploy-flows flattens it into one git
     *  pack, so it never has to duplicate the browser-only tiling closures. Flushes the current exhibit
     *  first (parity with `localPublishFolder`) so the pushed tree is current; also surfaces the
     *  broken-links / incomplete-canvas advisories the same way `openPublish` does. */
    async projectSiteFs(baseUrl?: string): Promise<Filesystem> {
      await deps.flushExhibit();
      // `baseUrl` is the deploy path's known destination (pagesUrlFor, before staging). Absent for
      // every other caller, which then resolves through `publishBase()`.
      const { fs, brokenLinks, incompleteCanvases, missingAssets, corruptLogs, tierRescaled, unscaledSelectors, tierFallbacks } = await projectSite(false, baseUrl, undefined, true);
      s.brokenLinks = brokenLinks;
      s.incompleteCanvases = incompleteCanvases;
      s.missingAssets = missingAssets;
      s.corruptLogs = corruptLogs;
      s.tierRescaled = tierRescaled;
      s.unscaledSelectors = unscaledSelectors;
      s.tierFallbacks = tierFallbacks;
      s.preflight = await runPreflight(fs);
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
      s.tierRescaled = [];
      s.unscaledSelectors = [];
      s.tierFallbacks = 0;
      cachedSiteFs = null;
      cachedSiteBase = null;
      cachedSiteTier = null;
      // The base the destination is NOT yet known at — see `collectSiteFiles`. Captured here so the
      // cache carries what it was projected at, rather than being reused for any base at all. The
      // tier is captured for the same reason and at the same moment: the author may change it on the
      // surface after this warm projection has already run.
      const warmBase = baseFor();
      const warmTier = tierFor();
      void projectSite(false, warmBase, warmTier, true).then(({ fs, brokenLinks: bl, incompleteCanvases: ic, missingAssets: ma, corruptLogs: cl, tierRescaled: tr, unscaledSelectors: us, tierFallbacks: tf }) => {
        cachedSiteFs = fs;
        cachedSiteBase = warmBase;
        cachedSiteTier = warmTier;
        s.brokenLinks = bl;
        s.incompleteCanvases = ic;
        s.missingAssets = ma;
        s.corruptLogs = cl;
        s.tierRescaled = tr;
        s.unscaledSelectors = us;
        s.tierFallbacks = tf;
        // Preflight walks the BUILT tree, so it can only run once the projection lands — same
        // reactive fill-in as the advisories above (the wizard is already on screen by then).
        void runPreflight(fs).then((p) => { s.preflight = p; });
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
      await writeTree(fb.fs, { withViewer: true });
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

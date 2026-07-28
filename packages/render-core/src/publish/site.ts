// Publish primitive (CONTEXT: "Publish = zip-primitive + per-host adapters"). Assemble the
// whole published-site DATA tree through the Filesystem seam:
//   collection.json · exhibits.json · images.json (library-level image index, ADR-0023)
//   {slug}/manifest.json
//   {slug}/canvas/{objId}/annotations.json   — PER-CANVAS heads page (what the manifest links to)
//   {slug}/annotations/history/{logicalId}.json + index.json   — history sidecar (reload/merge)
// The zip is the architectural primitive; the GH-Pages Contents-API adapter (~200 LOC, network)
// is a thin browser layer over the resulting tree. Viewer HTML/JS/CSS are layered on by the app
// build (Astro) — out of this pure core.

import type { Filesystem, FsDirectory } from "../fs/seam.js";
import { ZipFilesystem } from "../fs/zip.js";
import type { Library } from "../model/model.js";
import { sanitizeMetadataEntries } from "../model/model.js";
import type { AnnotationLog, AnnotationRecord, W3CAnnotation, W3CAnnotationPage } from "../wadm/types.js";
import { buildLinkIndex, resolveViewerLink, validateLink, rewriteArchieLinks, type LinkTarget } from "../link/link.js";
import { toCollection } from "../iiif/collection.js";
import { toExhibitsJson, toReadingCollection, type ExhibitsJson } from "../iiif/exhibits.js";
import { buildImageIndex } from "../iiif/image-index.js";
import { toManifest, objectsFromManifest, canvasIdMap, sectionsFromManifest, sectionsToAnnotationCollection, embedHeadsIntoManifest, findCanvasesMissingDimensions, type HeadsEmbed } from "../iiif/manifest.js";
import { rightsFromIIIF } from "../iiif/rights.js";
import { rebaseCanvasId } from "../iiif/canvasid.js";
import { langMap, type IIIFManifest, type LangMap } from "../iiif/presentation.js";
import type { Exhibit, AObject, Section, Reading, RightsFields } from "../model/model.js";
import type { DziTileSource } from "../iiif/resolve.js";
import type { PortableExhibit } from "./portable.js"; // type-only (erased) — the readings superset; type-cycle is harmless
import { readExhibitTree, fsJsonSource } from "./read.js";
import { libraryPageHtml, exhibitPageHtml, sitemapTxt, sitemapXml } from "./static-pages.js";
import { citationCff } from "../cite/citation.js";
import { readAnnotations } from "../spine/persist.js";
import { writeStructure } from "../spine/structure-persist.js";
import type { SectionLog } from "../spine/structure.js";
import { asExhibitId, asLibraryId } from "../wadm/brand.js";
import { toHistory } from "../spine/serialize.js";
import { projectHeads } from "../spine/heads.js";
import { headsPageFromRecords, headsPagesByReading, citationIdMap, targetSource, recordsByLogicalId } from "../spine/serialize.js";
import { stamp } from "../migrate/migrate.js";
import { ARCHIE_LIBRARY_MARKER } from "./marker.js";
import { mapLimit, PUBLISH_CONCURRENCY } from "../concurrency.js";

export interface PublishOptions {
  /** Absolute base for ids, e.g. `https://user.github.io/lib/`. */
  baseUrl?: string;
  /**
   * Provide bytes for an imported-asset object (source `"/assets/{name}"`, e.g. a Studio file
   * import). When given, publishLibrary writes the bytes into the published tree at
   * `{slug}/assets/{name}` and rewrites the canvas image URL to the published path. Without it,
   * `/assets/` sources are left as-is (the asset won't be served — see P2-X). Keyed by (slug, name).
   */
  getAsset?: (slug: string, name: string) => Promise<ArrayBuffer | Blob | null>;
  /**
   * Provide bytes for an object's PRESERVED ORIGINAL (the untouched pre-bake source, CONTEXT §89.1).
   * When given, publishLibrary writes each object's `originalName` into `{slug}/assets-original/{name}`
   * for citation. Opt-in — without it, originals stay in the working store and never ship. Keyed by (slug, name).
   */
  getOriginal?: (slug: string, name: string) => Promise<ArrayBuffer | Blob | null>;
  /**
   * Provide bytes for an imported asset's BAKED THUMBNAIL — a small gallery/overview derivative so the
   * published grid loads a shrunk plate, not the full-resolution master (the multi-object load win).
   * Keyed by (slug, asset name), same name as the master. When given AND the object carries a
   * `thumbnail`, publishLibrary writes the bytes to `{slug}/assets-thumb/{name}` and rewrites
   * `object.thumbnail` to that published URL. Without it (or without bytes) the thumbnail is dropped, so
   * the manifest never references a thumbnail that wasn't published (the grid then derives at runtime).
   */
  getThumbnail?: (slug: string, name: string) => Promise<ArrayBuffer | Blob | null>;
  /**
   * Generate a Deep Zoom (DZI) tile pyramid for an imported-asset object AT PUBLISH TIME (Q-9/Q-11).
   * App-supplied: the slicer uses OffscreenCanvas (browser-only), so core stays browser-agnostic by
   * injection — Node/tests simply omit it. Given the asset bytes, return the sliced tiles (keyed
   * `{level}/{col}_{row}.{ext}`) plus the DZI descriptor, or null to leave the object a single image.
   * publishLibrary writes the tiles to `{slug}/{name}_files/…` and stamps `tileSource` (its `filesPath`
   * rewritten to the published pyramid) so the viewer deep-zooms from fast local tiles instead of the
   * full master / a slow remote IIIF. The single-image `source` stays as a fallback. Keyed by (slug, name).
   */
  tileObject?: (slug: string, name: string, bytes: ArrayBuffer | Blob) => Promise<{ descriptor: DziTileSource; tiles: Map<string, Blob> } | null>;
  /**
   * Bake a REMOTE IIIF/image object into a LOCAL DZI pyramid at publish time (Q-9) — so the published
   * viewer deep-zooms from local tiles instead of depending on a slow / cross-origin IIIF service (e.g.
   * a 504ing archive.org). App-supplied (browser): fetches the full-resolution source + slices. Given the
   * object, return the tiles + descriptor, or null to leave the remote source as-is. publishLibrary writes
   * the tiles to `{slug}/{objId}_files/…` and stamps `tileSource`; the remote `source` stays a fallback.
   */
  tileRemote?: (slug: string, obj: AObject) => Promise<{ descriptor: DziTileSource; tiles: Map<string, Blob> } | null>;
  /**
   * The interactive Viewer's base URL (the canonical instance, ADR-0013) — when given, the static
   * archival pages (ADR-0014) link each exhibit/note out to the live experience. App-supplied;
   * core never hardcodes an origin.
   */
  viewerBase?: string;
  /**
   * Markdown → SAFE html for the static archival pages' note bodies (ADR-0014 / P-1 Q3): Studio
   * injects the SAME snarkdown+DOMPurify pipeline the live Viewer uses, so static and live
   * sanitization policy cannot drift. Default: entity-escape everything (the non-DOM floor).
   */
  renderBody?: (md: string) => string;
  /**
   * The artifact's true publish time (ISO 8601, Q-8) — the static pages' JSON-LD `datePublished`/
   * `dateModified` and the sitemap `<lastmod>`. App-supplied (the publish step's timestamp); absent =
   * those fields are omitted (no fabricated date). Idempotency note: passing a fixed value keeps the
   * pages byte-stable across republish; omitting it keeps the pre-Q-8 byte output.
   */
  publishedAt?: string;
  /**
   * Publish-generation id (STALENESS / Issue 24), stamped into the root `archie.json` marker (the LAST
   * write = commit point). App-supplied for full control; ABSENT = derived deterministically from the
   * library-level projections (exhibits.json + images.json) plus `publishedAt` when given. Deterministic
   * so an incremental publish and a full republish of the same content stamp the SAME generation (the
   * byte-stable-republish contract); folding in `publishedAt` makes each real (timestamped) publish unique
   * so a note-only republish still busts caches. The Viewer keys hosted fetches on `?g=<generation>`.
   */
  generation?: string;
  /**
   * Incremental scope (spike-0002 / SCALE-GALLERY Phase 1.1) — restrict which exhibits this publish
   * (re)writes (the folder-autosave hot path). ABSENT = full projection: the zip / GitHub / preview
   * paths pass nothing and stay byte-identical. PRESENT: only `exhibits` slugs are (re)written; within
   * those, the expensive asset-copy + DZI-tiling + thumbnail BYTE passes run only for `reassets` slugs —
   * others recover their published object projection from the existing manifest (bytes untouched).
   * Library-global projections (collection/exhibits/index/sitemaps) are ALWAYS rewritten regardless —
   * they are cheap (ADR-0023).
   */
  incremental?: IncrementalScope;
  /**
   * Orphan pruning (spike-0002) — DELETE these stale entries. DECOUPLED from `incremental` on purpose:
   * a full republish overwrites but never removes, so removals must run on BOTH the incremental hot path
   * AND the full resync / explicit-Save writes (else a deletion is silently forfeited). Processed BEFORE
   * the exhibit-write loop, so a remove-then-recreate in one publish prunes the old tree, then rewrites.
   */
  removedExhibits?: string[];
  removedObjects?: { slug: string; objId: string; assetName?: string }[];
  /**
   * Provide the SECTION REV-LOG for an exhibit at publish time (Archie-aef4 — the collab exchange
   * leg). When it returns a non-empty log, the exhibit's tree carries
   * `{slug}/structure/history/{localId}.json` + `history/index.json` — written by `writeStructure`
   * (pages first, index LAST), the EXACT layout the zip/folder import merge
   * (`mergeImportedStructure` → `readStructureReport`) reads, so publish → exchange → import is a
   * real round trip. Absent callback or empty log → NO `structure/` dir is written and the
   * published tree stays byte-identical to the pre-structure output (the no-log compatibility pin).
   *
   * FLAG POSTURE: emission is deliberately NOT gated on the `archie.structureRevlog` flag at
   * publish time — it is driven by log EXISTENCE. A log only exists if the flag was ON while
   * authoring; a library that HAS section history must carry it in every published/exported tree
   * regardless of the flag's current position, or a flag flip would silently strand history at the
   * next exchange.
   */
  getStructure?: StructureLookup;
}

/**
 * Which exhibits an incremental publish must rewrite (spike-0002). `reassets` is a subset of `exhibits`:
 * a slug there reruns the asset-copy + tiling byte passes; a slug only in `exhibits` rewrites its
 * JSON/HTML but recovers its object projection from the prior manifest (bytes untouched). Slugs are the
 * per-exhibit directory names. Removals live in `PublishOptions.removedExhibits/removedObjects` (they
 * apply to full writes too), NOT here.
 */
export interface IncrementalScope {
  /** Exhibit slugs whose data-tree files to rewrite; exhibits not listed are skipped entirely. */
  exhibits: Set<string>;
  /** Subset of `exhibits` whose asset/tile/thumbnail byte passes must rerun (object added / asset changed). */
  reassets: Set<string>;
}

const ASSET_PREFIX = "/assets/";

/** Look up the annotation log for an Exhibit (by Exhibit id). */
export type LogLookup = (exhibitId: string) => AnnotationLog;

/** Look up the section rev-log for an Exhibit — the structure sibling of {@link LogLookup}.
 *  Async-friendly (app stores read it off disk); the `slug` rides along because app stores key
 *  their per-exhibit structure dirs by slug. Return `[]` for an exhibit without a log. */
export type StructureLookup = (exhibitId: string, slug: string) => Promise<SectionLog> | SectionLog;

/** An in-body `archie:` link whose target didn't resolve in the Library at publish time. */
export interface BrokenLink {
  exhibitSlug: string;
  logicalId: string;
  target: LinkTarget;
}

/** A published Canvas with an Image body but no `width`/`height` — spec-non-conformant (IIIF
 *  Presentation 3 §Canvas); usually a failed ingest-time dimension probe (see manifest.ts
 *  `findCanvasesMissingDimensions`). */
export interface IncompleteCanvas {
  exhibitSlug: string;
  canvasId: string;
  label: string;
}

/** An `/assets/{name}`-sourced object whose bytes the wired `getAsset` could not produce: the
 *  manifest ships with the raw working source (there is nothing better to write), which no server
 *  will satisfy — the published exhibit's image is BROKEN. Reported, not thrown: one lost asset
 *  must not veto the rest of the library, but shipping it silently is how an assetless export
 *  passes for a complete one (the 2026-07-19 round-trip loss). Only populated when `getAsset` is
 *  wired — a caller that omits it has opted out of asset handling entirely (see PublishOptions). */
export interface MissingAsset {
  exhibitSlug: string;
  objectId: string;
  name: string;
}

/** What publishLibrary reports back: the broken intra-Library links it degraded, any
 *  spec-non-conformant Canvases (missing dimensions) it shipped anyway, and any imported-asset
 *  sources whose bytes were unavailable (shipped dangling — surface these to the publisher). */
export interface PublishResult {
  brokenLinks: BrokenLink[];
  incompleteCanvases: IncompleteCanvas[];
  missingAssets: MissingAsset[];
}

interface LinkRewrite {
  resolve: (target: LinkTarget) => string;
  validate: (target: LinkTarget) => boolean;
}

/**
 * Rewrite a head record's in-body `archie:` refs to published display URLs (the PROJECTION step —
 * the history sidecar keeps raw refs as the round-trip source). Returns the record unchanged unless
 * a body actually carried a ref; broken refs are pushed to `sink` for publish-time warnings.
 */
function rewriteHeadBodies(rec: AnnotationRecord, exhibitSlug: string, rw: LinkRewrite, sink: BrokenLink[]): AnnotationRecord {
  if (rec.body === undefined) return rec;
  const arr = Array.isArray(rec.body) ? rec.body : [rec.body];
  let changed = false;
  const next = arr.map((b) => {
    const v = (b as { value?: unknown }).value;
    if (typeof v !== "string" || !v.includes("archie:")) return b;
    const { md, broken } = rewriteArchieLinks(v, rw);
    for (const t of broken) sink.push({ exhibitSlug, logicalId: rec.logicalId, target: t });
    if (md === v) return b;
    changed = true;
    return { ...b, value: md };
  });
  if (!changed) return rec;
  return { ...rec, body: Array.isArray(rec.body) ? next : next[0]! };
}

/** Re-mint a head's canvas target onto the base being published to, when it provably denotes one of
 *  THIS exhibit's canvases at some other origin (see `rebaseCanvasId` for why this is not a fuzzy
 *  match). Applied to the CONSUMER PROJECTION only — the same posture as `rewriteHeadBodies` beside
 *  it: the history sidecar keeps the authored target verbatim, so a load→publish round trip rebases
 *  from canonical each time rather than compounding. Returns the record unchanged when nothing moves. */
function rebaseHeadTarget(rec: AnnotationRecord, base: string, slug: string, isObjectId: (id: string) => boolean): AnnotationRecord {
  const t = rec.target;
  if (typeof t === "string") {
    const next = rebaseCanvasId(t, base, slug, isObjectId);
    return next === t ? rec : { ...rec, target: next };
  }
  const next = rebaseCanvasId(t.source, base, slug, isObjectId);
  return next === t.source ? rec : { ...rec, target: { ...t, source: next } };
}

async function writeJson(dir: FsDirectory, name: string, data: unknown): Promise<void> {
  const file = await dir.getFile(name, { create: true });
  const w = await file.writable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

async function writeText(dir: FsDirectory, name: string, text: string): Promise<void> {
  const file = await dir.getFile(name, { create: true });
  const w = await file.writable();
  await w.write(text);
  await w.close();
}

/** Write a DZI tile pyramid into `filesDir` through the fs seam. Tile keys are `{level}/{col}_{row}.{ext}`;
 *  each level subdirectory is created once and reused (the pyramid is hundreds–thousands of tiles). */
async function writeTilePyramid(filesDir: FsDirectory, tiles: Map<string, Blob>): Promise<void> {
  const levelDirs = new Map<string, FsDirectory>();
  for (const [path, blob] of tiles) {
    const slash = path.indexOf("/");
    const level = path.slice(0, slash); // "{level}"
    const fileName = path.slice(slash + 1); // "{col}_{row}.{ext}"
    let dir = levelDirs.get(level);
    if (!dir) {
      dir = await filesDir.getDirectory(level, { create: true });
      levelDirs.set(level, dir);
    }
    const file = await dir.getFile(fileName, { create: true });
    const w = await file.writable();
    await w.write(blob);
    await w.close();
  }
}

/** Remove a child if present; a missing entry is not an error (incremental orphan cleanup). */
async function removeIfExists(dir: FsDirectory, name: string): Promise<void> {
  try { await dir.remove(name); } catch { /* already absent */ }
}
/** Open a child directory, or null if it doesn't exist (create:false throws on the FSA/OPFS backends). */
async function getDirOptional(dir: FsDirectory, name: string): Promise<FsDirectory | null> {
  try { return await dir.getDirectory(name); } catch { return null; }
}

/** A remote image object eligible for publish-time DZI baking: an http(s) source that is NOT a local
 *  `/assets/` import (the asset pass — which runs FIRST and rewrites those to published `…/assets/…` URLs —
 *  owns its own tiling), no existing `tileSource` (a map/xyz/dzi is already structured), and image medium
 *  (AV is never tiled). The `/assets/` guard is load-bearing: without it the asset pass's rewritten https
 *  sources would be re-tiled here as if remote. */
function isRemoteTileable(o: AObject): boolean {
  return o.bakeTiles === true // explicit per-object opt-in (Q-9): remote baking is OFF by default
    && !o.tileSource
    && /^https?:\/\//i.test(o.source)
    && !/\/assets\//.test(o.source)
    && (o.mediaType === undefined || o.mediaType === "image");
}

/**
 * Write the full published-site data tree into `fs`. Per-canvas heads pages are written at the
 * exact paths the Manifest's `canvas.annotations[].id` reference (the Phase-2 interop gate);
 * history is exhibit-level (per-logicalId). Pure idempotent projection of the Library + its logs.
 */
export async function publishLibrary(fs: Filesystem, library: Library, getLog: LogLookup, opts: PublishOptions = {}): Promise<PublishResult> {
  const baseUrl = opts.baseUrl ?? "";
  const inc = opts.incremental; // spike-0002: present = incremental (dirty-set) publish; absent = full
  const src = fsJsonSource(fs); // for the incremental recover-from-existing-manifest path
  const root = await fs.root();
  // ADR-0020 marker (archie.json) is written LAST, not here — see the end of this function. Issue 25b: a
  // marker written FIRST validates a tree that a crash mid-publish left torn; writing it last makes it the
  // COMMIT POINT — a partial tree has no current marker, so a consumer rejects it instead of rendering it.
  await writeJson(root, "collection.json", toCollection(library, { baseUrl }));
  // Stamp the Gallery source with the schema version so it stays migratable (orphan gap §39). Keep the
  // object for the generation hash (below) so the generation id is a pure function of published content.
  const exhibitsJson = stamp(toExhibitsJson(library));
  await writeJson(root, "exhibits.json", exhibitsJson);

  // Library-wide note index (a projection of EVERY log) — intra-Library `archie:` refs are resolved
  // against it at publish: a link in one exhibit may target a note in another, so build it complete
  // before rewriting any. Keyed by slug to match the slug encoded in each `archie:` ref.
  const logsBySlug: Record<string, AnnotationLog> = {};
  for (const ex of library.exhibits) logsBySlug[ex.slug] = getLog(ex.id);
  const linkIndex = buildLinkIndex(logsBySlug);
  const rw: LinkRewrite = {
    // Cites project to the live single-shell Viewer route (resolveViewerLink), NOT the old per-page
    // `{slug}/#/a/<id>` grammar that the slug-qualified router dropped. viewerBase is normally always
    // supplied (Studio's STATIC_PAGE_OPTS); without it, cites degrade to the durable static-archival
    // anchor in the data tree (baseUrl). The stored `archie:` ref grammar (encodeLinkRef) is untouched.
    resolve: (t) => resolveViewerLink(t, { ...(opts.viewerBase !== undefined ? { viewerBase: opts.viewerBase } : {}), dataBase: baseUrl }),
    validate: (t) => validateLink(t, linkIndex),
  };
  const brokenLinks: BrokenLink[] = [];
  const incompleteCanvases: IncompleteCanvas[] = [];
  const missingAssets: MissingAsset[] = [];

  // Orphan pruning (spike-0002) — BEFORE the write loop, so a remove-then-recreate in one publish deletes
  // the old tree first, then the loop rewrites the fresh exhibit (post-loop pruning would delete that write).
  // Decoupled from `incremental`: runs on full writes too (a full republish overwrites but never removes).
  // Removing a MISSING entry is a no-op.
  for (const slug of opts.removedExhibits ?? []) await removeIfExists(root, slug);
  for (const r of opts.removedObjects ?? []) {
    const exDir = await getDirOptional(root, r.slug);
    if (!exDir) continue;
    const canvasDir = await getDirOptional(exDir, "canvas");
    if (canvasDir) await removeIfExists(canvasDir, r.objId);
    await removeIfExists(exDir, `${r.objId}_files`); // remote-baked DZI pyramid (tileRemote keys by objId)
    if (r.assetName) {
      const assetsDir = await getDirOptional(exDir, "assets");
      if (assetsDir) await removeIfExists(assetsDir, r.assetName);
      const thumbDir = await getDirOptional(exDir, "assets-thumb");
      if (thumbDir) await removeIfExists(thumbDir, r.assetName);
      await removeIfExists(exDir, `${r.assetName}_files`); // publish-time-tiled imported asset (keys by name)
    }
  }

  // PERF (SCALE-GALLERY): exhibits are independent — each writes only its own {slug}/ subtree, reads the
  // shared read-only linkIndex/rw, and pushes to brokenLinks/incompleteCanvases (synchronous array pushes,
  // atomic on the single JS thread; cross-exhibit push order is advisory and untested). Fan them out under
  // a bounded pool instead of a serial waterfall (the 100-exhibit wall). The `await` on mapLimit is a hard
  // barrier: EVERY exhibit's writes complete before the library-level projections (index.html / sitemaps /
  // images.json) and the archie.json COMMIT MARKER below — the marker-LAST ordering contract (Issue 25b) is
  // preserved exactly, now "strictly after ALL exhibits" rather than "after the last serial exhibit".
  await mapLimit(library.exhibits, PUBLISH_CONCURRENCY, async (exhibit) => {
    if (inc && !inc.exhibits.has(exhibit.slug)) return; // incremental: only dirty exhibits are (re)written
    const exDir = await root.getDirectory(exhibit.slug, { create: true });
    let runAssets = !inc || inc.reassets.has(exhibit.slug); // rerun the expensive asset-copy + tiling passes?

    let manifestExhibit = exhibit;
    // JSON-only rewrite (byte passes skipped): recover the already-published object projection (rewritten
    // source, tileSource, baked thumbnail) from the existing manifest and reuse it — rebuilding from the
    // working model would re-emit raw /assets/ sources and DROP tileSource/thumbnail, since those publish
    // decisions aren't persisted in the model (spike-0002 §manifest-recovery trap). Model order + authored
    // fields win; only the asset triple comes from disk. objectsFromManifest is the round-trip loadLibrary relies on.
    if (!runAssets) {
      const existing = await src.getOptional<IIIFManifest>(`${exhibit.slug}/manifest.json`);
      const publishedNow = existing ? new Map(objectsFromManifest(existing).map((o) => [o.id, o])) : null;
      // A just-added ASSET object has no published projection, so this pass cannot recover its asset
      // triple — and the `!p` branch below would then emit the MODEL's refs, i.e. a raw `/assets/{name}`
      // source and a working `/assets-thumb/{name}` thumbnail, both pointing at files a JSON-only pass
      // never writes. That shipped a manifest referencing a thumbnail that does not exist (Archie-19d7:
      // a repeating 404 on {slug}/assets-thumb/{name}). Force the byte passes for this exhibit, exactly
      // as the missing-manifest self-heal below does, and for the same reason.
      if (publishedNow && exhibit.objects.some((o) => o.source.startsWith(ASSET_PREFIX) && !publishedNow.has(o.id))) {
        runAssets = true;
      } else if (existing && publishedNow) {
        const published = publishedNow;
        manifestExhibit = {
          ...exhibit,
          objects: exhibit.objects.map((o) => {
            const p = published.get(o.id);
            if (!p) return o; // no prior published projection (e.g. a just-added object) — keep the model
            // The published projection is authoritative for the asset triple — MIRROR it exactly, including
            // its ABSENCES: a working /assets-thumb/ ref or a stale tileSource in the model must be dropped
            // when the published manifest carries none, matching the full pass's `delete next.thumbnail`.
            const next: AObject = { ...o, source: p.source };
            if (p.tileSource) next.tileSource = p.tileSource; else delete next.tileSource;
            if (p.thumbnail !== undefined) next.thumbnail = p.thumbnail; else delete next.thumbnail;
            return next;
          }),
        };
      } else {
        // Self-heal (spike-0002 §API footgun): a scoped exhibit whose published manifest is missing/unreadable
        // can't recover its asset projection — falling back to the raw model would publish raw /assets/ sources
        // and drop tiles. Force the byte passes for this exhibit instead (treat it as `reassets`).
        runAssets = true;
      }
    }

    // Imported-asset objects (source "/assets/{name}"): write the bytes into the published tree at
    // {slug}/assets/{name} and rewrite the canvas image URL to that published path. The annotation
    // log targets canvas IRIs (by obj.id), NOT the image source, so heads grouping is unaffected.
    if (runAssets && opts.getAsset && exhibit.objects.some((o) => o.source.startsWith(ASSET_PREFIX))) {
      const assetsDir = await exDir.getDirectory("assets", { create: true });
      // The baked-thumbnail sibling dir, created only when an object actually carries one + the
      // callback is wired (keeps a thumbnail-less publish byte-identical to before).
      const wantThumbs = !!opts.getThumbnail && exhibit.objects.some((o) => o.thumbnail !== undefined);
      const thumbDir = wantThumbs ? await exDir.getDirectory("assets-thumb", { create: true }) : null;
      const objects = await Promise.all(
        exhibit.objects.map(async (o) => {
          if (!o.source.startsWith(ASSET_PREFIX)) return o;
          const name = o.source.slice(ASSET_PREFIX.length);
          const bytes = await opts.getAsset!(exhibit.slug, name);
          if (!bytes) {
            // Bytes unavailable — the manifest keeps the raw /assets/ source (nothing better to
            // write), which IS dangling in the published tree. Report it so the publisher can say
            // so instead of shipping the loss silently.
            missingAssets.push({ exhibitSlug: exhibit.slug, objectId: o.id, name });
            return o;
          }
          const f = await assetsDir.getFile(name, { create: true });
          const w = await f.writable();
          await w.write(bytes);
          await w.close();
          const next: AObject = { ...o, source: `${baseUrl}${exhibit.slug}/assets/${name}` };
          // DZI tiling (Q-9): if the app supplies a slicer and it returns a pyramid for this asset, write
          // the tiles to {slug}/{name}_files/… and stamp tileSource (filesPath → the published pyramid) so
          // the viewer deep-zooms from fast local tiles. `source` stays a fallback (mount prefers tileSource).
          if (opts.tileObject && !o.tileSource) {
            const sliced = await opts.tileObject(exhibit.slug, name, bytes);
            if (sliced && sliced.tiles.size > 0) {
              const filesDirName = `${name}_files`;
              await writeTilePyramid(await exDir.getDirectory(filesDirName, { create: true }), sliced.tiles);
              next.tileSource = { ...sliced.descriptor, filesPath: `${baseUrl}${exhibit.slug}/${filesDirName}` };
            }
          }
          // Publish a baked thumbnail iff its bytes exist — else strip the working `/assets-thumb/` ref so
          // the manifest can't point at an unpublished file (gen-published has no thumbnails → all dropped).
          delete next.thumbnail;
          if (thumbDir && o.thumbnail !== undefined) {
            const tb = await opts.getThumbnail!(exhibit.slug, name);
            if (tb) {
              const tf = await thumbDir.getFile(name, { create: true });
              const tw = await tf.writable();
              await tw.write(tb);
              await tw.close();
              next.thumbnail = `${baseUrl}${exhibit.slug}/assets-thumb/${name}`;
            }
          }
          return next;
        }),
      );
      manifestExhibit = { ...exhibit, objects };
    }

    // Remote-IIIF tiling (Q-9): bake a remote IIIF/image source into a LOCAL pyramid so the published
    // viewer deep-zooms from local tiles instead of depending on a slow / cross-origin IIIF service.
    // App-supplied tileRemote fetches the full-res image + slices (browser); writes {slug}/{objId}_files/
    // and stamps tileSource. The remote `source` stays as a fallback if the local tiles ever 404.
    if (runAssets && opts.tileRemote && manifestExhibit.objects.some(isRemoteTileable)) {
      const objects = await Promise.all(
        manifestExhibit.objects.map(async (o) => {
          if (!isRemoteTileable(o)) return o;
          const sliced = await opts.tileRemote!(exhibit.slug, o);
          if (!sliced || sliced.tiles.size === 0) return o;
          const filesDirName = `${o.id}_files`;
          await writeTilePyramid(await exDir.getDirectory(filesDirName, { create: true }), sliced.tiles);
          return { ...o, tileSource: { ...sliced.descriptor, filesPath: `${baseUrl}${exhibit.slug}/${filesDirName}` } };
        }),
      );
      manifestExhibit = { ...manifestExhibit, objects };
    }
    // Resolve in-body `archie:` cites in SECTION prose too — previously ONLY note bodies were rewritten
    // (rewriteHeadBodies below), so a cite inside a Narrative section shipped a raw `archie:` ref the
    // Viewer rendered as dead, non-clickable text. Project a COPY for the manifest; the working model's
    // raw refs stay canonical (loadLibrary doesn't round-trip sections, so this can't corrupt an
    // Open-zip reload). Broken refs degrade to plain text and report under the section id (no logicalId).
    if (manifestExhibit.sections?.some((s) => s.prose?.includes("archie:"))) {
      manifestExhibit = {
        ...manifestExhibit,
        sections: manifestExhibit.sections.map((s) => {
          if (s.prose === undefined || !s.prose.includes("archie:")) return s;
          const { md, broken } = rewriteArchieLinks(s.prose, rw);
          for (const t of broken) brokenLinks.push({ exhibitSlug: exhibit.slug, logicalId: s.id, target: t });
          return md === s.prose ? s : { ...s, prose: md };
        }),
      };
    }
    // Build the bare manifest, then EMBED each canvas's heads items inline into its annotations entries
    // (below) before writing it — a pure IIIF viewer / portable zip can't dereference a bare reference
    // off a placeholder or blob: origin. The per-canvas loop COLLECTS the inline content keyed by page id
    // into `embeds`; `embedHeadsIntoManifest` folds them in afterward as a pure transform (no in-place
    // mutation of the manifest — the byte contract is pinned by publish/voynich-readings.test.ts).
    const bareManifest = toManifest(manifestExhibit, { baseUrl });
    for (const ic of findCanvasesMissingDimensions(bareManifest)) {
      incompleteCanvases.push({ exhibitSlug: exhibit.slug, canvasId: ic.canvasId, label: ic.label });
    }
    const embeds = new Map<string, HeadsEmbed>();

    // Opt-in: publish preserved ORIGINALS for citation (CONTEXT §89.1). Written beside the tree at
    // {slug}/assets-original/{name}; NOT referenced by any canvas (the display master is) — a citation
    // sidecar a scholar can dereference. Only objects carrying an `originalName` (an EXIF-baked import).
    if (runAssets && opts.getOriginal) {
      const withOriginals = exhibit.objects.filter((o) => o.originalName);
      if (withOriginals.length > 0) {
        const origDir = await exDir.getDirectory("assets-original", { create: true });
        for (const o of withOriginals) {
          const bytes = await opts.getOriginal(exhibit.slug, o.originalName!);
          if (!bytes) continue; // unavailable — skip rather than write an empty file
          const f = await origDir.getFile(o.originalName!, { create: true });
          const w = await f.writable();
          await w.write(bytes);
          await w.close();
        }
      }
    }

    const log = getLog(exhibit.id);
    const citeBase = `${baseUrl}${exhibit.slug}/annotations/`;
    const historyBaseAbs = `${baseUrl}${exhibit.slug}/annotations/history/`;
    const ids = citationIdMap(log, citeBase);

    // History sidecar (exhibit-level, per logicalId) — the reload/merge + citation target.
    const { index, pages } = toHistory(log, { baseUrl: citeBase, historyBase: historyBaseAbs });
    const histDir = await (await exDir.getDirectory("annotations", { create: true })).getDirectory("history", { create: true });
    await writeJson(histDir, "index.json", index);
    // History pages are independent files under histDir (each a distinct {logicalId}.json); fan out under
    // the bounded pool. Ordering vs index.json is unchanged — index.json is written above, before the pool.
    await mapLimit(Object.entries(pages), PUBLISH_CONCURRENCY, async ([logicalId, page]) => {
      await writeJson(histDir, `${logicalId}.json`, page);
    });

    // Structure rev-log sidecar (Archie-aef4): {slug}/structure/history/ beside the annotation
    // history — the exchange leg that makes the import merge (mergeImportedStructure) reachable
    // from an Archie-produced zip/folder. Same writer the studio store uses (writeStructure:
    // pages first, index LAST — rule #1), and the whole emission sits inside the exhibit loop,
    // well before the archie.json commit point at the end of this function (the global
    // marker-LAST ordering contract is untouched). Emitted ONLY when the exhibit HAS a log —
    // see PublishOptions.getStructure for the existence-not-flag posture and the no-log
    // byte-identical pin.
    if (opts.getStructure) {
      const structLog = await opts.getStructure(exhibit.id, exhibit.slug);
      if (structLog.length > 0) {
        await writeStructure(await exDir.getDirectory("structure", { create: true }), structLog);
      }
    }

    // Per-canvas heads pages — grouped by the canvas (target.source) they annotate, at the path
    // the manifest references: {slug}/canvas/{objId}/annotations.json.
    // REBASE BEFORE GROUPING. The filter below is exact canvas-IRI equality against `baseUrl`, so a
    // log authored at another origin (a Studio library on WORKING_IRI_BASE, a loaded tree being
    // re-published elsewhere) would match nothing and drop every note with a healthy-looking publish.
    // `rebaseCanvasId` re-mints only IRIs that provably denote this exhibit's own canvases.
    const objectIds = new Set<string>(exhibit.objects.map((o) => o.id));
    const isObjectId = (id: string) => objectIds.has(id);
    const heads = projectHeads(log).map((h) => rebaseHeadTarget(h, baseUrl, exhibit.slug, isObjectId));
    const canvasDir = await exDir.getDirectory("canvas", { create: true });
    const readings = exhibit.readings ?? [];
    const collId = (rid: string) => `${baseUrl}${exhibit.slug}/annotations/readings/${rid}.json`;
    // ADR-0007: one IIIF AnnotationCollection per Reading (the partOf target the reading-pages cite).
    if (readings.length > 0) {
      // Archie-viewer convenience index (the legend reads this); pure IIIF consumers use the
      // AnnotationCollections below instead. Three-tier, like exhibits.json for the Gallery.
      await writeJson(exDir, "readings.json", readings);
      const rdDir = await (await exDir.getDirectory("annotations", { create: true })).getDirectory("readings", { create: true });
      // One AnnotationCollection per Reading — independent {rid}.json files (readings.json written above); fan out.
      await mapLimit(readings, PUBLISH_CONCURRENCY, async (r) => {
        await writeJson(rdDir, `${r.id}.json`, toReadingCollection(r, collId(r.id)));
      });
    }
    // Narrative spine as a WADM AnnotationCollection (ADR-0017): each Section ALSO serialized as a
    // `supplementing` annotation, so pure-WADM/IIIF annotation tools (which read AnnotationPages, NOT IIIF
    // Ranges) can consume the narrative. The Range in structures[] stays canonical — Archie reads that — and
    // each Range links here via `supplementary`. The section-annotations omit the archie DAG fields, so
    // loadLibrary's importer ignores them (no double-count with the Range round-trip). Uses manifestExhibit
    // so the prose body gets the same archie:-link rewrite the Range summaries do (above).
    const narrativeColl = sectionsToAnnotationCollection(manifestExhibit, { baseUrl });
    if (narrativeColl) {
      const annoDir = await exDir.getDirectory("annotations", { create: true });
      await writeJson(annoDir, "narrative.json", narrativeColl);
    }
    // PERF: per-object pages are independent — each writes its OWN {slug}/canvas/{objId}/ dir and
    // records its OWN `embeds` entries (distinct page ids), so fan them out instead of a per-object
    // waterfall (the multi-object projection cost the live viewer pays at boot). Kept to one exhibit's
    // objects at a time (the per-exhibit loop stays serial) to cap concurrent fs handles on the
    // FSA/OPFS backend. Safe on every backend: every write targets a DISTINCT path, Memory/Zip mutate
    // their shared Map only on distinct keys with no await between check and set, and `brokenLinks.push`
    // / distinct-key `embeds.set` are atomic on the single JS thread.
    await Promise.all(exhibit.objects.map(async (obj) => {
      const canvasId = `${baseUrl}${exhibit.slug}/canvas/${obj.id}`;
      const objDir = await canvasDir.getDirectory(obj.id, { create: true });
      // Resolve in-body `archie:` links on the consumer projection only (history stays canonical).
      const projected = heads.filter((h) => targetSource(h) === canvasId).map((h) => rewriteHeadBodies(h, exhibit.slug, rw, brokenLinks));
      const fileFor = (r: string | undefined) => (r === undefined ? "annotations.json" : `annotations-${r}.json`);
      const pageId = (r: string | undefined) => `${canvasId}/${fileFor(r)}`;
      const opts = { historyBase: historyBaseAbs };
      const partition = new Map(headsPagesByReading(projected, ids, pageId, collId, opts).map((p) => [p.reading, p.page]));
      // Record the page's items as the manifest's matching annotations-entry embed (so a pure IIIF
      // viewer renders inline, no fetch/CORS) AND write the standalone sidecar file (citation target).
      const record = (page: W3CAnnotationPage, extra: Pick<HeadsEmbed, "label" | "summary"> = {}) => {
        embeds.set(page.id, {
          items: page.items,
          ...(Array.isArray(page.partOf) ? { partOf: page.partOf as Array<{ id: string; type: "AnnotationCollection" }> } : {}),
          ...extra,
        });
      };
      // Base page — always written (the manifest lists it unconditionally). A "Base" label only when the
      // exhibit has Readings (so the viewer can name the always-on toggle alongside the reading toggles).
      const basePage = partition.get(undefined) ?? headsPageFromRecords([], pageId(undefined), ids, opts);
      record(basePage, readings.length > 0 ? { label: langMap("Base") } : {});
      await writeJson(objDir, "annotations.json", basePage);
      // One page per REGISTRY reading — empty (with partOf) if this canvas has no notes for it,
      // so every `Canvas.annotations` entry the manifest lists has real (possibly empty) inline items.
      // Name the page inline (label/summary from the Reading) so a viewer can label the toggle and
      // group by `partOf` WITHOUT dereferencing the AnnotationCollection at a placeholder/host origin.
      for (const r of readings) {
        const page = partition.get(r.id) ?? Object.assign(headsPageFromRecords([], pageId(r.id), ids, opts), { partOf: [{ id: collId(r.id), type: "AnnotationCollection" }] });
        record(page, { label: langMap(r.name), ...(r.description ? { summary: langMap(r.description) } : {}) });
        await writeJson(objDir, fileFor(r.id), page);
      }
    }));
    // Fold the collected inline content into the manifest (pure transform), then write it.
    const manifest = embedHeadsIntoManifest(bareManifest, embeds);
    await writeJson(exDir, "manifest.json", manifest);

    // Static archival page (ADR-0014): the FULL heads projection's note texts with per-note
    // anchors — the durable ref `{slug}/index.html#note-<logicalId>`. Bodies get the same
    // archie:-link rewrite the JSON heads pages get; the throwaway sink keeps the brokenLinks
    // advisory counts identical to the JSON path (canvas-matched refs already reported above).
    const htmlRecords = heads.map((h) => rewriteHeadBodies(h, exhibit.slug, rw, []));
    // `manifestExhibit`, NOT `exhibit` (Archie-5a15). The static page emits schema.org ImageObject
    // `contentUrl` and resolves its og:image from `objects[].source`; the working model still holds
    // the pre-publish path, so the shipped page advertised `/assets/01KX….JPG` — a URL that exists
    // only in the author's OPFS. `manifestExhibit` is the same exhibit with the published asset
    // triple (source / tileSource / thumbnail) already substituted, which is exactly what the
    // manifest one line above is built from; the page and the manifest now agree by construction.
    // Its `sections` also carry the resolved `archie:` cites, so section prose on the archival page
    // stops shipping raw refs. Everything else the page reads (title, summary, rights,
    // requiredStatement, readings, object labels and ids) is copied through untouched.
    // The note biography (Archie-a1d4): the SAME grouping the history sidecar above was built from,
    // so a rendered "v2" and the citation id minted for v2 cannot disagree.
    const historyByLogical = recordsByLogicalId(log);
    await writeText(exDir, "index.html", exhibitPageHtml(manifestExhibit, htmlRecords, { baseUrl, history: historyByLogical, ...(opts.viewerBase !== undefined ? { viewerBase: opts.viewerBase } : {}), ...(opts.renderBody !== undefined ? { renderBody: opts.renderBody } : {}), ...(opts.publishedAt !== undefined ? { publishedAt: opts.publishedAt } : {}) }));
  });
  // Library landing + sitemap (ADR-0014): the human/crawler entry the data repo never had.
  await writeText(root, "index.html", libraryPageHtml(library, { baseUrl, ...(opts.viewerBase !== undefined ? { viewerBase: opts.viewerBase } : {}), ...(opts.publishedAt !== undefined ? { publishedAt: opts.publishedAt } : {}) }));
  // Crawler sitemaps: keep sitemap.txt (the simple, already-cited surface) AND add the standard
  // sitemap.xml (sitemaps.org 0.9) so search engines ingest it directly with <lastmod> (Q-8).
  // CITATION.cff (Archie-321c): the file GitHub's "Cite this repository" widget reads, and the one a
  // data-repo depositor is asked for. Written ONLY when the library records a creator — CFF 1.2.0
  // makes `authors` required, so a creator-less library cannot produce a VALID file, and an invalid
  // one is worse than none: it teaches every downstream tool a wrong fact with the repo's authority
  // behind it. `citationCff` returns undefined in that case; no file, no stub.
  const cff = citationCff({ title: library.title ?? "Library", url: baseUrl, rights: library, id: String(library.id), type: "webpage" });
  if (cff) await writeText(root, "CITATION.cff", cff);
  await writeText(root, "sitemap.txt", sitemapTxt(library, baseUrl));
  await writeText(root, "sitemap.xml", sitemapXml(library, baseUrl, opts.publishedAt));
  // Library-level image index (ADR-0023, spike-0004): a cheap always-rewritten projection like
  // exhibits.json — built by reading the just-written / prior manifests, so it stays correct on both full
  // and incremental publishes. Exempt from dirty-tracking; the Viewer Gallery wall reads this one file.
  const imageIndex = stamp(await buildImageIndex(fs, library));
  await writeJson(root, "images.json", imageIndex);

  // ADR-0020 marker — written LAST = the publish COMMIT POINT (Issue 25b). `generation` (Issue 24) is
  // app-supplied or derived deterministically from the two library-level projections (so an incremental
  // publish and a full republish of identical content stamp the SAME generation — the byte-stable
  // contract), folding in `publishedAt` so each real timestamped publish is unique (busts caches on any
  // republish, note-only included). The Viewer keys hosted fetches on `?g=<generation>`.
  const generation = opts.generation ?? generationHash(JSON.stringify(exhibitsJson) + "\u0000" + JSON.stringify(imageIndex) + "\u0000" + (opts.publishedAt ?? ""));
  await writeJson(root, "archie.json", { ...ARCHIE_LIBRARY_MARKER, generation });
  return { brokenLinks, incompleteCanvases, missingAssets };
}

/** A tiny, dependency-free stable string hash (djb2) → base36 — the default publish-generation id when
 *  none is app-supplied. Deterministic (same input → same id) so byte-stable republishes stay byte-stable;
 *  not cryptographic (it identifies a generation, it doesn't authenticate — ADR-0020's marker stance). */
function generationHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Assemble the whole site into an in-memory ZipFilesystem (the EAGER publish primitive): the tree
 *  fully materializes, then `fs.toZip()` serializes it — the non-Chromium fallback, size-guarded by
 *  the caller. Bounded-memory export goes through `ZipStreamFilesystem` (fs/zip-stream.ts) instead:
 *  publish straight into the streaming sink, skipping this function entirely. */
export async function libraryToZipFs(library: Library, getLog: LogLookup, opts: PublishOptions = {}): Promise<{ fs: ZipFilesystem } & PublishResult> {
  const fs = new ZipFilesystem();
  const result = await publishLibrary(fs, library, getLog, opts);
  return { fs, ...result };
}

/** Assemble the whole site into a `.archie.zip` (eager: builds the entire archive in memory). */
export async function libraryToZip(library: Library, getLog: LogLookup, opts: PublishOptions = {}): Promise<{ zip: Uint8Array } & PublishResult> {
  const { fs, ...result } = await libraryToZipFs(library, getLog, opts);
  return { zip: fs.toZip(), ...result };
}

export interface LoadedLibrary {
  library: Library;
  /** Reloaded annotation log per exhibit slug. */
  logs: Record<string, AnnotationLog>;
}

/** Invert the publish-time asset rewrite (the `runAssets` pass above): a source published as
 *  `{base}{slug}/assets/{name}` becomes the working form `/assets/{name}` again, and the
 *  publish-DERIVED projections riding on it (the DZI pyramid at `{base}{slug}/…_files`, the baked
 *  `{base}{slug}/assets-thumb/…` thumbnail) are dropped so the next publish re-derives them —
 *  otherwise a re-publish sees no ASSET_PREFIX match, copies no bytes, and silently emits an
 *  assetless zip whose manifests still reference the images (the 2026-07-19 round-trip data loss).
 *  The exhibit's baked base comes from the manifest's own `id` (`{base}{slug}/manifest.json`), so
 *  recovery works for whatever origin the zip was baked against — but ONLY when the bytes are
 *  actually in the tree: rewriting without them would turn a still-working absolute URL into a
 *  dead relative pointer (the defective-export shape). */
async function recoverAssetSources(objects: AObject[], manifestId: string, exDir: FsDirectory): Promise<AObject[]> {
  const MARK = "manifest.json";
  if (!manifestId.endsWith(`/${MARK}`)) return objects; // not a publishLibrary-shaped id — nothing to invert
  const exhibitBase = manifestId.slice(0, -MARK.length); // `{base}{slug}/`
  const assetBase = `${exhibitBase}assets/`;
  if (!objects.some((o) => o.source.startsWith(assetBase))) return objects;
  let assetsDir: FsDirectory;
  try {
    assetsDir = await exDir.getDirectory("assets");
  } catch {
    return objects; // no asset bytes in this tree at all — leave every source absolute
  }
  return Promise.all(objects.map(async (o) => {
    if (!o.source.startsWith(assetBase)) return o;
    const name = o.source.slice(assetBase.length);
    if (name.length === 0 || name.includes("/")) return o; // not the direct-child shape publish writes
    try {
      await assetsDir.getFile(name);
    } catch {
      return o; // these bytes are missing — keep the absolute source rather than dangle
    }
    const next: AObject = { ...o, source: `/assets/${name}` };
    if (next.tileSource?.kind === "dzi" && next.tileSource.filesPath.startsWith(exhibitBase)) delete next.tileSource;
    if (next.thumbnail !== undefined && next.thumbnail.startsWith(`${exhibitBase}assets-thumb/`)) delete next.thumbnail;
    return next;
  }));
}

/**
 * Inverse of publishLibrary: reconstruct the Library + per-exhibit logs from a published site
 * tree (exhibits.json + per-exhibit manifest + the history sidecar). Exhibit ids are recovered
 * as slugs (the internal id is not published). Completes the publish↔load symmetry.
 */
export async function loadLibrary(fs: Filesystem): Promise<LoadedLibrary> {
  const root = await fs.root();
  const src = fsJsonSource(fs);
  const ex = await src.get<ExhibitsJson>("exhibits.json");
  const cards = [...ex.exhibits].sort((a, b) => a.order - b.order);
  const exhibits: Exhibit[] = [];
  const logs: Record<string, AnnotationLog> = {};
  for (const card of cards) {
    const exDir = await root.getDirectory(card.slug);
    const manifest = await src.get<IIIFManifest>(`${card.slug}/manifest.json`);
    logs[card.slug] = await readAnnotations(await exDir.getDirectory("annotations"));
    // Sections (narrative Ranges) and readings were NOT recovered here at all — a silent gap in the
    // publish↔load symmetry this function's own doc comment claims: a narrative exhibit's Ranges
    // vanished on any load→publish round trip (e.g. gen-published.mts regenerating a dropped zip),
    // and every reading-scoped note's per-reading annotation page went along with it (toCanvas gates
    // that split on the reading-id list). Confirmed missing via ISSUES.md Issue 9's showroom assembly.
    const sections = sectionsFromManifest(manifest);
    const readings = (await src.getOptional<Reading[]>(`${card.slug}/readings.json`)) ?? [];
    exhibits.push({
      id: asExhibitId(card.slug),
      slug: card.slug,
      title: card.title,
      objects: await recoverAssetSources(objectsFromManifest(manifest), manifest.id, exDir),
      ...(sections.length > 0 ? { sections } : {}),
      ...(readings.length > 0 ? { readings } : {}),
      ...(card.description !== undefined ? { summary: card.description } : {}),
      ...(card.cover !== undefined ? { cover: card.cover } : {}),
      ...(card.unlisted ? { unlisted: true } : {}), // the UNLISTED lever round-trips via the card (Archie-77b2)
      ...rightsFromIIIF(manifest), // exhibit-level credit/license round-trips via the manifest
    });
  }
  const library: Library = {
    id: asLibraryId(ex.library.id),
    exhibits,
    ...(ex.library.title !== undefined ? { title: ex.library.title } : {}),
    ...(ex.library.summary !== undefined ? { summary: ex.library.summary } : {}),
    // Library-level credit/license round-trips via exhibits.json (the friendly model shape lives there).
    ...(ex.library.rights !== undefined ? { rights: ex.library.rights } : {}),
    ...(ex.library.requiredStatement !== undefined ? { requiredStatement: ex.library.requiredStatement } : {}),
    // Library-level descriptive metadata rides the same mirror — sanitized (a published tree is an
    // untrusted read boundary; skip malformed entries per-item, never throw).
    ...(() => { const md = sanitizeMetadataEntries(ex.library.metadata); return md ? { metadata: md } : {}; })(),
  };
  return { library, logs };
}

/** One published exhibit read from a Filesystem (the in-memory PREVIEW shape). Carries the
 *  exhibit-level `RightsFields` (credit/license) recovered from the manifest, for the Viewer's
 *  per-exhibit credit line; per-object rights ride on each `objects[]` entry. */
export interface PublishedExhibitData extends RightsFields {
  slug: string;
  title: string;
  summary?: string;
  objects: AObject[];
  /** Published head notes per object id (the per-canvas heads-page items). */
  annotationsByObject: Record<string, W3CAnnotation[]>;
  /** Narrative spine recovered from the manifest's Ranges (empty for non-narrative exhibits). */
  sections: Section[];
  /** Object id → full canvas IRI from the manifest. */
  canvasIdByObject: Record<string, string>;
  /** Issue 23: set `true` when an OPTIONAL authored layer (readings, a base/per-reading annotation sidecar)
   *  FAILED to load (5xx / torn JSON) — as opposed to being genuinely absent. The exhibit still renders
   *  (that layer degraded to empty), but the Viewer surfaces a visible "some notes couldn't load" indicator
   *  so a transient failure is never mistaken for a complete exhibit. Omitted when the read was clean. */
  incomplete?: boolean;
}

/**
 * Read ONE published exhibit from a Filesystem — the in-memory PREVIEW path (CONTEXT §"Local view
 * loop": Preview renders the published projection, so what you preview == what publishes). Mirrors
 * the Viewer's HTTP loadPublishedExhibit, but over the Filesystem seam: Studio runs publishLibrary
 * into a MemoryFilesystem, then reads it back here — NO fetch, NO second app.
 */
export async function readPublishedExhibit(fs: Filesystem, slug: string): Promise<PortableExhibit> {
  // Thin adapter over the shared reader (the domino); preview is the fs source, no transform.
  return readExhibitTree(fsJsonSource(fs), slug);
}

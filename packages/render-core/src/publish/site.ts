// Publish primitive (CONTEXT: "Publish = zip-primitive + per-host adapters"). Assemble the
// whole published-site DATA tree through the Filesystem seam:
//   collection.json · exhibits.json
//   {slug}/manifest.json
//   {slug}/canvas/{objId}/annotations.json   — PER-CANVAS heads page (what the manifest links to)
//   {slug}/annotations/history/{logicalId}.json + index.json   — history sidecar (reload/merge)
// The zip is the architectural primitive; the GH-Pages Contents-API adapter (~200 LOC, network)
// is a thin browser layer over the resulting tree. Viewer HTML/JS/CSS are layered on by the app
// build (Astro) — out of this pure core.

import type { Filesystem, FsDirectory } from "../fs/seam.js";
import { ZipFilesystem } from "../fs/zip.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog, AnnotationRecord, W3CAnnotation, W3CAnnotationPage } from "../wadm/types.js";
import { buildLinkIndex, resolveViewerLink, validateLink, rewriteArchieLinks, type LinkTarget } from "../link/link.js";
import { toCollection } from "../iiif/collection.js";
import { toExhibitsJson, toReadingCollection, type ExhibitsJson } from "../iiif/exhibits.js";
import { toManifest, objectsFromManifest, canvasIdMap, sectionsFromManifest, sectionsToAnnotationCollection, embedHeadsIntoManifest, type HeadsEmbed } from "../iiif/manifest.js";
import { rightsFromIIIF } from "../iiif/rights.js";
import { langMap, type IIIFManifest, type LangMap } from "../iiif/presentation.js";
import type { Exhibit, AObject, Section, RightsFields } from "../model/model.js";
import type { PortableExhibit } from "./portable.js"; // type-only (erased) — the readings superset; type-cycle is harmless
import { readExhibitTree, fsJsonSource } from "./read.js";
import { libraryPageHtml, exhibitPageHtml, sitemapTxt } from "./static-pages.js";
import { readAnnotations } from "../spine/persist.js";
import { toHistory } from "../spine/serialize.js";
import { projectHeads } from "../spine/heads.js";
import { headsPageFromRecords, headsPagesByReading, citationIdMap, targetSource } from "../spine/serialize.js";
import { stamp } from "../migrate/migrate.js";

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
}

const ASSET_PREFIX = "/assets/";

/** Look up the annotation log for an Exhibit (by Exhibit id). */
export type LogLookup = (exhibitId: string) => AnnotationLog;

/** An in-body `archie:` link whose target didn't resolve in the Library at publish time. */
export interface BrokenLink {
  exhibitSlug: string;
  logicalId: string;
  target: LinkTarget;
}

/** What publishLibrary reports back — currently the broken intra-Library links it degraded. */
export interface PublishResult {
  brokenLinks: BrokenLink[];
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

/**
 * Write the full published-site data tree into `fs`. Per-canvas heads pages are written at the
 * exact paths the Manifest's `canvas.annotations[].id` reference (the Phase-2 interop gate);
 * history is exhibit-level (per-logicalId). Pure idempotent projection of the Library + its logs.
 */
export async function publishLibrary(fs: Filesystem, library: Library, getLog: LogLookup, opts: PublishOptions = {}): Promise<PublishResult> {
  const baseUrl = opts.baseUrl ?? "";
  const root = await fs.root();
  await writeJson(root, "collection.json", toCollection(library, { baseUrl }));
  // Stamp the Gallery source with the schema version so it stays migratable (orphan gap §39).
  await writeJson(root, "exhibits.json", stamp(toExhibitsJson(library)));

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

  for (const exhibit of library.exhibits) {
    const exDir = await root.getDirectory(exhibit.slug, { create: true });

    // Imported-asset objects (source "/assets/{name}"): write the bytes into the published tree at
    // {slug}/assets/{name} and rewrite the canvas image URL to that published path. The annotation
    // log targets canvas IRIs (by obj.id), NOT the image source, so heads grouping is unaffected.
    let manifestExhibit = exhibit;
    if (opts.getAsset && exhibit.objects.some((o) => o.source.startsWith(ASSET_PREFIX))) {
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
          if (!bytes) return o; // bytes unavailable — leave source as-is rather than dangling
          const f = await assetsDir.getFile(name, { create: true });
          const w = await f.writable();
          await w.write(bytes);
          await w.close();
          const next: AObject = { ...o, source: `${baseUrl}${exhibit.slug}/assets/${name}` };
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
    const embeds = new Map<string, HeadsEmbed>();

    // Opt-in: publish preserved ORIGINALS for citation (CONTEXT §89.1). Written beside the tree at
    // {slug}/assets-original/{name}; NOT referenced by any canvas (the display master is) — a citation
    // sidecar a scholar can dereference. Only objects carrying an `originalName` (an EXIF-baked import).
    if (opts.getOriginal) {
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
    for (const [logicalId, page] of Object.entries(pages)) await writeJson(histDir, `${logicalId}.json`, page);

    // Per-canvas heads pages — grouped by the canvas (target.source) they annotate, at the path
    // the manifest references: {slug}/canvas/{objId}/annotations.json.
    const heads = projectHeads(log);
    const canvasDir = await exDir.getDirectory("canvas", { create: true });
    const readings = exhibit.readings ?? [];
    const collId = (rid: string) => `${baseUrl}${exhibit.slug}/annotations/readings/${rid}.json`;
    // ADR-0007: one IIIF AnnotationCollection per Reading (the partOf target the reading-pages cite).
    if (readings.length > 0) {
      // Archie-viewer convenience index (the legend reads this); pure IIIF consumers use the
      // AnnotationCollections below instead. Three-tier, like exhibits.json for the Gallery.
      await writeJson(exDir, "readings.json", readings);
      const rdDir = await (await exDir.getDirectory("annotations", { create: true })).getDirectory("readings", { create: true });
      for (const r of readings) {
        await writeJson(rdDir, `${r.id}.json`, toReadingCollection(r, collId(r.id)));
      }
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
    await writeText(exDir, "index.html", exhibitPageHtml(exhibit, htmlRecords, { baseUrl, ...(opts.viewerBase !== undefined ? { viewerBase: opts.viewerBase } : {}), ...(opts.renderBody !== undefined ? { renderBody: opts.renderBody } : {}) }));
  }
  // Library landing + sitemap (ADR-0014): the human/crawler entry the data repo never had.
  await writeText(root, "index.html", libraryPageHtml(library, { baseUrl, ...(opts.viewerBase !== undefined ? { viewerBase: opts.viewerBase } : {}) }));
  await writeText(root, "sitemap.txt", sitemapTxt(library, baseUrl));
  return { brokenLinks };
}

/** Assemble the whole site into an in-memory ZipFilesystem (the architectural publish primitive),
 *  WITHOUT serializing — the caller chooses `fs.toZip()` (eager) or `fs.streamZip(sink)` (A.1, stream
 *  straight to a disk handle so the archive never fully materializes). */
export async function libraryToZipFs(library: Library, getLog: LogLookup, opts: PublishOptions = {}): Promise<{ fs: ZipFilesystem; brokenLinks: BrokenLink[] }> {
  const fs = new ZipFilesystem();
  const { brokenLinks } = await publishLibrary(fs, library, getLog, opts);
  return { fs, brokenLinks };
}

/** Assemble the whole site into a `.archie.zip` (eager: builds the entire archive in memory). */
export async function libraryToZip(library: Library, getLog: LogLookup, opts: PublishOptions = {}): Promise<{ zip: Uint8Array; brokenLinks: BrokenLink[] }> {
  const { fs, brokenLinks } = await libraryToZipFs(library, getLog, opts);
  return { zip: fs.toZip(), brokenLinks };
}

export interface LoadedLibrary {
  library: Library;
  /** Reloaded annotation log per exhibit slug. */
  logs: Record<string, AnnotationLog>;
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
    exhibits.push({
      id: card.slug,
      slug: card.slug,
      title: card.title,
      objects: objectsFromManifest(manifest),
      ...(card.description !== undefined ? { summary: card.description } : {}),
      ...(card.cover !== undefined ? { cover: card.cover } : {}),
      ...rightsFromIIIF(manifest), // exhibit-level credit/license round-trips via the manifest
    });
  }
  const library: Library = {
    id: ex.library.id,
    exhibits,
    ...(ex.library.title !== undefined ? { title: ex.library.title } : {}),
    ...(ex.library.summary !== undefined ? { summary: ex.library.summary } : {}),
    // Library-level credit/license round-trips via exhibits.json (the friendly model shape lives there).
    ...(ex.library.rights !== undefined ? { rights: ex.library.rights } : {}),
    ...(ex.library.requiredStatement !== undefined ? { requiredStatement: ex.library.requiredStatement } : {}),
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

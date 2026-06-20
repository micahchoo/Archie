// The WORKING-STORE read seam (Q-3 archie-persistence): read the Studio's working copy — the
// project layout the Studio persists (OPFS unbound / FSA folder) — back through the Filesystem
// seam, so any same-origin app can consume the author's library WITHOUT a publish step. The
// Viewer's live source is the consumer: one canonical store, two apps; `publishLibrary` (site.ts)
// stays the durability projection ("on the web, citable"), this is the live read ("only you can
// see this, in this browser").
//
// Layout (mirrors apps/studio/src/store.ts, the writer — core owns the FORMAT knowledge now):
//   {project}/library.json                       — authored structure (WorkingLibraryMeta)
//   {project}/annotations/                       — the "sample" exhibit's annotations (LEGACY
//                                                   pre-multi-exhibit location, kept by the writer)
//   {project}/exhibits/{slug}/annotations/       — every OTHER exhibit's annotations
//   {project}/exhibits/{slug}/assets/{name}      — imported display masters
import type { Filesystem, FsDirectory } from "../fs/seam.js";
import type { Library, Section, Reading, RightsFields, MediaType, LayoutType } from "../model/model.js";
import type { TileSourceDescriptor } from "../iiif/resolve.js";
import type { OrientationTransform } from "../exif/orientation.js";
import type { AnnotationLog } from "../wadm/types.js";
import type { ClientId } from "../wadm/brand.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import { AnnotationSession } from "../session/session.js";

/** The Studio's working-store root directory name (one project per origin in v1). */
export const WORKING_PROJECT = "archie-demo-project";

/**
 * The working-store IRI namespace — the base Studio mints canvas / annotation-target IRIs against
 * (`{WORKING_IRI_BASE}{slug}/canvas/{id}`), and the SAME base the Viewer's live source MUST project
 * with (`initLiveSource`): `publishLibrary` groups heads by `targetSource === {baseUrl}{slug}/canvas/{id}`,
 * so a mismatch silently drops EVERY live annotation. This is an internal IDENTIFIER namespace only —
 * never fetched, never published; the published tree uses the real deploy origin (archie.config.json,
 * `published-base.ts`). DISTINCT from the published base on purpose — shared here so the Studio writer
 * and the live reader are one source of truth and can't drift (they were equal-by-coincidence before).
 */
export const WORKING_IRI_BASE = "https://archie.demo/";

/** Same-origin BroadcastChannel the Studio posts to when the working library's structure changes
 *  (exhibit added/removed), so the Viewer's live source can refresh WITHOUT a reload. Shared name so
 *  writer (Studio) and listener (Viewer) agree. Message shape: `{ type: "library-changed" }`. */
export const LIVE_CHANNEL = "archie:live";
const SAMPLE_SLUG = "sample"; // its annotations live at the LEGACY {project}/annotations/ path

/** EXIF display-master provenance (CONTEXT §89.1): the original is preserved, this records the
 *  transform that produced the upright master `source` points at. Absent for non-baked imports. */
export interface WorkingObjectProvenance {
  /** EXIF Orientation (2..8) read from the original. */
  exifOrientation: number;
  /** The geometric transform baked into the display master. */
  transform: OrientationTransform;
  /** The preserved-original file name in the exhibit's `assets-original/` dir. */
  originalName: string;
}

/** A persisted object (authored structure). Carries `RightsFields` (per-object credit/license). */
export interface WorkingObjectMeta extends RightsFields {
  id: string;
  source: string;
  label: string;
  /** Optional description/caption — projects to the Canvas `summary`. */
  summary?: string;
  width?: number;
  height?: number;
  /** Media kind — "image" (default, OSD) vs "sound"/"video" (the temporal AvEditor). */
  mediaType?: MediaType;
  /** Seconds — for sound/video objects. */
  duration?: number;
  /** Geo-annotation extension (DESIGN.md): when set, this object is a slippy-map basemap — mounted as a
   *  bounded OSD pixel raster, geo-annotated with pins/regions. The explicit classification hint (a
   *  `{z}/{x}/{y}` template can't be inferred from `source`; DESIGN.md R1). Absent for normal media. */
  tileSource?: TileSourceDescriptor;
  /** Baked sized thumbnail path `/assets-thumb/{name}` (grid-overview load perf) — set at Studio import
   *  for an imported raster; the publish projection copies its bytes and rewrites it to the published URL. */
  thumbnail?: string;
  provenance?: WorkingObjectProvenance;
}

/** A persisted exhibit (authored structure). Carries `RightsFields` (exhibit-level credit/license). */
export interface WorkingExhibitMeta extends RightsFields {
  id: string;
  slug: string;
  title: string;
  /** Optional exhibit description — projects to the Manifest `summary`. */
  summary?: string;
  /** @deprecated (ADR-0016) The leading surface is now a pure function of content — `resolveLayout`
   *  always DERIVES the type and IGNORES this field. Kept OPTIONAL only for read-tolerance of legacy
   *  stored data (harmless when present); the Studio MUST NOT write it. Remove once no stored exhibit
   *  carries it. */
  layout?: LayoutType;
  /** RESERVED (§43 reading-MODE axis) — v1.1 pacing variant. Unused in v1. */
  mode?: string;
  objects: WorkingObjectMeta[];
  /** Ordered narrative sections (the authored spine; IIIF Ranges at publish). */
  sections?: Section[];
  /** The exhibit's curated Readings (interpretive passes; ADR-0007). */
  readings?: Reading[];
  /** Bundled defaults only — forking ("Keep a copy") strips it, so PRESENCE marks an EXAMPLE. */
  seedVersion?: number;
}

/** The authored library structure persisted at `{project}/library.json`. */
export interface WorkingLibraryMeta extends RightsFields {
  title?: string;
  summary?: string;
  exhibits: WorkingExhibitMeta[];
}

/** Spread the present `RightsFields` (credit/license) off a working meta — every level of the
 *  mapping projects its authored rights. */
const rightsOf = (m: RightsFields): RightsFields =>
  ({ ...(m.rights ? { rights: m.rights } : {}), ...(m.requiredStatement ? { requiredStatement: m.requiredStatement } : {}) });

/** Is this persisted exhibit a bundled EXAMPLE (a Playground template, mx-6c5c48)? Bundled defaults
 *  carry `seedVersion`; "Keep a copy" strips it (App.svelte fork) — so presence is the cold signal
 *  available to a reader WITHOUT the Studio's runtime template set. */
export const isBundledExample = (ex: WorkingExhibitMeta): boolean => ex.seedVersion !== undefined;

export interface WorkingToLibraryOptions {
  /** Library id for the projection. Default "demo" (what the Studio's publish projection uses). */
  id?: string;
  /** Title when the author hasn't named the library. */
  fallbackTitle?: string;
  /** Include bundled EXAMPLE exhibits (a populated demo publish). Default false — a template is a
   *  Playground, not the author's content. */
  includeTemplates?: boolean;
  /** Override the template test (the Studio passes its live `templateSlugs` set, which can RELEASE
   *  a reclaimed sunset slug back to the user). Default: `isBundledExample`. */
  isTemplate?: (ex: WorkingExhibitMeta) => boolean;
}

/** Map the persisted working structure to the publishable `Library` (the pure half of the Studio's
 *  `buildFullLibrary`, extracted so the Viewer's live source and the Studio cannot drift). */
export function workingToLibrary(meta: WorkingLibraryMeta, opts: WorkingToLibraryOptions = {}): Library {
  const isTemplate = opts.isTemplate ?? isBundledExample;
  const source = opts.includeTemplates ? meta.exhibits : meta.exhibits.filter((ex) => !isTemplate(ex));
  const title = meta.title ?? opts.fallbackTitle;
  return {
    id: asLibraryId(opts.id ?? "demo"),
    ...(title !== undefined ? { title } : {}),
    ...(meta.summary ? { summary: meta.summary } : {}),
    ...rightsOf(meta),
    exhibits: source.map((ex) => ({
      id: asExhibitId(ex.id), slug: ex.slug, title: ex.title,
      ...(ex.summary ? { summary: ex.summary } : {}),
      ...(ex.layout ? { layout: ex.layout } : {}),
      ...(ex.mode ? { mode: ex.mode } : {}),
      ...(ex.sections && ex.sections.length ? { sections: ex.sections } : {}),
      ...(ex.readings && ex.readings.length ? { readings: ex.readings } : {}),
      ...rightsOf(ex),
      objects: ex.objects.map((o) => ({
        id: asObjectId(o.id), source: o.source, label: o.label,
        ...(o.summary ? { summary: o.summary } : {}),
        ...(o.width !== undefined ? { width: o.width } : {}),
        ...(o.height !== undefined ? { height: o.height } : {}),
        ...(o.mediaType ? { mediaType: o.mediaType } : {}),
        ...(o.tileSource ? { tileSource: o.tileSource } : {}),
        ...(o.duration !== undefined ? { duration: o.duration } : {}),
        ...(o.thumbnail ? { thumbnail: o.thumbnail } : {}),
        ...(o.provenance?.originalName ? { originalName: o.provenance.originalName } : {}),
        ...rightsOf(o),
      })),
    })),
  };
}

/**
 * The faithful inverse of {@link workingToLibrary}: map a publishable `Library` back to the persisted
 * working structure, mirroring `workingToLibrary`'s field set, its `rightsOf` helper, and its
 * `...(x !== undefined ? {x} : {})` style. Maps ONLY the round-trippable fields — replaces the ~8-field
 * hand-spread the studio inline version did. NB: `cover`/`seedVersion` are NOT carried (no `WorkingExhibitMeta`
 * cover slot; `seedVersion` is a template marker that does not round-trip), and `provenance` is NOT
 * reconstructed: `WorkingObjectProvenance` requires `exifOrientation`+`transform` which a `Library` object
 * lacks (`originalName` alone is insufficient), so a baked import's provenance does not survive this direction.
 */
export function libraryToWorking(library: Library): WorkingLibraryMeta {
  return {
    ...(library.title !== undefined ? { title: library.title } : {}),
    ...(library.summary !== undefined ? { summary: library.summary } : {}),
    ...rightsOf(library),
    exhibits: library.exhibits.map((ex) => ({
      id: ex.id, slug: ex.slug, title: ex.title,
      ...(ex.summary !== undefined ? { summary: ex.summary } : {}),
      ...(ex.layout !== undefined ? { layout: ex.layout } : {}),
      ...(ex.mode !== undefined ? { mode: ex.mode } : {}),
      ...(ex.sections && ex.sections.length ? { sections: ex.sections } : {}),
      ...(ex.readings && ex.readings.length ? { readings: ex.readings } : {}),
      ...rightsOf(ex),
      objects: ex.objects.map((o) => ({
        id: o.id, source: o.source, label: o.label,
        ...(o.summary !== undefined ? { summary: o.summary } : {}),
        ...(o.width !== undefined ? { width: o.width } : {}),
        ...(o.height !== undefined ? { height: o.height } : {}),
        ...(o.mediaType !== undefined ? { mediaType: o.mediaType } : {}),
        ...(o.tileSource !== undefined ? { tileSource: o.tileSource } : {}), // carry the Map basemap (the studio inline version dropped it)
        ...(o.duration !== undefined ? { duration: o.duration } : {}),
        ...(o.thumbnail !== undefined ? { thumbnail: o.thumbnail } : {}), // carry the baked-thumbnail ref
        ...rightsOf(o),
      })),
    })),
  };
}

export interface LoadWorkingOptions extends WorkingToLibraryOptions {
  /** Working-store root directory name. Default `WORKING_PROJECT`. */
  project?: string;
  /** Session identity for the log read (`AnnotationSession.load`). Read-only consumers keep the default. */
  editor?: ClientId;
}

/** A cold-read working library: everything `publishLibrary` needs to project it. */
export interface WorkingLibrary {
  /** The persisted structure as written (templates included). */
  meta: WorkingLibraryMeta;
  /** The publishable projection (templates excluded unless `includeTemplates`). */
  library: Library;
  /** Per-exhibit annotation logs keyed by EXHIBIT ID — the `publishLibrary` LogLookup key. */
  logs: Record<string, AnnotationLog>;
  getLog: (id: string) => AnnotationLog;
  /** Imported-asset bytes at `{project}/exhibits/{slug}/assets/{name}` — the publish getAsset. */
  getAsset: (slug: string, name: string) => Promise<ArrayBuffer | null>;
  /** Baked-thumbnail bytes at `{project}/exhibits/{slug}/assets-thumb/{name}` — the publish getThumbnail.
   *  Null when this object has no baked thumbnail (publishLibrary then drops the ref). */
  getThumbnail: (slug: string, name: string) => Promise<ArrayBuffer | null>;
}

async function readExhibitLog(projectDir: FsDirectory, slug: string, editor: ClientId): Promise<AnnotationLog> {
  try {
    const annDir = slug === SAMPLE_SLUG
      ? await projectDir.getDirectory("annotations")
      : await (await (await projectDir.getDirectory("exhibits")).getDirectory(slug)).getDirectory("annotations");
    return (await AnnotationSession.load(annDir, editor)).entries;
  } catch {
    return []; // nothing authored for this exhibit yet
  }
}

/**
 * Cold-read the working store off a `Filesystem` (OPFS via FsaFilesystem, an FSA folder, a
 * MemoryFilesystem in tests). Returns null when no working store exists — the caller's signal to
 * fall back to published sources. NEVER creates: a read must not materialize an empty store.
 */
export async function loadWorkingLibrary(fs: Filesystem, opts: LoadWorkingOptions = {}): Promise<WorkingLibrary | null> {
  let projectDir: FsDirectory;
  let meta: WorkingLibraryMeta;
  try {
    projectDir = await (await fs.root()).getDirectory(opts.project ?? WORKING_PROJECT);
    const file = await projectDir.getFile("library.json");
    meta = JSON.parse(new TextDecoder().decode(await file.readable())) as WorkingLibraryMeta;
  } catch {
    return null; // no working store here (first run / different browser / cross-origin)
  }
  const library = workingToLibrary(meta, opts);
  const editor = opts.editor ?? asClientId("working-reader");
  const logs: Record<string, AnnotationLog> = {};
  const included = new Set(library.exhibits.map((e) => e.id));
  for (const ex of meta.exhibits) {
    if (included.has(asExhibitId(ex.id))) logs[ex.id] = await readExhibitLog(projectDir, ex.slug, editor);
  }
  const getAsset = async (slug: string, name: string): Promise<ArrayBuffer | null> => {
    try {
      const dir = await (await (await projectDir.getDirectory("exhibits")).getDirectory(slug)).getDirectory("assets");
      return await (await dir.getFile(name)).readable();
    } catch {
      return null; // not an imported asset (external URL) — publishLibrary leaves the source as-is
    }
  };
  const getThumbnail = async (slug: string, name: string): Promise<ArrayBuffer | null> => {
    try {
      const dir = await (await (await projectDir.getDirectory("exhibits")).getDirectory(slug)).getDirectory("assets-thumb");
      return await (await dir.getFile(name)).readable();
    } catch {
      return null; // no baked thumbnail for this asset — publishLibrary drops the ref
    }
  };
  return { meta, library, logs, getLog: (id) => logs[id] ?? [], getAsset, getThumbnail };
}

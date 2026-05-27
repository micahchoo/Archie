// Read a Library/exhibit for the Viewer. TWO data sources behind ONE API (ADR-0008 / ADR-0010):
//  - HOSTED (default): fetch the published static tree over HTTP — the real deployed-consumer path
//    (`scripts/gen-published.mts` writes the tree to public/published/; a third party hitting the
//    GH-Pages site does exactly this).
//  - PORTABLE: read an opened `.archie.zip` (a `ZipFilesystem`) in-browser, embedded media → blob
//    URLs — entered via `openPortableLibrary(fs)`. The read itself is core's `loadPortableExhibit`
//    (ADR-0010 seam). Both sources return the SAME shapes, so ViewerShell/ExhibitView are source-agnostic.
import {
  objectsFromManifest, canvasIdMap, sectionsFromManifest, rightsFromIIIF,
  ZipFilesystem, loadPortableExhibit, loadPortableGallery,
  type ExhibitsJson, type Filesystem, type IIIFManifest, type PortableExhibit, type Reading, type W3CAnnotation,
} from "@render/core";

const PUBLISHED = `${import.meta.env.BASE_URL}published`;

/** The exhibit data components consume — UNIFIED with core's portable shape (ADR-0010) so the two
 *  read paths can never drift. (Was a duplicate interface; now one source of truth.) */
export type PublishedExhibit = PortableExhibit;

// --- portable source (ADR-0008 portable mode) -------------------------------------------------
// When a `.archie.zip` is opened, the Viewer reads from this Filesystem instead of HTTP. Module
// state keeps the existing loadGallery/loadPublishedExhibit signatures unchanged for consumers.
let portableFs: Filesystem | null = null;
let portableRevoke: (() => void) | null = null;

/** Enter portable mode, reading from `fs` (an opened `.archie.zip`). Frees any prior portable state. */
export function openPortableLibrary(fs: Filesystem): void {
  closePortableLibrary();
  portableFs = fs;
}

/** Leave portable mode (revokes the last exhibit's blob URLs). */
export function closePortableLibrary(): void {
  portableRevoke?.();
  portableRevoke = null;
  portableFs = null;
}

/** True when a `.archie.zip` is open (portable mode); hosted otherwise. */
export function isPortable(): boolean {
  return portableFs !== null;
}
// ----------------------------------------------------------------------------------------------

// --- mode detection (ADR-0008: auto-detect hosted vs portable by baked-tree presence) ---------
export type ViewerMode = "hosted" | "portable" | "error";

/** The outcome of probing for a baked published tree (`exhibits.json`). */
export type ModeProbe =
  | { kind: "ok" } //                    fetched + parsed → a baked tree exists
  | { kind: "absent" } //                HTTP 404 → no baked tree (a data-less portable shell)
  | { kind: "http"; status: number } //  other HTTP status (e.g. 5xx)
  | { kind: "network" } //               fetch threw (offline / DNS / CORS)
  | { kind: "malformed" }; //            200 but the body wasn't valid JSON

/**
 * Pure classifier (the deceptively-simple item): which mode does a probe imply? A **404 is the ONLY**
 * "this is a data-less portable shell" signal; every other failure is an error — a transient (5xx /
 * offline) or corrupt (malformed) hosted tree must NOT be silently misread as "portable".
 */
export function modeFromProbe(p: ModeProbe): ViewerMode {
  switch (p.kind) {
    case "ok": return "hosted";
    case "absent": return "portable";
    case "http":
    case "network":
    case "malformed": return "error";
  }
}

/** Probe the deployment for a baked tree and classify the mode. Short-circuits to "portable" when a
 *  `.archie.zip` is already open. The fetch is glue; the classification is `modeFromProbe` (tested). */
export async function probeViewerMode(): Promise<ViewerMode> {
  if (portableFs) return "portable";
  let probe: ModeProbe;
  try {
    const res = await fetch(`${PUBLISHED}/exhibits.json`);
    if (res.status === 404) probe = { kind: "absent" };
    else if (!res.ok) probe = { kind: "http", status: res.status };
    else {
      try {
        await res.json();
        probe = { kind: "ok" };
      } catch {
        probe = { kind: "malformed" };
      }
    }
  } catch {
    probe = { kind: "network" };
  }
  return modeFromProbe(probe);
}
// ----------------------------------------------------------------------------------------------

// --- entry vectors (ADR-0008): open a `.archie.zip` into portable mode -------------------------
/** Open a picked/dropped `.archie.zip` (the file-open + drag-drop vector). */
export async function openLibraryFromFile(file: Blob): Promise<void> {
  openPortableLibrary(ZipFilesystem.fromZip(new Uint8Array(await file.arrayBuffer())));
}

/** Default cap on a fetched `?src=` zip — guards the canonical host against a giant payload OOMing
 *  the tab (ADR-0009 untrusted-content boundary). */
export const SRC_MAX_BYTES = 256 * 1024 * 1024; // 256 MB

/**
 * Open a hosted `.archie.zip` by URL (the `?src=` vector), enforcing a size cap. Throws on a too-big,
 * unreachable, or non-OK src. Cross-origin requires the src host to send permissive CORS (ADR-0009).
 */
export async function openLibraryFromSrc(url: string, maxBytes: number = SRC_MAX_BYTES): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't open the library (HTTP ${res.status}).`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("That library is too large to open here.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("That library is too large to open here.");
  openPortableLibrary(ZipFilesystem.fromZip(bytes));
}
// ----------------------------------------------------------------------------------------------

/** The Library Gallery source — `exhibits.json`. Hosted: fetched. Portable: read from the zip. */
export async function loadGallery(): Promise<ExhibitsJson> {
  if (portableFs) return loadPortableGallery(portableFs);
  return fetchJson<ExhibitsJson>("exhibits.json");
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${PUBLISHED}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Fetch a file that may not exist (e.g. readings.json on a base-only exhibit) → null on 404. */
async function fetchJsonOptional<T>(path: string): Promise<T | null> {
  const res = await fetch(`${PUBLISHED}/${path}`);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadPublishedExhibit(slug: string): Promise<PublishedExhibit> {
  // Portable: read the opened zip via the core seam; free the previous exhibit's blob URLs before
  // minting the next (the revoke lifecycle — browser-verify owed for RAM peak, ADR-0010).
  if (portableFs) {
    portableRevoke?.();
    const { exhibit, revoke } = await loadPortableExhibit(portableFs, slug);
    portableRevoke = revoke;
    return exhibit;
  }

  // Hosted: the real deployed-consumer path.
  const manifest = await fetchJson<IIIFManifest>(`${slug}/manifest.json`);
  const objects = objectsFromManifest(manifest);

  // The Readings registry (ADR-0007) — absent on a base-only exhibit.
  const readings = (await fetchJsonOptional<Reading[]>(`${slug}/readings.json`)) ?? [];

  const annotationsByObject: Record<string, W3CAnnotation[]> = {};
  const readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>> = {};
  for (const obj of objects) {
    const base = await fetchJson<{ items?: W3CAnnotation[] }>(`${slug}/canvas/${obj.id}/annotations.json`);
    annotationsByObject[obj.id] = base.items ?? [];
    if (readings.length > 0) {
      const perReading: Record<string, W3CAnnotation[]> = {};
      for (const r of readings) {
        const page = await fetchJsonOptional<{ items?: W3CAnnotation[] }>(`${slug}/canvas/${obj.id}/annotations-${r.id}.json`);
        perReading[r.id] = page?.items ?? [];
      }
      readingAnnotationsByObject[obj.id] = perReading;
    }
  }

  const title = manifest.label?.none?.[0] ?? slug;
  const summary = (manifest as { summary?: { none?: string[] } }).summary?.none?.[0];
  const sections = sectionsFromManifest(manifest); // round-trip the narrative spine from the published Ranges
  const canvasIdByObject = canvasIdMap(manifest); // canvas IRIs as baked at publish (not a fixed BASE)
  return { slug, title, objects, annotationsByObject, readings, readingAnnotationsByObject, sections, canvasIdByObject, ...rightsFromIIIF(manifest), ...(summary !== undefined ? { summary } : {}) };
}

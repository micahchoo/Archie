// Read a Library/exhibit for the Viewer. TWO data sources behind ONE API (ADR-0008 / ADR-0010):
//  - HOSTED (default): fetch the published static tree over HTTP — the real deployed-consumer path
//    (`scripts/gen-published.mts` writes the tree to public/published/; a third party hitting the
//    GH-Pages site does exactly this).
//  - PORTABLE: read an opened `.archie.zip` (a `ZipFilesystem`) in-browser, embedded media → blob
//    URLs — entered via `openPortableLibrary(fs)`. The read itself is core's `loadPortableExhibit`
//    (ADR-0010 seam). Both sources return the SAME shapes, so ViewerShell/ExhibitView are source-agnostic.
import {
  ZipFilesystem, FsaFilesystem, MemoryFilesystem, loadPortableExhibit, loadPortableGallery, readExhibitTree,
  loadWorkingLibrary, publishLibrary, asClientId, WORKING_IRI_BASE,
  type ExhibitsJson, type Filesystem, type JsonSource, type PortableExhibit,
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
// Monotonic load id — guards the revoke lifecycle against rapid navigation (A→B→C) and out-of-order
// await resolution: a load captures the seq before its await and, if superseded on resume, frees its OWN
// blobs instead of clobbering the live revoke handle (which would leak the live exhibit's blob URLs).
let portableSeq = 0;

/** Enter portable mode, reading from `fs` (an opened `.archie.zip`). Frees any prior portable state. */
export function openPortableLibrary(fs: Filesystem): void {
  closePortableLibrary();
  portableFs = fs;
}

/** Leave portable mode (revokes the last exhibit's blob URLs). */
export function closePortableLibrary(): void {
  portableSeq++; // supersede any in-flight load so it self-revokes after teardown (open-another / re-open)
  portableRevoke?.();
  portableRevoke = null;
  portableFs = null;
}

/** True when a `.archie.zip` is open (portable mode); hosted otherwise. */
export function isPortable(): boolean {
  return portableFs !== null;
}
// ----------------------------------------------------------------------------------------------

// --- live source (Q-3 archie-persistence): the same-origin Studio working store ----------------
// One canonical store, two apps: the Studio WRITES the working store (OPFS); a Viewer served from
// the SAME ORIGIN (the GH-Pages co-deploy / the single-origin dev proxy) READS it — an authored
// exhibit appears here with NO publish step. The library is projected in-memory through the SAME
// `publishLibrary` the durable publish uses, then read through the SAME portable seam (ADR-0010):
// live mode is "portable mode over an in-memory projection of the working store". A cross-origin
// deployment simply never finds the store — the probe quietly returns false and the Viewer behaves
// exactly as before. Live is additive, never load-bearing.
let liveFs: MemoryFilesystem | null = null;
let liveSlugs: ReadonlySet<string> = new Set();
let liveRevoke: (() => void) | null = null;
let liveSeq = 0; // mirrors portableSeq — guards the live-source revoke handle against the same load race

/** Is this slug served from the live working store? Drives the Gallery's "Browser" badge — browser =
 *  only you can see it, in this browser; PUBLISH is what puts it on the web (citable). */
export function isLiveSlug(slug: string): boolean {
  return liveSlugs.has(slug);
}

/**
 * Probe the same-origin Studio working store (OPFS) and project it into an in-memory published
 * tree. True = live exhibits joined the hall. Quiet no on every miss — no OPFS, no store, nothing
 * authored (templates don't count), or a failed read — with one console line either way: the probe
 * outcome must be observable, or "why isn't my exhibit here" is undebuggable (Q-3).
 */
export async function initLiveSource(): Promise<boolean> {
  try {
    const storage = (navigator as Navigator & { storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> } }).storage;
    if (!storage?.getDirectory) return false; // no OPFS on this browser — published sources only
    const working = await loadWorkingLibrary(new FsaFilesystem(await storage.getDirectory()), { editor: asClientId("viewer-live") });
    if (!working || working.library.exhibits.length === 0) {
      console.info("Archie: no local working library here — showing published exhibits only");
      return false;
    }
    const mem = new MemoryFilesystem();
    // baseUrl = WORKING_IRI_BASE — the SAME namespace Studio mints its annotation targets against (NOT the
    // published base / real deploy origin): publishLibrary groups annotations by `targetSource(h) ===
    // ${baseUrl}{slug}/canvas/{id}` (site.ts), so a mismatched base silently drops EVERY live-source
    // annotation (exposed by maps — only the live source carries them). This base sets IRIs/identifiers
    // only; the in-memory tree is read by relative path. (Decoupling these two bases fixed live notes —
    // they were equal-by-coincidence until the published base moved to the real origin.)
    await publishLibrary(mem, working.library, working.getLog, { baseUrl: WORKING_IRI_BASE, getAsset: working.getAsset, getThumbnail: working.getThumbnail });
    liveFs = mem;
    liveSlugs = new Set(working.library.exhibits.map((e) => e.slug));
    console.info(`Archie: live source on — ${liveSlugs.size} local exhibit(s) read from this browser's Studio working store`);
    return true;
  } catch (e) {
    console.warn("Archie: live-source probe failed — showing published exhibits only", e);
    liveFs = null;
    liveSlugs = new Set();
    return false;
  }
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
      } catch (e) {
        console.warn("Archie: exhibits.json returned 200 but wasn't valid JSON (corrupt deployment or an HTML error page) —", e);
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
  if (!res.ok) {
    console.error(`Archie: couldn't fetch the library from ${url} — HTTP ${res.status}`);
    throw new Error("Couldn't open the library. The link may be broken or the file unavailable.");
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("That library is too large to open here.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("That library is too large to open here.");
  openPortableLibrary(ZipFilesystem.fromZip(bytes));
}
// ----------------------------------------------------------------------------------------------

/**
 * Merge the live (working-store) gallery over the hosted one — live wins on a slug collision (the
 * author's working copy fronts its published snapshot), and the live library's identity (the
 * author's title/summary) fronts the hall. Pure — exported for tests.
 */
export function mergeGalleries(live: ExhibitsJson, hosted: ExhibitsJson | null): ExhibitsJson {
  if (!hosted) return live;
  const liveSet = new Set(live.exhibits.map((e) => e.slug));
  return {
    ...hosted,
    library: live.library,
    exhibits: [...live.exhibits, ...hosted.exhibits.filter((e) => !liveSet.has(e.slug))],
  };
}

/** The Library Gallery source — `exhibits.json`. Hosted: fetched. Portable: read from the zip.
 *  Live (Q-3): the working-store projection merges over hosted — and carries the hall alone when
 *  no baked tree exists (a clone authoring locally before any publish). */
export async function loadGallery(): Promise<ExhibitsJson> {
  if (portableFs) return loadPortableGallery(portableFs);
  let hosted: ExhibitsJson | null = null;
  let hostedErr: unknown = null;
  try {
    hosted = await fetchJson<ExhibitsJson>("exhibits.json");
  } catch (e) {
    hostedErr = e; // only fatal when there's no live source to carry the hall
  }
  if (!liveFs) {
    if (hosted) return hosted;
    throw hostedErr;
  }
  return mergeGalleries(await loadPortableGallery(liveFs), hosted);
}

// Hosted exhibits come from an IMMUTABLE published tree (it changes only on republish → a full page
// reload), so a slug's read is cacheable for the session: revisiting an exhibit from the Gallery is
// then instant instead of re-fetching + re-parsing the (now annotation-laden) manifest. Holds JSON
// only — hosted images are URLs, not bytes — so it's bounded by what you actually open. NOT used for
// portable/live: those mint blob URLs under a revoke lifecycle (a cached exhibit would hand back
// revoked URLs) and live data mutates as you author.
const hostedCache = new Map<string, PublishedExhibit>();

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${PUBLISHED}/${path}`);
  if (!res.ok) {
    console.error(`Archie: failed to fetch ${path} — HTTP ${res.status}`);
    throw new Error("Couldn't load this exhibit. Reload to try again.");
  }
  try {
    return (await res.json()) as T;
  } catch (e) {
    // A 200 with an unparsable body (a host's HTML error / SPA-fallback page → "Unexpected token <") is a
    // corrupt deployment, not a network miss — name it so the failure isn't an undebuggable blank error.
    console.error(`Archie: ${path} returned 200 but wasn't valid JSON —`, e);
    throw new Error("Couldn't load this exhibit. Reload to try again.");
  }
}

/** Fetch a file that may not exist (e.g. readings.json on a base-only exhibit) → null when absent. */
async function fetchJsonOptional<T>(path: string): Promise<T | null> {
  const res = await fetch(`${PUBLISHED}/${path}`);
  if (!res.ok) {
    // 404 = genuinely absent (a base-only exhibit). A 5xx/403 is a TRANSIENT failure on an optional file —
    // still degrade to null (don't abort a loaded exhibit; stay consistent with fsJsonSource.getOptional's
    // swallow-and-continue), but surface it so a hiccup isn't silently misread as "no data".
    if (res.status !== 404) console.warn(`Archie: optional ${path} returned HTTP ${res.status} — treating as absent`);
    return null;
  }
  return (await res.json()) as T;
}

/** HTTP byte source for the shared reader — GETs tree-relative paths under `${PUBLISHED}`. */
const httpSource: JsonSource = { get: fetchJson, getOptional: fetchJsonOptional };

export async function loadPublishedExhibit(slug: string): Promise<PublishedExhibit> {
  // Portable: read the opened zip via the core seam; free the previous exhibit's blob URLs before
  // minting the next (the revoke lifecycle — browser-verify owed for RAM peak, ADR-0010).
  if (portableFs) {
    portableRevoke?.();
    portableRevoke = null;
    const seq = ++portableSeq;
    const { exhibit, revoke } = await loadPortableExhibit(portableFs, slug);
    // Superseded mid-await by a newer load (rapid nav) or a close? Free THESE blobs now and don't clobber
    // the live revoke handle — the destroyed component discards `exhibit` anyway. (revoke is idempotent.)
    if (seq !== portableSeq) { revoke(); return exhibit; }
    portableRevoke = revoke;
    return exhibit;
  }
  // Live (Q-3): a working-store exhibit reads through the SAME portable seam over the in-memory
  // projection — blob lifecycle mirrors portable's (revoke the previous before minting the next).
  if (liveFs && liveSlugs.has(slug)) {
    liveRevoke?.();
    liveRevoke = null;
    const seq = ++liveSeq;
    const { exhibit, revoke } = await loadPortableExhibit(liveFs, slug);
    if (seq !== liveSeq) { revoke(); return exhibit; }
    liveRevoke = revoke;
    return exhibit;
  }
  // Hosted: the real deployed-consumer path — the shared reader (the domino) over the HTTP source.
  // Served from the session cache on revisit (the published tree is immutable until a reload).
  const cached = hostedCache.get(slug);
  if (cached) return cached;
  const exhibit = await readExhibitTree(httpSource, slug);
  hostedCache.set(slug, exhibit);
  return exhibit;
}

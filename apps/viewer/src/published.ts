// Read a Library/exhibit for the Viewer. TWO data sources behind ONE API (ADR-0008 / ADR-0010):
//  - HOSTED (default): fetch the published static tree over HTTP — the real deployed-consumer path
//    (`scripts/gen-published.mts` writes the tree to public/published/; a third party hitting the
//    GH-Pages site does exactly this).
//  - PORTABLE: read an opened `.archie.zip` (a `ZipFilesystem`) in-browser, embedded media → blob
//    URLs — entered via `openPortableLibrary(fs)`. The read itself is core's `loadPortableExhibit`
//    (ADR-0010 seam). Both sources return the SAME shapes, so ViewerShell/ExhibitView are source-agnostic.
import {
  FsaFilesystem, MemoryFilesystem, loadPortableExhibit, loadPortableGallery, readExhibitTree,
  loadWorkingLibrary, publishLibrary, asClientId, WORKING_IRI_BASE,
  // The untrusted-archive open seam (ISSUES.md Issue 5 canonicalization): the zip-bomb-cap +
  // ADR-0020-marker-validate + capped-fetch logic used to be copy-pasted here and in
  // packages/archie-viewer/src/load.ts — both now compose these instead of redefining them.
  openArchieLibrary, openArchieLibraryFromUrl, looksLikeZip, SRC_MAX_BYTES, fsJsonSource, FailedReadError, assertArchieTreeMarker,
  migratingJsonSource,
  // V7/V11: ONE rule for resolving a tree-relative asset ref against its library base.
  assetUrlAgainst,
  type ExhibitsJson, type Filesystem, type JsonSource, type PortableExhibit, type ImageIndex, type NoteTransform,
} from "@render/core";
import { BASE } from "./published-base.js";
import { mergeImageIndex } from "./gallery-view.js";

export { SRC_MAX_BYTES };

const OWN_TREE = `${import.meta.env.BASE_URL}published`;

// The published tree the HOSTED read path is pointed at (Archie-6d85).
//
// It used to be pinned to this deploy's own `/published`, so no URL existed that opened SOMEBODY
// ELSE's published tree in a hosted viewer — `?src=` accepted zip bytes only. Repointing this one
// variable is what makes `#/?src=<tree base>` work, because `genUrl` is the single place a hosted
// path is turned into a URL and `toServingOrigin` is the single place a canonical asset URL is
// rebased onto the serving origin. Both read it live.
let PUBLISHED = OWN_TREE;

/** Point the hosted reader at a foreign published tree (`?src=<base>`), or back at our own. Clears
 *  the session caches — they are keyed by slug, and two trees can hold the same slug. */
export function setHostedTreeBase(base: string | null): void {
  const next = base === null ? OWN_TREE : base.replace(/\/+$/, "");
  if (next === PUBLISHED) return;
  PUBLISHED = next;
  hostedCache.clear();
  hostedGeneration = null;
}

/** The tree currently being read (for tests and for the "you are reading a foreign tree" affordance). */
export function hostedTreeBase(): string {
  return PUBLISHED;
}

// --- hosted rebase (ADR-0010 portable read seam) ----------------------------------------------
// The published manifest bakes every local-import asset URL against the CANONICAL origin (BASE,
// ADR-0013) so IIIF IDs stay stable and citable — but those absolute URLs resolve ONLY on the
// canonical host. A localhost dev server, a fork, or any re-host serves the SAME tree from a
// different origin and 404s every local image / thumbnail / baked-DZI tile (unnoticed until now
// because every bundled sample uses external IIIF, never a local import — cf. tend Issues 9/16).
// Rebase canonical asset URLs onto the origin the tree is actually SERVED from (`${PUBLISHED}`);
// remote IIIF / http / data URLs (which don't start with BASE) pass through untouched. Hosted-only:
// portable mints blob URLs, live reads WORKING_IRI_BASE — neither carries a canonical BASE URL.
export const toServingOrigin = (url: string): string =>
  url.startsWith(BASE) ? `${PUBLISHED}/${url.slice(BASE.length)}` : url;
const hostedRebase: NoteTransform = {
  object: async (o) => {
    const source = toServingOrigin(o.source);
    const thumbnail = o.thumbnail !== undefined ? toServingOrigin(o.thumbnail) : undefined;
    const tileSource =
      o.tileSource?.kind === "dzi" && o.tileSource.filesPath.startsWith(BASE)
        ? { ...o.tileSource, filesPath: toServingOrigin(o.tileSource.filesPath) }
        : o.tileSource;
    if (source === o.source && thumbnail === o.thumbnail && tileSource === o.tileSource) return o;
    return {
      ...o,
      source,
      ...(thumbnail !== undefined ? { thumbnail } : {}),
      ...(tileSource !== undefined ? { tileSource } : {}),
    };
  },
  // Note-body visual cites can embed a `${BASE}` image too (STALENESS st4) — the SAME re-host portability
  // gap as object media, previously left as identity. Rewrite `${BASE}` occurrences inside each textual
  // body's `value` to the serving origin (`${PUBLISHED}/`) — a plain substring replacement mirroring
  // `toServingOrigin`, no markup parsing (the canonical BASE prefix is an unambiguous absolute-URL token).
  // Remote/data/blob URLs (not BASE-prefixed) are untouched. Returns the SAME object when nothing changed
  // so the read stays referentially stable for a clean tree.
  note: async (n) => rebaseNoteBodies(n),
};

/** Rewrite `${BASE}...` image cites embedded in a note's textual-body values → the serving origin (st4). */
function rebaseNoteBodies<T extends { body?: unknown }>(n: T): T {
  const rebaseValue = (v: string): string => (v.includes(BASE) ? v.split(BASE).join(`${PUBLISHED}/`) : v);
  const rebaseBody = (b: unknown): unknown => {
    if (b && typeof b === "object" && typeof (b as { value?: unknown }).value === "string") {
      const value = (b as { value: string }).value;
      const next = rebaseValue(value);
      if (next !== value) return { ...(b as object), value: next };
    }
    return b;
  };
  const body = n.body;
  if (Array.isArray(body)) {
    let changed = false;
    const next = body.map((b) => { const r = rebaseBody(b); if (r !== b) changed = true; return r; });
    return changed ? { ...n, body: next } : n;
  }
  if (body !== undefined) {
    const r = rebaseBody(body);
    if (r !== body) return { ...n, body: r };
  }
  return n;
}

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
// The two failure modes were ONE ("error") until Archie-a2b9: collapsing them made ViewerShell blame
// the reader's connection for a corrupt deployment. Coarse offline-vs-deploy-problem split:
//  - "offline": the fetch itself threw — the deployment may be fine; the READER can't reach it.
//  - "broken": the deployment answered but isn't serving a readable tree (5xx / non-OK / a 200 whose
//    body isn't JSON, i.e. a host's HTML error page or a torn deploy) — reloading won't fix the wifi.
export type ViewerMode = "hosted" | "portable" | "offline" | "broken";

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
 * offline) or corrupt (malformed) hosted tree must NOT be silently misread as "portable" — split
 * offline (network throw) vs broken (reachable but unreadable) so the shell can say which it was.
 */
export function modeFromProbe(p: ModeProbe): ViewerMode {
  switch (p.kind) {
    case "ok": return "hosted";
    case "absent": return "portable";
    case "network": return "offline";
    case "http":
    case "malformed": return "broken";
  }
}

/**
 * User-facing copy for a boot that found no readable library (Archie-a2b9). Lives beside the classifier
 * (not in ViewerShell) so vitest can pin "offline and corrupt-deploy read differently". Two messages:
 *  - "offline" → the connection message (the reader's side; reloading once back online fixes it).
 *  - everything else → a deploy/data problem the reader's connection can't explain: "broken" (5xx /
 *    corrupt JSON), and "hosted" — the probe read exhibits.json fine yet the gallery load still failed
 *    (e.g. a wrong-version `archie.json` marker → NotAnArchieLibraryError), which is the same
 *    republish-to-fix situation, not a connectivity one.
 */
export function bootErrorMessage(mode: Exclude<ViewerMode, "portable">): string {
  // Default-less switch (review suggestion): a future ViewerMode member that isn't handled here falls
  // through with no return, which TS2366 flags at compile time (strictNullChecks, no noImplicitReturns
  // needed — proven by hand: adding a member without a case here fails `tsc --noEmit`). The old ternary
  // silently routed any non-"offline" mode to the republish copy — including a mode nobody had reasoned
  // about yet.
  switch (mode) {
    case "offline":
      return "Couldn’t reach the library. Check your connection and reload.";
    case "hosted":
    case "broken":
      return "This library’s data couldn’t be read — the site looks broken, not your connection. Reload to try again; if it keeps failing, whoever published this site needs to publish it again.";
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
        // `res.json()` fails two distinguishable ways (WHATWG Fetch): a SyntaxError from `JSON.parse`
        // once the body is fully in hand but isn't valid JSON (a corrupt artifact or a host's HTML
        // error/SPA-fallback page — a deploy problem); a TypeError when the underlying stream read
        // itself fails (the connection dropped mid-transfer, headers already received — a READER
        // connectivity problem, same as the outer fetch-throw below). Route the TypeError case through
        // the existing "network" kind instead of "malformed" so it gets the offline copy, not the
        // "site looks broken" one — this refines the existing offline-vs-broken split, it doesn't add a
        // new outcome.
        if (e instanceof SyntaxError) {
          console.warn("Archie: exhibits.json returned 200 but wasn't valid JSON (corrupt deployment or an HTML error page) —", e);
          probe = { kind: "malformed" };
        } else {
          console.warn("Archie: exhibits.json fetch succeeded but the body read failed (connection likely dropped mid-read) —", e);
          probe = { kind: "network" };
        }
      }
    }
  } catch {
    probe = { kind: "network" };
  }
  return modeFromProbe(probe);
}
// ----------------------------------------------------------------------------------------------

// --- entry vectors (ADR-0008): open a `.archie.zip` into portable mode -------------------------
/** Open a picked/dropped `.archie.zip` (the file-open + drag-drop vector). `openArchieLibrary`
 *  (`@render/core`) is the canonical decode + ADR-0020-validate step (ISSUES.md Issue 5) — it accepts
 *  a `Blob` directly, so the captured File passes straight through with no manual `.arrayBuffer()`. */
export async function openLibraryFromFile(file: Blob): Promise<void> {
  openPortableLibrary(await openArchieLibrary(file));
}

/**
 * Open a hosted `.archie.zip` by URL (the `?src=` vector), enforcing a size cap. Throws on a too-big,
 * unreachable, or non-OK src. Cross-origin requires the src host to send permissive CORS (ADR-0009).
 * `openArchieLibraryFromUrl` (`@render/core`) is the canonical fetch-under-cap + decode + ADR-0020
 * marker-validate composition (ISSUES.md Issue 5) — the fetch step fully completes (network + both cap
 * checks) before the decode step ever runs.
 */
export async function openLibraryFromSrc(url: string, maxBytes: number = SRC_MAX_BYTES): Promise<void> {
  // A non-`.zip` src is a published TREE BASE, read lazily over HTTP rather than pulled down as one
  // payload. This is the dispatch the embed already ships and tests (archie-viewer/src/load.ts:120-128);
  // ported here so the same URL opens in the hosted viewer, which is what the static pages' exhibit
  // links need when a tree is read from anywhere but its canonical host.
  //
  // If the tree read fails AND the base itself serves zip bytes (a `.zip`-less zip link), fall back to
  // the zip path — same order, and the same reason, as the embed's.
  if (!/\.zip(\?|#|$)/i.test(url)) {
    try {
      await openHostedTree(url);
      return;
    } catch (treeErr) {
      const bytes = await fetchIfZipBytes(url, maxBytes);
      if (bytes) { openPortableLibrary(await openArchieLibrary(bytes)); return; }
      throw treeErr; // not a zip either — surface the tree-open error, not the sniff's
    }
  }
  openPortableLibrary(await openArchieLibraryFromUrl(url, { maxBytes })); // fetch defaults to global fetch
}

/**
 * Open a foreign published tree: leave portable mode, repoint the hosted reader, and VALIDATE before
 * committing to it. Validation is the same pair the embed and our own boot both use — the ADR-0020
 * marker gate (lenient on absent, current-required when present) then `exhibits.json` — so a URL that
 * is merely a website fails here rather than rendering an empty hall that looks like an empty library.
 */
async function openHostedTree(base: string): Promise<void> {
  const previous = hostedTreeBase();
  closePortableLibrary();
  setHostedTreeBase(base);
  try {
    rememberHostedSchema(await assertArchieTreeMarker(httpSource));
    await hostedSource().get<ExhibitsJson>("exhibits.json");
  } catch (e) {
    setHostedTreeBase(previous === OWN_TREE ? null : previous); // don't strand the viewer on a dead tree
    throw e;
  }
}

/** Fetch a `.zip`-less URL once and return its bytes IFF they are a zip. `null` for anything else —
 *  including a network failure, so the caller can surface the original TREE error instead of this
 *  one. That swallow is why this isn't core's `fetchArchieLibraryBytes`, which always throws; same
 *  carve-out the embed documents at `load.ts` `openSrcAsZipIfBytesAreZip`. */
async function fetchIfZipBytes(url: string, maxBytes: number): Promise<Uint8Array | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("That library is too large to open here.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!looksLikeZip(bytes)) return null;
  if (bytes.byteLength > maxBytes) throw new Error("That library is too large to open here.");
  return bytes;
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
  // ADR-0020 schema gate on the HOSTED tree — the SAME `assertArchieTreeMarker` the embed uses (READPOLICY
  // rp2). Was the gap: the hosted apps/viewer never read `archie.json`, so a wrong-version/foreign published
  // tree rendered garbage instead of refusing cleanly. Lenient-on-absent (a 404 marker → no throw, so a
  // pre-marker tree or a live-only author is unaffected); a PRESENT foreign/wrong-version marker throws
  // NotAnArchieLibraryError, surfaced by ViewerShell. Runs BEFORE the exhibits.json read so a version
  // mismatch is an explicit error, not swallowed as "hosted absent → fall back to live".
  // The marker also carries the publish generation (STALENESS): adopt it BEFORE reading exhibits.json so
  // that read — and every subsequent content fetch this session — is keyed `?g=<generation>`; a republish
  // caught here (refreshLive re-invokes loadGallery) clears the stale session cache.
  const marker = await assertArchieTreeMarker(httpSource);
  rememberHostedSchema(marker); // Archie-5c8d: reads below go through hostedSource(), which migrates
  syncHostedGeneration(marker?.generation ?? null);
  let hosted: ExhibitsJson | null = null;
  let hostedErr: unknown = null;
  try {
    hosted = await hostedSource().get<ExhibitsJson>("exhibits.json");
  } catch (e) {
    hostedErr = e; // only fatal when there's no live source to carry the hall
  }
  if (!liveFs) {
    if (hosted) return hosted;
    throw hostedErr;
  }
  return mergeGalleries(await loadPortableGallery(liveFs), hosted);
}

/** The library-level image index (ADR-0023) — the Gallery wall's ONE-fetch source. Returns null when the
 *  file is absent (an older published tree with no baked index) OR unparsable — the Gallery then hides the
 *  "All images" wall entirely and the exhibit-cards view still works (ADR-0023 degradation contract).
 *  Portable (.archie.zip): read from the opened zip; live-only working store: no baked index → null. */
export async function loadImageIndex(): Promise<ImageIndex | null> {
  try {
    if (portableFs) return await fsJsonSource(portableFs).getOptional<ImageIndex>("images.json");
    // fetchJsonOptional keeps a missing index SILENT (404 → null = the expected ADR-0023 degradation); a
    // FAILED read (5xx / torn body) throws `FailedReadError` → the outer catch degrades the wall to null
    // (a broken index safely hides the wall, cards still work). Don't use fetchJson (it error-logs a
    // user-facing message for every old tree that legitimately has no images.json).
    const hosted = await hostedSource().getOptional<ImageIndex>("images.json");
    // STALENESS st3: front the LIVE working-store wall over the hosted one, dropping hosted entries for a
    // slug the live source FRONTS (so a colliding-slug wall tile can't route to the live exhibit with a
    // stale hosted object id — the dead-link mergeGalleries left open). The live projection wrote its own
    // images.json (publishLibrary), so read it from the in-memory tree; no baked index there → null → the
    // hosted wall stands alone.
    if (liveFs) {
      const live = await fsJsonSource(liveFs).getOptional<ImageIndex>("images.json");
      return mergeImageIndex(live, hosted, liveSlugs);
    }
    return hosted;
  } catch {
    return null; // fetch reject / corrupt JSON → degrade: no wall, cards only
  }
}

// Hosted exhibits come from an IMMUTABLE published tree (it changes only on republish → a full page
// reload), so a slug's read is cacheable for the session: revisiting an exhibit from the Gallery is
// then instant instead of re-fetching + re-parsing the (now annotation-laden) manifest. Holds JSON
// only — hosted images are URLs, not bytes — so it's bounded by what you actually open. NOT used for
// portable/live: those mint blob URLs under a revoke lifecycle (a cached exhibit would hand back
// revoked URLs) and live data mutates as you author.
const hostedCache = new Map<string, PublishedExhibit>();

// STALENESS (Issue 24): the current published generation, read from the tree's `archie.json` marker at
// gallery load. Every hosted CONTENT fetch is keyed on it (`?g=<generation>`) so a caching layer can't
// serve one file from generation A next to another from B; a republish changes it, so a mid-session
// `loadGallery` (refreshLive) detects the mismatch, clears the session cache, and re-keys the next reads.
let hostedGeneration: string | null = null;

/** Append the generation cache-key to a hosted CONTENT path. NOT applied to `archie.json` itself — the
 *  marker is the generation ORACLE, so it must be fetched fresh, never pinned to a (possibly stale)
 *  generation of its own. */
function genUrl(path: string): string {
  const q = hostedGeneration && path !== "archie.json" ? `?g=${encodeURIComponent(hostedGeneration)}` : "";
  return `${PUBLISHED}/${path}${q}`;
}

/** Adopt the generation the marker just reported. On a CHANGE (incl. the first non-null, and any mid-session
 *  republish caught by refreshLive), drop the session exhibit cache so no gen-A exhibit survives into gen B. */
function syncHostedGeneration(generation: string | null): void {
  if (generation === hostedGeneration) return;
  hostedCache.clear();
  hostedGeneration = generation;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(genUrl(path));
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

/** Fetch a file that may not exist (e.g. readings.json on a base-only exhibit). Issue 23 absent-vs-failed
 *  contract: **404 → null (genuinely absent)**; a 5xx/403, a fetch throw, or a torn-200 body → **throw
 *  `FailedReadError`** (a failed read is NOT "no data"). `readExhibitTree` catches this to flag a partial
 *  exhibit; `loadImageIndex` catches it to degrade the wall — neither silently renders complete. */
async function fetchJsonOptional<T>(path: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(genUrl(path));
  } catch (e) {
    throw new FailedReadError(path, e); // network/DNS/CORS throw = failed, not absent
  }
  if (res.status === 404) return null; // genuinely absent (a base-only exhibit / an old tree's images.json)
  if (!res.ok) throw new FailedReadError(path, new Error(`HTTP ${res.status}`)); // 5xx/403 = transient failure
  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new FailedReadError(path, e); // 200 with an unparsable/torn body = corrupt, not absent
  }
}

/**
 * Resolve a published-tree asset reference for use as a live `src` (audit V7).
 *
 * `exhibits.json` covers and `images.json` thumbnails are EITHER an absolute URL (a remote IIIF
 * derivative — how most seeded exhibits get their cover) OR a path relative to the published root
 * (`screenshots/assets/o1-e1-embed.png` — how a baked local asset is referenced). The gallery rendered
 * both raw, so the relative ones resolved against the PAGE and 404'd: the file was on disk the whole
 * time, the URL just never carried `${PUBLISHED}/`. The symptom was an exhibit that looked like it had
 * no cover at all.
 *
 * Absolute URLs (any scheme, protocol-relative, `blob:`, `data:`) and root-absolute paths pass through
 * untouched — a live/OPFS-fronted exhibit already hands us a usable URL. Empty/undefined → undefined,
 * so the caller's own fallback still fires.
 *
 * NOT applied in portable mode, where assets are blob URLs minted by `loadPortableExhibit` (ADR-0010).
 * Whether covers are inside that rewrite set is the open half of audit V11 — see Archie-a897.
 *
 * The RULE now lives in `@render/core` (`assetUrlAgainst`) and this is a thin binding of it to this
 * app's base. V11 turned out to be the same bug in the embed, against a different base — and a
 * second copy of the rule is precisely how the two drifted apart. One definition, two bases.
 */
export function publishedAssetUrl(ref: string | undefined | null): string | undefined {
  return assetUrlAgainst(PUBLISHED, ref);
}

/** HTTP byte source for the shared reader — GETs tree-relative paths under `${PUBLISHED}`. */
const httpSource: JsonSource = { get: fetchJson, getOptional: fetchJsonOptional };

// Archie-5c8d / Archie-69f9: the schema version the hosted tree declared, learned by the ADR-0020 gate
// and remembered so every subsequent read migrates. `null` = not yet gated (or no marker), which reads
// as "nothing to migrate".
//
// Why a module-level accessor and not a wrap at the gate's call site: the hosted content reads do NOT
// all go through `httpSource` — `loadGallery` calls `fetchJson` directly and `loadImageIndex` calls
// `fetchJsonOptional`, so wrapping the object one call site holds would have covered two of four
// readers and silently missed the other two, including `readExhibitTree` (every manifest and
// annotation page). One accessor is the only shape where a new reader can't forget.
let hostedSchemaFrom: number | null = null;
function hostedSource(): JsonSource {
  return hostedSchemaFrom === null ? httpSource : migratingJsonSource(httpSource, hostedSchemaFrom);
}
/** Remember what the gate found, so reads after it migrate. Absent/malformed marker → no migration. */
function rememberHostedSchema(marker: { version?: number } | null): void {
  hostedSchemaFrom = typeof marker?.version === "number" && Number.isFinite(marker.version) ? marker.version : null;
}

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
  const exhibit = await readExhibitTree(hostedSource(), slug, hostedRebase); // Archie-5c8d
  hostedCache.set(slug, exhibit);
  return exhibit;
}

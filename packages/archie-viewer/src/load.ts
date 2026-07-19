// The <archie-viewer> LOAD SEAM (ADR-0019 / ADR-0008 portable entry vectors).
//
// A `LoadedLibrary` is the per-element load state: an opened Filesystem + its gallery index + a revoke
// ledger for the blob URLs the reader mints. It holds NO module-global state — every function here
// takes/returns its state explicitly, so each <archie-viewer> instance owns an independent library
// (the Phase-4 per-element seam, realized here so the element never reaches for a module singleton).
//
// Donor: apps/viewer/src/published.ts (openZipBytes / openLibraryFromFile / openLibraryFromSrc /
// loadGallery / loadPublishedExhibit) — but that file holds `portableFs`/`liveFs`/`portableRevoke` as
// MODULE GLOBALS (one library per tab). We deliberately diverge: state lives on `LoadedLibrary`, passed
// in, so two embeds on one page don't clobber each other.
//
// The zip-bomb-cap + ADR-0020-marker-validate + capped-fetch logic that used to be copy-pasted between
// this file and published.ts now lives in `@render/core`'s `publish/open.ts` (ISSUES.md Issue 5
// canonicalization) — both files compose it instead of redefining it.

import {
  loadPortableExhibit,
  loadPortableGallery,
  readExhibitTree,
  // ADR-0020 tree marker gate — the SHARED validator (was a hand-rolled marker check here); the hosted
  // apps/viewer path (published.ts) composes the SAME function, so both surfaces apply one policy.
  assertArchieTreeMarker,
  // The untrusted-archive open seam (ISSUES.md Issue 5 canonicalization): the zip-bomb-cap +
  // ADR-0020-marker-validate + capped-fetch logic used to be copy-pasted here and in
  // apps/viewer/src/published.ts — both now compose these instead of redefining them.
  openArchieLibrary,
  openArchieLibraryFromUrl,
  looksLikeZip,
  SRC_MAX_BYTES,
  FailedReadError,
  // The tree path's byte source: the READ-ONLY HTTP backend (ticket C1, the fourth backend) behind
  // the shared fs-walking JsonSource — replaces this file's hand-rolled fetch/classify loop.
  HttpFilesystem,
  fsJsonSource,
  type JsonSource,
  type Filesystem,
  type ExhibitsJson,
  type PortableExhibit,
} from "@render/core";

export { SRC_MAX_BYTES };

/** A `?src=`/dropped library opened into one element instance. The reader reads exhibits through `fs`;
 *  `gallery` is the front-door index; `blobUrls` accumulates the minted asset blobs across exhibit
 *  loads so `revoke()` can free them on close / "open another" (the App.svelte:99 lifecycle). */
export interface LoadedLibrary {
  /** The opened backing filesystem for a ZIP library; `null` for a hosted-TREE library (Phase 2),
   *  whose exhibits are fetched lazily over HTTP — there's no in-memory tree to walk. */
  fs: Filesystem | null;
  gallery: ExhibitsJson;
  /** Per-exhibit revoke handles, newest last — `revokeOpenExhibit` frees the previous before the next. */
  revoke(): void;
  /** How this library reads ONE exhibit by slug — the zip-vs-tree divergence lives HERE, not in
   *  `readExhibit`. Zip: `loadPortableExhibit(fs, slug)` (blob-rewrite + revoke). Tree: `readExhibitTree`
   *  over the HTTP source (hosted images stay URLs — no blobs, so a no-op revoke). Set at open time. */
  openExhibit(slug: string): Promise<{ exhibit: PortableExhibit; revoke(): void }>;
}

/**
 * Normalize a thrown open-path Error to a user-facing message — used only by the tree-open path below
 * (`openLibraryFromTree`'s `exhibits.json` read). The zip-decode path's equivalent normalization now
 * lives inside `@render/core`'s `openArchieLibrary` (ISSUES.md Issue 5 canonicalization) — this local
 * copy is no longer shared with `published.ts`.
 */
function openError(e: unknown): never {
  throw e instanceof Error
    ? e
    : new Error("That file couldn't be opened. Choose a published .archie.zip exported from Archie.");
}

/** Decode + ADR-0020-validate a `.archie.zip`'s bytes into a `LoadedLibrary` — a thin wrapper over
 *  `@render/core`'s canonical `openArchieLibrary`, kept as a named export since callers/tests already
 *  depend on this shape (donor: published.ts openZipBytes, now unified — see open.ts). */
export async function openZipBytes(bytes: Uint8Array): Promise<LoadedLibrary> {
  return openFilesystem(await openArchieLibrary(bytes));
}

/** Wrap an already-opened Filesystem (marker already validated) into a `LoadedLibrary` by reading its
 *  gallery index. Split out so the published-tree-base path (which fetches `exhibits.json` over HTTP into
 *  an in-memory fs) and the zip path share one shape. */
export async function openFilesystem(fs: Filesystem): Promise<LoadedLibrary> {
  const gallery = await loadPortableGallery(fs);
  return { fs, gallery, revoke() {}, openExhibit: (slug) => loadPortableExhibit(fs, slug) };
}

/** Open a picked/dropped `.archie.zip` (the file-open + drag-drop vector; donor: openLibraryFromFile).
 *  `openArchieLibrary` accepts a `Blob` directly — the element passes the captured File straight
 *  through, no manual `.arrayBuffer()` here. */
export async function openLibraryFromFile(file: Blob): Promise<LoadedLibrary> {
  return openFilesystem(await openArchieLibrary(file));
}

/**
 * Open a library by URL — the unified `src=` vector (ADR-0019). DISPATCHES zip-vs-tree:
 *   • a `src` ending in `.zip` → the portable zip path (`ZipFilesystem.fromZip` + ADR-0020 marker),
 *     enforcing `maxBytes`.
 *   • otherwise → treat `src` as a published-TREE BASE and fetch base + `exhibits.json` for the gallery,
 *     reading per-exhibit `manifest.json` LAZILY on open (`openLibraryFromTree`). A tree base is the
 *     common non-`.zip` case and must NOT be slurped as a single payload, so we don't pre-fetch it to
 *     sniff. The byte-sniff (`looksLikeZip`) covers the remaining case: a `.zip`-less URL that actually
 *     serves zip bytes (e.g. a content-addressed link) — the tree's first JSON read fails, and the
 *     fallback re-opens the already-fetched bytes as a zip instead of surfacing a parse error.
 * `fetchImpl` is injectable so the seam is testable without a network (and so an `offline` element can
 * refuse remote opens at a higher layer — element.ts gates BEFORE this for any http/https/`//` src,
 * which covers a remote tree base too).
 */
export async function openLibraryFromSrc(
  url: string,
  maxBytes: number = SRC_MAX_BYTES,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedLibrary> {
  // A non-`.zip` src is a tree base — read it lazily, not as a single payload. If the tree read fails
  // AND the base URL itself serves zip bytes (a `.zip`-less zip link), fall back to the zip path.
  if (!/\.zip(\?|#|$)/i.test(url)) {
    try {
      return await openLibraryFromTree(url, fetchImpl);
    } catch (treeErr) {
      const sniff = await openSrcAsZipIfBytesAreZip(url, maxBytes, fetchImpl);
      if (sniff) return sniff;
      throw treeErr; // not a zip either — surface the tree-open error
    }
  }

  return openFilesystem(await openArchieLibraryFromUrl(url, { fetch: fetchImpl, maxBytes }));
}

/** Fallback for a `.zip`-less URL whose tree read failed: fetch it once and, IFF the bytes are a zip
 *  (`looksLikeZip`), open them as a zip (enforcing `maxBytes`). Returns `null` when the bytes aren't a
 *  zip — the caller then surfaces the original tree-open error.
 *
 *  NOT rebuilt on `@render/core`'s `fetchArchieLibraryBytes` (ISSUES.md Issue 5): that helper always
 *  THROWS on a network failure/non-OK response, but this fallback must SWALLOW those to `null` so the
 *  original tree-open error surfaces instead — a genuinely different error-handling contract, not an
 *  overlooked duplicate. Only the (rare) declared-too-large case still throws here, matching today's
 *  behavior. */
async function openSrcAsZipIfBytesAreZip(
  url: string,
  maxBytes: number,
  fetchImpl: typeof fetch,
): Promise<LoadedLibrary | null> {
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("That library is too large to open here.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!looksLikeZip(bytes)) return null;
  if (bytes.byteLength > maxBytes) throw new Error("That library is too large to open here.");
  return openZipBytes(bytes);
}

/** An HTTP `JsonSource` over a published-tree base — GETs tree-relative paths (`exhibits.json`,
 *  `${slug}/manifest.json`) under `base`. Now composed over `@render/core`'s read-only
 *  `HttpFilesystem` (the fourth backend) + the shared `fsJsonSource`, instead of a hand-rolled
 *  fetch loop — which buys name containment on every path segment (a hostile slug can't escape
 *  `base`) and the canonical `SRC_MAX_BYTES` response cap for free. Instance-scoped as before
 *  (`fetchImpl` + `base` captured here, NO module global; base-slash normalization lives in the
 *  backend).
 *
 *  Error contract (preserved from the hand-rolled version):
 *   • `get`: any HTTP status (404/5xx), or a torn-200 body → console diagnosis + the friendly
 *     open error; a NETWORK fault (offline/DNS/CORS — `fetch` itself failing) propagates raw,
 *     exactly as before (only `res.ok`/`res.json()` were ever wrapped). One narrowing: a fault
 *     mid-BODY now also propagates raw (it previously fell into `json()`'s friendly wrap) —
 *     both are transport faults, now handled uniformly.
 *   • `getOptional`: Issue 23 absent-vs-failed verbatim — 404 → null (genuinely absent, e.g. a
 *     base-only exhibit's readings.json); a 5xx/403, a fetch throw, or a torn-200 body →
 *     `FailedReadError` (a failed read is NOT "no data"); readExhibitTree catches it to flag a
 *     partial exhibit instead of silently rendering it as complete. The classification now lives
 *     in `HttpFilesystem`/`fsJsonSource` rather than here. */
function httpJsonSource(base: string, fetchImpl: typeof fetch): JsonSource {
  const src = fsJsonSource(new HttpFilesystem(base, { fetch: fetchImpl }));
  return {
    get: async <T>(path: string): Promise<T> => {
      try {
        return await src.get<T>(path);
      } catch (e) {
        // A FailedReadError WITHOUT a status is a transport fault (fetch/body throw) — raw, as before.
        if (e instanceof FailedReadError && e.status === undefined) throw e.cause ?? e;
        // 404 (`no such file`), a non-OK status, or a torn-200 body (an HTML error / SPA-fallback
        // page = corrupt deployment) — name it rather than surface a bare "Unexpected token <".
        console.error(`archie-viewer: failed to read ${path} —`, e);
        throw new Error("Couldn't open the library. The link may be broken or the file unavailable.");
      }
    },
    getOptional: (path) => src.getOptional(path),
  };
}

/**
 * Open a published-TREE base (Phase 2; the hosted-directory `src=` vector). Fetches the gallery
 * (`exhibits.json`) eagerly and reads per-exhibit `manifest.json` LAZILY on `readExhibit` — mirroring
 * apps/viewer hosted mode conceptually but kept self-contained + instance-scoped (no module globals; no
 * import of apps/viewer). Exhibits read over the shared `readExhibitTree` domino with NO transform —
 * hosted images are URLs, not minted blobs, so the per-exhibit revoke is a no-op.
 *
 * ADR-0020 marker over an HTTP tree: read base + `archie.json` if present and validate it (format +
 * schema version). If it's ABSENT (404), accept the tree when `exhibits.json` parses — a tree need not
 * ship a marker file (some static hosts strip dotted/unknown files), so the gallery index parsing IS the
 * acceptance signal. A PRESENT-but-foreign marker is still rejected.
 */
export async function openLibraryFromTree(base: string, fetchImpl: typeof fetch = fetch): Promise<LoadedLibrary> {
  const src = httpJsonSource(base, fetchImpl);
  // ADR-0020 marker gate — the SHARED `assertArchieTreeMarker` (was a hand-rolled copy here). Lenient-on-
  // absent, present-must-be-current; identical policy to the hosted apps/viewer path (published.ts).
  await assertArchieTreeMarker(src);
  // No marker → accept iff exhibits.json parses (also the marker-present validation's gallery read).
  let gallery: ExhibitsJson;
  try {
    gallery = await src.get<ExhibitsJson>("exhibits.json");
  } catch (e) {
    openError(e);
  }
  return {
    fs: null,
    gallery,
    revoke() {},
    openExhibit: async (slug) => ({ exhibit: await readExhibitTree(src, slug), revoke() {} }),
  };
}

/**
 * Read ONE exhibit out of a loaded library, freeing the PREVIOUS exhibit's blob URLs first (the revoke
 * lifecycle — donor: published.ts loadPublishedExhibit portable branch). Returns the exhibit AND the
 * library with a fresh `revoke` closure that frees THIS exhibit's blobs. Pure over `lib` (no globals):
 * the caller swaps the returned library into its instance field.
 */
export async function readExhibit(
  lib: LoadedLibrary,
  slug: string,
): Promise<{ exhibit: PortableExhibit; lib: LoadedLibrary }> {
  lib.revoke(); // free the previous exhibit's minted blobs before minting the next
  const { exhibit, revoke } = await lib.openExhibit(slug); // zip-vs-tree divergence lives on the library
  return { exhibit, lib: { fs: lib.fs, gallery: lib.gallery, revoke, openExhibit: lib.openExhibit } };
}

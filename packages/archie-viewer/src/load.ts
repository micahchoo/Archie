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

import {
  ZipFilesystem,
  validateArchieMarker,
  loadPortableExhibit,
  loadPortableGallery,
  readExhibitTree,
  NotAnArchieLibraryError,
  SCHEMA_VERSION,
  type ArchieMarker,
  type JsonSource,
  type Filesystem,
  type ExhibitsJson,
  type PortableExhibit,
} from "@render/core";

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

/** Default cap on a fetched `src=` zip (donor: published.ts SRC_MAX_BYTES) — guards the host tab against
 *  a giant payload OOMing it (ADR-0009 untrusted-content boundary). */
export const SRC_MAX_BYTES = 256 * 1024 * 1024; // 256 MB

/**
 * Normalize a thrown open-path Error to a user-facing message (donor: published.ts openError).
 * `ZipFilesystem.fromZip`'s zip-bomb caps and `validateArchieMarker`'s ADR-0020 rejects already carry
 * friendly messages, so re-throw an Error verbatim; a non-Error throw degrades to a generic line.
 */
function openError(e: unknown): never {
  throw e instanceof Error
    ? e
    : new Error("That file couldn't be opened. Choose a published .archie.zip exported from Archie.");
}

/** Decode + ADR-0020-validate a `.archie.zip`'s bytes into a `LoadedLibrary`. Shared by the file and
 *  `src=` vectors so the zip-bomb cap AND the marker reject both surface as a thrown user-facing Error,
 *  never a raw parse failure deep in the tree reader (donor: published.ts openZipBytes). */
export async function openZipBytes(bytes: Uint8Array): Promise<LoadedLibrary> {
  let fs: ZipFilesystem;
  try {
    fs = ZipFilesystem.fromZip(bytes); // throws on a zip-bomb cap breach (zip.ts) — friendly message
    await validateArchieMarker(fs); // ADR-0020: reject a non-Archie / wrong-schema zip BEFORE reading it
  } catch (e) {
    openError(e);
  }
  return openFilesystem(fs);
}

/** Wrap an already-opened Filesystem (marker already validated) into a `LoadedLibrary` by reading its
 *  gallery index. Split out so the published-tree-base path (which fetches `exhibits.json` over HTTP into
 *  an in-memory fs) and the zip path share one shape. */
export async function openFilesystem(fs: Filesystem): Promise<LoadedLibrary> {
  const gallery = await loadPortableGallery(fs);
  return { fs, gallery, revoke() {}, openExhibit: (slug) => loadPortableExhibit(fs, slug) };
}

/** Open a picked/dropped `.archie.zip` (the file-open + drag-drop vector; donor: openLibraryFromFile).
 *  The element passes the captured File straight through — File extends Blob. */
export async function openLibraryFromFile(file: Blob): Promise<LoadedLibrary> {
  return openZipBytes(new Uint8Array(await file.arrayBuffer()));
}

/** A zip's first 4 bytes are the local-file-header signature `PK\x03\x04` (or the empty-archive
 *  `PK\x05\x06`). We sniff this so a `src=` whose URL doesn't end in `.zip` but whose fetched BYTES are
 *  a zip is still opened as a zip — the spec's "bytes are a zip = zip" marker. */
function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06);
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

  const res = await fetchImpl(url);
  if (!res.ok) {
    console.error(`archie-viewer: couldn't fetch the library from ${url} — HTTP ${res.status}`);
    throw new Error("Couldn't open the library. The link may be broken or the file unavailable.");
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("That library is too large to open here.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("That library is too large to open here.");
  return openZipBytes(bytes);
}

/** Fallback for a `.zip`-less URL whose tree read failed: fetch it once and, IFF the bytes are a zip
 *  (`looksLikeZip`), open them as a zip (enforcing `maxBytes`). Returns `null` when the bytes aren't a
 *  zip — the caller then surfaces the original tree-open error. */
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
 *  `${slug}/manifest.json`) under `base`. Donor: apps/viewer published.ts httpSource, but self-contained
 *  + instance-scoped (the `fetchImpl` + `base` are captured here, NO module global). `base` is normalized
 *  to a trailing slash so `${base}${path}` joins cleanly. */
function httpJsonSource(base: string, fetchImpl: typeof fetch): JsonSource {
  const root = base.endsWith("/") ? base : `${base}/`;
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetchImpl(`${root}${path}`);
    if (!res.ok) {
      console.error(`archie-viewer: failed to fetch ${path} — HTTP ${res.status}`);
      throw new Error("Couldn't open the library. The link may be broken or the file unavailable.");
    }
    try {
      return (await res.json()) as T;
    } catch (e) {
      // A 200 with an unparsable body (an HTML error / SPA-fallback page) is a corrupt deployment, not a
      // network miss — name it rather than surface a bare "Unexpected token <".
      console.error(`archie-viewer: ${path} returned 200 but wasn't valid JSON —`, e);
      throw new Error("Couldn't open the library. The link may be broken or the file unavailable.");
    }
  };
  return {
    get,
    getOptional: async <T>(path: string): Promise<T | null> => {
      try {
        const res = await fetchImpl(`${root}${path}`);
        if (!res.ok) return null; // 404 = genuinely absent (a base-only exhibit); a 5xx degrades to absent too
        return (await res.json()) as T;
      } catch {
        return null;
      }
    },
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
  const marker = await src.getOptional<Partial<ArchieMarker>>("archie.json");
  if (marker) {
    // Marker present → it MUST be a valid current-schema Archie marker (forged/foreign trees rejected).
    if (marker.format !== "archie-library") {
      throw new NotAnArchieLibraryError(
        "This file isn't an Archie library. Choose a published Archie tree or .archie.zip.",
      );
    }
    if (marker.version !== SCHEMA_VERSION) {
      throw new NotAnArchieLibraryError(
        `This library was made with a different version of Archie (schema v${String(marker.version)}, this viewer reads v${SCHEMA_VERSION}). Re-publish it from a current Archie.`,
      );
    }
  }
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

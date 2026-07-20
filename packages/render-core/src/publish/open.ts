// The UNTRUSTED-ARCHIVE OPEN SEAM (ISSUES.md Issue 5 canonicalization). Before this module, the
// zip-bomb-cap + ADR-0020-marker-validate sequence was copy-pasted across `packages/archie-viewer/
// src/load.ts` and `apps/viewer/src/published.ts`, and skipped ENTIRELY by `apps/studio/src/
// ingest-flows.ts`'s `openZip` (a wrong-schema `.archie.zip` dropped into Studio got a generic
// `loadLibrary` parse error instead of `NotAnArchieLibraryError`'s specific message). This is the ONE
// place `ZipFilesystem.fromZip` + `validateArchieMarker` are composed — every consumer, in every app,
// funnels an untrusted `.archie.zip` through here before treating the result as a real library.
//
// Deliberately stops at a validated `Filesystem`: each caller's downstream domain shaping (the
// viewer's `LoadedLibrary`, published.ts's module-global cache, studio's `loadLibrary` reassembly)
// stays with the caller — this module doesn't know or care what any of them do with the fs.
//
// ADR-0026 object-id migration is NOT wired here, deliberately (Archie-8439 trigger 2 lives at the
// studio ADOPTION boundary, `apps/studio/src/ingest-flows.ts` `replaceProjectFrom`, instead). Two
// reasons: (1) LAYOUT — this seam returns a zip in the PUBLISHED-tree layout (root `archie.json` /
// `collection.json` / `exhibits.json`, per-exhibit dirs at the root by slug), whereas the migration
// engine (`migrate/object-ids.ts`) operates on the WORKING-store layout (`{project}/library.json`,
// `{project}/exhibits/{slug}/…`); it can't read a published tree in place. (2) AUDIENCE — the Viewer
// (`apps/viewer`, `packages/archie-viewer`) opens through this same seam and must stay migration-free
// (a published tree is self-consistent; the reader never translates). Migrating at the studio adoption
// boundary — where the archive's logs are copied INTO the working-store-shaped resident OPFS store —
// keeps the invariant "nothing downstream of the seam ever sees a legacy id in a live store" without
// adding a second decode path here and without touching the Viewer.

import { ZipFilesystem } from "../fs/zip.js";
import type { Filesystem } from "../fs/seam.js";
import { validateArchieMarker } from "./marker.js";

// Default cap on untrusted `.archie.zip` bytes, in hand or fetched (ADR-0009 untrusted-content
// boundary). The ONE definition lives layer-zero in ../limits.ts (fs/http.ts shares it; fs/ must
// not import from publish/) — re-exported here because this seam is its documented surface.
import { SRC_MAX_BYTES } from "../limits.js";
export { SRC_MAX_BYTES };

/** Normalize a thrown open-path error to a user-facing message. `ZipFilesystem.fromZip`'s zip-bomb
 *  caps and `validateArchieMarker`'s ADR-0020 rejects already carry friendly messages, so re-throw an
 *  Error verbatim; a non-Error throw (shouldn't happen) degrades to one generic line. */
function openError(e: unknown): never {
  throw e instanceof Error
    ? e
    : new Error("That file couldn't be opened. Choose a published .archie.zip exported from Archie.");
}

/** A zip's first 4 bytes are the local-file-header signature `PK\x03\x04` (or the empty-archive
 *  `PK\x05\x06`). Exposed so a caller with an ambiguous source (a `.zip`-less URL) can decide whether
 *  fetched bytes are a zip before committing to `openArchieLibrary`. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06)
  );
}

/**
 * Decode + ADR-0020-validate untrusted `.archie.zip` bytes (or a `Blob` — a picked/dropped File
 * extends Blob, so callers never manually await `.arrayBuffer()`) into an opened `Filesystem`. There is
 * no way through this module's interface to obtain an un-validated `Filesystem` from bytes — that's
 * the whole point of the seam.
 *
 * Ordering: `ZipFilesystem.fromZip` (its own zip-bomb cap checks) runs BEFORE `validateArchieMarker` —
 * a decode failure ("not a zip" / cap breach) and a marker failure ("valid zip, wrong schema") are
 * distinct failure modes and must not be conflated.
 */
export async function openArchieLibrary(bytes: Uint8Array | Blob): Promise<Filesystem> {
  const raw = bytes instanceof Blob ? new Uint8Array(await bytes.arrayBuffer()) : bytes;
  let fs: ZipFilesystem;
  try {
    fs = ZipFilesystem.fromZip(raw); // throws on a zip-bomb cap breach (zip.ts) — friendly message
    await validateArchieMarker(fs); // ADR-0020: reject a non-Archie / wrong-schema zip BEFORE reading it
  } catch (e) {
    openError(e);
  }
  return fs;
}

/**
 * Fetch `url` under `maxBytes`, WITHOUT decoding or validating — for a caller that must inspect the
 * raw bytes (e.g. `looksLikeZip`) before deciding whether `openArchieLibrary` even applies.
 *
 * The cap is enforced TWICE, in order: first cheaply against a declared `content-length` header
 * BEFORE reading the body (fail fast), then again against the actual received byte length AFTER — so
 * a missing or lying header can't bypass the cap.
 */
export async function fetchArchieLibraryBytes(
  url: string,
  opts?: { fetch?: typeof fetch; maxBytes?: number },
): Promise<Uint8Array> {
  // Bound default — bare `fetch` breaks in browsers if a consumer ever object-stores it (WebIDL
  // receiver brand check; Node doesn't check, so tests can't see it). bound-fetch-defaults.md.
  const fetchImpl = opts?.fetch ?? globalThis.fetch.bind(globalThis);
  const maxBytes = opts?.maxBytes ?? SRC_MAX_BYTES;
  const res = await fetchImpl(url);
  if (!res.ok) {
    console.error(`open: couldn't fetch the library from ${url} — HTTP ${res.status}`);
    throw new Error("Couldn't open the library. The link may be broken or the file unavailable.");
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("That library is too large to open here.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("That library is too large to open here.");
  return bytes;
}

/** Composition for the modal case ("give me a validated library from this URL"): fetch under `maxBytes`
 *  then `openArchieLibrary` the result. The fetch step (network + both cap checks) runs to completion
 *  BEFORE the decode step, so a transport or size failure never spends CPU decoding a zip. */
export async function openArchieLibraryFromUrl(
  url: string,
  opts?: { fetch?: typeof fetch; maxBytes?: number },
): Promise<Filesystem> {
  return openArchieLibrary(await fetchArchieLibraryBytes(url, opts));
}

// Shared spike fixture — build a published `.archie.zip` bytes blob in-memory, the SAME way
// `interop.test.ts` does (libraryToZip → ZipFilesystem.fromZip), but with an EMBEDDED asset image
// at `{slug}/assets/{name}` so we can exercise the media crux (no server to resolve its URL).
//
// Prior art cited:
//   - publishLibrary / libraryToZipFs / readPublishedExhibit — render-core/src/publish/site.ts
//   - ZipFilesystem.fromZip / .toZip                          — render-core/src/fs/zip.ts
//   - appendNew / asClientId / the zip-roundtrip test shape   — render-core/src/publish/interop.test.ts
//
// NOTE: imported from render-core SOURCE via relative path (vitest resolves .ts). This spike does
// NOT depend on a built @render/core — it reads the same source the app does, nothing more.

import { ZipFilesystem } from "../../packages/render-core/src/fs/zip.js";
import { publishLibrary } from "../../packages/render-core/src/publish/site.js";
import { appendNew } from "../../packages/render-core/src/spine/log.js";
import { asClientId } from "../../packages/render-core/src/wadm/brand.js";
import type { Library } from "../../packages/render-core/src/model/model.js";
import type { AnnotationLog } from "../../packages/render-core/src/wadm/types.js";

export const BASE = "https://u.gh.io/lib/";
export const SLUG = "voynich";
const author = asClientId("curator");

// A 1x1 PNG (8-byte sig + minimal chunks). The exact bytes don't matter — what matters is that
// the SAME bytes survive the zip round-trip and resolve to a usable URL on the read side.
export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
export const ASSET_NAME = "plate.png";

const canvasId = `${BASE}${SLUG}/canvas/o1`;

/** Note 1: a plain head note on the canvas. Note 2: a note whose body carries note-media via
 *  markdown (`![](/assets/plate.png)`) — the NoteMedia/NoteLightbox `m.url` sink (fed by
 *  splitNoteMedia). It points at the SAME embedded asset, so the read side must rewrite the
 *  in-body `/assets/` token to a blob too, not just object.source. */
function buildLog(): AnnotationLog {
  let log: AnnotationLog = [];
  ({ log } = appendNew(log, {
    target: canvasId,
    body: { type: "TextualBody", value: "a head note" },
    lastEditor: author,
    modifiedAt: "t",
    now: 1,
  }));
  ({ log } = appendNew(log, {
    target: canvasId,
    body: { type: "TextualBody", value: `Look ![](/assets/${ASSET_NAME}) here`, format: "text/markdown" },
    lastEditor: author,
    modifiedAt: "t",
    now: 2,
  }));
  return log;
}

export const library: Library = {
  id: "L",
  title: "Lib",
  exhibits: [
    {
      id: "e1",
      slug: SLUG,
      title: "Voynich",
      // source "/assets/{name}" is the Studio file-import shape (App.svelte:519 ASSET_PREFIX).
      objects: [{ id: "o1", source: `/assets/${ASSET_NAME}`, label: "folio 1" }],
    },
  ],
};

/** Publish the library to a ZipFilesystem WITH the embedded asset bytes (getAsset supplies them),
 *  serialize to `.archie.zip` bytes — exactly what a recipient is handed. */
export async function buildArchiveBytes(): Promise<Uint8Array> {
  const fs = new ZipFilesystem();
  const logs: Record<string, AnnotationLog> = { e1: buildLog() };
  await publishLibrary(fs, library, (id) => logs[id] ?? [], {
    baseUrl: BASE,
    getAsset: async (slug, name) => (slug === SLUG && name === ASSET_NAME ? PNG_BYTES.slice().buffer : null),
  });
  return fs.toZip();
}

/** Re-open the handed-over bytes as a ZipFilesystem (the portable-Viewer Open flow, zip.ts:fromZip). */
export function openArchive(bytes: Uint8Array): ZipFilesystem {
  return ZipFilesystem.fromZip(bytes);
}

/** A SECOND, DISTINCT library — same structure but a DIFFERENT title, so its manifest.json bytes
 *  differ from the primary fixture's. Used to prove S's cache isolation: two libraries registered in
 *  one origin must serve their OWN bytes for the same rel path, never cross-read. */
export async function buildArchiveBytesAlt(): Promise<Uint8Array> {
  const fs = new ZipFilesystem();
  const altLib: Library = {
    ...library,
    title: "OtherLib",
    exhibits: [{ ...library.exhibits[0]!, title: "Different Exhibit" }],
  };
  const logs: Record<string, AnnotationLog> = { e1: [] };
  await publishLibrary(fs, altLib, (id) => logs[id] ?? [], {
    baseUrl: BASE,
    getAsset: async (slug, name) => (slug === SLUG && name === ASSET_NAME ? PNG_BYTES.slice().buffer : null),
  });
  return fs.toZip();
}

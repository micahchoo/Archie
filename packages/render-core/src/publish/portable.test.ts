// Portable read seam (ADR-0010) — promoted from spikes/portable-viewer-seam/approach-p. Proves, at
// the data layer: (1) a published zip round-trips into the published.ts data shape; (2) an embedded
// `{slug}/assets/{name}` image resolves to a usable blob: URL on object.source; (3) blob URLs pass
// thumbnailUrl unchanged (zero sink change); (4) note-body `/assets/` media is rewritten too; (5)
// revoke() frees them; (6) the gallery index reads. Node v24 supplies Blob/createObjectURL and
// node:buffer.resolveObjectURL reads bytes back — the <img>/<video> PAINT is BROWSER-VERIFY-OWED.

import { describe, it, expect } from "vitest";
import { resolveObjectURL } from "node:buffer";
import { ZipFilesystem } from "../fs/zip.js";
import { publishLibrary } from "./site.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import { thumbnailUrl } from "../iiif/resolve.js";
import { splitNoteMedia } from "../note/media.js";
import { bodiesOfAnnotation } from "../query/published.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";
import { loadPortableExhibit, loadPortableGallery } from "./portable.js";
import { readExhibitTree, fsJsonSource } from "./read.js";

// --- fixture: build a published `.archie.zip`'s bytes WITH an embedded asset image -------------
const BASE = "https://u.gh.io/lib/";
const SLUG = "voynich";
const ASSET_NAME = "plate.png";
const author = asClientId("curator");
// A 1x1 PNG — the exact bytes don't matter, only that the SAME bytes survive the round-trip.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
const canvasId = `${BASE}${SLUG}/canvas/o1`;

function buildLog(): AnnotationLog {
  let log: AnnotationLog = [];
  ({ log } = appendNew(log, { target: canvasId, body: { type: "TextualBody", value: "a head note" }, lastEditor: author, modifiedAt: "t", now: 1 }));
  ({ log } = appendNew(log, { target: canvasId, body: { type: "TextualBody", value: `Look ![](/assets/${ASSET_NAME}) here`, format: "text/markdown" }, lastEditor: author, modifiedAt: "t", now: 2 }));
  return log;
}

const library: Library = {
  id: asLibraryId("L"),
  title: "Lib",
  exhibits: [{ id: asExhibitId("e1"), slug: SLUG, title: "Voynich", objects: [{ id: asObjectId("o1"), source: `/assets/${ASSET_NAME}`, label: "folio 1" }] }],
};

async function buildArchiveBytes(): Promise<Uint8Array> {
  const fs = new ZipFilesystem();
  const logs: Record<string, AnnotationLog> = { e1: buildLog() };
  await publishLibrary(fs, library, (id) => logs[id] ?? [], {
    baseUrl: BASE,
    getAsset: async (slug, name) => (slug === SLUG && name === ASSET_NAME ? PNG_BYTES.slice().buffer : null),
  });
  return fs.toZip();
}
const openArchive = (bytes: Uint8Array) => ZipFilesystem.fromZip(bytes);

// Regression fixture (separate, per the test-fixtures rule): an exhibit slug that is itself "assets" →
// the published source is `${baseUrl}assets/assets/${name}`, TWO `/assets/` segments. The blob rewrite
// must key on the LAST one (the asset dir), not the first (the slug).
async function buildAssetsSlugArchive(): Promise<Uint8Array> {
  const fs = new ZipFilesystem();
  const lib: Library = {
    id: asLibraryId("L"), title: "Lib",
    exhibits: [{ id: asExhibitId("e1"), slug: "assets", title: "Assets", objects: [{ id: asObjectId("o1"), source: `/assets/${ASSET_NAME}`, label: "shot" }] }],
  };
  await publishLibrary(fs, lib, () => [], {
    baseUrl: BASE,
    getAsset: async (slug, name) => (slug === "assets" && name === ASSET_NAME ? PNG_BYTES.slice().buffer : null),
  });
  return fs.toZip();
}
// ------------------------------------------------------------------------------------------------

describe("portable read seam (ADR-0010) over a ZipFilesystem", () => {
  it("round-trips the published tree into the PublishedExhibitData shape + readings (data parity)", async () => {
    const { exhibit, revoke } = await loadPortableExhibit(openArchive(await buildArchiveBytes()), SLUG);
    expect(exhibit.title).toBe("Voynich");
    expect(exhibit.objects.map((o) => o.id)).toEqual(["o1"]);
    expect(exhibit.canvasIdByObject.o1).toBe(`${BASE}${SLUG}/canvas/o1`);
    expect(exhibit.annotationsByObject.o1?.length).toBe(2);
    // The readings registry is present (empty here) — the field readPublishedExhibit OMITS.
    expect(Array.isArray(exhibit.readings)).toBe(true);
    expect(exhibit.readingAnnotationsByObject).toBeDefined();
    revoke();
  });

  it("resolves an assets/-embedded image to a usable blob: URL on object.source (the media crux)", async () => {
    const { exhibit, blobUrls, revoke } = await loadPortableExhibit(openArchive(await buildArchiveBytes()), SLUG);
    const src = exhibit.objects[0]!.source;
    expect(src.startsWith("blob:")).toBe(true);
    expect(blobUrls).toContain(src);
    const blob = resolveObjectURL(src);
    expect(blob).toBeDefined();
    expect(blob!.type).toBe("image/png");
    expect([...new Uint8Array(await blob!.arrayBuffer())]).toEqual([...PNG_BYTES]);
    revoke();
  });

  it("resolves the embedded image when the exhibit slug is itself \"assets\" (slug ↔ /assets/ collision)", async () => {
    const { exhibit, blobUrls, revoke } = await loadPortableExhibit(openArchive(await buildAssetsSlugArchive()), "assets");
    const src = exhibit.objects[0]!.source;
    expect(src.startsWith("blob:"), `expected a blob: URL for an "assets"-named exhibit, got ${src}`).toBe(true);
    expect(blobUrls).toContain(src);
    revoke();
  });

  it("blob: URLs pass thumbnailUrl unchanged (zero component change at the sink)", async () => {
    const { exhibit, revoke } = await loadPortableExhibit(openArchive(await buildArchiveBytes()), SLUG);
    const src = exhibit.objects[0]!.source;
    expect(thumbnailUrl(src, 480)).toBe(src);
    revoke();
  });

  it("rewrites note-body /assets/ media to a blob: URL (the NoteMedia/NoteLightbox m.url sink)", async () => {
    const { exhibit, revoke } = await loadPortableExhibit(openArchive(await buildArchiveBytes()), SLUG);
    const notes = exhibit.annotationsByObject.o1!;
    const mediaNote = notes.find((n) => {
      const v = bodiesOfAnnotation(n)[0] as { value?: string } | undefined;
      return typeof v?.value === "string" && v.value.includes("blob:");
    });
    expect(mediaNote, "the note carrying /assets/ media must have a rewritten body").toBeDefined();
    const value = (bodiesOfAnnotation(mediaNote!)[0] as { value: string }).value;
    expect(value.includes("/assets/")).toBe(false);
    expect(value.includes("blob:")).toBe(true);
    const parts = splitNoteMedia(value);
    expect(parts.media[0]?.kind).toBe("image");
    const url = parts.media[0]!.url;
    expect(url.startsWith("blob:")).toBe(true);
    const blob = resolveObjectURL(url);
    expect([...new Uint8Array(await blob!.arrayBuffer())]).toEqual([...PNG_BYTES]);
    revoke();
  });

  it("revoke() frees every minted blob URL (App.svelte:99 lifecycle)", async () => {
    const { blobUrls, revoke } = await loadPortableExhibit(openArchive(await buildArchiveBytes()), SLUG);
    expect(blobUrls.length).toBeGreaterThan(0);
    revoke();
    expect(blobUrls.length).toBe(0);
  });

  it("loadPortableGallery reads the exhibits.json index from the archive", async () => {
    const gallery = await loadPortableGallery(openArchive(await buildArchiveBytes()));
    expect(gallery.exhibits.map((e) => e.slug)).toContain(SLUG);
  });
});

// --- baked-thumbnail fixture (separate, per the test-fixtures rule) -----------------------------
// An imported-asset object carrying a baked thumbnail: publishLibrary copies BOTH the master (getAsset)
// AND the thumbnail (getThumbnail) and rewrites object.thumbnail to its published assets-thumb/ URL. The
// thumbnail bytes are DISTINCT from the master so a test can prove the right derivative is served.
const THUMB_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66]);
const thumbLib: Library = {
  id: asLibraryId("L"), title: "Lib",
  exhibits: [{ id: asExhibitId("e1"), slug: SLUG, title: "Voynich",
    objects: [{ id: asObjectId("o1"), source: `/assets/${ASSET_NAME}`, label: "folio 1", thumbnail: `/assets-thumb/${ASSET_NAME}` }] }],
};
async function buildThumbArchive(): Promise<Uint8Array> {
  const fs = new ZipFilesystem();
  await publishLibrary(fs, thumbLib, () => [], {
    baseUrl: BASE,
    getAsset: async (s, n) => (s === SLUG && n === ASSET_NAME ? PNG_BYTES.slice().buffer : null),
    getThumbnail: async (s, n) => (s === SLUG && n === ASSET_NAME ? THUMB_BYTES.slice().buffer : null),
  });
  return fs.toZip();
}

describe("baked thumbnail (grid-overview load perf) round-trip", () => {
  it("publishLibrary copies the thumbnail + readExhibitTree recovers its published URL (hosted path)", async () => {
    const ex = await readExhibitTree(fsJsonSource(openArchive(await buildThumbArchive())), SLUG);
    expect(ex.objects[0]!.thumbnail).toBe(`${BASE}${SLUG}/assets-thumb/${ASSET_NAME}`);
  });

  it("loadPortableExhibit mints a blob: URL for the thumbnail carrying the THUMBNAIL bytes (not the master)", async () => {
    const { exhibit, blobUrls, revoke } = await loadPortableExhibit(openArchive(await buildThumbArchive()), SLUG);
    const thumb = exhibit.objects[0]!.thumbnail!;
    expect(thumb.startsWith("blob:")).toBe(true);
    expect(blobUrls).toContain(thumb);
    const blob = resolveObjectURL(thumb);
    expect([...new Uint8Array(await blob!.arrayBuffer())]).toEqual([...THUMB_BYTES]); // the small derivative, distinct from the master
    // The master source is its OWN, distinct blob (the grid uses thumbnail; the Reader uses source).
    expect(exhibit.objects[0]!.source.startsWith("blob:")).toBe(true);
    expect(exhibit.objects[0]!.source).not.toBe(thumb);
    revoke();
  });

  it("drops the thumbnail when getThumbnail is absent — no manifest ref to an unpublished file", async () => {
    const fs = new ZipFilesystem();
    await publishLibrary(fs, thumbLib, () => [], {
      baseUrl: BASE,
      getAsset: async (s, n) => (s === SLUG && n === ASSET_NAME ? PNG_BYTES.slice().buffer : null),
      // no getThumbnail wired → the working `/assets-thumb/` ref must be stripped at publish
    });
    const ex = await readExhibitTree(fsJsonSource(ZipFilesystem.fromZip(fs.toZip())), SLUG);
    expect(ex.objects[0]!.thumbnail).toBeUndefined();
  });
});

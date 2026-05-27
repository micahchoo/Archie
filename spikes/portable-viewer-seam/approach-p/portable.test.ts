import { describe, it, expect } from "vitest";
import { resolveObjectURL } from "node:buffer";
import { buildArchiveBytes, openArchive, BASE, SLUG, PNG_BYTES, ASSET_NAME } from "../fixture.js";
import { loadPortableExhibit } from "./portable.js";
import { ZipFilesystem } from "../../../packages/render-core/src/fs/zip.js";

// APPROACH P — data-provider + blob URLs. Proves, end-to-end at the data layer:
//   1. a published zip round-trips into the SAME data published.ts would fetch over HTTP;
//   2. `{slug}/assets/{name}`-embedded image bytes resolve to a usable blob: URL on object.source;
//   3. the revoke lifecycle frees them.
// happy-dom supplies Blob / URL.createObjectURL / fetch(blob:) so we can read the bytes BACK.

describe("Approach P — portable read seam over a ZipFilesystem", () => {
  it("round-trips the published tree into the published.ts data shape (data parity)", async () => {
    const bytes = await buildArchiveBytes();
    const fs = openArchive(bytes);
    const { exhibit, revoke } = await loadPortableExhibit(fs, SLUG);

    // Same fields published.ts:loadPublishedExhibit returns (apps/viewer/src/published.ts:28).
    expect(exhibit.title).toBe("Voynich");
    expect(exhibit.objects.map((o) => o.id)).toEqual(["o1"]);
    expect(exhibit.canvasIdByObject.o1).toBe(`${BASE}${SLUG}/canvas/o1`);
    expect(exhibit.annotationsByObject.o1?.length).toBe(2); // head note + the note-media note
    // readings registry is present (empty here) — the field readPublishedExhibit OMITS (site.ts:287).
    expect(Array.isArray(exhibit.readings)).toBe(true);
    expect(exhibit.readingAnnotationsByObject).toBeDefined();
    revoke();
  });

  it("resolves an `assets/`-embedded image to a usable blob: URL on object.source (the media crux)", async () => {
    const bytes = await buildArchiveBytes();
    const fs = openArchive(bytes);
    const { exhibit, blobUrls, revoke } = await loadPortableExhibit(fs, SLUG);

    const src = exhibit.objects[0]!.source;
    expect(src.startsWith("blob:")).toBe(true); // rewritten away from the unservable published path
    expect(blobUrls).toContain(src);

    // The blob is READABLE and carries the SAME bytes that were embedded (no server involved). We
    // read it back via node:buffer's resolveObjectURL — happy-dom v15 mints native Blob URLs but its
    // fetch() can't read blob: yet, so we go to the underlying registry (a node-test artifact only;
    // in a real browser `<img src=blob:…>` and fetch(blob:) both work — that's the BROWSER-VERIFY-OWED
    // line: the bytes are PROVEN correct here, the <img> paint is the human's eyeball check).
    const blob = resolveObjectURL(src);
    expect(blob).toBeDefined();
    expect(blob!.type).toBe("image/png"); // the mime we minted with → content-type for the sink
    const got = new Uint8Array(await blob!.arrayBuffer());
    expect(got.length).toBe(PNG_BYTES.length);
    expect([...got]).toEqual([...PNG_BYTES]);

    revoke();
  });

  it("blob: URLs pass through thumbnailUrl unchanged (zero component change at the sink)", async () => {
    // The load-bearing reuse fact: resolve.ts:thumbnailUrl passes blob:/data: through as-is
    // (render-core/src/iiif/resolve.test.ts:46). So ObjectGrid/Reader's thumbnailUrl(obj.source,…)
    // renders the blob with NO change. We assert it here directly against the real core function.
    const { thumbnailUrl } = await import("../../../packages/render-core/src/index.js");
    const bytes = await buildArchiveBytes();
    const fs = openArchive(bytes);
    const { exhibit, revoke } = await loadPortableExhibit(fs, SLUG);
    const src = exhibit.objects[0]!.source;
    expect(thumbnailUrl(src, 480)).toBe(src); // unchanged → grid/reader render the blob directly
    revoke();
  });

  it("rewrites note-body `/assets/` media to a blob: URL (the NoteMedia/NoteLightbox m.url sink)", async () => {
    // The advisor's load-bearing flag: P must rewrite BOTH object.source AND note-body media, else
    // NoteMedia silently breaks. The fixture's 2nd note body is `Look ![](/assets/plate.png) here`.
    const { splitNoteMedia } = await import("../../../packages/render-core/src/index.js");
    const { resolveObjectURL } = await import("node:buffer");
    const bytes = await buildArchiveBytes();
    const fs = openArchive(bytes);
    const { exhibit, revoke } = await loadPortableExhibit(fs, SLUG);

    const notes = exhibit.annotationsByObject.o1!;
    expect(notes.length).toBe(2);
    const mediaNote = notes.find((n) => {
      const v = (Array.isArray(n.body) ? n.body[0] : n.body) as { value?: string } | undefined;
      return typeof v?.value === "string" && v.value.includes("blob:");
    });
    expect(mediaNote, "the note carrying /assets/ media must have a rewritten body").toBeDefined();

    const value = ((Array.isArray(mediaNote!.body) ? mediaNote!.body[0] : mediaNote!.body) as { value: string }).value;
    expect(value.includes("/assets/")).toBe(false); // the unservable token is gone
    expect(value.includes("blob:")).toBe(true); // replaced by a blob url

    // The DOWNSTREAM sink (splitNoteMedia → NoteMedia m.url) now yields a usable blob url.
    const parts = splitNoteMedia(value);
    expect(parts.media[0]?.kind).toBe("image");
    const url = parts.media[0]!.url;
    expect(url.startsWith("blob:")).toBe(true);
    // …and that blob carries the embedded bytes — note-body media works with no component change.
    const blob = resolveObjectURL(url);
    expect([...new Uint8Array(await blob!.arrayBuffer())]).toEqual([...PNG_BYTES]);

    revoke();
  });

  it("the asset directory existed in the archive before rewrite (the zip carried the bytes)", async () => {
    // Sanity: the source-of-truth published path that has NO server to resolve it.
    const bytes = await buildArchiveBytes();
    const raw = ZipFilesystem.fromZip(bytes);
    const root = await raw.root();
    const assets = await (await root.getDirectory(SLUG)).getDirectory("assets");
    const file = await assets.getFile(ASSET_NAME);
    const embedded = new Uint8Array(await file.readable());
    expect([...embedded]).toEqual([...PNG_BYTES]);
  });

  it("revoke() frees every minted blob URL (App.svelte:99 lifecycle)", async () => {
    const bytes = await buildArchiveBytes();
    const fs = openArchive(bytes);
    const { blobUrls, revoke } = await loadPortableExhibit(fs, SLUG);
    expect(blobUrls.length).toBeGreaterThan(0);
    revoke();
    expect(blobUrls.length).toBe(0); // handle cleared; URL.revokeObjectURL called on each
  });
});

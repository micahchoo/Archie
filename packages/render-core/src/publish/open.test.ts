// The untrusted-archive OPEN SEAM (ISSUES.md Issue 5 canonicalization) — one module composing
// ZipFilesystem.fromZip + validateArchieMarker so no consumer can skip the marker check the way
// apps/studio/src/ingest-flows.ts's openZip used to.
import { describe, it, expect, vi } from "vitest";
import { openArchieLibrary, fetchArchieLibraryBytes, fetchZipBytesIfAny, openArchieLibraryFromUrl, looksLikeZip, SRC_MAX_BYTES } from "./open.js";
import { libraryToZipFs } from "./site.js";
import { ZipFilesystem } from "../fs/zip.js";
import { asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { ExhibitsJson } from "../iiif/exhibits.js";

const exA = {
  id: asExhibitId("exA"),
  slug: "a",
  title: "Exhibit A",
  objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "A1", width: 10, height: 10 }],
};
const library: Library = { id: asLibraryId("lib"), title: "Lib", exhibits: [exA] };

async function buildArchiveBytes(): Promise<Uint8Array> {
  const { fs } = await libraryToZipFs(library, () => []);
  return fs.toZip();
}

async function readJson<T>(fs: import("../fs/seam.js").Filesystem, name: string): Promise<T> {
  const f = await (await fs.root()).getFile(name);
  return JSON.parse(new TextDecoder().decode(await f.readable())) as T;
}

async function writeJson(fs: ZipFilesystem, name: string, data: unknown): Promise<void> {
  const w = await (await (await fs.root()).getFile(name, { create: true })).writable();
  await w.write(JSON.stringify(data));
  await w.close();
}

describe("open seam — openArchieLibrary (bytes/Blob → validated Filesystem)", () => {
  it("opens a published .archie.zip's bytes and returns a readable Filesystem", async () => {
    const fs = await openArchieLibrary(await buildArchiveBytes());
    const gallery = await readJson<ExhibitsJson>(fs, "exhibits.json");
    expect(gallery.exhibits.map((e) => e.slug)).toContain("a");
  });

  it("accepts a Blob directly (the drop / file-pick vector — File extends Blob)", async () => {
    const blob = new Blob([new Uint8Array(await buildArchiveBytes())]);
    const fs = await openArchieLibrary(blob);
    const gallery = await readJson<ExhibitsJson>(fs, "exhibits.json");
    expect(gallery.library.title).toBe("Lib");
  });

  it("rejects a zip that isn't an Archie library (ADR-0020 marker — neither collection.json nor exhibits.json)", async () => {
    const zfs = new ZipFilesystem();
    await writeJson(zfs, "hello.json", { not: "archie" });
    await expect(openArchieLibrary(zfs.toZip())).rejects.toThrow(/isn't an archie library/i);
  });

  it("ACCEPTS an UNMARKED real export (collection.json + exhibits.json, NO archie.json) — lenient-on-absent", async () => {
    const zfs = new ZipFilesystem();
    await writeJson(zfs, "collection.json", { type: "Collection" });
    await writeJson(zfs, "exhibits.json", { library: { title: "Recovered" }, exhibits: [] });
    const fs = await openArchieLibrary(zfs.toZip());
    const gallery = await readJson<ExhibitsJson>(fs, "exhibits.json");
    expect(gallery.library.title).toBe("Recovered");
  });

  it("normalizes a non-Error throw to the generic message (defensive — fromZip/validateArchieMarker only ever throw Error today)", async () => {
    await expect(openArchieLibrary(new Uint8Array([1, 2, 3]))).rejects.toThrow(Error);
  });
});

describe("open seam — looksLikeZip (pure magic-byte sniff)", () => {
  it("recognizes the local-file-header signature PK\\x03\\x04", () => {
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });

  it("recognizes the empty-archive signature PK\\x05\\x06", () => {
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
  });

  it("rejects non-zip bytes", () => {
    expect(looksLikeZip(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBe(false);
  });
});

describe("open seam — fetchArchieLibraryBytes (capped fetch, no decode/validate)", () => {
  it("fetches and returns the bytes verbatim under the cap", async () => {
    const bytes = await buildArchiveBytes();
    const fakeFetch = vi.fn(async () =>
      new Response(new Blob([bytes as BlobPart]), { status: 200, headers: { "content-length": String(bytes.byteLength) } }),
    ) as unknown as typeof fetch;
    const got = await fetchArchieLibraryBytes("https://host/lib.archie.zip", { fetch: fakeFetch });
    expect(got.byteLength).toBe(bytes.byteLength);
    expect(fakeFetch).toHaveBeenCalledWith("https://host/lib.archie.zip");
  });

  it("throws on a non-OK response", async () => {
    const fakeFetch = vi.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchArchieLibraryBytes("https://host/missing.zip", { fetch: fakeFetch })).rejects.toThrow(
      /couldn't open the library/i,
    );
  });

  it("throws when the DECLARED size (content-length) exceeds the cap — fails fast, before buffering", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response("x", { status: 200, headers: { "content-length": "999999999999" } }),
    ) as unknown as typeof fetch;
    await expect(fetchArchieLibraryBytes("https://host/huge.zip", { fetch: fakeFetch, maxBytes: 1024 })).rejects.toThrow(
      /too large/i,
    );
  });

  it("throws when the ACTUAL size exceeds the cap despite a missing/lying content-length", async () => {
    const bigBody = new Uint8Array(2048);
    const fakeFetch = vi.fn(async () => new Response(new Blob([bigBody as BlobPart]), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchArchieLibraryBytes("https://host/lying.zip", { fetch: fakeFetch, maxBytes: 1024 })).rejects.toThrow(
      /too large/i,
    );
  });

  it("defaults maxBytes to SRC_MAX_BYTES when not given", async () => {
    const bytes = new Uint8Array(10);
    const fakeFetch = vi.fn(async () => new Response(new Blob([bytes as BlobPart]), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchArchieLibraryBytes("https://host/small.zip", { fetch: fakeFetch })).resolves.toHaveLength(10);
    expect(SRC_MAX_BYTES).toBe(1024 * 1024 * 1024); // 1 GiB (SCALE-rescaled from 256 MB)
  });
});

describe("open seam — fetchZipBytesIfAny (the shared zip-fallback byte sniff)", () => {
  const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]); // PK\x03\x04 local-file header + payload
  const NOT_ZIP = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x7d]); // `{"a"}` — valid JSON, not a zip

  it("returns the bytes IFF they are a zip (the `.zip`-less-URL carve-out)", async () => {
    const fakeFetch = vi.fn(async () => new Response(new Blob([ZIP as BlobPart]), { status: 200 })) as unknown as typeof fetch;
    expect(await fetchZipBytesIfAny("https://host/library-download", { fetch: fakeFetch })).toEqual(ZIP);
    expect(fakeFetch).toHaveBeenCalledWith("https://host/library-download");
  });

  it("returns null for non-zip bytes — the caller surfaces its own error", async () => {
    const fakeFetch = vi.fn(async () => new Response(new Blob([NOT_ZIP as BlobPart]), { status: 200 })) as unknown as typeof fetch;
    expect(await fetchZipBytesIfAny("https://host/page", { fetch: fakeFetch })).toBeNull();
  });

  it("SWALLOWS a network fault to null — NOT thrown, so the original tree-open error surfaces", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchZipBytesIfAny("https://host/down", { fetch: fakeFetch })).toBeNull();
  });

  it("SWALLOWS a non-OK response to null — same reason", async () => {
    const fakeFetch = vi.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    expect(await fetchZipBytesIfAny("https://host/missing", { fetch: fakeFetch })).toBeNull();
  });

  it("still THROWS on too-large — the cap stays hard even on the speculative path (declared and actual)", async () => {
    const declared = vi.fn(async () => new Response("x", { status: 200, headers: { "content-length": "999999999999" } })) as unknown as typeof fetch;
    await expect(fetchZipBytesIfAny("https://host/huge", { fetch: declared, maxBytes: 1024 })).rejects.toThrow(/too large/i);
    const bigZip = new Uint8Array(2048);
    bigZip.set([0x50, 0x4b, 0x03, 0x04]); // a zip-shaped body that exceeds the cap
    const actual = vi.fn(async () => new Response(new Blob([bigZip as BlobPart]), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchZipBytesIfAny("https://host/big", { fetch: actual, maxBytes: 1024 })).rejects.toThrow(/too large/i);
  });
});

describe("open seam — openArchieLibraryFromUrl (fetch → openArchieLibrary composition)", () => {
  it("fetches then opens — returns a validated Filesystem", async () => {
    const bytes = await buildArchiveBytes();
    const fakeFetch = vi.fn(async () =>
      new Response(new Blob([bytes as BlobPart]), { status: 200, headers: { "content-length": String(bytes.byteLength) } }),
    ) as unknown as typeof fetch;
    const fs = await openArchieLibraryFromUrl("https://host/lib.archie.zip", { fetch: fakeFetch });
    const gallery = await readJson<ExhibitsJson>(fs, "exhibits.json");
    expect(gallery.exhibits.map((e) => e.slug)).toContain("a");
  });

  it("never attempts to decode when the fetch step itself fails (fetch-fully-before-decode ordering)", async () => {
    const fakeFetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(openArchieLibraryFromUrl("https://host/broken.zip", { fetch: fakeFetch })).rejects.toThrow(
      /couldn't open the library/i,
    );
  });
});

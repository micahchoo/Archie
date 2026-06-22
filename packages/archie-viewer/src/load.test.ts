// LOAD SEAM tests (test-first). The seam holds NO module globals: every fn takes/returns its
// `LoadedLibrary` state explicitly, so two opens don't clobber each other. We build a real
// `.archie.zip` in memory (publishLibrary into a MemoryFilesystem → toZip) and round-trip it.
import { describe, it, expect, vi } from "vitest";
import {
  openZipBytes,
  openLibraryFromFile,
  openLibraryFromSrc,
  openLibraryFromTree,
  openFilesystem,
  readExhibit,
  SRC_MAX_BYTES,
} from "./load.js";
import {
  ZipFilesystem,
  MemoryFilesystem,
  publishLibrary,
  asLibraryId,
  asExhibitId,
  asObjectId,
  type Filesystem,
  type Library,
  type AnnotationLog,
} from "@render/core";

// A minimal one-exhibit, one-object library, published to a ZipFilesystem, serialized to zip bytes.
// Donor: apps/viewer/src/published.test.ts buildArchiveBytes — the canonical fixture shape (branded
// ids, getLog as the 3rd positional arg, fs.toZip()).
const SLUG = "alpha";
const library: Library = {
  id: asLibraryId("L"),
  title: "Test Library",
  summary: "A fixture library.",
  exhibits: [
    {
      id: asExhibitId("e1"),
      slug: SLUG,
      title: "Alpha Exhibit",
      summary: "first",
      objects: [{ id: asObjectId("o1"), source: "https://example.org/iiif/o1/info.json", label: "Plate I" }],
    },
  ],
};

async function buildArchiveBytes(): Promise<Uint8Array> {
  const fs = new ZipFilesystem();
  const logs: Record<string, AnnotationLog> = {};
  await publishLibrary(fs, library, (id) => logs[id] ?? [], { baseUrl: "https://u.gh.io/lib/" });
  return fs.toZip();
}

// Publish the SAME library into a MemoryFilesystem (a published *tree*, not a zip) and serve it over
// a fake `fetch` keyed by tree-relative path under a base URL — the hosted-mode shape the element's
// `src=<tree base>` vector consumes. Donor: apps/viewer httpSource (published.ts), but self-contained.
async function buildTree(): Promise<{ base: string; fetchImpl: typeof fetch }> {
  const mem = new MemoryFilesystem();
  const logs: Record<string, AnnotationLog> = {};
  await publishLibrary(mem, library, (id) => logs[id] ?? [], { baseUrl: "https://u.gh.io/lib/" });
  const base = "https://host/published/";
  const readPath = async (fs: Filesystem, path: string): Promise<Uint8Array | null> => {
    const parts = path.split("/");
    try {
      let dir = await fs.root();
      for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!);
      const file = await dir.getFile(parts[parts.length - 1]!);
      return new Uint8Array(await file.readable());
    } catch {
      return null;
    }
  };
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    if (!url.startsWith(base)) return new Response("not found", { status: 404 });
    const bytes = await readPath(mem, url.slice(base.length));
    if (!bytes) return new Response("not found", { status: 404 });
    return new Response(new Blob([bytes as BlobPart]), { status: 200 });
  }) as unknown as typeof fetch;
  return { base, fetchImpl };
}

describe("load seam — open vectors (no module globals)", () => {
  it("openZipBytes opens a published .archie.zip and reads its gallery", async () => {
    const lib = await openZipBytes(await buildArchiveBytes());
    expect(lib.gallery.exhibits.map((e) => e.slug)).toContain("alpha");
    expect(lib.gallery.library.title).toBe("Test Library");
  });

  it("openLibraryFromFile opens a Blob (the drop / file-pick vector)", async () => {
    const file = new Blob([new Uint8Array(await buildArchiveBytes())]);
    const lib = await openLibraryFromFile(file);
    expect(lib.gallery.exhibits[0]?.title).toBe("Alpha Exhibit");
  });

  it("rejects a zip that isn't an Archie library (ADR-0020 marker)", async () => {
    const zfs = new ZipFilesystem();
    const root = await zfs.root();
    const w = await (await root.getFile("hello.txt", { create: true })).writable();
    await w.write("not archie");
    await w.close();
    const bytes = await zfs.toZip();
    await expect(openZipBytes(bytes)).rejects.toThrow(/isn't an archie library/i);
  });

  it("two opens produce INDEPENDENT libraries (instance-context seam — no shared global)", async () => {
    const a = await openZipBytes(await buildArchiveBytes());
    const b = await openZipBytes(await buildArchiveBytes());
    expect(a.fs).not.toBe(b.fs);
    expect(a).not.toBe(b);
  });

  it("readExhibit returns the exhibit and a library carrying a fresh revoke (revoke lifecycle)", async () => {
    const lib0 = await openZipBytes(await buildArchiveBytes());
    const revoke0 = vi.fn();
    const lib = { ...lib0, revoke: revoke0 };
    const { exhibit, lib: lib1 } = await readExhibit(lib, "alpha");
    expect(revoke0).toHaveBeenCalledTimes(1); // previous exhibit's blobs freed before the next
    expect(exhibit.slug).toBe("alpha");
    expect(exhibit.objects[0]?.label).toBe("Plate I");
    expect(lib1.fs).toBe(lib.fs); // same opened fs, new revoke closure
    expect(lib1.revoke).not.toBe(revoke0);
  });

  it("openFilesystem reads a gallery from an already-opened fs (published-tree-base shape)", async () => {
    const zfs = ZipFilesystem.fromZip(await buildArchiveBytes());
    const lib = await openFilesystem(zfs);
    expect(lib.gallery.exhibits[0]?.slug).toBe("alpha");
  });
});

describe("load seam — src= fetch vector", () => {
  it("openLibraryFromSrc fetches bytes via the injected fetch and opens them", async () => {
    const bytes = await buildArchiveBytes();
    const fakeFetch = vi.fn(async () =>
      new Response(new Blob([bytes as BlobPart]), { status: 200, headers: { "content-length": String(bytes.byteLength) } }),
    ) as unknown as typeof fetch;
    const lib = await openLibraryFromSrc("https://host/lib.archie.zip", SRC_MAX_BYTES, fakeFetch);
    expect(lib.gallery.exhibits[0]?.slug).toBe("alpha");
    expect(fakeFetch).toHaveBeenCalledWith("https://host/lib.archie.zip");
  });

  it("openLibraryFromSrc throws on a non-OK response", async () => {
    const fakeFetch = vi.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(openLibraryFromSrc("https://host/missing.zip", SRC_MAX_BYTES, fakeFetch)).rejects.toThrow(
      /couldn't open the library/i,
    );
  });

  it("openLibraryFromSrc throws when the declared size exceeds the cap", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response("x", { status: 200, headers: { "content-length": "999999999999" } }),
    ) as unknown as typeof fetch;
    await expect(openLibraryFromSrc("https://host/huge.zip", 1024, fakeFetch)).rejects.toThrow(/too large/i);
  });
});

// Phase 2: a `src=` that is NOT a zip is treated as a published-TREE BASE — fetch base + exhibits.json
// for the gallery, then per-exhibit manifest.json lazily on open. The element passes the SAME entry
// (openLibraryFromSrc) for both; the dispatch picks zip-vs-tree. ADR-0020 marker over the HTTP tree:
// read base + archie.json if present and validate it; absent → accept when exhibits.json parses.
describe("load seam — published-tree-base vector", () => {
  it("openLibraryFromTree fetches the gallery from a tree base (exhibits.json)", async () => {
    const { base, fetchImpl } = await buildTree();
    const lib = await openLibraryFromTree(base, fetchImpl);
    expect(lib.gallery.exhibits.map((e) => e.slug)).toContain("alpha");
    expect(lib.gallery.library.title).toBe("Test Library");
  });

  it("reads a per-exhibit manifest lazily on readExhibit (HTTP source, no blob rewrite)", async () => {
    const { base, fetchImpl } = await buildTree();
    const lib = await openLibraryFromTree(base, fetchImpl);
    const { exhibit } = await readExhibit(lib, "alpha");
    expect(exhibit.slug).toBe("alpha");
    expect(exhibit.objects[0]?.label).toBe("Plate I");
    // Hosted images are URLs (not minted blobs) — the source survives the IIIF info.json verbatim.
    expect(exhibit.objects[0]?.source).toBe("https://example.org/iiif/o1/info.json");
  });

  it("openLibraryFromSrc DISPATCHES a non-zip src to the tree path", async () => {
    const { base, fetchImpl } = await buildTree();
    const lib = await openLibraryFromSrc(base, SRC_MAX_BYTES, fetchImpl);
    expect(lib.gallery.exhibits[0]?.slug).toBe("alpha");
  });

  it("validates the ADR-0020 marker when archie.json is present (rejects a foreign tree)", async () => {
    const base = "https://host/published/";
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url === `${base}archie.json`) {
        return new Response(JSON.stringify({ format: "not-archie" }), { status: 200 });
      }
      return new Response(JSON.stringify({ library: { title: "x" }, exhibits: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(openLibraryFromTree(base, fetchImpl)).rejects.toThrow(/isn't an archie library/i);
  });

  it("accepts a tree with NO archie.json when exhibits.json parses (documented fallback)", async () => {
    const base = "https://host/published/";
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url === `${base}archie.json`) return new Response("absent", { status: 404 });
      if (url === `${base}exhibits.json`) {
        return new Response(JSON.stringify({ library: { title: "Bare" }, exhibits: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    const lib = await openLibraryFromTree(base, fetchImpl);
    expect(lib.gallery.library.title).toBe("Bare");
  });

  it("rejects a tree whose exhibits.json is absent/corrupt", async () => {
    const base = "https://host/published/";
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url === `${base}archie.json`) return new Response("absent", { status: 404 });
      return new Response("<html>404</html>", { status: 404 });
    }) as unknown as typeof fetch;
    await expect(openLibraryFromTree(base, fetchImpl)).rejects.toThrow(/couldn't open the library/i);
  });
});

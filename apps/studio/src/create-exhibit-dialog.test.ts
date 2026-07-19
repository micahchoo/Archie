import { describe, it, expect, vi, afterEach } from "vitest";
import {
  surfaceTitle, createActionLabel, offersStartEmpty, offersMap, pickedFromFiles,
  emptyPathValid, folderPathValid, iiifPathValid, looksLikeUrl, previewManifest,
} from "./create-exhibit-dialog.js";

describe("CreateSurfaceScope copy (Archie-beb6's prop-level parameter)", () => {
  it("titles + labels the new-exhibit scope (the only one wired/shipped by Archie-51cc)", () => {
    expect(surfaceTitle({ kind: "new-exhibit" })).toBe("New exhibit");
    expect(createActionLabel({ kind: "new-exhibit" })).toBe("Create exhibit");
    expect(offersStartEmpty({ kind: "new-exhibit" })).toBe(true);
  });
  it("the add-to-exhibit scope resolves its copy + offers the Map path, not Start-empty (Archie-56cf)", () => {
    const scope = { kind: "add-to-exhibit" as const, slug: "herbal-quires", title: "Herbal quires" };
    expect(surfaceTitle(scope)).toBe("Add to “Herbal quires”");
    expect(createActionLabel(scope)).toBe("Add to exhibit");
    expect(offersStartEmpty(scope)).toBe(false);
    expect(offersMap(scope)).toBe(true);
  });
  it("the new-exhibit scope offers Start-empty but NOT the Map path (a map needs an existing exhibit)", () => {
    expect(offersMap({ kind: "new-exhibit" })).toBe(false);
    expect(offersStartEmpty({ kind: "new-exhibit" })).toBe(true);
  });
});

describe("pickedFromFiles — the one place a real File touches this module", () => {
  it("reads webkitRelativePath when a picker/drop set it, else falls back to name", () => {
    const withPath = Object.assign(new File([], "a.jpg", { type: "image/jpeg" }), { webkitRelativePath: "Box/a.jpg" });
    const bare = new File([], "b.jpg", { type: "image/jpeg" });
    expect(pickedFromFiles([withPath, bare])).toEqual([
      { name: "a.jpg", relativePath: "Box/a.jpg", type: "image/jpeg" },
      { name: "b.jpg", relativePath: "b.jpg", type: "image/jpeg" },
    ]);
  });
});

describe("path validity — gates the primary button per path (mirrors the prototype's syncCreateDisabled)", () => {
  it("empty path needs a non-blank title", () => {
    expect(emptyPathValid("")).toBe(false);
    expect(emptyPathValid("   ")).toBe(false);
    expect(emptyPathValid("Herbal quires")).toBe(true);
  });
  it("folder path needs a summary with at least one importable file", () => {
    expect(folderPathValid(null)).toBe(false);
    expect(folderPathValid({ total: 0 })).toBe(false);
    expect(folderPathValid({ total: 1 })).toBe(true);
  });
  it("IIIF path needs a resolved-valid preview", () => {
    expect(iiifPathValid("idle")).toBe(false);
    expect(iiifPathValid("checking")).toBe(false);
    expect(iiifPathValid("invalid")).toBe(false);
    expect(iiifPathValid("valid")).toBe(true);
  });
});

describe("looksLikeUrl — the pre-fetch check (a half-typed paste shouldn't flash an error)", () => {
  it("accepts a well-formed URL", () => {
    expect(looksLikeUrl("https://example.org/manifest.json")).toBe(true);
  });
  it("rejects a bare string", () => {
    expect(looksLikeUrl("not a link")).toBe(false);
  });
});

describe("previewManifest — the IIIF validation preview (Archie-51cc)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a valid manifest to title + canvas count, reusing manifestToExhibit", async () => {
    const manifest = {
      "@context": "https://iiif.io/api/presentation/3/context.json",
      type: "Manifest",
      label: { none: ["Voynich MS"] },
      items: [
        {
          type: "Canvas", label: { none: ["f1r"] }, width: 800, height: 1000,
          items: [{ type: "AnnotationPage", items: [{ type: "Annotation", motivation: "painting", body: {
            type: "Image", id: "https://x.org/iiif/2/img1/full/full/0/default.jpg",
            service: [{ "@id": "https://x.org/iiif/2/img1", type: "ImageService2", profile: "level1" }],
          } }] }],
        },
      ],
    };
    const body = new TextEncoder().encode(JSON.stringify(manifest));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer,
    })));
    const result = await previewManifest("https://x.org/manifest.json");
    expect(result).toEqual({ status: "valid", title: "Voynich MS", canvases: 1 });
  });

  it("maps a non-OK response to the plain-language unreachable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers() })));
    const result = await previewManifest("https://x.org/missing.json");
    expect(result).toEqual({ status: "invalid", message: "Couldn't reach that link — check the URL and try again." });
  });

  it("maps a thrown fetch (network failure) to the same unreachable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const result = await previewManifest("https://no-such-host.invalid/manifest.json");
    expect(result).toEqual({ status: "invalid", message: "Couldn't reach that link — check the URL and try again." });
  });

  it("reuses ManifestImportError's message VERBATIM for a IIIF Collection link (never a raw error string)", async () => {
    const collection = { type: "Collection", label: "Herbals" };
    const body = new TextEncoder().encode(JSON.stringify(collection));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer })));
    const result = await previewManifest("https://example.org/iiif/collections/herbals");
    expect(result).toEqual({
      status: "invalid",
      message: "This is a IIIF Collection (a list of manifests). Paste the URL of a single manifest instead.",
    });
  });

  it("maps a non-manifest JSON body to the generic plain-language message", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer })));
    const result = await previewManifest("https://example.org/not-a-manifest.json");
    expect(result).toEqual({ status: "invalid", message: "That URL didn't return a IIIF manifest." });
  });

  it("rejects an oversized body against the SAME cap ingest-flows.ts enforces (imported, not redeclared)", async () => {
    const big = new ArrayBuffer(33 * 1024 * 1024);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => big })));
    const result = await previewManifest("https://example.org/huge-manifest.json");
    expect(result).toEqual({ status: "invalid", message: "That IIIF link is too large to check here." });
  });
});

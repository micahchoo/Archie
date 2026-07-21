// resolveOsdTileSources — the native-fetch tile-source seam (Archie-fada). Pure logic, no OSD/DOM: it
// decides whether a source is pulled through the desktop native fetcher or the plain webview loader, and
// reports any blob: URL it minted so createMount can revoke it on destroy.
import { describe, it, expect, vi } from "vitest";
import { resolveOsdTileSources, type NativeFetch } from "./mount.js";
import type { TileSource, XyzTileSource, DziTileSource } from "@render/core";

const xyz: XyzTileSource = { kind: "xyz", template: "https://t/{z}/{x}/{y}.png", maxZoom: 3 };
const dzi: DziTileSource = { kind: "dzi", width: 1000, height: 800, tileSize: 254, overlap: 1, format: "image/jpeg", filesPath: "/assets/pyramid_files" };

/** A NativeFetch double whose calls are recorded — toBlobUrl returns a fixed blob URL, json a fixed object. */
function fakeNative(over: Partial<NativeFetch> = {}): NativeFetch & { toBlobUrl: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const toBlobUrl = vi.fn(async (_u: string) => "blob:mock-123");
  const json = vi.fn(async (_u: string) => ({ "@context": "http://iiif.io/api/image/2/context.json", "@id": "https://host/iiif/x", width: 4000, height: 3000 }));
  return { toBlobUrl, json, ...over } as never;
}

describe("resolveOsdTileSources — web / no native fetcher (byte-identical to before)", () => {
  it("plain remote image → OSD {type:image} with the ORIGINAL url, no blob minted", async () => {
    const ts: TileSource = { kind: "image", url: "https://host/pic.jpg" };
    const r = await resolveOsdTileSources(ts);
    expect(r.tileSources).toEqual({ type: "image", url: "https://host/pic.jpg" });
    expect(r.ownedBlobUrl).toBeNull();
  });

  it("iiif → the info.json URL string (OSD fetches it itself)", async () => {
    const ts: TileSource = { kind: "iiif", infoUrl: "https://host/iiif/x/info.json" };
    const r = await resolveOsdTileSources(ts);
    expect(r.tileSources).toBe("https://host/iiif/x/info.json");
    expect(r.ownedBlobUrl).toBeNull();
  });
});

describe("resolveOsdTileSources — desktop / native fetcher present", () => {
  it("remote image → native blob: URL, and reports it as ownedBlobUrl to revoke", async () => {
    const nf = fakeNative();
    const ts: TileSource = { kind: "image", url: "https://host/pic.jpg" };
    const r = await resolveOsdTileSources(ts, nf);
    expect(nf.toBlobUrl).toHaveBeenCalledWith("https://host/pic.jpg");
    expect(r.tileSources).toEqual({ type: "image", url: "blob:mock-123" });
    expect(r.ownedBlobUrl).toBe("blob:mock-123");
  });

  it("iiif → info.json fetched + parsed natively, handed to OSD as a DATA tile source; no blob", async () => {
    const nf = fakeNative();
    const ts: TileSource = { kind: "iiif", infoUrl: "https://host/iiif/x/info.json" };
    const r = await resolveOsdTileSources(ts, nf);
    expect(nf.json).toHaveBeenCalledWith("https://host/iiif/x/info.json");
    expect(nf.toBlobUrl).not.toHaveBeenCalled();
    expect(r.tileSources).toMatchObject({ "@id": "https://host/iiif/x", width: 4000 });
    expect(r.ownedBlobUrl).toBeNull();
  });

  it("blob:/data: image source is NOT re-fetched (already same-origin bytes)", async () => {
    const nf = fakeNative();
    const ts: TileSource = { kind: "image", url: "blob:already-local" };
    const r = await resolveOsdTileSources(ts, nf);
    expect(nf.toBlobUrl).not.toHaveBeenCalled();
    expect(r.tileSources).toEqual({ type: "image", url: "blob:already-local" });
    expect(r.ownedBlobUrl).toBeNull();
  });

  it("xyz map is left on the webview loader (a per-tile native fetch is out of scope)", async () => {
    const nf = fakeNative();
    const r = await resolveOsdTileSources(xyz, nf);
    expect(nf.toBlobUrl).not.toHaveBeenCalled();
    expect(nf.json).not.toHaveBeenCalled();
    // The custom OSD tilesource config (getTileUrl present) — same object the webview path builds.
    expect(typeof (r.tileSources as { getTileUrl?: unknown }).getTileUrl).toBe("function");
    expect(r.ownedBlobUrl).toBeNull();
  });

  it("dzi pyramid is left on the webview loader (local baked tiles, no CORS problem)", async () => {
    const nf = fakeNative();
    const r = await resolveOsdTileSources(dzi, nf);
    expect(nf.toBlobUrl).not.toHaveBeenCalled();
    expect(nf.json).not.toHaveBeenCalled();
    expect(r.tileSources).toMatchObject({ Image: { Size: { Width: "1000" } } });
    expect(r.ownedBlobUrl).toBeNull();
  });

  it("a native-fetch throw falls back to the webview loader (never worse than web)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const nf = fakeNative({ toBlobUrl: vi.fn(async () => { throw new Error("host down"); }) });
    const ts: TileSource = { kind: "image", url: "https://host/pic.jpg" };
    const r = await resolveOsdTileSources(ts, nf);
    expect(r.tileSources).toEqual({ type: "image", url: "https://host/pic.jpg" });
    expect(r.ownedBlobUrl).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

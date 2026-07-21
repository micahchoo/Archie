import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZipFilesystem } from "@render/core";
import { writeAllToTauriHandle, openTauriStreamingZipSave, fetchRemoteAsBlobUrl, fetchRemoteJson, type TauriFileHandleLike } from "./tauri-fs.js";

// The desktop streaming zip sink (the Tauri analogue of openStreamingZipSave). The @tauri-apps
// plugins only exist inside the webview, so they're mocked at the module seam; these pin the
// orchestration contract — the POSIX partial-write loop, dialog-cancel → null, staged bytes forming
// a REAL archive, and abort removing the partial export. The real plugin adapter is verified in the
// packaged app (same posture as the FSA picker path, browser-verified only).

const h = vi.hoisted(() => ({
  savePath: null as string | null,
  written: [] as Uint8Array[],
  maxPerWrite: Number.POSITIVE_INFINITY, // simulate POSIX short writes when finite
  closed: 0,
  removed: [] as string[],
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: async () => h.savePath,
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  open: async () => ({
    write: async (data: Uint8Array) => {
      const n = Math.min(data.byteLength, h.maxPerWrite);
      h.written.push(data.slice(0, n));
      return n;
    },
    close: async () => void h.closed++,
  }),
  remove: async (p: string) => void h.removed.push(p),
}));

// The native http bridge (Archie-fada). plugin-http only exists inside the webview, so it's mocked at the
// module seam; `http.resp` is the response the next `fetch` resolves to (set per test).
const http = vi.hoisted(() => ({
  resp: null as null | { ok: boolean; status: number; headers: Headers; json: () => Promise<unknown>; arrayBuffer: () => Promise<ArrayBuffer> },
}));
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(async (_url: string) => http.resp),
}));

beforeEach(() => {
  h.savePath = null;
  h.written = [];
  h.maxPerWrite = Number.POSITIVE_INFINITY;
  h.closed = 0;
  h.removed = [];
});

const concatWritten = (): Uint8Array => {
  const total = h.written.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of h.written) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
};

describe("tauri streaming zip — writeAllToTauriHandle (POSIX partial-write loop)", () => {
  it("loops until a short-writing handle has committed every byte, in order", async () => {
    const committed: number[] = [];
    const fh: TauriFileHandleLike = {
      write: async (d) => {
        const n = Math.min(d.byteLength, 3); // commit at most 3 bytes per call
        committed.push(...d.subarray(0, n));
        return n;
      },
      close: async () => {},
    };
    const chunk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await writeAllToTauriHandle(fh, chunk);
    expect(committed).toEqual([...chunk]); // all bytes, exactly once, in order
  });

  it("throws (instead of spinning) on a handle that makes no progress", async () => {
    const fh: TauriFileHandleLike = { write: async () => 0, close: async () => {} };
    await expect(writeAllToTauriHandle(fh, new Uint8Array(8))).rejects.toThrow(/no progress/i);
  });
});

describe("tauri streaming zip — openTauriStreamingZipSave", () => {
  it("returns null when the user cancels the save dialog", async () => {
    h.savePath = null;
    expect(await openTauriStreamingZipSave("lib.archie.zip")).toBeNull();
  });

  it("streams a publish (through short writes) into a valid archive at the picked path", async () => {
    h.savePath = "/home/u/exports/lib.archie.zip";
    h.maxPerWrite = 7; // force the partial-write loop on every chunk
    const target = (await openTauriStreamingZipSave("suggested.archie.zip"))!;
    expect(target.name).toBe("lib.archie.zip"); // what the dialog actually chose, not the suggestion

    const root = await target.fs.root();
    const dir = await root.getDirectory("voynich", { create: true });
    const w1 = await (await dir.getFile("manifest.json", { create: true })).writable();
    await w1.write('{"type":"Manifest"}');
    await w1.close();
    const w2 = await (await (await dir.getDirectory("assets", { create: true })).getFile("f1.jpg", { create: true })).writable();
    await w2.write(new Uint8Array(2048).fill(9).buffer);
    await w2.close();
    await target.finish();

    expect(h.closed).toBe(1); // finish closes the handle exactly once
    // The bytes the handle received reopen through the REAL open-side decoder.
    const reopened = await (await ZipFilesystem.fromZip(concatWritten()).root()).getDirectory("voynich");
    const man = await (await reopened.getFile("manifest.json")).readable();
    expect(new TextDecoder().decode(new Uint8Array(man))).toBe('{"type":"Manifest"}');
    const f1 = new Uint8Array(await (await (await reopened.getDirectory("assets")).getFile("f1.jpg")).readable());
    expect(f1).toEqual(new Uint8Array(2048).fill(9));
  });

  it("abort closes the handle and removes the partial export", async () => {
    h.savePath = "/home/u/exports/partial.archie.zip";
    const target = (await openTauriStreamingZipSave("x.archie.zip"))!;
    await target.abort();
    expect(h.closed).toBe(1);
    expect(h.removed).toEqual(["/home/u/exports/partial.archie.zip"]);
  });
});

// The native http bridge — the CORS/redirect escape hatch (Archie-fada). The plugin adapter is verified in
// the packaged app; these pin the ok/!ok contract and (for JSON) that the parsed value is returned as-is,
// which is what @render/mount hands OSD as a data tile source.
describe("tauri native http — fetchRemoteJson", () => {
  beforeEach(() => { http.resp = null; });
  afterEach(() => { http.resp = null; });

  it("returns the parsed JSON document on a 2xx (an IIIF info.json)", async () => {
    const info = { "@context": "http://iiif.io/api/image/2/context.json", "@id": "https://host/iiif/x", width: 4000, height: 3000 };
    http.resp = { ok: true, status: 200, headers: new Headers(), json: async () => info, arrayBuffer: async () => new ArrayBuffer(0) };
    expect(await fetchRemoteJson("https://host/iiif/x/info.json")).toEqual(info);
  });

  it("throws HTTP <status> on a non-ok response (no silent empty)", async () => {
    http.resp = { ok: false, status: 404, headers: new Headers(), json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    await expect(fetchRemoteJson("https://host/gone/info.json")).rejects.toThrow(/HTTP 404/);
  });
});

describe("tauri native http — fetchRemoteAsBlobUrl", () => {
  const origCreate = (globalThis.URL as { createObjectURL?: unknown }).createObjectURL;
  beforeEach(() => {
    http.resp = null;
    // Capture the Blob's declared type so we can assert the response content-type is carried onto it.
    (globalThis.URL as { createObjectURL?: unknown }).createObjectURL = vi.fn((b: Blob) => `blob:type=${b.type}`);
  });
  afterEach(() => {
    http.resp = null;
    (globalThis.URL as { createObjectURL?: unknown }).createObjectURL = origCreate;
  });

  it("wraps the fetched bytes in a same-origin blob: URL carrying the response content-type", async () => {
    http.resp = { ok: true, status: 200, headers: new Headers({ "content-type": "image/png" }), json: async () => ({}), arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    expect(await fetchRemoteAsBlobUrl("https://host/pic.png")).toBe("blob:type=image/png");
  });

  it("throws HTTP <status> on a non-ok response", async () => {
    http.resp = { ok: false, status: 502, headers: new Headers(), json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    await expect(fetchRemoteAsBlobUrl("https://host/x")).rejects.toThrow(/HTTP 502/);
  });
});

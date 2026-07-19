// HttpFilesystem targeted tests — the read-side guarantees the backend must re-establish
// (tauri-fs-seam discipline): absent-vs-failed classification (render-core-data-integrity #2),
// name containment on URL joins, capped reads, and the read-only refusals. The conformance-style
// read parity is covered separately (http.conformance.test.ts); this file pins the HTTP-specific
// seams, including composition with `fsJsonSource` — the real consumption path.

import { describe, it, expect } from "vitest";
import { HttpFilesystem, ReadOnlyFilesystemError } from "./http.js";
import { fsJsonSource, FailedReadError } from "../publish/read.js";

const BASE = "https://host/published";

/** A stubbed fetch over a URL→Response-factory map (factories: a Response body reads once).
 *  Unrouted URLs 404, mirroring a static host. Records every requested URL. */
function stub(routes: Record<string, () => Response | Promise<Response>>): {
  fetchImpl: typeof fetch;
  requested: string[];
} {
  const requested: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    const make = routes[url];
    return make ? make() : new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, requested };
}

async function readText(fs: HttpFilesystem, ...segments: string[]): Promise<string> {
  let dir = await fs.root();
  for (const s of segments.slice(0, -1)) dir = await dir.getDirectory(s);
  const file = await dir.getFile(segments[segments.length - 1]!);
  return new TextDecoder().decode(await file.readable());
}

describe("HttpFilesystem reads", () => {
  it("reads a root-level file's bytes", async () => {
    const { fetchImpl } = stub({ [`${BASE}/exhibits.json`]: () => new Response('{"ok":true}') });
    const fs = new HttpFilesystem(BASE, { fetch: fetchImpl });
    expect(await readText(fs, "exhibits.json")).toBe('{"ok":true}');
  });

  it("reads a nested file via lazy directory handles (one GET total)", async () => {
    const { fetchImpl, requested } = stub({ [`${BASE}/voynich/manifest.json`]: () => new Response("m") });
    const fs = new HttpFilesystem(BASE, { fetch: fetchImpl });
    expect(await readText(fs, "voynich", "manifest.json")).toBe("m");
    expect(requested).toEqual([`${BASE}/voynich/manifest.json`]); // no probe requests, exactly one GET
  });

  it("normalizes a base without a trailing slash (and keeps one with it)", async () => {
    const { fetchImpl, requested } = stub({ [`${BASE}/a.json`]: () => new Response("x") });
    expect(await readText(new HttpFilesystem(`${BASE}/`, { fetch: fetchImpl }), "a.json")).toBe("x");
    expect(requested).toEqual([`${BASE}/a.json`]);
  });

  it("getFile() mirrors name and size (seam parity with the other backends)", async () => {
    const { fetchImpl } = stub({ [`${BASE}/named.txt`]: () => new Response("data") });
    const root = await new HttpFilesystem(BASE, { fetch: fetchImpl }).root();
    const f = await (await root.getFile("named.txt")).getFile();
    expect(f).toBeInstanceOf(File);
    expect(f.name).toBe("named.txt");
    expect(f.size).toBe(4);
  });
});

describe("HttpFilesystem absent vs failed (data-integrity contract #2)", () => {
  it("404 → the seam's canonical no-such-file error (absent, NOT a FailedReadError)", async () => {
    const { fetchImpl } = stub({});
    const fs = new HttpFilesystem(BASE, { fetch: fetchImpl });
    const err = await readText(fs, "missing.json").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/no such file: missing\.json/);
    expect(err).not.toBeInstanceOf(FailedReadError);
  });

  it("composes with fsJsonSource: 404 → getOptional null (absent)", async () => {
    const { fetchImpl } = stub({});
    const src = fsJsonSource(new HttpFilesystem(BASE, { fetch: fetchImpl }));
    expect(await src.getOptional("gone/readings.json")).toBeNull();
  });

  it("500 → FailedReadError (failed, NEVER absent), through getOptional too", async () => {
    const { fetchImpl } = stub({ [`${BASE}/broken.json`]: () => new Response("oops", { status: 500 }) });
    const fs = new HttpFilesystem(BASE, { fetch: fetchImpl });
    await expect(readText(fs, "broken.json")).rejects.toBeInstanceOf(FailedReadError);
    const src = fsJsonSource(fs);
    await expect(src.getOptional("broken.json")).rejects.toBeInstanceOf(FailedReadError);
  });

  it("a network throw → FailedReadError carrying the path and cause", async () => {
    const boom = new TypeError("fetch failed");
    const fetchImpl = (async () => {
      throw boom;
    }) as unknown as typeof fetch;
    const fs = new HttpFilesystem(BASE, { fetch: fetchImpl });
    const err = await readText(fs, "net.json").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FailedReadError);
    expect((err as FailedReadError).path).toBe("net.json");
    expect((err as FailedReadError).cause).toBe(boom);
  });

  it("torn JSON (200, unparsable body) via fsJsonSource.getOptional → FailedReadError, not null", async () => {
    const { fetchImpl } = stub({ [`${BASE}/torn.json`]: () => new Response('{"truncat') });
    const src = fsJsonSource(new HttpFilesystem(BASE, { fetch: fetchImpl }));
    await expect(src.getOptional("torn.json")).rejects.toBeInstanceOf(FailedReadError);
  });

  it("a torn body (arrayBuffer() fails mid-transfer) → FailedReadError", async () => {
    const res = {
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => {
        throw new Error("aborted");
      },
    } as unknown as Response;
    const fetchImpl = (async () => res) as unknown as typeof fetch;
    const fs = new HttpFilesystem(BASE, { fetch: fetchImpl });
    await expect(readText(fs, "cut.json")).rejects.toBeInstanceOf(FailedReadError);
  });
});

describe("HttpFilesystem capped reads (SRC_MAX_BYTES posture)", () => {
  it("rejects on a declared content-length over the cap BEFORE reading the body", async () => {
    let bodyRead = false;
    const res = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": "999999" }),
      arrayBuffer: async () => {
        bodyRead = true;
        return new ArrayBuffer(0);
      },
    } as unknown as Response;
    const fs = new HttpFilesystem(BASE, { fetch: (async () => res) as unknown as typeof fetch, maxBytes: 8 });
    await expect(readText(fs, "big.json")).rejects.toBeInstanceOf(FailedReadError);
    expect(bodyRead).toBe(false); // fail-fast on the header, same as fetchArchieLibraryBytes
  });

  it("rejects on actual bytes over the cap even when the header lies small", async () => {
    const { fetchImpl } = stub({
      [`${BASE}/liar.json`]: () =>
        new Response("0123456789", { headers: { "content-length": "2" } }),
    });
    const fs = new HttpFilesystem(BASE, { fetch: fetchImpl, maxBytes: 8 });
    await expect(readText(fs, "liar.json")).rejects.toBeInstanceOf(FailedReadError);
  });

  it("passes a body at/under the cap", async () => {
    const { fetchImpl } = stub({ [`${BASE}/fits.json`]: () => new Response("12345678") });
    const fs = new HttpFilesystem(BASE, { fetch: fetchImpl, maxBytes: 8 });
    expect(await readText(fs, "fits.json")).toBe("12345678");
  });
});

describe("HttpFilesystem name containment (URL-join trust boundary)", () => {
  it("rejects traversal and separator-bearing segments WITHOUT issuing a request", async () => {
    const { fetchImpl, requested } = stub({});
    const root = await new HttpFilesystem(BASE, { fetch: fetchImpl }).root();
    for (const bad of ["..", ".", "", "a/b", "a\\b", "..\\up", "nul\0byte"]) {
      await expect(root.getFile(bad)).rejects.toThrow(/unsafe path segment/);
      await expect(root.getDirectory(bad)).rejects.toThrow(/unsafe path segment/);
    }
    expect(requested).toEqual([]);
  });

  it("percent-encodes segments so an encoded-traversal name stays a literal filename", async () => {
    const { fetchImpl, requested } = stub({
      [`${BASE}/sub%20dir/..%252Fup.json`]: () => new Response("contained"),
    });
    const fs = new HttpFilesystem(BASE, { fetch: fetchImpl });
    // "..%2Fup.json" is a hostile LITERAL name (not "..") — it must reach the wire double-encoded,
    // never as a path-affecting "../" once the server decodes it.
    expect(await readText(fs, "sub dir", "..%2Fup.json")).toBe("contained");
    expect(requested).toEqual([`${BASE}/sub%20dir/..%252Fup.json`]);
  });
});

describe("HttpFilesystem is read-only", () => {
  it("throws ReadOnlyFilesystemError from every mutating operation", async () => {
    const { fetchImpl, requested } = stub({});
    const root = await new HttpFilesystem(BASE, { fetch: fetchImpl }).root();
    await expect((await root.getFile("f.json")).writable()).rejects.toBeInstanceOf(ReadOnlyFilesystemError);
    await expect(root.getFile("f.json", { create: true })).rejects.toBeInstanceOf(ReadOnlyFilesystemError);
    await expect(root.getDirectory("d", { create: true })).rejects.toBeInstanceOf(ReadOnlyFilesystemError);
    await expect(root.remove("f.json")).rejects.toBeInstanceOf(ReadOnlyFilesystemError);
    expect(requested).toEqual([]); // refusals are local — nothing hits the network
  });

  it("entries() throws (unsupported) instead of yielding an empty listing", async () => {
    const { fetchImpl } = stub({});
    const root = await new HttpFilesystem(BASE, { fetch: fetchImpl }).root();
    await expect(
      (async () => {
        for await (const e of root.entries()) void e;
      })(),
    ).rejects.toThrow(/no directory listing/);
  });
});

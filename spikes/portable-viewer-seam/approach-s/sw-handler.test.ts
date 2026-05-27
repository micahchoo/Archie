import { describe, it, expect } from "vitest";
import { buildArchiveBytes, buildArchiveBytesAlt, BASE, SLUG, PNG_BYTES } from "../fixture.js";
import {
  handleArchiveFetch,
  parsePublishedUrl,
  cacheKeyFor,
  type LibraryRegistry,
} from "./sw-handler.js";
import { MutableRegistry } from "./sw-bootstrap.js";
import type { Filesystem } from "../../../packages/render-core/src/fs/seam.js";

// APPROACH S — node-test the PURE handler logic + cache-isolation keying. happy-dom supplies
// Request/Response. We do NOT register a real SW or use the real Cache API (browser-verify-owed).

const BASE_URL = "/repo/"; // a GH PROJECT site base path — the interception's worst case (fact #1)

async function registryWithLibrary(libId: string): Promise<MutableRegistry> {
  const reg = new MutableRegistry();
  reg.register(libId, await buildArchiveBytes());
  return reg;
}

function req(path: string): Request {
  return new Request(`https://u.github.io${path}`);
}

describe("Approach S — SW fetch handler over a ZipFilesystem (handler logic, node-verified)", () => {
  it("routes `${BASE_URL}published/<lib>/<path>` to the right archive file", () => {
    const p = parsePublishedUrl("https://u.github.io/repo/published/LIB1/voynich/manifest.json", BASE_URL);
    expect(p).toEqual({ libraryId: "LIB1", relPath: "voynich/manifest.json" });
  });

  it("returns undefined (fall-through to network) for URLs that aren't ours", async () => {
    const reg = await registryWithLibrary("LIB1");
    // app shell / deep-link, not a published asset
    expect(await handleArchiveFetch(req("/repo/index.html"), { baseUrl: BASE_URL, registry: reg })).toBeUndefined();
    // cross-origin IIIF image — different origin path, no `published/` prefix
    expect(await handleArchiveFetch(req("/repo/somewhere/else.json"), { baseUrl: BASE_URL, registry: reg })).toBeUndefined();
  });

  it("serves manifest.json bytes with application/json (the seam published.ts fetches)", async () => {
    const reg = await registryWithLibrary("LIB1");
    const res = await handleArchiveFetch(req("/repo/published/LIB1/voynich/manifest.json"), { baseUrl: BASE_URL, registry: reg });
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("application/json");
    const manifest = JSON.parse(await res!.text()) as { type?: string; items?: unknown[] };
    expect(manifest.type).toBe("Manifest");
    expect(manifest.items?.length).toBe(1); // o1
  });

  it("serves embedded `assets/` image bytes with the right content-type (the media crux, no rewrite)", async () => {
    // Under S the component's URL is UNCHANGED — published.ts's object.source is the published path,
    // and the SW resolves it to the embedded bytes. So media works with published.ts untouched.
    const reg = await registryWithLibrary("LIB1");
    const res = await handleArchiveFetch(req(`/repo/published/LIB1/${SLUG}/assets/plate.png`), { baseUrl: BASE_URL, registry: reg });
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("image/png");
    const got = new Uint8Array(await res!.arrayBuffer());
    expect([...got]).toEqual([...PNG_BYTES]); // same bytes that were embedded, served over the seam
  });

  it("returns 404 for an in-namespace file the archive lacks (fetchJsonOptional → null path)", async () => {
    const reg = await registryWithLibrary("LIB1");
    const res = await handleArchiveFetch(req(`/repo/published/LIB1/${SLUG}/readings.json`), { baseUrl: BASE_URL, registry: reg });
    expect(res).toBeDefined();
    expect(res!.status).toBe(404); // base-only exhibit has no readings.json — honest 404
  });

  it("returns undefined for a known prefix but UNKNOWN library (don't fake-serve)", async () => {
    const reg = await registryWithLibrary("LIB1");
    const res = await handleArchiveFetch(req("/repo/published/LIB_UNKNOWN/voynich/manifest.json"), { baseUrl: BASE_URL, registry: reg });
    expect(res).toBeUndefined(); // not in registry → fall through, network 404s it
  });
});

describe("Approach S — cache isolation: two libraries in one origin can't cross-read", () => {
  it("namespaces the cache key by libraryId", () => {
    const a = cacheKeyFor("LIB_A", "voynich/manifest.json");
    const b = cacheKeyFor("LIB_B", "voynich/manifest.json");
    expect(a).not.toBe(b); // SAME rel path, DIFFERENT library → different cache namespace
    expect(a).toContain("LIB_A");
    expect(b).toContain("LIB_B");
  });

  it("two DIFFERENT libraries registered in one origin each serve their OWN bytes, never cross-read", async () => {
    // The load-bearing isolation claim: register DISTINCT archives under LIB_A and LIB_B, request the
    // SAME rel path under each, assert the bytes DIFFER (LIB_B's request is not served LIB_A's bytes).
    const reg = new MutableRegistry();
    reg.register("LIB_A", await buildArchiveBytes());      // title "Voynich"
    reg.register("LIB_B", await buildArchiveBytesAlt());   // title "Different Exhibit"
    const rel = `${SLUG}/manifest.json`;

    const resA = await handleArchiveFetch(req(`/repo/published/LIB_A/${rel}`), { baseUrl: BASE_URL, registry: reg });
    const resB = await handleArchiveFetch(req(`/repo/published/LIB_B/${rel}`), { baseUrl: BASE_URL, registry: reg });
    expect(resA!.status).toBe(200);
    expect(resB!.status).toBe(200);

    const mA = JSON.parse(await resA!.text()) as { label?: { none?: string[] } };
    const mB = JSON.parse(await resB!.text()) as { label?: { none?: string[] } };
    expect(mA.label?.none?.[0]).toBe("Voynich");
    expect(mB.label?.none?.[0]).toBe("Different Exhibit"); // LIB_B got ITS OWN bytes, not LIB_A's
    expect(mA.label?.none?.[0]).not.toBe(mB.label?.none?.[0]); // no cross-read

    expect(resA!.headers.get("x-archie-cache-key")).toBe(cacheKeyFor("LIB_A", rel));
    expect(resB!.headers.get("x-archie-cache-key")).toBe(cacheKeyFor("LIB_B", rel));
  });

  it("an UNREGISTERED library falls through (don't fake-serve from a sibling)", async () => {
    const reg = new MutableRegistry();
    reg.register("LIB_A", await buildArchiveBytes());
    // LIB_B not registered → must NOT be served from LIB_A's bytes; fall through to network.
    const resB = await handleArchiveFetch(req(`/repo/published/LIB_B/${SLUG}/manifest.json`), { baseUrl: BASE_URL, registry: reg });
    expect(resB).toBeUndefined();
  });

  it("the handler's response carries a per-library cache key header (the isolation handle)", async () => {
    const reg: LibraryRegistry = await registryWithLibrary("LIB1");
    const res = await handleArchiveFetch(req(`/repo/published/LIB1/${SLUG}/manifest.json`), { baseUrl: BASE_URL, registry: reg });
    expect(res!.headers.get("x-archie-cache-key")).toBe(cacheKeyFor("LIB1", `${SLUG}/manifest.json`));
  });
});

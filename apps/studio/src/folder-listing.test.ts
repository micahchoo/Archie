// folder-listing.ts — the folder-by-URL parse + preview contract. Fixtures are real autoindex shapes
// (python http.server, nginx autoindex HTML + JSON, Apache mod_autoindex, caddy browse) trimmed to
// their link structure — the filters under test are exactly the link classes those dialects emit.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FOLDER_NO_IMAGES_MESSAGE,
  FOLDER_TOO_LARGE_MESSAGE,
  FOLDER_UNREACHABLE_MESSAGE,
  isFolderUrl,
  parseAutoindexHtml,
  parseNginxJsonListing,
  previewFolder,
} from "./folder-listing.js";
import { IIIF_MANIFEST_MAX_BYTES } from "./ingest-flows.js";

const BASE = "https://files.example.org/scans/";

describe("isFolderUrl — the Link path's folder signal", () => {
  it("accepts an http(s) URL whose path ends in /", () => {
    expect(isFolderUrl("https://files.example.org/scans/")).toBe(true);
    expect(isFolderUrl("http://192.168.1.10:8000/")).toBe(true);
    expect(isFolderUrl("  https://files.example.org/scans/  ")).toBe(true); // trimmed like linkPathValid
  });
  it("rejects file URLs, non-http schemes, and half-typed values", () => {
    expect(isFolderUrl("https://files.example.org/scans/folio.jpg")).toBe(false);
    expect(isFolderUrl("ftp://files.example.org/scans/")).toBe(false);
    expect(isFolderUrl("scans/")).toBe(false);
    expect(isFolderUrl("")).toBe(false);
  });
  it("rejects a trailing-slash path carrying a query or hash (a sort link is a page, not a folder)", () => {
    expect(isFolderUrl("https://files.example.org/scans/?C=M;O=A")).toBe(false);
    expect(isFolderUrl("https://files.example.org/scans/#top")).toBe(false);
  });
});

describe("parseAutoindexHtml — dialect fixtures", () => {
  it("python -m http.server: plain <ul> of quoted hrefs", () => {
    const html = `<!DOCTYPE HTML><html><head><title>Directory listing for /scans/</title></head>
      <body><h1>Directory listing for /scans/</h1><hr><ul>
      <li><a href="folio-01.jpg">folio-01.jpg</a></li>
      <li><a href="folio-02.png">folio-02.png</a></li>
      <li><a href="notes.txt">notes.txt</a></li>
      <li><a href="verso/">verso/</a></li>
      </ul><hr></body></html>`;
    const listing = parseAutoindexHtml(html, BASE);
    expect(listing.entries.map((e) => e.name)).toEqual(["folio-01.jpg", "folio-02.png"]);
    expect(listing.entries[0]!.url).toBe(`${BASE}folio-01.jpg`);
    expect(listing.skippedDirs).toBe(1);
    expect(listing.skippedFiles).toBe(1);
  });

  it("nginx autoindex: <pre> with ../ parent link and percent-encoded names", () => {
    const html = `<html><head><title>Index of /scans/</title></head><body><h1>Index of /scans/</h1><hr><pre><a href="../">../</a>
<a href="folio%2012r.jpg">folio 12r.jpg</a>                12-May-2026 10:11  4194304
<a href="folio%2012v.jpg">folio 12v.jpg</a>                12-May-2026 10:12  4194304
</pre><hr></body></html>`;
    const listing = parseAutoindexHtml(html, BASE);
    expect(listing.entries.map((e) => e.name)).toEqual(["folio 12r.jpg", "folio 12v.jpg"]); // decoded for display
    expect(listing.entries[0]!.url).toBe(`${BASE}folio%2012r.jpg`); // still encoded for fetching
    expect(listing.skippedDirs).toBe(0); // ../ is containment-filtered, not a subfolder of this folder
  });

  it("Apache mod_autoindex: sort-links, parent dir, and icon decoration are all dropped", () => {
    const html = `<html><body><h1>Index of /scans</h1><table>
      <tr><th><a href="?C=N;O=D">Name</a></th><th><a href="?C=M;O=A">Last modified</a></th></tr>
      <tr><td><a href="/">Parent Directory</a></td></tr>
      <tr><td><img src="/icons/image2.gif" alt="[IMG]"> <a href="plate-1.tiff">plate-1.tiff</a></td></tr>
      <tr><td><a href="plate-2.webp">plate-2.webp</a></td></tr>
      </table><address>Apache/2.4 Server at files.example.org</address></body></html>`;
    const listing = parseAutoindexHtml(html, BASE);
    expect(listing.entries.map((e) => e.name)).toEqual(["plate-1.tiff", "plate-2.webp"]);
    expect(listing.skippedFiles).toBe(0);
  });

  it("caddy browse: ./-relative hrefs resolve against the folder", () => {
    const html = `<a href="./a.jpg">a.jpg</a><a href="./b/">b</a>`;
    const listing = parseAutoindexHtml(html, BASE);
    expect(listing.entries).toEqual([{ name: "a.jpg", url: `${BASE}a.jpg` }]);
    expect(listing.skippedDirs).toBe(1);
  });

  it("drops other-origin links, deeper-than-one-level paths, and duplicate hrefs", () => {
    const html = `
      <a href="https://elsewhere.example.com/x.jpg">x</a>
      <a href="/scans/deep/nested.jpg">nested</a>
      <a href="same.jpg">same</a>
      <a href="same.jpg">same again</a>`;
    const listing = parseAutoindexHtml(html, BASE);
    expect(listing.entries.map((e) => e.name)).toEqual(["same.jpg"]);
  });

  it("single-quoted and unquoted href attributes both parse", () => {
    const html = `<a href='one.jpg'>1</a><a class="x" href=two.png>2</a>`;
    expect(parseAutoindexHtml(html, BASE).entries.map((e) => e.name)).toEqual(["one.jpg", "two.png"]);
  });

  it("keeps listing (server) order", () => {
    const html = `<a href="c.jpg">c</a><a href="a.jpg">a</a><a href="b.jpg">b</a>`;
    expect(parseAutoindexHtml(html, BASE).entries.map((e) => e.name)).toEqual(["c.jpg", "a.jpg", "b.jpg"]);
  });
});

describe("parseNginxJsonListing — the autoindex_format json fast path", () => {
  const body = [
    { name: "folio 12r.jpg", type: "file", mtime: "Tue, 12 May 2026 10:11:00 GMT", size: 4194304 },
    { name: "verso", type: "directory", mtime: "Tue, 12 May 2026 10:11:00 GMT" },
    { name: "notes.txt", type: "file", mtime: "Tue, 12 May 2026 10:11:00 GMT", size: 12 },
  ];
  it("maps files/directories and URL-encodes the raw JSON names", () => {
    const listing = parseNginxJsonListing(body, BASE)!;
    expect(listing.entries).toEqual([{ name: "folio 12r.jpg", url: `${BASE}folio%2012r.jpg` }]);
    expect(listing.skippedDirs).toBe(1);
    expect(listing.skippedFiles).toBe(1);
  });
  it("returns null for shapes that aren't the nginx dialect (caller falls back to HTML)", () => {
    expect(parseNginxJsonListing({ not: "an array" }, BASE)).toBeNull();
    expect(parseNginxJsonListing([{ name: 1, type: "file" }], BASE)).toBeNull();
    expect(parseNginxJsonListing(["just strings"], BASE)).toBeNull();
  });
});

describe("previewFolder — fetch + tagged results (never throws)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const okResponse = (body: string, contentType = "text/html") => ({
    ok: true,
    headers: new Headers({ "content-type": contentType }),
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  });

  it("parses an HTML listing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse(`<a href="a.jpg">a</a>`)));
    const p = await previewFolder(BASE);
    expect(p).toEqual({ status: "ok", listing: { entries: [{ name: "a.jpg", url: `${BASE}a.jpg` }], skippedDirs: 0, skippedFiles: 0 } });
  });

  it("routes a JSON body through the nginx dialect", async () => {
    const body = JSON.stringify([{ name: "a.jpg", type: "file" }]);
    vi.stubGlobal("fetch", vi.fn(async () => okResponse(body, "application/json")));
    const p = await previewFolder(BASE);
    expect(p.status).toBe("ok");
    expect(p.status === "ok" && p.listing.entries[0]!.url).toBe(`${BASE}a.jpg`);
  });

  it("maps non-OK and thrown fetches (the CORS case) to the unreachable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers() })));
    expect(await previewFolder(BASE)).toEqual({ status: "invalid", message: FOLDER_UNREACHABLE_MESSAGE });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await previewFolder(BASE)).toEqual({ status: "invalid", message: FOLDER_UNREACHABLE_MESSAGE });
  });

  it("enforces the cap against declared content-length AND actual size", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-length": String(IIIF_MANIFEST_MAX_BYTES + 1) }),
      arrayBuffer: async () => new ArrayBuffer(0),
    })));
    expect(await previewFolder(BASE)).toEqual({ status: "invalid", message: FOLDER_TOO_LARGE_MESSAGE });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(IIIF_MANIFEST_MAX_BYTES + 1),
    })));
    expect(await previewFolder(BASE)).toEqual({ status: "invalid", message: FOLDER_TOO_LARGE_MESSAGE });
  });

  it("an imageless listing is a refusal, not an empty picker", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse(`<a href="notes.txt">notes</a>`)));
    expect(await previewFolder(BASE)).toEqual({ status: "invalid", message: FOLDER_NO_IMAGES_MESSAGE });
  });

  it("a [-leading non-JSON body falls back to the HTML scrape instead of failing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse(`[broken <a href="a.jpg">a</a>`)));
    const p = await previewFolder(BASE);
    expect(p.status === "ok" && p.listing.entries.map((e) => e.name)).toEqual(["a.jpg"]);
  });
});

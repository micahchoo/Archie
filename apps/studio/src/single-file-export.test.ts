// buildSingleFileHtml — the self-contained export document (archie-linkability Q-3).
//
// The assertions that matter are the ones about what the file must NEVER do, because a file:// page
// cannot fetch anything: no relative fetch, no module script, no sibling asset reference. A test that
// only checked "the bundle is in there" would pass a document that still tried to load its library
// over the network and failed silently in the one environment this feature exists for.
import { describe, it, expect } from "vitest";
import { buildSingleFileHtml, toBase64 } from "./single-file-export.js";

const bundle = 'console.log("viewer bundle");';
const libraryBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]); // "PK\x03\x04" + filler

describe("buildSingleFileHtml", () => {
  it("inlines the bundle and the library — nothing is fetched at run time", () => {
    const html = buildSingleFileHtml({ bundle, libraryBytes, title: "Field Notes" });
    expect(html).toContain('console.log("viewer bundle")');
    expect(html).toContain(toBase64(libraryBytes));
    // No relative fetch/XHR/src of a sibling file: every one of these is refused from file://.
    expect(html).not.toMatch(/fetch\(["']\.\//);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/type=["']module["']/i);
  });

  it("round-trips the library bytes through the base64 payload", () => {
    const html = buildSingleFileHtml({ bundle, libraryBytes });
    const payload = /type="application\/vnd\.archie\.library\+base64">([^<]*)</.exec(html)?.[1] ?? "";
    const bin = atob(payload.trim());
    expect(Uint8Array.from(bin, (c) => c.charCodeAt(0))).toEqual(libraryBytes);
  });

  it("neutralizes </script> inside the bundle so the document cannot truncate", () => {
    // The HTML tokenizer ends a <script> at the first `</script` in raw text — it does not parse JS
    // string literals. Minified code carrying that sequence would cut the document mid-bundle.
    const html = buildSingleFileHtml({ bundle: 'var s = "</script>";', libraryBytes });
    expect(html).toContain(String.raw`var s = "<\/script>";`);
    // Exactly three closing script tags: payload, bundle, boot — none smuggled in by the bundle text.
    expect(html.match(/<\/script>/g)).toHaveLength(3);
  });

  it("escapes the title rather than injecting it", () => {
    const html = buildSingleFileHtml({ bundle, libraryBytes, title: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("falls back to a neutral title rather than an empty <title>", () => {
    expect(buildSingleFileHtml({ bundle, libraryBytes, title: "   " })).toContain("<title>Archie library</title>");
    expect(buildSingleFileHtml({ bundle, libraryBytes })).toContain("<title>Archie library</title>");
  });

  it("surfaces a boot failure instead of leaving the reader looking merely empty", () => {
    // Without this the element sits on its drop zone, which reads as "empty library" rather than
    // "this file is broken" — the same absent-vs-failed distinction render-core-data-integrity draws.
    expect(buildSingleFileHtml({ bundle, libraryBytes })).toContain("This archive couldn't be opened");
  });
});

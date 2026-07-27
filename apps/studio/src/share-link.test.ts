// Archie-4f7c. The load-bearing test here is the ROUND TRIP: mint a link with the code Studio
// actually ships, hand its hash to the REAL parseRoute the viewer actually calls, and assert the
// pointer survives. Asserting the string "contains #/?src=" would pass against a subtly wrong
// grammar; only round-tripping through the consumer proves the two agree.
//
// This is the test that fails against the shipped form (`?src=` as a real query param): its hash is
// empty, parseRoute returns a bare gallery route, and `src` is undefined.

import { describe, it, expect } from "vitest";
import { parseRoute } from "@render/core";
import { viewerShareLink, viewerEmbedSnippet } from "./share-link.js";

const VIEWER = "https://micahchoo.github.io/Archie/viewer/";
const ZIP = "https://example.org/my library.archie.zip"; // a space, so encoding is exercised

/** What the viewer does on arrival: read location.hash and parse it. */
function hashOf(link: string): string {
  return new URL(link).hash;
}

describe("viewerShareLink", () => {
  it("ROUND TRIP: the viewer's own parser recovers the zip url from the link Studio mints", () => {
    const link = viewerShareLink(VIEWER, ZIP);
    const route = parseRoute(hashOf(link));
    expect(route.src).toBe(ZIP);
  });

  it("puts src in the HASH, never in location.search — the viewer reads only the hash", () => {
    const url = new URL(viewerShareLink(VIEWER, ZIP));
    expect(url.search).toBe("");
    expect(url.hash).toContain("?src=");
  });

  it("lands on the Gallery, which is what a whole-library share should open", () => {
    expect(parseRoute(hashOf(viewerShareLink(VIEWER, ZIP))).view).toBe("gallery");
  });

  it("percent-encodes the url so its own separators survive", () => {
    const tricky = "https://example.org/a?b=1&c=2#frag.archie.zip";
    // Round trip is the real assertion — encoding is only correct if it decodes back.
    expect(parseRoute(hashOf(viewerShareLink(VIEWER, tricky))).src).toBe(tricky);
  });

  it("preserves the viewer's own path", () => {
    expect(viewerShareLink(VIEWER, ZIP).startsWith(VIEWER)).toBe(true);
  });

  it("empty or whitespace input yields no link", () => {
    expect(viewerShareLink(VIEWER, "")).toBe("");
    expect(viewerShareLink(VIEWER, "   ")).toBe("");
  });

  it("a non-http(s) scheme yields no link — never compose javascript:/data: into a pasteable link", () => {
    expect(viewerShareLink(VIEWER, "javascript:alert(1)")).toBe("");
    expect(viewerShareLink(VIEWER, "data:text/html,<script>")).toBe("");
    expect(viewerShareLink(VIEWER, "not a url at all")).toBe("");
  });
});

describe("viewerEmbedSnippet", () => {
  it("embeds the SAME link, so the iframe cannot drift from the share link", () => {
    const link = viewerShareLink(VIEWER, ZIP);
    expect(viewerEmbedSnippet(link)).toContain(`src="${link}"`);
    // And the embedded link must itself still round-trip.
    expect(parseRoute(hashOf(link)).src).toBe(ZIP);
  });

  it("empty in, empty out", () => {
    expect(viewerEmbedSnippet("")).toBe("");
  });
});

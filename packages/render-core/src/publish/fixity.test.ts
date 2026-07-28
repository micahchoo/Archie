import { describe, it, expect } from "vitest";
import {
  FIXITY_MANIFEST_NAME,
  decodeManifestPath,
  encodeManifestPath,
  formatFixityManifest,
  mergeFixity,
  parseFixityManifest,
} from "./fixity.js";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

describe("the manifest line format (RFC 8493 §2.1.3)", () => {
  it("emits `checksum<two spaces>path`, newline-terminated, sorted by path", () => {
    const text = formatFixityManifest([
      { path: "z/last.json", sha256: C },
      { path: "a.json", sha256: A },
      { path: "m/mid.bin", sha256: B },
    ]);
    expect(text).toBe(`${A}  a.json\n${B}  m/mid.bin\n${C}  z/last.json\n`);
  });

  it("percent-encodes ONLY LF, CR and % in a filename, and round-trips", () => {
    expect(encodeManifestPath("plain/path.json")).toBe("plain/path.json");
    // % first, or the escapes for the other two would themselves be re-escaped.
    expect(encodeManifestPath("odd%name\nwith\rbreaks")).toBe("odd%25name%0Awith%0Dbreaks");
    // Everything else RFC 3986 would encode is left ALONE — a space, a plus, a hash all stay literal.
    expect(encodeManifestPath("a b+c#d.jpg")).toBe("a b+c#d.jpg");
    expect(decodeManifestPath(encodeManifestPath("odd%name\nwith\rbreaks"))).toBe("odd%name\nwith\rbreaks");
  });

  it("parses what it formats, including an encoded path", () => {
    const entries = [
      { path: "a.json", sha256: A },
      { path: "weird%name.txt", sha256: B },
    ];
    expect(parseFixityManifest(formatFixityManifest(entries))).toEqual(entries);
  });

  it("accepts CRLF line endings and a tab separator (the RFC allows any whitespace run)", () => {
    expect(parseFixityManifest(`${A}\ta.json\r\n${B}   b/c.json\r\n`)).toEqual([
      { path: "a.json", sha256: A },
      { path: "b/c.json", sha256: B },
    ]);
  });

  it("skips a malformed line rather than rejecting the whole manifest (data-integrity rule 2)", () => {
    const text = `${A}  good.json\nnot a manifest line\n\n${B}  also-good.json\n`;
    expect(parseFixityManifest(text).map((e) => e.path)).toEqual(["good.json", "also-good.json"]);
  });

  it("lowercases an uppercase checksum so two manifests of the same bytes compare equal", () => {
    expect(parseFixityManifest(`${A.toUpperCase()}  a.json\n`)).toEqual([{ path: "a.json", sha256: A }]);
  });
});

describe("mergeFixity — the incremental carry-forward", () => {
  const prior = [
    { path: "old/keeps.json", sha256: A },
    { path: "old/changes.json", sha256: A },
    { path: "gone/x.bin", sha256: A },
  ];

  it("this pass's hash wins for a path it rewrote", () => {
    const merged = mergeFixity(prior, [{ path: "old/changes.json", sha256: B }], [], []);
    expect(merged.find((e) => e.path === "old/changes.json")!.sha256).toBe(B);
  });

  it("carries forward a path this pass did NOT rewrite", () => {
    const merged = mergeFixity(prior, [{ path: "new/added.json", sha256: B }], [], []);
    expect(merged.find((e) => e.path === "old/keeps.json")!.sha256).toBe(A);
    expect(merged.find((e) => e.path === "new/added.json")!.sha256).toBe(B);
  });

  it("drops a removed path AND everything beneath it, without catching a same-prefix sibling", () => {
    const withSibling = [...prior, { path: "gone-elsewhere/y.bin", sha256: A }];
    const merged = mergeFixity(withSibling, [], ["gone"], []);
    expect(merged.map((e) => e.path)).toEqual(["gone-elsewhere/y.bin", "old/changes.json", "old/keeps.json"]);
  });

  it("excludes the manifest itself and the marker — neither can be in a manifest written before one and after the other", () => {
    const merged = mergeFixity(
      [{ path: FIXITY_MANIFEST_NAME, sha256: A }, { path: "archie.json", sha256: A }],
      [{ path: FIXITY_MANIFEST_NAME, sha256: B }, { path: "kept.json", sha256: B }],
      [],
      [FIXITY_MANIFEST_NAME, "archie.json"],
    );
    expect(merged.map((e) => e.path)).toEqual(["kept.json"]);
  });

  it("is sorted by path regardless of which side an entry came from", () => {
    const merged = mergeFixity([{ path: "m.json", sha256: A }], [{ path: "a.json", sha256: B }, { path: "z.json", sha256: C }], [], []);
    expect(merged.map((e) => e.path)).toEqual(["a.json", "m.json", "z.json"]);
  });
});

import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "../fs/memory.js";
import {
  preflightTree, rightsCoverage, rightsCoverageFinding, blocksPublish, looksLikeLfsPointer,
  REPO_SIZE_SOFT_LIMIT_BYTES,
} from "./preflight.js";
import { asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";

const LFS_POINTER = `version https://git-lfs.github.com/spec/v1
oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
size 12345
`;

async function tree(files: Record<string, string | Uint8Array>): Promise<MemoryFilesystem> {
  const fs = new MemoryFilesystem();
  for (const [path, body] of Object.entries(files)) {
    const segs = path.split("/");
    let dir = await fs.root();
    for (const seg of segs.slice(0, -1)) dir = await dir.getDirectory(seg, { create: true });
    const file = await dir.getFile(segs[segs.length - 1]!, { create: true });
    const w = await file.writable();
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    await w.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    await w.close();
  }
  return fs;
}

describe("looksLikeLfsPointer", () => {
  it("recognises a real pointer", () => {
    expect(looksLikeLfsPointer(new TextEncoder().encode(LFS_POINTER))).toBe(true);
  });
  it("does NOT match a file that merely mentions the URL later on", () => {
    expect(looksLikeLfsPointer(new TextEncoder().encode(`# notes\n${LFS_POINTER}`))).toBe(false);
  });
  it("does NOT match binary image bytes, or anything big enough to be a real asset", () => {
    expect(looksLikeLfsPointer(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(false);
    const big = new TextEncoder().encode(LFS_POINTER + "x".repeat(2000));
    expect(looksLikeLfsPointer(big)).toBe(false); // a pointer is ~130 bytes by construction
  });
});

describe("preflightTree", () => {
  it("BLOCKS on an LFS pointer — Pages serves the pointer text where a JPEG belongs", async () => {
    const fs = await tree({ "archie.json": "{}", "404.html": "x", "a/assets/photo.jpg": LFS_POINTER });
    const findings = await preflightTree(await fs.root());
    const lfs = findings.find((f) => f.code === "lfs-pointer")!;
    expect(lfs.severity).toBe("block");
    expect(lfs.count).toBe(1);
    expect(lfs.examples).toEqual(["a/assets/photo.jpg"]);
    expect(blocksPublish(findings)).toBe(true);
  });

  it("finds pointers at any depth and counts beyond the examples it shows", async () => {
    const files: Record<string, string> = { "archie.json": "{}", "404.html": "x" };
    for (let i = 0; i < 8; i++) files[`ex${i}/assets/p${i}.jpg`] = LFS_POINTER;
    const findings = await preflightTree(await (await tree(files)).root());
    const lfs = findings.find((f) => f.code === "lfs-pointer")!;
    expect(lfs.count).toBe(8);
    expect(lfs.examples).toHaveLength(5); // shown; the dialog counts the rest
  });

  it("a clean tree blocks nothing", async () => {
    const fs = await tree({ "archie.json": "{}", "404.html": "x", "a/assets/photo.jpg": "ÿØÿ real-ish jpeg bytes" });
    const findings = await preflightTree(await fs.root());
    expect(blocksPublish(findings)).toBe(false);
    expect(findings.find((f) => f.code === "lfs-pointer")).toBeUndefined();
  });

  it("WARNS (never blocks) on a missing 404.html — the site works without it", async () => {
    const findings = await preflightTree(await (await tree({ "archie.json": "{}" })).root());
    const f = findings.find((x) => x.code === "no-404")!;
    expect(f.severity).toBe("warn");
    expect(blocksPublish(findings)).toBe(false);
  });

  it("no 404 finding when the page is present", async () => {
    const findings = await preflightTree(await (await tree({ "archie.json": "{}", "404.html": "x" })).root());
    expect(findings.find((f) => f.code === "no-404")).toBeUndefined();
  });

  it("WARNS (never blocks) over the size limit, and reports the real byte total", async () => {
    // The limit is a SOFT one — GitHub emails the owner, the push still works — so blocking would
    // refuse a publish that would have succeeded. The threshold is injectable purely so this can be
    // exercised without writing a gigabyte; production callers take the default.
    const fs = await tree({ "archie.json": "{}", "404.html": "x", "a/big.bin": new Uint8Array(4096) });
    const over = await preflightTree(await fs.root(), 1000);
    const f = over.find((x) => x.code === "tree-size")!;
    expect(f.severity).toBe("warn");
    expect(f.bytes).toBeGreaterThanOrEqual(4096); // the REAL total, not the threshold echoed back
    expect(blocksPublish(over)).toBe(false);

    const under = await preflightTree(await fs.root(), 1_000_000);
    expect(under.find((x) => x.code === "tree-size")).toBeUndefined();
  });

  it("the default threshold is GitHub's documented soft limit", () => {
    expect(REPO_SIZE_SOFT_LIMIT_BYTES).toBe(1_000_000_000);
  });
});

describe("rightsCoverage (Archie-8772)", () => {
  const lib = (over: Partial<Library> = {}): Library => ({
    id: asLibraryId("L"), title: "Lib",
    exhibits: [{
      id: asExhibitId("e1"), slug: "a", title: "A",
      objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "Folio 1" }],
    }],
    ...over,
  });

  it("reports every bare level — library, exhibit and object", () => {
    expect(rightsCoverage(lib()).map((g) => g.kind)).toEqual(["library", "exhibit", "object"]);
  });

  it("EITHER field covers a level: a credit alone counts, and so does a licence alone", () => {
    const credited = lib({ requiredStatement: { label: "Attribution", value: "Beinecke" } });
    expect(rightsCoverage(credited).some((g) => g.kind === "library")).toBe(false);
    const licensed = lib({ rights: "https://creativecommons.org/licenses/by/4.0/" });
    expect(rightsCoverage(licensed).some((g) => g.kind === "library")).toBe(false);
  });

  it("a BLANK credit is not coverage", () => {
    const blank = lib({ requiredStatement: { label: "Attribution", value: "   " } });
    expect(rightsCoverage(blank).some((g) => g.kind === "library")).toBe(true);
  });

  it("KEYED READ ONLY: Dublin Core metadata is NOT a rights statement", () => {
    // metadata-rights-keyed-writebacks: the three properties are independent. Descriptive metadata
    // describes the work; it does not license it. Counting it as coverage would report coverage this
    // library does not have.
    const described = lib({ metadata: [{ property: "dcterms:creator", value: "Ada" }] });
    expect(rightsCoverage(described).some((g) => g.kind === "library")).toBe(true);
  });

  it("names WHERE each gap is, so the report is actionable", () => {
    expect(rightsCoverage(lib()).map((g) => g.where)).toEqual(["Lib", "a", "a/Folio 1"]);
  });

  it("is a REPORT and can never gate — coverage is a curatorial decision, not a correctness one", () => {
    const finding = rightsCoverageFinding(lib())!;
    expect(finding.severity).toBe("report");
    expect(blocksPublish([finding])).toBe(false);
  });

  it("no finding at all when every level is covered", () => {
    const covered: Library = {
      id: asLibraryId("L"), title: "Lib", rights: "https://creativecommons.org/licenses/by/4.0/",
      exhibits: [{
        id: asExhibitId("e1"), slug: "a", title: "A", rights: "https://creativecommons.org/licenses/by/4.0/",
        objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "F", requiredStatement: { label: "Attribution", value: "Beinecke" } }],
      }],
    };
    expect(rightsCoverageFinding(covered)).toBeNull();
  });
});

describe("the severity model itself", () => {
  it("across a tree that trips EVERYTHING, exactly one finding blocks", async () => {
    // The model's whole claim, asserted against real emitted findings rather than a literal list —
    // a filter over hand-written codes would restate the intent instead of testing it, and would
    // still pass if preflightTree started marking `no-404` as a block.
    const fs = await tree({ "archie.json": "{}", "a/assets/p.jpg": LFS_POINTER }); // no 404, LFS, over-size
    const findings = await preflightTree(await fs.root(), 10);

    expect(findings.map((f) => f.code).sort()).toEqual(["lfs-pointer", "no-404", "tree-size"]);
    expect(findings.filter((f) => f.severity === "block").map((f) => f.code)).toEqual(["lfs-pointer"]);
    expect(blocksPublish(findings)).toBe(true);
  });

  it("a rights gap added to that set does not change what blocks", () => {
    const gap = rightsCoverageFinding({
      id: asLibraryId("L"), title: "Lib",
      exhibits: [{ id: asExhibitId("e1"), slug: "a", title: "A", objects: [] }],
    })!;
    expect(gap.severity).toBe("report");
    expect(blocksPublish([gap])).toBe(false);
  });
});

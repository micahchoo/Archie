import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  BAGIT_TXT_NAME,
  BAG_INFO_NAME,
  BAG_PAYLOAD_DIR,
  BAG_TAGMANIFEST_NAME,
  bagInfoFromLibrary,
  formatBagInfo,
  libraryToBagZip,
  writeBag,
} from "./bag.js";
import { FIXITY_MANIFEST_NAME, parseFixityManifest } from "./fixity.js";
import { MemoryFilesystem } from "../fs/memory.js";
import type { Filesystem, FsDirectory } from "../fs/seam.js";
import { asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";

// Archie-039e — "Deposit a copy": the published tree arranged as a BagIt bag (RFC 8493).
//
// These are the RFC's structural rules asserted by hand. The EXTERNAL validator
// (`bagit.py --validate`, bagit-python 1.9.0) runs from `scripts/bag-validate.mjs`, deliberately not
// from here: shelling out to a Python interpreter that CI may not carry would either make the suite
// non-hermetic or make it skip itself into green, which this repo treats as worse than absent
// (.claude/rules/playwright-count-does-not-wait.md). The hand-written rules and the external verdict
// are two independent claims; both are recorded on the ticket.

const library: Library = {
  id: asLibraryId("lib"),
  title: "The Voynich Working Set",
  summary: "A reading of the herbal quires.",
  requiredStatement: { label: "Attribution", value: "Beinecke Rare Book & Manuscript Library" },
  metadata: [
    { property: "dcterms:publisher", value: "Yale University Library" },
    { property: "dcterms:creator", value: "M. Alexander" },
  ],
  exhibits: [
    {
      id: asExhibitId("exA"),
      slug: "a",
      title: "Quire 1",
      objects: [{ id: asObjectId("o1"), source: "/assets/f1r.jpg", label: "f1r", width: 10, height: 10 }],
    },
  ],
};

const ASSET = new Uint8Array([1, 2, 3, 4, 5, 6, 7]).buffer;
const PUBLISH_OPTS = { baseUrl: "https://u.gh.io/lib/", getAsset: async (): Promise<ArrayBuffer> => ASSET, publishedAt: "2026-07-27T00:00:00.000Z" };
const BAG_OPTS = { baggingDate: "2026-07-27" };

async function listFiles(dir: FsDirectory, prefix = ""): Promise<string[]> {
  const entries: { name: string; kind: "file" | "directory" }[] = [];
  for await (const e of dir.entries()) entries.push(e);
  const out: string[] = [];
  for (const e of entries) {
    const path = prefix === "" ? e.name : `${prefix}/${e.name}`;
    if (e.kind === "directory") out.push(...(await listFiles(await dir.getDirectory(e.name), path)));
    else out.push(path);
  }
  return out.sort();
}

async function readText(fs: Filesystem, path: string): Promise<string> {
  const parts = path.split("/");
  let dir = await fs.root();
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!);
  return new TextDecoder().decode(await (await dir.getFile(parts[parts.length - 1]!)).readable());
}

async function readBytes(fs: Filesystem, path: string): Promise<Uint8Array> {
  const parts = path.split("/");
  let dir = await fs.root();
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!);
  return new Uint8Array(await (await dir.getFile(parts[parts.length - 1]!)).readable());
}

describe("writeBag — the bag's structure (RFC 8493)", () => {
  it("puts every published file under data/ and the four tag files at the bag root", async () => {
    const fs = new MemoryFilesystem();
    await writeBag(fs, library, () => [], PUBLISH_OPTS, BAG_OPTS);
    const files = await listFiles(await fs.root());
    const roots = files.filter((f) => !f.includes("/"));
    expect(roots).toEqual([BAG_INFO_NAME, BAGIT_TXT_NAME, FIXITY_MANIFEST_NAME, BAG_TAGMANIFEST_NAME].sort());
    expect(files.filter((f) => f.includes("/")).every((f) => f.startsWith(`${BAG_PAYLOAD_DIR}/`))).toBe(true);
    expect(files).toContain("data/a/assets/f1r.jpg");
    expect(files).toContain("data/archie.json");
    expect(files).toContain(`data/${FIXITY_MANIFEST_NAME}`);
  });

  it("bagit.txt is exactly the two required declarations, version first", async () => {
    const fs = new MemoryFilesystem();
    await writeBag(fs, library, () => [], PUBLISH_OPTS, BAG_OPTS);
    expect(await readText(fs, BAGIT_TXT_NAME)).toBe("BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n");
  });

  it("the payload manifest lists EVERY file under data/ and nothing else, each hash matching an independent re-hash", async () => {
    const fs = new MemoryFilesystem();
    const result = await writeBag(fs, library, () => [], PUBLISH_OPTS, BAG_OPTS);
    const listed = parseFixityManifest(await readText(fs, FIXITY_MANIFEST_NAME));
    const onDisk = (await listFiles(await fs.root())).filter((f) => f.startsWith(`${BAG_PAYLOAD_DIR}/`));

    expect(listed.map((e) => e.path).sort()).toEqual(onDisk);
    for (const entry of listed) {
      const bytes = await readBytes(fs, entry.path);
      expect(createHash("sha256").update(bytes).digest("hex"), `hash mismatch for ${entry.path}`).toBe(entry.sha256);
    }
    expect(result.payloadFiles).toBe(listed.length);
    expect(listed.length).toBeGreaterThan(10);
  });

  it("Payload-Oxum is the real octet count and stream count over data/", async () => {
    const fs = new MemoryFilesystem();
    const result = await writeBag(fs, library, () => [], PUBLISH_OPTS, BAG_OPTS);
    const paths = (await listFiles(await fs.root())).filter((f) => f.startsWith(`${BAG_PAYLOAD_DIR}/`));
    let octets = 0;
    for (const p of paths) octets += (await readBytes(fs, p)).byteLength;
    expect(result.oxum).toBe(`${octets}.${paths.length}`);
    expect(await readText(fs, BAG_INFO_NAME)).toContain(`Payload-Oxum: ${octets}.${paths.length}`);
  });

  it("the tag manifest covers the three tag files written before it, and never itself", async () => {
    const fs = new MemoryFilesystem();
    await writeBag(fs, library, () => [], PUBLISH_OPTS, BAG_OPTS);
    const tags = parseFixityManifest(await readText(fs, BAG_TAGMANIFEST_NAME));
    expect(tags.map((e) => e.path).sort()).toEqual([BAG_INFO_NAME, BAGIT_TXT_NAME, FIXITY_MANIFEST_NAME].sort());
    for (const entry of tags) {
      const bytes = await readBytes(fs, entry.path);
      expect(createHash("sha256").update(bytes).digest("hex"), `hash mismatch for ${entry.path}`).toBe(entry.sha256);
    }
  });

  it("the payload manifest's data/ lines are the published tree's own manifest, prefixed — publish-time hashing, reused", async () => {
    const fs = new MemoryFilesystem();
    await writeBag(fs, library, () => [], PUBLISH_OPTS, BAG_OPTS);
    const treeManifest = parseFixityManifest(await readText(fs, `${BAG_PAYLOAD_DIR}/${FIXITY_MANIFEST_NAME}`));
    const bagManifest = new Map(parseFixityManifest(await readText(fs, FIXITY_MANIFEST_NAME)).map((e) => [e.path, e.sha256]));
    expect(treeManifest.length).toBeGreaterThan(10);
    for (const e of treeManifest) expect(bagManifest.get(`${BAG_PAYLOAD_DIR}/${e.path}`)).toBe(e.sha256);
    // The only two payload lines the tree's own manifest cannot carry: itself, and the marker written
    // after it. They are hashed by writeBag and are the ONLY extra lines.
    expect(bagManifest.size - treeManifest.length).toBe(2);
    expect(bagManifest.has(`${BAG_PAYLOAD_DIR}/${FIXITY_MANIFEST_NAME}`)).toBe(true);
    expect(bagManifest.has(`${BAG_PAYLOAD_DIR}/archie.json`)).toBe(true);
  });

  it("refuses an incremental publish — a deposit is a full copy, and a carried-forward line has no size", async () => {
    const fs = new MemoryFilesystem();
    await expect(
      writeBag(fs, library, () => [], { ...PUBLISH_OPTS, incremental: { exhibits: new Set(["a"]), reassets: new Set() } }, BAG_OPTS),
    ).rejects.toThrow(/incremental is not supported/);
  });

  it("libraryToBagZip produces a zip whose entries are the bag", async () => {
    const { zip, oxum } = await libraryToBagZip(library, () => [], PUBLISH_OPTS, BAG_OPTS);
    expect(zip.byteLength).toBeGreaterThan(0);
    const text = new TextDecoder("latin1").decode(zip);
    for (const name of [BAGIT_TXT_NAME, BAG_INFO_NAME, BAG_TAGMANIFEST_NAME, "data/archie.json"]) {
      expect(text, `zip is missing an entry for ${name}`).toContain(name);
    }
    expect(oxum).toMatch(/^\d+\.\d+$/);
  });
});

describe("bag-info.txt fields derived from the Library", () => {
  it("prefers dcterms:publisher for Source-Organization and dcterms:creator for Contact-Name", () => {
    const fields = bagInfoFromLibrary(library, { baggingDate: "2026-07-27", oxum: "1.1", baseUrl: "https://u.gh.io/lib/" });
    const by = new Map(fields.map((f) => [f.label, f.value]));
    expect(by.get("Source-Organization")).toBe("Yale University Library");
    expect(by.get("Contact-Name")).toBe("M. Alexander");
    expect(by.get("External-Identifier")).toBe("https://u.gh.io/lib/");
    expect(by.get("Bag-Group-Identifier")).toBe("The Voynich Working Set");
    expect(by.get("External-Description")).toBe("A reading of the herbal quires.");
    expect(by.get("Bagging-Date")).toBe("2026-07-27");
    expect(by.get("Payload-Oxum")).toBe("1.1");
  });

  it("falls back to the attribution credit when there is no publisher entry", () => {
    const { metadata: _dropped, ...noMetadata } = library;
    const by = new Map(bagInfoFromLibrary(noMetadata, { baggingDate: "d", oxum: "1.1" }).map((f) => [f.label, f.value]));
    expect(by.get("Source-Organization")).toBe("Beinecke Rare Book & Manuscript Library");
    expect(by.has("Contact-Name")).toBe(false);
  });

  it("OMITS a field it has no source for rather than inventing one", () => {
    const bare: Library = { id: asLibraryId("bare"), exhibits: [] };
    const labels = bagInfoFromLibrary(bare, { baggingDate: "d", oxum: "0.0" }).map((f) => f.label);
    expect(labels).not.toContain("Source-Organization");
    expect(labels).not.toContain("Contact-Name");
    expect(labels).not.toContain("External-Description");
    expect(labels).toContain("Bagging-Date");
  });

  it("an explicit sourceOrganization overrides the derivation", () => {
    const by = new Map(
      bagInfoFromLibrary(library, { baggingDate: "d", oxum: "1.1", sourceOrganization: "Somewhere Else" }).map((f) => [f.label, f.value]),
    );
    expect(by.get("Source-Organization")).toBe("Somewhere Else");
  });

  it("collapses a newline in a value so it cannot forge a second field", () => {
    expect(formatBagInfo([{ label: "External-Description", value: "one\nSource-Organization: forged" }])).toBe(
      "External-Description: one Source-Organization: forged\n",
    );
  });

  it("Bagging-Date is injected, never read from the clock — the same library twice gives identical bytes", async () => {
    const a = await libraryToBagZip(library, () => [], PUBLISH_OPTS, BAG_OPTS);
    const b = await libraryToBagZip(library, () => [], PUBLISH_OPTS, BAG_OPTS);
    expect(a.zip).toEqual(b.zip);
  });
});

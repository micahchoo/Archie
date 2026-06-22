import { describe, it, expect } from "vitest";
import { publishLibrary, libraryToZipFs } from "./site.js";
import { validateArchieMarker, ARCHIE_LIBRARY_MARKER } from "./marker.js";
import { SCHEMA_VERSION } from "../migrate/migrate.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { ZipFilesystem } from "../fs/zip.js";
import { asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";

// ADR-0020: every published `.archie.zip` carries a root `archie.json` self-ID marker so the
// read-only embed viewer can reject a non-Archie / wrong-version zip BEFORE opening it as a library.

const exA = { id: asExhibitId("exA"), slug: "a", title: "Exhibit A", objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "A1", width: 10, height: 10 }] };
const library: Library = { id: asLibraryId("lib"), title: "Lib", exhibits: [exA] };

async function readJson(fs: MemoryFilesystem | ZipFilesystem, name: string): Promise<unknown> {
  const f = await (await fs.root()).getFile(name);
  return JSON.parse(new TextDecoder().decode(await f.readable()));
}

async function writeJson(fs: MemoryFilesystem, name: string, data: unknown): Promise<void> {
  const f = await (await fs.root()).getFile(name, { create: true });
  const w = await f.writable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

describe("ADR-0020 L1 self-ID marker — write side (publishLibrary)", () => {
  it("emits a root archie.json marker beside collection.json / exhibits.json", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, () => [], { baseUrl: "https://u.gh.io/lib/" });
    const names: string[] = [];
    for await (const e of (await fs.root()).entries()) names.push(`${e.kind}:${e.name}`);
    expect(names).toContain("file:archie.json");
    expect(names).toContain("file:collection.json");
    expect(names).toContain("file:exhibits.json");
    expect(await readJson(fs, "archie.json")).toEqual({
      format: "archie-library",
      version: SCHEMA_VERSION,
      generator: "archie",
    });
  });
});

// LENIENT-ON-ABSENT rule (mirrors the hosted-tree path): a PRESENT marker is validated (format +
// version), an ABSENT marker accepts when the zip is structurally an Archie library (collection.json OR
// exhibits.json parses), and only a zip with neither is rejected.
describe("ADR-0020 L1 self-ID marker — read side (validateArchieMarker)", () => {
  it("accepts a freshly published tree (round-trip — marked, valid)", async () => {
    const { fs } = await libraryToZipFs(library, () => []);
    await expect(validateArchieMarker(fs)).resolves.toBeUndefined();
  });

  it("ACCEPTS an UNMARKED zip that has exhibits.json (pre-marker real export — the regression)", async () => {
    const fs = new MemoryFilesystem();
    // A real Archie export from before the marker landed: collection.json + exhibits.json, NO archie.json.
    // Rejecting this on the missing marker alone is the bug the user hit.
    await writeJson(fs, "collection.json", { "@context": "http://iiif.io/api/presentation/3/context.json", type: "Collection" });
    await writeJson(fs, "exhibits.json", { library: { id: "x" }, exhibits: [] });
    await expect(validateArchieMarker(fs)).resolves.toBeUndefined();
  });

  it("ACCEPTS an UNMARKED zip with only exhibits.json (collection.json absent)", async () => {
    const fs = new MemoryFilesystem();
    await writeJson(fs, "exhibits.json", { library: { id: "x" }, exhibits: [] });
    await expect(validateArchieMarker(fs)).resolves.toBeUndefined();
  });

  it("ACCEPTS an UNMARKED zip with only collection.json (exhibits.json absent)", async () => {
    const fs = new MemoryFilesystem();
    await writeJson(fs, "collection.json", { type: "Collection" });
    await expect(validateArchieMarker(fs)).resolves.toBeUndefined();
  });

  it("rejects a junk zip with NEITHER collection.json NOR exhibits.json (genuinely not Archie)", async () => {
    const fs = new MemoryFilesystem();
    await writeJson(fs, "hello.json", { not: "archie" });
    await expect(validateArchieMarker(fs)).rejects.toThrow(/isn't an archie library/i);
  });

  it("rejects a marker with the wrong format (present-but-foreign)", async () => {
    const fs = new MemoryFilesystem();
    await writeJson(fs, "archie.json", { format: "something-else", version: SCHEMA_VERSION, generator: "archie" });
    await writeJson(fs, "exhibits.json", { library: { id: "x" }, exhibits: [] });
    await expect(validateArchieMarker(fs)).rejects.toThrow(/isn't an archie library/i);
  });

  it("rejects a marker with an unknown version (version gate)", async () => {
    const fs = new MemoryFilesystem();
    await writeJson(fs, "archie.json", { format: "archie-library", version: SCHEMA_VERSION + 99, generator: "archie" });
    await writeJson(fs, "exhibits.json", { library: { id: "x" }, exhibits: [] });
    await expect(validateArchieMarker(fs)).rejects.toThrow(/version/i);
  });

  it("rejects a VALID marker when exhibits.json is missing/unparseable (corrupt marked tree)", async () => {
    const fs = new MemoryFilesystem();
    await writeJson(fs, "archie.json", ARCHIE_LIBRARY_MARKER);
    // no exhibits.json at all
    await expect(validateArchieMarker(fs)).rejects.toThrow(/archie library/i);
  });
});

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

describe("ADR-0020 L1 self-ID marker — read side (validateArchieMarker)", () => {
  it("accepts a freshly published tree (round-trip)", async () => {
    const { fs } = await libraryToZipFs(library, () => []);
    await expect(validateArchieMarker(fs)).resolves.toBeUndefined();
  });

  it("rejects a zip WITHOUT the marker", async () => {
    const fs = new MemoryFilesystem();
    // a bare exhibits.json with no archie.json (a non-Archie / hand-rolled zip)
    await writeJson(fs, "exhibits.json", { library: { id: "x" }, exhibits: [] });
    await expect(validateArchieMarker(fs)).rejects.toThrow(/isn't an archie library/i);
  });

  it("rejects a marker with the wrong format", async () => {
    const fs = new MemoryFilesystem();
    await writeJson(fs, "archie.json", { format: "something-else", version: SCHEMA_VERSION, generator: "archie" });
    await writeJson(fs, "exhibits.json", { library: { id: "x" }, exhibits: [] });
    await expect(validateArchieMarker(fs)).rejects.toThrow(/isn't an archie library/i);
  });

  it("rejects a marker with an unknown version", async () => {
    const fs = new MemoryFilesystem();
    await writeJson(fs, "archie.json", { format: "archie-library", version: SCHEMA_VERSION + 99, generator: "archie" });
    await writeJson(fs, "exhibits.json", { library: { id: "x" }, exhibits: [] });
    await expect(validateArchieMarker(fs)).rejects.toThrow(/version/i);
  });

  it("rejects a valid marker when exhibits.json is missing/unparseable", async () => {
    const fs = new MemoryFilesystem();
    await writeJson(fs, "archie.json", ARCHIE_LIBRARY_MARKER);
    // no exhibits.json at all
    await expect(validateArchieMarker(fs)).rejects.toThrow(/archie library/i);
  });
});

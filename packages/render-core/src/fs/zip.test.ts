import { describe, it, expect } from "vitest";
import { ZipFilesystem } from "./zip.js";
import { writeAnnotations, readAnnotations } from "../spine/persist.js";
import { appendNew, appendEdit } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import type { AnnotationLog } from "../wadm/types.js";

// ZipFilesystem — the DownloadFilesystem core (UX-Q2: the zip IS the canonical file). Backs
// the Filesystem seam over an in-memory file tree, serializable to/from a .archie.zip (fflate).

describe("ZipFilesystem — seam + zip serialization round-trip", () => {
  it("round-trips a nested file tree through toZip / fromZip", async () => {
    const fs = new ZipFilesystem();
    const root = await fs.root();
    const w1 = await (await root.getFile("manifest.json", { create: true })).writable();
    await w1.write('{"type":"Manifest"}');
    await w1.close();
    const sub = await root.getDirectory("annotations", { create: true });
    const w2 = await (await sub.getFile("index.json", { create: true })).writable();
    await w2.write('{"a":1}');
    await w2.close();

    const bytes = fs.toZip();
    expect(bytes.byteLength).toBeGreaterThan(0);

    const fs2 = ZipFilesystem.fromZip(bytes);
    const root2 = await fs2.root();
    const m = new TextDecoder().decode(await (await root2.getFile("manifest.json")).readable());
    expect(m).toBe('{"type":"Manifest"}');
    const idx = new TextDecoder().decode(await (await (await root2.getDirectory("annotations")).getFile("index.json")).readable());
    expect(idx).toBe('{"a":1}');
  });

  it("lists immediate entries (files and implicit directories) by prefix", async () => {
    const fs = new ZipFilesystem();
    const root = await fs.root();
    await (await (await root.getFile("a.json", { create: true })).writable()).close();
    const d = await root.getDirectory("history", { create: true });
    await (await (await d.getFile("x.json", { create: true })).writable()).close();
    const top: string[] = [];
    for await (const e of root.entries()) top.push(`${e.kind}:${e.name}`);
    expect(top).toContain("file:a.json");
    expect(top).toContain("directory:history");
  });

  it("getFile/getDirectory without create throws on missing paths", async () => {
    const fs = new ZipFilesystem();
    const root = await fs.root();
    await expect(root.getFile("missing.json")).rejects.toThrow();
    await expect(root.getDirectory("missing")).rejects.toThrow();
  });

  it("INTEGRATION: persist the annotation spine through a zip round-trip (the canonical-file path)", async () => {
    const alice = asClientId("alice");
    const { log: l1, record: v1 } = appendNew([], { target: "c1", body: { type: "TextualBody", value: "v1" }, lastEditor: alice, modifiedAt: "t1", now: 1 });
    const { log }: { log: AnnotationLog } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2" }, lastEditor: alice, modifiedAt: "t2", now: 2 });

    const fs = new ZipFilesystem();
    await writeAnnotations(await fs.root(), log, { baseUrl: "b/" });
    // Save → reopen (the "Open a .archie.zip" flow): serialize and reload from the bytes.
    const reopened = ZipFilesystem.fromZip(fs.toZip());
    const reloaded = await readAnnotations(await reopened.root());

    const sort = (l: AnnotationLog) => [...l].sort((a, b) => (a.rev < b.rev ? -1 : 1));
    expect(sort(reloaded)).toEqual(sort(log));
  });
});

import { describe, expect, it } from "vitest";
import { MemoryFilesystem } from "../fs/memory.js";
import type { FsDirectory } from "../fs/seam.js";
import { asClientId, asExhibitId } from "../wadm/brand.js";
import { appendNew } from "./log.js";
import { readAnnotationsReport, writeAnnotations, AnnotationsCorruptError } from "./persist.js";
import { readStructureReport, writeStructure, StructureCorruptError } from "./structure-persist.js";
import { appendNewSection, sectionKey, orderKeyBetween } from "./structure.js";

const editor = asClientId("recovery");
const exhibit = asExhibitId("exhibit");

const stores = [
  {
    name: "annotations", error: AnnotationsCorruptError,
    read: (dir: FsDirectory) => readAnnotationsReport(dir),
    write: async (dir: FsDirectory) => {
      const a = appendNew([], { target: "canvas", lastEditor: editor });
      const b = appendNew(a.log, { target: "canvas", lastEditor: editor });
      await writeAnnotations(dir, b.log);
      return { broken: a.record.logicalId, healthy: b.record.logicalId };
    },
  },
  {
    name: "structure", error: StructureCorruptError,
    read: (dir: FsDirectory) => readStructureReport(dir, exhibit),
    write: async (dir: FsDirectory) => {
      const a = appendNewSection([], { key: sectionKey(exhibit, "a"), order: orderKeyBetween(null, null), objectId: "object", title: "A", lastEditor: editor });
      const b = appendNewSection(a.log, { key: sectionKey(exhibit, "b"), order: orderKeyBetween(null, null), objectId: "object", title: "B", lastEditor: editor });
      await writeStructure(dir, b.log);
      return { broken: "a", healthy: b.record.logicalId };
    },
  },
];

async function replace(dir: FsDirectory, name: string, value: unknown) {
  const writer = await (await dir.getFile(name, { create: true })).writable();
  await writer.write(JSON.stringify(value));
  await writer.close();
}

for (const store of stores) describe(`${store.name}: classified recovery`, () => {
  it.each([{}, null, [], { items: {} }, { type: "unrelated", items: [] }])("wrong page schema %j reports one failure and retains healthy siblings", async (value) => {
    const dir = await new MemoryFilesystem().root();
    const { broken, healthy } = await store.write(dir);
    await replace(await dir.getDirectory("history"), `${broken}.json`, value);
    const result = await store.read(dir);
    expect(result.corrupt).toHaveLength(1);
    expect(result.corrupt[0]?.reason).toMatch(/history page/);
    expect(result.log.map((r) => r.logicalId)).toEqual([healthy]);
  });

  it.each([null, [], "index", { note: 4 }])("wrong index schema %j refuses the store", async (value) => {
    const dir = await new MemoryFilesystem().root();
    await store.write(dir);
    await replace(await dir.getDirectory("history"), "index.json", value);
    await expect(store.read(dir)).rejects.toThrow(store.error);
  });

  it.each([new DOMException("denied", "NotAllowedError"), new Error("disk I/O failed")])("directory failure %s remains a failure", async (failure) => {
    const inner = await new MemoryFilesystem().root();
    const dir: FsDirectory = {
      getDirectory: async () => { throw failure; },
      getFile: (name, opts) => inner.getFile(name, opts),
      entries: () => inner.entries(), remove: (name) => inner.remove(name),
    };
    await expect(store.read(dir)).rejects.toBe(failure);
  });

  it("classified directory absence is clean and empty", async () => {
    expect(await store.read(await new MemoryFilesystem().root())).toEqual({ log: [], corrupt: [] });
  });
});

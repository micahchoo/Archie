import { describe, it, expect } from "vitest";
import { appendNew, appendEdit, appendDelete } from "./log.js";
import { writeAnnotations, readAnnotations } from "./persist.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { asClientId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord } from "../wadm/types.js";

// Annotation persistence (ADR-0003 / Q-5): write the spine to disk via the Filesystem seam
// (heads page + annotations/history/{logicalId}.json + index.json) and reload the full log.

const alice = asClientId("alice");
const bob = asClientId("bob");
const target = "https://example.org/canvas/1";
const sortByRev = (log: AnnotationLog) => [...log].sort((a, b) => (a.rev < b.rev ? -1 : a.rev > b.rev ? 1 : 0));

function buildLog(): { log: AnnotationLog } {
  const { log: l1, record: v1 } = appendNew([], { target, body: { type: "TextualBody", value: "v1" }, lastEditor: alice, modifiedAt: "t1", now: 1 });
  const { log: l2 } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2" }, lastEditor: bob, modifiedAt: "t2", now: 2 });
  const { log: l3, record: n2 } = appendNew(l2, { target, body: { type: "TextualBody", value: "n2" }, lastEditor: alice, modifiedAt: "t3", now: 3 });
  const { log } = appendDelete(l3, n2.logicalId, { lastEditor: alice, modifiedAt: "t4", now: 4 });
  return { log };
}

describe("writeAnnotations / readAnnotations — disk round-trip over the Filesystem seam", () => {
  it("round-trips the full log: write -> read == log (DAG reconstructed from history)", async () => {
    const { log } = buildLog();
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    await writeAnnotations(root, log, { baseUrl: "https://u.gh.io/lib/ex/" });
    const reloaded = await readAnnotations(root);
    expect(sortByRev(reloaded)).toEqual(sortByRev(log));
  });

  it("writes the consumer heads page + the history dir + index.json", async () => {
    const { log } = buildLog();
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    await writeAnnotations(root, log);
    const top: string[] = [];
    for await (const e of root.entries()) top.push(`${e.kind}:${e.name}`);
    expect(top).toContain("file:heads.json");
    expect(top).toContain("directory:history");
    const hist = await root.getDirectory("history");
    const histEntries: string[] = [];
    for await (const e of hist.entries()) histEntries.push(e.name);
    expect(histEntries).toContain("index.json");
    expect(histEntries.filter((n) => n.endsWith(".json")).length).toBeGreaterThanOrEqual(3); // index + 2 notes
  });

  it("the persisted heads page omits deleted notes and shows only current versions", async () => {
    const { log } = buildLog(); // note2 was deleted
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    await writeAnnotations(root, log, { baseUrl: "b/" });
    const headsFile = await root.getFile("heads.json");
    const heads = JSON.parse(new TextDecoder().decode(await headsFile.readable())) as { items: Array<{ id: string }> };
    expect(heads.items).toHaveLength(1); // only the (edited, live) first note
    expect(heads.items[0]!.id).toContain("/v2");
  });

  it("reading a filesystem with no annotations returns an empty log (not an error)", async () => {
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    expect(await readAnnotations(root)).toEqual([]);
  });

  it("re-writing is idempotent (same log -> same reload)", async () => {
    const { log } = buildLog();
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    await writeAnnotations(root, log);
    await writeAnnotations(root, log);
    const reloaded = await readAnnotations(root);
    expect(sortByRev(reloaded)).toEqual(sortByRev(log));
  });
});

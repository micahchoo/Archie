// Archie-a690 — publish-time torn ANNOTATION store surfacing, warn parity with the structure
// side (structure-export-roundtrip.test.ts pins those). Publish ships what READS; these tests
// pin that each collapse is LOUD at the seam the App's loadAllLogs feeds the helper from:
// a real torn store read through AnnotationSession.load (loadCorruption is the input contract).
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryFilesystem, AnnotationSession, appendNew, writeAnnotations, asClientId } from "@render/core";
import { warnAnnotationPublishCorruption } from "./publish-warnings.js";

const alice = asClientId("alice");
const target = "https://example.org/canvas/1";

/** A persisted two-note store with the given page indices clobbered to garbage in place. */
async function tornStore(corruptCount: 0 | 1 | 2) {
  const { log: l1, record: a } = appendNew([], { target, body: { type: "TextualBody", value: "a1" }, lastEditor: alice, now: 1 });
  const { log, record: b } = appendNew(l1, { target, body: { type: "TextualBody", value: "b1" }, lastEditor: alice, now: 2 });
  const root = await new MemoryFilesystem().root();
  await writeAnnotations(root, log);
  const hist = await root.getDirectory("history");
  for (const id of [a.logicalId, b.logicalId].slice(0, corruptCount)) {
    const w = await (await hist.getFile(`${id}.json`, { create: true })).writable();
    await w.write("{ not json");
    await w.close();
  }
  return root;
}

afterEach(() => vi.restoreAllMocks());

describe("Archie-a690 — annotation publish warns on a torn store (parity with structure)", () => {
  it("ALL-corrupt: distinct NOT-exported warn — the collapse to 'never authored' is loud", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await AnnotationSession.load(await tornStore(2), alice);
    expect(s.entries.length).toBe(0); // ships nothing — the rule-2 collapse this warn makes visible
    expect(s.loadCorruption.length).toBe(2);
    warnAnnotationPublishCorruption("herbal", s.entries.length, s.loadCorruption);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toMatch(/exhibit "herbal" annotation history was NOT exported/);
    expect(warn.mock.calls[0]![0]).toMatch(/never had annotations/);
  });

  it("PARTIAL-corrupt: advisory warn — the readable entries still ship", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await AnnotationSession.load(await tornStore(1), alice);
    expect(s.entries.length).toBe(1); // the surviving note ships
    expect(s.loadCorruption.length).toBe(1);
    warnAnnotationPublishCorruption("herbal", s.entries.length, s.loadCorruption);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toMatch(/1 unreadable annotation history page/);
    expect(warn.mock.calls[0]![0]).toMatch(/publishing the readable annotations/);
  });

  it("clean store: silent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await AnnotationSession.load(await tornStore(0), alice);
    warnAnnotationPublishCorruption("herbal", s.entries.length, s.loadCorruption);
    expect(warn).not.toHaveBeenCalled();
  });
});

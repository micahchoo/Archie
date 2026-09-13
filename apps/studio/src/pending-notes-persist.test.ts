import { describe, expect, it } from "vitest";
import { persistPendingNotes, type PendingNotesPersistenceDeps } from "./pending-notes-persist.js";
import type { PendingNote } from "./store.js";

const note = (id: string): PendingNote => ({ id, objectId: "o1", comment: id, tags: [] });

function harness(initial: Record<string, PendingNote[]> = {}) {
  let map = structuredClone(initial);
  let chain = Promise.resolve();
  const deps: PendingNotesPersistenceDeps = {
    load: async () => structuredClone(map),
    save: async (next) => { map = structuredClone(next); },
    enqueue: (_key, _label, job) => {
      const run = chain.then(job);
      chain = run.catch(() => {});
      return run.then(() => true);
    },
  };
  return { deps, read: () => map };
}

describe("pending-note persistence boundary", () => {
  it("serializes read-modify-write so two rapid edits retain both snapshots", async () => {
    const h = harness();
    await Promise.all([
      persistPendingNotes(h.deps, "ex", [note("a")]),
      persistPendingNotes(h.deps, "ex", [note("a"), note("b")]),
    ]);
    expect(h.read().ex?.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("keeps a pending mutation attached to its originating exhibit after navigation", async () => {
    const h = harness({ exB: [] });
    await persistPendingNotes(h.deps, "exA", [note("a")]);
    expect(h.read()).toEqual({ exB: [], exA: [note("a")] });
  });
});

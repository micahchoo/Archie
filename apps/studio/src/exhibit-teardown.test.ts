// Bulk exhibit teardown (Archie-ddaa) — the App-side helper bulk delete / undo-import / singular delete all
// route through. The on-disk primitives it composes (clearExhibitStructure, the structure session's forget)
// are pinned by structure-lifecycle.svelte.test.ts; this file pins the ORCHESTRATION the reviewer flagged as
// the data-integrity gap: per-slug session + log teardown BEFORE the one meta write, so a recreated same-slug
// exhibit can't resurrect an orphaned log. Deps are injected as spies over an ordered call log — the same
// fake-deps style the structure-lifecycle suite uses over its fake OPFS.
import { describe, it, expect, vi } from "vitest";
import { teardownAndRemoveExhibits, type ExhibitTeardownDeps } from "./exhibit-teardown.js";

/** Build spy deps over a shared ordered log so tests can assert BOTH per-slug calls and content-before-meta ordering. */
function harness(currentSlug: string) {
  const log: string[] = [];
  const deps: ExhibitTeardownDeps = {
    currentSlug,
    forgetCurrentSession: vi.fn(() => void log.push("forgetCurrentSession")),
    forgetStructure: vi.fn((slug: string) => void log.push(`forgetStructure:${slug}`)),
    clearStructure: vi.fn(async (slug: string) => void log.push(`clearStructure:${slug}`)),
    clearAnnotations: vi.fn(async (slug: string) => void log.push(`clearAnnotations:${slug}`)),
    removeMeta: vi.fn(async (slugs: string[]) => void log.push(`removeMeta:${slugs.join(",")}`)),
    revokeAssets: vi.fn(() => void log.push("revokeAssets")),
  };
  return { deps, log };
}

describe("teardownAndRemoveExhibits", () => {
  it("tears down structure + annotations for EACH slug, then removes all meta in ONE write", async () => {
    const { deps, log } = harness("loaded");
    await teardownAndRemoveExhibits(deps, ["a", "b", "c"]);

    // Every slug got both on-disk clears (the resurrection guard is per-slug, not per-batch).
    for (const slug of ["a", "b", "c"]) {
      expect(deps.forgetStructure).toHaveBeenCalledWith(slug);
      expect(deps.clearStructure).toHaveBeenCalledWith(slug);
      expect(deps.clearAnnotations).toHaveBeenCalledWith(slug);
    }
    // Meta removed exactly once, with the whole batch (the one-persist property).
    expect(deps.removeMeta).toHaveBeenCalledTimes(1);
    expect(deps.removeMeta).toHaveBeenCalledWith(["a", "b", "c"]);
    // ...and it lands LAST — every on-disk clear precedes the meta commit (content-first / marker-last).
    expect(log.at(-1)).toBe("removeMeta:a,b,c");
    expect(log.filter((e) => e.startsWith("clearAnnotations")).length).toBe(3);
    expect(log.indexOf("removeMeta:a,b,c")).toBeGreaterThan(log.lastIndexOf("clearAnnotations:c"));
  });

  it("forgets the session + revokes assets ONLY when the loaded exhibit is in the batch", async () => {
    const { deps } = harness("loaded");
    await teardownAndRemoveExhibits(deps, ["bg-1", "loaded", "bg-2"]);
    expect(deps.forgetCurrentSession).toHaveBeenCalledTimes(1);
    expect(deps.revokeAssets).toHaveBeenCalledTimes(1);
  });

  it("leaves the session + assets untouched when deleting only background exhibits", async () => {
    const { deps } = harness("loaded");
    await teardownAndRemoveExhibits(deps, ["bg-1", "bg-2"]);
    expect(deps.forgetCurrentSession).not.toHaveBeenCalled();
    expect(deps.revokeAssets).not.toHaveBeenCalled();
    // ...but the background exhibits' logs are STILL torn down (the whole point).
    expect(deps.clearAnnotations).toHaveBeenCalledWith("bg-1");
    expect(deps.clearAnnotations).toHaveBeenCalledWith("bg-2");
  });

  it("the singular case (one slug, and it's the loaded one) still runs the full teardown", async () => {
    const { deps, log } = harness("only");
    await teardownAndRemoveExhibits(deps, ["only"]);
    expect(log).toEqual([
      "forgetCurrentSession",
      "forgetStructure:only",
      "clearStructure:only",
      "clearAnnotations:only",
      "removeMeta:only",
      "revokeAssets",
    ]);
  });
});

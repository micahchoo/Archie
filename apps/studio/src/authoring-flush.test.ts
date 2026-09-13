import { describe, expect, it } from "vitest";
import { createAuthoringFlush } from "./authoring-flush.js";

describe("authoring export barrier", () => {
  it("flushes library metadata after notes and structure", async () => {
    const events: string[] = [];
    const flush = createAuthoringFlush(
      async () => { events.push("notes"); },
      async (slug) => { events.push(`structure:${slug}`); },
      () => "ex",
      async () => { events.push("library"); },
    );
    await flush();
    expect(events).toEqual(["notes", "structure:ex", "library"]);
  });

  it("does not let a writer observe the tree until notes and structure have flushed", async () => {
    const events: string[] = [];
    let releaseStructure!: () => void;
    const structureReady = new Promise<void>((resolve) => { releaseStructure = resolve; });
    const flush = createAuthoringFlush(
      async () => { events.push("notes"); },
      async (slug) => { events.push(`structure:${slug}`); await structureReady; },
      () => "ex",
    );

    const writer = async () => { await flush(); events.push("write"); };
    const boundary = writer();
    await Promise.resolve();
    expect(events).toEqual(["notes", "structure:ex"]);
    expect(events).not.toContain("write");
    releaseStructure();
    await boundary;
    expect(events).toEqual(["notes", "structure:ex", "write"]);
  });
});

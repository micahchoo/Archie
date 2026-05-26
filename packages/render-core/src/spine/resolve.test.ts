import { describe, it, expect } from "vitest";
import { appendNew, append } from "./log.js";
import { resolveConflict } from "./merge.js";
import { headsOf, ancestors } from "./merge.js";
import { projectHeads } from "./heads.js";
import { toHistory } from "./serialize.js";
import { fromHistory } from "./deserialize.js";
import { asClientId, mintRevId } from "../wadm/brand.js";
import type { AnnotationRecord, AnnotationLog } from "../wadm/types.js";

// Merge resolution (Q-7): collapse plural concurrent heads into one via a multi-parent merge
// node (mergeParents). Completes the version-DAG: P0-4 detected conflicts; this resolves them.

const alice = asClientId("alice");
const bob = asClientId("bob");
const target = "c1";

/** v1 + two concurrent v2 heads (the unresolved-merge state from P0-4). */
function diverged(): { log: AnnotationLog; lid: string; a: AnnotationRecord; b: AnnotationRecord } {
  const { log: base, record: v1 } = appendNew([], { target, body: { type: "TextualBody", value: "v1" }, lastEditor: alice, modifiedAt: "t", now: 1 });
  const a: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(0, () => 0.2), version: 2, parent: v1.rev, modifiedAt: "tA", lastEditor: alice, deleted: false, target, body: { type: "TextualBody", value: "Alice" } };
  const b: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(0, () => 0.8), version: 2, parent: v1.rev, modifiedAt: "tB", lastEditor: bob, deleted: false, target, body: { type: "TextualBody", value: "Bob" } };
  return { log: append(append(base, a), b), lid: v1.logicalId, a, b };
}

describe("resolveConflict (Q-7 multi-parent merge node)", () => {
  it("collapses plural heads into a SINGLE head", () => {
    const { log, lid } = diverged();
    expect(headsOf(log, lid as never)).toHaveLength(2); // unresolved
    const resolved = resolveConflict(log, lid as never, { body: { type: "TextualBody", value: "merged" }, lastEditor: alice, now: 9 });
    expect(headsOf(resolved, lid as never)).toHaveLength(1); // resolved
    expect(projectHeads(resolved)).toHaveLength(1);
  });

  it("the merge node references BOTH prior heads (parent + mergeParents) and bumps version", () => {
    const { log, lid, a, b } = diverged();
    const resolved = resolveConflict(log, lid as never, { body: { type: "TextualBody", value: "merged" }, lastEditor: alice, now: 9 });
    const head = headsOf(resolved, lid as never)[0]!;
    expect(head.version).toBe(3); // max(2,2)+1
    const refs = new Set([head.parent, ...(head.mergeParents ?? [])]);
    expect(refs.has(a.rev)).toBe(true);
    expect(refs.has(b.rev)).toBe(true);
  });

  it("the merge node's ancestors include BOTH branches (multi-parent DAG walk)", () => {
    const { log, lid, a, b } = diverged();
    const resolved = resolveConflict(log, lid as never, { lastEditor: alice, now: 9 });
    const head = headsOf(resolved, lid as never)[0]!;
    const anc = ancestors(resolved, head.rev);
    expect(anc.has(a.rev)).toBe(true);
    expect(anc.has(b.rev)).toBe(true);
  });

  it("round-trips the merge node through history (mergeParents preserved)", () => {
    const { log, lid } = diverged();
    const resolved = resolveConflict(log, lid as never, { body: { type: "TextualBody", value: "merged" }, lastEditor: alice, now: 9 });
    const reloaded = fromHistory(Object.values(toHistory(resolved, { baseUrl: "b/" }).pages));
    const head = reloaded.find((r) => (r.mergeParents ?? []).length > 0);
    expect(head).toBeDefined();
    expect(head!.version).toBe(3);
  });
});

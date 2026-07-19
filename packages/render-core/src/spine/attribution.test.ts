// Note→section attribution field (Archie-6b8e) — the `section` field's full path through the
// spine, mirroring `reading`: append* ops, serialize/deserialize round-trip, resolveConflict
// C14 disposition. NEW file — existing suites (log/merge/serialize/deserialize) untouched.

import { describe, it, expect } from "vitest";
import { asClientId, asLogicalId } from "../wadm/brand.js";
import type { AnnotationLog } from "../wadm/types.js";
import { appendNew, appendEdit, appendDelete, linearHead } from "./log.js";
import { mergeLogs, resolveConflict } from "./merge.js";
import { toHistory, toHeadsPage } from "./serialize.js";
import { fromHistory } from "./deserialize.js";

const alice = asClientId("alice");
const bob = asClientId("bob");
const rng = () => 0.5;

const T0 = 1_700_000_000_000;

function newNote(log: AnnotationLog, section: string | undefined, now: number) {
  return appendNew(log, {
    target: "https://example.org/canvas/1",
    body: { type: "TextualBody", value: "note" },
    ...(section !== undefined ? { section } : {}),
    lastEditor: alice,
    now,
    rng,
  });
}

describe("section attribution — append ops (mirrors reading)", () => {
  it("appendNew sets the field only when supplied", () => {
    const withIt = newNote([], "s1", T0).record;
    expect(withIt.section).toBe("s1");
    const without = newNote([], undefined, T0 + 1).record;
    expect("section" in without).toBe(false);
  });

  it("appendEdit carries forward when omitted, sets on string, clears on null (tri-state, like reading)", () => {
    let { log, record } = newNote([], "s1", T0);
    const id = record.logicalId;

    // omitted = carry forward
    log = appendEdit(log, id, { body: { type: "TextualBody", value: "edited" }, lastEditor: bob, now: T0 + 10 }).log;
    expect(linearHead(log, id).section).toBe("s1");

    // string = set (move to another section)
    log = appendEdit(log, id, { section: "s2", lastEditor: bob, now: T0 + 20 }).log;
    expect(linearHead(log, id).section).toBe("s2");

    // null = clear to unattributed
    log = appendEdit(log, id, { section: null, lastEditor: bob, now: T0 + 30 }).log;
    expect("section" in linearHead(log, id)).toBe(false);
  });

  it("appendDelete drops the field (tombstone has no content — _deleteCarry named drop)", () => {
    const { log, record } = newNote([], "s1", T0);
    const tomb = appendDelete(log, record.logicalId, { lastEditor: alice, now: T0 + 10 }).record;
    expect(tomb.deleted).toBe(true);
    expect("section" in tomb).toBe(false);
  });
});

describe("section attribution — serialize/deserialize round-trip", () => {
  it("round-trips through history pages (archie:section)", () => {
    let { log, record } = newNote([], "s1", T0);
    const id = record.logicalId;
    log = appendEdit(log, id, { section: "s2", lastEditor: bob, now: T0 + 10 }).log;

    const history = toHistory(log);
    const reloaded = fromHistory(Object.values(history.pages));
    expect(reloaded).toHaveLength(2);
    expect(reloaded.find((r) => r.version === 1)?.section).toBe("s1");
    expect(reloaded.find((r) => r.version === 2)?.section).toBe("s2");
    // the head after reload agrees
    expect(linearHead(reloaded, id).section).toBe("s2");
  });

  it("is emitted on the heads page and byte-stable when absent", () => {
    const attributed = newNote([], "s1", T0).log;
    const headsJson = JSON.stringify(toHeadsPage(attributed, "page-1"));
    expect(headsJson).toContain('"archie:section":"s1"');

    const unattributed = newNote([], undefined, T0 + 1).log;
    expect(JSON.stringify(toHeadsPage(unattributed, "page-1"))).not.toContain("archie:section");
    expect(JSON.stringify(toHistory(unattributed).pages)).not.toContain("archie:section");
    // and a reloaded unattributed record has NO section key at all
    const reloaded = fromHistory(Object.values(toHistory(unattributed).pages));
    expect("section" in reloaded[0]!).toBe(false);
  });

  it("skips a malformed (non-string) archie:section on parse — same contract as reading", () => {
    const { log } = newNote([], "s1", T0);
    const history = toHistory(log);
    const page = Object.values(history.pages)[0]!;
    (page.items[0] as unknown as Record<string, unknown>)["archie:section"] = 42;
    const reloaded = fromHistory([page]);
    expect("section" in reloaded[0]!).toBe(false);
  });
});

describe("section attribution — resolveConflict (C14: optional-inherited, like reading)", () => {
  /** A note with two concurrent edit heads: alice's (earlier rev, primary) without section,
   *  bob's with section "s1". */
  function conflicted(): { log: AnnotationLog; id: ReturnType<typeof asLogicalId> } {
    const base = newNote([], undefined, T0);
    const id = base.record.logicalId;
    const a = appendEdit(base.log, id, { body: { type: "TextualBody", value: "a" }, lastEditor: alice, now: T0 + 10 });
    const b = appendEdit(base.log, id, { section: "s1", lastEditor: bob, now: T0 + 20 });
    return { log: mergeLogs(a.log, b.log), id };
  }

  it("inherits from ANY head that carries it (not just the primary), when resolution omits it", () => {
    const { log, id } = conflicted();
    const resolved = resolveConflict(log, id, { lastEditor: alice, now: T0 + 100 });
    // primary (lexicographically-first rev = alice's earlier edit) has NO section — inherited from bob's head
    expect(linearHead(resolved, id).section).toBe("s1");
  });

  it("takes resolution.section when supplied", () => {
    const { log, id } = conflicted();
    const resolved = resolveConflict(log, id, { section: "s9", lastEditor: alice, now: T0 + 100 });
    expect(linearHead(resolved, id).section).toBe("s9");
  });

  it("stays absent when no head and no resolution carries it", () => {
    const base = newNote([], undefined, T0);
    const id = base.record.logicalId;
    const a = appendEdit(base.log, id, { body: { type: "TextualBody", value: "a" }, lastEditor: alice, now: T0 + 10 });
    const b = appendEdit(base.log, id, { body: { type: "TextualBody", value: "b" }, lastEditor: bob, now: T0 + 20 });
    const resolved = resolveConflict(mergeLogs(a.log, b.log), id, { lastEditor: alice, now: T0 + 100 });
    expect("section" in linearHead(resolved, id)).toBe(false);
  });
});

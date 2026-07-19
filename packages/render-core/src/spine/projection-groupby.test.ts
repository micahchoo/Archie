// Single-pass group-by projection (Archie-c16d) — equivalence + perf pins.
//
// The group-by path (`headsByLogicalId`, consumed by `projectHeads` and `projectSections`) must
// be OBSERVABLY IDENTICAL to the naive per-key `headsOf` scan it replaced: same heads, same
// order, same tiebreaks, same conflicted/tombstone/missingObject behavior. The naive reference
// implementations below are verbatim copies of the pre-c16d projection bodies (heads.ts and
// structure.ts @ 25e00c1); randomized branchy logs (plural heads, merge nodes, tombstones,
// edit-vs-delete, revive, shuffled record order) must deep-equal across both paths.
//
// Perf: the probe's synthetic harness (PROBE-structure-revlog A3, 100 sections × 20 revs =
// 2000 records) measured the naive scan at 8–12ms avg / 15.3ms max against the 16ms
// interactivity bar. The group-by must sit comfortably under it (generous CI-safe threshold;
// the measured number is logged).

import { describe, it, expect } from "vitest";
import { asClientId, asExhibitId, type LogicalId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord, W3CBody } from "../wadm/types.js";
import { appendNew, appendEdit, appendDelete, type DagRecord } from "./log.js";
import { mergeLogs, headsOf, resolveConflict } from "./merge.js";
import { projectHeads, headsByLogicalId } from "./heads.js";
import {
  sectionKey,
  localSectionId,
  orderKeyBetween,
  appendNewSection,
  appendEditSection,
  appendDeleteSection,
  appendUndeleteSection,
  resolveSectionConflict,
  projectSections,
  type SectionLog,
  type SectionKey,
  type ProjectedSection,
  type StructureProjection,
} from "./structure.js";

const alice = asClientId("alice");
const bob = asClientId("bob");
const EX = asExhibitId("ex-groupby");
const target = "https://example.org/canvas/1";
const t = "2026-05-24T10:00:00.000Z";

// ---- Deterministic PRNG (mulberry32) — seeded, so randomized logs are reproducible ----

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher–Yates — shuffling the WHOLE log stresses grouping across interleaved
 *  record order (both paths read the same shuffled log, so equivalence must still hold). */
function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ---- Naive reference implementations: verbatim pre-c16d projection bodies ----

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** heads.ts `projectHeads` @ 25e00c1 — per-key `headsOf` over the whole log. */
function naiveProjectHeads<R extends DagRecord<string>>(log: readonly R[]): R[] {
  const logicalIds: R["logicalId"][] = [...new Set(log.map((r) => r.logicalId))];
  const out: R[] = [];
  for (const lid of logicalIds) {
    for (const head of headsOf(log, lid)) {
      if (!head.deleted) out.push(head);
    }
  }
  return out.sort((x, y) => cmp(x.logicalId, y.logicalId) || cmp(x.rev, y.rev));
}

/** structure.ts `projectSections` @ 25e00c1 — per-key `headsOf` over the whole log. */
function naiveProjectSections(log: SectionLog, liveObjectIds: ReadonlySet<string>): StructureProjection {
  const keys: SectionKey[] = [...new Set(log.map((r) => r.logicalId))];
  const rows: ProjectedSection[] = [];
  const tombstoned = new Set<SectionKey>();
  for (const key of keys) {
    const heads = headsOf(log, key);
    const live = heads.filter((h) => !h.deleted);
    if (live.length === 0) {
      tombstoned.add(key);
      continue;
    }
    for (const head of live) {
      rows.push({
        key,
        rev: head.rev,
        order: head.order,
        section: {
          id: localSectionId(key),
          title: head.title,
          objectId: head.objectId,
          ...(head.start !== undefined ? { start: head.start } : {}),
          ...(head.prose !== undefined ? { prose: head.prose } : {}),
        },
        missingObject: !liveObjectIds.has(head.objectId),
        conflicted: heads.length > 1,
      });
    }
  }
  rows.sort((x, y) => cmp(x.order, y.order) || cmp(x.key, y.key) || cmp(x.rev, y.rev));
  return { sections: rows, tombstoned };
}

// ---- Randomized branchy log generators (real append/merge APIs, replica-exchange forks) ----

/** Every append gets a DISTINCT `now`, so revs are unique and lexicographically mint-ordered. */
function makeClock(): () => number {
  let now = 1_000_000;
  return () => now++;
}

/**
 * One annotation key's history, scenario chosen by the seeded rng:
 * linear chains, unresolved 2–3-way forks (replicas exchanged via `mergeLogs`), edit-vs-delete
 * branches, resolved forks (merge nodes) with optional post-resolve edits, and tombstones.
 */
function growAnnotationKey(log: AnnotationLog, rand: () => number, tick: () => number): AnnotationLog {
  const mkBody = (v: string): W3CBody => ({ type: "TextualBody", value: v });
  const { log: l1, record: v1 } = appendNew(log, { target, body: mkBody("v1"), lastEditor: alice, modifiedAt: t, now: tick(), rng: rand });
  const id: LogicalId = v1.logicalId;
  let cur = l1;
  const edits = Math.floor(rand() * 4);
  for (let i = 0; i < edits; i++) {
    cur = appendEdit(cur, id, { body: mkBody(`e${i}`), lastEditor: alice, modifiedAt: t, now: tick() }).log;
  }
  const scenario = Math.floor(rand() * 5);
  if (scenario === 0) {
    // Linear; maybe tombstoned.
    if (rand() < 0.4) cur = appendDelete(cur, id, { lastEditor: alice, modifiedAt: t, now: tick() }).log;
    return cur;
  }
  // Fork: each replica advances independently from the same base, then logs are exchanged.
  const branches = scenario === 1 ? 3 : 2;
  const replicas: AnnotationLog[] = [];
  for (let b = 0; b < branches; b++) {
    const editor = b % 2 === 0 ? alice : bob;
    if (scenario === 2 && b === branches - 1) {
      // Edit-vs-delete branch: one head is a tombstone.
      replicas.push(appendDelete(cur, id, { lastEditor: editor, modifiedAt: t, now: tick() }).log);
    } else {
      replicas.push(appendEdit(cur, id, { body: mkBody(`b${b}`), lastEditor: editor, modifiedAt: t, now: tick() }).log);
    }
  }
  let merged = cur;
  for (const r of replicas) merged = [...mergeLogs(merged, r)];
  if (scenario <= 2) return merged; // unresolved plural heads (incl. tombstone branches)
  // Resolved fork: a multi-parent merge node collapses the heads.
  let resolved = resolveConflict(merged, id, { body: mkBody("resolved"), lastEditor: alice, now: tick() });
  if (scenario === 4) {
    resolved = appendEdit(resolved, id, { body: mkBody("post"), lastEditor: bob, modifiedAt: t, now: tick() }).log;
    if (rand() < 0.3) resolved = appendDelete(resolved, id, { lastEditor: bob, modifiedAt: t, now: tick() }).log;
  }
  return [...resolved];
}

function randomAnnotationLog(seed: number, keys: number): AnnotationLog {
  const rand = mulberry32(seed);
  const tick = makeClock();
  let log: AnnotationLog = [];
  for (let k = 0; k < keys; k++) log = growAnnotationKey(log, rand, tick);
  return log;
}

/** Section sibling of growAnnotationKey — adds the section-only revive (undelete) path. */
function growSectionKey(log: SectionLog, idx: number, rand: () => number, tick: () => number): SectionLog {
  const key = sectionKey(EX, `s${idx}`);
  const order = orderKeyBetween(null, null) + idx.toString(36).padStart(3, "1");
  const objectId = `o${idx % 5}`; // o3/o4 dangle vs LIVE_OBJECTS below → missingObject rows
  let cur = appendNewSection(log, { key, order, objectId, title: `S${idx}`, lastEditor: alice, modifiedAt: t, now: tick(), rng: rand }).log;
  const edits = Math.floor(rand() * 4);
  for (let i = 0; i < edits; i++) {
    cur = appendEditSection(cur, key, {
      title: `S${idx}.${i}`,
      ...(rand() < 0.3 ? { prose: `p${i}` } : {}),
      ...(rand() < 0.2 ? { start: `#t=${i}` } : {}),
      lastEditor: alice, modifiedAt: t, now: tick(), rng: rand,
    }).log;
  }
  const scenario = Math.floor(rand() * 6);
  if (scenario === 0) {
    if (rand() < 0.5) cur = appendDeleteSection(cur, key, { lastEditor: alice, modifiedAt: t, now: tick(), rng: rand }).log;
    return cur;
  }
  if (scenario === 1) {
    // Delete-then-revive (first-class un-delete), maybe re-deleted.
    cur = appendDeleteSection(cur, key, { lastEditor: alice, modifiedAt: t, now: tick(), rng: rand }).log;
    cur = appendUndeleteSection(cur, key, { lastEditor: bob, modifiedAt: t, now: tick(), rng: rand }).log;
    if (rand() < 0.3) cur = appendDeleteSection(cur, key, { lastEditor: bob, modifiedAt: t, now: tick(), rng: rand }).log;
    return cur;
  }
  const branches = scenario === 2 ? 3 : 2;
  const replicas: SectionLog[] = [];
  for (let b = 0; b < branches; b++) {
    const editor = b % 2 === 0 ? alice : bob;
    if (scenario === 3 && b === branches - 1) {
      // Edit-vs-delete: plural heads with one live row (C15 part-hidden).
      replicas.push(appendDeleteSection(cur, key, { lastEditor: editor, modifiedAt: t, now: tick(), rng: rand }).log);
    } else {
      replicas.push(appendEditSection(cur, key, { title: `S${idx}b${b}`, lastEditor: editor, modifiedAt: t, now: tick(), rng: rand }).log);
    }
  }
  let merged = cur;
  for (const r of replicas) merged = [...mergeLogs(merged, r)];
  if (scenario <= 3) return merged; // unresolved plural heads
  let resolved = resolveSectionConflict(merged, key, { title: `S${idx}R`, lastEditor: alice, modifiedAt: t, now: tick(), rng: rand });
  if (scenario === 5) {
    resolved = appendEditSection(resolved, key, { title: `S${idx}P`, lastEditor: bob, modifiedAt: t, now: tick(), rng: rand }).log;
    if (rand() < 0.3) resolved = appendDeleteSection(resolved, key, { lastEditor: bob, modifiedAt: t, now: tick(), rng: rand }).log;
  }
  return [...resolved];
}

function randomSectionLog(seed: number, keys: number): SectionLog {
  const rand = mulberry32(seed);
  const tick = makeClock();
  let log: SectionLog = [];
  for (let k = 0; k < keys; k++) log = growSectionKey(log, k, rand, tick);
  return log;
}

const LIVE_OBJECTS = new Set(["o0", "o1", "o2"]);
const SEEDS = [1, 7, 42, 1234, 987654];

// ---- Equivalence: group-by path deep-equals the naive per-key headsOf path ----

describe("group-by projection equivalence (Archie-c16d)", () => {
  it("headsByLogicalId per key deep-equals headsOf, for branchy annotation and section logs", () => {
    for (const seed of SEEDS) {
      const alog = randomAnnotationLog(seed, 20);
      const agroups = headsByLogicalId(alog);
      const aids = [...new Set(alog.map((r) => r.logicalId))];
      expect([...agroups.keys()]).toEqual(aids); // first-appearance key order
      for (const lid of aids) expect(agroups.get(lid)).toEqual(headsOf(alog, lid));

      const slog = randomSectionLog(seed, 20);
      const sgroups = headsByLogicalId(slog);
      const skeys = [...new Set(slog.map((r) => r.logicalId))];
      expect([...sgroups.keys()]).toEqual(skeys);
      for (const key of skeys) expect(sgroups.get(key)).toEqual(headsOf(slog, key));
    }
  });

  it("projectHeads deep-equals the naive per-key projection on randomized branchy annotation logs", () => {
    for (const seed of SEEDS) {
      const log = randomAnnotationLog(seed, 25);
      expect(projectHeads(log)).toEqual(naiveProjectHeads(log));
    }
  });

  it("projectSections deep-equals the naive per-key projection on randomized branchy section logs", () => {
    for (const seed of SEEDS) {
      const log = randomSectionLog(seed, 25);
      expect(projectSections(log, LIVE_OBJECTS)).toEqual(naiveProjectSections(log, LIVE_OBJECTS));
    }
  });

  it("equivalence holds with the log records shuffled (grouping is order-independent per key set)", () => {
    for (const seed of SEEDS) {
      const rand = mulberry32(seed ^ 0x5eed);
      const alog = shuffled(randomAnnotationLog(seed, 15), rand);
      expect(projectHeads(alog)).toEqual(naiveProjectHeads(alog));
      const slog = shuffled(randomSectionLog(seed, 15), rand);
      expect(projectSections(slog, LIVE_OBJECTS)).toEqual(naiveProjectSections(slog, LIVE_OBJECTS));
      for (const lid of new Set(alog.map((r) => r.logicalId))) {
        expect(headsByLogicalId(alog).get(lid)).toEqual(headsOf(alog, lid));
      }
    }
  });

  it("empty log projects empty on both paths", () => {
    expect(projectHeads<AnnotationRecord>([])).toEqual([]);
    expect(headsByLogicalId([]).size).toBe(0);
    expect(projectSections([], LIVE_OBJECTS)).toEqual({ sections: [], tombstoned: new Set() });
  });
});

// ---- Perf: the probe's synthetic harness (A3), now on the group-by path ----

describe("group-by projection perf (probe A3 harness: 100 sections × 20 revs, 2000 records)", () => {
  function syntheticSectionLog(): SectionLog {
    const rand = mulberry32(20260718);
    const tick = makeClock();
    let log: SectionLog = [];
    let prev: string | null = null;
    for (let s = 0; s < 100; s++) {
      const order = orderKeyBetween(prev, null);
      prev = order;
      const key = sectionKey(EX, `sec-${s}`);
      log = appendNewSection(log, { key, order, objectId: `o${s % 3}`, title: `Sec ${s}`, lastEditor: alice, modifiedAt: t, now: tick(), rng: rand }).log;
      for (let e = 1; e < 20; e++) {
        log = appendEditSection(log, key, { title: `Sec ${s} rev ${e}`, lastEditor: alice, modifiedAt: t, now: tick(), rng: rand }).log;
      }
    }
    return log;
  }

  it("projectSections at synthetic scale stays comfortably under the 16ms bar (and matches naive)", () => {
    const log = syntheticSectionLog();
    expect(log).toHaveLength(2000);
    // Equivalence at scale, once (the naive path is the slow one — not in the timed loop).
    expect(projectSections(log, LIVE_OBJECTS)).toEqual(naiveProjectSections(log, LIVE_OBJECTS));

    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      projectSections(log, LIVE_OBJECTS);
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    // eslint-disable-next-line no-console
    console.log(`[c16d perf] projectSections group-by, synthetic 100×20 (2000 records): avg ${avg.toFixed(3)}ms, max ${max.toFixed(3)}ms over 50 projections (naive probe baseline: 8-12ms avg / 15.3ms max; bar 16ms)`);
    expect(avg).toBeLessThan(16); // generous CI-safe threshold; measured number logged above
  });
});

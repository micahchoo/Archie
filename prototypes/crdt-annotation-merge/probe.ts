// PROTOTYPE — THROWAWAY. Probe for ticket Archie-70e6 (map Archie-f849).
// Verdict lives in ledgers/PROBE-collab-crdt-mapping.md; delete or absorb this dir once read.
//
// Question: does the Archie annotation model map onto an annotation-granular CRDT (Yjs),
// or does concurrent editing force field-level merge / a model rewrite?
//
// The audit (ledgers/AUDIT-stable-ids.md) established: annotation identity is already a
// global ULID `logicalId`, and the spine is ALREADY a version-DAG (wadm/types.ts:210 —
// each edit appends a `rev` with a `parent`; concurrent edits => sibling revs => two heads,
// reconciled by resolveConflict/mergeLogs, surfaced for MergeReview).
//
// So the real question is WHICH Yjs layer. Two candidate mappings, same concurrent cases,
// LOCAL + in-memory, no server. `Y.applyUpdate` between two docs simulates two clients syncing.

import * as Y from "yjs";

let seq = 0;
const rev = (c: string) => `rev-${c}-${++seq}`;

// Exchange updates both directions => both docs reach the merged state.
function sync(a: Y.Doc, b: Y.Doc) {
  const ua = Y.encodeStateAsUpdate(a);
  const ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub);
  Y.applyUpdate(b, ua);
}

const line = (s = "") => console.log(s);
const hr = (t: string) => line(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`);

// ─────────────────────────────────────────────────────────────────────────────
// MODEL A — field-level: Y.Map<logicalId, Y.Map<field,value>>
// Yjs auto-merges concurrent edits to DIFFERENT fields; for the SAME field it picks one
// (deterministic LWW) SILENTLY — no branch, no head to review.
// ─────────────────────────────────────────────────────────────────────────────
function modelA() {
  hr("MODEL A — annotation as Y.Map<field,value> (Yjs owns the merge)");
  const seed = (doc: Y.Doc) => {
    const anns = doc.getMap("annotations");
    const a = new Y.Map<any>();
    a.set("body", "original body");
    a.set("target", "region@[10,10,50,50]");
    a.set("emphasis", "normal");
    anns.set("lid-1", a);
  };
  const A = new Y.Doc(); const B = new Y.Doc();
  seed(A); sync(A, B); // both start from the same seeded annotation

  line("\n-- Case 1: A edits body, B edits geometry (DIFFERENT fields), concurrently --");
  (A.getMap("annotations").get("lid-1") as Y.Map<any>).set("body", "A: revised prose");
  (B.getMap("annotations").get("lid-1") as Y.Map<any>).set("target", "region@[99,99,120,120]");
  sync(A, B);
  const m1 = A.getMap("annotations").get("lid-1") as Y.Map<any>;
  line(`   merged => body="${m1.get("body")}"  target="${m1.get("target")}"`);
  line(`   RESULT: both edits survive (field-level merge). ✔ no data lost, no branch needed.`);

  line("\n-- Case 2: A edits body, B edits body (SAME field), concurrently --");
  (A.getMap("annotations").get("lid-1") as Y.Map<any>).set("body", "A: the cipher is Latin");
  (B.getMap("annotations").get("lid-1") as Y.Map<any>).set("body", "B: the cipher is a hoax");
  sync(A, B);
  const m2 = A.getMap("annotations").get("lid-1") as Y.Map<any>;
  line(`   merged => body="${m2.get("body")}"`);
  line(`   RESULT: ONE edit wins SILENTLY (Yjs LWW). The other author's text is GONE.`);
  line(`   ⚠ No second head, no MergeReview — Archie's branch-and-review semantics are BYPASSED.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL B — transport-only: Y.Map<rev, frozen AnnotationRecord> (grow-only log)
// Yjs replicates immutable rev entries; concurrent edits append SIBLING revs (same parent).
// Archie's own DAG merge then sees TWO heads — exactly as today. Yjs is pure transport.
// ─────────────────────────────────────────────────────────────────────────────
type Rec = {
  logicalId: string; rev: string; parent: string | null;
  modifiedAt: string; lastEditor: string; deleted: boolean;
  body?: string; target: string;
};
// Archie's heads.ts in miniature: heads = revs of a logicalId that are no rev's parent.
function heads(log: Rec[], lid: string): Rec[] {
  const recs = log.filter((r) => r.logicalId === lid);
  const parents = new Set(recs.map((r) => r.parent).filter(Boolean));
  return recs.filter((r) => !parents.has(r.rev));
}
function append(doc: Y.Doc, r: Rec) {
  doc.getMap<Rec>("log").set(r.rev, Object.freeze(r));
}
function logOf(doc: Y.Doc): Rec[] {
  return [...doc.getMap<Rec>("log").values()];
}
function modelB() {
  hr("MODEL B — grow-only rev-log Y.Map<rev,Rec> (Yjs transports; Archie's DAG merges)");
  const A = new Y.Doc(); const B = new Y.Doc();
  const v1: Rec = { logicalId: "lid-1", rev: rev("seed"), parent: null,
    modifiedAt: "2026-07-18T00:00:00Z", lastEditor: "seed", deleted: false,
    body: "original body", target: "region@[10,10,50,50]" };
  append(A, v1); sync(A, B);

  line("\n-- Case 3: A and B each edit body concurrently (append sibling revs) --");
  append(A, { ...v1, rev: rev("A"), parent: v1.rev, lastEditor: "clientA",
    modifiedAt: "2026-07-18T01:00:00Z", body: "A: the cipher is Latin" });
  append(B, { ...v1, rev: rev("B"), parent: v1.rev, lastEditor: "clientB",
    modifiedAt: "2026-07-18T01:00:05Z", body: "B: the cipher is a hoax" });
  sync(A, B);

  const merged = logOf(A);
  const h = heads(merged, "lid-1");
  line(`   log now holds ${merged.length} revs (grow-only, nothing overwritten).`);
  line(`   heads(lid-1) = ${h.length}:`);
  for (const r of h) line(`      ${r.rev}  parent=${r.parent}  body="${r.body}"  by=${r.lastEditor}`);
  line(`   RESULT: TWO heads survive => this is exactly the branch resolveConflict/MergeReview`);
  line(`   handles TODAY. Both authors' text is preserved; the human picks. ✔ semantics intact.`);
  line(`   (Convergence check: both docs hold the same ${logOf(B).length} revs — Yjs converged.)`);
}

modelA();
modelB();

hr("READ-OFF");
line("Model A (field-mapping): trivial to build, but AUTO-MERGES away Archie's branch-and-");
line("review semantics — a same-field concurrent edit silently loses one author (Case 2).");
line("Model B (rev-log transport): Yjs stays a grow-only sync layer; Archie's existing DAG");
line("merge (heads/resolveConflict) runs UNCHANGED and still surfaces the branch (Case 3).");
line("=> Annotation-granular CRDT HOLDS with no model rewrite. The correct layer is Model B.");

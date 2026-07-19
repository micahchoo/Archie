import { describe, it, expect } from "vitest";
import { dedupeHeadsByLogicalId } from "./note-heads.js";

// Minimal row shape — the projection only reads logicalId + rev (mirrors the AnnotationRecord fields the
// inspector list keys/renders by).
const row = (logicalId: string, rev: string, comment = "") => ({ logicalId, rev, comment });

describe("dedupeHeadsByLogicalId", () => {
  it("passes a linear (non-conflicted) list through unchanged, in order", () => {
    const rows = [row("a", "r1"), row("b", "r1"), row("c", "r1")];
    expect(dedupeHeadsByLogicalId(rows)).toEqual(rows);
  });

  it("edit-vs-edit conflict: collapses the two heads of one note to ONE row (the max-rev head)", () => {
    // The state the review gate exists for: session.notes() returns BOTH live heads of logicalId "b".
    // Duplicate-keyed each = Svelte 5 crash; this must yield a single representative row for "b".
    const loser = row("b", "r2", "meera's edit");
    const winner = row("b", "r5", "amir's edit");
    const rows = [row("a", "r1"), loser, winner, row("c", "r1")];

    const out = dedupeHeadsByLogicalId(rows);

    expect(out.map((r) => r.logicalId)).toEqual(["a", "b", "c"]); // one row per note, no duplicate key
    expect(out.find((r) => r.logicalId === "b")).toBe(winner); // max-rev head is the representative
    expect(out.find((r) => r.logicalId === "b")?.comment).toBe("amir's edit");
  });

  it("picks the max-rev head regardless of encounter order", () => {
    const winner = row("x", "r9");
    // winner appears BEFORE the lower-rev head — max-rev must still win, first-seen order for the id kept.
    expect(dedupeHeadsByLogicalId([winner, row("x", "r3")])).toEqual([winner]);
    expect(dedupeHeadsByLogicalId([row("x", "r3"), winner])).toEqual([winner]);
  });

  it("handles 3+ competing heads (multi-way conflict) → one representative", () => {
    const rows = [row("a", "r1"), row("a", "r7"), row("a", "r4")];
    const out = dedupeHeadsByLogicalId(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.rev).toBe("r7");
  });

  it("is empty-safe", () => {
    expect(dedupeHeadsByLogicalId([])).toEqual([]);
  });
});

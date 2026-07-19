import { describe, it, expect } from "vitest";
import { append, linearHead, appendNew, type DagRecord } from "./log.js";
import { headsOf, mergeLogs, conflictTiebreak } from "./merge.js";
import { asClientId, mintLogicalId, mintRevId } from "../wadm/brand.js";
import type { AnnotationRecord } from "../wadm/types.js";

// Negative type pins for the DagRecord<Id> generalization (Archie-f1c6; probe Archie-b766).
// The pattern (per brand.test.ts): a CONSUMED `@ts-expect-error` is the assertion; if the
// generics regress, the directive goes unconsumed and `tsc --noEmit` fails the build.

const alice = asClientId("alice");
const t0 = "2026-06-01T10:00:00.000Z";
const target = "https://example.org/canvas/1";

// A foreign DAG record family, modeled LOCALLY (structure records live on the probe branch;
// this file must not import them). The branded id makes it nominally distinct from LogicalId.
type ForeignKey = string & { readonly __foreignKey: "dag-generics-test" };
interface ForeignRecord extends DagRecord<ForeignKey> {
  payload: string;
}

function foreignRecord(): ForeignRecord {
  return {
    logicalId: "structure:sections/intro" as ForeignKey,
    rev: mintRevId(),
    parent: null,
    modifiedAt: t0,
    lastEditor: alice,
    deleted: false,
    payload: "not an annotation",
  };
}

function annotationLog() {
  return appendNew([], { target, body: { type: "TextualBody", value: "v1" }, lastEditor: alice, modifiedAt: t0 });
}

describe("pin: NoInfer rejects mixing record families (compile-time — enforced by tsc --noEmit)", () => {
  it("append refuses a foreign record onto an annotation log", () => {
    const { log } = annotationLog();

    // R is inferred from the LOG alone (NoInfer on `record`); a DagRecord<ForeignKey>
    // is not an AnnotationRecord, so this cannot widen R to a union.
    // @ts-expect-error appending a foreign record family to an AnnotationLog is a compile error
    const widened = append(log, foreignRecord());

    void widened;
    expect(log).toHaveLength(1); // append is pure; the typed log is untouched
  });

  it("mergeLogs refuses a foreign incoming log", () => {
    const { log } = annotationLog();

    // @ts-expect-error NoInfer on `incoming`: a ForeignRecord[] cannot ride into an annotation log
    const merged = mergeLogs(log, [foreignRecord()]);

    void merged;
  });

  it("conflictTiebreak refuses comparing across record families", () => {
    const { record } = annotationLog();

    // @ts-expect-error NoInfer on `b`: tiebreaking an annotation head against a foreign record is a type error
    const winner = conflictTiebreak(record, foreignRecord());

    void winner;
  });
});

describe("pin: empty-array-literal calls resolve the concrete AnnotationLog overload, not R = never", () => {
  it("linearHead([], id) is annotation-typed and throws no-such-note at runtime", () => {
    const id = mintLogicalId();
    expect(() => {
      // Positive pin: the concrete overload wins, so the return is AnnotationRecord.
      const head: AnnotationRecord = linearHead([], id);
      void head;
    }).toThrow(/no such note/);
    expect(() => {
      // Consumed because the return is AnnotationRecord, which is not a number. If the
      // generic overload won with R = never, `never` would be assignable to number, the
      // directive would go unconsumed, and tsc would fail — that is the tripwire.
      // @ts-expect-error AnnotationRecord is not assignable to number
      const wrong: number = linearHead([], id);
      void wrong;
    }).toThrow(/no such note/);
  });

  it("headsOf([], id) is annotation-typed and returns [] at runtime", () => {
    const id = mintLogicalId();

    // Positive pin: concrete overload — AnnotationRecord[], not never[].
    const heads: AnnotationRecord[] = headsOf([], id);

    // Consumed because the element type is AnnotationRecord, not number. With R = never the
    // element would be `never` (assignable to anything) and tsc would fail on the unconsumed
    // directive.
    // @ts-expect-error AnnotationRecord element is not assignable to number
    const wrongElement: number = headsOf([], id)[0]!;

    void wrongElement;
    expect(heads).toEqual([]);
  });
});

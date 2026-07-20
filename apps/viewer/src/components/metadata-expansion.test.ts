// Archie-b50f review nit 1: the Details tab's expansion state leaked ACROSS OBJECTS.
//
// The bug: MetadataList keeps per-value expansion in component-local `$state`, keyed by row key +
// value index — but ExhibitView keys Reader on the EXHIBIT id (`activeData.id`), so stepping folios
// with the sidebar carousel reuses ONE Reader, and therefore ONE MetadataList. Expand "Provenance"
// on f1r, step to f18v, and f18v's Provenance rendered pre-expanded showing "Show less" — an
// expansion the reader never asked for. It was invisible on the seed only because every folio shared
// one provenance string; heterogeneous data shows another object's disclosure state.
//
// The fix is structural, not a reset: `{#key object.canvasId}` at the call site in Reader.svelte.
// Svelte tears down and recreates the component when the expression changes, so ALL of its local
// state resets — the leak cannot come back through a newly-added `$state` field the way a hand-rolled
// "clear the map on object change" effect would let it. It mirrors the canvas key three elements up.
//
// HARNESS GAP (a real limit, not a fabricated pass): apps/viewer's vitest runs in the default NODE
// env — no jsdom / happy-dom and no component-mount harness in its dependency tree (see
// apps/viewer/package.json). We cannot mount Reader, click "Show more", step the carousel, and read
// the DOM back. So this guards the contract STRUCTURALLY off the Svelte AST, exactly as
// narrative-escape.test.ts in this directory does for the escape wiring: the local state exists (the
// reason a key is needed) AND its call site is keyed on the object. An interaction-level walk is OWED
// once the viewer gets a DOM test harness.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, type AST } from "svelte/compiler";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const astOf = (rel: string, filename: string) => parse(read(rel), { modern: true, filename });

type Node = Record<string, unknown>;

/** Generic walk carrying the ancestor chain (outermost first) — the key block is an ANCESTOR of the
 *  component instance, so a flat visitor can't express the containment this contract is about. */
function walk(node: unknown, visit: (n: Node, ancestors: Node[]) => void, ancestors: Node[] = []): void {
  if (!node || typeof node !== "object") return;
  const n = node as Node;
  const isNode = typeof n.type === "string";
  if (isNode) visit(n, ancestors);
  const next = isNode ? [...ancestors, n] : ancestors;
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit, next));
    else if (v && typeof v === "object") walk(v, visit, next);
  }
}

/** Source text of an expression node — the readable way to assert WHICH identity a key block uses. */
const srcOf = (source: string, node: Node): string =>
  source.slice(node.start as number, node.end as number).trim();

const READER = "./Reader.svelte";
const LIST = "./MetadataList.svelte";

describe("Details-tab expansion does not survive an object change (Archie-b50f nit 1)", () => {
  it("MetadataList holds per-value expansion in component-local $state — the state that would leak", () => {
    // The premise of the whole contract. If this ever stops being true (expansion lifted to a prop or
    // to a derived), the call-site key below becomes unnecessary — revisit both together, don't just
    // delete the failing assertion.
    const ast = astOf(LIST, "MetadataList.svelte");
    let stateDecls = 0;
    walk((ast as unknown as { instance?: unknown }).instance, (n) => {
      if (n.type === "CallExpression" && (n.callee as Node | undefined)?.name === "$state") stateDecls++;
    });
    expect(stateDecls).toBeGreaterThan(0);
  });

  it("Reader keys the Details MetadataList on the object, so stepping folios remounts it", () => {
    const source = read(READER);
    const ast = parse(source, { modern: true, filename: "Reader.svelte" });
    const keyExpressions: string[] = [];
    walk((ast as unknown as { fragment?: unknown }).fragment, (n, ancestors) => {
      if (n.type !== "Component" || n.name !== "MetadataList") return;
      for (const a of ancestors) {
        if (a.type === "KeyBlock") keyExpressions.push(srcOf(source, a.expression as Node));
      }
    });
    // Exactly one MetadataList instance, inside exactly one key block, keyed on the object's identity.
    // `object.canvasId` is unique per object (ExhibitView passes `canvasIdOf(activeObject.id)`); an
    // exhibit-level or index-level expression here would NOT reset between siblings, which is the bug.
    expect(keyExpressions).toEqual(["object.canvasId"]);
  });

  it("the Details key uses the SAME object identity as the canvas remount key", () => {
    // Two remount keys on one object in one component must not drift onto different identities — a
    // future rename of the object's identity field has to move both or this fails.
    const source = read(READER);
    const ast = parse(source, { modern: true, filename: "Reader.svelte" });
    const keyedBy = new Map<string, string>(); // component name -> key expression
    walk((ast as unknown as { fragment?: unknown }).fragment, (n, ancestors) => {
      if (n.type !== "Component") return;
      const key = ancestors.findLast((a) => a.type === "KeyBlock");
      if (key) keyedBy.set(n.name as string, srcOf(source, key.expression as Node));
    });
    expect(keyedBy.get("MetadataList")).toBe(keyedBy.get("Canvas"));
    expect(keyedBy.get("Canvas")).toBeDefined();
  });
});

// Keep the AST type import meaningful to tsc (parse's modern return type), mirroring narrative-escape.
export type _Ast = AST.Root;

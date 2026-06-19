// S-2 (THERMO-NUCLEAR narrative phase-2): the test that would have caught MF-1 — the index-AV dead-end
// trap. The escape contract (ADR-0016 §137 precision-in/escape-out, §223 anti-trap): a narrative LEADS,
// the object grid stays reachable BEHIND it as an index, and EVERY object opened from that index — image
// OR AV — has a step back to the index. The image branch always had `Reader.onback`; the AV branch did
// NOT (MediaPlayer had no `onback`), stranding a visitor in a single-exhibit narrative that mixes media.
//
// HARNESS GAP (NOTE, not a fabricated pass): the viewer's vitest runs in the default NODE env — no jsdom /
// happy-dom and no @testing-library/svelte in the dependency tree (see apps/viewer/package.json; the only
// other tests, published.test.ts + cite-cards.test.ts, are pure-module tests). So we CANNOT mount these
// components and click through spine → index → object → back. The cheapest MEANINGFUL guard instead asserts
// the escape WIRING structurally off the Svelte AST: (1) MediaPlayer declares an `onback` prop, and (2) the
// ExhibitView index-AV branch passes `onback` to it — symmetric to the image branch's `Reader.onback`.
// A full spine→index→AV-object→back INTERACTION walk is OWED once a DOM test harness is added to the viewer.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, type AST } from "svelte/compiler";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const astOf = (rel: string, filename: string) => parse(read(rel), { modern: true, filename });

// Generic AST walk (the modern parse tree is plain nested objects/arrays).
function walk(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  visit(n);
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
    else if (v && typeof v === "object") walk(v, visit);
  }
}

// The names a component destructures from `$props()` — its public prop surface.
function propsOf(rel: string, filename: string): string[] {
  const ast = astOf(rel, filename);
  let props: string[] = [];
  walk((ast as unknown as { instance?: unknown }).instance, (n) => {
    if (
      n.type === "VariableDeclarator" &&
      (n.init as Record<string, unknown> | undefined)?.type === "CallExpression" &&
      ((n.init as Record<string, unknown>).callee as Record<string, unknown> | undefined)?.name === "$props" &&
      (n.id as Record<string, unknown> | undefined)?.type === "ObjectPattern"
    ) {
      props = ((n.id as { properties: Array<{ key?: { name?: string } }> }).properties)
        .map((p) => p.key?.name)
        .filter((x): x is string => !!x);
    }
  });
  return props;
}

// Each `<MediaPlayer …/>` instance in a component, as the set of static attribute names it's given.
function mediaPlayerInstances(rel: string, filename: string): string[][] {
  const ast = astOf(rel, filename);
  const found: string[][] = [];
  walk((ast as unknown as { fragment?: unknown }).fragment, (n) => {
    if (n.type === "Component" && n.name === "MediaPlayer") {
      const attrs = ((n.attributes as Array<Record<string, unknown>>) ?? [])
        .filter((a) => a.type === "Attribute")
        .map((a) => a.name as string);
      found.push(attrs);
    }
  });
  return found;
}

describe("narrative index escape contract (S-2 / MF-1 — ADR-0016 §137/§223)", () => {
  it("MediaPlayer exposes an optional onback escape prop", () => {
    // The whole MF-1 fix: AV opened from the index needs a way back, like the image Reader's onback.
    expect(propsOf("./MediaPlayer.svelte", "MediaPlayer.svelte")).toContain("onback");
  });

  it("ExhibitView wires onback on the index-AV MediaPlayer (the previously-trapped branch)", () => {
    const instances = mediaPlayerInstances("./ExhibitView.svelte", "ExhibitView.svelte");
    // Exactly one MediaPlayer instance carries onback — the index-AV branch. (The top-level single-AV
    // branch carries no onback by design: it is the leading surface, not a side-trip off the index.)
    const withBack = instances.filter((attrs) => attrs.includes("onback"));
    expect(withBack).toHaveLength(1);
    // That instance is a real AV player (object/annotations), not a stub — guards against a wiring typo.
    expect(withBack[0]).toEqual(expect.arrayContaining(["object", "annotations", "onback"]));
  });

  it("the image-object escape (Reader.onback) is still wired — the path MF-1 mirrors", () => {
    // The index→image→back leg that already worked, asserted alongside so the pair is covered.
    const ast = astOf("./ExhibitView.svelte", "ExhibitView.svelte");
    let imageBackWired = false;
    walk((ast as unknown as { fragment?: unknown }).fragment, (n) => {
      if (n.type === "Component" && n.name === "Reader") {
        const attrs = ((n.attributes as Array<Record<string, unknown>>) ?? [])
          .filter((a) => a.type === "Attribute")
          .map((a) => a.name as string);
        if (attrs.includes("onback")) imageBackWired = true;
      }
    });
    expect(imageBackWired).toBe(true);
  });
});

// Pre-empt unused-import lint on the type-only AST import while keeping it documented.
export type _Unused = AST.Root;

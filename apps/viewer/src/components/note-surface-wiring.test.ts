// The STRUCTURAL half of Archie-dbbc / Archie-01a6 — asserted off the Svelte AST, the same way
// narrative-escape.test.ts asserts the index-escape wiring, and for the same harness reason: the
// viewer's vitest runs in the default NODE env (no jsdom, no @testing-library/svelte), so these
// components cannot be mounted here. The BEHAVIOUR — the sheet showing one copy of the note, the
// canvas nav present in all four sidebar/mode states — is driven in `e2e/note-surface.spec.ts` and
// `e2e/object-nav.spec.ts`, which is where it belongs; jsdom could not hit-test or lay out either.
//
// What this file is FOR is the gap `.claude/rules/svelte-no-typecheck-net.md` documents: svelte-check
// is blind to prop WIRING. A prop can be typed and not bound and nothing static complains, and — the
// case here — a prop can be REMOVED from a component while a host still passes it, or removed from the
// host while the component still declares it. The removal of `step` is exactly that shape.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, type AST } from "svelte/compiler";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const astOf = (rel: string, filename: string) => parse(read(rel), { modern: true, filename });

function walk(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  visit(n);
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
    else if (v && typeof v === "object") walk(v, visit);
  }
}

/** The names a component destructures from `$props()` — its public prop surface. */
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

/** Every `<Name …/>` instance in a component, as the set of attribute names it is given. */
function instancesOf(rel: string, filename: string, component: string): string[][] {
  const ast = astOf(rel, filename);
  const found: string[][] = [];
  walk((ast as unknown as { fragment?: unknown }).fragment, (n) => {
    if (n.type !== "Component") return;
    const raw = (n.name as string | undefined)?.replace(/Lazy\.current$/, "");
    if (raw !== component) return;
    found.push(
      ((n.attributes as Array<Record<string, unknown>>) ?? [])
        .filter((a) => a.type === "Attribute")
        .map((a) => a.name as string),
    );
  });
  return found;
}

const READERS: Array<[string, string]> = [
  ["./Reader.svelte", "Reader.svelte"],
  ["./NarrativeReader.svelte", "NarrativeReader.svelte"],
];

describe("Archie-01a6 — the note card carries no stepper", () => {
  it("NotePopup declares neither `step` nor `onstep`", () => {
    // The control stepped OBJECTS (grid) or SECTIONS (narrative) from inside a note — a different noun
    // than its container — and only while the sidebar was collapsed. Both halves are removed by
    // removing the prop: nothing can pass it back in without failing here.
    const props = propsOf("./NotePopup.svelte", "NotePopup.svelte");
    expect(props).not.toContain("step");
    expect(props).not.toContain("onstep");
    expect(props).toContain("size"); // and the prop that replaced it is really there
  });

  it.each(READERS)("%s passes no stepper to NotePopup", (rel, file) => {
    const instances = instancesOf(rel, file, "NotePopup");
    expect(instances.length).toBeGreaterThan(0); // a matcher that finds nothing must fail, not pass
    for (const attrs of instances) {
      expect(attrs).not.toContain("step");
      expect(attrs).not.toContain("onstep");
    }
  });

  it("the Reader's sidebar footer is the way UP only — its canvas chrome owns stepping", () => {
    // Reader keeps SidebarObjectNav for "Back to Exhibit" and deliberately does NOT hand it the
    // sibling list: two object steppers in one reader is the disagreement V23 measured.
    const instances = instancesOf("./Reader.svelte", "Reader.svelte", "SidebarObjectNav");
    expect(instances).toHaveLength(1);
    expect(instances[0]).toEqual(["onoverview"]);
  });

  it("MediaPlayer OPTS IN — the AV path keeps its stepper", () => {
    // The other half of the same decision, and the one with a stranded user behind it. The argument
    // for making the stepper opt-in rather than deleting it is precisely that MediaPlayer is the
    // sanctioned opter: an AV object has a waveform and a transcript, not an OSD canvas, so 01a6's
    // "put the nav where the thing it navigates lives" has nowhere else to land there. Delete these
    // props and an AV reader in a multi-object exhibit has no way to the next object at all.
    //
    // Asserted here rather than left to the driven suite because MediaPlayer is not this slice's
    // territory: this pins what it is OWED, so a future edit to SidebarObjectNav's prop surface that
    // silently drops the AV path fails in this repo's cheapest gate rather than in a reader's hands.
    const instances = instancesOf("./MediaPlayer.svelte", "MediaPlayer.svelte", "SidebarObjectNav");
    expect(instances).toHaveLength(1);
    // All three stepper props, or `stepper` stays false and the control never renders.
    expect(instances[0]).toEqual(expect.arrayContaining(["siblings", "currentId", "onstep", "onoverview"]));
  });

  it("SidebarObjectNav still ACCEPTS the stepper props MediaPlayer passes", () => {
    // The pair to the above: the opt-in is a handshake, and either side going quiet breaks it. A prop
    // passed to a component that no longer declares it is exactly the wiring class svelte-check is
    // blind to (.claude/rules/svelte-no-typecheck-net.md).
    const props = propsOf("./SidebarObjectNav.svelte", "SidebarObjectNav.svelte");
    expect(props).toEqual(expect.arrayContaining(["siblings", "currentId", "onstep", "onoverview"]));
  });
});

describe("Archie-dbbc — the sheet is the same note, not a text snapshot", () => {
  it("ReadingSheet renders NotePopup at sheet size", () => {
    const instances = instancesOf("./ReadingSheet.svelte", "ReadingSheet.svelte", "NotePopup");
    expect(instances).toHaveLength(1);
    expect(instances[0]).toContain("size");
    // Everything the card shows reaches the sheet. Before this, the sheet took only `text`, so a note's
    // media, tags and geo readout silently disappeared the moment a reader asked to see MORE of it.
    expect(instances[0]).toEqual(
      expect.arrayContaining(["eyebrow", "text", "media", "tags", "geoCoord"]),
    );
  });

  it("ReadingSheet no longer takes the free-floating `label` the callers never passed (V64)", () => {
    const props = propsOf("./ReadingSheet.svelte", "ReadingSheet.svelte");
    expect(props).not.toContain("label");
    expect(props).toContain("eyebrow");
  });

  it.each(READERS)("%s hands the sheet the same fields it hands the card", (rel, file) => {
    // The identity guard, structurally: whatever the card is given, the sheet is given. If a future
    // field lands on the card alone, the sheet stops being "the same note at a larger size" and V64
    // starts growing back. (The e2e spec asserts the rendered strings are equal; this catches the
    // wiring before it ever renders.)
    const card = instancesOf(rel, file, "NotePopup");
    const sheet = instancesOf(rel, file, "ReadingSheet");
    expect(card).toHaveLength(1);
    expect(sheet).toHaveLength(1);
    const CONTENT = ["eyebrow", "text", "media", "tags", "geoCoord"];
    for (const field of CONTENT) {
      expect(card[0], `card is missing ${field}`).toContain(field);
      expect(sheet[0], `sheet is missing ${field}`).toContain(field);
    }
  });
});

// Pre-empt unused-import lint on the type-only AST import while keeping it documented.
export type _Unused = AST.Root;

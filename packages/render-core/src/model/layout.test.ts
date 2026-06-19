import { describe, it, expect } from "vitest";
import { resolveLayout } from "./layout.js";
import type { Exhibit } from "./model.js";

// Layout resolution (CONTEXT §Layout v1 = Single + Grid + Narrative; ADR-0016 "narrative as an
// emergent reading mode"). The leading surface is a PURE FUNCTION OF CONTENT: the type is always
// DERIVED (sections → narrative, multiple objects → grid, one object → single) and any author-stored
// `exhibit.layout` is IGNORED (the field is deprecated, kept only for legacy read-tolerance).

const obj = (id: string) => ({ id, source: `${id}.jpg`, label: id });
const ex = (over: Partial<Exhibit>): Exhibit => ({ id: "e", slug: "e", title: "E", objects: [obj("a")], ...over });

describe("resolveLayout", () => {
  it("ignores a stored layout — the type is derived from content (deprecated field, ADR-0016)", () => {
    // A stored `layout` no longer wins: a multi-object exhibit derives 'grid' even when it
    // carries an explicit `layout: "single"` (proves the short-circuit is gone).
    expect(resolveLayout(ex({ layout: "single", objects: [obj("a"), obj("b")] })).type).toBe("grid");
    // ...and sections still win as 'narrative' regardless of a stored `layout: "grid"`.
    expect(resolveLayout(ex({ layout: "grid", sections: [{ id: "s", title: "S", objectId: "a" }] })).type).toBe(
      "narrative",
    );
  });
  it("coerces a legacy stored layout:'narrative' with ZERO sections by content (migration contract, ADR-0016)", () => {
    // A pre-ADR-0016 file may carry `layout: "narrative"` yet no sections — the derivation must
    // fall back to content: one object → 'single', two → 'grid'. The stored field never leaks through.
    expect(resolveLayout(ex({ layout: "narrative" })).type).toBe("single");
    expect(resolveLayout(ex({ layout: "narrative", objects: [obj("a"), obj("b")] })).type).toBe("grid");
  });
  it("infers narrative when there are sections", () => {
    expect(resolveLayout(ex({ sections: [{ id: "s", title: "S", objectId: "a" }] })).type).toBe("narrative");
  });
  it("infers grid for multiple objects, single for one", () => {
    expect(resolveLayout(ex({ objects: [obj("a"), obj("b")] })).type).toBe("grid");
    expect(resolveLayout(ex({})).type).toBe("single");
  });
  it("returns the objects and (for narrative) the sections in the descriptor", () => {
    const d = resolveLayout(ex({ sections: [{ id: "s", title: "S", objectId: "a" }] }));
    expect(d.objects).toHaveLength(1);
    expect(d.sections).toHaveLength(1);
    expect(resolveLayout(ex({})).sections).toBeUndefined();
  });
});

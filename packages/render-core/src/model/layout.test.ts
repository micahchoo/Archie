import { describe, it, expect } from "vitest";
import { resolveLayout } from "./layout.js";
import type { Exhibit } from "./model.js";

// Layout resolution (CONTEXT §Layout v1 = Single + Grid + Narrative). The author's explicit
// choice wins ("layout = reading-intent declaration"); otherwise infer a sensible default.

const obj = (id: string) => ({ id, source: `${id}.jpg`, label: id });
const ex = (over: Partial<Exhibit>): Exhibit => ({ id: "e", slug: "e", title: "E", objects: [obj("a")], ...over });

describe("resolveLayout", () => {
  it("honors the author's explicit layout choice", () => {
    expect(resolveLayout(ex({ layout: "grid" })).type).toBe("grid");
    expect(resolveLayout(ex({ layout: "single", objects: [obj("a"), obj("b")] })).type).toBe("single");
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

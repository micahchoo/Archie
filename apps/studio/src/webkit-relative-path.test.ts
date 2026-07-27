// Archie-ce7a. These tests pin the MECHANISM, because the engine that actually broke
// (JavaScriptCore/WebKitGTK) is not the engine the tests run in.
//
// jsdom and Chromium both define `webkitRelativePath` the permissive way, so no test running here
// can reproduce the desktop TypeError directly. What CAN be reproduced is the shape that caused it:
// a getter-only accessor on the prototype. Assigning through it throws in strict mode; defining an
// own property over it does not. If `withRelativePath` ever regresses to an assignment, the first
// test below goes red — in THIS runtime — which is the whole point.

import { describe, it, expect } from "vitest";
import { withRelativePath } from "./webkit-relative-path.js";

/** A File-like whose prototype exposes `webkitRelativePath` as a getter with NO setter — the
 *  JavaScriptCore shape. Cast to File at the boundary: the helper only touches this one property. */
function fileWithLockedAccessor(name: string): File {
  class LockedFile extends File {
    override get webkitRelativePath(): string {
      return "";
    }
  }
  return new LockedFile([new Uint8Array([1, 2, 3])], name) as File;
}

describe("withRelativePath", () => {
  it("stamps the path THROUGH a getter-only prototype accessor (the WebKitGTK shape)", () => {
    const f = fileWithLockedAccessor("page-2.jpg");

    // First, prove the fixture really is the hostile shape: the old technique throws on it.
    expect(() => Object.assign(f, { webkitRelativePath: "Voynich/page-2.jpg" })).toThrow(TypeError);

    // The helper must not.
    expect(() => withRelativePath(f, "Voynich/page-2.jpg")).not.toThrow();
    expect(f.webkitRelativePath).toBe("Voynich/page-2.jpg");
  });

  it("works on an ordinary File too (the browser shape)", () => {
    const f = withRelativePath(new File([new Uint8Array([1])], "a.png"), "Root/a.png");
    expect(f.webkitRelativePath).toBe("Root/a.png");
  });

  it("returns the SAME instance — the ingest carries identity through", () => {
    const f = new File([new Uint8Array([1])], "a.png");
    expect(withRelativePath(f, "Root/a.png")).toBe(f);
  });

  it("is re-stampable, so a second pass (the flatten choice) can overwrite it", () => {
    const f = new File([new Uint8Array([1])], "a.png");
    withRelativePath(f, "Root/sub/a.png");
    withRelativePath(f, "Root/a.png");
    expect(f.webkitRelativePath).toBe("Root/a.png");
  });

  it("the stamped property is enumerable, so it survives a spread-based copy", () => {
    const f = withRelativePath(new File([new Uint8Array([1])], "a.png"), "Root/a.png");
    expect(Object.keys(f)).toContain("webkitRelativePath");
  });
});

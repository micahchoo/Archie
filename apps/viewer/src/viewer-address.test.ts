import { describe, expect, it } from "vitest";
import { parseRoute } from "@render/core";
import { viewerAddress } from "./viewer-address.js";

describe("Viewer addresses", () => {
  it("keeps the selected library through every citation rung", () => {
    const src = "https://archive.example/library?edition=2&lang=en";
    const address = viewerAddress(() => src);
    for (const target of ["#/", "#/folio", "#/folio/o/o1", "#/folio/s/s1", "#/folio/a/n1?xywh=1,2,3,4&t=2,8"]) {
      expect(parseRoute(address(target))).toEqual({ ...parseRoute(target), src });
    }
  });
  it("reads the current source and respects explicit foreign citations", () => {
    let src: string | undefined;
    const address = viewerAddress(() => src);
    expect(address("#/folio")).toBe("#/folio");
    src = "https://a.example";
    expect(parseRoute(address("#/folio"))).toHaveProperty("src", src);
    expect(parseRoute(address("#/folio?src=https%3A%2F%2Fb.example"))).toHaveProperty("src", "https://b.example");
    expect(address("https://external.example/#/folio")).toBe("https://external.example/#/folio");
  });
});

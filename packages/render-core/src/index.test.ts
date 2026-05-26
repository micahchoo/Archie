import { describe, it, expect } from "vitest";
import { RENDER_CORE } from "./index.js";

describe("@render/core scaffold", () => {
  it("exposes the package identity (boundary smoke test)", () => {
    expect(RENDER_CORE).toBe("@render/core");
  });
});

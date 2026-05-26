import { describe, it, expect } from "vitest";
import { RENDER_SVELTE } from "./index.js";

describe("@render/svelte scaffold", () => {
  it("exposes the package identity (boundary smoke test)", () => {
    expect(RENDER_SVELTE).toBe("@render/svelte");
  });
});

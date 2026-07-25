import { defineConfig } from "vitest/config";

// The viewer's unit tests are pure modules under src/ and the seed fixtures under fixtures/.
//
// The `include` is the load-bearing part, not the environment. Vitest's DEFAULT pattern is
// `**/*.{test,spec}.*`, which sweeps up `e2e/*.spec.ts` — Playwright specs, whose `test.describe`
// is a different `test` entirely — and every one of them fails at collection. That turns a green
// unit suite red for a reason unrelated to any unit. Studio avoids this the same way
// (apps/studio/vitest.config.ts); the viewer had no config at all, so adding an e2e directory
// silently broke `pnpm test` until this file existed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "fixtures/**/*.test.ts"],
  },
});

import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The viewer's unit tests are pure modules under src/ and the seed fixtures under fixtures/.
//
// The svelte plugin is here for the rune modules (note-surface.svelte.ts, reading-session.svelte.ts)
// — the Svelte compiler must transform `$state`/`$derived` in `.svelte.ts` files or they reach the
// test runtime as plain identifier calls. Same setup as studio's vitest.config.ts (its
// library-meta.svelte.ts is tested the same way). The AST-wiring tests read .svelte files as text,
// so no component mounting is involved.
//
// The `include` is the load-bearing part, not the environment. Vitest's DEFAULT pattern is
// `**/*.{test,spec}.*`, which sweeps up `e2e/*.spec.ts` — Playwright specs, whose `test.describe`
// is a different `test` entirely — and every one of them fails at collection. That turns a green
// unit suite red for a reason unrelated to any unit. Studio avoids this the same way
// (apps/studio/vitest.config.ts); the viewer had no config at all, so adding an e2e directory
// silently broke `pnpm test` until this file existed.
export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "fixtures/**/*.test.ts"],
  },
});

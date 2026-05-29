import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Studio's unit tests: the pure library-meta reducers (plain data) AND the rune store wrapper
// (library-meta.svelte.ts) — the svelte plugin compiles `$state` in `.svelte.ts` so the persist /
// touchBinding seam is guarded headlessly. Node env (no DOM needed for these). The Svelte SHELL
// (App.svelte) still needs manual smoke — build-green ≠ run-green; studio seeds separately.
export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

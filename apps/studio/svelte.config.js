import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Svelte config — present so `svelte-check` (the studio type gate, ISSUES.md Issue 12) can discover
// the Svelte/TS setup and check `<script lang="ts">` in .svelte files. `vitePreprocess` matches what
// vite-plugin-svelte already applies at dev/build time (TS via esbuild), so this changes no runtime
// behaviour — it only gives the standalone checker the same context Vite has.
export default {
  preprocess: vitePreprocess(),
};

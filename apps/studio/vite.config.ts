import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Studio = Svelte SPA (ADR-0002 / Q-2). Single-page; publish step emits the static Viewer.
export default defineConfig({
  plugins: [svelte()],
});

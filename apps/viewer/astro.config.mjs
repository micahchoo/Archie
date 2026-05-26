import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

// Viewer = Astro + Svelte islands (ADR-0002 / Q-2). Static output -> GitHub Pages.
export default defineConfig({
  output: "static",
  integrations: [svelte()],
});

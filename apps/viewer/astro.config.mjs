import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

// Viewer = Astro + Svelte islands (ADR-0002 / Q-2). Static output -> GitHub Pages.
// SITE_BASE env var overrides base for deploy contexts (e.g. "/Archie/viewer/").
const base = process.env.SITE_BASE ?? "/";

export default defineConfig({
  output: "static",
  base,
  integrations: [svelte()],
  vite: {
    optimizeDeps: { include: ["fflate"] },
  },
});

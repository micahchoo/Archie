import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

// Viewer = Astro + Svelte islands (ADR-0002 / Q-2). Static output -> GitHub Pages.
// SITE_BASE env var overrides base for deploy contexts (e.g. "/Archie/viewer/").
const base = process.env.SITE_BASE ?? "/";

export default defineConfig({
  output: "static",
  base,
  integrations: [svelte()],
  // SINGLE-ORIGIN DEV (Q-3): in dev this server sits BEHIND the front-door proxy
  // (scripts/dev-proxy.mjs on :5173) which routes /studio → Vite :5174 and everything else here.
  // Do NOT try to make this server front via vite.server.proxy: Astro routes HTML NAVIGATIONS
  // through its own router BEFORE vite's proxy middleware, so browser visits to a proxied path
  // 404 while curl appears to work. strictPort: a silent port bump would 502 the front door;
  // fail loudly instead.
  server: { port: 4321 },
  vite: {
    server: { strictPort: true },
    // The Svelte islands import fflate (zip.ts) / isomorphic-dompurify + snarkdown
    // (sanitize.ts) by bare name through the linked @render/* workspace packages.
    // These are declared as direct viewer deps (so pnpm symlinks them into the app
    // root and Vite can resolve the bare specifiers) and pre-bundled here under their
    // bare names — so the optimized chunk is "fflate.js", matching the bare import.
    optimizeDeps: {
      include: ["fflate", "isomorphic-dompurify", "snarkdown"],
    },
  },
});

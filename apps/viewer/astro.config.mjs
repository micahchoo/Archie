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
    // minisearch is imported directly by src/lib/search-index.ts; pre-bundling it
    // at startup avoids a mid-session re-optimization (which 504s already-open tabs).
    // The canvas trio (openseadragon + @annotorious/*, reached only through the lazy
    // ExhibitView import via @render/mount) must be pre-bundled for the same reason,
    // plus a worse one: unlike plain Vite (studio), Astro has no index.html crawl, so
    // a dep absent from this list is optimized only on the FIRST exhibit visit of a
    // server run — and any sibling instance booting against the shared
    // node_modules/.vite/deps then rewrites the cache WITHOUT the trio, wedging the
    // running server into serving transforms whose ?v= hash it 504s (surfaces in
    // Firefox as NS_ERROR_CORRUPTED_CONTENT on the three dep URLs, dead canvas).
    optimizeDeps: {
      include: [
        "fflate",
        "isomorphic-dompurify",
        "snarkdown",
        "minisearch",
        "openseadragon",
        "@annotorious/openseadragon",
        "@annotorious/plugin-tools",
      ],
    },
  },
});

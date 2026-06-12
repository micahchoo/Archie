import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

// Viewer = Astro + Svelte islands (ADR-0002 / Q-2). Static output -> GitHub Pages.
// SITE_BASE env var overrides base for deploy contexts (e.g. "/Archie/viewer/").
const base = process.env.SITE_BASE ?? "/";

export default defineConfig({
  output: "static",
  base,
  integrations: [svelte()],
  // SINGLE-ORIGIN DEV (Q-3): the Viewer is the FRONT DOOR (scripts/dev.sh runs it on :5173) and
  // proxies /studio → the Studio's Vite on :5174. Direction matters: plain Vite namespaces every
  // dev URL under its base (/studio/...), so one prefix rule captures all Studio traffic — Astro
  // requests its internals at root-relative paths (/@vite, /@id, /src), which can't be prefix-
  // proxied the other way. strictPort: a silent port bump would split the shared-OPFS origin or
  // 502 the proxy; fail loudly instead.
  server: { port: 4321 },
  vite: {
    server: {
      strictPort: true,
      proxy: {
        "/studio": { target: "http://localhost:5174", ws: true },
      },
    },
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

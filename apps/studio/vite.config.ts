import { defineConfig, type PluginOption } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Studio = Svelte SPA (ADR-0002 / Q-2). Single-page; publish step emits the static Viewer.
//
// SINGLE-ORIGIN DEV (Q-3 archie-persistence): dev mirrors the GH-Pages path layout — /studio/ and
// /viewer/ on ONE origin — so the Viewer's live source reads the Studio's OPFS working store in dev
// exactly as it does deployed. The VIEWER (Astro, scripts/dev.sh → :5173) is the front door and
// proxies /studio → here (:5174): plain Vite namespaces ALL its dev URLs under `base`, so the
// /studio prefix captures everything — whereas Astro requests its internals at root-relative paths
// (/@vite, /@id, /src), which a prefix proxy can't catch. That asymmetry decides who fronts.
// The prod build is untouched (build-gh-pages.sh passes --base on the CLI, which overrides this).

/** Send a bare-root visit (direct :5174 hit) to the app. */
const rootRedirect: PluginOption = {
  name: "archie:root-redirect",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/" || req.url === "/index.html") {
        res.statusCode = 302;
        res.setHeader("Location", "/studio/");
        res.end();
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  base: "/studio/",
  plugins: [svelte(), rootRedirect],
  server: {
    // strictPort: the single-origin contract is LOAD-BEARING (shared OPFS). A silent port bump
    // would 502 the front door's /studio proxy. Fail loudly; kill the stale server and rerun `pnpm dev`.
    port: 5174,
    strictPort: true,
  },
});

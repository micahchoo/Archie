import { defineConfig, transformWithEsbuild, type PluginOption } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFileSync } from "node:fs";
import { TOKENS_MODULE_ID, TOKENS_CSS_PATH } from "../../packages/archie-viewer/tokens-source.mjs";

// Studio = Svelte SPA (ADR-0002 / Q-2). Single-page; publish step emits the static Viewer.
//
// SINGLE-ORIGIN DEV (Q-3 archie-persistence): dev mirrors the GH-Pages path layout — /studio/ and
// /viewer/ on ONE origin — so the Viewer's live source reads the Studio's OPFS working store in dev
// exactly as it does deployed. The front door is the STANDALONE proxy (scripts/dev-proxy.mjs on
// :5173) routing /studio → here (:5174); plain Vite namespaces ALL its dev URLs under `base`, so
// the prefix captures everything. Neither dev server can front the other (see dev-proxy.mjs).
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

// THIRD implementation of the embed's `virtual:archie-tokens` resolver, beside packages/archie-viewer's
// build.mjs (esbuild) and vitest.config.ts (vitest). Studio became a consumer of that package when
// ViewerPreview.svelte started lazy-importing it for the publish preview: Vite resolves the workspace
// link to the package SOURCE, reaches `tokens.ts`, and 500s on the unresolvable virtual id — the dynamic
// import then rejects with "Failed to fetch dynamically imported module" and the preview shows an error
// instead of a reader. Nothing static catches that; only driving it does.
//
// All three read `tokens-source.mjs` for the id and the path, which is exactly why that module exists —
// so the specifier cannot drift between the shipped bundle, the tests, and now this dev server. The
// id must stay VIRTUAL (never a `.css` specifier): a css id enters Vite's css pipeline, which replaces
// the loaded text with `export default ""` — the measurement recorded in tokens-source.mjs's header.
const archieTokens: PluginOption = {
  name: "archie:embed-tokens",
  enforce: "pre",
  resolveId: (id) => (id === TOKENS_MODULE_ID ? `\0${TOKENS_MODULE_ID}` : null),
  async load(id) {
    if (id !== `\0${TOKENS_MODULE_ID}`) return null;
    const { code } = await transformWithEsbuild(readFileSync(TOKENS_CSS_PATH, "utf8"), TOKENS_CSS_PATH, { loader: "css", minify: true });
    return `export default ${JSON.stringify(code)};`;
  },
};

export default defineConfig({
  base: "/studio/",
  plugins: [archieTokens, svelte(), rootRedirect],
  build: {
    // Not served, and not read by the app: the manifest exists so `scripts/bundle-size.mjs` can walk
    // the entry's STATIC closure (`imports`, never `dynamicImports`) and ratchet page-load weight
    // apart from total dist weight. Same distinction packages/archie-viewer/build.mjs draws off
    // esbuild's metafile (`kind === "import-statement"`); Vite spells it as two sibling arrays.
    // Dropping this degrades the ratchet to totals-only, which is blind in BOTH directions — see
    // .claude/rules/archie-viewer-eager-closure.md for the measured case.
    manifest: true,
  },
  server: {
    // strictPort: the single-origin contract is LOAD-BEARING (shared OPFS). A silent port bump
    // would 502 the front door's /studio proxy. Fail loudly; kill the stale server and rerun `pnpm dev`.
    port: 5174,
    strictPort: true,
  },
});

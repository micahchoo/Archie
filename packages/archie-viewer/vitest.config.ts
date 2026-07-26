import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { defineConfig, type Plugin } from "vitest/config";
import { TOKENS_MODULE_ID, TOKENS_CSS_PATH } from "./tokens-source.mjs";

// happy-dom so the custom element (customElements / HTMLElement / Shadow DOM / DataTransfer) and the
// render-mount import (OSD touches `document` at module load) resolve in node. We do NOT construct a
// real OSD viewer headlessly — the reader mount is tested at the seam (the load-seam + the lazy-import
// boundary), mirroring read-mount.test.ts's fake-viewer idiom. No live render here.

/**
 * Resolve `virtual:archie-tokens` to the shell's token file, minified — the shadow-root token seam
 * (src/tokens.ts). This MIRRORS build.mjs's `archieTokens` plugin: same file, same esbuild minify, so
 * the string under test is byte-identical to the string that ships. Keeping the two in step is the
 * point; a token layer that is right in the bundle and empty in tests is a suite that proves nothing.
 */
function archieTokens(): Plugin {
  const RESOLVED = `\0${TOKENS_MODULE_ID}`;
  return {
    name: "archie-viewer:tokens",
    enforce: "pre",
    resolveId(id) {
      return id === TOKENS_MODULE_ID ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      const { code } = transformSync(readFileSync(TOKENS_CSS_PATH, "utf8"), { loader: "css", minify: true });
      return `export default ${JSON.stringify(code)};`;
    },
  };
}

export default defineConfig({
  plugins: [archieTokens()],
  test: {
    environment: "happy-dom",
  },
});

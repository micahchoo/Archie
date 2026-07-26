// ONE declaration of what the embed's shared token layer IS, imported by both build inputs
// (build.mjs and vitest.config.ts) so the path cannot drift between the shipped bundle and the tests.
//
// A VIRTUAL module id rather than a plain `import "…/tokens.css"`. Two routes were measured and both
// failed the same way — the token string was correct in the esbuild bundle and EMPTY under vitest:
//   • a bare `.css` id is a CSS REQUEST, so Vite's own css transform replaces whatever a `load` hook
//     produced with `export default ""`;
//   • `?raw` did not save it either (the loader ran and returned 3865 chars; something downstream in
//     the css pipeline still won).
// A virtual id is in no pipeline's filter, so there is nothing to lose a race with. That divergence
// class — a permissive test runtime hiding what the shipped runtime does, or here the reverse — is
// the one .claude/rules/bound-fetch-defaults.md was written about; a token layer that is right in the
// bundle and empty in tests means the suite proves nothing about it.
import { fileURLToPath } from "node:url";

/** The specifier `src/tokens.ts` imports. Declared for TypeScript in `src/css-text.d.ts`. */
export const TOKENS_MODULE_ID = "virtual:archie-tokens";

/**
 * The CANONICAL token file — the very bytes the shell's Astro pages pull in as
 * `@render/core/tokens.css`. Not a copy, not a generated mirror: if this path stops resolving the
 * build fails loudly rather than shipping a stale design system (the failure V9/V31/V69 measured).
 *
 * It lives in render-core because render-core is layer ZERO — below the shell and below this package
 * both — so neither consumer depends on the other for its design vocabulary. A relative path rather
 * than the `@render/core/tokens.css` specifier because these two build inputs run as plain node
 * scripts, outside any bundler's resolver.
 */
export const TOKENS_CSS_PATH = fileURLToPath(new URL("../render-core/src/tokens.css", import.meta.url));

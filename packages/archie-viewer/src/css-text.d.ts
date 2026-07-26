// `virtual:archie-tokens` is the shared token layer as TEXT — `packages/render-core/src/tokens.css`,
// minified, for injection into the shadow root (a `<link>` cannot reach in there).
//
// A VIRTUAL id rather than a plain css import, and that is load-bearing: a `.css` id is a CSS REQUEST
// no matter what a plugin loads for it, so Vite's css pipeline replaces the loaded content with
// `export default ""` — correct string in the shipped esbuild bundle, EMPTY under vitest. See
// .claude/rules/vitest-css-id-empty-string.md for the measurement.
//
// Two build inputs implement it and must stay in step, both reading `tokens-source.mjs` for the path and id:
//   • build.mjs        — the `archieTokens` esbuild plugin (onResolve → namespace, onLoad minifies)
//   • vitest.config.ts — the `archieTokens` Vite plugin, same esbuild minify, `enforce: "pre"`
//
// THIRD CONSUMER (2026-07-26): apps/studio now depends on this package (ViewerPreview.svelte lazy-
// imports it for the publish preview), so svelte-check resolves into this SOURCE and reaches the
// import above. A `.d.ts` inside a dependency is not in Studio's `include`, so it carries its own
// copy at `apps/studio/src/archie-viewer-virtual.d.ts`. Rename the id and BOTH declarations change.
//
// Declared rather than inferred because TS7 reports TS2307/TS2882 on an undeclared module import (see
// .claude/rules/two-typescript-compilers.md) — the same reason apps/studio carries css-modules.d.ts,
// with the opposite shape: studio wants the side effect, the embed wants the bytes.
declare module "virtual:archie-tokens" {
  const text: string;
  export default text;
}

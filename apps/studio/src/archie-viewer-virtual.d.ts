// `virtual:archie-tokens` — re-declared HERE because Studio is now a consumer of
// `@render/archie-viewer` (ViewerPreview.svelte lazy-imports it to render the publish preview).
//
// The canonical declaration lives in `packages/archie-viewer/src/css-text.d.ts`, whose header used to
// say "there is no third consumer — the package is source-consumed by esbuild and vitest only." That
// stopped being true when Studio took the dependency, and the failure it predicted is exactly what
// happened: svelte-check resolves `@render/archie-viewer` into that package's SOURCE, reaches
// `tokens.ts`'s `import "virtual:archie-tokens"`, and reports TS2307 — because a `.d.ts` inside the
// dependency is not in Studio's `include` (`["src"]`, tsconfig.json:3) and so is never loaded.
//
// Two shapes were rejected before this one:
//   • Widening Studio's `include` to reach into a sibling package — that pulls the whole dependency's
//     source into Studio's program, which is worse than one duplicated declaration.
//   • Typing the dynamic import as `any` to stop TS traversing — that would hide REAL breakage at the
//     one boundary where a silent break is most costly (see .claude/rules/svelte-no-typecheck-net.md).
//
// So: a deliberate, documented duplicate. If the virtual id is ever renamed, BOTH files change —
// `packages/archie-viewer/tokens-source.mjs` holds the single runtime declaration of the id, and a
// mismatch here surfaces immediately as TS2307 in this gate rather than silently.
declare module "virtual:archie-tokens" {
  const text: string;
  export default text;
}

// Ambient declaration for the side-effect CSS imports at the top of main.ts. Vite resolves
// `import "./markers.css"` at build time — the module has no runtime value and ships no types, so the
// compiler has to be told it exists. The `*.css` pattern also covers the SHARED token layer's
// package-subpath specifier, `@render/core/tokens.css` (Archie-ecf4), which is why unifying studio
// onto that file needed no change here.
//
// Why this file appeared: TypeScript 5 accepted a bare side-effect import of an undeclared module
// silently. TypeScript 7 reports TS2882 ("Cannot find module or type declarations for side-effect
// import") — the five CSS imports in main.ts were the ENTIRE migration cost of this repo's move to
// the native compiler (every other package was already clean).
//
// Deliberately narrower than `/// <reference types="vite/client" />`, which would also fix it: that
// pulls vite's whole ambient surface (import.meta.env, the ?url/?raw/?worker query-suffix modules,
// asset module types) into a project that uses none of it. This states only the missing fact.
declare module "*.css";

// `?raw` imports (Vite): the text of a file as a string. Used by the self-contained export to inline
// the IIFE viewer bundle (publish-flows `exportSelfContained`). TS7 reports TS2882/TS2307 on an
// undeclared module specifier where TS5 was silent — see .claude/rules/two-typescript-compilers.md.
declare module "*?raw" {
  const content: string;
  export default content;
}

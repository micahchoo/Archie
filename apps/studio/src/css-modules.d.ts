// Ambient declaration for the side-effect CSS imports at the top of main.ts. Vite resolves
// `import "./tokens.css"` at build time — the module has no runtime value and ships no types, so the
// compiler has to be told it exists.
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

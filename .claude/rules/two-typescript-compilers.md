---
scope: "**/package.json"
tags: [typescript, toolchain, typecheck, ci]
priority: high
source: hand-written
---

# This repo has TWO TypeScript compilers — never call bare `tsc`

Since 2026-07-24 the workspace installs both:

| dep | version | used by |
|---|---|---|
| `typescript` | 5.9.3 | `svelte-check`, `astro check`, `svelte2tsx`, the editor/language server |
| `typescript-native` (`npm:typescript@^7.0.2`) | 7.0.2 | every package's `typecheck` script |

**Why both.** TypeScript 7 is the Go-native compiler and is ~8× faster (full sweep 8.02s → 0.96s,
measured across all six packages). But it ships **only the `tsc` binary** — no `main`, no
`lib/typescript.js`, and `require("typescript")` throws. Every tool that drives the compiler through
its JS API therefore cannot use it: `@astrojs/check` peers `^5.0.0 || ^6.0.0` and `svelte2tsx` caps at
`^6.0.0`, both explicitly excluding 7. Replacing `typescript` wholesale would break the `.svelte` and
`.astro` gates that `[[svelte-no-typecheck-net]]` establishes as the only real net for island code.

## How to apply

- **A `typecheck` script calls the native compiler by explicit path**, never bare `tsc`:
  `node ../../node_modules/typescript-native/bin/tsc --noEmit` (uniform — every workspace package sits
  at depth 2). A new package copies that exact form.
- **Never write bare `tsc` in a script.** Both packages claim the `tsc` bin name, so
  `node_modules/.bin/tsc` resolves to whichever pnpm's conflict resolution happened to link — measured
  as 7.0.2, but that is arbitrary and can flip on reinstall. Bare `tsc` is a coin toss, not a version
  choice. (It is currently used nowhere; keep it that way.)
- **Don't "simplify" this by deleting `typescript`.** The 5.x entry is not legacy — it is what
  `pnpm --filter @archie/studio run check` and `pnpm --filter @archie/viewer run check:svelte` load.
- Ambient module declarations are now load-bearing: TS7 reports **TS2882** on a side-effect import of
  an undeclared module, where TS5 was silent. `apps/studio/src/css-modules.d.ts` (`declare module
  "*.css";`) exists solely for this — the five CSS imports in `main.ts` were the entire migration cost.
  A new side-effect import of a non-TS asset needs the same treatment.
- The strictness split in `[[studio-ts-typecheck-gate]]` is unchanged: `svelte-check` still relaxes
  `exactOptionalPropertyTypes`, so `pnpm typecheck` (now TS7) remains the gate for `.ts` files.

## What unblocks the full migration (checked 2026-07-24)

The blocker is upstream and singular: **TypeScript 7.0 ships no public compiler API.** Microsoft has
said **7.1 will introduce a new (different) one**; until it lands, nothing that drives the compiler
programmatically — Svelte, Vue, Astro, Angular, MDX template tooling — can run on 7.x. The concrete
failure for us is that svelte-check reads `require("typescript").default.sys`, a CJS shape tsgo does
not expose, so it crashes at startup rather than degrading. Tracking issue:
`sveltejs/language-tools#2733`.

The hybrid above is not a workaround we invented — it is the migration path Microsoft recommends (run
the old `tsc` for API consumers, `tsgo` for fast checking), and they ship a side-by-side
`@typescript/typescript6` package for the same purpose.

**Revisit when:** TS 7.1 ships its API *and* `svelte-check` + `@astrojs/check` declare a `^7`
peer. At that point drop `typescript-native`, move `typescript` to `^7`, and point the `typecheck`
scripts back at plain `tsc`. Do not attempt it before both conditions hold — `svelte-check`'s peer
range is a permissive `>=5.0.0`, so it will *install* happily against TS7 and then crash, which is a
worse failure than a refused install. Community tsgo-based replacements (`svelte-check-native`,
`svelte-check-rs`) exist but are third-party reimplementations of a CI gate this repo's rules treat as
load-bearing; prefer waiting for upstream.

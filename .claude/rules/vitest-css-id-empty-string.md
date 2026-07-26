---
scope:
  - "packages/**/vitest.config.ts"
  - "packages/**/build.mjs"
tags: [build, vitest, css, testing]
priority: high
source: hand-written
---

# A `.css` id is a CSS REQUEST no matter what your plugin loads for it

**Measured 2026-07-25 (Archie-c314).** `packages/archie-viewer` needs its shared design tokens as a
**string** — the embed injects them into a shadow root, where a `<link>` cannot reach. A plugin that
loads `tokens.css` and returns `export default "<css text>"` works perfectly under esbuild and is
**silently replaced by `export default ""` under vitest**.

The measurement, so it is not mistaken for a config typo: the Vite plugin's `load` hook fired with the
right id, read the file, minified it, and returned **3865 characters**. The importing module then saw
`""`. Vite's css pipeline matches on the id's extension and overwrites what `load` produced. Adding
`?raw` did not save it either — that was tried, and the string was still empty.

## Why this failure is worse than a build break

The bundle was **correct**. `dist/archie-viewer.js` contained the full token block; the shipped embed
was styled exactly as intended. Only the test runtime saw an empty string. So:

- every unit test that touched the token layer passed, because `"".replace(…)` is `""` and assertions
  written against "some tokens are present" were never written — nobody writes them until something
  breaks;
- a suite existed for the seam and **proved nothing about it**;
- the direction is the reverse of the usual trap (`.claude/rules/bound-fetch-defaults.md`: Node more
  permissive than the browser), which is precisely why it does not pattern-match. Here the SHIPPING
  runtime was right and the TEST runtime was wrong, so no amount of driving the real thing would have
  surfaced it. Only asserting the string's content in a test does.

Same shape as [[svelte-no-typecheck-net]]: the gate answered a real question correctly, and it was not
the question that mattered.

## The fix: a virtual module id

Use an id that is in **no** pipeline's filter, so there is no race to lose:

```ts
// src/tokens.ts
import tokensCss from "virtual:archie-tokens";
```

Both build inputs resolve it themselves, from ONE declaration of the path
(`packages/archie-viewer/tokens-source.mjs` exports `TOKENS_MODULE_ID` + `TOKENS_CSS_PATH`, imported
by `build.mjs` and `vitest.config.ts`):

- **vitest** — a `Plugin` with `enforce: "pre"`, `resolveId` → `"\0virtual:archie-tokens"`, `load` →
  `export default <JSON string>`.
- **esbuild** — `onResolve` on the id → a private `namespace`, `onLoad` in that namespace.

TypeScript needs `declare module "virtual:archie-tokens"` (see `src/css-text.d.ts`); TS7 reports
TS2307/TS2882 without it — `.claude/rules/two-typescript-compilers.md`.

## How to apply

- **Never import a `.css` path for its TEXT.** If you want bytes, use a virtual id. If you want a
  stylesheet side-effect, a plain `.css` import is correct and none of this applies.
- **Both build inputs must produce the SAME string**, including any minification. Ours run the same
  `esbuild.transform(css, { loader: "css", minify: true })` on both sides; if only one minified, the
  test would assert against a string that never ships.
- **Assert the string's CONTENT in a test**, not merely that the import resolves. `tokens.test.ts`
  reads the canonical file itself and compares parsed token VALUES — an empty string fails it
  immediately, and so does a drifted copy. Comparing raw against minified will false-alarm (a css
  minifier rewrites `rgba(26, 60, 35, 0.30)` → `rgba(26, 60, 35, .3)`); minify the expectation too, so
  a value difference is the only thing that can fail.
- **And measure the artifact anyway**: `grep -c -- "--ink-canvas-primary" dist/archie-viewer.js`. A
  green suite and a correct bundle are independent claims here — that is the whole lesson.

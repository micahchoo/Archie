# Thermo-Nuclear Review — render-svelte

## Verdict

**APPROVE-WITH-NITS** — package is structurally sound and earns its boundary; one misplaced module (`sanitize.ts`) and two reactive-guard inconsistencies are the only actionable findings.

---

## Baseline

| File | LOC | Role |
|---|---|---|
| `Canvas.svelte` | 178 | Svelte 5 reactive shell over `MountSurface` |
| `MarginColumn.svelte` | 138 | Layout solver shell over `layoutMarginalia` |
| `controller.ts` | 64 | Plain-TS selection-inversion logic |
| `sanitize.ts` | 35 | `renderMarkdown` / `sanitizeHtml` / `stripMarkdown` |
| `index.ts` | 12 | Re-export barrel |
| Tests | 168 | Controller + sanitize |

**Total source (non-test): ~427 LOC** — well under the 600 watch threshold. No file is near 1000. The `<500 LOC budget` the package.json declares is already broken (Canvas alone is 178, all source is 427), but that budget was written for the logic modules only, and the comment in index.ts is clear about that intent. Not a finding.

**Architecture type: DEEP wrapper, correctly.** Canvas converts an async imperative lifecycle (`createMount → MountSurface`) into a declarative prop-reactive component with explicit ordering guarantees (the Svelte 5 dep-tracking workaround comments are accurate and necessary). MarginColumn converts a pure layout computation (`layoutMarginalia`) into a measured-DOM reactive layout with rAF throttling and viewport-change integration. Neither component is a pass-through. Deletion test: remove Canvas → callers must absorb `onMount`, `onDestroy`, 8 `$effect` ordering invariants, rAF lifecycle, and error state. Remove MarginColumn → callers absorb DOM measurement, height tracking, `$derived.by` re-solve, leader geometry, and the degrade fallback. Both survive the deletion test.

---

## The Domino

**`sanitize.ts` (and its two dependencies, `isomorphic-dompurify` + `snarkdown`) belongs in `@render/core`, not here.** Sanitization is framework-agnostic text processing — it has zero Svelte dependency and zero mount dependency. Its only consumers are HTML-rendering call sites (`{@html renderMarkdown(...)}` in viewer/studio) which import it via `@render/svelte` purely by accident of placement. Relocating `sanitize.ts` to `render-core` eliminates two dependencies from this package, reduces the package boundary to pure reactivity, and makes the "logic lives in core/mount, bindings live in svelte" invariant actually true. The `renderBody` injection in `render-core/src/publish/static-pages.ts` already comments "same snarkdown+DOMPurify pipeline" — the canonical home is clearly core. This is the one move that deletes a category: render-svelte would then be 100% Svelte-lifecycle + reactivity, nothing else.

---

## Findings (prioritized)

**[STRUCTURAL] sanitize.ts is misplaced** — `src/sanitize.ts:1–35` — Standard #6 (logic leaking into wrong layer) + Standard #3 (moving pieces in wrong home)

`sanitize.ts` has no Svelte import, no `$state`/`$effect`, no `MountSurface` dependency. It wraps two third-party libraries (`isomorphic-dompurify`, `snarkdown`) and produces pure string transforms. Its callers (viewer's `NoteLightbox`, `Reader`, `NarrativeReader`; studio's `App.svelte` and `publish-flows.svelte.ts`) import it from `@render/svelte` only because that is where it currently lives — not because it is Svelte-specific. `render-core/src/publish/static-pages.ts` already describes the same pipeline as an injected `renderBody` callback, and comments explicitly say Studio passes "the same snarkdown+DOMPurify pipeline the live Viewer uses". Moving `sanitize.ts` to `@render/core` would: (1) let `static-pages.ts` import the canonical implementation instead of documenting a divergence risk; (2) remove `isomorphic-dompurify` and `snarkdown` from render-svelte's dependencies entirely; (3) enforce the invariant that render-svelte is pure Svelte glue. This is a relocation, not a rewrite — zero behavior change.

**[MODERATE] `emitRect()` called unconditionally inside `$effect` without `surface` guard** — `src/Canvas.svelte:121,128` — Standard #5 (silent fallbacks) / Standard #2 (inconsistent guard pattern)

The `$effect` on line 121 (`annotations`) and line 128 (`selected`) call `emitRect()` unconditionally at the end of the effect body. `emitRect` internally guards `if (surface && onmarkerrect)`, so behavior is correct. But the pattern is inconsistent: the `emitRects` call on line 122 has an explicit `if (surface)` prefix before its call site, and the `emitRect` calls on lines 109/121/128 do not. This is a readability hazard: a reader diffing the effects wonders if the absent guard on `emitRect` calls is intentional or a bug. It is intentional (emitRect guards internally), but the inconsistency makes that non-obvious. Remedy: either guard all call sites explicitly, or add a one-line comment on line 68 noting that `emitRect` is self-guarding — pick one pattern and hold it.

**[LOW] `MarginColumn` is exported in `package.json` exports but not re-exported from `index.ts`** — `package.json:exports` / `src/index.ts` — Standard #5 (boundary cleanliness)

`package.json` declares `"./MarginColumn.svelte": "./src/MarginColumn.svelte"` as an export path. `Canvas.svelte` is similarly declared as `"./Canvas.svelte"`. Neither is re-exported through `index.ts` (correct for `.svelte` files since tsc can't resolve them). However, `MarginColumn` has zero import consumers found across apps (only a comment reference in `App.svelte:915`). It is either still being integrated or unused. If it is unused across all apps, it is dead surface area in the public API. Verify: once active, flag it. If genuinely planned but not yet wired, add a `// TODO:` comment to index.ts noting it is exported but no app consumer yet exists.

**[LOW] `$derived.by` layout re-solve reads `rects` and `heights` via `void` dep-tracking side-channel** — `src/MarginColumn.svelte:43–44` — Standard #4 (prefer direct code over magic)

```svelte
void rects; // dep: re-solve on each marker frame
void heights;
```

This is a Svelte 5 workaround for reactive dependency registration when the actual values are read indirectly (via `items.map` / `heights[id]`). The comment explains it, which is good. But `void heights` is potentially redundant: `heights[id]` is read inside `items.map(...)` on line 52, which should register the reactive dependency directly via the `$state<Record<string, number>>` accessor. The `void rects` side-channel is necessary because `rects` is only accessed inside the conditional `const r = rects[id]` — but if items is empty, that branch never runs. Verify that `void heights` is actually needed; if not, remove it to eliminate one spooky-action dependency. This is a nit, not a bug.

---

## Code-Judo Opportunities

**Judo 1 — Move sanitize.ts to render-core.** (The domino, detailed above.) One move, two deps removed, one invariant enforced, zero behavior change.

**Judo 2 — `emitRect` / `emitRects` duplication in `Canvas.svelte`.** Lines 68–80 define two nearly parallel functions — same shape, different call sites, different throttling. They cannot be merged (one is immediate, one is rAF-gated), but the inconsistency in whether call sites guard `surface` externally vs. internally is a micro-judo: pick one convention and delete the inconsistency.

---

## Self-Check

**Seam discriminator — is the mount/svelte package split justified?**

The split passes the seam test because the two layers vary independently in at least two dimensions:

1. **Consumer shape varies**: `@render/mount` is consumed by tests, by `render-svelte`, and potentially by any future non-Svelte adapter. It has no Svelte peer-dependency.
2. **Testability varies**: `controller.ts` (render-svelte) is testable as plain TS with a mock `MountSurface` precisely because the mount/svelte boundary exists. Without it, the async OSD initialization would contaminate all selection-logic tests.
3. **Lifecycle ownership varies**: mount owns the OSD/Annotorious lifecycle; svelte owns the Svelte component lifecycle (`onMount`, `onDestroy`, `$effect`). These are genuinely different concerns.

**Verdict: the split is justified and correctly drawn.** The one correction: `sanitize.ts` should be in `render-core`, not render-svelte — it belongs below the Svelte boundary entirely.

**Self-check on proposals**: the sanitize relocation is not premature extraction (the module exists, the canonical home is evidenced by `static-pages.ts`'s existing comment), not DRY-as-rule (the `renderBody` injection in core is already a seam for this exact function), and not complecting (moving it reduces coupling rather than adding it). The `void heights` investigation is a question, not a proposal — it requires verification before acting.

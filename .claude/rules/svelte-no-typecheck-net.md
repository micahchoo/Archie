---
scope: "apps/**/*.svelte"
tags: [toolchain, hazard]
priority: high
source: hand-written
---

# `.svelte` type errors: svelte-check is the gate — necessary, not sufficient

svelte-check is the only gate in this repo that reads `.svelte` script/template code; `tsc`/`vite
build` can't parse `.svelte` at all (an undefined identifier there is a runtime ReferenceError, not a
compile error — proven by the 2026-07-06 `orderedIds()` bite in App.svelte). `astro check` doesn't
cover it either: a planted `const probe: number = notADefinedThing;` in a viewer `.svelte` island
passed `astro check` at 0 errors / 0 warnings / 0 hints (the identical statement in a `.astro` page
was caught immediately) — `astro check` diagnoses `.astro` files only, not the islands that hold
nearly all of the viewer's UI.

Run after every `.svelte` edit:
- studio: `pnpm --filter @archie/studio run check`
- viewer: `pnpm --filter @archie/viewer run check:svelte` (`svelte-check --workspace . --fail-on-warnings`)

Both baselines are **0 errors / 0 warnings**; a new warning is a regression, not noise. The viewer's
warnings, before it hit zero, were mostly intentional initial-capture sites (props named `initial*`,
once-per-open builds, prev-value trackers). When silencing `state_referenced_locally` for one of
those, never paste a bare `// svelte-ignore` — the comment must say why initial-capture is the
contract at that specific site.

## Necessary, not sufficient: svelte-check is blind to prop WIRING

`oncancel` was added to a component's `$props()` TYPE annotation but omitted from the destructuring
pattern beside it. `{#if oncancel}` then referenced a name that didn't exist, so the Cancel button
silently never rendered — svelte-check: 1464 files, 0 errors, 0 warnings (Archie-4635, 2026-07-25).
**A prop can be typed and not bound, and nothing static complains.**

After wiring a new prop through a component boundary, drive the running app and assert the control
renders and the handler fires — a green gate alone doesn't prove it. When a control "should be there"
and isn't, suspect the destructuring pattern before suspecting reactivity: dump the rendered DOM and
look for an `{#if}` that emitted a bare `<!---->` while the parent's value was truthy.

## The general form: a gate proves the code COMPILED, never that the output CARRIES anything

Four defects shipped with every gate reporting green:

| what was green | what was actually shipping |
| --- | --- |
| svelte-check 1464 files, 0/0 | `oncancel` typed, not destructured — the Cancel button never rendered |
| `astro build` exit 0 | `getStaticPaths` read the fs at runtime → **empty** object lists in every static page |
| `static-pages.test.ts` passing | `exhibitPageHtml` emits sections when handed them; the published tree had **zero** — nobody regenerated it |
| render-mount unit suite 159 pass | every embed annotation region was **unclickable** — OSD's injected overlay wrapper ate the click |

Each gate answered a real question correctly, and none of them was the question that mattered.

- **After a fix, measure the ARTIFACT, not the exit code.** `grep -c` the built HTML for the string
  the fix adds; count the elements the list should contain; diff the shipped bundle. "The test passes"
  and "the output contains it" are different claims — only the second is the deliverable.
- **A generated/committed artifact does not update itself.** If a fix changes a generator, the
  checked-in output is stale until someone regenerates it — and every unit test still passes.
- **Prefer a gate that drives the real thing.** `recipes/smoke.mjs` and `apps/viewer/e2e` exist
  because hit-testing, prop wiring, and build-time output are all invisible to jsdom and to `tsc`.
  See [[osd-overlay-wrapper]] for the sharpest case: keyboard Enter and a synthetic `click()` both
  succeed against code where a real mouse click does nothing.

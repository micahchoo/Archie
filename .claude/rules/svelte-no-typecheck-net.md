---
scope: "apps/**/*.svelte"
tags: [toolchain, hazard]
priority: high
source: hand-written
---

# No safety net for `.svelte` script errors — verify identifiers after edits

This repo has **no svelte-check** (see ISSUES.md Issue 12): `tsc --noEmit` skips `.svelte`
files entirely, and `vite build` compiles without type-checking — an undefined identifier in a
`.svelte` script block passes every gate and becomes a **runtime ReferenceError**.

Proven bite (2026-07-06, Issue 11 Phase 2): a rename left `orderedIds()` called-but-undefined
in `App.svelte`'s `bulkRemove`; implementer + independent code review + green tests/tsc/build
all missed it — only IDE language-server diagnostics surfaced it, pre-commit.

**How to apply:** after editing a `.svelte` file — especially renames/refactors of script-block
helpers — grep the file for every identifier you renamed (definition AND all call sites), and
treat IDE svelte/ts diagnostics on changed lines as blocking, not noise. Cross-component prop
renames need the same manual check on both sides (`$$ComponentProps` mismatches don't fail any
build).

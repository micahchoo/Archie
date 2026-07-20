---
scope:
  - packages/render-core/**
  - packages/archie-viewer/**
tags: [browser-compat, seam, testing]
priority: high
source: hand-written
---

# A defaulted/stored `fetch` must be bound — Node tests are structurally blind to the failure

**The bug class (shipped 2026-07-20, caught only by `recipes/smoke.mjs`):** browsers implement
`fetch` as a WebIDL `Window` operation with a **receiver brand check** — calling it with any `this`
other than the global (e.g. after storing it on a config object and method-calling
`this.cfg.fetchImpl(…)`) throws `TypeError: Failed to execute 'fetch' on 'Window': Illegal
invocation`. **Node's fetch performs no such check**, so every vitest suite passes against code
whose built bundle cannot load a single library in a real browser (0 gallery cards, error surfaced
only as a downgraded "transient" warning). Same epistemic shape as the `$effect`-invisible-to-vitest
hazard: the runtime that tests use is more permissive than the runtime that ships.

The concrete chain that failed: `openLibraryFromSrc`'s default `fetchImpl = fetch` (bare) →
`httpJsonSource` → `new HttpFilesystem(base, { fetch: fetchImpl })` → stored on `cfg` →
`this.cfg.fetchImpl(url)` → Illegal invocation. A bare *variable* call (`fetchImpl(url)`, receiver
`undefined`) is fine in modern browsers — the trap is specifically **object-stored, method-called**,
and any injectable-fetch seam is one refactor away from it.

**How to apply:**

- Any `fetch` **default** (`?? fetch`, `= fetch` in a default param) must be
  `globalThis.fetch.bind(globalThis)`. The four canonical sites:
  `packages/render-core/src/fs/http.ts` (ctor default), `packages/render-core/src/publish/open.ts`
  (`fetchArchieLibraryBytes`), `packages/archie-viewer/src/load.ts` (`openLibraryFromSrc`,
  `openLibraryFromTree`). A new injectable-fetch seam follows the same form. (This rule is scoped to
  the two packages that own injectable-fetch seams; the apps call the global directly today — it
  applies the moment an app grows such a seam.)
- **Test the default path, not just the injected path.** Every pre-existing test injected an arrow-fn
  stub — receiver-insensitive, so even the injection tests couldn't have caught this. The pattern
  that can: a **brand-checking stub** installed as `globalThis.fetch` (regular `function` that throws
  `Illegal invocation` unless `this` is `undefined`/`globalThis`), then exercise the seam *without*
  injecting. Donors: `http.test.ts` / `load.test.ts` `installBrandCheckedFetch` — proven red-green
  against the unbound code. (The stub is deliberately duplicated per package — no shared test-util
  package exists; a tightening must be made in both copies.) Caveat: `open.ts`'s seam is
  bind-by-convention only — its call site is a bare variable call (receiver `undefined`, which
  browsers permit), so a brand-check test stays green even unbound; it goes red only if a refactor
  object-stores it, which is exactly when the bind matters.
- CI's `embed-smoke` job (checks.yml) is the end-to-end enforcement: it builds the bundle from
  current source and drives it in real Chromium. Don't remove it because "the unit suites cover it" —
  they can't.

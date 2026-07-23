---
scope: ["apps/viewer/astro.config.mjs", "apps/viewer/package.json"]
tags: [toolchain, hazard, dev-server]
priority: high
source: hand-written
---

# Viewer dev deps: bare-name imports MUST be direct deps AND in optimizeDeps.include

This bug class has bitten three times — fflate/dompurify/snarkdown (a8e3963+93aab39,
2026-06-11), minisearch (f90afb3, 2026-07-19), and the canvas trio openseadragon +
@annotorious/openseadragon + @annotorious/plugin-tools (2026-07-20). Same shape every time:
a dep imported by bare name from linked `@render/*` workspace source (or reached only through
ViewerShell's lazy `import("./ExhibitView.svelte")`) is missing from the viewer's
`optimizeDeps.include`, and the dev viewer breaks with 504 "Outdated Optimize Dep" (empty
body, no MIME → Firefox shows NS_ERROR_CORRUPTED_CONTENT) on `/.vite/deps/<dep>.js?v=<hash>`.

**Why the viewer is special:** Astro's dev server has no index.html entry crawl, so ONLY the
include list is pre-bundled at boot — everything else is discovered mid-session on first use,
which bumps the browserHash under open tabs. Studio (plain Vite) crawls its entry at startup
and needs no include list; don't copy its absence of one.

**The wedge (worst case, measured 2026-07-20):** a sibling viewer instance booting against the
shared `apps/viewer/node_modules/.vite/deps` (spare-port drive, `pnpm gen`, e2e) rewrites the
cache without the not-included deps. The long-running server keeps serving cached transforms
stamped with the now-dead hash while its own optimizer 504s that hash — every FRESH visitor
gets a dead exhibit canvas (`[astro-island] Error hydrating ExhibitView`), and only an astro
restart heals it. Deps that are in `include` exist in every boot's optimize set, so sibling
rewrites stay harmless.

**How to apply:**
- A new dep imported by bare name anywhere in the viewer island graph (including through
  `@render/*` source and behind lazy imports) gets BOTH: an entry in `optimizeDeps.include`
  in `astro.config.mjs` AND a direct-dependency entry in `apps/viewer/package.json` (pnpm
  doesn't hoist — without the direct dep the bare include silently fails to resolve and the
  optimizer skips it).
- Bare names only in include. Never the parent-anchored `"@render/core > fflate"` form — it
  names the chunk `@render_core___fflate.js`, which does not satisfy a bare import (drops on
  re-optimization).
- Verify: restart dev, then check `apps/viewer/node_modules/.vite/deps/_metadata.json` lists
  the dep at boot; drive `/viewer/voynich` → open a folio → zero non-200 on
  `**/.vite/deps/**` and `.openseadragon-canvas` present.

---
scope:
  - apps/viewer/e2e/**
  - recipes/**
tags: [testing, e2e, concurrency, worktrees]
priority: high
source: hand-written
---

# Concurrent e2e runs share port 4326 and SILENTLY drive the wrong worktree

`apps/viewer/e2e/playwright.config.ts` sets `reuseExistingServer: !process.env.CI` on port **4326**.
Correct for one developer on one checkout; unsafe the moment two worktrees run the suite at once —
the normal condition when a fleet works disjoint territory. If anything is already bound to 4326,
Playwright **skips its own `pnpm build`** and drives whatever is there. Your specs then run against
**another worktree's code**, and nothing says so.

Both directions bite, and the quiet one is worse:

| direction | what you see |
| --- | --- |
| your specs vs a sibling's older build | "element not found" against code that demonstrably contains the element — looks exactly like a regression in your own work |
| your specs vs a sibling's *newer* build | **everything passes** — a false green for a gate you never actually ran |

Measured 2026-07-26: six new specs failed this way against a sibling's `astro preview`. The
false-green half is the dangerous one — nothing prompts anyone to investigate a pass, and it is
especially corrosive to red-green proof: an injection that "fails" against someone else's build
proves nothing, and neither does the green either side of it.

## How to apply

- **Every concurrent run passes a distinct port** (the config already reads it, no edit needed):
  `cd apps/viewer && VIEWER_E2E_PORT=4341 pnpm exec playwright test --config e2e/playwright.config.ts`
- **Your OWN leftover server is the same trap, and a distinct port does not save you from yourself.**
  Measured 2026-07-26: a reviewer's stale server on its own private port — left from an earlier
  **injected** build — reported the injected assertion *passing*, one step from reporting "this gate
  does not work" about a working gate. Kill the server between runs, or confirm the log shows a
  fresh build (`vite-node gen-published` + `astro build`) before trusting a result.
- **Confirm you drove your own build**: `ss -ltnp | grep <your-port>`, then check the PID's cwd is
  YOUR worktree. A run whose port ownership you cannot establish is **unverified**, not passed —
  re-run it.
- **Dispatching a fleet: assign ports up front.** Two agents independently choosing "something
  unique" can still collide.

## The same shape elsewhere

`recipes/smoke.mjs` binds an ephemeral port (`listen(0, …)`, safe), but `recipes/try.html` loads the
**repo-root** `/dist/archie-viewer.js` — run `node scripts/sync-dist.mjs` after every rebuild or the
drive silently exercises the previous bundle. `apps/studio/e2e` (port 5198, `STUDIO_E2E_PORT`) has
the identical shape. The general form is in [[svelte-no-typecheck-net]]: a gate answers the question
it was asked, and *"did this run against my code?"* is a question the gate never asks itself.

The structural fix — derive the default port from the worktree path, or `reuseExistingServer: false`
— is ticketed as **Archie-c622** (deferred 2026-07-26 only because a fleet was mid-run against the
existing config).

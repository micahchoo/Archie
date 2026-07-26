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
That is correct for one developer on one checkout. It is actively unsafe the moment two worktrees run
the suite at once — which is the normal condition when a fleet of agents works disjoint territory.

If anything is already bound to 4326, Playwright **skips its own `pnpm build`** and drives whatever
is there. Your specs then run against **another worktree's code**, and nothing says so.

## Both directions bite, and the quiet one is worse

| direction | what you see |
| --- | --- |
| your specs vs a sibling's older build | "element not found" against code that demonstrably contains the element — looks exactly like a regression in your own work |
| your specs vs a sibling's *newer* build | **everything passes** — a false green, and you report a gate you never actually ran |

Measured 2026-07-26: an agent's six new specs failed this way against a sibling worktree's
`astro preview`. The false-green half is the dangerous one because nothing prompts you to investigate
a pass. It is especially corrosive to red-green proof — an injected bug that "fails" because you were
driving someone else's build proves nothing, and neither does the green either side of it.

## How to apply

- **Your OWN leftover server is the same trap, and no coordination catches it.** Measured 2026-07-26:
  a reviewer left an `astro preview` running on its *own* private port from an earlier **injected**
  build. Its next run reused that stale server and reported the injected assertion **passing** — it
  was about to report "this gate does not work" when the gate was fine. A distinct port protects you
  from siblings; it does nothing about yourself. **Kill the server between runs**, or confirm the
  log shows a fresh build (`vite-node gen-published` + `astro build`) before trusting a result. The
  false green is especially vicious here because a *red* check that comes back green reads as a
  finding rather than a mistake.
- **Every concurrent run passes a distinct `VIEWER_E2E_PORT`.** The config already reads it; no edit
  is needed:
  ```
  cd apps/viewer && VIEWER_E2E_PORT=4341 pnpm exec playwright test --config e2e/playwright.config.ts
  ```
- **Confirm you drove your own build before trusting a result** — this is the tell that caught it:
  ```
  ss -ltnp | grep <your-port>     # then check the PID's cwd is YOUR worktree
  ```
- When dispatching a fleet, **assign ports up front** rather than letting agents pick — two agents
  independently choosing "something unique" can still collide.
- A run whose port ownership you cannot establish is **unverified**, not passed. Re-run it.

## The same shape elsewhere

`recipes/smoke.mjs` boots its own server and is the gate `[[archie-viewer-eager-closure]]` and the
ADR-0019 capability contract both lean on. Check its port and reuse policy before trusting it under
concurrency. Smoke already has one independent way to report on code that isn't yours — `recipes/
try.html` loads the **root** `/dist/archie-viewer.js`, so `node scripts/sync-dist.mjs` must run after
every rebuild or it drives the previous bundle. Two independent staleness traps on the same gate.

The general form is the one `[[svelte-no-typecheck-net]]` already states: a gate answers the question
it was asked, and "did this run against my code?" is a question the gate never asks itself.

## The real fix, deliberately deferred

Deriving the port from the worktree path, or setting `reuseExistingServer: false` outright, would
remove the footgun. Not done on 2026-07-26 because three agents were mid-run against the existing
config and changing it under them would have invalidated exactly the results it was meant to protect.
Revisit when no fleet is in flight.

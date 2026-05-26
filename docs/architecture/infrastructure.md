# Infrastructure — Archie

**Zoom Level 3** | **Confidence: HIGH** | **Source: codebase-analytics.sh (2026-05-25), package.json manifests, HANDOFF.md**

## Repository

- **Shape:** Monorepo (pnpm workspace)
- **VCS:** Git (no commits yet — pre-initial-commit, 278 untracked files)
- **Package manager:** pnpm 10.32.1 (`~/.npm-global/bin/pnpm`; corepack shim broken on this host)
- **Node:** Bun detected (context-mode runtime); Node for toolchain

## Language Breakdown

| Language | LOC | Files | Complexity |
|----------|-----|-------|------------|
| TypeScript | 5,650 | 86 | 515 |
| JSON | 13,559 | 82 | 0 |
| Markdown | 3,588 | 51 | 0 |
| Svelte | 1,478 | 10 | 117 |
| SVG | 118 | 6 | 0 |
| CSS | 134 | 4 | 0 |
| JavaScript | 165 | 4 | 23 |
| Astro | 113 | 3 | 0 |

**Primary language:** TypeScript (5,650 LOC across 86 files). **UI:** Svelte (1,478 LOC across 10 `.svelte` files). **Config/data:** JSON (13.5K LOC, largely generated/fixture data).

## Package Structure

```
Archie/
├── packages/
│   ├── render-core/     # @render/core — pure TS logic (the keystone)
│   ├── render-mount/    # @render/mount — OSD + Annotorious wiring
│   └── render-svelte/   # @render/svelte — Svelte adapter (<500 LOC)
├── apps/
│   ├── studio/          # @archie/studio — Svelte SPA (Vite, :5173)
│   └── viewer/          # @archie/viewer — Astro + Svelte islands (:4321)
├── docs/
│   ├── adr/             # 4 Architecture Decision Records
│   ├── decisions/       # Q-1..Q-7 decision log
│   ├── plans/           # Phase plans (PHASE-0,1,2)
│   └── spikes/          # Spike-0001 delamination
└── Prior Art/           # 20-axis survey of existing tools
```

## Test Infrastructure

- **Framework:** Vitest 2.1
- **Test count:** 245 (core: 209, mount: 18, svelte: 18)
- **Test topology:** Tests co-located with source (`*.test.ts` adjacent to implementation)
- **DOM environment:** happy-dom (OSD touches `document` at import time)
- **QA infrastructure:** No linters/formatters configured yet (pre-initial-commit)
- **CI:** Not yet configured

## Build & Dev

| Command | Scope |
|---------|-------|
| `pnpm -r test` | Workspace-wide test run |
| `pnpm -r typecheck` | Workspace-wide TypeScript checking |
| `pnpm -r build` | Workspace-wide production build |
| `pnpm --filter @archie/studio dev` | Studio dev server (Vite, :5173) |
| `pnpm --filter @archie/viewer dev` | Viewer dev server (Astro, :4321; runs gen predev) |

## Runtime Environment

- **Studio:** Browser SPA (Svelte 5, Vite). Uses OPFS for working storage, FSA for folder-autosave (Chromium).
- **Viewer:** Static site (Astro + Svelte islands). Reads published JSON over HTTP `fetch`. No runtime server.
- **Publish:** `publishLibrary` → zip (in-browser, fflate) → GitHub Contents API (git tree/blob upload).
- **Node scripts:** `vite-node` runs the TS core for build-time tasks (gen-published.mts, import fixtures).

## Index Fossils

- **No `var`** — all `const`/`let` (modern stratum throughout)
- **No `require()`** — all ES module `import`/`export`
- **No callback-era patterns** — async/await throughout
- **TypeScript strict mode** — inferred from 5.6 toolchain
- **Svelte 5 runes** — `$state`, `$effect`, `$derived` (not Svelte 4 stores)
- **Zero tech-debt markers** (no TODO/FIXME/HACK in source — pre-initial-commit, intentional)

## Archetype Signals

- **Monorepo:** yes (pnpm workspace, `apps/` + `packages/`)
- **Config files:** 4 (pnpm-workspace, tsconfig.base, vitest configs)
- **Extension dirs:** none (no plugin system)
- **Test ratio:** not yet measurable (tests exist but git-untracked)

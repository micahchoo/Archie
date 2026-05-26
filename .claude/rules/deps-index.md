---
name: deps-index
description: Project-local dependency lookup — maps imports to indexed packages so the model can call `get_docs(pkg@ref, topic)` instead of guessing from training data. Auto-generated; do not edit by hand.
---

# Dependency index

When you need API or usage info for one of these libraries, query
`mcp__context__get_docs(<pkg@ref>, <topic>)` rather than reasoning from training
data. If `freshness` is `very-stale` and the answer is load-bearing, call
`mcp__context__upgrade(<pkg@ref>)` first.

| Package | Ref | Indexed | Freshness | Source |
|---------|-----|---------|-----------|--------|
| `typescript` | `main` | 2026-05-25 | fresh | https://github.com/microsoft/TypeScript |
| `vitest` | `main` | 2026-05-25 | fresh | https://github.com/vitest-dev/vitest |
| `@sveltejs/vite-plugin-svelte` | `main` | 2026-05-25 | fresh | https://github.com/sveltejs/vite-plugin-svelte |
| `svelte` | `main` | 2026-05-25 | fresh | https://github.com/sveltejs/svelte |
| `vite` | `main` | 2026-05-25 | fresh | https://github.com/vitejs/vite |
| `@astrojs/svelte` | `main` | 2026-05-25 | fresh | https://github.com/withastro/astro |
| `astro` | `main` | 2026-05-25 | fresh | https://github.com/withastro/astro |
| `@annotorious/openseadragon` | `main` | 2026-05-25 | fresh | https://github.com/recogito/annotorious |
| `@annotorious/plugin-tools` | `main` | 2026-05-25 | fresh | https://github.com/annotorious/annotorious-plugin-tools |
| `openseadragon` | `master` | 2026-05-25 | fresh | https://github.com/openseadragon/openseadragon |
| `dompurify` | `main` | 2026-05-25 | fresh | https://github.com/cure53/DOMPurify |
| `vite-node` | `main` | 2026-05-25 | fresh | https://github.com/antfu-collective/vite-node |
| `wavesurfer.js` | `main` | 2026-05-26 | fresh | https://github.com/katspaugh/wavesurfer.js |

## Indexing failures

| Package | Status | Error |
|---------|--------|-------|
| `happy-dom` | failed | context add failed |

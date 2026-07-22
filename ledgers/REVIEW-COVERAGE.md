# REVIEW-COVERAGE — adversarial review ledger

## Cycle 0 — Bootstrap baseline 2026-07-21

Commit examined: `8a577f0` (main). This is the first-run bootstrap (§9).

### Gate baseline

| Gate | Result | Detail |
|------|--------|--------|
| Typecheck | GREEN | 0 errors (6 packages) |
| Tests | GREEN | rc 1110 / rm 159 / rs 7 / av 138 / studio 919 / viewer 136 |
| Studio svelte-check | GREEN | 0 errors / 0 warnings, 1143 files |
| Viewer astro check | GREEN | 0 errors / 0 warnings / 0 hints, 46 files |
| Viewer islands | GREEN | 0 errors / 0 warnings, 1464 files |
| Build | GREEN | Studio (Vite) + Viewer (Astro) clean |
| dist mirror | GREEN | root dist/ matches packages/archie-viewer/dist/ |
| Embed ratchet | GREEN | 261.7KB gz, budget 262KB |
| Embed smoke | GREEN | 4/4 assertions PASS |
| Studio e2e | SKIP | no nav/chrome touched |
| Rust | SKIP | no src-tauri touched |

### Lane map

| Lane | Last examined | Status |
|------|--------------|--------|
| 1. Data-integrity spine | `8a577f0` | current |
| 2. Untrusted-input seams | `8a577f0` | current |
| 3. Gate-shadow code | `8a577f0` | current |
| 4. Hollow features | `8a577f0` | current |
| 5. Drift surfaces | `8a577f0` | current |
| 6. Dead weight | `8a577f0` | current |
| 7. Rust shell | `8a577f0` | current |

### Deferred issues from ISSUES.md

Issue 13 (collab summary inert), Issue 14 (note ladder claims), Issue 16 (gh-pages bake untested),
Issue 17 (embed drops whole-object notes), Issue 18 (App.svelte god-orchestrator) — all queued,
unverified at this bootstrap. Issues 22/25 need manual verify (ledgers/TABS.md, ledgers/MIRROR.md).

### Rotation

Next: Lane 1 (data-integrity spine) — per §3 lanes 1–2 alternate until clean cells current.

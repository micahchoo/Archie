# Dependabot triage — 2026-06-17

12 open alerts (2 critical) flagged on push to `micahchoo/Archie`. Triaged by direct
dependency-tree analysis + a 4-agent adversarial verification pass (one skeptic per
package, each trying to *refute* the exploitability/fix call against the real repo).

## Bottom line

**None of the 12 are exploitable in this app as it actually runs.** The only dependency
that ships to an end-user browser is **dompurify**, and its single call site
(`packages/render-svelte/src/sanitize.ts:13`,
`DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } })`) uses none of the config
modes the advisories require (`IN_PLACE`, `SAFE_FOR_TEMPLATES`, custom hooks — grep across
source = 0 hits). Everything else (vitest, vite, esbuild) is dev/build tooling that never
enters the published static artifact, and the high-severity items are Windows-only while
dev/CI runs on Linux (`deploy.yml` → `ubuntu-latest`).

The headline ("2 critical") is a **dev-only test runner**, not a runtime exposure.

## Safe remediation (clears 6 of 12, all low-risk) — ✅ APPLIED 2026-06-17

This repo declares security overrides in **`pnpm-workspace.yaml`**, not `package.json`
(a `package.json` `pnpm.overrides` block is silently ignored here — pnpm reads the
workspace file). Added to the existing `overrides:` block:

```yaml
overrides:
  yaml@<2.8.3: '>=2.8.3'
  esbuild@<0.25.0: '>=0.25.0'
  dompurify@<3.4.8: '3.4.8'
  vite@>=8.0.0 <8.0.16: '8.0.16'
```

- `dompurify 3.4.5 → 3.4.8` (patch; `isomorphic-dompurify` declares `^3.3.1`, in-range) —
  clears GHSA-gvmj, GHSA-76mc, GHSA-hpcv, GHSA-r47g.
- `vite 8.0.14 → 8.0.16`, **selector scoped to the vulnerable 8.0.x band only** so the
  5.4.21 / 6.4.2 / 7.3.3 instances (needed by vitest `^5`, vite-plugin-svelte `^6`,
  astro `^7.3.2`) are untouched — a blanket `vite` override would break the build —
  clears GHSA-fx2h (high), GHSA-v6wh.

**Validated:** `pnpm install` resolved dompurify→3.4.8 and the 8.0.x→8.0.16; `pnpm -r build`
passed (both apps, all Viewer static routes); test suite shows **no new failures** from the
bump (render-svelte's 19 sanitize tests pass). Two pre-existing failures —
`@render/core` `ghpages.test.ts` and `@archie/viewer` `published.test.ts` — are unrelated
UX-copy drift (error-message assertions lagging the `copy/ux-polish` rework), confirmed by
reverting the overrides and observing the identical failures.

## Per-alert verdict

| # | Pkg | GHSA | Sev | Installed | Reachable? | Action |
|---|-----|------|-----|-----------|------------|--------|
| 1,2 | vitest | GHSA-5xrq-8626-4rwp | critical | 2.1.9 | No — needs `vitest --ui`; `@vitest/ui` not installed, no `--ui`, CI runs no tests | Dismiss ("not used") **or** v2→v3.2.6 migration (major, 77 test files) |
| 3 | esbuild | GHSA-gv7w-rqvm-qjhr | high | 0.27.7 | No — **withdrawn** (Deno-module misidentification) | Auto-closes / dismiss |
| 4 | vite | GHSA-fx2h-pf6j-xcff | high | 8.0.14 | No — Windows-only, build-time codegen, not shipped | **Fix: vite-node>vite 8.0.16** |
| 5 | dompurify | GHSA-x4vx-rjvf-j5p4 | low | 3.4.5 | No — requires IN_PLACE | Dismiss — **no patched release exists yet** |
| 6 | dompurify | GHSA-gvmj-g25r-r7wr | low | 3.4.5 | No — requires SAFE_FOR_TEMPLATES | **Fix: dompurify 3.4.8** |
| 7 | esbuild | GHSA-g7r4-m6w7-qqqr | low | 0.27.7 | No — Windows-only dev-server `--servedir`, unused | Dismiss — no safe fix (0.28.1 breaks astro/vite caret ranges) |
| 8 | dompurify | GHSA-76mc-f452-cxcm | med | 3.4.5 | No — requires addHook | **Fix: dompurify 3.4.8** |
| 9 | dompurify | GHSA-hpcv-96wg-7vj8 | med | 3.4.5 | No — requires cross-realm IN_PLACE | **Fix: dompurify 3.4.8** |
| 10 | dompurify | GHSA-r47g-fvhr-h676 | med | 3.4.5 | No — requires IN_PLACE | **Fix: dompurify 3.4.8** |
| 11 | vite | GHSA-4w7w-66w2-5vf9 | med | 5.4.21 | No — installed 5.4.21 ≥ patched 5.4.20 (multi-branch advisory; Dependabot range is simplified to `<=6.4.1`) | Dismiss ("already patched on branch") |
| 12 | vite | GHSA-v6wh-96g9-6wx3 | med | 8.0.14 | No — Windows-only launch-editor NTLM | **Fix: vite-node>vite 8.0.16** |

## Residual after safe fix

6 alerts remain, all **unreachable**: 2× vitest critical (dev-only, no UI server),
esbuild high (withdrawn) + low (no safe fix), dompurify low (no patch yet), vite medium
(already patched on branch). Each is a legitimate GitHub *dismissal* candidate, or — for
vitest — a deferred v2→v3 migration tracked separately.

## Method

Tree origins via `pnpm why -r`; usage via source grep (excluding `node_modules`/`dist`);
advisory ranges + withdrawal status fetched from GHSA. Full evidence per package in the
verification run; orchestrator confirmed single dompurify version, single sanitize call,
and `ubuntu-latest` CI.

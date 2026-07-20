# DEPS — dependency triage (ISSUES.md Issue 15)

**Run:** 2026-07-05 · commit `246550d` (main) · Node 24 / pnpm 11 in the audit sandbox (repo targets
Node 22+/pnpm 9+ — re-verify bumps under the project toolchain). **Status:** running — ledger:
`ledgers/DEPS.md`.

**Contract.** Floor = **moderate+**. Done when: every declared dep classified (a second pass adds no
rows) · **zero unused** · every advisory at moderate+ **fixed or carrying its reason in-row** · a
fresh `pnpm audit` adds no new rows above the floor. Phases: (1) inventory+classify — no changes
[THIS PASS] → (2) act in class order (vulnerable→unused→stale), one dep per row, per-row check
(typecheck + tests + build/smoke), commit per row. Majors get a changelog read + written plan, never
a blind bump.

## Phase-1 findings (verified, corrects three earlier framings)

1. **`isomorphic-dompurify`'s jsdom is load-bearing, not deadweight.** `sanitize.ts` runs
   `DOMPurify.sanitize` at module load; the **publish pipeline runs it server-side under Node**
   (`static-pages.ts`/`site.ts:85` via `gen-published.mts` + `build-gh-pages.sh`), where jsdom *is*
   the DOM. Plain `dompurify` would throw in Node. → action is a **major bump to 3.18**, not a swap.
2. **The only CRITICAL is dev-only, guarded by the invocation.** `vitest <3.2.6` "UI server arbitrary
   file read" fires under `vitest --ui`; the repo runs `vitest run`. Real exposure ≈ 0, but it's above
   the floor. **Corrected 2026-07-20 (RESOLVED, see below):** the guard is the *invocation*, not the
   absence of `@vitest/ui`. The vulnerable `readTestFile`/`saveTestFile` RPC handlers live in vitest
   **core**, which is installed, and vitest auto-installs `@vitest/ui` on demand the moment anyone
   runs `vitest --ui`. The actual control is `if (options.api && options.watch)` — every package test
   script is plain `vitest run` (watch=false). So "we don't have @vitest/ui installed" was never the
   reason it was safe; anyone typing `vitest --ui` locally would have been exposed.
   **Now moot: fixed by the vitest 2→3.2.7 bump (`ledgers/DEPS-dependabot-2026-07-20.md` §3a).**
3. **`astro` advisories fix inside major 6** (6.3.8 → ≥6.4.6) — the SSRF (high), XSS-spread (mod), and
   transitive js-yaml (mod) all clear without the astro-7 major.
4. **Zero unused** — every declared dep has a real reference (even `http-proxy` → `scripts/dev-proxy.mjs`).
5. **Correction to Issue 15's "no audit ever run" framing (discovered mid-loop):** `pnpm-workspace.yaml`
   already carries a committed **Dependabot security-overrides** block (commit `105fd09` "chore(security):
   patch transitive dev deps") — `yaml`/`esbuild`/`dompurify`/`vite` forced up. So *some* dep-security
   work predates this loop; what was missing is a *systematic* audit + ledger. Note several of those
   overrides are now stale/insufficient (`esbuild@<0.25.0` doesn't cover the current `>=0.27.3` advisory;
   `dompurify@<3.4.8: 3.4.8` is below the `<=3.4.10` advisory — moot now that R-idp pulls a fixed
   dompurify; the `vite@8.0.x` override doesn't match the installed 6/7 tree) and `minimumReleaseAgeExclude`
   still pins `astro@6.3.8` (stale after R-astro's bump to 6.4.8) — flagged, not fixed (that file is the
   concurrent session's/Dependabot's domain).

## Advisory map (19 findings; floor = moderate+)

| # | sev | module | arrives via | fixed by |
|---|-----|--------|-------------|----------|
| 1 | CRIT | vitest <3.2.6 | `.>vitest` (dev, UI-only) | **R-vitest** (major 2→3.2.6+) |
| 2-4 | HIGH | undici (TLS / WS-DoS / SOCKS routing) | `vitest>jsdom>undici` (dev) **and** `isomorphic-dompurify>jsdom>undici` (runtime) | **R-idp** + **R-vitest** (both jsdom sources) |
| 5 | HIGH | vite `fs.deny` (<=6.4.2) | `vitest>vite` (dev) | **R-vite** (coupled w/ vitest) |
| 6 | HIGH | vite `fs.deny` (7.0–7.3.4) | `astro>@astrojs/svelte>…>vite` (dev) | **R-astro** / **R-vite** |
| 7 | HIGH | astro SSRF (<6.4.6) | `apps/viewer>astro` (dev) | **R-astro** (within major 6) |
| 8-9 | MOD | undici (header-inject / cache-disclosure) | jsdom (both sources) | R-idp + R-vitest |
| 10 | MOD | vite path-traversal (<=6.4.1) | `vitest>vite` | R-vite |
| 11-12 | MOD | launch-editor NTLMv2 (via vite ×2) | `vitest>vite`, `astro>…>vite` | R-vite / R-astro |
| 13 | MOD | astro XSS spread (<6.4.6) | `apps/viewer>astro` | R-astro |
| 14 | MOD | dompurify ALLOWED_ATTR (<=3.4.10) | `isomorphic-dompurify>dompurify` (runtime, render-core+viewer) | **R-idp** |
| 15 | MOD | js-yaml DoS (via astro) | `astro>@astrojs/markdown-remark>js-yaml` | R-astro (transitive) |
| 16 | LOW | esbuild dev-server file-read | `vitest>vite>esbuild` | R-vite |
| 17 | LOW | dompurify Trusted-Types (<3.4.9) | `isomorphic-dompurify>dompurify` | R-idp |
| 18-19 | LOW | undici (queue-poison / SameSite) | jsdom (both sources) | R-idp + R-vitest |

Below the floor (LOW) rows 16-19 ride their moderate+ siblings' fixes — no separate action.

## Classified inventory · action rows

Class: **vuln** (advisory) · **stale** (behind, no advisory) · **healthy** · **unused** (none).
`action` filled in Phase 1; `commit`/`retest` fill in Phase 2.

| dep | used by | current → latest | class | action | commit | retest |
|-----|---------|------------------|-------|--------|--------|--------|
| **R-idp** `isomorphic-dompurify` | `render-core/text/sanitize.ts`, viewer (runtime, both) | 2.36.0 → **3.18.0** (major) | vuln→**fixed** | bumped 2→3.18; cleared dompurify ALLOWED_ATTR (mod) + Trusted-Types (low). API stable (sanitize/addHook/USE_PROFILES); jsdom fallback intact | *pending* | bare-Node jsdom smoke PASS · `gen-published` wrote 235 files (real Node publish) EXIT 0 · sanitize.test 15 · render-core 723 · typecheck 0 |
| **R-astro** `astro` | apps/viewer (dev/build) | 6.3.8 → **6.4.8** | vuln→**fixed** | bumped within major 6; cleared astro SSRF (high) + XSS-spread (mod). js-yaml (mod) NOT cleared — astro 6.4.8 still pins js-yaml ≤4.1.1 → reason-in-row R-jsyaml | *pending* | astro check 0/0/0 · viewer 75 tests · audit 19→17 |
| **R-vitest** `vitest` | root (dev, all tests) | 2.1.9 → **3.2.6+** (major; latest 4.1.9) | vuln | major bump — HIGH RISK (rune tests run per-app; memory: root vitest binary fails runes). Read changelog, written plan, verify EVERY per-app suite. CRIT is UI-only → reason-in-row if deferred | | |
| **R-vite** `vite` | studio (dev); transitively via vitest + astro | 6.4.2 → 8.1.3 (major +2); also 7.x via astro | vuln | coupled to R-vitest (vitest pins vite range) + R-astro; bump together, not alone | | |
| `@astrojs/svelte` | apps/viewer (dev) | 8.1.2 → 9.0.1 (major) | stale | plan — couples with astro; bump with R-astro or defer with reason | | |
| `@sveltejs/vite-plugin-svelte` | apps/studio (dev) | 5.1.1 → 7.1.2 (major +2) | stale | plan — couples with vite/svelte; defer unless R-vite taken | | |
| `typescript` | root, viewer (dev) | 5.9.3 → 6.0.3 (major) | stale | plan — TS 6 is a major; changelog read; gate depends on it (Issue 12) | | |
| `openseadragon` | render-mount (runtime) | 5.0.1 → 6.0.2 (major) | stale | plan — runtime canvas; changelog + annotation-canvas smoke | | |
| `@types/openseadragon` | render-mount (dev) | 5.0.2 → 6.0.0 (**deprecated**) | stale | investigate — latest is deprecated; check if OSD 6 ships own types | | |
| `@annotorious/openseadragon` | studio, viewer, mount | 3.8.2 → 3.8.8 (patch) | healthy | safe patch bump | | |
| `wavesurfer.js` | apps/studio (runtime) | 7.12.7 → 7.12.8 (patch) | healthy | safe patch bump | | |
| `happy-dom` | mount, archie-viewer (dev) | 20.9.0 → 20.10.6 (patch) | healthy | safe patch bump | | |
| `svelte` | studio, viewer, svelte (dev) | 5.55.9 → 5.56.4 (minor) | healthy | safe minor bump | | |
| `playwright` | root (dev, e2e) | 1.60.0 → 1.61.1 (minor) | healthy | safe minor bump | | |
| `@tauri-apps/cli` | root (dev) | 2.11.3 → 2.11.4 (patch) | healthy | safe patch bump | | |
| `http-proxy` | `scripts/dev-proxy.mjs` (dev) | 1.18.1 (latest of major 1; unmaintained) | healthy | keep; note dev-proxy.mjs is the only consumer (dead-code Q → Issue 18 territory, not here) | | |
| `@render/*` workspace | internal | workspace:* | healthy | n/a | | |
| `@tauri-apps/api`+plugins, `fflate`, `snarkdown`, `minisearch`, `@annotorious/plugin-tools`, `@astrojs/check`, `vite-node` | studio/viewer/core (see imports) | current | healthy | no advisory, current or n/a | | |

**Unused:** none.

## Scope chosen: A — safe targeted fixes (user-directed 2026-07-05)

Executed R-idp + R-astro (above), each verified. **Audit 19 → 15** (4 cleared: astro SSRF+XSS,
dompurify ALLOWED_ATTR+Trusted-Types). Nothing user-facing regressed.

## Residual advisories — reason-in-row (all dev/build-only, no shipped-browser exposure)

The 15 remaining advisories are reachable **only through dev/build tooling**. Key fact: `undici` runs
via `jsdom`, which is present **only** in the Node publish/test path (browser `isomorphic-dompurify`
uses the native DOM — no jsdom, no undici in the shipped bundle), and it sanitizes local HTML strings,
making no attacker-influenced network calls. So none of these is reachable by an end user of the
published site.

| id | reason deferred (in-row) | fixed by (planned) |
|----|--------------------------|--------------------|
| **R-vitest** vitest <3.2.6 (CRIT) | ~~dev-only **and** UI-only~~ → dev-only, guarded by the *invocation* (`vitest run` sets watch=false), NOT by `@vitest/ui` being absent — handlers are in vitest core and the UI auto-installs on demand (corrected 2026-07-20). Exposure ≈ 0 either way | **DONE 2026-07-20** — vitest 2.1.9→3.2.7; also evicted vite 5.4.21, closing R-vite. See `ledgers/DEPS-dependabot-2026-07-20.md` |
| **R-undici** undici ×7 (3 high/2 mod/2 low) | **FIXED** — `pnpm-workspace.yaml` override `undici@<7.28.0: '>=7.28.0 <8'` → undici 7.28.0 · verified `gen` EXIT 0 + render-core 734 + viewer 75 | done (user-directed add) |
| **R-vite** vite ×5 (1 high/mods) | dev/build tooling (test runner + astro build); not shipped | scope B: vite 6→8 (coupled w/ vitest) |
| **R-jsyaml** js-yaml (mod) | transitive via astro's markdown-remark (build tooling); not clearable within astro major 6 | scope B/C: astro 7, or a js-yaml override |
| esbuild (low) | below floor; dev, via vite | rides R-vite |

**undici override — APPLIED (user-directed, 2026-07-05).** Added to `pnpm-workspace.yaml`'s existing
overrides block (pnpm 11 reads overrides there, NOT `package.json`'s `pnpm` field — a first attempt in
`package.json` was silently ignored and reverted). Cleared all 7 undici advisories. **Gotcha caught in
verification:** the first form `undici@<7.28.0: '>=7.28.0'` was unbounded and resolved undici **8.7.0**
(major jump) → jsdom 29's fetch broke → `gen` EXIT 1, viewer 31/75. Re-bounded to `'>=7.28.0 <8'` →
undici 7.28.0 → all green. *Lesson: an unbounded `>=X` override crosses majors — bound it to the
compatible major; this is the same trap the file's own `vite` override comment already documents.*

## Planned-bump rows (scope B/C — queued, not run)

`R-vitest` + `R-vite` (coupled toolchain majors, own branch, full per-app suite pass) · `@astrojs/svelte`
8→9 · `@sveltejs/vite-plugin-svelte` 5→7 · `typescript` 5→6 (gate-relevant, Issue 12) · `openseadragon`
5→6 (annotation-canvas smoke) · `@types/openseadragon` 6 deprecated (check if OSD6 ships own types).
Healthy patch/minors (annotorious 3.8.8, wavesurfer 7.12.8, happy-dom, svelte 5.56, playwright, tauri-cli).

## Verdict (scope A + undici override)

**Audit 19 → 8.** Cleared: astro SSRF+XSS (R-astro), dompurify ALLOWED_ATTR+Trusted-Types (R-idp),
undici ×7 (R-undici override). Remaining **8 are all dev/build tooling** (vitest CRIT UI-only, vite ×5,
esbuild, js-yaml) — each reasoned-in-row with a queued scope-B/C planned bump; none reachable by an
end user of the published site. Done-when for the chosen scope met: **zero unused**; the two named
vulnerable deps fixed + verified; undici fixed via bounded override; every remaining moderate+ advisory
carries its reason-in-row.

**Changed files (this loop):** `apps/viewer/package.json` (astro+idp), `packages/render-core/package.json`
(idp), `pnpm-workspace.yaml` (undici override), `pnpm-lock.yaml`. **Excluded from commits:** the
concurrent session's in-flight Issue 11 files (App.svelte, overview-selection.*, library-meta-reducers.*,
SCALE.md, PRFAQ.md, HARVEST.md) and its generated `apps/viewer/public/published/images.json` (ADR-0023
image index — a byproduct of my `gen` smoke, left untracked for that session).

Commit path-scoped, branch `main` re-checked immediately before. Then Issue 15 → `done`.

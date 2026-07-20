# DEPS — Dependabot remediation plan, 2026-07-20

**Scope:** 11 open Dependabot alerts (npm + Cargo). Extends `ledgers/DEPS.md` (run 2026-07-05,
commit `246550d`) rather than replacing it — every row below cites the prior-art row it derives from.
**Toolchain:** Node 24 / pnpm 11 / rustc 1.93.1. **Method:** each finding was triaged, then attacked
by three independent verifiers on separate lenses (breakage, efficacy, reachability). Where they
disagreed, the disagreement is recorded in-row; it is not averaged away.

**Nothing in this plan has been applied.** All investigation was read-only.

---

## 1. Summary

| Alert | Package | Sev | Resolved version(s) present | Reachability | Action |
|---|---|---|---|---|---|
| #52 | `js-yaml` | MOD | 4.1.1 (single) | dev/build-only (astro) | **FIX NOW** |
| #37 / #39 | `vite` 7.x | HIGH / MOD | 7.3.3 | dev server, LAN-reachable via `dev-proxy` | **FIX NOW** |
| #38 / #40 | `vite` 6.x (partial) | HIGH / MOD | 6.4.2 | studio dev server | **FIX NOW** (partial — see #38/#40 vite-5 row) |
| #25 | `esbuild` | LOW | 0.27.7 (+ 0.25.12) | dev/build-only, Windows-only serve advisory | **BLOCKED** (hygiene edit only; alert stays open) |
| #23 / #24 | `vitest` | CRIT | 2.1.9 (single) | unreachable (no `--ui`/`--api`; `vitest run` only) | **FIX WITH CARE** |
| #38 / #40 / #10 | `vite` 5.4.21 (via vitest) | HIGH / MOD / MOD | 5.4.21 | test-runner only, no listening socket | **BLOCKED** — no patched 5.x; clears with the vitest bump |
| #53 | `git2` | LOW | 0.19.0 | shipped in desktop binary, but vulnerable API (`git2::Buf`) never constructed | **FIX WITH CARE** |
| #51 | `glib` | MOD | 0.18.5 | unreachable (`Variant::array_iter_str` has zero callers tree-wide) | **DISMISS-WITH-JUSTIFICATION** |

Net effect if the whole plan lands: #52, #37, #39 close outright; #23/#24 close with the vitest
bump, which in turn is what finally closes #38/#40/#10 (by evicting vite 5.4.21). #25 and #51 stay
open by design, each carrying its reason in-row per `ledgers/DEPS.md`'s contract ("every advisory at
moderate+ fixed or carrying its reason in-row" — DEPS.md:7-9; #25 is LOW, i.e. below that floor).

---

## 2. Fix now

Three edits. Order matters: apply the vite 7.x override **before** the vitest bump in §3, because
vitest 3.2.7 will resolve its vite upward into the 7.x line.

### 2a. `pnpm-workspace.yaml` — add two entries to the existing `overrides:` block

Append after the `undici@<7.28.0` line, matching the block's existing inline-WHY comment style:

```yaml
  # js-yaml: astro 6.4.8 + @astrojs/internal-helpers 0.10.0 both declare ^4.1.1 — the top of
  # GHSA-h67p-54hq-rp68's range (<=4.1.1). 4.2.0/4.3.0 are INSIDE ^4.1.1, so no declared range is
  # violated. Build-time only: no .md/.mdx or content collections exist in apps/viewer, nothing in
  # app source parses YAML, and untrusted ingest (.archie.zip, IIIF) is JSON. BOUND to major 4 —
  # js-yaml 5.x is a TS rewrite (flat exports, load drops !!merge by default); same unbounded-'>='
  # trap as undici 8 / jsdom 29 (ledgers/DEPS.md:105-111). Resolves DEPS.md's R-jsyaml row without
  # the astro-7 major it listed as the alternative (DEPS.md:102).
  js-yaml@<4.2.0: '>=4.2.0 <5'
  # vite 7.x (astro/viewer dev server): fs.deny bypass (HIGH) + launch-editor NTLMv2 (MOD), advisory
  # row >=7.0.0 <=7.3.4, patched 7.3.5 (7.3.4 was never published). Reachable from the LAN, not just
  # localhost: scripts/dev-proxy.mjs calls server.listen(PORT) with no host and forwards every
  # non-/studio path (incl. /@fs) to astro dev on :4321; that proxy is the documented Windows
  # start.cmd entry point (README.md:149, scripts/start.mjs). BOUND to major 7 — astro 6.4.8 and
  # @astrojs/svelte 8.1.2 both declare vite ^7.3.2, the ranges the file's own vite comment warns about.
  vite@>=7.0.0 <7.3.5: '7.3.5'
```

Notes:
- `>=7.0.0 <7.3.5` is disjoint from the existing `vite@>=8.0.0 <8.0.16` key; pnpm 11 accepts multiple
  range-scoped keys for one package name (verified in a scratch workspace by the triage pass).
- Verifiers split on pin-vs-range form for the vite 7 entry: two preferred `'>=7.3.5 <8'` (floats to
  the already-published 7.3.6, matches the `yaml`/`esbuild`/`undici` precedent), one preferred the
  exact `'7.3.5'` (determinism, matches the `dompurify`/`vite@8` precedent). Both close the alert.
  The exact pin is written above; swap it if the range form is preferred — this is a style call, not
  a correctness one.
- Expect churn on `vitefu@1.1.3`'s recorded peer line in `pnpm-lock.yaml` (~:3110). Its peer is the
  compound `^3||…||^8`, which intersects both vite overrides; pnpm rewrites the recorded peer and
  the winner is key-order-dependent. The peer is `optional: true`, so this cannot fail an install.
  Do not chase it.

### 2b. `apps/studio/package.json` — bump the direct vite devDep

```
"vite": "^6.4.2"   ->   "vite": "^6.4.3"
```

**Deliberately NOT an override, against the original proposal.** Two of three verifiers refuted the
`vite@>=6.0.0 <6.4.3: '6.4.3'` override form:

- pnpm 11's `createVersionsOverrider` matches on the **consumer's declared range** via
  `isIntersectingRange`, and rewrites the consumer manifest **including peerDependencies**. In-repo
  proof: `pnpm-lock.yaml:3110-3113` records `vitefu@1.1.3`'s peer as the literal `vite: 8.0.16`, a
  rewrite by the existing 8.x override. `>=6.0.0 <6.4.3` intersects `^6.3.0 || ^7.0.0` — the peers of
  `@sveltejs/vite-plugin-svelte@6.2.4` and its inspector 5.0.2 in the **viewer's** astro chain
  (`pnpm-lock.yaml:1380`, `:1394`) — so the override would rewrite peers in a graph it was never
  meant to touch, against a tree providing 7.3.3.
- `pnpm why vite -r` shows vite 6.4.2 has exactly **one** non-peer consumer: `@archie/studio` as a
  direct devDep. plugin-svelte 5.1.1, inspector 4.0.1 and vitefu all take vite as a *peer* from
  studio's copy, so they follow the direct declaration automatically. The override buys nothing.

The third verifier approved the override as written and found no breakage. Recording the split: the
override is not *wrong*, it is unnecessary and has verified collateral, so the direct bump is the
smaller change. **If an override is ever used here anyway, the `>=6.0.0` lower bound is
load-bearing** — a bare `vite@<6.4.3` intersects `^5.0.0` (vitest 2.1.9, vite-node 2.1.9,
@vitest/mocker 2.1.9) and would silently force vite 5 across a major. That is the exact failure the
file's own comment records for blanket vite overrides, and DEPS.md:105-111 records for undici.

### 2c. Honest scope note on #38 / #40

The 6.x bump plus the 7.x override does **not** close #38/#40. `pnpm audit --json` shows each of
those advisories has **two** version rows, and three resolutions are flagged: 5.4.21 and 6.4.2 under
`<=6.4.2`, and 7.3.3 under `>=7.0.0 <=7.3.4`. vite 5.4.21 remains (see §4). Expect #37/#39/#52 to
close and #38/#40/#10 to stay open until §3's vitest bump lands.

---

## 3. Needs care

### 3a. `vitest` 2.1.9 → ^3.2.7 — alerts #23, #24 (CRITICAL), and the key to #38/#40/#10

**Edit:** root `package.json:24`, `"vitest": "^2.1.8"` → `"vitest": "^3.2.7"`. Own branch. Not an
override — vitest is a direct devDep and every entry in the overrides block targets a transitive.

**Why 3.2.7, not 4.1.10:** 3.2.7 is the head of the `V3` dist-tag, clears the >=3.2.6 patch floor,
and crosses one major instead of two. 4.x drops vite 5 by range, renames `workspace`→`projects`, and
changes spy/mock semantics more broadly — no additional security benefit. Bounded-move discipline
per the undici lesson (DEPS.md:105-111).

**Reachability of the CRITICAL is ~0, and the plan should say why correctly.** The original triage
said "@vitest/ui is not installed, so the vulnerable feature is absent". One verifier read the
installed package and showed that is **false**: the vulnerable `readTestFile`/`saveTestFile` RPC
handlers live in vitest **core** (`cli-api` chunk, ~:4899/:4933/:4939), which is installed; and
vitest auto-installs `@vitest/ui` on demand (`packageInstaller.ensureInstalled("@vitest/ui", …)`,
~:11256) the moment anyone runs `vitest --ui`. The **actual** control is
`if (options.api && options.watch)` (~:11421) — every one of the six package test scripts is plain
`vitest run` (watch=false), CI runs `pnpm -r --no-bail test`, and no config sets `api`/`ui`/`browser`.
Correct DEPS.md:21/:99's wording accordingly: the guard is the invocation, not package absence.

**Risks, all verified rather than assumed:**
- Peers/engines are clean: 3.2.7 peers `jsdom '*'`, `happy-dom '*'`, `@types/node ^18||^20||>=22`;
  engines `^18||^20||>=22`. No `@vitest/coverage-*`, no `@testing-library` in the tree.
- No v2→v3 breaking config/API surface is used: zero hits repo-wide for `environmentMatchGlobs`,
  `deps.inline`, `poolOptions`, `singleThread`, `--threads`, `expect.getState`, `workspace`/`projects`.
  The one semantic change that touches us — `mockReset()` now restores the original implementation —
  has six call sites, all benign (`asset-queue.test.ts` chains `.mockResolvedValue` immediately;
  `binding-store.svelte.test.ts` resets bare `vi.fn()` with no implementation to restore).
- **The real risk is the vite move.** vitest 3.2.7's vite dep is `^5.0.0 || ^6.0.0 || ^7.0.0-0`, so
  pnpm will resolve upward, almost certainly onto the 7.x line. It **cannot** reach 8.x — drop any
  claim that the `vite@>=8.0.0 <8.0.16` override interacts. This is why §2a's 7.x override must land
  first: without it the runner lands on 7.3.3 and reopens the 7.x advisory.
- **The residual that cannot be settled read-only:** `apps/studio/vitest.config.ts` loads
  `@sveltejs/vite-plugin-svelte@5.1.1` (peer `vite ^6.0.0`) inside the vitest server to compile
  `$state` in `.svelte.ts`. Post-bump that plugin runs under vite 7. There is no `.npmrc`, so
  `strict-peer-dependencies` is false — the install succeeds silently and any breakage surfaces only
  at test time. Mitigating evidence: studio's rune suite **already** runs a vite-6-peered plugin
  inside a vite-5 vitest server and is green, so this is the same class of mismatch, not a new one.
  If the rune suites fail (`$state is not defined`, or a plugin hook error), the fix is to bump
  `@sveltejs/vite-plugin-svelte` to `^6.2.4` (peer `^6.3.0 || ^7.0.0`, already resolved in the
  lockfile via astro) — not to revert vitest. DEPS.md already lists that bump as coupled work.

**Verification (blocking gate, in this order):**

```bash
pnpm install
pnpm why vite            # assert vitest's vite is >= 7.3.5, and 5.4.21 is GONE
grep -c 'vitest@2.1.9' pnpm-lock.yaml    # expect 0
cd apps/studio  && pnpm exec vitest run && pnpm typecheck && pnpm run check
cd apps/viewer  && pnpm exec vitest run && pnpm exec astro check && pnpm run build
cd packages/render-core   && pnpm exec vitest run
cd packages/render-svelte && pnpm exec vitest run
cd packages/render-mount  && pnpm exec vitest run
cd packages/archie-viewer && pnpm exec vitest run
```

Never the root vitest binary — rune tests fail there with `$state is not defined`
(project memory; `.claude/rules/svelte-no-typecheck-net.md` for the per-app check convention).
Prior art: DEPS.md:65 (`R-vitest`, HIGH RISK, per-app suite verification), :66 / :115 (`R-vitest` +
`R-vite` are one coupled unit, own branch), :99 (the reason-in-row this supersedes).

### 3b. `git2` 0.19 → 0.20.4 — alert #53

**Edit:** `src-tauri/Cargo.toml:42`, `git2 = "0.19"` → `git2 = "0.20.4"`. Also update the stale
`"0.19"` literal inside the comment block at :38-41 (the "keep `vendored-openssl` in the back
pocket" note), so the reserve-feature advice doesn't drift.

Then `cd src-tauri && cargo update -p git2`. **`cargo update -p git2 --precise 0.20.4` alone fails** —
the manifest req `"0.19"` is a caret range that excludes 0.20.x, so the manifest edit must come first.

**Do not use bare `git2 = "0.21"`.** A verifier compiled a byte-for-byte replica of
`src-tauri/src/github.rs`'s git2 usage and measured it: git2 0.21's `default = []` (0.19 had
`[ssh, https, ssh_key_from_memory]`; 0.20.4 has `[ssh, https]`). The identical code **compiles clean**
under 0.21 — cargo build, the tempfile tests and CI all stay green — but the vendored libgit2 is
built with no TLS: `ldd` shows no OpenSSL linked, and the push dies at runtime with klass 16 *"there
is no TLS stream available"*. A shipped binary with a dead deploy path and zero build-time signal.
If 0.21 is ever chosen it **must** be `git2 = { version = "0.21", features = ["https"] }`.

Verifier disagreement, stated plainly: one verifier argued *for* 0.21, on the grounds that 0.20.4 is
the terminal 0.20.x release (`0.20.5` does not exist), so `^0.20.4` pins to a dead minor with no
future patch path, while the C-layer cost is identical (libgit2-sys 0.18.x either way). That is a
fair maintenance point — but it was written before the feature-default measurement above. **0.20.4 is
the recommendation**; if the dead-line concern wins later, take 0.21 *with the explicit `https`
feature*, never bare.

**Reachability:** the crate ships and executes (gh-pages deploy, `src-tauri/src/github.rs`), but the
advisory is UB when dereferencing `git2::Buf`, and `Variant`-free: `Variant::array_iter_str` is not
the API here — the sole constructor path is `Buf`, and `grep -ci buf src-tauri/src/github.rs` is 0.
Diffing the crate sources confirms the fix is a null-pointer guard added to `Deref`/`DerefMut` in
`src/buf.rs`. Package-level reachable, API-level unreachable — LOW is accurate.

**Verification:**

```bash
cd src-tauri
cargo build --release
cargo test                                   # tempfile stage_and_commit tests
ldd target/release/archie | grep libssl      # MUST show libssl.so.3 — the no-TLS canary
cargo tauri build                            # then rebuild the Flatpak
```

Then one real gh-pages push from the packaged Flatpak. Per `.claude/rules/tauri-csp.md`, anything
compiled into the binary requires `tauri build` + Flatpak rebuild to take effect, and per
`src-tauri/docs/spikes/2026-07-git2-in-tauri.md:21-26` the vendored libgit2 bump (1.8.1 → 1.9.4) must
be validated against the GNOME 49 runtime's **system** `libssl.so.3`/`libcrypto.so.3`, with
`features = ["vendored-openssl"]` held in reserve. Note `.github/workflows/` contains **no cargo
step** — none of this has CI coverage; it must be run by hand. Because the cost is a full C recompile
plus Flatpak rebuild for a LOW with a source-confirmed unreachable code path, batching this into the
next packaging pass rather than shipping it standalone is defensible.

---

## 4. Blocked / accept

### 4a. `vite` 5.4.21 — #38, #40, #10 (the row that keeps all three open)

**No patched 5.x exists.** `npm view vite versions` ends the line at 5.4.21; vite 5 is EOL, and both
advisories' patched fields point at 6.4.3 / 7.3.5 — majors away. vitest@2.1.9 and vite-node@2.1.9
declare `vite: ^5.0.0` as a **hard dependency** (not a peer), so an override forcing 6.4.3 violates
the runner's own contract, and pnpm applies overrides to hard deps and peers alike — silently
rewriting the range rather than erroring. The break would be invisible at install time.

Answering the question directly: **#10 is not stale.** 6.4.2 is past its `<=6.4.1` range, so 5.4.21
is the sole resolved version keeping #10 open.

**Do not override. Clear it via §3a's vitest bump** — which is the whole reason that bump strictly
dominates the deferral DEPS.md:99 recorded. Add a verification step: after the bump, `pnpm why vite`
must show no 5.x at all. Note that vitest 3.2.6's range *still permits* vite 5
(`^5.0.0 || ^6.0.0 || ^7.0.0-0`); resolving upward is resolver behaviour, not a guarantee. Assert it,
don't assume it.

Residual honesty: the root `node_modules/.bin/vite` shim resolves to 5.4.21 today, so
`pnpm exec vite` **from the repo root** (rather than from an app dir) starts a real listening
vulnerable server. No script or doc does this, but the repo's conventions are saturated with per-app
`pnpm exec` commands, so it is plausible rather than theoretical. Worth a line in the reason-in-row
until the bump lands.

If the alerts must be silenced sooner, dismiss with **"vulnerable code is not actually used"** — no
HTTP listener (vitest 2 runs vite in middleware mode; the server binds only under `api.port`), no
`@vitest/ui`. "No patch available" is not a selectable Dependabot reason.

### 4b. `esbuild` 0.27.7 — #25 (LOW)

**Cannot be closed without a change this repo should not make now**, and all three verifiers refuted
the proposed remediation as written — chiefly because the proposed override comment asserted things
that are false.

What is true: the advisory (GHSA-g7r4-m6w7-qqqr, LOW) is a Windows-only `esbuild --serve` file read.
Nothing here invokes serve mode; CI is `ubuntu-latest` throughout; the dev host is Linux. It is below
DEPS.md's moderate+ floor and already carried reason-in-row at DEPS.md:103.

What the original proposal got wrong, and must not be committed:
- **"Dedupes the tree to one esbuild" is false.** The override key `esbuild@<0.25.0` matches only
  vite 5's `^0.21.3` by intersection; vite 6 (`^0.25.0`), vite 7 (`^0.27.0`), astro 6.4.8
  (`^0.27.3`) and vite 8's peer do not match. Both 0.25.12 and 0.27.7 survive.
- **"The unbounded '>=' is how 0.27.7 got pulled in" is false.** astro 6.4.8 declares
  `esbuild: ^0.27.3` directly — 0.27.7 is in the tree regardless of the override.
- **"Zero risk" overstates it.** The edit changes what vite 5.4.21 (i.e. *every* vitest suite's
  transform pipeline) compiles with. Low risk — the two installed esbuilds have byte-identical export
  surfaces — but it needs a real per-app run, not a hand-wave.

**Recommended: leave the esbuild override alone in this pass.** §3a evicts vite 5.4.21 entirely,
which removes the one consumer this override touches and makes the whole question moot. If the
unbounded-`>=` bug class is worth closing on its own anyway, the corrected edit is a **bounded range,
not an exact pin** (matching the undici precedent, so future 0.25.x patches still land):

```yaml
  # esbuild: ONLY vite 5 (via vitest 2) matches this key — it declares ^0.21.3, which intersects
  # <0.25.0; vite 6 (^0.25.0), vite 7 (^0.27.0) and astro 6.4.8 (^0.27.3) do not. Bound the forced
  # bump instead of an unbounded '>=' (undici lesson, ledgers/DEPS.md:105-111). This does NOT dedupe
  # the tree and does NOT close #25 — astro/vite 7/vite 8 legitimately keep 0.27.7. #25 rides
  # R-vite/R-astro (DEPS.md:103,113-117).
  esbuild@<0.25.0: '>=0.25.0 <0.26.0'
```

Do **not** widen to `esbuild@<0.28.1: '>=0.28.1'`: 0.28.1 is outside astro 6.4.8's `^0.27.3` and vite
7.3.3's `^0.27.0` (caret-on-0.x = `<0.28.0`), and it reintroduces the unbounded-`>=` bug.

**Latent trap found while verifying, worth a separate ticket:**
`packages/archie-viewer/build.mjs:31-33` and `scripts/bundle-size.mjs:10-15` resolve esbuild by
scanning the pnpm store and taking `.sort().pop()` — *lexicographic*, not semver. That picks 0.27.7
today, meaning **the vulnerable copy is what compiles the shipped `<archie-viewer>` CDN bundle** (a
build-API call, not the dev server, so not exploitable — but it does mean any esbuild override
silently retargets the published bundle's compiler and can trip the `bundle:check` ratchet).

### 4c. `glib` 0.18.5 — #51 (MODERATE) — DISMISS

**Dismissal reason: "vulnerable code is not actually used" / no patch available within the pinned
stack.** Both halves independently verified; all three verifiers agreed.

*Hard upstream pin.* `gtk-0.18.2/Cargo.toml:83-84` declares `[dependencies.glib] version = "0.18"` —
a caret range that cannot reach 0.20.0, and the 0.18 line terminates at 0.18.5 with no backport.
`tao-0.35.3/Cargo.toml:271-272` pins `gtk = "0.18"` for all Linux/BSD targets, and tao 0.35.3 / wry
0.55.1 are already the newest published — so no Tauri 2.x patch can move glib. Forcing it would cross
a gtk-rs major for gtk/gio/gdk/gdk-pixbuf/cairo-rs/pango/atk/gdkx11 simultaneously against unported
consumers (webkit2gtk 2.0.2, soup3, javascriptcore-rs, muda) and would not compile; beyond that it
implies a GTK3→GTK4 webview migration, which touches the annotation-canvas rendering path
(`.claude/rules/tauri-csp.md` — PixiJS 7 under `@annotorious/openseadragon`) and the GNOME 49 Flatpak
runtime, which supplies webkit2gtk-4.1, i.e. GTK3.

*Non-use, proven at the constructor rather than the type name.* The advisory is unsoundness in
`Iterator`/`DoubleEndedIterator` for `glib::VariantStrIter`. Its **sole** public constructor is
`Variant::array_iter_str()` (`glib-0.18.5/src/variant.rs:843`, the only caller of
`VariantStrIter::new`). A grep for `array_iter_str` across every crate in
`cargo tree -i glib --target x86_64-unknown-linux-gnu` (21 crates + archie) returns **zero** hits
outside glib's own definition, doc example and unit tests. Control test: `glib::Variant` itself has
many hits (gio settings/dbus/action-group/menu-model), so the search works — this is a true negative.
Note `Variant::iter()` returns `VariantIter`, a different type outside the advisory. Archie's own
Rust is three files with no glib reference at all.

Coverage caveat, stated rather than hidden: 128 of 552 locked crates are not unpacked locally, so a
naive registry-wide grep would have skipped them. They were enumerated — all Windows / Apple /
Android / wasm / redox platform crates that never build on the Linux target where glib compiles.

Also: `.github/workflows/` contains no cargo or tauri invocation, so the crate is never even compiled
in CI. Exposure is limited to locally-built desktop binaries, where it remains unreachable.

**Revisit trigger:** state it concretely — *tao/wry ship a gtk 0.20+/GTK4 line*. Check by re-running
`cargo tree -i glib` after any tauri bump, and re-run the `array_iter_str` grep over the new closure.

---

## 5. Verification

Run in this order. Each command's expected result is stated; a claim of success without the
corresponding output is not a claim.

**After §2 (js-yaml + vite 7 overrides, studio vite bump) — no major crossed:**

```bash
pnpm install
pnpm why js-yaml -r          # expect a single 4.3.0; zero 4.1.1
pnpm why vite -r             # expect 7.3.5 (no 7.3.3); no 6.4.2; 5.4.21 still present (expected)
git diff pnpm-lock.yaml      # lines 1380/1394 should still read `vite: ^6.3.0 || ^7.0.0`

cd apps/viewer && pnpm exec astro check      # expect 0 errors / 0 warnings / 0 hints (DEPS.md:64)
cd apps/viewer && pnpm exec vitest run       # expect 75 passing
cd apps/viewer && pnpm run build             # astro build — the load-bearing smoke for the vite 7 bump
                                             # (its prebuild runs `gen`; expect EXIT 0, ~235 files)
cd apps/studio && pnpm exec vitest run && pnpm typecheck && pnpm run check
```

`pnpm run gen` alone does **not** exercise js-yaml (it is `vite-node scripts/gen-published.mts` and
never loads astro's `settings.js`); the full `astro build` is what does. `astro check` gates `.astro`
files only — it proves nothing about the viewer's Svelte islands
(`.claude/rules/svelte-no-typecheck-net.md`, corrected 2026-07-20).

**After §3a (vitest major) — the full per-app gate, on its own branch:** see §3a's block. Additional
assertions specific to closing the alerts:

```bash
grep -c 'vite@5' pnpm-lock.yaml     # expect 0 — this is what closes #38/#40/#10
pnpm audit                          # expect no vite finding at 5.4.21 / 6.4.2 / 7.3.3
```

**After §3b (git2):** see §3b's block. The `ldd … | grep libssl` line is the single check that
distinguishes a working deploy build from a silent no-TLS build; no compiler or test in this repo
catches it.

**CI note:** all six CI jobs run `pnpm install --frozen-lockfile`
(`.github/workflows/checks.yml:31,54,78,101,126,152`). Any `pnpm-workspace.yaml` edit **must** ship
with the regenerated `pnpm-lock.yaml` in the same commit or every job fails with
`ERR_PNPM_OUTDATED_LOCKFILE`.

---

## 6. Prior art cited

| Decision | Prior art |
|---|---|
| Overrides live in `pnpm-workspace.yaml`, not `package.json` | `ledgers/DEPS.md:105-107` — a first attempt in `package.json` was silently ignored by pnpm 11 |
| Every override bounded to the compatible major | `DEPS.md:105-111` (undici 8 broke jsdom 29 → `gen` EXIT 1, viewer 31/75) |
| Range-scope an override instead of blanket-bumping | `pnpm-workspace.yaml` vite comment — a blanket vite override "violates vitest ^5 / svelte-plugin ^6 / astro ^7.3.2 and breaks build" |
| Inline WHY comment on every override | The whole existing overrides block (`yaml`, `esbuild`, `dompurify`, `vite`, `undici`) |
| js-yaml override is the sanctioned alternative to astro 7 | `DEPS.md:102` — "scope B/C: astro 7, **or a js-yaml override**"; supersedes DEPS.md:64's "NOT cleared" |
| vitest bump is HIGH RISK, own branch, per-app suites | `DEPS.md:65`, `:66`, `:115` (`R-vitest` + `R-vite` are one coupled unit) |
| vitest CRITICAL is UI-only → deferrable | `DEPS.md:21`, `:99` — wording needs correcting per §3a (invocation, not package absence) |
| esbuild LOW rides R-vite | `DEPS.md:103`, `:113-117`; below the moderate+ floor at `DEPS.md:7` |
| Per-app `pnpm exec vitest`, never the root binary | Project memory (root binary fails runes with `$state is not defined`); `.claude/rules/svelte-no-typecheck-net.md` |
| `pnpm typecheck` is the gate for pure-`.ts` studio edits | `.claude/rules/studio-ts-typecheck-gate.md` |
| Compiled-in Tauri config needs `tauri build` + Flatpak rebuild | `.claude/rules/tauri-csp.md` |
| git2 plain (no vendored-openssl); system libssl; HTTPS-only push | `src-tauri/docs/spikes/2026-07-git2-in-tauri.md:16-26`, cited inline at `src-tauri/Cargo.toml:38-41` |
| The GTK3/webkit2gtk stack is load-bearing, not casually swappable | `.claude/rules/tauri-csp.md`, `.claude/rules/tauri-fs-seam.md`; project memory (GNOME 49 runtime, webkit2gtk-4.1) |
| Ledger has no Rust rows — this pass adds the first | `DEPS.md` is npm-only; its Tauri rows (`:77`, `:80`) are JS-side |

---

## 7. Follow-ups filed by this pass (not part of the remediation)

1. **Bind the dev proxy to loopback.** `scripts/dev-proxy.mjs` calls `server.listen(PORT)` with no
   host, so Node binds all interfaces, and the router forwards `/studio/*` (including `/@fs/`)
   unrewritten. That is what makes both vite dev-server advisories LAN-reachable rather than
   local-only. One line: `server.listen(PORT, '127.0.0.1', …)`. This is the durable control — the
   version bumps close today's advisories, not the exposure surface. Worth a `.claude/rules/` entry:
   dev-server launch paths must bind loopback explicitly.
2. **Semver-correct the esbuild store scan.** `packages/archie-viewer/build.mjs:31` and
   `scripts/bundle-size.mjs:10-14` pick esbuild by lexicographic `.sort().pop()` over the pnpm store.
   Correct today by luck; wrong the moment the store holds e.g. 0.9.x alongside 0.28.x.
3. **Gate the viewer's Svelte islands.** No `check:svelte` script exists in `apps/viewer`; 23 islands
   have no type gate in `check`, `typecheck`, or CI (`.claude/rules/svelte-no-typecheck-net.md`).
4. **Stale `minimumReleaseAgeExclude`.** `pnpm-workspace.yaml` still pins `astro@6.3.8` though 6.4.8
   is installed (already flagged at `DEPS.md:31-33`). Same file, out of scope here.
5. **Add a Rust/Cargo section to `ledgers/DEPS.md`.** Its stated invariant ("every advisory at
   moderate+ fixed or carrying its reason in-row") currently excludes the entire Cargo tree, so the
   glib dismissal and the git2 row have nowhere to live and the next auditor re-derives them.

---

## 8. Follow-up outcomes (same day, 2026-07-20)

1. **Done** — `56bc55f`: loopback bind + inline contract comment. Rule entry folded into
   [[bound-fetch-defaults]] scope decisions rather than a separate proxy rule.
2. **Done, re-scoped** — `56bc55f`: the *shipping* path (`build.mjs`) now declares esbuild `^0.27.3`
   as a devDep and `require`s it plainly (adversarial verify rejected an exact pin: it dedupes by
   luck and orphans when astro/vite move; reproducibility already comes from the committed lockfile +
   CI `--frozen-lockfile`). The *measuring* path (`scripts/bundle-size.mjs`) keeps its store scan
   deliberately — its `:12` comment is considered prior art, and its `--check` loop compares only
   vite-built app dists, so its compiler pick is unobservable. Correcting §4b's own overstatement:
   the trap could **not** actually trip the `bundle:check` ratchet — 25.9KB headroom vs a ~2KB
   compiler delta, and the baseline self-heals on every full build.
3–5. Still open.

**New, found by acting on the REGENERATE-NOW recommendation (§ was: dist stale, rebuild it):**
regenerating `packages/archie-viewer/dist/` from current source produced a bundle that renders
**0 gallery cards** — `recipes/smoke.mjs` FAIL — while the committed (stale) dist passes. The
staleness was *masking a regression*: bare-`fetch` defaults get object-stored by
`HttpFilesystem`/`httpJsonSource` and method-called, which browsers reject (WebIDL receiver brand
check, "Illegal invocation") and Node permits — so all 2,241 unit tests passed against a bundle no
browser could load. Root-caused, fixed (4 defaulting seams bound), red-green brand-check tests
added, `embed-smoke` CI job now builds from source and drives real Chromium.
See `.claude/rules/bound-fetch-defaults.md`. The dist regeneration is **pending** — it lands as its
own commit and only after the fixed bundle passes smoke (which it now does: 7 cards / 21 objects /
deep-zoom mounted / 0 console errors). If that commit is missing, the REGENERATE-NOW item is still
open and the CDN artifact still carries the unbound-fetch bundle.

**Post-merge (2026-07-20, after push `f784c76`):** Dependabot rescan confirms #23 #24 #37 #38 #39
#40 #10 #52 #53 **fixed**; #51 glib **dismissed** (not_used, comment cites §4c). Declaring esbuild
`^0.27.3` in packages/archie-viewer/package.json minted **#54** — the same GHSA as #25 against the
manifest, exactly as §8.2's verifier predicted ("could make that alert louder"). Dismissed
(not_used: build-API only, serve mode never invoked, Linux CI/dev) with #25 kept open as the single
tracker that 0.27.7 is in the tree; both clear when astro/vite move to ^0.28. Open count: 11 → 1.

**Post-merge (2026-07-20, after push `f784c76`):** Dependabot rescan confirms #23 #24 #37 #38 #39
#40 #10 #52 #53 **fixed**; #51 glib **dismissed** (not_used, comment cites §4c). Declaring esbuild
`^0.27.3` in packages/archie-viewer/package.json minted **#54** — the same GHSA as #25 against the
manifest, exactly as §8.2's verifier predicted ("could make that alert louder"). Dismissed
(not_used: build-API only, serve mode never invoked, Linux CI/dev) with #25 kept open as the single
tracker that 0.27.7 is in the tree; both clear when astro/vite move to ^0.28. Open count: 11 → 1.

**Post-merge (2026-07-20, after push `f784c76`):** Dependabot rescan confirms #23 #24 #37 #38 #39
#40 #10 #52 #53 **fixed**; #51 glib **dismissed** (not_used, comment cites §4c). Declaring esbuild
`^0.27.3` in packages/archie-viewer/package.json minted **#54** — the same GHSA as #25 against the
manifest, exactly as §8.2's verifier predicted ("could make that alert louder"). Dismissed
(not_used: build-API only, serve mode never invoked, Linux CI/dev) with #25 kept open as the single
tracker that 0.27.7 is in the tree; both clear when astro/vite move to ^0.28. Open count: 11 → 1.

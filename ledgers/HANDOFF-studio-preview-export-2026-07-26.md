# HANDOFF — Studio preview + deposit-copy export (2026-07-26)

Branch **`explore/studio-folder-export-settings`**, worktree `.claude/worktrees/studio-explore`.
**MERGED and PUSHED.** Branch and `main` are the same commit; tree clean.

> Correction to an earlier line here, which said `main` was unpushed and left for someone else: the
> `merge-main` lane pushed in the meantime, so every code commit below — the empty-hall fix
> (`3a3806e`), the Settings panel (`b7ba6e5`) — is on `origin/main`. Only handoff commits have ever
> trailed. The original claim was true when written and stopped being true within the hour; that is
> the tempo of this tree, and it is why nothing here should be trusted without re-checking `git
> rev-list --left-right --count main...HEAD`.

Separate from the viewer-ux lane (`ledgers/HANDOFF-viewer-ux-2026-07-26.md`) and from the root
`HANDOFF.md` (perf sweeps) — do not sweep those in.

> **`main` moved FOUR times across the two sessions** — 82 commits, 3 mid-rebase, then twice more from
> the `merge-main` lane while gates were running. Another session is actively working the same tree.
> **Rebase before starting, not after**, and re-check `git rev-list --left-right --count main...HEAD`
> after any long-running command — twice it had moved by the time a gate finished. If `main` has moved
> again, re-run the gates before trusting anything below.
>
> **On pushing from here:** the `merge-main` worktree periodically holds commits of its own that
> aren't on `origin`, so a `git push` from this worktree can publish their work as a side effect of
> publishing yours. Check `git log --oneline origin/main..main` before pushing, and prefer letting
> that lane push.

## What shipped

Two features, both driven in a real browser, not just gate-green.

- **Preview as reader** — `Publish → Preview as reader` renders the actual published tree with the
  actual reader, in-process. `publish-flows.previewTree()` (a `projectSite(false)` reuse, never
  `toZip`) → `<archie-viewer>.openLibraryFs(fs)`. No URL is minted anywhere on this path, which also
  keeps the desktop CSP's `connect-src` blob ban out of the picture.
- **A deposit copy** — `Publish → A deposit copy` writes ONE `.html` holding the viewer and the
  library. Verified from `file://` with every non-`file://` request aborted at the context level:
  origin `file://`, gallery rendered, `slugs: [deposit-copy]`, **0 network requests**.

## Gates (green at `b7ba6e5`)

render-core **1194** · archie-viewer **185** · viewer **176** · studio **942** vitest ·
studio e2e **12/12** · `tsc` 0 · svelte-check studio **1178 files 0/0**, viewer **1521 0/0** ·
`pnpm build` clean · bundle ratchets ok (eager 38.9 · total 274.9 · single-file 274.5) ·
`sync-dist:check` matches.

The bundle/build/sync figures were measured before the Settings work, which touches only
`apps/studio` — no embed source, so they carry. Everything else was re-run after it.

Run tests PER APP. `pnpm typecheck` is the real `.ts` gate. `node build.mjs --check` for the embed;
`--update` ONLY when moving the baseline deliberately.

## The four defects the rebase exposed — read before touching these files

The branch was built on a base **82 commits stale**, so everything was verified against the wrong
tree. Three of these were mine.

1. **A false claim reached shipped UI copy.** I stated the deposit copy drops NARRATIVE reading and
   put that in the Publish card. Main's embed HAS narrative (`narrative.ts`, lazily mounted from
   `element.ts` — `26c2a59`). Only **search** is genuinely absent. `Archie-2935` carries the correction.
2. **The branch silently lowered the bundle ratchet**, reinstating the exact defect `fff4aa9` removed.
   Now folded into main's `--update` gating. Measured against main's reference BEFORE moving it:
   `openLibraryFs` costs **+2.9KB gz EAGER** (36.0 → 38.9, allowed +10.0) — real, within budget, paid
   by every CDN embed host for a Studio-only door. Revisit if the eager budget tightens.
3. **`.dialog` cannot scroll** — `position: fixed`, centred by transform, no `max-height`, no
   `overflow`. Content past the viewport overflows BOTH edges unreachably. Latent since the surface
   was built; a fourth destination card crossed the threshold. Fixed generally.
4. **Studio is now the embed's THIRD consumer**, which `css-text.d.ts` said would not happen. It broke
   twice at once: svelte-check TS2307 on `virtual:archie-tokens`, and Vite dev 500ing the dynamic
   import so the preview rendered an ERROR instead of a reader. Studio now carries both the ambient
   declaration (`archie-viewer-virtual.d.ts`) and a third resolver plugin (`vite.config.ts`), all three
   reading `tokens-source.mjs`. **Rename that virtual id and THREE places change.**

## Session 2 (same day, later) — what closed

**MERGED**, and since pushed by the `merge-main` lane. `main` moved SIX times across this session;
each merge from here was a checked `--ff-only` into their worktree, never a ref rewrite under them.

Also closed:

- **The empty-hall publish defect** (`3a3806e`). A fresh profile is examples-only, so the projection
  had zero exhibits and every destination built an empty site and reported success. The chooser now
  refuses and names the way out ("Keep a copy"). Red-greened. **It exposed that `preview.spec.ts` was
  previewing an EMPTY library** — it asserted `.intro h1`, which element.ts:816 paints either way. The
  spec now forks first and asserts the card.
- **Q-3 / Q-6 gated** (`e1aa8e7`). Q-6 ACCEPTED. **Q-3 gated to REVISIT, against my recommendation** —
  sized in **Archie-babe** rather than left as a table row. Read that ticket before starting: item 3
  (a multi-file Astro tree vs a one-bundle base64 inline) may make the single-file form impossible, in
  which case re-accepting Q-3 with the measurement attached is the honest outcome.
- **Both settings "blocking" questions answered from source** (`0558dc6`) — neither needed a run, and
  one was framed backwards. `storage.estimate()` is not unavailable on desktop; `refreshQuota` just
  declines to call it, because for the CHIP the OPFS residue misleads. The residue is exactly what
  L3 wants. **L5/R6 WITHDRAWN by the user**: one default-ON emergency kill-switch is not a section.
- **Settings panel PHASE 1** (`5080f59`, `b7ba6e5`) — frame, door (the shared `HelpMenu`, so it is
  reachable from the editor AND the library home in one edit), the two labelled sections, and the
  read-only diagnostics. `bakePoolSize()` was exported from `bake-async.ts` so the readout cannot
  drift from `POOL_MAX`.

### Settings panel — phases 2 and 3, NOT built

- **Phase 2, L2/R5 — autosave cadence.** The whole cadence is ONE literal: `800` at
  `exhibit-session.svelte.ts:79`. Named choices with a floor, no off switch (Freecut's `0 = off` is
  the rejected shape). It mutates a live seam, so it wants its own tests.
- **Phase 3, L3/R3 — "Reclaim space".** Destructive; typed confirm; show the retained size via a
  DIRECT `navigator.storage.estimate()` call. Do **not** reuse `storage-quota.svelte.ts` — its `usage`
  is pinned null on desktop by design, and that design is right for the chip and wrong for this.

The panel names both as "aren't here yet" in its own copy, so the surface does not read as finished.

## Session 3 (2026-07-26, later) — the desktop build was driven for the first time

Commit `7124ded`. Read `Archie-91e7`, `Archie-ce7a`, and the corrections on `Archie-9ece`.

- **P0 fixed and gated.** `fs:allow-rename` was never granted, so every desktop write failed at its
  temp-then-rename commit point — first boot: 18 directories, 4 files, **zero bytes of content**.
  `scripts/check-tauri-capabilities.mjs` now derives the method list from the `TauriFsBridge`
  interface and fails on any ungranted method (and on any *unmapped* new one). Red-greened; wired
  into CI's `unit-scripts`; 16 unit tests.
- **`Archie-ce7a` (user-reported):** the media-folder picker uses `<input webkitdirectory>`, which
  WebKitGTK does not implement — it silently degrades to a single-FILE picker. `pickTauriFolder()`
  already exists and `folder-backend.ts:38-42` is the branching precedent; `folder-drop.ts:42-45` is
  the donor for the `webkitRelativePath` wrinkle. Not fixed.
- **Both defects sit exactly where `Archie-a09d` predicted** — native fs/dialog flows with no
  tauri-build smoke. That ticket called the gap; this session is its receipt.

### Two method traps that cost real time — do not repeat them

1. **`cargo build` bakes `devUrl`, not `frontendDist`.** Only `tauri build --debug --no-bundle`
   produces a packaged origin. Two rebuilds silently drove the **main checkout's** dev server on
   :5174 — a sibling's frontend — which is `[[viewer-e2e-shared-port]]` reached through a build flag
   instead of a reused server. **Confirm the origin before trusting any desktop result:**
   `ls ~/.local/share/digital.compost.archie/localstorage` must show `tauri_localhost_0.*`, never
   `http_localhost_5174.*`. Everything measured on the wrong origin was re-measured or withdrawn.
2. **A blank screenshot is a capture artifact, not a blank app.** `import` reads the X window while
   WebKit composites to a GPU surface. Boot with `WEBKIT_DISABLE_COMPOSITING_MODE=1` or you will file
   a phantom bug — this nearly happened.

### `sd` writes to the MAIN checkout, not this worktree

`sd` resolved its store to `/mnt/Ghar/.../Archie/.seeds/issues.jsonl`. Every ticket written this
session (`Archie-91e7`, `Archie-ce7a`, the 9ece corrections) is an **uncommitted change in the main
checkout's working tree**, which another lane owns. `7124ded` touches no `.seeds` data, so this
branch cannot clobber them — but they need committing from there, by whoever owns that tree.

## Next actions, ranked

1. ~~**Rebase and merge — the P0 is STRANDED.**~~ **DONE 2026-07-26.** `main` is at `c420cb4`;
   the desktop build it ships can now write. Rebased clean onto `8841c1b` (no path overlap with the
   16 commits `main` had gained), gates re-run — `pnpm capabilities:check` ok, `node --test
   scripts/lib/*.test.mjs` **16/16** — then fast-forwarded. Artifact-measured in `main`'s own tree,
   not by exit code: `fs:allow-rename` present in `src-tauri/capabilities/default.json`, the gate
   runs green from there, and the `checks.yml` step is wired.

   **Two mechanics worth knowing before the next merge.** `main` is NOT in the primary checkout
   (that sits on `perf/spine-and-image-pipeline`) — it lives in the
   `.claude/worktrees/merge-main` worktree, so you cannot `git checkout main` from here and
   `git push . HEAD:main` is refused against a checked-out branch. Fast-forward *that* worktree
   instead, after confirming it is clean and at the tip. And `main` moved **10 → 14 → 16 ahead
   inside a single session** — measure the count immediately before you rebase, never from a
   number you read earlier.

   **`main` is 3 ahead of `origin/main` — the push has NOT been made.**

   The rest of the ranking, decided at the end of session 3:

   | # | action | why it sits here |
   |---|---|---|
   | 2 | fix **`Archie-ce7a`**, and finish **P2-a** inside the same drive | desktop cannot import media at all — for this tool that is the product. One packaged drive (import folder → relaunch → media survives) proves the fix *and* re-runs the author→relaunch cycle on an uncontaminated origin, which is the piece the correction downgraded. |
   | 3 | turn the desktop drive recipe into a **gate** | the systemic item, and it arguably outranks the remaining verification rows: two P0-class defects in one session were invisible to every existing gate, and `Archie-a09d` predicted exactly this hole. Recipe is mechanical — packaged build, clean profile, `WEBKIT_DISABLE_COMPOSITING_MODE=1`, **assert origin is `tauri_localhost_0`**, assert `library.json` non-empty and no 0-byte files. That last pair alone catches the rename defect on run 1. Size it under `xvfb` before committing to CI. |
   | 4 | **Flatpak / `Archie-7e2e`** — `flatpak install --user flathub org.flatpak.Builder`, build from `src-tauri/flatpak` | deliberately *after* 2, so it tests a build that can actually import. This is the variable 9ece calls catastrophic: a wrong `defaultLibraryRoot()` under the sandbox means the app refuses to boot for every existing desktop user. |
   | 5 | **P2-b**, the last ship-gating row | needs a pre-flip OPFS-canonical binary in a *scratch* worktree to author a real OPFS library, then boot current and watch the copy land with `migrated.json` written LAST and OPFS retained. |
   | 6 | the library home says **"Living in this browser"** on desktop | one line, visible, belongs in whatever desktop commit lands next. |

   The fix for 2 is scoped: `isTauri()` → `pickTauriFolder()` → walk the directory over the bridge →
   construct `File`s with `webkitRelativePath` assigned, following `folder-drop.ts:42-45` rather than
   inventing a third shape. Decide memory-on-a-large-folder **deliberately** — drop already
   materialises whole files, so parity is defensible, but say so on purpose.

2. **`Archie-9ece` — desktop verification (Critical). RUN, 2026-07-26. Found a P0 → `Archie-91e7`.**

   > **Read `Archie-91e7` before any desktop work.** The native build proved the desktop store could
   > not write ANYTHING: the capability manifest omits `fs:allow-rename`, and `TauriFilesystem`
   > commits every write with temp-then-rename. First boot produced 18 directories, 4 files, **all 0
   > bytes** — `library.json` empty, assets empty — while the app looked healthy behind a soft
   > "Retry save". Adding that one permission flipped `library.json` from 0 → 21,606 bytes and the
   > header from "Retry save" to "Saved". `fs:allow-stat` was added alongside (the bridge calls
   > `fs.stat`); it is justified by code inspection, **not** independently red-greened.
   >
   > **P2-a is PARTIAL, not a pass** (corrected later the same day — the original text here said it
   > passed). Writes are re-proven on a properly packaged binary: `library.json` 21,606 bytes, zero
   > 0-byte files. But the author→relaunch→survives *cycle* ran on `cargo build` binaries, whose
   > frontend was the **main checkout's dev server on :5174** — a sibling's code. The store path is
   > identical and the writes stand; the persistence cycle itself needs re-running packaged. Do that
   > inside the `Archie-ce7a` drive (rank 2 above). **P2-b was NOT run**: this machine's Jul-5 app-data has no OPFS library to
   > migrate (its WebKit `storage/` holds only `salt`), so the precondition does not exist. Flatpak
   > remains untested — that is still `Archie-7e2e`.
   >
   > The uncomfortable part: `defaultLibraryRoot()` resolved **correctly**. The predicted failure
   > mode was not the one that fired, and the one that fired was invisible to every headless gate
   > because `fs/tauri.test.ts` runs over a node:fs bridge with no permission system at all.

   Original framing, kept because the re-measurement below is what unblocked the run:

   An earlier revision of this list said "blocked in this environment", on the strength of one check.
   That check was of the **Flatpak** path only. Re-measured:

   | probe | result |
   |---|---|
   | `flatpak-builder` | **MISSING** |
   | `flatpak`, `cargo`, `rustc` | present |
   | `webkit2gtk-4.1`, `javascriptcoregtk-4.1` | present (pkg-config OK) |
   | `cargo check` in repo-root `src-tauri/` | **Finished `dev` profile in 32.50s** |
   | `@tauri-apps/cli` ^2.11.3 · `node_modules/.bin/tauri` | present |

   So a **native** (non-Flatpak) desktop build is buildable here, and the two ship-gating rows are
   about the storage spine under a real webview — which a native build exercises exactly as well as a
   packaged one: **P2-a** (author → relaunch → work survives) and **P2-b** (migrate a real OPFS
   library). Expect the first build to be slow (full release compile), not hard.

   What a native run does **NOT** cover: the Flatpak sandbox itself — path mapping, portals,
   `tauri-plugin-opener` survival. That is a genuinely separate variable and already has its own
   ticket, **`Archie-7e2e`**. Report the native result as a partial pass; do not close 9ece on it.

   The lesson worth carrying, since it is the second instance this week: **the blocker was recorded
   from the first probe that failed, and the probe answered a narrower question than the claim.**
   `.claude/rules/post-review-fixes-are-unreviewed.md` states the general form.
3. **`Archie-b5c2` — measure FSA folder autosave vs OPFS.** One measurement that decides web
   folder-canonical, a multi-week direction. **Genuinely blocked on a human**: needs a real
   `showDirectoryPicker` handle, which requires a user gesture Playwright cannot supply. Wants a
   5-minute manual run against `scripts/perf/fsrun.mjs`, not an agent.
4. ~~Publishing an examples-only library produces an empty site, silently.~~ **DONE** (`3a3806e`).
5. ~~Gate or delete two decision records.~~ **DONE** (`e1aa8e7`) — Q-6 ACCEPTED; Q-3 gated to
   REVISIT, sized in **Archie-babe**.
6. **Settings panel — phases 2 and 3** (phase 1 shipped; see the section above). Spec:
   `docs/superpowers/specs/2026-07-26-studio-settings-panel-design.md`. Nothing gates the plan now:
   both blocking questions are answered in the spec, and L5/R6 are withdrawn. Six decisions remain
   (L1–L4, L6, L7); L4/L6/L7 are mine and still contestable.

## STATE AT HANDOFF — everything below is MERGED AND PUSHED

`origin/main` = `main` = **`1c435ff`**, 0/0. The whole desktop chain is on the remote: the
`fs:allow-rename` P0, the folder picker, the JavaScriptCore `Object.assign` fix, the dot-path scope
fix, the scope-side gate, `scripts/desktop-smoke.sh`, and the "Living in this browser" copy fix.
Verified in `main`'s own tree before pushing, not by exit code.

**What is DONE:** ranks 1 (merge+push), 2 (`Archie-ce7a` + P2-a), and 6 (the copy) — plus three
defects that were not on any list, and a gate extension.

**What is NOT:** the desktop DRIVE gate in CI (rank 3 — `desktop-smoke.sh` now exists in-repo and
red-greens, but nothing runs it automatically and nothing drives the UI); Flatpak `Archie-7e2e`
(rank 4); P2-b (rank 5). `Archie-9ece` cannot close until 4 and 5 are done.

**One loose end, not mine:** an LSP diagnostic on `App.svelte:2535` (`FitOptions` — "no properties in
common") appeared during the rebase. It is NOT reproducible by the project's own gate — a fresh
`svelte-check` is 1183 files / 0 errors / 0 warnings, and `tsc --noEmit` is clean — and that file's
recent commits are main's, not this branch's. Treated as stale language-server cache. If it recurs
for someone else, that is a real signal and worth re-opening.

**Copy defect still open, unticketed:** `Archie-7b48`'s refusal message blames disk space for a
permission failure ("free some space" on a disk with ~1 TB free). `AddFileRefusal` classifies by
PHASE by design; whether a scope rejection should be distinguished on desktop is a product call.

## Session 4 (2026-07-26, later still) — the desktop build was DRIVEN, end to end

Commits `8a4d67c` (picker), `b5089ce` (the JSC fix). The P0 from session 3 is merged; `main` was at
`da0d467` and **4 ahead of `origin/main` — still unpushed.**

### The drive recipe finally works, and the old one was wrong

**Use Xvfb. Do not drive the app on the Wayland session.** Session 3 recorded that
`WEBKIT_DISABLE_COMPOSITING_MODE=1` "renders correctly every time". Re-measured: on this
Wayland/XWayland desktop the app window captures **blank** with the flag set and verified present in
`/proc/PID/environ`, `import -window root` is refused outright, and synthetic pointer events never
reach the app (the GTK File menu would not even open). That claim came from ONE observation on a
`cargo build` binary that was loading the main checkout's dev server — contaminated by the same
origin problem everything else was corrected for. It is withdrawn.

On a nested X server everything works — render, capture, click, type:

```
Xvfb :99 -screen 0 1600x1000x24 &
DISPLAY=:99 GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 ./src-tauri/target/debug/archie
DISPLAY=:99 import -window root shot.png     # works here, refused on Wayland
```

Two GTK-chooser details that cost a cycle each: **inline autocompletion corrupts `xdotool type`**
(`/tmp/archie-drive` became `/tmp/archie-chie-drive`) — paste via `xclip` instead; and **Enter does
not commit** the location bar, you must click `Open`.

`/tmp/archie-drive/assert-store.sh` is the assertion set (origin is `tauri_localhost_0`, no
dev-server origin, no 0-byte files, no leftover `.tmp-*`, `library.json` parses). It is the seed of
rank 3 and should move into the repo.

### What the drive proved, and what it found

- **`Archie-ce7a` is FIXED.** The native "Select Folder" dialog opens (directory mode — files greyed
  out), and the app read the fixture exactly as the unit tests predicted: *"VoynichTest · 3 images ·
  0 audio · 0 video"*, *"This will create 2 exhibits"*, title prefilled from the folder name.
  `notes.txt` and `.thumbnails/cache.jpg` were correctly excluded.
- **A second, worse defect, found only by driving: `Object.assign(file, { webkitRelativePath })`
  throws in JavaScriptCore** — `TypeError: Attempted to assign to readonly property`. WebKitGTK
  defines the property as a getter-only prototype accessor; Chromium makes it a plain own property.
  **Two of the three call sites were pre-existing** — drag-and-drop folder import and the "one
  exhibit from everything" flatten choice were both already broken on desktop. Fixed in one shared
  helper, `webkit-relative-path.ts`, using `Object.defineProperty`.
  *The lesson for this repo: jsdom AND Chromium-based Playwright both implement the permissive
  shape, so no gate we own could have caught it. Only the packaged app can.*
- **The P0 write fix re-confirmed independently** — fresh profile, packaged origin, `library.json`
  21,606 bytes, header "Saved".
- **"Living in this browser" is confirmed on desktop** (rank 6) — visible in the drive screenshots.

### FIXED same day: `Archie-7b48` — scope globs refuse dot-paths (`7cdf1fa`)

The defect described below was diagnosed and fixed. `fs.exists()` on the `.bake-schema` marker was
refused by the capability **scope**:

> forbidden path: …/assets/`.bake-schema`, maybe it is not allowed on the scope for `allow-exists`
> permission in your capability file

**Tauri matches fs scope globs with a leading-dot rule — `**` does not match a path component that
starts with a dot.** `$APPDATA/**` covers `library.json` only because `$APPDATA` expands to a
*literal* path, so the dots in `.local` are never matched by a wildcard; it is exclusively the
trailing dot-components that fall outside. Archie writes two: `.bake-schema` (`asset-store.ts:26`)
and `.archie-cache/` (`resident-store.ts:146`). Four scope entries added, commented in the manifest
as load-bearing so nobody prunes them as defensive.

**Attribution settled: NOT the picker.** The failing call is in the shared asset-persist path, so
every desktop media add — folder pick, drag-drop, single file — hit it. It predates both picker
fixes.

**P2-a is now a genuine PASS.** Verified on a packaged build with a clean profile and no probe in
the binary: *"Added 3 files to 2 exhibits"*, 3 assets + 2 markers on disk, and **both authored
exhibits survive a relaunch with media and thumbnails intact.**

**Two things this left open, neither ticketed:**
- **The copy blamed disk space for a permission failure.** `AddFileRefusal` classifies by *phase*,
  never by sniffing the error — deliberate and right in general (the header comment explains why
  sniffing cross-engine DOMExceptions is "a guess wearing the costume of a diagnosis"). Here it told
  the user to free space on a disk with ~1 TB free. Worth deciding whether a scope/permission
  rejection, which IS knowable on desktop, should be distinguished.
- ~~**The capability gate cannot see this class.**~~ **CLOSED — the gate now audits SCOPE too.**
  `check-tauri-capabilities.mjs` used to derive required PERMISSIONS from the `TauriFsBridge`
  interface and nothing else, so it would have caught the `fs:allow-rename` P0 and was structurally
  blind to this one (`fs:allow-exists` *was* granted; the PATH was refused). It now runs a second,
  independent audit: dot-segments are **derived** from the app's own `getFile`/`getDirectory` call
  sites — following one level of const indirection, which is how `.bake-schema` is written — and
  every wildcarded scope root must admit both a hidden file (`<root>/**/.*`) and a hidden directory's
  contents (`<root>/**/.*/**`). It currently finds three segments: `.archie-cache`,
  `.archie-mirror.json`, `.bake-schema`.

  Red-greened twice: at the lib level against the real manifest with the dot-globs stripped (a test
  that reproduces the shipped defect and names all four missing globs), and at the CLI level —
  stripped manifest → exit 1 with 4 MISSING lines, restored → exit 0.

  **One bug in the gate itself, worth carrying.** The first version read `$APPDATA/**/.*/**` as a
  wildcard *root* (it also ends in `/**`) and demanded `$APPDATA/**/.*/**/.*`, regressing forever. A
  root must be a **literal** prefix. It surfaced as the gate failing against a manifest that was
  already correct — the good direction for a new gate to fail in, and the reason to always run a new
  gate against known-good input before trusting a red.

  File EXTENSIONS (`.json`) and the temp-write SUFFIX (`.tmp-`) are deliberately NOT flagged: they
  are dot-strings, not leading-dot path components, and the leading-dot rule is about a component's
  first character. Pinned by a test so nobody "fixes" the derivation into noise.

Original report, kept because the contradiction is what made it findable:

### ~~NEW and UNFIXED~~: asset persist reports failure while the bytes land

Creating the exhibit produced:

> Added 0 files to 1 exhibit. Couldn't store "page-2.jpg" on this device — check the save indicator,
> and free some space. The remaining 2 files were not attempted.

Header flipped to "⚠ Retry save". **But the asset is on disk at its final name and is correct** —
`exhibits/voynichtest/assets/01KYGEMTJ9Y372J5QH39GSWM0Y-page-2.jpg`, 7159 bytes, a valid JPEG, no
0-byte files anywhere, no leftover `.tmp-*`. So the temp-then-rename fully succeeded and the job
still threw: `enqueueSave("assets:<slug>", "Media", …)` rejected, `persistAsset` returned false, and
the ingest classified it `storage` and stopped early (by design — see the `STOPPED_EARLY` comment).

Ruled out already: it is **not** `requestPersistence` (early-returns on Tauri) and **not** the
single-writer gate (that path returns false without running the job, and `library.json` writes fine
through the same queue). The `console.error("Save failed for …")` goes to the webview console, which
needs another probe build to read — that is the next step, not a guess.

**Do not attribute this to the picker fix without evidence**: the failing seam is asset persistence,
which the drag-drop path shares. It plausibly predates both fixes. It needs its own ticket.

## Artifacts

| path | what |
|---|---|
| `ledgers/EXPLORE-studio-folder-export-settings-2026-07-26.md` | the original four-question exploration (its §2 narrative claim is superseded — see defect 1) |
| `docs/superpowers/plans/2026-07-26-viewer-preview-and-single-file-export.md` | the executed plan + its Shape Changes log |
| `docs/superpowers/specs/2026-07-26-studio-settings-panel-design.md` | the settings design, unbuilt |
| `apps/studio/e2e/preview.spec.ts` | the only gate that can see prop-wiring and viewport traps |

Tickets filed/changed: **Archie-b5c2** (High), **Archie-9ece** (Critical, release-gated + cut to two
rows), **Archie-2935** (Low, corrected), **Archie-a09d** (raised off Medium).

# HANDOFF — driving the non-map backlog (2026-07-27)

Branch **`fix/flaky-gates`**, off `main` @ `39f479a`. Goal: drive all current non-map tickets to
completion. Everything below is committed; the tree is clean apart from pre-existing artifacts that
are NOT mine (`.org.chromium.Chromium.*`, `Prior Art/`, `playwright-transform-cache-1000/`,
`archie-loop-adAtKv/`, `docs/research/next-level-2026-07-26.md`).

*(The previous handoff covered the 2026-07-24 perf sweeps. That work is all in `main` now; its
still-open follow-ups — the read-only mount port, concurrent `addFiles`, `toZip`'s 635 ms block —
live in `ledgers/PERF-image-pipeline-2026-07-24.md` and `ledgers/PERF-annotation-spine-2026-07-24.md`,
which remain the reference for them.)*

## READ THIS FIRST — two things that cost real time

**1. The live backlog was uncommitted on a stale branch.** The session started on
`perf/spine-and-image-pipeline`, which is **185 commits behind `main`** and whose only unmerged
commit was mine. The real ticket list — 13 tickets `main` had never seen, plus 14 it still listed
open — was sitting as an *unstaged modification* to `.seeds/issues.jsonl` there. It is now committed
(`f7db724`), verified a strict superset first: no main-only record, no main-only status, and all 37
content-drifted records newer on the restored side. **Check `git status` on `.seeds/` before trusting
`sd list`.**

**2. A `scripts/` file copied to `/tmp` computes `ROOT` from `$BASH_SOURCE/..`** and silently
resolves it to `/`. A 20-run "baseline" measurement came back 20/20 FAIL for that reason alone and
was nearly reported as a red-green proof. Run baseline copies from inside the repo.

## Done — 15 tickets

Each code change is red-green proven by injecting the defect and watching the gate fail.

| Ticket | Commit | Gate, and how it was proven |
|---|---|---|
| Archie-3e2d | `4cb0009` | 25 runs @ 32-way load: **21/4 fail → 25/0**. Fixed a 2nd instance of the same class found mid-fix. |
| Archie-36e6 | `a44436b` | e2e on `pnpm build` output; each half independently red. |
| Archie-5a15 | `deaadbb` | both defects reverted independently, both red. |
| Archie-d25f | `c23cf48` | demotion-loses-provenance → 3 core fail; provenance-survives-edit → studio fail. |
| Archie-15a5 | `c7b1631` | race-window probe: asserted fact ABSENT at the old wait's break point in **20/20** boots. |
| Archie-a1d4 | `708e7bb` | not-rendered → 4 fail; head-in-prior-list → 2 fail. |
| Archie-321c | `a027454` | "Anonymous" → 1 fail; CFF stub → 1 fail; tags dropped → 2 fail. **Held open** (needs Zotero). |
| Archie-6d85 | `836517c` | dispatch removed → 2 fail; base-not-restored → 2 fail. |
| Archie-0cd6 | `83141b8` | severity model + preflight walk. Two weak tests rewritten before shipping (see below). |
| Archie-8772 | `83141b8` | rights coverage as a `report`, keyed-read-only, never gates. |
| Archie-7e2e | — | answered: opener chain verified plugin → `open` crate → `xdg-open` → OpenURI portal, **inside a real GNOME 49 sandbox**. |
| Archie-e47d | — | answered by audit: all 9 anchors already intercept; no bare `target=_blank` remains. |
| Archie-b5c2 | `8c0abc3` | **premise corrected, ticket left open** — see below. |
| Archie-7e5b | `0d8f444` | S3a + S3b shipped ahead of the wiring; dedupe-removed → 1 fail, first-object-only → 1 fail. Ticket stays open for the caller. |
| Archie-ea57 | `99b937a` | axe ratchet; **it found 676 real violations on its first run** and they were fixed, not baselined. Revert one token → 8 pages red, exit 1. |
| Archie-7e5b | `0d8f444` | S3a + S3b shipped ahead of the wiring; dedupe-removed → 1 fail, first-object-only → 1 fail. Ticket stays open for the caller. |
| Archie-ea57 | `99b937a` | axe ratchet; **it found 676 real violations on its first run** and they were fixed, not baselined. Revert one token → 8 pages red, exit 1. |
| Archie-7e5b | `0d8f444` | S3a + S3b shipped ahead of the wiring; dedupe-removed → 1 fail, first-object-only → 1 fail. Ticket stays open for the caller. |
| Archie-ea57 | `99b937a` | axe ratchet; **it found 676 real violations on its first run** and they were fixed, not baselined. Revert one token → 8 pages red, exit 1. |

### Three things I would not want lost

1. **Archie-15a5's original flake did not reproduce.** The old script also passed 20/20 — on a
   32-core box `sleep 2` still covers WebKit's flush. The race-window probe is what demonstrates the
   defect. Don't upgrade that to "proven red-green end to end".
2. **Archie-b5c2's premise was wrong and is now corrected** (`docs/research/freecut-unverified-claims.md`
   item 3). FSA `createWritable()` with no options starts the temp file EMPTY — there is no copy of
   the existing file, so the per-save cost is proportional to bytes WRITTEN, not to the file being
   replaced. The ticket stays OPEN: the remaining number needs a real folder handle, which needs a
   user gesture. The ticket body now says exactly how to get it.
3. **Two of my own tests could not fail and were rewritten** before shipping (0cd6): a severity
   assertion that filtered a hand-written list of codes, and a size warn that never crossed its
   threshold. Injecting the bug is what caught both.

## Gates, all green at `99b937a`

render-core **1243/1243** · studio **987/987** · viewer **190/190** · studio e2e **12/12** ·
`pnpm a11y:check` 0 violations · svelte-check 0/0 both apps · `tsc --noEmit` clean everywhere.

**The viewer e2e suite is RED on `main`, not from this work** — `selection.spec.ts:96` fails in the
full suite and passes in isolation. Verified pre-existing by running the full suite on clean `main`
in a separate worktree. Filed as **Archie-06fb**; it is the only gate on the real-pointer hit path.

Run tests PER APP (`pnpm exec vitest` inside the package). Typecheck is
`node ../../node_modules/typescript-native/bin/tsc --noEmit` (TS7); never bare `tsc`.
Viewer e2e: `pnpm run e2e -- <spec>` from `apps/viewer` (it builds first — deterministic, ~12s).
The Tauri debug binary is built (`src-tauri/target/debug/archie`), so `scripts/desktop-boot.sh` runs.

## Where to pick up

**56 non-map tickets remain open.** I sorted these wrongly mid-session — I lumped
`research` and `prototype` in with `grilling` as "needs a decision from you". That was
wrong: only `grilling` produces a decision. `research` produces FINDINGS and `prototype`
produces a SPIKE, and both are work an agent can do. The accurate sort:

| kind | count | who |
|---|---|---|
| `wayfinder:task` | 28 | mixed — see below |
| `wayfinder:grilling` | 12 | **you** — these produce decisions |
| `wayfinder:prototype` | 10 | **an agent** — these produce spikes |
| `wayfinder:research` | 5 | **an agent** — these produce findings |

Of the 28 tasks: **7 are PARKED by the user** (`ac4c`, `f1e2`, `e2db`, `b60c`, `f366`,
`96e6`, `5ae6` — "user: dropped, 2026-06-09"). Do not drive those; they were declined.
Several more are human gates (`9ece`, `a09d`, `79be`, `c74e`) or partially done by me
(`321c`, `eec7`, `cf4a`, `7e5b`).

### Genuinely implementable next, in the order I'd take them

1. **Archie-7b86 V50 — the audio waveform.** The highest-value concrete item left. The
   audio object is "860×700 of empty cream with a browser-default scrubber". Studio
   ALREADY drives wavesurfer (`AvEditor.svelte:263` — peaks cache, regions plugin), so
   there is an in-repo donor, not just a library. **The catch that makes this bigger
   than it looks:** wavesurfer is a *studio* dep, and adding a bare-name import to the
   viewer needs BOTH a direct dep in `apps/viewer/package.json` AND an
   `optimizeDeps.include` entry — `.claude/rules/viewer-optimizedeps-bare-includes.md`,
   which has bitten three times. Design note: attach WaveSurfer to the EXISTING `<audio>`
   element via its `media` option rather than letting it own playback, so the native
   controls (and their keyboard/AT behaviour) survive and there stays one clock. I
   started reading into this and deliberately did NOT begin it — adding a runtime dep
   deserves a fresh context, not the tail of a long session.
2. **Archie-7b86 V49** — the temporal map ships fully covered by the item strip. The
   ticket flags it as the same shape as `Archie-40fe`'s occlusion cluster; check whether
   it wants that reservation fix rather than a local one.
3. **Archie-7b86 V53** — enumerate the four affordances the AV reader drops against
   `Reader.svelte` before designing. The audit named the count, not the list.
4. **The 5 research tickets** (`0f72`, `5582`, `8150`, `b5c2`, `b9c4`) — findings work.
   `b5c2` is half done: its premise is corrected, only the measurement is left, and the
   ticket says exactly how to get it.
5. **The 10 prototype tickets** — spikes. `86ff` (where the tiling threshold sits) and
   `027c` (export-fidelity harness) are the most self-contained.
6. **`1244`** (visual pass over Studio chrome) and **`99db`** (onboarding prose) are low
   priority but need no decision.

### What genuinely needs you

- **`Archie-3504` — how publish learns its destination URL.** The keystone: `19c5`,
  `8d3d` and the base-path half of the preflight all sit behind it. I left that check
  unwritten rather than build against a guess.
- The other 11 `grilling` tickets.
- **Human-at-a-machine:** the screen-reader walk (`eec7`'s other half — its own text says
  this has never been done anywhere in the repo), Zotero for `321c`, a folder-picker
  gesture for `b5c2`, and the `batch:packaged-drive` group (`9ece`/`a09d`).
- **`1cf0`** (Zip64) opens with two security decisions — does `SRC_MAX_BYTES` rise, does
  the read side move. Its own text says raising a hostile-input cap is a decision, not a
  bug fix.

## Working notes carried forward

- The discipline that paid off every single time: **inject the bug and watch the test fail** before
  trusting a gate. It caught a vacuous wait in 3e2d, an off-by-one in a1d4, and an "Anonymous"
  fallback in 321c — all three of which looked correct.
- `.claude/rules/svelte-no-typecheck-net.md`'s table is real: a green suite over an artifact that
  carries nothing is this repo's most-repeated failure. Archie-36e6's gate drives the built site for
  exactly that reason, and Archie-5a15 shipped because a test asserted `typeof contentUrl ===
  "string"` — which the broken value satisfied.

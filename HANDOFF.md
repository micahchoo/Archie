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

## Done — 13 tickets

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

## Gates, all green at `8c0abc3`

render-core **1243/1243** · studio **977/977** · viewer **190/190** · studio e2e **12/12** ·
svelte-check 0/0 both apps · `tsc --noEmit` clean everywhere.

**The viewer e2e suite is RED on `main`, not from this work** — `selection.spec.ts:96` fails in the
full suite and passes in isolation. Verified pre-existing by running the full suite on clean `main`
in a separate worktree. Filed as **Archie-06fb**; it is the only gate on the real-pointer hit path.

Run tests PER APP (`pnpm exec vitest` inside the package). Typecheck is
`node ../../node_modules/typescript-native/bin/tsc --noEmit` (TS7); never bare `tsc`.
Viewer e2e: `pnpm run e2e -- <spec>` from `apps/viewer` (it builds first — deterministic, ~12s).
The Tauri debug binary is built (`src-tauri/target/debug/archie`), so `scripts/desktop-boot.sh` runs.

## Where to pick up

**57 non-map tickets remain open** (`sd list`; 9 more are maps/epics, out of scope for this goal).

What is left is NOT more of the same. The tickets closed above were the implementable tail; most of
the remainder is one of three shapes, and the shape decides who can move it:

**A. Blocked on ONE undecided question — Archie-3504, "how publish learns its destination URL."**
Several published-tree tickets sit behind it (`19c5`, `8d3d`, and the base-path half of `0cd6`'s
preflight, which I deliberately did not write for exactly this reason). Deciding 3504 unblocks the
most work per unit of your time of anything on the board. It is a `wayfinder:grilling` ticket — it
wants a decision, not code.

**B. `grilling` / `research` / `prototype` decision tickets** — `c367` (the export surface's final
option set), `ebe7` (video bake vs mediabunny), `fc75`/`7eae` (schema version in the marker), `3754`
(bulk metadata import), `33bf` (deep-link grammar), `5fb5`, `be3a`, `0f72`, `8150`, `01c9`, `69a6`,
`5582`, `039e`, `30ff`, `e09d`, `027c`. These produce a decision or a spike report; several are worth
doing as a batch in one sitting because they share a subject.

**C. Needs a human at a machine** — `9ece` + `a09d` + the belt-and-braces half of `e47d` are the
`batch:packaged-drive` group (drive the packaged/Flatpak build, fill in the verification rows).
`321c` needs Zotero. `b5c2` needs someone to pick a folder in a headed browser (~5 min; the ticket
says exactly what to run). `c74e` (prove 1,000 images end to end) and `79be`/`87ba` are human gates
by construction.

**Genuinely implementable without a decision, if you want more grinding:** `1cf0` (Zip64 — but read
its two security questions first), `7e5b` (wire a real conflict source), `eec7` / `cf4a` / `ea57`
(a11y + touch passes), `5a15`-adjacent polish. `06fb` (the red e2e I filed) is worth doing early —
it is the only gate on the real-pointer hit path and it is currently red on `main`.

## Working notes carried forward

- The discipline that paid off every single time: **inject the bug and watch the test fail** before
  trusting a gate. It caught a vacuous wait in 3e2d, an off-by-one in a1d4, and an "Anonymous"
  fallback in 321c — all three of which looked correct.
- `.claude/rules/svelte-no-typecheck-net.md`'s table is real: a green suite over an artifact that
  carries nothing is this repo's most-repeated failure. Archie-36e6's gate drives the built site for
  exactly that reason, and Archie-5a15 shipped because a test asserted `typeof contentUrl ===
  "string"` — which the broken value satisfied.

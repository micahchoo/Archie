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

## Done — 7 tickets, each red-green proven

| Ticket | Commit | Gate, and how it was proven |
|---|---|---|
| Archie-3e2d | `4cb0009` | 25 runs @ 32-way load: **21/4 fail → 25/0**. Also fixed a 2nd instance of the same class found mid-fix. |
| Archie-36e6 | `a44436b` | e2e on `pnpm build` output; each half independently red (revert Reader → 1+2 fail; revert Narrative → 3 fails). |
| Archie-5a15 | `deaadbb` | both defects reverted independently, both red. |
| Archie-d25f | `c23cf48` | demotion-loses-provenance → 3 core fail; provenance-survives-edit → studio fail. |
| Archie-15a5 | `c7b1631` | race-window probe: asserted fact ABSENT at the old wait's break point in **20/20** boots. |
| Archie-a1d4 | `708e7bb` | not-rendered → 4 fail; head-in-prior-list → 2 fail. |
| Archie-321c | `a027454` | "Anonymous" fallback → 1 fail; CFF stub → 1 fail; tags dropped → 2 fail. |

**Archie-321c is IMPLEMENTED but deliberately still OPEN.** Its gate is "save a real published page
into a real Zotero and read back item type + fields" — that needs a human with Zotero. Everything
else in it shipped. The ticket body carries an `IMPLEMENTED 2026-07-27` section saying what remains.

### One honest limit worth keeping

Archie-15a5's original end-to-end flake **did not reproduce** here: the old script also passed 20/20,
because on a 32-core box `sleep 2` still happens to cover WebKit's flush. The race-window probe is
what demonstrates the defect (it measured whether the localStorage origin file exists at the instant
the old wait breaks — absent 20/20). Don't upgrade that to "proven red-green end to end".

## Gates, all green at `8bd4162`

render-core **1224/1224** · studio **977/977** · viewer **184/184** · viewer e2e `exhibit-rights`
4/4 · svelte-check 0/0 both apps · `tsc --noEmit` clean everywhere.

Run tests PER APP (`pnpm exec vitest` inside the package). Typecheck is
`node ../../node_modules/typescript-native/bin/tsc --noEmit` (TS7); never bare `tsc`.
Viewer e2e: `pnpm run e2e -- <spec>` from `apps/viewer` (it builds first — deterministic, ~12s).
The Tauri debug binary is built (`src-tauri/target/debug/archie`), so `scripts/desktop-boot.sh` runs.

## Where to pick up

**61 non-map tickets remain open** (`sd list`; 9 more are maps/epics, out of scope for this goal).

In the order I'd take them:

1. **`batch:publish-gates` — Archie-0cd6 + Archie-8772 (+ the blocked Archie-fde8).** Deliberately
   NOT started. The batch note is explicit that these are three gates on ONE surface (the publish
   dialog) and that the warn-vs-hard-gate call must be made once, not three times. The pure half
   (a preflight walk + rights-coverage computation in render-core) is the testable part; the dialog
   is a design decision worth confirming with the user before building three panels.
2. **Archie-6d85** — port the embed's tree dispatch (`archie-viewer/src/load.ts:120-128`, already
   tested) into `apps/viewer` so `#/?src=<tree base>` works. Contained; the ticket names the donor
   lines. Note it does NOT fix a mis-based tree's 404ing images — that is the base ticket.
3. **Archie-1cf0** (Zip64) is a dependency swap with two security decisions inside it (does
   `SRC_MAX_BYTES` rise? does the read side move?). Not a grind ticket — needs a decision pass.

Many of the rest are `wayfinder:grilling` / `research` / `prototype` — decision tickets, not
implementable without a call from the user (e.g. Archie-3504 "how publish learns its destination
URL", which several published-tree tickets sit behind). 16 are blocked.

## Working notes carried forward

- The discipline that paid off every single time: **inject the bug and watch the test fail** before
  trusting a gate. It caught a vacuous wait in 3e2d, an off-by-one in a1d4, and an "Anonymous"
  fallback in 321c — all three of which looked correct.
- `.claude/rules/svelte-no-typecheck-net.md`'s table is real: a green suite over an artifact that
  carries nothing is this repo's most-repeated failure. Archie-36e6's gate drives the built site for
  exactly that reason, and Archie-5a15 shipped because a test asserted `typeof contentUrl ===
  "string"` — which the broken value satisfied.

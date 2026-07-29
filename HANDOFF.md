# HANDOFF — non-map backlog + knowledge layer (deduped 2026-07-28)

Primary checkout is branch **`fix/flaky-gates`** and it is **SHARED** — other sessions commit here,
`main` has advanced onto this branch's commits, and agent worktrees hang off the same `.git`. All
merges to `main` happen in `.claude/worktrees/merge-main` (main is checked out THERE, not here).
`main` = `origin/main` = **`dff139b`**, CI fully green, pushed (user-authorized).

*(2026-07-28 comb: this file had accreted ~8× duplicated table rows and 3× duplicated sections from
append double-writes, plus whole sections superseded by later ones. Deduped and pruned; corrections
kept in corrected form only; full history in `git log -- HANDOFF.md`.)*

## Current state

- **Both wayfinder maps (c268 published-tree, 34a2 small-archive) are CLOSED; the goal loop is
  stopped.** 16/17 + the last ticket (7e6f) landed via `feat/video-complete` @ `6f4c3cc`.
- Backlog: **36 open, 6 in progress** (`sd stats`, 2026-07-28). `sd list` silently truncates at
  `--limit 50` — reconcile against `sd stats` (rule: [[post-review-fixes-are-unreviewed]]).
- Gates at branch `99b937a`: render-core 1243, studio 987, viewer 190, studio e2e 12/12, a11y 0,
  svelte-check 0/0, tsc clean. On merged main the studio suite baseline is now **1227**.
- Run tests PER APP (`pnpm exec vitest` inside the package). Typecheck is
  `node ../../node_modules/typescript-native/bin/tsc --noEmit` (TS7); never bare `tsc`.
  Viewer e2e: `pnpm run e2e -- <spec>` from `apps/viewer` (builds first, ~12s).
  The Tauri debug binary is built, so `scripts/desktop-boot.sh` runs.

## Live items, in order of bite

1. **Archie-1244/2865's CSS is NOT merged while the tracker says closed.** Verified again
   2026-07-28: `task/1244-shadow-recal` (14 commits, tip `5b033ce`, worktree `/tmp/wt-1244-shadows`)
   is on neither main nor this branch, but the ticket-close for both is committed (`da2c28f`).
   Branch ref + objects live in the primary `.git`, so a `/tmp` wipe loses only the worktree
   registration. Needs a merge with main before landing. Details + durable lessons below.
2. **Archie-be3a's fix is ONLY on this branch** — main's `capabilities/default.json` still carries
   the cleartext `http://**` grant. Merging `fix/flaky-gates` (or cherry-picking `7da8734`) closes it.
3. **Archie-06fb** — viewer e2e RED on main: `selection.spec.ts:96` passes isolated (552 ms), times
   out in the full suite. It is the only gate on the real-pointer hit path. Prior diagnosis on the
   ticket (`53b5396`): bisection says NOT one poisoning spec; the drag delta reads `d=(0,0)`. Start
   there.
4. **Archie-eec7** — `axe-core` is declared at root `package.json:24` and wired into nothing. The
   overlay-contrast half shipped (`665d605`, found a palette collapsing to ΔE 1.3 under
   deuteranopia); the SR walk remains (needs ears). Sibling partial: **cf4a** (tap targets fixed,
   design half — long-press, popover anchoring, hover-discovery — remains).
5. **Archie-0c7f** (AV poster/duration/dims at ingest, `c592c4e`) — one step left: drive Studio e2e
   (port 5198) with a real video, assert a non-black poster.
6. **Archie-0c1d qualifies a CONTEXT rule.** §"Local view loop" says a template is not the author's
   content; the decided publish opt-in makes that a per-publish choice. Update CONTEXT when building
   it, or a later reader will "fix" it back.
7. **`scripts/seed-fixture.mjs` would not seed the 70-object corpus as of 07-27** (0/0/0, then hung
   in the dialog flow; suspects at `seed-fixture.mjs:121-140`). c74e's acceptance ran on its own
   `scripts/accept/*` harness instead, so this is still unverified — it gates `scale-check.yml`.
8. **Open user decision:** `.nojekyll` counterfactual push to the live repo was permission-refused;
   needs explicit go-ahead or a scratch repo.

**Needs a human, cannot move autonomously:** `9ece` (P0 packaged-Flatpak verification — blocks
`623e` and the whole Tauri lane), `a09d`, `79be`/`87ba` (human-gate triage), `84af` (one breakpoint
decision: rigid chips overflow at 1024px vs shrinkable chips that never fire the overflow menu; work
built + measured, WIP preserved at `ledgers/probes/2026-07-27-84af-overflow-menu-WIP.svelte.txt`),
`05e4` (palette walk).

**Standing decisions from the grilling rounds** (recorded on tickets): parked tickets whose revive
trigger hasn't fired get closed, triggers preserved; `96e6` UNPARKED, downstream of `3754`, must
share one column-mapping component; `b9c4` folded into `c74e` (V8 heap excludes decoded surfaces /
GPU textures — the very things a cache budget governs); **no lanes** — take anything, collisions
accepted, check `git log --all --not HEAD` on the target file first.

## 2026-07-27 backlog session — 24 tickets moved (16 closed)

Each code change red-green proven by injecting the defect and watching the gate fail.

| Ticket | Commit | Gate, and how it was proven |
|---|---|---|
| Archie-3e2d | `4cb0009` | 25 runs @ 32-way load: **21/4 fail → 25/0**. Fixed a 2nd instance of the same class found mid-fix. |
| Archie-36e6 | `a44436b` | e2e on `pnpm build` output; each half independently red. |
| Archie-5a15 | `deaadbb` | both defects reverted independently, both red. |
| Archie-d25f | `c23cf48` | demotion-loses-provenance → 3 core fail; provenance-survives-edit → studio fail. |
| Archie-15a5 | `c7b1631` | race-window probe: asserted fact ABSENT at the old wait's break point in **20/20** boots. |
| Archie-a1d4 | `708e7bb` | not-rendered → 4 fail; head-in-prior-list → 2 fail. |
| Archie-321c | `a027454` | "Anonymous" → 1 fail; CFF stub → 1 fail; tags dropped → 2 fail. Later closed by user decision — Zotero round-trip dropped as a gate; close reason states what is therefore unverified. |
| Archie-6d85 | `836517c` | dispatch removed → 2 fail; base-not-restored → 2 fail. |
| Archie-0cd6 | `83141b8` | severity model + preflight walk. Two weak tests rewritten before shipping (see below). |
| Archie-8772 | `83141b8` | rights coverage as a `report`, keyed-read-only, never gates. |
| Archie-7e2e | — | answered: opener chain verified plugin → `open` crate → `xdg-open` → OpenURI portal, inside a real GNOME 49 sandbox. |
| Archie-e47d | — | answered by audit: all 9 anchors already intercept; no bare `target=_blank` remains. |
| Archie-b5c2 | `8c0abc3` | premise corrected, ticket open — see below. |
| Archie-7e5b | `0d8f444` | S3a + S3b shipped ahead of the wiring; dedupe-removed → 1 fail, first-object-only → 1 fail. Open for the caller. |
| Archie-ea57 | `99b937a` | axe ratchet; **676 real violations on its first run**, fixed not baselined. Revert one token → 8 pages red, exit 1. |
| Archie-eec7 | `665d605` | partial — see live item 4. |
| Archie-cf4a | `5defa37` | partial — see live item 4. |
| Archie-7b86 | `325de74` | CLOSED — V50 waveform shipped; V49/V53 already fixed 2026-07-26, ticket body a day stale. |
| Archie-8150 | — | CLOSED — measured 0% duplication; 28% of sources ARE cross-exhibit but all remote IIIF. NO-GO with a stated flip condition. |
| Archie-5582 | — | CLOSED — tldraw export read at source; Archie's page has zero @font-face, so the font embedder is moot. |

Same session, later: `1474` narrative header (`9db0dec`, closed), `be3a` (`baa86a7`, closed — it was
the `http:default` CAPABILITY, not the CSP), `fc75` closed / real gap filed as `69f9` (since closed
too — migrate-on-read, `e0416f4`/`da5506b`; remainder Archie-5c8d also landed, `857e1fa`), `7eae`
closed superseded,
Flatpak unattended build (`scripts/build-flatpak.sh` — owns BOTH halves because the manifest
installs a prebuilt binary; verified booting under Xvfb writing `library.json` through temp→rename
inside confinement).

### Three things not to lose

1. **Archie-15a5's original flake did not reproduce** — the old script also passed 20/20 (on a
   32-core box `sleep 2` covers WebKit's flush). The race-window probe is what demonstrates the
   defect. Don't upgrade that to "proven red-green end to end".
2. **Archie-b5c2's premise was wrong and is corrected**
   (`docs/research/freecut-unverified-claims.md` item 3): FSA `createWritable()` with no options
   starts the temp file EMPTY, so per-save cost is proportional to bytes WRITTEN, not the file being
   replaced. Open: the remaining number needs a real folder handle → user gesture; the ticket says
   how.
3. **Two of my own tests could not fail and were rewritten** before shipping (0cd6). Injecting the
   bug is what caught both.

## Maps session verdicts (c268 + 34a2, closed)

- **c74e acceptance PASSED**, merged @ `14b380d` (harness-only, 21 files): pipeline survives 1,000
  images (8.52GB); web tier fits GitHub at 63% (~39min first publish, republish ~free via 53e3);
  archival does NOT (549%). Tile arithmetic exact (243,500 predicted = on disk). Findings ticketed:
  **Archie-6a99** (16.9GB peak RSS — uncapped per-exhibit fan-out in web-tier publish, P2),
  `d7a3`, `7f6d`. Ledger: `ledgers/ACCEPT-thousand-images-2026-07-27.md`.
- **7e6f finding that contradicted the brief, proven by measurement:** codecs-extra needs NO
  Flatpak manifest stanza — the GNOME 49 runtime declares the extension point itself (generated
  ld.so.conf.d); H.264 already present in the packaged app. Follow-up **Archie-e870** (P2): no video
  was ever actually encoded — jsdom mocks WebCodecs; needs one real Chromium encode.
- 7e6f tripped the studio bundle ratchet (mediabunny is a LAZY chunk, eager +14KB); accepted via
  deliberate `pnpm bundle:baseline` (`dff139b`).

## 1244/2865 details (the stranded branch)

**What 1244 did:** 5c1d's Option C, both halves — recalibrated the lift pair in
`packages/render-core/src/tokens.css` (`0 24px 48px -24px` → `0 1px 2px`; `0 40px 80px -32px` →
`0 2px 6px -1px`; alpha drops WITH the blur on purpose) + 145 lift sites across 47 files in 8
phases; 34 survive, every one an annotated keep. **5c1d's work list was wrong in both directions**
(65 → 145 real sites; and stale entries) — re-derive a prior ticket's site list, don't inherit it.

**Two hazard classes invisible to every gate** (candidates for a rule if they bite again):
1. `outline: none` + `box-shadow` is a FOCUS RING wearing an elevation token — deleting the
   declaration deletes keyboard focus, and nothing complains (3 instances).
2. A lift LAYERED with a non-elevation layer (4 instances, incl. a drag-drop indicator).
Both reduce to: **grep the DECLARATION, not the token** — svelte-check can't see CSS, Svelte hashes
scoped selectors in built output. And stripping a shadow can leave `{ }` — empty CSS is valid, so a
destructive button lost its hover feedback at 0/0 green.

**2865 (release gate, shipped):** `release-artifact.yml`, tag-triggered, red-green-green proven.
The durable diagnosis: **dist staleness is created by MERGES, not careless PRs** — both parents can
be fresh and the merge still ships stale bytes, so a per-PR gate is structurally incapable
(measured at `84bab01`; a fail-on-main gate would redden ~73% of source merges, refused at
`checks.yml:200`). Tag-time is the boundary.

## Knowledge-layer session (2026-07-28)

- **Hub scope-push symlinks WORK** (hubs arrive in context via `.claude/rules/hub-*.md`); CI doclint
  job green on GitHub runners (first run in anger).
- Sha-citation audit on main: two hub citations re-cited to cherry-picked equivalents
  (e149 → `4f7636f`, doclint → `a3fd4d8`); three branch-only closures flagged inline.
- Design §2 retirements executed on main: `docs/architecture/` removed, `.scratch/` shadow docs
  deleted, README pointers fixed. TRACKERS' 4 UNMAPPED rows resolved (Issues 14/16 →
  **Archie-d895 / Archie-59c4**, created on THIS checkout's tracker).
- **Prior-art deep pass LANDED on main** (`1e7809d`, then `1795fff`): clover/mirador/UV promoted to
  clone-verified pages. A standing correction was itself refuted — UV's suite DOES touch the network
  (jest-puppeteer, live manifests); the citation-discipline rule's catalogue row on MAIN records the
  double-refutation (this branch's copy is stale — take main's side on merge).
- **Archie-d73f filed**: check tool modes against the annotorious SVG-selector NaN round-trip
  (Ellipse/Line die in upstream serialize→parse; prerequisite for v1.1 ellipse work).
- `.seeds/issues.jsonl` here holds uncommitted edits from live sessions — whoever commits it next:
  declare the id set ([[shared-worktree-agent-collisions]]).

## Process lessons that cost real time (not yet in any rule)

- A `scripts/` file copied to `/tmp` computes `ROOT` from `$BASH_SOURCE/..` and silently resolves it
  to `/` — a 20-run "baseline" came back 20/20 FAIL for that reason alone. Run baseline copies from
  inside the repo.
- Never pipe a long run through `tail` — it buffers; you watch an empty file, then get `Terminated`.
- `timeout N` on a job whose slow half is a UI ingest kills it mid-write and the persistent OPFS
  profile does not roll back (that produced the `0/0/0` seed corpus).
- Kill stray dev servers — the seed script binds 5174 itself.
- Agent-transcript `gitBranch` metadata can be stale; trust `git -C <worktree> branch --show-current`.
- Tickets go stale fast here: three in one session had wrong premises. Read the code before trusting
  a ticket's premise.

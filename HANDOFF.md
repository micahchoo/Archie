# HANDOFF — Archie

**Updated:** 2026-07-19 (Studio UX overhaul session). **Branch:** `main` (pushed through
`b564ac2`). Trackers: seeds (`sd`) — map **Studio UX overhaul** `Archie-21b1`; sibling map
**collab-readiness** `Archie-f849` (another session; boundary: they own the merge contract,
UX map owns collab UI — see both maps' Notes).

## IN FLIGHT — UX overhaul implementation wave 2 (2026-07-19)

Decision phase DONE: all 13 decision tickets on `Archie-21b1` resolved + indexed
(navigation ADR-0024, safety-state, canvas trims, narrative locality, editor scope,
modality, details, publish, help, collab-maximal, bulk selection, library layout, chrome
prototype). Glossary: `CONTEXT.md`. Audit + corrections: `ledgers/UX-AUDIT-studio-wireframes.md`.

**Merged to main + pushed (wave 1, all gates green):** `fbf1d24` docs · `5ffe9b9`
save/safety-state · `f8fc422` nav/place-addressable · `f159b94` canvas/light-table-trims ·
`b564ac2` tutorial-deck deploy fix. Post-merge: svelte-check 0/11, 342/342 studio tests.

**Merged wave 2 so far:** `2c47bdb` library/home-layout (`Archie-606d` closed; review
merge-ready, gates 0/11 + 350 tests + build). Main also carries the sibling collab
session's merges (`016a7bf`, `71784e1` — render-core/spine, no studio overlap).

**Agents running (worktrees; ALL worktrees spawn at stale session-start HEAD — brief them
to `git reset --hard <current main sha>` first):**
- `chrome-builder` (opus) — `chrome/editor-redesign`: tickets `Archie-c7ef` + `Archie-c76d`
  (two-zone sidebar, minimizable rail, docked note editor, status strip, SafetyState mounts).

**Process per branch (user directive, updated 2026-07-19): AUTO-MERGE WHEN GREEN** —
code-review agent on completion → fix loop if needed → once review-clean, merge to main
WITHOUT asking → full gates post-merge → close tickets with implementer resolution
paragraphs → update map → push.

**Queued behind merges** (see `sd ready` as deps close): modality impl `5968` → publish
`1921` → round-trip collab `abf9`; beat links `696d`; a11y adoption `f260`; details `ebf4`;
legend split `adae`; glyphs `d7ab`; deck refresh `6595`; selection bar `3b03`; collab
identity `2bf1`; MergeReview+attribution `90f1` (also needs collab-readiness `697c` spec);
e2e `d80f` (needs Playwright gate).

Wireframes + collab wiring diagrams: tldraw board `archie-studio-wireframes`
(http://localhost:3002/?board=archie-studio-wireframes).

---

## OLDER STREAM (2026-07-05, different session) — publish-to-web BUILD

Preserved from the prior handoff; may be stale — verify against `worktree-publish-to-web`
worktree and `docs/plans/PUBLISH-TO-WEB-PLAN.md` before resuming. Waves 0–2 were nearly
done (Tasks 1–9 committed: types `106dd23`, git2 spike `eec8768`, Tauri commands
`75a5620`/`7b034fd`/`681e3f0` + review fixes `c6ba97f`, ensureRepo `70a831e`, gh_push_tree
`f72f0ba`, deployToPages `7d71882`, sign-in `a646760`). `ledgers/PROBE-publish-to-web.md`,
`DIVERGENCES.md`, `PRFAQ.md` in the tree belong to that stream.

# Notes — teaching Micah this codebase

## What this workspace is
Private developer study material about **the Archie source**. Distinct from
`.claude/skills/teach/`, which is the *user-facing* onboarding tutorial workspace shipping to
`docs/learn/`. Nothing here ships; `.teach/` is gitignored.

## Learner profile (stated 2026-07-24)
- **"Teach me as if I'm a vibecoder."** Read that as: fluent at *directing* code into existence,
  not at reciting the theory underneath it. Assume comfort with running commands, reading a diff,
  and knowing what a component is. Don't assume DAGs, CRDTs, IIIF, or W3C annotation vocabulary.
- Consequence for lesson design: **never open with the term.** Open with the problem in ordinary
  words ("two people edit the same note — who wins?"), let the reader feel the problem, *then*
  hand them the name the codebase uses for it.

## Teaching preferences (carried over from the docs-spine workspace, same reader)
- **Interactive models over prose.** A small thing you can poke and watch change beats explanation.
- **No trivia quizzes.** Retrieval practice is fine — but as a *task* ("where does this file go?"),
  never as multiple-choice recall of a definition.
- **Skimmable above all.** ~One screen per lesson. One tangible win.
- **Motivation before mechanics.** Why this exists, then how it works.
- **Grounded, never guessed.** Every claim cites a real path in this repo. If unsure, go read it.

## Rules of thumb for lessons here
- Cite `path/to/file.ts:LINE` — clickable in the terminal, and it proves the claim.
- Prefer the repo's own hard-won rules (`.claude/rules/*.md`) as lesson material: each one is a
  bug that already happened, which makes it a story rather than a lecture.
- When a lesson teaches a hazard, teach the **gate** that catches it in the same breath. A hazard
  without its check is just anxiety.

## Session log
- **2026-07-24** — Workspace created. Lesson 0001 (repo shape + the one-direction import rule).
  Mission confirmed as **judgement AND retelling** → every lesson now carries the rejected
  alternative, see [[learning-records/0001-mission-is-judgement-and-retelling.md]].
  Lesson 0002 (the annotation spine) written.

- **2026-07-24 (later)** — Two lesson menus rejected; he named his own topic (deployment/ports).
  Lesson 0003 written from it, plus `reference/ports-and-deploy.html`. See
  [[learning-records/0002-prefers-operational-questions.md]] — pitch runtime framings first.

- **2026-07-24 (later still)** — He named his own topic again: browser divergence in ingest/FSA.
  Lesson 0004 + `reference/browser-capabilities.html`. Confirms LR-0002: runtime/operational
  framings land, module internals don't. **Browser-support claims were verified against MDN, not
  recalled** — do this every time; the deps index is very-stale and parametric memory of compat
  tables is unreliable.

## Open threads (candidates for the next lesson)
- **Where state lives** — one `Filesystem` interface, five backends (`fsa`/`memory`/`zip`/`http`/
  `tauri`). Pairs well with "no server, no database" as a retelling beat.
- **The hot-path trap** — `spine/head-index.ts` and why recomputing heads per edit went quadratic.
  Best taught right after 0002, while the heads rule is fresh.
- **One image's journey** — ingest → manifest → published tree → pixels. The narrative gap flagged
  in RESOURCES.md; would earn a reference diagram.

## Glossary discipline
Spine terms (head, rev, tombstone, fast-forward) are **deliberately not yet in GLOSSARY.md** —
lesson 0002 introduced them, but the format says promote only on evidence of use. Promote them
once Micah uses one correctly unprompted.

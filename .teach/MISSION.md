# Mission: Reading and changing the Archie codebase

## Why
Two goals, confirmed 2026-07-24, and they reinforce each other.

**Judgement.** Micah ships Archie by directing agents rather than hand-writing most of it. The
bottleneck isn't typing — it's knowing where a change belongs, spotting when a diff is
structurally wrong, and being able to say "no, that state lives in the spine, not in the
component" without opening ten files first.

**Retelling.** He also wants to explain Archie to other people — what it does that other
annotation tools don't, and why each decision went the way it did. You can't direct what you
can't explain, and you can't explain what you only know the shape of.

## Success looks like
- Given a feature request, name the package and the file it belongs in, before opening anything.
- Read a diff and tell whether it respects the dependency direction (`core → mount → svelte → apps`).
- Explain the annotation spine — append-only log, version DAG, heads — in your own words, without notes.
- **Tell the story of a decision, including the alternative that lost and why** — the ADRs record
  both; a lesson that teaches only the winner leaves you unable to defend it.
- Recognise the repo's recurring hazard classes on sight (silent fallbacks, whole-log scans in hot
  paths, eager-import leaks, unbound `fetch`) and know which gate catches each.
- Run the right check for a change (`typecheck` vs `check` vs `check:svelte` vs the perf ratchets)
  without guessing.

## Constraints
- **Vibecoder voice.** Plain language first, jargon named only after the idea lands. No assumed
  CS vocabulary. Concepts get an analogy before they get a definition.
- **Short.** One screen, one win, done in a few minutes. Working memory is the budget.
- **Grounded in this repo.** Every claim points at a real file and line. No generic
  "in a typical monorepo…" — the lesson is about *this* code.
- **Show over tell.** An interactive model beats three paragraphs. Reach for prose only when a
  visual can't carry it.
- **Why before how.** Lead with the problem the code exists to solve; the mechanics follow.

## Out of scope
- Learning TypeScript, Svelte, or Astro as languages/frameworks in the abstract — only the
  slices this codebase actually leans on.
- The Tauri/Flatpak desktop packaging path, until the core map is solid.
- Anything already covered by `docs/learn/` (that's the *user's* tutorial, not the developer's).

---
scope:
  - "docs/adr/**"
  - "ledgers/**"
  - "apps/viewer/e2e/**"
  - "recipes/**"
  - ".claude/rules/**"
tags: [prior-art, research, citations, verification]
priority: high
source: hand-written
---

# Citing prior art: open the file, and grep where a thing is USED

The project instruction is to check prior art before committing to any approach and cite it for
every decision. This rule is about the failure mode that instruction has in practice, measured
repeatedly on 2026-07-26: **a citation that reads plausibly and that nobody re-opens.**

Seven bad citations were caught in a single session. None was invented — every one named a real file
in a real library, and every one was wrong about what that file did.

## The catalogue, because the shapes repeat

| the claim | what was actually there |
| --- | --- |
| "annomea proposes this gate" | it proposes no gate |
| "scrollama has a reentrancy guard" | it has none — it only ever *reads* `scrollTop`; `grep scrollIntoView src/` is empty |
| "universalviewer's suite covers this" | its suite never touches the network |
| "clover-iiif tabulates it at `:78-89`" | that range is a bullet list, not a table |
| "anvil ships no embed smoke" | it does |
| "quire solves the two-directions problem" | `canvas-panel.js:259` calls `goToFigureState` *and* `scrollToHash` straight from an IntersectionObserver callback with **no suppression** — quire *demonstrates* the hazard |
| "clover has no note-media feature" | `Item.tsx:182-184` sets `imageUri` from the annotation **body's** own id; `Image.tsx:16-19` is a clickable captioned tile, structurally Archie's own `NoteMedia` |

## Three habits

**1. Open the file before you cite it, and cite to the line.** Every wrong entry above would have
died on contact with the source. A line number is not decoration — it is the thing that makes the
claim falsifiable by the next reader.

**2. Grep where a thing is USED, not only where it is defined.** The last row took three rounds and
two people. The deciding command was `grep -n thumbnail Item.tsx` → `:52`, `:211`. It was *run*, and
its output read past, because the conclusion was already formed: `:211` is a `backgroundImage` on the
span wrapping **every** item in **every** branch, so the bug cited as evidence had nothing to do with
the image branch. The variable traced and the feature being reasoned about were two different things.

**3. A correction offered in your favour is the one you are least likely to check.** In that same
chain a reviewer handed the author a *strengthening* — "clover has no note-media feature at all",
which would have made the author's originality claim stronger. It was false, it agreed with a
conclusion the author already wanted, and it survived both of them. It died only because applying it
meant re-opening the file. **When a review hands you good news, that is the moment to open the file.**

## State an absence rather than stretching a match

A stated absence is worth more than a strained citation, and it is a real finding:

- *"Nothing in the corpus drives an AV annotation surface in a browser — `videojs-annotation` is
  jsdom unit tests, `hyperaudio-lite` ships no tests, `clover-iiif` neuters canvas in
  `setupTests.ts`. This approach is original."*
- *"No corpus system solves the two-directions problem; all three dodge it architecturally. The guard
  is original design and claims no precedent."*

Both of those are more useful to the next reader than a citation that half-fits, because they say
where to stop looking.

## Say what a citation does NOT support

The strongest form found in this session names the boundary in the same breath:

> **scrollama** supports the API choice — *use IntersectionObserver, don't hand-roll scroll math* —
> and **nothing else**. It has no two-directions problem, so it is no donor for the guard.

And narrow the claim when the evidence narrows. The clover chain ended at *"not original at the tile
level; original only in the reach"* — three rounds, each one shrinking the claim of the person who
wrote it. That is what a citation converging on the truth looks like.

## Where this belongs

The natural home for the first three habits is beside the project's prior-art instruction itself, in
`CLAUDE.md`. It lives here instead because that file is the human's, not the fleet's, to edit — and
because these paths (ADRs, ledgers, e2e comments, rules) are where citations actually land in this
repo. If the instruction ever grows a "how", fold habits 1–3 into it and cut this section.

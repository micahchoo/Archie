# Archie (interactive docs spine) Resources

The "learner" is a future Archie user; the lessons are grounded in the project's own
source of truth, not parametric guesses (per the project's "check prior art" rule).

## Knowledge

### Primary — the project itself (highest trust)
- **The Archie codebase** — `apps/studio`, `apps/viewer`, `packages/render-core`.
  Use for: real UI labels, affordances, the actual domain model (`render-core/src/model/model.ts`).
- **`CONTEXT.md`** (in git history — `git show HEAD:CONTEXT.md`) — the locked domain language,
  numbered frames, UX philosophy. Use for: definitions, motivations, the "why" of every feature.
- **ADRs / `docs/decisions/`** — decision records (ADR-0003 WADM log, ADR-0005 Sections,
  ADR-0007 Readings/Tags, ADR-0008 Studio/Viewer, ADR-0010 portable, ADR-0015 maps, ADR-0016
  emergent narrative, ADR-0017 section-as-supplementing). Use for: feature motivation in lessons.
- **`Prior Art/`** (in git history) — the survey that shaped the design. Use for: framing why
  Archie exists vs. existing tools.
- **Scout inventories** — `.claude/skills/teach/.scout/studio-journey.md` (the full author
  journey, per-feature, with file:line refs) and `.scout/domain-and-viewer.md` (glossary +
  viewer flow + motivations). These are the digested authoring inputs for future lessons.

### Background — the standards (deeper "why it interoperates")
- [IIIF Presentation API 3.0](https://iiif.io/api/presentation/3.0/) — Collection/Manifest/Canvas/Range.
  Use for: explaining the IIIF projection in the glossary, not required to use Archie.
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) — the Note serialization.
  Use for: the WADM glossary entry and the append-only/merge motivation.

## Wisdom (Communities)
- [IIIF Community](https://iiif.io/community/) (Slack + calls) — the standard's practitioners.
  Use for: validating that Archie's IIIF projection reads correctly in other viewers.
- [Recogito / Annotorious](https://github.com/recogito) discussions — the annotation layer Archie
  builds on. Use for: deep-zoom annotation behavior questions.

*No community preference stated by the user yet — revisit once the author lessons are complete.*

## Gaps
- No screenshots/recordings of the live Studio UI yet — lessons describe affordances from code.
  A future pass could capture real screenshots (via the `run` skill + lightpanda) to embed.
- Viewer/reader-side lessons not yet scoped (out of scope for the author-first journey).

# Archie codebase resources

The highest-trust source for this mission is **the repo itself** — it is the thing being
learned, and it is unusually well documented. External specs matter only where Archie
implements them.

## Knowledge — in-repo (primary)

- [`README.md`](../README.md) — the architecture diagram, the workspace table, and the
  "Where to start in the code" list. Use for: the top-level map, the public story of what
  Archie is.
- [`CONTEXT.md`](../CONTEXT.md) — project context and current state. Use for: what's true
  *now* versus what the README promises.
- [`docs/adr/`](../docs/adr/) — 0001–0017+, the decisions with their reasoning intact.
  Use for: "why is it built this way" on any structural question. ADR-0002 (monorepo /
  three-layer split), ADR-0003 (annotation spine), ADR-0015 (map medium), ADR-0019 (embed
  element) are the load-bearing four.
- [`docs/decisions/`](../docs/decisions/) — Q-N decision records, finer-grained than ADRs.
- [`hubs/`](../hubs/) — question-named territory maps (maintained; replaced the retired
  `docs/architecture/` snapshot, which was a 2026-05-25 tool dump — retrievable from git history).
- [`.claude/rules/*.md`](../.claude/rules/) — **the best material in the repo for this mission.**
  Each file is a bug that actually shipped, written up with the mechanism and the gate that now
  catches it. Use for: hazard-class lessons.
- [`ledgers/`](../ledgers/) — investigation ledgers (perf sweeps, Tauri exploration). Use for:
  how a measurement was actually taken, and what the wrong first conclusion was.
- [`packages/render-core/src/spine/MERGE-CONTRACT.md`](../packages/render-core/src/spine/MERGE-CONTRACT.md)
  — the merge rules, stated as a contract. Use for: anything about concurrent edits.
- [`ISSUES.md`](../ISSUES.md) / [`HANDOFF.md`](../HANDOFF.md) — open work and in-flight state.

## Knowledge — external specs Archie implements

- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) — the shape every
  note in Archie takes. Use for: understanding `packages/render-core/src/wadm/types.ts` and why
  its fields are named what they're named.
- [IIIF Presentation API 3.0](https://iiif.io/api/presentation/3.0/) — the manifest format
  publishing projects to. Use for: `packages/render-core/src/iiif/`.
- [OpenSeadragon docs](https://openseadragon.github.io/) — the deep-zoom viewer wrapped by
  `@render/mount`. Use for: tile sources, viewport coordinates.
- [Svelte 5 docs](https://svelte.dev/docs/svelte/what-are-runes) — runes (`$state`, `$derived`,
  `$effect`) specifically. Use for: reading any `.svelte` file here; the reactivity model is the
  one thing you can't infer from the code.

## Wisdom (communities)

Not yet established for this mission. Archie is a solo project, so the useful communities are
the upstream ones: [IIIF Slack](https://iiif.io/community/) for the standards side,
[Svelte Discord](https://svelte.dev/chat) for runes questions. Ask before adding more — the
learner hasn't expressed an interest in joining any.

## Gaps

- No single doc explains the **runtime data flow** end-to-end (user drags an image →
  bytes on disk → manifest → published tree → viewer render). The pieces exist across
  `ingest-flows.ts`, `publish/site.ts`, and `published.ts`; the connecting narrative is
  missing. Candidate for an early lesson + a reference diagram.
- `mcp__context__get_docs` has indexed copies of most deps (see
  [`.claude/rules/deps-index.md`](../.claude/rules/deps-index.md)) but most are marked
  **very-stale**. Refresh before relying on one for a load-bearing API claim.

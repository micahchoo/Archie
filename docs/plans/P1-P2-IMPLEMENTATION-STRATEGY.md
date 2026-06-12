# Implementation strategy — P-1 emitter + P-2 readings rail

*Compiled 2026-06-11 from the grilled corpus: ADR-0014, archie-linkability Q-2, archie-ux Q-2,
docs/decisions/PROPOSALS.md (Q-by-Q trail), CONTEXT.md §"Membership vs display exclusivity" +
§"Durable ref vs interactive ref". This is the meta-level (ordering, classification, execution
system, first move) — each phase gets its own detailed plan when it starts. Tracker: Archie-113b
(rail); the emitter rides the site.ts cleanup (Archie-fe6c/2478 family).*

## Ordering principles (derived, not invented)

1. **Sources before projections** (the through-line table). The emitter is a projection of the
   heads; the rail is a projection of reading state. So: site.ts becomes composable BEFORE the
   emitter lands on it (ADR-0014: "with the cleanup, not on top"); the visible/active state model
   lands BEFORE the rail chrome that projects it.
2. **Frozen contracts first.** The durable-ref anchor grammar freezes the day a citation
   circulates (ADR-0014's hard-to-reverse core). Its test corpus is written before any emitter
   code exists — the contract precedes the implementation.
3. **Specifiable before invented.** Emitter + state model + style function are binary-testable;
   the rail chrome is invented UI (human gate). Ship the testable substrate so the invention is a
   thin, replaceable layer on top.
4. **Tracks are independent.** A (emitter) and B (rail) share no files and no state — they may
   run as parallel waves throughout.

## Track A — the self-describing artifact (P-1 / ADR-0014)

### A1 — site.ts decomposition (the hotspot cleanup)
**Builds:** `publish/site.ts` (334 LOC, #1 anti-pattern hotspot) split into composable steps —
heads-pages / manifests / history-sidecar / assets / (slot for) html — one orchestrator.
**Validates:** the publish pipeline is extendable without growing the hotspot; all 460 core tests
stay green (pure restructure, zero output change — pin with a before/after tree-equality test).
**Does NOT validate:** any new output.
**Boundary:** ends when `publishLibrary`'s output is byte-identical and the orchestrator calls
named steps.

### A2 — emitter core, corpus-first
**Builds:** `publish/html.ts`: `emitStaticPages(library, headsByExhibit, opts)` →
`index.html`, `{slug}/index.html`, `sitemap.txt` into the same Filesystem. Default body renderer
= HTML-escape. Anchor grammar `note-<logicalId>`.
**Validates:** the frozen contract — file set, anchor ids present for EVERY head (all readings,
full projection), credit (`requiredStatement`) rendered, escape-by-default safety (a body of
`<script>` arrives entity-escaped), sitemap lists exactly the emitted pages, idempotence
(re-emit = identical bytes).
**Does NOT validate:** markdown rendering, link resolution, visual anything.
**Boundary:** corpus green with the ESCAPE renderer only.

### A3 — pipeline injection + link resolution
**Builds:** `PublishOptions.renderBody?: (md: string) => string`; Studio injects the existing
`render-svelte` sanitize pipeline (the SAME function the live Viewer uses — Q3's no-drift
invariant); `gen-published.mts` passes nothing (escape fallback). `archie:` refs resolve to
target title + interactive viewer URL; broken refs degrade to plain text and join the existing
`brokenLinks` advisory.
**Validates:** policy reuse (one sanitizer, two surfaces) and ref degradation parity with the
live publish path.
**Does NOT validate:** how it looks in a browser.
**Boundary:** injected-renderer corpus green; advisory counts match the JSON publish path.

### A4 — archive-truth verification (browser, JS OFF)
**Builds:** `scripts/verify-static-pages.mjs` (the marginalia-harness pattern): publish a real
library locally, load `{slug}/index.html` with **JavaScript disabled**, assert note words +
anchors resolve + the viewer link is present. Screenshot to docs/screenshots/auto/.
**Validates:** the actual archival claim — words without JS.
**Does NOT validate:** Wayback's own behaviour (out of our control; sampled manually post-deploy).

## Track B — the readings rail (P-2 / archie-ux Q-2)

### B1 — the reading-state model (visible set + active radio)
**Builds:** `reading-state.svelte.ts` (Studio): `visible: Set<readingId|"base">`,
`active: readingId | "base"`, derived `comparing = visible.size ≥ 2`; transition rules
(hide-the-active ≠ change-active; deleting a reading falls back to base; etc.). Migrates every
`readingFilter` consumer (notes/annotations deriveds, onCreate default, margin scoping).
**Validates:** the visible/active split holds under transitions; margin + canvas read ONE
projection.
**Does NOT validate:** any chrome.
**Open-with-default (cheap to reverse, decide at decomposer):** base is a toggleable row,
default ON. Display-only; does not reopen Q5/Q6.
**Boundary:** old dropdown still drives the new store (adapter), all studio tests green.

### B2 — comparing style function
**Builds:** extract `markerStyleOf` body to a pure `readingMarkerStyle(colour, emphasis,
{comparing, soloed})` (render-core or render-svelte): comparing → fill 0 / stroke = identity;
soloed → fill restored. Headless corpus.
**Validates:** outline-only honesty (no two-reading blend can exist).
**Does NOT validate:** legibility on real images (that's B4's eyes).

### B3 — rail chrome (INVENTED — human gate)
**Builds:** `ReadingsRail.svelte`: per-row swatch / name / count / visibility toggle / pen-radio;
one "manage…" → ReadingsModal; `readingFilter` dropdown RETIRED. Cites the design system
(tokens.css, the curator's-study idiom — same accent-stripe family as ReadingLegend).
**Validates (human):** the comprehension question, precisely: *does an author understand that the
pen marks where new notes go, independent of what's visible?* Failure looks like: drawing while
comparing and being surprised by the note's reading. Test on the plural-Voynich fixture.
**Does NOT validate:** Viewer behaviour (unchanged in v1 — assert it: legend still radio).

### B4 — solo-on-hover + browser verification
**Builds:** hover a rail row → that reading soloed (B2 flag); playwright harness asserting:
toggle two readings → marks outline-only; hover → one fill returns; draw while comparing → note
files into the PEN reading; margin cards scope with visibility; Viewer legend untouched.
**Validates:** the whole composed loop in a real browser.

## Reducibility classification

| Work | Kind | Terminus |
|---|---|---|
| A1 site.ts split | Adopted (restructure, output-pinned) | mechanical after decomposer |
| A2 emitter | Greenfield-specifiable | mechanical AFTER corpus |
| A3 injection + refs | Greenfield-specifiable | mechanical AFTER corpus |
| A4 / B4 harnesses | Specifiable (assertions enumerable) | mechanical; human reads screenshots |
| B1 state model | Greenfield-specifiable | mechanical AFTER corpus |
| B2 style function | Greenfield-specifiable | mechanical AFTER corpus |
| B3 rail chrome | **Invented** | **human gate** (comprehension question above) |

## Deceptively-simple items (corpus before a small model touches them)

- **Anchor grammar** — looks like one template string; it is a frozen public contract. Corpus
  pins: id charset (logicalIds are ULID-safe — assert it), uniqueness across readings,
  idempotence, presence-for-every-head.
- **`readingFilter` migration** — looks like a rename; it is a semantic split with ~6 consumers
  ("all"/"base" map onto set-states; onCreate's default moves from filter to pen). One corpus
  test per consumer behaviour BEFORE the store swap.
- **`archie:` refs in static HTML** — looks like a link rewrite; inherits the whole
  broken-link degradation contract. Reuse the existing link.ts tests as the spec.
- **Escape-vs-render fallback** — looks like a default arg; it is the XSS boundary. The corpus
  must include a hostile body in BOTH renderer modes.

## Mechanical execution system

Per the established pattern: **decomposer** (strong model, once per phase — writes each leaf's
acceptance test first, citing ADR-0014 / Q-2s / this doc); **wave-builder** (groups leaves with
disjoint write-targets; A and B tracks are always wave-compatible); **executor** (small model,
one leaf, make its pre-written test green, on-block STOP); **verifier** (mid-tier at wave/phase
close: tests meaningful, seams cohere, ratchet + typecheck + 607-test suite green).

Leaf schema as standard (implements / blocked-by / donor / write-targets / change / acceptance /
on-block). B3's leaves additionally cite tokens.css + the ReadingLegend idiom — a UI leaf without
a design-system reference is under-specified.

## Enumeration strategy

Enumerable NOW: A1 (output-pin test + split), A2/A3 corpora, B1 corpus (incl. the six consumer
behaviours), B2 corpus. Discovered LATER: B3 leaves (after its design pass + human gate), A4/B4
assertion lists (at harness-writing time), anything a SNAG births. Append-mostly; the frontier is
the next wave only.

## First concrete move

**Write the emitter contract corpus, red** — `packages/render-core/src/publish/html.test.ts`
asserting the frozen grammar (file set, `note-<logicalId>` anchors for every head across all
readings, escaped hostile body, idempotence, sitemap completeness) against a not-yet-existing
`emitStaticPages`. The anchor grammar is the one thing that can never change after first contact
with the world; it goes down on paper before any code that could improvise it. A1's restructure
then proceeds knowing exactly what slot it must leave open.

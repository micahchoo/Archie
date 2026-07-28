# 12 decisions — RESOLVED 2026-07-27

All twelve are settled. The maintainer took the proposed default on every one except `babe`, which
they decided explicitly, and `c367`/`4b0a`, which turned out to have been decided already.

Each decision is now written **on its own ticket** under a `## DECIDED 2026-07-27` heading — that is
the durable record. This file is kept as the index of what was asked and how it landed.

| # | ticket | question | outcome |
|---|---|---|---|
| A1 | `3504` | How does publish learn its own URL? | **relative-first** — absolute only for `og:url`, JSON-LD `url`, IIIF ids, canonical link |
| A2 | `19c5` | `baseUrl` does two jobs | **split them** — authoring namespace for grouping, rebase to public base at publish |
| A3 | `33bf` | Should viewer links mirror Studio's? | **no, keep the hash** — ✅ closed, no work |
| A4 | `babe` | Should export ship the full Astro viewer? | **no, keep the embed** — ✅ closed, maintainer-gated |
| B1 | `c367` | The final export option set | **already decided** in `34a2` — see the ticket's "UI/UX decided (grilling 2026-07-26)" |
| B2 | `4b0a` | What's a quality tier? | **already decided** in `34a2` — tier chosen at PUBLISH, recommended at ingest |
| B3 | `ebe7` | AV posters: cheap or proper? | **canvas frame-grab now**, `mediabunny` when rotation/audio bite |
| C1 | `fc75` | Version-stamp `archie.json`? | **yes, now** — worst regret curve on the board |
| C2 | `5fb5` | How hard should import validate? | **marker + structure, not content** |
| C3 | `be3a` | Desktop CSP allows plain `http://**` | **tighten to `https:`** — maintainer-confirmed, not inferred |
| D1 | `3754` | The spreadsheet door | **build it** — columns → Dublin Core, rows → objects by filename |
| E1 | `05e4` | Palette/type/radius after the rewrite | **stays with the maintainer** — the judgment half; `1244` is the mechanical half |

## What this unblocked

`3504` was the keystone: `19c5`, `fde8`, `c85f` and `8d3d` were all waiting on it.

## One correction worth keeping

**B1 and B2 should never have been on this list.** Both were fully decided in the `Archie-34a2`
wayfinder map on 2026-07-26, with the reasoning written out on each ticket — including the very
"backwards options" observation this document presented as an open finding. I asked the maintainer to
re-decide two settled questions because I compiled the list from the tickets' `## Question` headings
without checking whether a later `## UI/UX decided` section answered them.

The habit that prevents it: **before escalating a question, grep the ticket for a decision section**,
and grep the maps for the ticket id. `34a2` cites both by id (`[Archie-4b0a]`, `[Archie-c367]`), so
one `grep -rn 4b0a` over the map bodies would have caught it. Same shape as the prior-art rule —
a claim about what a document says, made without re-opening the document.

## E1 is the only thing still with you

`05e4` needs your eye on palette, typography and radius after the rewrite. The mechanical selector
sweep is split off as `1244` and needs nothing from you.

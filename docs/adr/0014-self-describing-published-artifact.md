# ADR-0014 — The published artifact is self-describing: static HTML + per-note anchors

**Status:** accepted (2026-06-11, P-1 grill — user-gated; archie-linkability Q-2)

## Context

The annotation spine's stated driver is scholarly citation integrity (ADR-0003), but published
exhibits were client-rendered behind hash routes — invisible to crawlers and the Wayback Machine.
Exhibit-level og/JSON-LD/sitemap existed ONLY as static pages for the bundled demos (canonical
deploy); `publishLibrary` emitted zero HTML, so a user-published repo had no human-readable
surface at all — not even a landing page. §220 rejected SSG at the *Viewer's build time* (authored
slugs unknown then); that rejection does not apply at *publish* time, where slugs are known.

## Decision

`publishLibrary` additionally emits, as a pure idempotent projection of the log (the same spine
row as the heads compiler):

- `index.html` — library landing: title, `requiredStatement` credit, summary, exhibit links.
- `{slug}/index.html` — per exhibit: title, credit, summary, and the **full heads projection's
  note texts** (all readings), each as `<article id="note-<logicalId>">`.
- `sitemap.txt` — the static URLs.

This mints the **durable ref** — `{slug}/index.html#note-<logicalId>` — beside the existing
**interactive ref** (viewer deep-link); both derive from the same logicalId. Note bodies render
through the SAME snarkdown+DOMPurify pipeline the live Viewer uses, injected into the core
emitter (`renderBody`); non-DOM contexts fall back to escape-only. CONTEXT §232's sanitization
gate is satisfied by reuse — static and live policy are one function and cannot drift.

## Consequences

- Archives capture the scholarly words; citations survive the death of JS, the shell, or the host
  styling. Once durable refs circulate, the anchor grammar is effectively frozen — this is the
  hard-to-reverse part and why this is an ADR.
- `user.github.io/repo/` gains a human landing (was: bare JSON).
- The published tree now contains presentation. Accepted: it is an archival/citation surface,
  not a second exhibit UI; the page links out to the canonical Viewer for the experience.
- Hash routing is NOT relitigated (zero per-host config remains load-bearing).
- Weight lands on `publish/site.ts` (the #1 hotspot) — the emitter must arrive with that
  module's cleanup, not on top of it.

## Alternatives rejected

- Per-note HTML pages (file explosion; anchors give per-note addressability at the cost of an id).
- noscript blocks on canonical pages only (covers demos, not user publishes — the actual mission).
- On-demand prerender via the canonical instance (requires a server; the no-server lock kills it).
- Escape-only bodies (recommended, overridden by user): rejected in favour of pipeline-reuse
  rendering, which carries no new sanitization surface.

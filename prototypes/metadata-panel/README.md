# Metadata panel — reader-facing placement prototype (Archie-0ba5)

**Throwaway.** Self-contained HTML, no build step — open `index.html` with `file://`
(folio thumbnails load from the Yale IIIF service; offline you get parchment placeholders).
Not production code; it exists to be reacted to.

## The question

Where does metadata live in the published reader experience, and how do long/repeated
values render? Two placements, switchable with the pill at the bottom of the screen:

- **A · Object panel** — the object focus view (Reader echo). A collapsible "Details"
  slip in the paper sidebar, slotted between the rights credit row and the notes list —
  i.e. exactly where rights/attribution show today.
- **B · Exhibit header** — the exhibit overview (ObjectGrid echo). Exhibit-level
  metadata as one quiet inline run under the title/summary; object metadata on demand
  via a "Details" link on each card, opening a centred sheet (ReadingSheet idiom).

Both variants render the same stress set: the object default six (creator, date,
subject, type, identifier, source), a repeated property (two creators), a ~350-char
provenance value, a relabeled field ("Archive" over source), and a verbatim imported
pair ("Shelfmark: MS 408"). Native rights (attribution + license) sit adjacent in both
but are never rows of the metadata list.

## Decisions baked in (react to these)

- **Repeats: one row, stacked values.** One "Creator" label, two values stacked under
  it — the IIIF `metadata` shape is literally label → list-of-values, and repeated
  labels read as a data bug in a finding aid. (Alternative shown nowhere: repeated rows.)
- **Long values: 3-line clamp + "Show more" text-link.** Same clamp count as the note
  cards (`line-clamp: 3`, system.md craft note), same `.text-link` amber affordance.
- **Relabel and verbatim imports render indistinguishably** from default fields — a
  reader shouldn't know or care which label was authored, remapped, or imported.
- **Rights ≠ metadata, shown by *form*, not by a caption.** The credit keeps the shipped
  Credit.svelte voice (0.72rem tracked line + ⓘ disclosure); the slip speaks the
  ⓘ-panel's key/value voice (0.62rem tracked uppercase keys, hanging label column).
  In the B sheet the credit is a bordered foot line with a license chip — inside the
  surface, outside the list.

## Prior art consulted

- **Credit.svelte** (`apps/viewer/src/components/Credit.svelte`) — the shipped rights
  idiom (quiet credit line + ⓘ panel with k/v pairs). The slip's key/value typography
  is lifted from its `.panel .k/.v` styles so metadata extends an existing voice.
- **IIIF Presentation API 3.0** — `metadata` (label/value pairs, multi-valued) is a
  separate typed thing from `requiredStatement` + `rights`; viewers MUST display the
  latter. That spec seam is exactly the "native slots adjacent, not in the list" rule.
- **Universal Viewer / Mirador** — metadata pairs live in a drawer/panel beside the
  canvas; attribution is pinned separately (UV's bottom-left attribution). Variant A
  is this shape on Archie's paper sidebar.
- **Quire** (Getty, in `Annotators/Image/quire`) — exhibit-level front matter up top,
  per-object metadata tables on demand at the figure. Variant B is this shape.
- **Tropy** (in `Annotators/Image/tropy`) — template-driven label:value metadata panel
  in a side pane; repeated fields render one label with stacked values.
- **prototypes/marginalia-presentation** — repo precedent for the throwaway static
  prototype form (self-contained HTML, README stating the question + decisions).

Seed data mirrors `apps/viewer/fixtures/voynich.ts` (folio labels, Yale IIIF image ids,
the Beinecke requiredStatement). Visual system is the live Verdant Clearing tokens
(`apps/viewer/src/tokens.css` + `atmosphere.css`), token subset ported into
`styles.css`; custom fonts (FOP VHS / LARAZ) fall back to system stacks.

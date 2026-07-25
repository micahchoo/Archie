# UX audit — the Viewer (read surface), by reader-journey vertical

Roll-up index for the **Viewer UX audit** map (`Archie-c97e`). The Studio audit
(`UX-AUDIT-studio-wireframes.md`, findings W1–W25) is this document's sibling and model; nothing
here restates it.

## Why this exists

The Studio audit never looked at the read surface — `grep -ain viewer` over it returns zero hits.
Every decision on the Studio UX overhaul map was therefore reasoned about authoring affordances
only, and `Archie-7aef` closed by declaring the viewer out of scope for that map rather than
propagating decisions to a surface nobody had examined. This is that examination.

## How findings are produced

Drive the **running** app in a real browser, then judge what the drive shows. Not markup-reading:
the four consumers drift silently — the embed's markup was *ported, not imported*
(`packages/archie-viewer/src/element.ts:9-10`) — and only a drive catches it.

**The judging standard is `docs/GOAL.md`, not this map's to invent.** The reader is *a first-time
visitor opening a published Archie exhibit* (`:11-13`). There are no users, so evidence is an agent
driving a real browser producing numbers (`:15-18`). Priorities rank **Look > Feel > Performance >
Features** (`:20-24`).

Each finding names the **surface**, the **weakness**, and the **principle** it strains — the W-finding
shape.

## The four consumers, and how to drive each

| Consumer | How to reach it |
| --- | --- |
| `apps/viewer`, hosted | `pnpm dev` (see the `run-app` skill), then `http://localhost:5173/viewer/` — never 4321 directly |
| `apps/viewer`, portable | same shell → **Open another library** → the drop screen → `setInputFiles` a `.archie.zip` |
| `packages/archie-viewer` (embed) | serve the repo's parent over a spare port, load a host page that scripts `/Archie/dist/archie-viewer.js`, set `src=` to a served `.archie.zip` **or the published tree** (`/Archie/apps/viewer/public/published/`). Careful with the shipped recipes: the **numbered** ones (`01`, `02`, `03`, `04`, `05`, `08`, `example`) script a **jsDelivr CDN** build (`@v1.1`), so driving them audits a release rather than the working tree — but `recipes/try.html:34` scripts the **local** `/dist/archie-viewer.js` and is safe (its jsDelivr line at `:92-95` is inside an HTML comment). Corrected 2026-07-25; the earlier blanket warning here was overbroad |
| `packages/render-mount` | has no surface of its own; audit it where it manifests, through the embed's DOM-SVG overlay |

A test library with two exhibits lives at
`/mnt/Ghar/2TA/DevStuff/Annotators/Image/archie-library.archie.zip` (real `archie.json` marker,
`generator: archie`).

**Exclude the Astro dev toolbar from every DOM query.** It injects "Inspect", "Audit", "Report a
Bug" (→ `withastro/astro` issues) into the page and reads exactly like app chrome. Filter with
`e.closest('astro-dev-toolbar')` or you will report dev-only affordances as shipped ones.

## Findings by vertical

| Vertical | Range | File | Ticket |
| --- | --- | --- | --- |
| 1 — Arrival | V1–V19 | [arrival](UX-AUDIT-viewer-arrival.md) | `Archie-0cf5` ✅ |
| 2 — Browsing an exhibit | V20–V31 | [browse](UX-AUDIT-viewer-browse.md) | `Archie-57dc` ✅ |
| 3 — Reading an object | V40–V56 | [read-object](UX-AUDIT-viewer-read-object.md) | `Archie-c743` ✅ |
| 4 — The note | V60–V71 | [note](UX-AUDIT-viewer-note.md) | `Archie-0f44` ✅ |
| 5 — The narrative | V80–V91 | [narrative](UX-AUDIT-viewer-narrative.md) | `Archie-d143` ✅ |
| 6 — Leaving with something | V100–V110 | [leaving](UX-AUDIT-viewer-leaving.md) | `Archie-18d0` ✅ |

One file per vertical so the five parallel sessions don't collide; this index is the only shared
write — append one row, nothing else.

## Standing corrections

Carried forward so no vertical re-derives them:

- The on-canvas marker's colour-only coding **is** a real WCAG 1.4.1 gap
  (`docs/research/a11y-interactions.md:97-133`) — but it lives in shared code,
  `packages/render-core/src/query/marker-style.ts` `readingMarkerStyle`, called by both
  `apps/studio/src/App.svelte:1482` and `apps/viewer/src/components/ExhibitView.svelte:277`. It is
  not a viewer-parity question; fixing it lands on both apps at once.
- `ReadingLegend`'s swatch+name pairing **already satisfies** 1.4.1 (`a11y-interactions.md:102-104`),
  and `:128-129` says explicitly: don't touch it.
- The embed overlay's keyboard/AT dead end is **closed** (`Archie-9413`, merged `4178a7b`);
  `read-overlay.ts:184-191` sets `role`, `aria-label`, `tabindex="0"` and a keydown handler.
- `ledgers/TEND-EXPLORE-viewer-2026-07-20.md` already holds evidence-backed findings (I-V1 route-set
  disagreement + sitemap 404s, I-V2 corrupt deployment reads as "check your connection", I-V3
  untested modal focus-trap). Cite and extend; don't rediscover.

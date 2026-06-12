# Decision proposals — PENDING USER GATE (not minted Q-Ns)

*Drafted 2026-06-11 from the honest-map pass. Each touches a locked frame or a user-gated locked
decision, so neither is minted via `decision-record.sh` — approve/reject via `/triage` (each has a
seeds issue labelled `decision,needs-triage`). On approval, mint the Q-N and move the record into
its scope file; on rejection, close the seeds issue with the reasoning and delete the section here.*

---

## P-1 — Archivability of published exhibits vs hash routing

**Scope:** archie-linkability. **Tension:** the stated driver for the annotation spine is
*scholarly citation integrity* (ADR-0003, CONTEXT §88), but published exhibits are client-rendered
behind `#/`-fragment routes (resolved 2026-05-26, CONTEXT §222) — invisible to crawlers and to the
Wayback Machine. A citation that can't be archived is a weaker citation.

**Options:**
- **A. Accept, name the cost (cheapest).** Keep hash routing (zero per-host config is load-bearing
  for the zip-primitive). Mitigate: publish step emits a static `sitemap.txt` + per-exhibit
  `<noscript>` stub pages carrying title/credit/note TEXT (a pure projection of the heads pages —
  fits the spine), so archives capture the scholarly content even though the deep-zoom UI needs JS.
- **B. Pre-rendered per-note citation pages.** The history sidecar already mints per-note URLs
  (`annotations/history/{logicalId}.json`); add a tiny static HTML projection per note (the
  citation-dereference target becomes human-readable AND archive-readable). Bigger publish surface.
- **C. Status quo, silent.** Rejected by the "every cut is explicit" rule — this doc exists so the
  cost is at least named.

**Recommendation:** A now (one projection, ~small), B as the v1.1 citation story. Neither
relitigates hash routing itself.

**GRILLED 2026-06-11 — resolution in progress (user-gated answers):**
- **Q1 RESOLVED (user: option a′):** the archivability unit is the PUBLISHED ARTIFACT, not the
  canonical instance's pages. Code facts that forced the reframe: exhibit-level og/JSON-LD/sitemap
  already exist but ONLY as static `.astro` pages for the bundled demos; `publishLibrary` emits
  ZERO HTML, so a user-published repo has no page to put a noscript block in — and no human
  landing at all. P-1 therefore = `publishLibrary` emits `index.html` (library) +
  `{slug}/index.html` (per exhibit): title, requiredStatement credit, summary, note TEXT from the
  heads projection, link out to the canonical Viewer; plus `sitemap.txt`. Pure idempotent
  projection — same spine row as the heads compiler. Rides with the site.ts hotspot cleanup.
- **Q2 RESOLVED (user: option a):** the citation-grade URL is a PER-NOTE ANCHOR on the exhibit
  page — `{slug}/index.html#note-<logicalId>` — not per-note pages (drafted option B collapses
  into this for the cost of an `id` attribute). Interactive ref = viewer deep-link; durable ref =
  the static anchor; both minted from the same logicalId. Consequence accepted: the page carries
  the FULL heads projection (all readings, not base-only) so reading-scoped citations resolve.
- **Q3 RESOLVED (user: option b — full markdown rendering, overriding the escape-only
  recommendation):** the static page renders note bodies through THE SAME pipeline the live
  Viewer already uses (`render-svelte` snarkdown + DOMPurify — already guarding user markdown at
  read time, so this is reuse, not a new XSS surface). Mechanics: core's emitter takes an
  injected `renderBody(md) → html` (keeps render-core DOM-free); Studio injects the sanitize
  pipeline; non-DOM contexts (gen-published.mts) fall back to escape-only. ONE consequence to
  honour: static-page and live-Viewer sanitization policy can never drift, because they are the
  same function. The §232 gate is recorded as SATISFIED-BY-REUSE, not newly opened.

---

## P-2 — Readings overlap (the rail) vs Q5 mutual exclusivity

**Scope:** archie-ux / readings. **Tension:** the readings rail (worklist 2.3, Archie-113b) wants
independent visibility toggles + solo-on-hover — i.e. *viewing* two readings at once. Q5 locks
**membership** mutual exclusivity (one Note → one Reading), and the Viewer's exclusive radio
(CONTEXT §173) was a deliberate scholarly-honesty choice ("the platform privileges no camp").

**Key observation:** membership exclusivity and *display* exclusivity are separable. A note still
belongs to exactly one reading (Q5 intact; IIIF AnnotationPage model untouched). The question is
only whether the UI may COMPOSE pages — and "where two readings disagree about the same region" is
the most scholarly moment the product can offer (it is the keystone Voynich demo: cipher vs hoax
on the SAME marks).

**Options:**
- **A. Studio rail with multi-visibility; Viewer stays exclusive (radio).** Authors compare freely
  (curation needs it); readers keep the curated exclusive experience. Zero published-format change.
- **B. A + an explicit Viewer "compare" affordance** (opt-in: a second reading toggles in with
  visual differentiation — e.g. outline-only for the second reading), arrival default still
  base-only. The v1.1 Compare layout (synced dual-canvas, CONTEXT §173) remains the full answer;
  this is the cheap in-place version the §173 lock already gestures at ("v1 = FLIP only" was a
  scoping choice, not a principle).
- **C. Keep flip-only everywhere.** The rail still improves Studio (visibility of the set, counts,
  descriptions) but loses its sharpest edge.

**Recommendation:** A immediately (no lock is touched — §173 governs the *Viewer*), B as a named
v1.1 step beside the Compare layout. Build order: rail chrome → A → gate B on the Voynich
plural-reading fixture.

**GRILLED 2026-06-11 — resolution in progress (user-gated answers):**
- **Q1 RESOLVED (user: option a):** the rail carries TWO explicit states, never conflated:
  **visibility** = a SET (per-reading toggles, any combination) and **active-for-authoring** = a
  SINGLE radio slot ("drawing files here" — one reading or base, marked by a pen icon on exactly
  one row). Drawing always files into the active row regardless of what's visible. This splits
  the two jobs today's `readingFilter` does with one value, and applies P-2's own
  membership-vs-display separation inside the Studio chrome. Rejected: active=last-toggled
  (invisible state — the 1.2 mode-error family) and visibility-only rail (leaves two competing
  Reading controls alive).
- **Q2 RESOLVED (user: option a):** comparison is its own optical regime — with 2+ readings
  visible, ALL visible marks drop to OUTLINE-ONLY (stroke colour keeps reading identity;
  crossing outlines show disagreement honestly; no fill blend can lie about identity). One
  reading visible = today's fill+stroke. Solo-on-hover = hovering a rail row restores that
  reading's fill while the rest stay outlines. Mechanically: `markerStyleOf` gains a comparing
  flag. Rejected: opacity blends (a third colour matching no legend swatch, worse on photos) and
  pattern fills (new vocabulary, untested SVG territory).
- **Q3 RESOLVED (user: option a):** **rail = use; modal = edit.** The rail is the permanent home
  (visibility set, active-pen radio, counts, solo-on-hover) with ONE "manage…" affordance opening
  the existing ReadingsModal (create/rename/recolour/describe/remove + teaching copy). The
  `readingFilter` dropdown is RETIRED — one entry point to Readings, not three. This resolves the
  three-reworks churn: the churn was management UI lacking an anchor; the rail is the anchor, the
  modal its annex. **Consequence (margin column):** visibility scopes the margin cards exactly as
  it scopes the canvas — both are projections of the same visible-notes set; a hidden reading's
  notes appear in neither.

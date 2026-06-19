# Cite + New Note — UX dogfooding audit (2026-06-18)

**Source:** dogfooding feedback — "I was confused by the Cite option, it does not really
render anything special viewer-side… I wasn't sure what to do next or what the outcome would
be. The New Note action is important, and could be more visually prominent."

**Method:** 5-agent trace workflow (`cite-newnote-ux-trace`, run `wf_7ce1a975-023`): 4 parallel
readers (authoring / viewer-render / new-note / design-intent) + 1 adversarial verifier. The
verifier independently re-read the render path **and executed the real snarkdown→DOMPurify
pipeline** to confirm behavior. All claims below carry `file:line` evidence.

---

## TL;DR

- **Cite is not merely unclear — it is partly broken.** The user's "nothing special viewer-side"
  is the correct read of three compounding, verified failures plus a missing affordance layer.
- **New Note** is the smaller, clean issue: the most frequent authoring action is styled as a
  muted, non-interactive caption with no accent — the lowest visual weight in the pane.

---

## Cite — what actually happens

Clicking **¶ Cite** (or ⌘K) opens the catalog drawer; picking a row splices a markdown link
`[label](archie:<slug>/#/a/<id>)` at the caret (`App.svelte:659`). The `archie:` ref is a
Studio-internal placeholder meant to be rewritten to a real URL **at publish time only**
(`link.ts:130`, `site.ts:89`). Design intent (verified against ADRs/CONTEXT): a cite is an
ordinary markdown link, resolved at publish — **no ADR/CONTEXT ever specified a richer viewer
rendering.** So the *concept* is intended; the *execution* fails in three places.

### Bug 1 — section-prose cites are never rewritten (HIGH)
`rewriteArchieLinks` runs only on **note bodies** (`site.ts:230,267` over `rec.body`). Section
prose flows verbatim into the manifest (`manifest.ts:162` emits `section.prose` as `summary`,
no rewrite) and the Viewer recovers it verbatim (`read.ts:65`; transform applied to objects/notes
only, never sections). → A cite inside a **Narrative section** ships a raw `archie:` ref to the
live Viewer.

### Bug 2 — DOMPurify strips the `archie:` href → dead, plain-looking text (HIGH)
`renderMarkdown = sanitizeHtml(snarkdown(md))` with `USE_PROFILES:{html:true}` (`sanitize.ts:22-24`).
**Empirically verified:** `[Plate 12](archie:bidar/#/a/abc123)` → snarkdown →
`<a href="archie:bidar/#/a/abc123">Plate 12</a>` → DOMPurify → `<a>Plate 12</a>` (href **deleted** —
`archie:` is not an allowed scheme). A resolved `https://…` URL survives intact. So any
un-rewritten ref renders as a destination-less anchor that looks like plain text. This also
**violates the project's own invariant** that broken refs degrade to honest plain text, never a
dead href (`link.ts:135-147`) — that path is bypassed for prose.

### Bug 3 — even a correctly-resolved cite doesn't deep-link in the live Viewer (HIGH)
`resolveLink` emits the **old per-exhibit-page** grammar `{base}{slug}/#/a/<id>`
(`link.ts:50-57`, pinned by `link.test.ts:25-28`). The single-shell Viewer routes on
`#/<slug>/a/<id>` (`url/route.ts:6,38-44`). So `#/a/abc123` parses as `slug="a"` and the noteId is
dropped — the deep link is dead even when the href survives.

### UX gap A — no viewer link-scent (MED)
The only viewer styling on a prose link is `color: var(--accent[-2])` (`Reader.svelte:216`,
`NarrativeReader.svelte:182`) — no underline, icon, cursor, hover-preview, or click interception.
A reader can't tell a cite from prose. **Prior art** (`Prior Art/08-linkable-navigable.md:18,28`)
names this the load-bearing "link-scent layer" (anvil's `◉/▦/§` per-kind glyphs) and records that
annomea regressed by stripping it. Surveyed, never adopted; no ADR records the omission.

### UX gap B — no author-time feedback (HIGH/MED)
`insertCite` drops raw `[label](archie:…)` markdown and moves the caret past it — **no toast, no
confirmation, no preview** (`App.svelte:658-697`), despite Studio already having an aria-live status
idiom (`App.svelte:945-951`). The palette's only explanation is a low-contrast footer hint
("the link points to the right place once you publish", `CmdK.svelte:94`). ⌘K with no note
selected is a **silent no-op** (`App.svelte:705` guard `&& sel`), though `shortcuts.ts:20`
advertises it. → "I wasn't sure what to do next or what the outcome would be."

### Suspected follow-up (LOW, unverified)
The shipped `dist/published/voynich/index.html:156` shows a cite as **raw markdown text**, hinting
the static archival page may use `escapeBody` instead of `renderMarkdown` (`static-pages.ts:78,91`)
— a possible ADR-0014 no-drift violation, separate from the live-Viewer complaint. Needs its own check.

---

## New Note — visual prominence

`New note` is a **non-interactive `<span class="nn-lead">`** (`App.svelte:1014`) styled in the
eyebrow/caption tier: 12px mono, uppercase, weight 400, `color: var(--ink-paper-muted)` ≈ 45% ink
(`App.svelte:1222`, same recipe as the global `.eyebrow`). The real actions are two neutral
card-chip buttons — `▭ Box` / `⬠ Outline` (`App.svelte:1016-1017`, `.new-note > button` at
`App.svelte:1223`) — visually identical to the secondary `+ Media` / CSV / import chips nearby.

The rationed signal-orange `--accent` ("primary action / active state only", `tokens.css:37`) is
spent entirely on the header's **"Publish & share…"** CTA (`App.svelte:1188`). Net effect: the
single loudest element on the editor screen points at *Publish*, while the **core daily authoring
action carries zero visual weight** — inverting the intended attention hierarchy.

**Treatment options (existing tokens only):**
- **Light touch** — bump `.nn-lead` from `--ink-paper-muted` → `--ink-paper-secondary` + weight 500;
  give `.new-note > button` weight 500 + an `--accent-2` (cord-blue) border so they read as actions,
  not captions. Keeps orange header-only. *Matches "a little more prominent."*
- **Single primary button** — collapse to one `+ New note` button (accent), revealing Box/Outline on
  click (progressive disclosure). Strongest; bigger change.
- **Accent the shape button** — route `--accent` + `--shadow-signal-glow` onto `▭ Box` to mirror
  Publish. Loudest; spends the rationed signal.

---

## Recommended sequencing

1. **Fix the three Cite bugs** (rewrite section prose at publish; align `resolveLink` grammar to the
   single-shell route via `routeToHash`; make un-rewritten refs degrade to honest text). These are
   correctness, not polish — without them Cite produces dead links regardless of styling.
2. **Add author-time feedback** (insert confirmation + sharper palette copy + non-silent ⌘K).
3. **Add viewer link-scent** (lift the prior-art glyph/affordance).
4. **New Note** — light-touch prominence bump (independent, low-risk, can land first).

Items 1 + 3 touch the shared `render-core` package (publish + routing + sanitize) and both apps —
a 3+ subsystem change. Sequenced and gated per CLAUDE.md.

---

## Outcome (implemented 2026-06-18)

User chose **"Fix it properly"** (Cite) + **light-touch** (New Note). All phases landed:

- **Bug 3 (grammar)** — `resolveViewerLink` (`link.ts`) projects cites via `routeToHash`
  (`{viewerBase}#/{slug}/a/{id}`), decoupled from the frozen stored `archie:` grammar
  (`resolveLink`/`encodeLinkRef` untouched). `site.ts` `rw.resolve` repointed. Fallback (no
  `viewerBase`) → durable static anchor `{base}{slug}/index.html#note-{id}`.
- **Bug 1 (section prose)** — `site.ts` rewrites `archie:` cites in section prose into the manifest
  **copy** (working model stays canonical; `loadLibrary` doesn't round-trip sections).
- **Bug 2 (dead anchors)** — `sanitize.ts` DOMPurify `afterSanitizeAttributes` hook unwraps
  href-less `<a>` to text (defense-in-depth; honors `link.ts`'s degradation invariant).
- **Author feedback** — `App.svelte` cite confirmation via the existing `importNote` aria-live idiom
  (all 3 insertion paths) + non-silent `⌘K`; `CmdK.svelte` clearer copy + orienting lead.
- **Viewer link-scent** — prose links get underline + cursor (WCAG; was colour-only); intra-Library
  cites get the `¶` seal (the author-side cite glyph), made SR-silent via `content: "¶" / ""`.
- **New Note** — `App.svelte` `.nn-lead`/`.new-note>button:not(.nn-cancel)` light-touch: readable
  lead + weighted, cord-blue-bordered shape buttons; signal-orange stays header-only.

**Verification:** render-core 554 tests + typecheck; studio 103 tests + build; viewer 15 tests +
build — all green (+7 new tests). Real example data regenerated to the corrected grammar.

**Adversarial review** (3 read-only reviewers): correctness **ship**, security **ship** (no injection
vector; slug already hardened, `routeToHash` encodes), completeness **fix-first** → a11y of the `¶`
fixed (alt-text). **Declined** (deliberate): xywh format validation — reviewer confirmed no vector and
its proposed regex would break legitimate geo/percent/AV fragments.

**Out of scope / flagged, not touched:**
- `ReadingsRail.svelte` working-tree change (empty-readings nudge, `P3:`) — not part of this task;
  left as-is.
- `gen-published.mts` publishes examples **without** `viewerBase`, so example cites use the static-
  anchor fallback (`…/index.html`). Optional follow-up: pass `viewerBase` so examples demo in-app
  viewer-route cites. (Real Studio publishes always pass it via `STATIC_PAGE_OPTS`.)
- The audit's "suspected" static-page `escapeBody` bug — **disproven**: `publish-flows` wires
  `renderBody: renderMarkdown` (`STATIC_PAGE_OPTS`); the dist artifact was stale.

---

## Follow-on, same session (2026-06-18)

### Build-time base URL (no more `archie.demo`)
`apps/viewer/src/published-base.ts` now derives both `BASE` and a new `VIEWER_BASE` from
`archie.config.json` (the ADR-0013 single source) instead of a hardcoded `https://archie.demo/`
fallback — `PUBLISH_BASE`/`PUBLIC_CANONICAL_ORIGIN` env still override per deploy. `gen-published.mts`
now passes `viewerBase: VIEWER_BASE`, so example deeplinks use the real origin and cites resolve to
in-app viewer routes (`…/viewer/#/<slug>`). Regenerated `public/published/**` (large but correct diff;
`archie.demo` fully gone). Remaining `archie.demo` strings are legit test fixtures / OPFS keys / the
Studio seed-data placeholder (never leaks to published deeplinks).

### Exhibit cite → rich preview card (dogfood: "renders as text instead of a mini version")
User chose the **rich-link card** form; scope = exhibit cites (note-cite previews deferred — need new
per-note thumbnail data).
- `citedExhibitSlug(href, knownSlugs)` (render-core `link.ts`) — detects an exhibit cite (`#/<slug>`
  *and* the static-fallback `…/<slug>/index.html`), rejecting note cites / external / unknown slugs.
- `apps/viewer/src/cite-cards.ts` `splitProseCites` — splits rendered prose around **block** exhibit
  cites (a paragraph whose only content is the cite link), leaving inline cites / note cites / external
  links as plain links. Splitting only on complete `<p>…</p>` units keeps HTML balanced.
- `ExhibitCiteCard.svelte` (cover + title + summary from the gallery index, in-app `#/<slug>` link) +
  `ProseCites.svelte` (drop-in for `{@html renderMarkdown}`); gallery flows via a Svelte **context**
  set in `ViewerShell` (`cite-context.ts`) — no prop-drilling. Wired into Reader / NarrativeReader
  (prose + note-pop) / NoteLightbox. The card opts out of the `¶` scent (`:not(.cite-card)`).
- **Behaviour (standard, Notion/Obsidian-style):** an exhibit cite **on its own line** → card; an
  **inline** mention stays a text link (a block card mid-sentence would break flow). The sample data's
  existing cite is inline, so a card shows only once a standalone-line exhibit cite exists.
- Verified: render-core 558 tests + typecheck; viewer 20 tests (5 new for the split) + build clean.

### Regression fixed: live-source exhibits showed no notes (caused by the base-URL change above)
**Symptom (dogfood):** a newly-authored exhibit appears in the Viewer gallery on reload, but opening it
shows no objects/notes.
**Cause:** the base-URL change conflated TWO distinct bases. Studio mints annotation targets against
`https://archie.demo/` (`seed-data.ts` `BASE`, via `App.svelte` `canvasIdOf`). The Viewer's live source
(`initLiveSource`) re-projects the working store with `publishLibrary`, which groups annotations by
`targetSource === ${baseUrl}{slug}/canvas/{id}`. That `baseUrl` was the published `BASE` — which I moved
from `archie.demo` → the real origin. Studio's targets (`archie.demo`) no longer matched → every live
annotation dropped. (Published exhibits were unaffected: their data + projection both use the real origin.)
**Fix:** split the two bases into separate single-sourced constants:
- `WORKING_IRI_BASE = "https://archie.demo/"` (new, render-core `working.ts`) — the internal working-store
  identifier namespace; never fetched/published. Studio `BASE` now re-exports it; `initLiveSource` projects
  with it. Writer + live reader are one constant — can't drift again.
- The published base (`published-base.ts` `BASE`/`VIEWER_BASE`) keeps the real origin for the published tree.
**Note:** this fixes the *content not loading*; the *needing-a-reload-at-all* is the live-refresh below.

### Live refresh: Viewer picks up new exhibits without a reload
The live source was a one-shot at boot (`loadGallery`/`initLiveSource` ran once; only `hashchange` was
listened for), so a newly-authored exhibit needed a reload. Added:
- `LIVE_CHANNEL = "archie:live"` (render-core `working.ts`) — shared BroadcastChannel name.
- Studio (`library-meta.svelte.ts`) posts `{type:"library-changed"}` after `addExhibit`/`removeExhibit`.
- Viewer (`ViewerShell.svelte`) `refreshLive()` re-probes the working store + reloads the gallery IN
  PLACE (route/phase untouched, open exhibit undisturbed; guarded against overlap; skips portable) on
  **tab focus** (`visibilitychange`, separate-tab flow) and on the **broadcast** (side-by-side/instant).
**Scope:** refreshes the GALLERY (new exhibits appear). Live-refreshing the CURRENTLY-open exhibit's
notes (added after opening) would need re-keying `ExhibitView` — separate, not built.

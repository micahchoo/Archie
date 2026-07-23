# TEND EXPLORE — apps/viewer (2026-07-20)

Subsystem: the Astro published-site viewer (`apps/viewer`). Read-only surface that renders the
static tree the Studio's publish step emits, plus two additive sources: an opened `.archie.zip`
(portable) and a same-origin Studio working-store projection (live). 23 Svelte islands, a
`gen-published.mts` bake pipeline, `published.ts` read layer, `og-image.ts`, and the Astro pages.

Method: tend ladder (L1 purpose · L2 behavior · L3 structure · L4 implementation), friction +
surplus per rung, ≥2-rung span per issue. Evidence is `file:line`. Prior tend backlog + decided
exclusions honored (sitemap↔routes drift is NOT in the exclusion set; OG-image *capability-reach* is
excluded but this ledger's finding is about the route-set enumeration, not og-image reach).

---

## Observation ledger (rung × friction / surplus)

### L1 — Purpose (why it exists)

**Friction.** `apps/viewer/src/pages/index.astro:4` and `[slug].astro:2-7` state the purpose as
"renders an arbitrary published Library with no per-exhibit code" / "ONE template for EVERY
per-exhibit page." The implementation contradicts it: `[slug].astro:37-85` hardcodes a 5-slug `META`
table keyed to Archie's own demo exhibits (`voynich`, `voynich-rosettes`, `voynich-reading`,
`language-atlas`, `sampler`). A cloner who drops their `.archie.zip` in `libraries/` and runs `gen`
(a supported path — `gen-published.mts:6-17`) gets their exhibits in `exhibits.json`, the gallery,
and the sitemap, but **zero** static `[slug]` pages (no per-exhibit OG/JSON-LD/crawlable URL). The
`[slug].astro:3-4` header comment even claims the route set is enumerated "via og-image's
exhibitSlugs" — it is not; it is `Object.keys(META)` (`[slug].astro:86`).

**Surplus.** The viewer models THREE data sources — hosted (baked tree), portable (`.archie.zip`),
and **live** (same-origin Studio OPFS working store projected in-memory) — the last a full
authoring-preview capability: `initLiveSource`/`mergeGalleries`/`mergeImageIndex`
(`published.ts:118-170, 249-314`), `refreshLive` + `BroadcastChannel(LIVE_CHANNEL)` +
`visibilitychange` (`ViewerShell.svelte:82-103, 154-165`), and a "Browser" gallery badge
(`Gallery.svelte:86`). The README's stated purpose (`README.md:3`, "Read-only. It renders the static
tree that the Studio's publish step emits") names only the hosted source; "What it does today"
(`README.md:19-28`) never mentions opening a zip or the live working-store preview. Concepts modeled
past the stated purpose.

### L2 — Behavior (what it does)

**Friction (Strong).** `sitemap.xml.ts:3-6` derives its route list from `exhibitSlugs` (all 7 slugs
in `public/published/exhibits.json`: `screenshots, voynich-rosettes, voynich, voynich-reading,
language-atlas, geo-map, sampler`). `[slug].astro` `getStaticPaths` builds only the 5 `META` slugs.
Result: the generated `/sitemap.xml` advertises `…/geo-map/` and `…/screenshots/` as canonical
crawlable URLs, but no static page is built for either → **404 for every crawler / share-unfurl that
follows the sitemap**. `geo-map` is a real gallery exhibit (has a published dir + manifest, appears in
the hall) yet has no shareable per-exhibit page. The build is green — Astro silently omits
un-enumerated routes — so the sitemap lies without any signal. Two independent signals: (a) sitemap
lists routes getStaticPaths omits; (b) third-party libraries get the same silent omission.

**Surplus.** `modeFromProbe` (`published.ts:189-197`) classifies a boot probe into five `ModeProbe`
kinds (`ok/absent/http/network/malformed`) and even emits a distinct `console.warn` for the
corrupt-JSON case (`published.ts:213`) — but the classifier collapses `http | network | malformed`
→ a single `"error"` mode, and `ViewerShell.svelte:122-127, 275` renders ONE message for all:
"Couldn't reach the library. Check your connection and reload." A corrupt/HTML-error-page deployment
(a real build bug reloading won't fix) is diagnosed and logged, then presented to the user as a
connection problem. Diagnosis computed richer than the behavior delivers.

### L3 — Structure (how organized)

**Friction.** The exhibit route-set is enumerated **twice, from two sources that disagree**: the
computed `exhibitSlugs` (from `exhibits.json`, drives `sitemap.xml.ts` and `robots`) and the
hand-authored `META` table (`[slug].astro:37-85`, drives `getStaticPaths`). Same concern (which
exhibits exist as pages), two implementations, silently divergent — the exact drift ADR-0013 / the
`sitemap.xml.ts:6` comment ("the next exhibit can't be forgotten") claims to prevent, defeated
because only ONE of the two enumerations is derived.

**Surplus.** `lib/dialog-a11y.ts` is a single, well-generalized focus-trap action shared by
`NoteLightbox` and `SearchOverlay` (the only two `role=dialog` surfaces) — a clean one-seam
abstraction. But it is a plugin-style seam with exactly two consumers and **no test** (see L4), so the
generalization carries no guard: the one place that decides whether a keyboard user is trapped behind
a modal is unprotected on both the type axis (viewer islands have no type gate — rule
`svelte-no-typecheck-net.md`) and the behavior axis.

### L4 — Implementation (how built)

**Friction.** Coverage holes on non-trivial logic: `lib/dialog-a11y.ts` (78 lines — focus trap,
initial-focus, focus-return, Tab-wrap; testable under jsdom, zero tests), `aside-persistence.ts`
(localStorage I/O, no test), `cite-context.ts`, `published-base.ts` — all untested. The
focus-trap is the highest-value gap (a11y correctness, shared by two dialogs). By contrast the read
layer (`published.test.ts`, `probe-staleness.test.ts`) and the pure view logic
(`gallery-view`, `search-index`, `*-landing`, `note-arrival`, `og-image`) are well covered.

**Surplus.** Same artifact as the L2 surplus row, at the implementation seam: the five-variant
`ModeProbe` union and its `console.warn` branches (`published.ts:177-197, 213`) compute
distinctions (transient-5xx vs offline vs corrupt-JSON) that the UI discards to one string. A modeled
richness written to the console and then dropped from the user-facing path.

---

## Issues (evidence-backed)

### I-V1 — Two disagreeing enumerations of the exhibit route-set; sitemap 404s + third-party exhibits get no page  [Strong]
- Type: task
- Rungs: L2↔L3↔L4. `getStaticPaths` (hardcoded `META`, 5 slugs) and `sitemap.xml` (computed
  `exhibitSlugs`, 7 slugs) enumerate the same set two ways and disagree.
- Symptom: `sitemap.xml.ts:6` lists `…/geo-map/` and `…/screenshots/`; `[slug].astro:86`
  (`Object.keys(META)`) builds neither → both 404 for crawlers/unfurls; `geo-map` (a live gallery
  exhibit) has no shareable OG page. The `[slug].astro:3-4` header falsely claims it enumerates "via
  og-image's exhibitSlugs." A cloner's dropped-zip exhibits (supported, `gen-published.mts:6-17`) all
  silently lack static pages, contradicting `index.astro:4` ("arbitrary published Library, no
  per-exhibit code").
- Why: leverage = the fix (drive `getStaticPaths` from `exhibitSlugs`, with `META` as an
  override and card `title`/`description` from `exhibits.json` as the default) collapses two
  enumerations into one and makes the "arbitrary library" purpose real. Lesson: derive every
  enumeration of a set from one source, or they drift silently behind a green build.

### I-V2 — Corrupt-deployment reads surface as "check your connection"  [Worth exploring]
- Type: task
- Rungs: L2↔L4. The classifier models corrupt-JSON / 5xx / offline distinctly (and logs them) but
  the UI collapses all to one connection-error string.
- Symptom: `modeFromProbe` (`published.ts:189-197`) maps `http|network|malformed`→`"error"`;
  `ViewerShell.svelte:125` shows "Couldn't reach the library. Check your connection and reload." for
  all three. A 200-with-HTML-error-page or wrong-version deploy (`published.ts:213` already warns it
  distinctly) tells the user to check their connection — advice that can't fix it.
- Why: the diagnosis already exists in code; only the surfacing is missing. Small, honest UX-truth
  fix. (Cross-check against decided "read-policy incoherence" to avoid overlap — this is about the
  user-facing *message*, not the read policy.)

### I-V3 — The shared modal focus-trap has no test on either guard axis  [Worth exploring]
- Type: task
- Rungs: L3↔L4. One generalized a11y seam (`lib/dialog-a11y.ts`), two consumers, zero coverage; and
  viewer `.svelte` has no type gate (rule `svelte-no-typecheck-net.md`), so the trap is unguarded on
  both axes.
- Symptom: `lib/dialog-a11y.ts` (78 lines: Tab/Shift-Tab wrap, initial focus into dialog, focus
  return to trigger, ESC delegation) has no `.test.ts`; it is the only thing keeping a keyboard user
  from escaping behind `NoteLightbox`/`SearchOverlay` scrims. jsdom makes the focus-order and
  wrap logic directly unit-testable.
- Why: a11y correctness on a shared seam is exactly where a silent regression hurts most and is
  cheapest to pin with characterization tests. Lesson: a one-seam generalization still needs a guard
  or it is a single point of un-caught failure.
- Loop: add a jsdom vitest for `dialog(node, {onclose})`: assert initial focus lands on
  `[data-dialog-autofocus]` else first focusable else the root; Tab from last wraps to first and
  Shift-Tab from first wraps to last; ESC calls `onclose`; destroy returns focus to the trigger when
  it is still in the DOM. Read-only elsewhere; run `cd apps/viewer && pnpm exec vitest run`.

---

## Directions (surplus → under-delivery)

### D-V1 — Live working-store preview is a full capability with no user-facing story  [Worth exploring]
- Surplus: `initLiveSource`/merge helpers (`published.ts:118-170,249-314`), `refreshLive` +
  `LIVE_CHANNEL` + visibility triggers (`ViewerShell.svelte:82-103,154-165`), "Browser" badge
  (`Gallery.svelte:86`).
- Rungs: L1 (purpose over-provides: a live authoring preview) → docs/onboarding under-deliver
  (`README.md:3,19-28` names only the hosted publish path).
- Who feels it: an author previewing locally sees their unpublished exhibit appear in the viewer with
  a "Browser" badge and no explanation of what it means or how it got there ("why is my exhibit here /
  why can't others see it").
- Intent: designed-latent (Q-3 archie-persistence is cited throughout `published.ts`) — the feature is
  intentional; only its surfacing/documentation lags.

### D-V2 — No "public / unlisted / draft" control on published exhibits  [Worth exploring]
- Surplus: the gen pipeline unions every committed exhibit into the public hall + sitemap
  (`gen-published.mts:12-17,144-178`); `Gallery.svelte:16` sorts by `order`, so `screenshots`
  ("Archie, Annotated", `order:0` in `exhibits.json`) and the demo `sampler` **front the public
  gallery** for every visitor of the real deploy.
- Rungs: L2 (behavior over-exposes showroom/demo exhibits) → the publisher's intent under-delivered
  (no way to mark an exhibit unlisted/draft in the hosted hall; the live source has a "Browser"
  unpublished badge, but hosted has no listing control).
- Who feels it: a publisher who wants demo/meta exhibits present-but-unlisted has no lever; today the
  only workaround is not committing them.
- Intent: forgotten-latent — the live "Browser" badge shows the draft/unlisted concept was modeled on
  one source but never generalized to hosted listing.

---

## Fog (suspected, not yet ticket-sharp)

- README naming drift: `README.md:5,24,34` reference "Bidar" exhibits / "Bidar's 25 reflections" /
  pages "(voynich, bidar, av)" — no `bidar` or `av` exhibit exists (the set is voynich*, language-atlas,
  geo-map, sampler, screenshots) and there are no per-name `.astro` pages (only `[slug].astro`).
  Decided-excluded as "docs drift," but it names non-existent artifacts a maintainer would chase.
- `ExhibitView.svelte` (643 lines) is the viewer's orchestrator-god analogue of the tracked studio
  `App.svelte` (Issue 18): layout + reading-mode + arrival + search + carousel + filmstrip + keyboard
  in one component. Same pattern, different file — not obviously in Issue 18's scope.
- `ExhibitView.svelte:5-6` comment ("Sections come from sample-data `sectionsFor`") contradicts
  `:90` ("round-tripped from the published manifest") — a stale in-code comment, low stakes.
- og:image reach: `ogImageFor` (`og-image.ts:37`) only upsizes IIIF covers matching `/full/…/0/`; a
  cloner's local-import cover (absolute `${BASE}…/assets/x.png`) never matches → always the brand
  card. Overlaps the excluded DIVERGENCES "OG-image capability-reach" — noted, not re-filed.

## Adversarial verification — 2026-07-20 (workflow wf_19aab265-c48; one independent skeptic per finding)

- issues[0] "Two disagreeing enumerations of the exhibit route-set: sitemap 404s + third-party exhibits get no page" — confirmed (Strong) → seeds Archie-d93a. Corrections: Minor nuance only: [slug].astro:35-36 contains a second comment ("Only slugs carrying authored page-meta render a reader page") explicitly documenting the 5-slug META set as mirroring the old hand-written pages — so the restriction is partially deliberate, even though the header comment (lines 3-4) falsely claims exhibitSlugs is the source. The central mismatch (sitemap advertises 7 routes, only 5 built; geo-map and screenshots 404) is unaffected.
- issues[1] "Corrupt-deployment reads surface to the user as 'check your connection'" — confirmed (Strong) → seeds Archie-a2b9.
- issues[2] "The shared modal focus-trap has no test on either guard axis" — confirmed (Strong) → seeds Archie-81fa.
- directions[0] "Live working-store preview is a full capability with no user-facing story" — DROPPED (refuted). refuted — README documents the live preview extensively ("Author locally, see it live", line 160 + nav/contents/how-it-works/status). Full refutation: The code evidence is accurate (initLiveSource in apps/viewer/src/published.ts:143; refreshLive + BroadcastChannel(LIVE_CHANNEL) + visibilitychange in apps/viewer/src/components/ViewerShell.svelte:87-168; "Browser" badge at Gallery.svelte:86). But the central claim — "no user-facing story", "README names only the hosted publish path" — is false. README.md has a dedicated section "## Author locally, see it live" (line 160, present in committed HEAD too), linked from the top-level "Start here" nav (line 11), the Contents (line 27), explained in "How it works" (line 147, one-origin requirement) and Status (line 345, OPFS/unbound caveat). The badge itself carries a tooltip: "Browser — saved only in this browser; only you can see it until you publish." The only real residue is a label drift: README describes the badge as "Local" while the UI renders "Browser".
- directions[1] "No public/unlisted/draft control on published exhibits" — confirmed (Strong) → seeds Archie-b9c9.

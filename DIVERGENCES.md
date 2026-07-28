# DIVERGENCES — Archie graft backlog

**Provenance:** generated 2026-07-05 by a graft run; commit examined `957d509`. Field walk by three
exploration passes (V1/V2 job & workflow · V3/V5 actors & policy · V4 operators & artifacts); raw
observations and their disposition are in the table at the bottom. A re-run diffs this file — done
markers, verdicts, kills, and parked reasons are recorded decisions, not re-litigated without new
evidence.

**Gate check (recorded):** ISSUES.md Issues 1–10 `done` 2026-07-05; CI runs typecheck + tests on
push (Issue 1, `ledgers/GATE.md`); no open security finding or data-loss risk. Issue 11
(scale/gallery) is `queued` with a grilled plan — not a burning platform, but its scope
(multi-select, bulk ops, gallery index, viewer navigation) is claimed territory: nothing below
proposes into it. Growth allowed.

**Seam constraint:** ISSUES.md Directions 1–3 (collaboration-merge UI, version-history view,
embed-snippet generator) are tend's built-but-latent surplus. Divergences below cite them as
sequencing partners; none re-proposes them. *Update mid-run (commits `ea5fe8f`–`246550d`, a
concurrent session): all three Directions are now `done` with **pursue** verdicts
(`ledgers/CAPABILITY.md`, `ledgers/DARKDATA.md`) — the sequencing partners are commissioned, not
hypothetical.*

---

## 1. publish-to-web — one-continuous-motion publishing from Studio

**Status:** **spec'd — PRFAQ.md** 2026-07-05 (pr-faq interview; appetite 3–4 weeks, user-set).
Beneath it: probe verdict **pursue** 2026-07-05 — ledger: ledgers/PROBE-publish-to-web-2026-07-22.md (seed
tree live on GitHub Pages in 0.6 min against a 10-min kill budget; per-blob REST refuted, A2;
single-pack git push confirmed, A6 — build = `git2`/`gitoxide` in `src-tauri` + 2 REST calls).
Interview decisions: device-flow + PAT fallback; GitHub-only with a host-adapter seam; Tauri
full experience + browser guided-manual path. Hands to a build session with PRFAQ.md + the
ledger; slice on branch `probe/publish-to-web` (`54b2d42..4117631`), never merges.

**Evidence.**
- repo — the "Save a copy" done-screen tells the user to upload the `.archie.zip` to "your site, a
  GitHub release, the Internet Archive" and paste the URL back to mint a share link
  (`apps/studio/src/PublishDialog.svelte:149-150`). Hosting — the step that makes the exhibit real —
  happens outside the app.
- repo — the share link self-declares non-terminal: "best for sharing a draft, not for a permanent
  citation. To publish something that stands on its own, use To GitHub Pages"
  (`PublishDialog.svelte:168`) — and the GitHub Pages path lives entirely outside the app:
  `pnpm build:gh-pages`, commit, Actions, hand-edit `REPO="Archie"` on fork (`README.md:234-243`).
- repo — the local-publish done-screens hand the user a shell command (`pnpm --filter @archie/viewer
  dev`, unzip into a folder) as the last screen (`PublishDialog.svelte:176,184-188`).

**Vantage.** V1 (the job continues after the last screen) + V2 (downstream step done by hand) —
two independent vantages agree.

**Leverage.** L3 (a new verb: *deploy*, from inside Studio — e.g. GitHub device-flow + Pages
provisioning with the user's own token, keeping the no-platform promise). Blast radius:
`PublishDialog.svelte` + one new deploy module; no schema change, no migration. Reshapes: the core
job — "citable exhibit" — completes in one motion instead of dying at a terminal.

**Who feels it.** The adoption-wedge persona itself: a scholar/curator with primary sources and no
server or CMS budget (`README.md:82` — "keep it *yours*, not a platform's"). Today's workaround is
uploading the zip to the Internet Archive or a GitHub release by hand and pasting the URL back —
steps the product's own dialog narrates. *Lesson: jobs-to-be-done — users hire the app for a job
that continues after your last screen; copy that narrates a manual step is a feature request
written in the product's own words.*

**Shape.** Feature (deploy flow in PublishDialog; Tauri-first, browser fallback to be probed).

**Cheapest probe & kill criterion.** Probe: from the Tauri app, run GitHub device-flow auth,
create/update a repo, push a small built tree, enable Pages — measure minutes-to-live-URL. **Kill:
if the flow cannot complete without a terminal step or a third-party proxy server (breaking
local-first), or if published-to-live exceeds ~10 minutes on the seed exhibit, kill.**

**Loop.** thin-slice probe:

```
For the divergence publish-to-web in DIVERGENCES.md (one-motion GitHub Pages deploy from Studio;
kill criterion: any required terminal step or third-party proxy, or >10 min to live URL on the
seed exhibit) — list every assumption it rests on and mark the riskiest (candidate: GitHub
device-flow + repo create + Pages enable all work from the Tauri webview with only the user's
token; note curl/wget are blocked in this repo's sessions — use ctx_execute or in-app fetch).
Ledger ledgers/PROBE-publish-to-web-2026-07-22.md: assumption | riskiest? | probe | result | verdict. State
the kill criterion before writing any code; it does not move after. Build the smallest slice that
tests the riskiest assumption — behind flag archie.deployToPages, on branch probe/publish-to-web,
demo data allowed, shortcuts allowed everywhere the assumption isn't. Demo it, record the result
against the criterion, verdict every row. The slice never merges in this run: on pursue, hand to a
build session with this ledger; on kill, delete the branch and record the criterion met. Done when
every assumption row holds a verdict and this divergence's Status is updated.
```

**Strength:** Strong (two vantages, all evidence on the repo channel).

---

## 2. studio-preview — "see it as a reader" without leaving Studio

**Status:** queued

**Evidence.**
- repo — the codebase carries its own IOU: `apps/studio/src/App.svelte:1489/1957` — `[SNAG] Owed:
  in-Studio "preview how it opens" reader` — next to a disabled button.
- repo — the current preview loop requires a terminal mid-journey: run the viewer dev server, one
  origin (`README.md:344-346`); Firefox/Safari authors are pushed onto the zip backend + a full
  publish just to look (`PublishDialog.svelte:199-201`).

**Vantage.** V4 (operator: the *preview* verb, cell already marked "owed" by the repo) + V2
(mid-journey tool-switch) — two vantages agree.

**Leverage.** L2 (information: the author sees what readers see, before publishing — a feedback
loop that exists today only via a terminal détour). Blast radius: mount `<archie-viewer>` (already
a workspace package) against an in-memory/OPFS publish inside Studio; enable the disabled button.
Smallest blast radius on this list.

**Who feels it.** Every author, every session: today they either run `pnpm --filter @archie/viewer
dev` in a terminal or publish blind. *Lesson: the cheapest roadmap item is the one the product
already promised itself — a `[SNAG] Owed` comment beside a disabled button is pull on the repo
channel, first-party edition.*

**Shape.** UX intervention (one button, one embedded viewer surface).

**Cheapest probe & kill criterion.** Probe: point the `<archie-viewer>` element at an in-memory or
OPFS-published tree inside Studio and measure time-to-first-paint on the seed exhibit. **Kill: if
preview requires a full library republish (the exact tax Issue 11 is removing) or first paint
exceeds ~5s on the seed exhibit, park until Issue 11 Phase 1 (incremental publish) lands, then
re-probe.**

**Loop.** thin-slice probe on branch `probe/studio-preview`, flag `archie.inStudioPreview`, ledger
`ledgers/PROBE-studio-preview.md` — same template as divergence 1 with these slots; kill criterion
stated before any code and never moved.

**Strength:** Strong (two vantages, repo channel; sequencing note — cheaper after Issue 11 Phase 1).

---

## 3. remix-from-viewer — the reader→author bridge ("Keep a copy" on every published exhibit)

**Status:** queued

**Evidence.**
- repo — no fork / "Keep a copy" / "Open in Studio" affordance exists anywhere in `apps/viewer`
  (verified by sweep); "Keep a copy" exists only in Studio's bundled-template playground
  (`apps/studio/src/LibraryHome.svelte:228`). A reader wanting to build on a published exhibit must
  acquire the source out-of-band.
- repo — the README stakes the promise this breaks: citable, forkable, no-lock-in (`README.md:82`).
- claim-to-test — readers *want* to remix (students, colleagues). Probe named below; capped by this
  channel until it runs.

**Vantage.** V1 (exit gap: the job "build on this exhibit" can't start) + V3 (the reader/student
actor has verbs nowhere) — two vantages agree.

**Leverage.** L3 (a new verb for a new actor; every published exhibit becomes a distribution
channel for Archie itself — view-source growth). Blast radius: viewer UI button + the publish
pipeline carrying (or reconstructing) an editable source — the pipeline half is the risk. This is
also the named **wedge toward the L4 classroom loop** (teacher publishes → student remixes →
annotates → sends zip back → teacher merges), whose other half is tend's Direction 1 (the merge UI)
— the L4 is not proposed here, only its wedge.

**Who feels it.** The educator/student personas (`docs/GOAL.md:173-176`) and the colleague
receiving exhibits: today the source zip travels by email or not at all (ISSUES.md:645's
teacher-with-30-student-zips scenario is this loop's other end). *Lesson: single-player to
multiplayer — the highest-leverage actor is already in the room, reading the app's output; giving
them one verb turns a document into a channel.*

**Shape.** Feature (viewer affordance + publish-pipeline change).

**Cheapest probe & kill criterion.** Probe: determine whether a published tree round-trips to an
editable library — are masters (or tiles sufficient to re-derive them) present, do annotations
re-enter the spine losslessly via the existing `openArchieLibrary` seam? **Kill: if round-trip
requires bundling full masters such that published trees grow >2× today's size, or annotations
lose provenance on re-import, park with that finding.**

**Loop.** thin-slice probe on branch `probe/remix-from-viewer`, flag `archie.keepACopy`, ledger
`ledgers/PROBE-remix.md`; riskiest assumption = the round-trip. Direction 1 (merge-back, the
loop's other half) was verdicted **pursue** 2026-07-05 — this wedge and that surplus now point at
the same classroom loop from opposite ends.

**Strength:** Strong for the gap (repo, two vantages); the demand half is claim-to-test — overall
capped presentation: strong gap, probe before betting big.

---

## 4. headless-publish — `archie publish` for CI and scripts (consume→produce)

**Status:** queued

**Evidence.**
- repo — `packages/render-core/src/publish/*` (`open · read · ghpages · static-pages · merge`) is a
  complete programmatic publish/open API with no CLI or public entry (V4 sweep).
- repo — the README already instructs a manual pipeline run (`pnpm build:gh-pages`, commit, Actions;
  `README.md:234-243`) — the workaround for not having one.

**Vantage.** V4 (operator: consume→produce) + V2 (downstream by-hand step). 

**Leverage.** L3 (a new actor — developers/CI — and an API-out posture; Archie becomes a step in
other people's static-site pipelines instead of an app you visit). Blast radius: one new thin
package binding the existing API — *if* the pipeline runs under Node.

**Who feels it.** A curator's institutional webmaster, or the user themselves re-publishing after
edits: today the publish pipeline is reachable only through pnpm scripts inside this repo's
checkout. *Lesson: consume→produce — a product that can be scripted gets adopted by workflows, not
just users; the API is already paid for.*

**Shape.** Feature (thin CLI package).

**Cheapest probe & kill criterion.** Probe: run `publishLibrary` under plain Node on the seed
library. **Kill: if DZI tiling/thumbnailing depends on browser-only APIs (canvas, OPFS, blob URLs)
with no Node substitute already in the dependency tree, kill — a headless raster stack is a bigger
bet than this evidence supports.**

**Loop.** thin-slice probe on branch `probe/headless-publish`, no flag needed (new package, not
wired into apps), ledger `ledgers/PROBE-headless.md`; kill criterion stated before code.

**Strength:** Worth exploring (one channel — repo; no artifact shows anyone asking to script it yet).

---

## 5. embed-autogrow — iframes that size themselves

**Status:** **built — `e3766bc`** 2026-07-07 (user-ordered, review-gated on main; ledger
`ledgers/PROBE-autogrow-2026-07-06.md`). Kill-criterion finding recorded: script-stripping hosts strip the
parent listener too — auto-grow serves script-permitting hosts; fixed height stays the documented
answer for the strip class. Reader view deliberately excluded (zoom surface; feedback loop).

**Evidence.**
- artifact — `recipes/README.md:136-138` documents iframe auto-grow as an unbuilt follow-up, and
  narrates the script-stripping-host workaround (self-hosted embed page) by hand.

**Vantage.** V1 (the embed exit continues in a CMS the snippet doesn't fully serve).

**Leverage.** L1–L2 (a parameter of the embed experience; removes a documented paper-cut). Blast
radius: `packages/archie-viewer/src/element.ts` postMessage + a snippet line. Tiny.

**Who feels it.** The educator pasting the iframe fallback into an LMS that strips scripts —
today they hand-tune a fixed height. *Lesson: docs that narrate a workaround are the artifact
channel's cheapest demand signal.*

**Shape.** UI change (element + recipe).

**Cheapest probe & kill criterion.** Probe: ResizeObserver → postMessage → parent-page listener
snippet, tested in the recipes demo page. **Kill: if the documented script-stripping hosts also
strip the listener snippet (making auto-grow unreachable exactly where it's needed), record that
and close as docs-only.**

**Loop.** thin-slice probe on branch `probe/embed-autogrow`, ledger `ledgers/PROBE-autogrow-2026-07-06.md`.
Natural companion to tend's Direction 3 (snippet generator) — same dialog, one session.

**Strength:** Worth exploring (one artifact citation; nearly-free probe justifies keeping it).

---

## Top bet

**publish-to-web (divergence 1).** Gate re-checked above: pass. It is L3 over a two-module blast
radius, rests entirely on repo-channel evidence from two vantages, completes the product's core job
for its own adoption-wedge persona, and its kill criterion is checkable in an afternoon.
studio-preview (2) is the cheapest item here and a fine consolation bet, but it deepens the authoring
loop; publish-to-web completes it. Not bet on this cycle: 3 (probe the round-trip first), 4–5
(single-channel evidence; probes are cheap whenever there's slack).

---

## Observation disposition (phase-1 accounting)

| Observation | Disposition |
|---|---|
| Hosting/deploy hand-carries (PublishDialog:149-168, README:234-243) | claimed → divergence 1 |
| Terminal-in-the-loop preview; `[SNAG] Owed` preview button (App.svelte:1489/1957) | claimed → divergence 2 |
| No reader→author affordance in viewer; readers/students have no verbs (GOAL.md:173-176) | claimed → divergence 3 |
| render-core publish API has no public entry; README manual pipeline | claimed → divergence 4 |
| iframe auto-grow unbuilt follow-up (recipes/README.md:136-138) | claimed → divergence 5 |
| Collaboration exit = zips by email; teacher-overwrite scenario | cited → tend Direction 1 (merge UI is the built half); divergence 3 is the unbuilt other half |
| `creator?: unknown` modeled, never populated (wadm/types.ts:142); Reading has no owner (model.ts:144) | **handed-to-tend: dark-data census (Direction 2's DARKDATA loop) / identity cluster of Direction 1** — the field and the IdentityPrompt exist; populating them awaits those verdicts |
| DZI slicer (dzi-slicer.ts), OG-image (og-image.ts), CSV/WADM import prominence, geo-notes surface | **handed-to-tend: capability-reach diff (Direction 1's CAPABILITY ledger, new clusters)** — built; question is reach, not building |
| `archie:hasHistory` + history/*.json published but unshown | cited → tend Direction 2 (already ledgered) |
| Embed snippet emits only `src` | cited → tend Direction 3 (already ledgered) |
| Multi-select / bulk ops / gallery index / viewer navigation | cited → ISSUES.md Issue 11 plan (already claimed) |
| IIIF manifest interop hand-off to Mirador/UV/Clover | dropped — terminal exit by design (README.md:184-191 frames it as the point) |
| No settings UI; caps/thumbnail-width/debounce as constants (open.ts:19, zip.ts:29, manifest.ts:102-108) | dropped — no pull on any channel; the caps are security posture (NEGSPACE), not user policy. Revisit on the first real "can I change X" request |
| Upstream by-hand input gathering (scan, manifest-hunting) | dropped — no pull evidence for in-app discovery; pure speculation with a non-free probe |
| manual→scheduled, reactive→proactive operator columns | explicit none-found — local-first, no backend by design |

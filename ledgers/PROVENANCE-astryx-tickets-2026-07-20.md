# Provenance: the Astryx-derived Studio tickets

Three tickets on the Studio UX overhaul map (Archie-21b1) cite "Astryx component audit
2026-07-20" as their source: **Standardize Studio component callback conventions on Svelte 5
onX props** (Archie-07a7), **Extract NoteEditor sub-primitives as importable Svelte
components** (Archie-3547), and **NoteEditor: adopt snippet-based composition for form
sections** (Archie-6be3). No file matching `*astryx*` exists in this repo, and no audit
document was ever written. This ledger reconstructs where the tickets actually came from and
grades how far each one can be trusted.

## What Astryx is

Astryx is **Meta's open-source React component library**, established here from the fetched
markup rather than from the `atmeta.com` domain: the landing page carries `©2026 Meta
Platforms, Inc.`, links to `github.com/facebook/astryx`, and states "Astryx has grown inside
Meta over the last eight years." It is pre-1.0 — the body class reads `astryx-v0-1-3`, the
hero says "Currently in Beta · Built on React and StyleX." Its package namespace is
`@astryxdesign/core`. It documents 200 pages: 155 components, 39 hooks, 6 providers.

Its styling engine is **StyleX**, compile-time atomic CSS — the captured landing page carries
531 distinct atomic classes across 13,979 occurrences. Its most transferable idea is prop
reflection: every prop is emitted twice, once as a legacy bare class and once as a `data-*`
attribute (`class="astryx-button ghost md" data-variant="ghost" data-size="md"`), with the
docs naming the data-attribute form the "preferred selector surface" and deprecating the bare
classes. Nothing in that stack overlaps Archie, which is Svelte 5 with hand-written CSS custom
properties.

**The gap that matters most:** across all four captured Astryx pages, the words "svelte" and
"snippet" appear **zero times**. The identifiers `onClick`/`onClose`/`onChange`/`onMouseEnter`
appear five times total, all inside two illustrative code samples on one docs page, and Astryx
nowhere states a callback-naming convention. No per-component page was ever fetched, so no
prop table backs any claim about its API. Astryx cannot speak to either of the two questions
that Archie-07a7 and Archie-6be3 cite it for.

## What actually happened

Two OMP agent sessions ran **concurrently** on the evening of 2026-07-20 local
(`/home/micah/.omp/agent/sessions/--mnt-Ghar-2TA-DevStuff-Annotators-Image-Archie--/`), both
on **deepseek-v4-pro**, not Claude. The ticket-creating session opened 2026-07-21T03:40:06Z
and died by SIGHUP at 05:09:15Z; the sibling session opened 04:22:59Z — 47 minutes *into* the
first — and died four seconds earlier. Neither fed the other. The cited date is local time:
03:40Z is 20:40 on 2026-07-20 in `-0700`.

The arc of the ticket-creating session is short. The user asked at 03:40:50, "can
https://astryx.atmeta.com/ be used with my own established design system to make it better."
The agent fetched the site, searched twice, and at 03:44:51 answered correctly and in the
negative: Astryx is React and StyleX, Archie is Svelte 5 and Astro, so "adding React/StyleX to
the stack" buys "two frameworks, zero architectural gain." The user redirected twice — "check
archie's css," then at 03:50:53 "what lessons can my components learn from astryx" — and that
third question produced the component lessons, published at 03:52:42 and self-revised at
03:53:54.

**The agent read exactly two Studio components before writing those lessons, and neither came
back whole.** `NoteEditor.svelte` was read with `limit 60`, its result footer reporting `[…110ln
elided]` — so it saw the props block but never the form markup. `SafetyState.svelte` came back
with `[…78ln elided; re-read needed ranges … :2-79]`, which is its entire `<script>` block,
including the props declaration it went on to characterize. It never re-read either elided
range. Its full tool census for the session is 49 bash, 25 read, 7 glob, 3 grep, 2 web_search,
and **zero writes or edits** — which is why no audit artifact exists. `CmdK.svelte` was never
opened, and `createEventDispatcher`, `on:`, and `dispatch` were never grepped.

From that two-file sample the agent published a four-row table asserting a distinct event
dialect for each of SafetyState, NoteEditor, GalleryWall, CmdK, and the dialogs, then a fifth
row for "Dialogs (CreateExhibit, MergeReview)." Only the NoteEditor row was backed by anything
read. **That table is verbatim the body of Archie-07a7.** At 04:02:30 the agent appended its
own conversational conclusions to Archie-21b1's Fog section, and 43 minutes later read that
bullet back out and cited it as provenance in three ticket bodies — prose to map to ticket,
with no measurement anywhere in the loop. The user authorized the graduation at 04:45:21
("break the fog into new frontier tickets"); all three tickets were created at 04:46:11 with
dependency edges added five seconds later. Across all 14 user turns, **not one questioned a
code claim** — the two real pushbacks were about the agent not having read the tend skill
before writing prompts.

## Measured against the code

Everything below was re-verified in the working tree for this ledger.

`createEventDispatcher` appears **nowhere** in `apps/*/src` or `packages/*/src`. No `on:`
directive exists either — every grep hit is a CSS pseudo-selector or prose. The zero-result is
real and not the repo's documented NUL-byte grep hazard; all 56 `.svelte` files were scanned
for `\x00` and none was found. So Archie-07a7's contract line "No `createEventDispatcher`
remains for new work" gates on a phantom, and its scope line "CmdK.svelte: `on:select` →
`onSelect`" names a construct that does not exist.

But CmdK *does* expose a selection callback — `onpick: (entry: CmdEntry) => void`
(`apps/studio/src/CmdK.svelte:36,41`). The ticket got the mechanism wrong and the smell right,
and those must not be collapsed into one verdict.

The decisive measurement is the naming census. Parsing every `$props()` destructure across all
30 studio components and all 23 viewer islands:

| Convention | Count | Examples |
|---|---|---|
| lowercase `onx` | 140 | `onclose` ×15, `onchange` ×6, `onselect` ×5, `onstep` ×4, `onpick`, `onflush` |
| camelCase `onX` | 1 | `onDelete` (NoteEditor.svelte:53) |
| bare injected verbs | 8 | `applyForm`, `setNoteReading`, `closeNote`, `cycleCoLocated` (all NoteEditor) |

**The house convention is lowercase, and it is already near-universal.** Archie-07a7's
prescription — standardize on camelCase `onX` — would invert it, churning 140 sites against an
established pattern. The `onActivate`/`onProgress`/`onError`/`onCode` identifiers that look
like camelCase props are callback *parameters* inside injected function signatures
(`Publish.svelte:104-115`, `CreateExhibitDialog.svelte:105`), not component props. What
survives is one file: NoteEditor never adopted the convention, and mixes both dialects in a
single destructure ending `…closeNote, onDelete`.

Two ticket claims are flat fabrications. Archie-3547 describes an "emphasis radio
(normal/reduced/removed)"; the code is a `<select>` over `muted | normal | strong`
(`NoteEditor.svelte:128-134`). It also cites `reading-index.js`, and only `reading-index.ts`
exists.

Finally, the fact that undercuts Archie-6be3 more decisively than any provenance argument:
**NoteEditor has exactly one consumer.** It is imported at `App.svelte:40`, instantiated once
at `:2248` inside a local `{#snippet noteForm()}`, rendered at exactly one site (`:2609`). The
comment above that snippet states the design intent — "ONE WADM form definition (ADR-0006) —
never forked." The ticket proposes an override API against a seam whose stated purpose is
preventing variation.

## Disposition per ticket

**Callback conventions (Archie-07a7) — rewrite from the code.** Its source principle is real
and verbatim Astryx ("Every component follows the same naming, prop, and composition rules…
both people and AI can predict how an unfamiliar component will behave"), and a convention gap
genuinely exists. But the evidence table is invented and the prescription is backwards. Rewrite
the question as: *NoteEditor.svelte is the only component in either app that has not adopted
the house callback convention — it takes 8 bare-verb injected mutators plus a camelCase
`onDelete`, while 140 prop declarations across the other 52 components use lowercase `onx`.
Align NoteEditor's mutator props to lowercase at its single call site (App.svelte:2248-2252),
binding explicitly (`onchange={applyForm}`) so App keeps its own domain-verb function names.
Explicitly out of scope: CmdK (already `onpick`/`onclose`), SafetyState (already `onflush`),
any `createEventDispatcher` removal (none exists), and any camelCase migration — the house
convention is lowercase, do not invert it.* Worth answering first: is a rename with zero
behavioral change worth touching a popover on the annotation hot path, or should it ride along
with the next substantive NoteEditor change?

**Extract sub-primitives (Archie-3547) — narrow scope.** This is the one ticket whose source
principle is both real and demonstrated: Astryx exports every primitive, and its markup shows
`astryx-item` composing into both `DropdownMenuItem` and `SelectorOption`. Three of the five
candidates check out against markup the agent never read — the mm:ss time fieldset (`:100-106`),
the co-located stack cycler (`:87-95`), the reading select (`:122-127`). Two do not: the
emphasis control is a `<select>`, not a radio, and the ADR-0018 scope block is a read-out plus
contextual buttons, deliberately *not* a toggle ("no overloaded create button"), so extracting
it as `ScopeToggle` would reintroduce what that ADR rejected. The economics also went
unexamined: those five sections total roughly 41 lines of markup with one render site each, and
the repo's own bar for extraction is stated in `ZipExportFields.svelte`'s header — "**Three
consumers** … so the fields, their notes, and the opts composition live here ONCE." Duplication
across real render sites is the trigger, and none of these clears it. If a decomposition ticket
is wanted on this map, the target with actual evidence behind it is **App.svelte at 3147
lines**, 15× NoteEditor and the file every one of these props threads through.

**Snippet composition (Archie-6be3) — close.** Its technical prescription is the only one that
is correct for Svelte 5 — and it is the model's own contribution, not Astryx's. Its first draft
proposed React-style dot-notation (`<NoteEditor.Comment />`) and it self-corrected minutes
later with no user input: "Composition in Svelte 5 means snippets, not React-style dot-notation
components." Its premise, ~20 flat props, is the one component claim verified against a file.
But the benefit it sells — letting consumers replace individual form sections — has no consumer
to serve. The prop count would relocate rather than drop: the ticket's own design keeps four
`Snippet` props while silently moving 17 others into App-side closures, converting a typed,
JSDoc'd `Props` interface into unchecked markup. The repo's own rule for a snippet prop is
visible in `ExhibitOverview.svelte:157` — the *parent* owns state the child cannot construct.
Every NoteEditor section is constructible from `sel`. Close as speculative generality, on
over-engineering grounds rather than provenance grounds. If the 22-prop surface still itches,
the real defect is elsewhere: NoteEditor exposes its `<textarea>` via `commentEl = $bindable()`
so App can splice ⌘K citations at the caret (`NoteEditor.svelte:32-33,:98`). That inversion —
a parent reaching through a component into its DOM — is the one genuine interface problem here,
and snippets do not address it.

## How much to trust this batch

**Correctly-smelled and falsely-evidenced.** Not "poorly founded," and the distinction changes
what you do with them. The agent found a real convention gap, a real prop-sprawl problem, and a
real composition question — then supported all three with a table built from files it never
opened. Two tickets are worth rewriting from the code; one is worth closing.

What the sessions got right, and should not be over-corrected: the initial refusal to adopt
Astryx was correct and well-argued. The CSS audit at 03:50:00 is genuinely file-grounded —
hardcoded hex in `markers.css`, the shadow contradiction between `_after-tokens.md` §7 and the
five shadow tokens in `tokens.css`, `.eyebrow` opacity drift between Studio (0.55) and Viewer
(0.70) — and it self-corrected an earlier error by declaring `.interface-design/system.md`
stale once it found `design/_after-tokens.md`. Three of Archie-3547's five extraction
candidates were correctly inferred from prop names alone. The dedup judgment when graduating
the Fog was sound: it declined to duplicate the a11y sweep because Archie-eec7 and Archie-cf4a
already covered it. And the sibling tickets Archie-7aef, Archie-1244, and Archie-33bf carry no
code claims at all — they restate open questions and are the least contaminated of the eight.

The failure mode is model-agnostic. The visible mechanism is a hedge in private reasoning
("Some use `on:` events, some use callback props") hardening into a confident named table one
message later. That any model can do; "a non-Claude model wrote this" carries no explanatory
weight and should not be used as a filter.

## Risk: the tracker delta is NOT committed

`.seeds/issues.jsonl` was last committed in `aea7733` on 2026-07-19 14:40 local — roughly 31
hours before these sessions. HEAD holds 187 issues; the working copy holds **273**. All 86 new
issues exist only in the uncommitted working tree, reachable from no branch, stash, or reflog
entry.

```
git checkout -- .seeds/issues.jsonl     # destroys all 86, unrecoverable
```

`git checkout .`, `git stash`, and `git reset --hard` do the same. This is not only the eight
Astryx-lineage tickets. It includes seven `wayfinder:map` parent issues, six of them
**closed**, recording work that is already merged: Archie-623e, Archie-b0b1, and Archie-bdc0
are cited by name in commit messages on `main` (`2d77ded`, `eed693d`) while their tracker
records exist nowhere in git. Commit the tracker before anything else touches the working tree.

One decision to make first. Archie-21b1's body was rewritten from 21,963 to 4,746 characters at
04:46:41Z. The Fog-to-ticket graduation is correct wayfinder behavior, but the rewrite was a
full-body replacement composed in the shell, and it dropped roughly 50 lines of merge history —
MERGE WAVE 1, USER RATIFICATIONS, and five decision entries (Archie-2bf1, 90f1, 2318, abf9,
198c). Much of the deleted text was literal triplicates from the known `sd create` triple-fire,
so the compaction was partly warranted, but those three items appear once. They are still
recoverable via `git show HEAD:.seeds/issues.jsonl` — **until the current tracker state is
committed**, after which the old body is history-only.

Also uncommitted and unreviewed in the same tree, from the sibling session: 29 `@surface` JSDoc
docblocks across studio components and the `markers.css` tokenization. These silently implement
two still-open tickets, Archie-c1e0 and Archie-c59a. Two cautions before committing them. That
session verified with `npx svelte-check --tsconfig ./tsconfig.json` rather than the repo gate
`pnpm --filter @archie/studio run check`, saw 15 errors, and dismissed them as pre-existing —
but the documented studio baseline is 0/0, so those 15 are an artifact of the wrong config and
the run proves less than it claims. And the tokenization removed a `drop-shadow` from
`markers.css`, which is exactly the question open grill ticket Archie-5c1d is meant to settle.
HANDOFF.md, refreshed at 04:52Z by a third session, undercounts this sweep as "4 studio
components."

## Unverified claims

- That the six "Astryx principles" the agent quoted came from a `web_search` summary rather
  than the fetched HTML. The quotes are real and the artifacts are Meta's, but the
  search-versus-fetch derivation was inherited from an earlier mining pass, not re-derived.
- Authorship of the 29 docblocks and the `markers.css` tokenization. Timing (04:37–04:39Z) and
  content map cleanly onto the sibling session and onto tickets the first session filed, and
  the fleet session explicitly disclaims the work — but a third concurrent session is not
  excluded by anything measured.
- Archie-99db's claim that the tutorial deck lives at `apps/studio/decks/`. That path does not
  exist; the decks are seven HTML files under `docs/learn/`. Flagged from an earlier pass and
  not re-checked here, since Archie-99db is outside this ledger's three tickets.
- Whether the elided `NoteEditor.svelte:136-192` range (styles) contains anything bearing on
  the extraction question. Only `:80-134` was re-read for this ledger.
- The claim that GalleryWall and the dialogs use event dispatch. Proven false in mechanism —
  no `on:` directive exists anywhere — but their prop surfaces were not individually audited
  beyond the census above.

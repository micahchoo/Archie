# HANDOFF — readings wall text lane (2026-07-29)

**Branch:** `feat/readings-walltext` (worktree `/tmp/wt-walltext`), cut from local `main` @ `578d901`.
**Origin:** channel `archie`, thread `2806900f…d92a48`; plan at `~/.buzz/PLANS/2026-07-29-readings-walltext-plan.md` (Fizz).
**State: complete, NOT pushed** — local `main` carries 77 commits absent from `origin/main` (other lanes' unpushed work); pushing this branch would publish them. Merge to local `main` is safe; pushing is a decision for whoever owns those 77.

## What shipped (3 commits)

- `b1a749f` **model** — `Reading.prose?: string` (markdown, Section.prose convention); `toReadingCollection` prefers prose over description for `AnnotationCollection.summary` (ADR-0007 header). readings.json / merge carry the field verbatim — no read-side change needed.
- `fb806fc` **viewer** — `ReadingWallText.svelte`: the reading's full voice as a threshold dialog (ReadingSheet shell pattern: sibling scrim + `use:dialog`; colour-washed scrim; ProseCites renders the prose; exhibit-wide note/source counts). Shown once per visit (`sessionStorage archie:walltext:<slug>:<rid>`, seen recorded on DISMISS so a mid-read reload re-shows). Legend: chips filtered to readings with notes on the current object (active reading exempt — radio state must not vanish), 28ch `.desc` gloss REMOVED, (i) reopens the wall text (handler-gated like `onhiddenchange`). Pure logic + tests in `apps/viewer/src/reading-walltext.ts`.
- `3dab221` **studio** — wall-text markdown textarea per reading row; `clean()` drops empty prose byte-stably.

## Decisions (channel-approved amendments + two defaults MIXI may override)

1. Chips only where the reading HAS notes on the current object (MIXI amendment); exhibit-wide-empty readings vanish everywhere.
2. General notes never wall-texted (MIXI amendment) — structurally free (base layer isn't a Reading); pinned by test anyway.
3. Note-targeted deep links skip the wall text — A0 `arriveAtNote` assigns `activeReading` directly, bypassing `openReading`, by design (the note is the destination).
4. `description` stays as fallback (`prose ?? description`); phase-2 candidate for retirement.

## Verification (all at `3dab221` in `/tmp/wt-walltext`, node v22.22.2)

- render-core: `pnpm exec vitest run` — 112 files / 1473 pass; TS7 `tsc --noEmit` clean.
- viewer: 24 files / 214 pass (incl. new `reading-walltext.test.ts`); svelte-check 1503 files → only pre-existing `published.ts` `import.meta.env` error (fails identically on clean HEAD).
- studio: 1242 pass / 3 fail — the 3 are `writer-lock.svelte.test.ts` Web Locks tests, failing identically on clean HEAD (the flaky-gates theme); svelte-check 15 errors, byte-identical count on clean HEAD, none in files this lane touched.

## Known edges / follow-ons

- **AV surface:** MediaPlayer picks raise the wall text (threshold is exhibit-level) but AV mounts no (i) to reopen — same dead-door posture as its absent hide-toggle. Wire it if AV grows the affordance.
- **Embed** (`packages/archie-viewer`) untouched — text-only scope, its legend was already an explicit follow-on.
- **Kill criteria** (named in plan): fast-dismissing without reading → demote to (i)-only popover; model + Studio work survives that.
- **Env quirk:** corepack pnpm crashes under node v22.22.3 (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`); use v22.22.2 (`~/.nvm/versions/node/v22.22.2`).

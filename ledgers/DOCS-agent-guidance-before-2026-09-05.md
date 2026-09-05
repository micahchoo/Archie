# Agent guidance before the documentation refresh

Historical snapshot captured on 2026-09-05 from commit `7661ec5`.
The following documents describe earlier instructions and measurements.
Current guidance starts at [CLAUDE.md](../CLAUDE.md). Paths within excerpts are relative to the repository root unless stated otherwise.

## two-typescript-compilers

````markdown
---
scope: "**/package.json"
tags: [typescript, toolchain, typecheck, ci]
priority: high
source: hand-written
---

# This repo has TWO TypeScript compilers — never call bare `tsc`

Since 2026-07-24 the workspace installs both:

| dep | version | used by |
|---|---|---|
| `typescript` | 5.9.3 | `svelte-check`, `astro check`, `svelte2tsx`, the editor/language server |
| `typescript-native` (`npm:typescript@^7.0.2`) | 7.0.2 | every package's `typecheck` script |

**Why both.** TypeScript 7 is the Go-native compiler and is ~8× faster (full sweep 8.02s → 0.96s,
measured across all six packages). But it ships **only the `tsc` binary** — no `main`, no
`lib/typescript.js`, and `require("typescript")` throws. Every tool that drives the compiler through
its JS API therefore cannot use it: `@astrojs/check` peers `^5.0.0 || ^6.0.0` and `svelte2tsx` caps at
`^6.0.0`, both explicitly excluding 7. Replacing `typescript` wholesale would break the `.svelte` and
`.astro` gates that `[[svelte-no-typecheck-net]]` establishes as the only real net for island code.

## How to apply

- **A `typecheck` script calls the native compiler by explicit path**, never bare `tsc`:
  `node ../../node_modules/typescript-native/bin/tsc --noEmit` (uniform — every workspace package sits
  at depth 2). A new package copies that exact form.
- **Never write bare `tsc` in a script.** Both packages claim the `tsc` bin name, so
  `node_modules/.bin/tsc` resolves to whichever pnpm's conflict resolution happened to link — measured
  as 7.0.2, but that is arbitrary and can flip on reinstall. Bare `tsc` is a coin toss, not a version
  choice. (It is currently used nowhere; keep it that way.)
- **Don't "simplify" this by deleting `typescript`.** The 5.x entry is not legacy — it is what
  `pnpm --filter @archie/studio run check` and `pnpm --filter @archie/viewer run check:svelte` load.
- Ambient module declarations are now load-bearing: TS7 reports **TS2882** on a side-effect import of
  an undeclared module, where TS5 was silent. `apps/studio/src/css-modules.d.ts` (`declare module
  "*.css";`) exists solely for this — the five CSS imports in `main.ts` were the entire migration cost.
  A new side-effect import of a non-TS asset needs the same treatment.
- The strictness split in `[[studio-ts-typecheck-gate]]` is unchanged: `svelte-check` still relaxes
  `exactOptionalPropertyTypes`, so `pnpm typecheck` (now TS7) remains the gate for `.ts` files.

## What unblocks the full migration (checked 2026-07-24)

The blocker is upstream and singular: **TypeScript 7.0 ships no public compiler API.** Microsoft has
said **7.1 will introduce a new (different) one**; until it lands, nothing that drives the compiler
programmatically — Svelte, Vue, Astro, Angular, MDX template tooling — can run on 7.x. The concrete
failure for us is that svelte-check reads `require("typescript").default.sys`, a CJS shape tsgo does
not expose, so it crashes at startup rather than degrading. Tracking issue:
`sveltejs/language-tools#2733`.

The hybrid above is not a workaround we invented — it is the migration path Microsoft recommends (run
the old `tsc` for API consumers, `tsgo` for fast checking), and they ship a side-by-side
`@typescript/typescript6` package for the same purpose.

**Revisit when:** TS 7.1 ships its API *and* `svelte-check` + `@astrojs/check` declare a `^7`
peer. At that point drop `typescript-native`, move `typescript` to `^7`, and point the `typecheck`
scripts back at plain `tsc`. Do not attempt it before both conditions hold — `svelte-check`'s peer
range is a permissive `>=5.0.0`, so it will *install* happily against TS7 and then crash, which is a
worse failure than a refused install. Community tsgo-based replacements (`svelte-check-native`,
`svelte-check-rs`) exist but are third-party reimplementations of a CI gate this repo's rules treat as
load-bearing; prefer waiting for upstream.

````

## studio-ts-typecheck-gate

````markdown
---
scope: "apps/studio/src/**/*.ts"
tags: [toolchain, hazard]
priority: high
source: hand-written
---

# Pure-.ts edits in apps/studio: `pnpm typecheck` is the gate, not svelte-check

`pnpm --filter @archie/studio run check` (svelte-check) uses `tsconfig.svelte-check.json`,
which deliberately sets `exactOptionalPropertyTypes: false` (Issue 12 — the flag is noise on
.svelte props). The full strictness for `.ts` files lives only in `cd apps/studio && pnpm
typecheck` (`tsc --noEmit`, the CI gate in checks.yml). Vitest never typechecks at all.

Proven 2026-07-19 (Archie-656a): a TS2379 exactOptionalPropertyTypes violation in
ingest-flows.ts passed BOTH vitest (542 green) and svelte-check (0/0) and was caught only
by the language server / `pnpm typecheck`.

**How to apply:** after editing any `.ts` under apps/studio, run `pnpm typecheck` in
apps/studio (in addition to vitest; svelte-check too if `.svelte` files changed). For the
optional-property idiom itself: pass optionals via conditional spread `...(x ? { x } : {})`,
the codebase's pervasive pattern.

````

## svelte-no-typecheck-net

````markdown
---
scope: "apps/**/*.svelte"
tags: [toolchain, hazard]
priority: high
source: hand-written
---

# `.svelte` type errors: svelte-check is the gate — necessary, not sufficient

svelte-check is the only gate in this repo that reads `.svelte` script/template code; `tsc`/`vite
build` can't parse `.svelte` at all (an undefined identifier there is a runtime ReferenceError, not a
compile error — proven by the 2026-07-06 `orderedIds()` bite in App.svelte). `astro check` doesn't
cover it either: a planted `const probe: number = notADefinedThing;` in a viewer `.svelte` island
passed `astro check` at 0 errors / 0 warnings / 0 hints (the identical statement in a `.astro` page
was caught immediately) — `astro check` diagnoses `.astro` files only, not the islands that hold
nearly all of the viewer's UI.

Run after every `.svelte` edit:
- studio: `pnpm --filter @archie/studio run check`
- viewer: `pnpm --filter @archie/viewer run check:svelte` (`svelte-check --workspace . --fail-on-warnings`)

Both baselines are **0 errors / 0 warnings**; a new warning is a regression, not noise. The viewer's
warnings, before it hit zero, were mostly intentional initial-capture sites (props named `initial*`,
once-per-open builds, prev-value trackers). When silencing `state_referenced_locally` for one of
those, never paste a bare `// svelte-ignore` — the comment must say why initial-capture is the
contract at that specific site.

## Necessary, not sufficient: svelte-check is blind to prop WIRING

`oncancel` was added to a component's `$props()` TYPE annotation but omitted from the destructuring
pattern beside it. `{#if oncancel}` then referenced a name that didn't exist, so the Cancel button
silently never rendered — svelte-check: 1464 files, 0 errors, 0 warnings (Archie-4635, 2026-07-25).
**A prop can be typed and not bound, and nothing static complains.**

After wiring a new prop through a component boundary, drive the running app and assert the control
renders and the handler fires — a green gate alone doesn't prove it. When a control "should be there"
and isn't, suspect the destructuring pattern before suspecting reactivity: dump the rendered DOM and
look for an `{#if}` that emitted a bare `<!---->` while the parent's value was truthy.

## The general form: a gate proves the code COMPILED, never that the output CARRIES anything

Four defects shipped with every gate reporting green:

| what was green | what was actually shipping |
| --- | --- |
| svelte-check 1464 files, 0/0 | `oncancel` typed, not destructured — the Cancel button never rendered |
| `astro build` exit 0 | `getStaticPaths` read the fs at runtime → **empty** object lists in every static page |
| `static-pages.test.ts` passing | `exhibitPageHtml` emits sections when handed them; the published tree had **zero** — nobody regenerated it |
| render-mount unit suite 159 pass | every embed annotation region was **unclickable** — OSD's injected overlay wrapper ate the click |

Each gate answered a real question correctly, and none of them was the question that mattered.

- **After a fix, measure the ARTIFACT, not the exit code.** `grep -c` the built HTML for the string
  the fix adds; count the elements the list should contain; diff the shipped bundle. "The test passes"
  and "the output contains it" are different claims — only the second is the deliverable.
- **A generated/committed artifact does not update itself.** If a fix changes a generator, the
  checked-in output is stale until someone regenerates it — and every unit test still passes.
- **Prefer a gate that drives the real thing.** `recipes/smoke.mjs` and `apps/viewer/e2e` exist
  because hit-testing, prop wiring, and build-time output are all invisible to jsdom and to `tsc`.
  See [[osd-overlay-wrapper]] for the sharpest case: keyboard Enter and a synthetic `click()` both
  succeed against code where a real mouse click does nothing.

````

## shared-worktree-agent-collisions

````markdown
---
scope:
  - "**"
tags: [process, agents, git, worktrees, data-loss]
priority: high
source: hand-written
---

# Two agents in one checkout: the safe git commands become the dangerous ones

**Measured 2026-07-26, wave 1 of the viewer-UX map.** Two implementation agents were dispatched onto
deliberately disjoint file territory — one on the canvas chrome, one on fixtures — and both ran in the
**same working directory**, because `isolation: "worktree"` is a parameter and it was not passed.

Territory separated their *edits*. Nothing separated their *git state*. Five commits interleaved on
one branch, each agent believing it was on its own.

## `isolation: "worktree"` is a parameter, not a default

The dispatch briefs were correct and the territory split was real. It did not help. Verify the
**worktree list** after dispatching a fleet, not the brief:

```sh
git worktree list        # one line per agent, or they are sharing yours
```

The tell that it has already happened, and it is unambiguous:

```
49327c0 HEAD@{14:12}: checkout: moving from ux/dock-chrome to ux/fixture-reach
49327c0 HEAD@{14:11}: checkout: moving from probe/… to ux/dock-chrome
```

Two branch creations a minute apart in one reflog is two agents checking out over each other. After
that, **every commit either of them makes lands on whichever branch won**, and neither is told.

## Consequence 1: `git add -A` commits your neighbour's work under your message

An agent's `git add -A` swept **eleven** of the other's in-flight files into its own fixture commit —
nine `.svelte` components, an embed entry, a token sheet. Nothing was lost (the sweep *preserved*
those edits rather than discarding them, which is the one lucky part), but the commit is joint, its
message describes a third of its contents, and no cherry-pick of it means anything.

**In any shared checkout: explicit paths only. Never `git add -A`, never `git commit -a`.**

And note where this lands afterwards: *which commit holds a change* becomes a thing to look up rather
than to remember. Both agents independently attributed a `MediaPlayer.svelte` change to the wrong
commit, and so did the lead, because all three were reasoning from who wrote it rather than from
`git log -- <path>`.

## Consequence 2: `git restore --source=HEAD <path>` — the SAFE form — is still destructive

This is the one worth internalising, because it defeats a rule this repo already has.

`[[drive-must-not-recreate-the-thing-under-test]]` prescribes `git restore --source=HEAD` over
`git checkout -- <file>` for reverting a red-green injection, precisely because the latter destroyed
uncommitted work twice in one session. That prescription is correct **and it assumes one agent per
checkout.** That assumption is the load-bearing part.

`git restore --source=HEAD <path>` reverts **whatever is at that path**, not only what you put there.
An agent injected into two files it did not own, restored them by the book, and verified `git diff`
empty afterwards. Every step was the prescribed one. None of it protects a sibling who had
uncommitted edits in the same two files.

What made it survivable was luck of timing, and only for one of the two files: the other agent had
re-committed one of them minutes later, so its content was in history either way. The second file had
**no later commit at all**, which means an edit made in that window would be gone with nothing to
hint it had existed — the file simply looks untouched since the sweep.

**An absence of commits cannot distinguish "never edited" from "edited and lost".** Both worlds print
the same empty `git log -- <path>`. Only the author's memory settles it, so ask the narrow question
(*did you edit X between 14:30 and 14:45?*) rather than requesting an audit.

## How to apply

- **Dispatching:** pass `isolation: "worktree"`, then confirm with `git worktree list`. If agents must
  share, say so in every brief and assign explicit-path staging from the start — the `-A` reach is
  reflexive, and a brief that only lists territory reads as permission to `-A` within it.
- **Working in a shared tree:** explicit paths on every `add`. Read `git branch --show-current` before
  every commit rather than remembering a checkout you did an hour ago; in a shared checkout the branch
  is not yours to remember, only to read.
- **Reverting anything:** if another agent is live in the tree, a path-level revert is not yours to
  make. Copy to `/tmp` and restore from there, or commit first.
- **Untangling afterwards:** do not rewrite history in a directory someone is still working in. The
  move that worked was to **rebuild the clean slice from base in a fresh worktree** — `git worktree
  add` at the base sha, `git checkout <sha> -- <your paths>`, commit — which produced a single commit
  with a verified path set and no surgery on anyone's live work. Prefer that to carving commits apart.
- **Merging:** a branch that two agents committed to merges as one unit *unless* one slice can be
  cleanly rebuilt from base, which is worth doing when that slice is finished and green — it should
  not wait behind unfinished work, and if it is a *dependency* of the other's gate it belongs
  underneath it anyway.

## `.seeds/issues.jsonl` is ONE file, so explicit paths do not save you (added 2026-07-27)

The advice above — *explicit paths on every `add`* — assumes your change and a sibling's change land in
different files. The issue tracker breaks that assumption: **every ticket in the project lives in a
single `.seeds/issues.jsonl`**, so any `sd create` / `sd close` / `sd update` by any agent in the
checkout writes the same file you are about to stage. `git add .seeds/` is precise about the path and
still sweeps a stranger's work.

Measured 2026-07-27: a commit whose message was *"docs(1244): record the dead-token slice"* also
carried `Archie-7e6f`, a video-transcode feature ticket created by another agent, graduated out of a
map's Fog. Nothing was lost and the ticket is legitimate — but it entered history under a message that
does not mention it, which is exactly how a ticket becomes unattributable later.

**The tell is a count that will not reconcile.** Closing one ticket left the open total unchanged at
62. `sd stats` agreed with the enumeration, so neither number was wrong — the set had changed
underneath. The diagnostic is a set difference against your own last commit, not a recount:

```sh
python3 - <<'PY'
import json, subprocess
def ids(ref=None):
    raw = (subprocess.run(["git","show",f"{ref}:.seeds/issues.jsonl"],capture_output=True,text=True).stdout
           if ref else open(".seeds/issues.jsonl").read())
    return {json.loads(l)["id"]: json.loads(l)["status"] for l in raw.splitlines() if l.strip()}
then, now = ids("<your last seeds commit>"), ids()
print("ADDED:", set(now) - set(then))
print("CHANGED:", [(k, then[k], now[k]) for k in then if k in now and then[k] != now[k]])
PY
```

**How to apply:** before reporting a backlog count, reconcile the *set*, not the total — two changes in
opposite directions cancel and look like nothing happened. And when you commit `.seeds/`, say in the
message that the tracker file is shared, or check the diff for ids you did not touch. Do not rewrite
the commit afterwards; another agent is live in the tree (see below).

## The general form

Every hazard here is a command that is correct in the environment it was written for. `-A` is fine in
your own checkout; `restore --source=HEAD` is the *recommended* revert; remembering your own branch is
normally free. Concurrency did not introduce new bugs, it **invalidated the preconditions of habits
that had always been safe** — and habits are exactly what nobody re-examines.

Same family as `[[viewer-e2e-shared-port]]`, where `reuseExistingServer` is correct for one developer
on one checkout and silently drives a sibling's build the moment two run at once. When you add
concurrency to anything here, the question is not "what breaks" but **"which of my assumptions was
about being alone?"**

````

## deps-index

````markdown
---
name: deps-index
description: Project-local dependency lookup — maps imports to indexed packages so the model can call `get_docs(pkg@ref, topic)` instead of guessing from training data. Auto-generated; do not edit by hand.
---

# Dependency index

When you need API or usage info for one of these libraries, query
`mcp__context__get_docs(<pkg@ref>, <topic>)` rather than reasoning from training
data. If `freshness` is `very-stale` and the answer is load-bearing, call
`mcp__context__upgrade(<pkg@ref>)` first.

| Package | Ref | Indexed | Freshness | Source |
|---------|-----|---------|-----------|--------|
| `typescript` | `main` | 2026-05-25 | very-stale | https://github.com/microsoft/TypeScript |
| `vitest` | `main` | 2026-05-25 | very-stale | https://github.com/vitest-dev/vitest |
| `@sveltejs/vite-plugin-svelte` | `main` | 2026-05-25 | very-stale | https://github.com/sveltejs/vite-plugin-svelte |
| `svelte` | `main` | 2026-05-25 | very-stale | https://github.com/sveltejs/svelte |
| `vite` | `main` | 2026-05-25 | very-stale | https://github.com/vitejs/vite |
| `@astrojs/svelte` | `main` | 2026-05-25 | very-stale | https://github.com/withastro/astro |
| `astro` | `main` | 2026-05-25 | very-stale | https://github.com/withastro/astro |
| `@annotorious/openseadragon` | `main` | 2026-05-25 | very-stale | https://github.com/recogito/annotorious |
| `@annotorious/plugin-tools` | `main` | 2026-05-25 | very-stale | https://github.com/annotorious/annotorious-plugin-tools |
| `openseadragon` | `master` | 2026-05-25 | very-stale | https://github.com/openseadragon/openseadragon |
| `dompurify` | `main` | 2026-05-25 | very-stale | https://github.com/cure53/DOMPurify |
| `vite-node` | `main` | 2026-05-25 | very-stale | https://github.com/antfu-collective/vite-node |
| `wavesurfer.js` | `main` | 2026-05-26 | very-stale | https://github.com/katspaugh/wavesurfer.js |
| `fflate` | `master` | 2026-05-27 | very-stale | https://github.com/101arrowz/fflate |
| `@astrojs/check` | `main` | 2026-05-27 | very-stale | https://github.com/withastro/astro |
| `snarkdown` | `main` | 2026-06-09 | stale | https://github.com/developit/snarkdown |
| `playwright` | `main` | 2026-06-11 | stale | https://github.com/microsoft/playwright |

## Indexing failures

| Package | Status | Error |
|---------|--------|-------|
| `happy-dom` | failed | context add failed |
| `http-proxy` | failed | context add failed |
| `serde` | failed | context add failed |
| `tauri` | failed | context add failed |
| `@tauri-apps/api` | failed | context add failed |
| `@tauri-apps/plugin-dialog` | failed | context add failed |
| `@tauri-apps/plugin-fs` | failed | context add failed |
| `@tauri-apps/plugin-http` | failed | context add failed |

````
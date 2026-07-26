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

## The general form

Every hazard here is a command that is correct in the environment it was written for. `-A` is fine in
your own checkout; `restore --source=HEAD` is the *recommended* revert; remembering your own branch is
normally free. Concurrency did not introduce new bugs, it **invalidated the preconditions of habits
that had always been safe** — and habits are exactly what nobody re-examines.

Same family as `[[viewer-e2e-shared-port]]`, where `reuseExistingServer` is correct for one developer
on one checkout and silently drives a sibling's build the moment two run at once. When you add
concurrency to anything here, the question is not "what breaks" but **"which of my assumptions was
about being alone?"**

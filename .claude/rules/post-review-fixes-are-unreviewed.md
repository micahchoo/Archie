---
scope:
  - "recipes/**"
  - "packages/**/build.mjs"
  - "scripts/**"
  - ".github/workflows/**"
tags: [process, testing, gates, review]
priority: high
source: hand-written
---

# A fix made after the review is unreviewed — and that is when you stop looking

**Measured 2026-07-26, Archie-f90d/c314.** A branch went through an independent review at one SHA,
came back with two should-fixes, and the commits written to address them carried a silent defect of
exactly the class the branch had spent three rounds finding. The review had signed off the hard part;
the defect rode in on the easy part, after.

The mechanism is not carelessness in the ordinary sense. It is that **the natural moment to relax is
the moment the difficulty ends**, and on a long review loop that moment arrives while there is still
code to write. Every earlier change on that branch was red-greened. The two post-review commits were
not, because "it's just the fix they asked for."

## What actually shipped

Five string literals meant for a `CONTRACTED_LABELS` array were spliced into the middle of a
`record(...)` argument list ~135 lines away. Two consequences, both silent:

- The completeness check covered **35 labels, not 40**. All four AV labels were missing from it — so
  the one capability with no coverage, which is precisely where the defect being fixed had lived,
  was **still uncovered by the commit whose message said it was now covered**.
- `record(ok, label, detail)` bound the first stray as `detail`, replacing the assertion's diagnostic
  string with a label. The assertion still worked; its failure message stopped explaining anything.

Every gate was green. `RESULT: PASS` either way.

## Three habits, each of which would have caught it alone

**1. Beware positional assumptions wearing the costume of a check.** A probe with an implicit scope
answers a *narrower* question than the one you think you asked, and reports the narrow answer with the
confidence of the broad one. Two independent instances, in the same review loop, on opposite sides of
the same defect:

| the probe | what it answers | what was assumed |
| --- | --- | --- |
| `assert old in s` before a first-occurrence replace | *does this exist* | *is this unique* |
| `sed -n '890,905p'` to check a commit for strays | *is it here* | *is it anywhere* |
| `git show --stat <sha> \| grep -v <noise> \| head -20` to check a commit is territory-clean | *are the first 20 mine* | *are they all mine* |

The first put five labels in the wrong place. The second then read the guilty commit as clean, because
the strays sat at line 878 — outside the window — which is how the defect got attributed to the wrong
commit even during the audit *of that defect*. Neither probe was wrong about what it measured. Both
were wrong about what they were taken to have shown.

**The third (2026-07-26, wave 1) is the one to remember, because the truncation was not arbitrary.**
An agent verified that its own commit carried no other agent's files, reported "clean — I checked",
and was believed and acted on. The commit carried **eleven** foreign files. `git show --stat` emits
paths in sorted order, and the noise it was filtering (`public/published/…`) sorted *before*
`apps/viewer/src/components/…`, so `head -20` cut the list exactly at the boundary where the foreign
files began.

That is the general hazard: **`head` on sorted output does not drop a random sample, it drops a
contiguous suffix** — and a suffix in path order is a coherent *region* of the tree, which is
precisely the set you were least likely to be thinking about. Every list you truncate is sorted by
something; ask what that something correlates with before you cut it.

**How the bad check got written, in the author's own account** — worth more than the diagnosis,
because nothing about the moment felt like a decision:

> I wanted to answer one question — *did my sweep catch anything foreign?* — and I reached for the
> shape I always reach for: pipe the stat list through a filter for the noise I knew about, then
> eyeball it. […] Both halves felt like tidying. Neither felt like a decision about *scope*. That is
> the whole mechanism: **I chose the filter to remove what I already understood, which meant the
> filter was shaped by my existing mental model, and then truncated what remained — so the check
> could only ever confirm the model it was built from.**

So the one question to ask before running any probe, which is cheaper than all of the above:

> **What would this command print if the thing I fear were true?**

With 17 non-noise files and `head -20`, the answer is *"the same thing"* — which makes it not a
check. If a probe's output is identical in the world you fear and the world you expect, it has zero
information content no matter how much work it looks like.

Don't eyeball a stat list. Assert the set difference, so the check has no scope to be implicit about:

```sh
comm -13 <(printf '%s\n' $ALLOWED | sort) <(git show --name-only --format= "$SHA" | sort)
```

Empty output or it is not clean. No `head`, no `grep -v`, nothing to read past. And **paste the
output even when it is empty**, so a reader knows the check was run rather than assumed — an
unstated clean check is indistinguishable from no check.

So, before trusting any probe: **name the question it actually answers, and check that it is the
question you need.** A scope that is implicit — a line range, a first match, a single directory, one
file extension, the head of a list — is the place to look.

The worked example, because it is the one that recurs. For any scripted edit, existence is not enough:

```python
assert s.count(old) == 1, f"anchor is ambiguous: {s.count(old)} occurrences"
```

An ambiguous anchor plus "replace the first" is a coin toss that looks like a patch. This applies to
`sed -i`, to `Edit` with a short `old_string`, and to any codemod. The general form applies to
`grep` over a line window, to `find` in one directory, and to a `head -n` you drew a conclusion from.

**1a. The subject can be EMPTY, and the probe still prints a verdict.** Habit 1's probes answered a
narrower question than intended. These answered a question about *nothing at all* — and still emitted
a confident sentence. Three in one session (2026-07-26, the dock slice):

| the probe | what it printed | what it had actually examined |
| --- | --- | --- |
| diff two `getBoundingClientRect` heights to see if the canvas resized | **"the image does NOT move"** | one side was `.openseadragon-canvas`, which is `null` on the offline `voynich` route — `0 − 0 = 0` |
| click the remembered centre of a mark to see if it still hits | `0/20` on BOTH trees | a note whose halo-BBOX centre isn't on its geometry; the real suite scored 17/20 on the same tree |
| `pkill -f "port 4477"` before relaunching a server on that port | nothing — then an `until` loop waited 10 minutes | the pattern matched **its own command line**, killing the launch it was chained to |

The third is the sharpest: the check destroyed the thing it was checking for, and a ten-minute wait
reads as patience rather than as a bug. The second is the useful tell — *a new instrument that
disagrees with the existing one by that margin is the broken one.* Prefer re-running the suite that
already exists over building a second probe; that is where all three of these came from.

**The first two are preserved in their broken form**, so this rule's evidence is reproducible rather
than taken on faith: `ledgers/probes/2026-07-26-canvas-reflow-null-diff.mjs` and
`ledgers/probes/2026-07-26-click-hit-rate-wrong-note.mjs`. They are never run and nothing imports
them. Note what the first one's header had to record: the misleading artifact was **overwritten in
place** while chasing the bug, so it no longer existed by the time it was worth studying. Preserve
first, then repair.

> **Before concluding from a probe: did it examine a non-empty subject?** A difference computed from
> two nulls is `0`. A `pkill -f` pattern matches the process running it. An `until` loop with no
> timeout cannot distinguish "not ready yet" from "will never be ready". **Print the subject, not only
> the verdict** — a probe that cannot say *what it measured* has not measured anything.

`[[a-green-run-is-one-sample]]` is the false-RED mirror of this: there, one sample was mistaken for a
result; here, no sample was. Both print something that looks like an answer.

**1a-bis. The injection can be present in the artifact and still never run.** The sharpest instance of
1a, added the same day, because the usual defence — *check the injection reached the build* — passes.

Five attempts to falsify an e2e assertion all failed, and one of them looked diagnostic: a CSS rule
was confirmed **present in the built stylesheet** (`main.svelte-1hmgvz1{…height:60%…}`) and had no
layout effect whatsoever. The theory that followed was a percentage height resolving against an
`auto` parent — plausible, precedented in this repo (V49's `min-height: 100dvh`), and wrong.

The real cause: the fixture exhibit is a **narrative** one, so the test drives `NarrativeReader.svelte`.
All five injections had gone into `Reader.svelte` — *a component that route never renders.* They
compiled, shipped, and never entered the DOM. `grep` found them in the bundle every time.

The tell came only from printing the subject: `.reader main` is `null` on that route while
`.narrative main` is present, and a spacer probe reported `eater=ABSENT` while `grep` found it in the
built JS.

> **"It's in the build" is not "it ran."** Before concluding a gate cannot fail, assert the injected
> thing is in the **rendered DOM**, not merely in the artifact. And when an injection has no effect,
> suspect *which component is under test* before theorising about CSS.

One more from the same falsification, worth knowing when you write one: an injection can be **too
strong to falsify anything**. At `flex: 1000` the canvas was starved to nothing and the run died on
*"the deep-zoom canvas never painted"* — a **precondition** failure, not an assertion failure, which
proves nothing about the claim. `flex: 1` falsified it. A red run is only evidence if it is red for
the reason you intended.

**1c. Having done the right thing is not the same as knowing you did.** After an eleven-conflict
merge, two `add/add` files had been resolved correctly — main's side, wholesale. That was an
*intention* until four commands made it a finding: `merge-base --is-ancestor <the fix> HEAD`, a line
count, a `grep -c`, and a byte-identity check per file. **The gap between those two states is
invisible from inside, because a correct action and an unverified one feel identical.** Run the check
even when you are confident you already did the thing — especially then, since confidence is what
suppresses it.

Same merge, the constructive half: 41 lines existed on only one side. They *were* superseded drafts —
but that was established by reading them and tracing their authorship, not by the fact that dropping
them felt safe. The trace is what turned "dropping my side was acceptable" into "keeping it would have
reinstated the blocker the review found" — different claims, and only the second is worth anything.

**Corollary for anyone writing instructions to a concurrent agent.** In a fleet, messages cross by
design, and guidance that arrives after the work is wasted while a *checkable* assertion is not:

> "take main's side" is guidance. "**203 lines, 8 occurrences, `a440721` present**" is a test the
> recipient can run against work already done.

The second kind survives arriving late, and converts a crossed message into free independent
verification. Write briefs with reconciliation numbers attached; it is cheaper than tightening timing
and it works when timing fails.

**1b. The probe can be correct and still not be read.** A fourth instance, and the most humbling,
because nothing about the command was wrong. A reviewer established that a corpus library "has no
note-media feature" by grepping one variable name (`thumbnail`), getting two hits, and concluding the
feature was absent — without ever grepping for the *feature*. The variable traced and the feature
reasoned about were two different things, and `grep -n thumbnail Item.tsx` **was the entire
argument**. Their own diagnosis: *"I ran that exact command and didn't draw the conclusion from it,
because I'd already decided what the file said."*

So: **grep where a thing is USED, not only where it is defined** — and when a probe's output is the
whole basis of a claim, re-read the output against the claim rather than against your expectation.

The pressure runs hardest in one specific direction: **a correction offered in your favour is the one
you are least likely to check.** That claim was a *strengthening* handed to an author, in their
favour, and it survived only until someone opened the file in order to apply it. Both parties had to
be wrong in the same direction for it to get that far. When a review hands you good news, that is the
moment to open the file.

**A second counting trap, and this one truncates SILENTLY (2026-07-27).** `sd list` defaults to
`--limit 50`. It prints `50 issue(s)` and says nothing about the cut, so an open-ticket count taken
from it is capped at 50 no matter how many exist. Measured: `sd list --status open` → `50 issue(s)`
while `sd stats` → `Open: 63`. A derived "41 non-map" was one command away from being reported.

The tell is the same as the `Scope:` one: **another command already states the number**, and it
disagrees. `sd stats` is the reconciler; `sd list --status open --limit 500 --json` is the enumerator.
Never take a backlog count from a bare `sd list`.

Note the shape it shares with `head -20` on sorted output — a default limit is a truncation you did
not write and therefore do not picture. **Any tool that paginates has a default page size; find it
before you count with it.**

**One counting trap in this repo, made twice on 2026-07-26 by two different people.**
`pnpm -r run typecheck | grep -c "typecheck: Done"` returns **7**. The answer is **6** — the seventh
match is `apps/viewer pretypecheck: Done`, the astro sync step. The second instance is the instructive
one: the first was caught, corrected, and written into the handoff *with the cause recorded so it
could not be re-derived* — and it was re-derived anyway, hours later, from the same command by someone
else. **A lesson written down is not a lesson installed.**

Then the sting, found by the person who made the second one: **the correct number is the FIRST LINE
of that command's own output.**

```
$ pnpm -r run typecheck | head -1
Scope: 6 of 7 workspace projects
```

It was on screen every time either of us ran it. Two people independently reported a number derived
from a `grep -c` while the tool's own statement of that number scrolled past above it — habit 2
failing on the very command being used to claim a gate green. The `41/41` vs `35/35` case was caught
*because* two numbers disagreed; here they disagreed too, in the same output, and nobody put them
side by side.

The general shape, which covers all three of this session's counting bites: **`-c`, `head` and
`grep -v` all SUMMARISE, and each was trusted over the raw output's own statement.** Before deriving
a number, check whether the tool already stated it. Carry the grep, not the memory —
`grep -E '[^e]typecheck: Done'` — but read `Scope:` and reconcile the two.

**2. Reconcile every number you report against a number you actually read.** The report said
"41/41 contracted labels". That number was never measured — it was inferred from the *hard-assertion*
count (41/41) on the assumption the two agreed. The completeness line said `35/35`. **The fact that
those two numbers did not reconcile is the only reason the defect was ever found.** If a report cites
a count, the count must be copied from output, not derived from a neighbouring one.

**3. Read the DETAIL line, not just PASS/FAIL.** The defect printed its own evidence, twice:

```
PASS  ADR-0019 MUST · a reading survives stepping to the next object (V56) — ADR-0019 MUST · a Reading does not follow you into another exhibit (V56)
```

The text after the em-dash is the assertion's `detail`, and it is a *label* — visibly not a
diagnostic. That line was pasted into a status report as evidence of a pass. Grepping for
`PASS|FAIL|RESULT` filters out exactly the field that carries the meaning.

## A gate's reference point must not be writable by the thing it gates

Stated once here because it now has **two independent instances in this codebase**, and they looked
unrelated until the second one was red-greened.

| the gate | what it measures | its reference | how the reference moved |
| --- | --- | --- | --- |
| `eagerGzKB` (`packages/archie-viewer/build.mjs`) | the entry's static-closure gz | `bundle-size.json` | `node build.mjs` REWROTE it — and that build is mandatory, because `dist/` is a committed artifact CI enforces |
| the completeness check (`recipes/smoke.mjs`) | which contracted assertions ran | `CONTRACTED_LABELS` | a patch that moved five entries out of the array silently lowered the bar to 35 |

Same trapdoor both times: **the gate is satisfiable by moving its own reference**, so it reports
success at the moment it stops constraining anything. Worse in the first case, where the allowance is
`max(10%, 10KB)` of the baseline — a bigger regression bought a bigger allowance, so the gate got
*looser* the worse things got.

Neither instance was a needle problem. Both metrics were correctly aimed and would have fired; they
were switched off by their own bookkeeping.

**How to spot it:** for any gate, ask *what writes the reference, and can the thing being gated reach
that writer?* If the answer is yes, it is not a gate yet.

**How to fix it, in order of preference:**

1. **Derive the reference** instead of storing it, so there is nothing to move.
2. **Make writing it a deliberate, separately-named act** — `node build.mjs --update`, surfaced as
   `pnpm bundle:baseline`, so moving the baseline appears as an intentional line in review rather
   than a side effect of building. See `[[archie-viewer-eager-closure]]`.
3. **Add an independent invariant over the reference itself** where it must stay hand-maintained —
   `auditOwnSource()` in `recipes/smoke.mjs` asserts no phantoms, no duplicates, no strays, and that
   check is what catches a deleted array entry. Note the ordering that proves it is load-bearing: with
   the historical splice reproduced, the completeness check **passed at 40/40** (the label was no
   longer listed, so it was no longer required) while the invariant check failed. The second one is
   the only thing that can see a reference shrinking.

## How to apply

- **Post-review commits get the same treatment as pre-review ones.** Red-green the new assertion,
  re-run the full gate set, and re-read the output rather than the exit code. If a review round
  produced code, that code has not been reviewed.
- **A capability's coverage is what the CHECK consumes, not what exists.** Adding a `record()` call
  is not adding coverage if the completeness list does not name it. Whenever a gate has a
  hand-maintained list beside derived data, verify the two agree *mechanically* — for `smoke.mjs`:
  every array entry is genuinely recorded (no phantoms), and every recorded label is either in the
  array or deliberately excluded (failure-only fixture guards, the completeness check itself).
- **Noticing a failure mode and naming it is not the same as having changed the behaviour.** In the
  same session that produced this rule, uncommitted work was destroyed twice by a `git checkout --`
  meant to revert a red-green probe. After the first, "commit before probing" was written into a
  status report as a lesson learned — and the second happened anyway, a few hours later, in the same
  shape. What caught it was not the resolution; it was reading an output line that could not be true
  (a `PASS` count that did not fit, and a missing assertion). **Treat a written lesson as a claim you
  have not yet tested on yourself.** The habit that actually holds is a mechanical one — commit, then
  probe — not an intention to remember.
- **Prose that claims coverage is a claim about the check.** A doc paragraph saying "every row is
  covered now" is false the moment the list disagrees, and it is worst when it appears in the same
  commit that was supposed to make it true — the reader trusts it precisely because it looks
  deliberate. If the sentence is about a gate, verify it against the gate before writing it.

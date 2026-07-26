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

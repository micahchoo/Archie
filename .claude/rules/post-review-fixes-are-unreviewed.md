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

**1. Assert the anchor is UNIQUE, not that it exists.** The patch was applied with a
first-occurrence string replace whose anchor occurred **twice** — once as a `record()` label, once as
the array entry — and it hit the wrong one. The guard in use was `assert old in s`, which proves the
anchor *exists* and can never prove it is *unambiguous*. For any scripted edit:

```python
assert s.count(old) == 1, f"anchor is ambiguous: {s.count(old)} occurrences"
```

An ambiguous anchor plus "replace the first" is a coin toss that looks like a patch. This applies to
`sed -i`, to `Edit` with a short `old_string`, and to any codemod.

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

## How to apply

- **Post-review commits get the same treatment as pre-review ones.** Red-green the new assertion,
  re-run the full gate set, and re-read the output rather than the exit code. If a review round
  produced code, that code has not been reviewed.
- **A capability's coverage is what the CHECK consumes, not what exists.** Adding a `record()` call
  is not adding coverage if the completeness list does not name it. Whenever a gate has a
  hand-maintained list beside derived data, verify the two agree *mechanically* — for `smoke.mjs`:
  every array entry is genuinely recorded (no phantoms), and every recorded label is either in the
  array or deliberately excluded (failure-only fixture guards, the completeness check itself).
- **Prose that claims coverage is a claim about the check.** A doc paragraph saying "every row is
  covered now" is false the moment the list disagrees, and it is worst when it appears in the same
  commit that was supposed to make it true — the reader trusts it precisely because it looks
  deliberate. If the sentence is about a gate, verify it against the gate before writing it.

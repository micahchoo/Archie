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

**Measured 2026-07-26, Archie-f90d/c314.** The commits written to address a review's two should-fixes
carried a silent defect of exactly the class the branch had spent three rounds finding. The mechanism:
the natural moment to relax is the moment the difficulty ends — every earlier change on that branch
was red-greened; the post-review commits were not, because "it's just the fix they asked for." What
shipped: five `CONTRACTED_LABELS` entries spliced into a `record(...)` argument list ~135 lines away.
The completeness check silently covered **35 labels, not 40** (all four AV labels — the exact
territory under repair), and the first stray bound as `detail`, clobbering the assertion's
diagnostic. Every gate green, `RESULT: PASS` either way.

**Post-review commits get the same treatment as pre-review ones:** red-green the new assertion
([[drive-must-not-recreate-the-thing-under-test]] holds the injection discipline, including
commit-before-probing), re-run the full gate set, and re-read output rather than exit codes. The
habits below each would have caught this alone.

## 1. Name the question the probe actually answers

A probe with an implicit scope — a line range, a first match, one directory, the head of a list —
answers a *narrower* question than the one you think you asked, and reports the narrow answer with
the confidence of the broad one:

| the probe | what it answers | what was assumed |
| --- | --- | --- |
| `assert old in s` before a first-occurrence replace | *does this exist* | *is this unique* |
| `sed -n '890,905p'` to check a commit for strays | *is it here* | *is it anywhere* |
| `git show --stat \| grep -v <noise> \| head -20` for territory | *are the first 20 mine* | *are they ALL mine* |

The third hid **eleven** foreign files: `--stat` prints paths sorted, the filtered noise sorted
before the foreign region, and `head -20` cut exactly at the boundary. `head` on sorted output drops
a contiguous *region*, not a sample — and the `grep -v` filter was shaped by the checker's existing
mental model, so the check could only confirm that model.

The cheap universal test: **what would this command print if the thing I fear were true?** If the
answer is "the same thing", the probe has zero information content. For territory checks, assert the
set difference instead of eyeballing — and paste the output even when empty (an unstated clean check
is indistinguishable from no check):

```sh
comm -13 <(printf '%s\n' $ALLOWED | sort) <(git show --name-only --format= "$SHA" | sort)
```

For any scripted edit: `assert s.count(old) == 1` — existence plus "replace the first" is a coin
toss that looks like a patch. Same for `sed -i`, `Edit` with a short anchor, any codemod.

## 1a. Print the subject, not only the verdict

A probe can examine *nothing* and still print a confident sentence. Three in one session:

| the probe | what it printed | what it had actually examined |
| --- | --- | --- |
| rect-height diff, "does the canvas resize" | "the image does NOT move" | `.openseadragon-canvas` is `null` on that route — `0 − 0 = 0` |
| click the remembered mark centre | `0/20` on BOTH trees | the wrong note (the real suite scored 17/20 on the same tree) |
| `pkill -f "port 4477"` before relaunching | nothing, then a 10-minute wait | its own command line — it killed the launch it was chained to |

Both scripted probes are preserved *broken* at `ledgers/probes/2026-07-26-canvas-reflow-null-diff.mjs`
and `ledgers/probes/2026-07-26-click-hit-rate-wrong-note.mjs` (preserve a misleading artifact before
repairing it, or it won't exist when it's worth studying). The tells: a new instrument that wildly
disagrees with an existing suite is the broken one — re-run the suite that exists before building a
second probe; and an `until` loop with no timeout cannot distinguish "not ready yet" from "never".

**"It's in the build" is not "it ran."** Five falsification injections all landed in `Reader.svelte`
while the fixture route renders `NarrativeReader.svelte` — `grep` found every one in the built
bundle, and none ever entered the DOM. Assert the injected thing in the **rendered DOM**, not the
artifact. An injection can also be too strong to falsify anything: `flex: 1000` starved the canvas
and died on a *precondition* ("canvas never painted"), proving nothing; `flex: 1` falsified. A red
run is evidence only if it is red for the reason you intended.

**Having done the right thing is not the same as knowing you did.** "I took main's side in that
merge" became a finding only after `merge-base --is-ancestor`, a line count, and per-file
byte-identity checks — a correct action and an unverified one feel identical from inside; run the
check especially when confident. Fleet-brief corollary: "take main's side" is guidance; "**203
lines, 8 occurrences, `a440721` present**" is a test the recipient can run against work already done
— reconciliation numbers survive arriving late, when timing fails.

(For probes whose output you run and then read against your expectation instead of the claim —
grep where a thing is *defined* instead of *used*, corrections offered in your favour — see
[[prior-art-citation-discipline]]; both bit in this same loop.)

## 2. Reconcile every number you report against one you actually read

The report said "41/41 contracted labels" — inferred from the hard-assertion count, never measured.
The completeness line said `35/35`, and **that non-reconciliation is the only reason the defect was
found**. Copy counts from output; never derive them from a neighbour. Two repo-specific traps:

- `pnpm -r run typecheck | grep -c "typecheck: Done"` returns **7**; the answer is **6** (the astro
  `pretypecheck` matches too) — while the command's own first line prints `Scope: 6 of 7 workspace
  projects`. Made twice by two people in one day, the second *after* the first recorded the cause: a
  lesson written down is not a lesson installed; only the mechanical habit (reconcile against the
  tool's own stated number) holds.
- `sd list` silently truncates at `--limit 50` and prints `50 issue(s)` with no notice. `sd stats`
  reconciles; `sd list --limit 500 --json` enumerates. Any tool that paginates has a default page
  size; find it before you count with it.

`-c`, `head`, and `grep -v` all SUMMARISE — before deriving a number, check whether the raw output
already states it.

## 3. Read the DETAIL line, not just PASS/FAIL

The splice printed its own evidence twice: the text after the em-dash in a `PASS` line was visibly a
*label*, not a diagnostic — and that line was pasted into a status report as proof of a pass.
Grepping for `PASS|FAIL|RESULT` filters out exactly the field that carries the meaning.

## A gate's reference point must not be writable by the thing it gates

Stated once here; two independent instances in this codebase:

| the gate | its reference | how the reference moved |
| --- | --- | --- |
| `eagerGzKB` (`packages/archie-viewer/build.mjs`) | `bundle-size.json` | a plain (mandatory) build REWROTE it — and the allowance is a % of baseline, so the gate *loosened* as the regression grew |
| the completeness check (`recipes/smoke.mjs`) | `CONTRACTED_LABELS` | the splice above silently lowered the bar 40 → 35 |

Both metrics were correctly aimed; both were switched off by their own bookkeeping. For any gate,
ask: *what writes the reference, and can the thing being gated reach that writer?* Fixes, in order
of preference: **(1)** derive the reference so there is nothing to move; **(2)** make writing it a
deliberate, separately-named act (`pnpm bundle:baseline` — [[archie-viewer-eager-closure]]);
**(3)** an independent invariant over the reference itself — `auditOwnSource()` in
`recipes/smoke.mjs`: with the splice reproduced, the completeness check *passed at 40/40* (an
unlisted label is an unrequired one) while only the invariant failed. It is the only thing that can
see a reference shrinking.

Corollaries: a capability's coverage is what the CHECK consumes, not what exists — a `record()` call
adds nothing the completeness list doesn't name; and prose claiming "every row is covered" is a
claim about the gate — verify it against the gate before writing it, especially in the commit meant
to make it true.

[[a-green-run-is-one-sample]] is the false-RED mirror of this rule: there, one sample was mistaken
for a result; here, no sample was. Both print something that looks like an answer.

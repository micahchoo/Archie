---
description: Run the perpetual adversarial code-review loop — find where the codebase lies, prove it, drive one finding per cycle to an honest terminal bucket, gate, merge, push. Forever.
---

# /goal:review — the perpetual adversarial code-review loop

The product `/goal` loop (docs/GOAL.md) asks "is the product better?" This loop asks: **"where
is the codebase lying?"** Run them alternately, never merged — growth and audit obey different
gates. This file is self-contained; the loop survives compaction by re-reading it plus
`HANDOFF.md`, `ISSUES.md`, and `docs/state/REVIEW-COVERAGE.md`.

## 0. Role

You are the standing review team left behind by an architect who is never coming back. The work
is never finished; the job is to make the codebase **more true** every cycle — fewer lies
between what the docs claim, what the gates prove, and what the code does. Every comment is a
claim to falsify, every green gate a net with holes to map, every shipped feature hollow until
traced end-to-end. A short list of decisions stays the user's (§8); everything else you decide
from this document, the rules, and the prior art, in that order.

## 1. North star

> Every load-bearing claim this repo makes — README, ledgers, tests, committed artifacts, UI —
> is verified against the code on disk, and stays verified.

Review surface: the TypeScript/Svelte/Astro spine and its seams — not the generated JSON corpus
(`apps/viewer/public/published/` and kin), which you audit only through its generators.

Priority order, from this repo's scars: **data integrity** → **untrusted-input security**
(`.archie.zip`, remote IIIF) → **honest behavior** (features do what they claim; absent ≠
failed; stale ≠ complete) → **dead weight** → **performance** → **elegance**, last and least.

## 2. The cycle

The atom: **one target, driven to exactly one terminal bucket** — `fixed@hash` / `cut@hash`
(both: reviewed, gated, merged, pushed) / `filed <id>` / `refuted-because` / `clean-cell` /
`escalated`. Never batch two findings into one fix. Open each cycle with a one-line contract:
lane, attack, done-when, and the control phrase **"log it, don't fix it yet"** — attack
inventories to the ledger; only the fix phase touches the tree. After compaction: re-read this
file, HANDOFF.md, REVIEW-COVERAGE.md; resume mid-rotation.

1. **Sync + safety.** `git fetch`; investigate (don't clobber or adopt) any concurrent-session
   WIP in `git status`; confirm `git branch --show-current` — recheck before every commit and
   merge, a concurrent session can move HEAD. Read matching `.claude/rules/*`: they are prior
   incident reports.
2. **Recon.** Next target from the lane rotation (§3), or the top queued survivor in the
   ledger. Read the code end-to-end, plus its tests and ledger claims. Sweeps use `fff` or
   `grep -a` — NUL bytes recur in source here; plain grep silently lies; zero-matches are
   suspect.
3. **Attack** (§5). Break a claim, don't browse. Log every candidate with evidence as found.
   Done when the target is walked entry-to-exit, not when the list feels long enough.
4. **Prove + refute.** A finding must be demonstrated: failing test, repro, UI-to-missing-writer
   trace, artifact-vs-regeneration diff. Then check prior art (`Prior Art/`, `ledgers/`, blame,
   `.claude/rules/`) — half of what looks wrong here is a documented decision (load.ts
   swallow-then-sniff, per-tile webview loader, intentional `state_referenced_locally`);
   overturning one takes new cited evidence, not taste. Neither provable nor refutable →
   hypothesis: file or drop. **Never fix a guess.**
5. **Classify** (§4.2). S0/S1 preempt all lanes. Fix one survivor; the rest queue in the ledger.
6. **Fix.** Iron law: **no fix without root cause** — state (1) why the defect exists, (2) why
   no gate caught it, (3) what single change fixes it; all three go in the commit body.
   Smallest change that makes the claim true. Thin coverage → characterize current behavior
   first (assert reality, weird branches included), then the red test. No drive-bys, renames,
   or "while I'm here." If the row is catchable, the permanent guard is part of the fix.
7. **Review.** A fresh reviewer subagent takes the diff + finding + this doctrine. Never review
   your own fix. Reviewer dies verdict-less → re-dispatch; unreviewed work does not merge.
8. **Gate** (§6). All green or revert to the clean baseline.
9. **Commit → merge → push** (§7). The push is the save.
10. **Log + harvest.** Update REVIEW-COVERAGE.md, including **clean cells** (what was checked,
    how, at which commit — so no future cycle re-walks it). A bug _class_ grows a
    `.claude/rules/` file; deferred work is filed (§4.3). Refresh HANDOFF.md. Ledger rows over
    essays — more markdown than the code audited is half theater.
11. **Report.** ≤8 lines, headed `CYCLE <n> [<bucket>]` (or `CYCLE <n> DRY`, or
    `ESCALATION: <question>`): target, attack, finding, **pasted** gate summary lines, next
    target. Merging cycles also paste `git log origin/main -1 --oneline` (push proof) and
    `git show --stat <hash>` (proves the ledger rode the commit and no gate config was
    touched); non-merging cycles state `no merge: <bucket>`. The /goal evaluator reads only
    the transcript — a claim without its command output inline is invisible to it.

**A fix failing twice = stop.** Read the whole module, write down where your model was wrong,
fix from the corrected model or file with the writeup — never a third blind patch. Fixes
surfacing new problems in _different_ places aren't descent, they're parallel guesses: the
defect is architectural; file it. Mid-fix interrupts: "how do I know this?" before claims about
unread code; "would a fresh agent continue this path?" when a fix keeps growing.

## 3. Coverage

Lanes ordered by blast radius, walked in rotation, proven by the ledger.

`docs/state/REVIEW-COVERAGE.md` — same discipline as the rest of `ledgers/`: row-per-item, action
recorded the moment it happens (stale ledger = fragmented run: stop, reconcile), kept forever,
dated section per cycle. Per lane: last commit examined, files walked, findings, clean cells —
re-walk only when the examined-commit is stale or a fix landed inside. Findings log:
`id | sev | evidence (file:line) | bucket (§2's six) | catchable?` — catchable = a test/lint/
rule can kill the class permanently. A row citing no files is a template; delete it.

| Lane                     | Territory                                                                                                                                                                        | Why                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Data-integrity spine  | render-core persist/merge/history, working-store carries, autosave/save-queue, bake pipeline, two-tab                                                                            | Scar history: torn pages, manifest drift, carry-drops. It will recur. |
| 2. Untrusted-input seams | `.archie.zip` opens (`publish/open.ts` is the only sanctioned entry — flag bypasses), IIIF ingest + traversal budgets, DOMPurify sites, Tauri CSP + `assertSafeName`, URL params | Static-publishable ≠ safe.                                            |
| 3. Gate-shadow code      | Svelte islands, mount boundaries, OSD/Annotorious, Node-tested-browser-run                                                                                                       | The unbound-fetch bug passed every unit suite.                        |
| 4. Hollow features       | UI element → data writer; schema field → UI setter (declared → honored → settable?)                                                                                              | Issue 13: a shipped collab banner that can never render honestly.     |
| 5. Drift surfaces        | committed `dist/` vs source, published fixtures, README/CONTEXT/ADR claims vs code, overrides vs `ledgers/DEPS.md`                                                               | Artifacts and docs both rot.                                          |
| 6. Dead weight           | unimported components, unwritten localStorage keys, unconsumed exports, orphan CSS                                                                                               | Cut is quality (§4.3), after the metis check.                         |
| 7. Rust shell            | `src-tauri/src`                                                                                                                                                                  | Holds CSP + capability surface — audit rarely, hard.                  |

**Rotation:** lanes 1–2 every other cycle until their clean cells are current; then weighted
round-robin toward the stalest examined-commit. Never camp on a comfortable lane.

Deferrals go to the existing backlog (`sd create`, or `ISSUES.md` on its skeleton — Evidence ·
Lesson · Strength · Status) — no parallel tracker. Check the `## Decided` index and prior
ledgers first: decided rows resurrect only on new cited evidence.

## 4. Judgment doctrine

### 4.1 Evidence hierarchy

> code on disk > a test you just ran > a passing gate > a ledger > a doc > a comment > a commit
> message > your assumption.

Re-verify load-bearing claims against files before recording them. Doc disagrees with code →
the code is right and **the doc is a finding**.

### 4.2 Severity

| Sev | Class                                                                                                                                                         | Rule                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| S0  | Data loss / corruption (torn persist, merge drift, carry-drop)                                                                                                | Preempts all lanes; fixed before anything ships.         |
| S1  | Security (zip open bypass, XSS in labels, CSP gap)                                                                                                            | Preempts feature lanes; ADR if a trust boundary moves.   |
| S2  | Live-wrong behavior (toggle that does nothing; UI that misleads about state)                                                                                  | Fix or cut this cycle; never leave a zombie.             |
| S3  | Gate hole (a gate that can't catch a planted bug)                                                                                                             | The hole IS the finding — close the net, re-baseline.    |
| S4  | Dead code / drift                                                                                                                                             | Cut or correct; filler between heavy findings.           |
| S5  | Performance                                                                                                                                                   | Only with a number (§4.4).                               |
| S6  | Maintainability (duplication, shallow seams, Fowler-smell hits — judgment calls; documented repo standards override the baseline; skip what tooling enforces) | Rides an adjacent S0–S3 fix; never sole cause for churn. |

Same flag type → same severity across cycles, unless impact differs and the row says why.

### 4.3 Cut vs fix vs file

- **CUT** — unreachable, untested, unpromised (no README/CONTEXT/recipe/ADR owes it to a user).
  Two guards: _proven_ dead = checked across direct calls, type refs, string literals, dynamic
  imports, barrels, tests (grep is not an AST); and **the metis check** — messy branches carry
  undocumented load-bearing knowledge; read blame, search ledgers/rules, characterize odd
  inputs. Delete what you can prove dead, not what you can't explain. (Rule of three: an
  abstraction earns its layer at the third instance.)
- **FIX** — promised but hollow or wrong. Wire it or remove it; never leave it half-alive. If
  it exceeds one cycle, ship the smallest honest version and file the rest.
- **FILE** — real but doesn't fit one cycle, or unproven hypothesis. Evidence with `path:line`
  - repro. A filed issue with evidence is a shipped artifact.

**Forbidden fourth option:** rewriting working code because you'd have written it differently.
Taste is not a finding.

### 4.4 Optimization

Pre-commit the acceptance number _before_ measuring, and name the instrument
(`scripts/bundle-size.mjs`, `bundle:check` ratchet, Playwright trace, check counts) — else you
rationalize whatever you get. The `bundle:check` budget is law: bust it, revert. No
micro-optimizing without a profile; regressions you _find_ are S5, perf work you _invent_
without a number is taste.

### 4.5 Never-touch

- **Locked frames** (`CONTEXT.md`): OSD+Annotorious, Studio/Viewer split, WADM, IIIF,
  static-publishable, no server. Friction with a frame → file a Direction, don't refactor.
- **Committed `dist/`** — batch cadence; `pnpm sync-dist:check` is the instrument. No hand-fixes
  outside a release boundary.
- **`apps/viewer/public/published/`** — builds regenerate fresh ULIDs; restore, never commit
  the noise. Generated JSON generally: fix generators, restore outputs.
- **Other sessions' dirty files.**
- **pnpm overrides** — bounded-major rationales in `pnpm-workspace.yaml`/`ledgers/DEPS.md`;
  never bump past a bound without writing the new rationale first.
- **Gate thresholds/baselines** — never weakened to pass.
- **`.archie.zip` format / `archie.json` schema / CSP** — §8 escalations, not cycles.

## 5. The adversarial playbook

**Iterative beats exhaustive:** three short passes, each briefed on the previous pass's actual
failures, beat one long audit. Cheap checks (HTTP 200, green typecheck, plausible grep) verify
little; the real test is the full chain (build → sync → smoke; save → reload → diff).

1. **Hollow-feature trace** (Issue 13) — shipped UI element → trace backward to its data
   writer; grep writers of every localStorage key, schema field, store property.
2. **Round-trip torture** (Issues 19–21) — serialize→deserialize, save→reload,
   import→publish→load per exhibit type; diff field-by-field. Every field survives or is a
   _named_ exclusion in its carry sentinel (`model/carry.ts`) — silence is the finding.
3. **Gate-evasion probe** (Issue 12) — plant a deliberate error per file class (.svelte island,
   studio .ts, .astro, mount boundary, .rs); run the gates; any class passing clean is an S3.
   Remove the plant, close the net. (Precedent: a planted undefined identifier once passed
   `astro check` AND `tsc` clean.)
4. **Browser-or-it-didn't-happen** (bound-fetch-defaults) — Node fetch skips the brand check;
   SSR vitest can't see `$effect`. Anything touching fetch/OSD/canvas/embed is proven only in a
   real browser: build → `pnpm sync-dist` → `node recipes/smoke.mjs`, or Playwright (run-app
   skill). Green units are evidence, never proof.
5. **Drift audit** — regenerate and diff: dist vs source, fixture counts, screenshots. Counts
   and hashes, not vibes.
6. **Hostile-ingest fuzz** (Issue 5) — malformed zips, XSS in IIIF labels, traversal past
   budgets, NUL bytes, `/`,`..`, emoji in names. Parser refuses cleanly; corruption never reads
   as empty (absent ≠ failed).
7. **Error-path forcing** — make every `catch` fire; log-and-continue past corruption or a 500
   mapped to "no data" is a defect nobody has hit _yet_.
8. **Topology probe** — DAG merge never loses a head; autosave interleavings; two-tab races.
   Issues 22/25 hold manual-verify steps in `docs/state/TABS.md`/`MIRROR.md` — verify or close.
9. **Override rationale audit** — per pnpm override: advisory live? bound honored? coexistence
   claim true? Dead exclusion entries are drift.
10. **Claim audit** (CLAIMS.md method) — five load-bearing claims from README/CONTEXT/newest
    ledger, verified against code; correct the doc in the verdict's commit.

## 6. Gates — every merging cycle, never weakened

First nine on every merging cycle; last two scoped by what the cycle touched (the scope
condition is part of the gate). Never invoke root vitest directly — rune tests fail there.

| Gate                | Command                                             | Bar                                                                       |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Typecheck           | `pnpm -r typecheck`                                 | 0 (the real .ts gate — svelte-check relaxes `exactOptionalPropertyTypes`) |
| Tests               | `pnpm -r --no-bail test`                            | all pass                                                                  |
| Studio svelte-check | `pnpm --filter @archie/studio run check`            | 0/0                                                                       |
| Viewer astro check  | `pnpm --filter @archie/viewer run check`            | 0/0/0 (`.astro` only — proves nothing about islands)                      |
| Viewer islands      | `pnpm --filter @archie/viewer run check:svelte`     | 0/0, `--fail-on-warnings`                                                 |
| Build               | `bash scripts/build-gh-pages.sh`                    | clean                                                                     |
| dist mirror         | `pnpm sync-dist:check`                              | clean                                                                     |
| Embed ratchet       | `pnpm --filter @render/archie-viewer bundle:check`  | within budget                                                             |
| Embed smoke         | build → `pnpm sync-dist` → `node recipes/smoke.mjs` | renders in Chromium                                                       |
| Studio e2e          | `pnpm --filter @archie/studio run e2e`              | green — when nav/chrome touched                                           |
| Rust                | `cd src-tauri && cargo check` (+clippy)             | clean — when src-tauri touched                                            |

"Tests pass" means you ran them — paste the summary line. Red → revert to baseline, log, file
if it's a gate hole. Two consecutive reds on one target → bucket it, rotate.

## 7. Git discipline

- **One finding = one branch (`review/<slug>`) = one commit (fix-rounds squashed) = one merge =
  one push.** Nothing accumulates; the push is the save.
- Message in log style (`fix(render-core): <what> (Archie-XXXX)` / `review(lane-4): <finding>`).
  Body: the three §2.6 root-cause answers + the ledger row closed. **No AI attribution or
  co-author trailers, ever.**
- Ledger updates ride the commit that closes their rows — provenance is part of done.
- Merge to main only with §6 green locally; recheck `git branch --show-current` first; main
  moved → rebase, re-gate, merge. CI is confirmation, not the gate — never push red.
- Architecture changes carry their `docs/adr/NNNN-*.md` in the same commit.
- Never commit: regenerated fixtures, `dist/` off-cadence, other sessions' files, weakened gates.
- A cycle is minutes-to-an-hour. A growing fix = ship the smallest honest piece, file the rest.

## 8. Escalation and stop

**Escalate — don't guess — when:** the fix changes the published format, `archie.json` schema,
public API, or CSP; two documented decisions conflict; an S0 has no small fix; you'd force-push,
rewrite history, or touch another session's uncommitted work.

**Dry-streak:** a cycle with no finding and no fix counts only if clean cells were recorded.
3 consecutive dry cycles across distinct lanes → stop, print the coverage map + ISSUES queue,
report diminishing returns; new value needs new attacks or new code. Never manufacture a
finding — a fabricated defect costs more than an idle cycle.

**Compaction:** fine. This file + HANDOFF.md + REVIEW-COVERAGE.md are the full recovery state;
needing more is itself the next finding.

## 9. First-run bootstrap

1. Read: `CLAUDE.md` (context-mode routing — mandatory), `CONTEXT.md`, `docs/GOAL.md`,
   `ISSUES.md`, `HANDOFF.md`, every `.claude/rules/*` — the scar tissue.
2. Run the §6 suite; record the baseline + commit hash in REVIEW-COVERAGE.md.
3. Build the lane map; last-examined = HEAD.
4. Issues 13, 14, 16, 17, 18, 22, 25 were live at last tend pass — verify still live (the code
   may have moved), then take one as cycle 1 or start Lane 1.

## 10. Running under /goal

The evaluator is a small model reading **only the transcript** after each turn — no commands,
no files. Three rules follow. (1) This file is doctrine; the condition is a short contract.
(2) Every clause in the condition names the **command output that proves it** — "the
refactoring is complete" is invisible to the evaluator; "git show --stat lists the ledger" is
checkable. Hidden-state clauses ("gates never weakened") become visible via their instrument
(the `--stat` file list shows no gate config touched). (3) Buckets must be exhaustive — a
condition counting only "fixed" bounces until findings get bent into "fixed" (a blocked target
gets a substitute dressed as the original). Refuted / clean-cell / filed / escalated advance
the goal equally.

**Condition template** (set N; run bounded batches, re-invoke — not one eternal goal):

```
/goal Run the adversarial review loop per .claude/goals/adversarial-review.md. Done when the
transcript contains EITHER (a) 111 reports headed "CYCLE <n> [<bucket>]", (b) 5 consecutive
reports headed "CYCLE <n> DRY" on distinct lanes. If there is a report headed
"ESCALATION: <question>" awaiting the user park it to a seeds(sd --help) ticket. A CYCLE report counts ONLY if
it shows: lane + attack; exactly one bucket per finding from {fixed@<hash>, filed <id>,
cut@<hash>, refuted-because, clean-cell, escalated}; the pasted summary line of every gate
run; and, for fixed/cut, pasted output of `git log origin/main -1 --oneline` (push proof)
and `git show --stat <hash>` (file list must include docs/state/REVIEW-COVERAGE.md and no CI or
gate-config file). Non-merging buckets state "no merge: <bucket>". A DRY report counts ONLY
with its clean-cell rows pasted. Honest buckets count toward N equally with fixed — never
bend a finding into "fixed" to satisfy the count. Stop retrying any target after 2
consecutive gate reds — bucket it and rotate.
```

Cautions: pair with auto mode or turns stall on permission prompts. Never run concurrently
with the product /goal in one checkout — commits interleave; alternate, or isolate in a
worktree. Bounded N = a human checkpoint per batch. An evaluator bounce almost always means
the transcript lacked proof, not that the work is undone — paste the missing evidence, don't
re-assert.

## 11. The standing orders, in one breath

Prove it or file it. Refute before you fix; root cause before you patch. Data loss before
security, security before honesty, honesty before dead weight, dead weight before speed, speed
before beauty. Cut what's unpromised (after the metis check), fix what's promised, file what
doesn't fit. One finding, one commit, one push — the push is the save. Gates are never
weakened, frames are never relitigated, taste is never a finding, decided rows never resurrect
without new evidence, and a green suite is evidence — never proof. The codebase is lying to you
somewhere right now. Go find where.

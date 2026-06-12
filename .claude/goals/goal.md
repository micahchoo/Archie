---
description: Run the Archie product-management loop — continuous, gated, auto-merging cycles toward the north-star in docs/GOAL.md
---

You are the **product-managing team** for Archie. Your charter, priorities, measurable gate,
scope rails, runner, and current baseline live in **`docs/GOAL.md`** — read it in full now,
before anything else. It is the source of truth; this command is only the procedure.

This is **one continuous run**: execute cycles back-to-back until the work is dry (GOAL.md §4a:
3 consecutive dry cycles) or the user interrupts. Do not ask to be re-run. Do not schedule the
next cycle on a guessed interval. Rely on auto-compaction; after a compaction, re-read
`docs/GOAL.md` and resume the loop.

## Each cycle (one improvement, one atom, one commit)

1. **Re-read `docs/GOAL.md`** and re-measure the **live baseline** with the canonical runner
   (`COREPACK_ENABLE_DOWNLOAD_PROMPT=0 npx --yes pnpm@9 …`, GOAL.md §7): typecheck, tests,
   bundle. Record the before-numbers. Browser scalars (UX heuristics, a11y, render timing,
   links) via **Playwright + Chromium** (`reliable-test-loop` Tier 3) — never lightpanda.

2. **Pick exactly one improvement**, in priority order (GOAL.md §2): look → feel → performance
   → good features. Prefer the smallest cycle that moves a Family-B scalar. **When the slot is a
   feature**, draw the **highest-priority unblocked item from the researched contributor-broadening
   backlog** (`sd ready | grep -i contributor`; full ranking in GOAL.md §5a +
   `docs/research/contributor-appeal/00-SYNTHESIS.md`), in tier order — never skip a tier for a
   lower-leverage item. Backlog items are **already §5-qualified**; a *new* idea outside the backlog
   must still pass the user-serving test (GOAL.md §5) or **`sd create` and defer**. If the chosen
   feature is bigger than one gateable cycle (e.g. Tier-0 ①), **decompose it into gateable sub-cycles**
   (GOAL.md §5c) and take the first — do not defer the whole feature.

3. **Branch.** `git checkout -b goal/<short-slug>` off `main`. Never edit `main` directly.

4. **Implement** the one change. Match surrounding code. **For a feature cycle, FIRST do the targeted
   pre-build research** (GOAL.md §5b.1): scout the donor + prior-art `relpath:line` the seed cites,
   query `mcp__context__get_docs` for any library in `.claude/rules/deps-index.md`, cache durable
   findings to mulch `product-research` — then implement. If it changes architecture, write the
   `docs/adr/NNNN-*.md` or a mulch `decision` record **in the same commit** (GOAL.md §6).

5. **Code-review (feature cycles)** — dispatch the `code-reviewer` subagent (or `requesting-code-review`)
   on the diff vs the plan + the perfectionist-dev bar; fix what it flags **before** gating
   (GOAL.md §5b.3). Look/feel/perf/bug cycles skip this unless the diff is non-trivial.

6. **Measure after** — rerun every Family-A gate and the Family-B scalars you targeted.

7. **Gate** (GOAL.md §3):
   - **Pass** = every Family-A gate green (no regression vs baseline) **and** ≥1 Family-B
     scalar improved with none regressed → commit (one atomic commit), checkout `main`,
     fast-forward merge, delete the branch.
   - **Fail** = any Family-A regression or zero Family-B improvement → discard the branch
     (`git checkout main && git branch -D goal/<slug>`). `main` stays untouched. Count the
     cycle as **dry**.
   - Never weaken a gate or threshold to force a pass.

8. **Record & report** (keep it short — the run must stay legible across compactions):
   one line of what changed, before→after scalars, verdict (merged / reverted), and anything
   filed to seeds. Update `docs/bundle-size.json` if bundle numbers moved. Then **start the
   next cycle automatically.**

## Stopping

Track a dry-streak. After **3 consecutive dry cycles**, stop and summarize the deferred-seeds
backlog for the user. Also stop if the same gate goes red twice on the same target — file a
seed instead of retrying. Otherwise keep going.

## Hard rails (from GOAL.md §6 — do not violate)

- Respect the locked frames in `CONTEXT.md` (OSD+Annotorious, Studio/Viewer, WADM, IIIF, static, no server).
- One improvement per cycle. Bigger than one gateable cycle → seed and defer — UNLESS it's a *large*
  item already on the §5a backlog, which is **decomposed into gateable sub-cycles** (§5c), not shelved.
- Look & feel outrank features. Features come from the **researched contributor-broadening backlog**
  (§5a) in tier order — don't add surface that isn't on it (and isn't user-serving-tested per §5).
- Feature cycles do **targeted pre-build research** (§5b.1) and a **code-review before the gate**
  (§5b.3). No feature reaches the gate un-researched or un-reviewed.
- Architecture changes carry their own ADR/mulch provenance in the same commit.

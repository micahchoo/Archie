---
scope:
  - "hubs/**"
  - ".claude/rules/**"
  - ".seeds/**"
  - "ledgers/**"
  - "docs/agents/**"
updated: 2026-07-28
---
# process
> *how do agents work in this repo?*

This is the territory of working AS a fleet in this repo, not any one feature: worktree
discipline when agents share a checkout, `.seeds` as the single issue tracker (`sd`,
`docs/agents/issue-tracker.md`), the commit-message conventions that make `git log`
searchable, and the counting/verification traps that make a green run or a clean `git
diff` misleading. The one gate that matters here is `node scripts/doclint.mjs` — it is
the mechanical check over the knowledge layer itself (see `ledgers/DESIGN-knowledge-layer-2026-07-27.md`
§2 Q6, §3b) and is what enforces the closure convention below; wired into CI 2026-07-27
(job `doclint` in `.github/workflows/checks.yml`, full-history checkout).

## Binding rules
- [[shared-worktree-agent-collisions]] — two agents in one checkout turns safe git habits (`add -A`, `commit -a`, `restore --source=HEAD`, remembering your own branch) into destructive ones; pass `isolation: "worktree"` and verify with `git worktree list`.
- [[post-review-fixes-are-unreviewed]] — a fix written after sign-off is unreviewed by default; red-green it like anything else, and reconcile every reported count against one you actually read (a gate's own reference point must not be writable by the thing it gates).
- [[a-green-run-is-one-sample]] — a red-green proves an assertion CAN fail; it says nothing about whether it passes reliably — run order-sensitive assertions N times before trusting them.
- [[prior-art-citation-discipline]] — a citation that reads plausibly and is never re-opened is the recurring failure (7 bad ones caught in one session); open the file, grep where a thing is USED not just defined, cite to the line.

## Decisions
- Archie-1f60 — first exercise of the accretion rewrite: svelte-no-typecheck-net cut ~110→61 lines, evidence kept, correction-narrative dropped; the doclint accretion exemption list is empty again.
- Archie-1a47 — worktree "drift" was a measurement artifact (diffed against a stale ref); 11 merged checkouts pruned, prune criterion recorded in `ledgers/AUDIT-worktrees-2026-07-27.md`.
- (prior-art deep pass, no ticket) / 1e7809d — clover-iiif/mirador/universalviewer promoted from three chrome-placement rows to full clone-verified pages; **a standing correction of ours was itself refuted** ("universalviewer's suite never touches the network" — it is puppeteer-driven against live remote manifests). A correction outlives the error it replaced and nobody re-opens it: re-verify corrections on the same terms as claims.
- Archie-e149 / 4f7636f — ledgers/ is dated-only by predicate; standing docs moved to docs/state/; dated ledgers + .seeds bodies keep historical paths (immutable evidence).
- Archie-098f — toolchain & docs pipeline tend epic closed; its children are the process-tooling ratchets below.
- Archie-9140 / 7a07cd9 — harness consolidation: two rotted drive-and-shoot verifiers deleted with coverage proof (behavior moved to unit + e2e), one shared driver.mjs kept.
- Archie-b975 / 329ee4d — screenshot capture gate wired with no exit-0 escape (zero skips, per-viewport, size floor); wiring it exposed month-old rot the old gate had stopped catching.
- (doclint itself, no ticket) / a3fd4d8 — deterministic knowledge-layer gate shipped, 10 checks, born red on 2 real standing findings (undated ledgers, svelte rule 4x accretion) — proves the gate can fail before being trusted, per this design's own §2 Q6.

## Evidence
- `scripts/doclint.mjs` — 10 checks (dangling `[[links]]`, dead scopes, stale hubs via `git log -1 -- <scope>` vs `updated:`, INDEX drift, ticket/sha pointer integrity, untracked docs, declared mirrors, ledger date-naming, rule-accretion count, scope-coverage totality); all scope/link checks run against `git ls-files` — an **uncommitted** hub or rule file is invisible to it.
- `docs/agents/issue-tracker.md` — `sd` conventions: claim with `--assignee`+`--status in_progress` before working, `sd dep add` for blockers, `sd ready` for the frontier, close with `--reason` carrying the answer, not a restatement.
- `git log --oneline` — the live commit-message convention: `close: Archie-xxxx — <verdict>`, `<type>(<slug>): <description> (Archie-xxxx)`, `rule: <what changed>`, `docs(<slug>): <what was recorded>`. Ticket id in parens or after a colon is what makes `git log --grep Archie-xxxx` work.

## Open & hazards
- `sd list` silently truncates at 50 and prints no notice — a backlog count taken from it undercounts; use `sd stats` to reconcile, or `sd list --limit 500 --json` to enumerate. Two independent people derived a wrong count from the default limit in one session before the tell (`sd stats` disagreeing) was noticed.
- `.seeds/issues.jsonl` is ONE shared file — `git add .seeds/` is a precise path and still sweeps every other agent's concurrent ticket edit into your commit. Diff the set of ids, not the line count, before committing it.
- Ledger files recur with embedded NUL bytes (hit `docs/state/CANON.md`, `ledgers/ANTIPATTERN-SWEEP-2026-07-19.md`, this design doc itself, among others) — plain `grep` silently reports zero matches; use `grep -a` or `fff`/`file(1)` to confirm before trusting a no-match result.
- The stale-hub closure convention (`ledgers/DESIGN-knowledge-layer-2026-07-27.md` §3, row 1) is live in CI as of 2026-07-27: a diff touching a hub's scope without moving the hub is a red build, not a silent gap.

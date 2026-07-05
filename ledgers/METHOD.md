# METHOD — implementation-strategy methodology refresh (ISSUES.md Issue 10)

Diff taken 2026-07-05 against `docs/IMPLEMENTATION-STRATEGY.md` lines 1-261 (the process/methodology
sections above its "Deferred-work registry", which is Issue 2's already-resolved territory). Checked
every named tool/skill against the current available skill list and this repo's actual working
convention (the `tend` skill, `ISSUES.md`/`ledgers/`, ADRs, `docs/decisions/`).

Columns: passage/tool | current replacement (if any) | resolution.

| passage/tool | current replacement | resolution |
|---|---|---|
| `sd`/seeds DAG, `sd ready`, `sd-next.sh --parallel`, `sd prime`, `append-attribution.sh` | none — gone entirely. `ISSUES.md`/`ledgers/` (the `tend` convention) is this repo's actual live backlog, but it is NOT a dependency-graph/DAG-enforcement tool | rewrite — describe the ordering *principle* (sources before projections) without claiming an enforcement tool exists; name `ISSUES.md`/`ledgers/` as the real current backlog |
| `mulch`, `mulch prime`, `mulch-prime-cache`, "mulch infra/meta", `decision-record.sh` | ADRs (`docs/adr/`) + `docs/decisions/` (Q-N citations) — already this repo's real, live decision-citation mechanism (used elsewhere in this same document and in README, independent of mulch) | rewrite — replace "mulch Q-N" with "ADR / `docs/decisions/` Q-N citations"; drop the script name |
| `gate-enforcer` (a named verifying agent) | no direct replacement for the wave/seam-specific audit role; `code-review` skill covers the general "verify tests are meaningful" concern | rewrite — replace with "a `code-review` pass"; note the cross-worker-seam-specific audit has no current equivalent, described as manual review |
| `qmd` | no replacement — `grep`/`fff` (already this repo's real retrieval layer per CLAUDE.md routing) cover code retrieval; no markdown-specific decision-recall tool exists | rewrite — describe retrieval via grep/fff over the repo's markdown + `docs/adr/`, drop "qmd" |
| `foxhound` | none — undocumented beyond "wave-dispatch envelope"; ceremony tied to the dead `sd`/`mulch` system | remove — no concept survives worth preserving in different words |
| `record-extractor` | `HANDOFF.md` (actively maintained per this repo's `CLAUDE.md`) covers "write state back for the next session"; `tend`'s harvest pattern covers "extract lessons" | rewrite — replace with "update `HANDOFF.md` + the relevant ledger" |
| `dispatching-parallel-agents` (named skill) | the `Agent`/`Workflow` tools — parallel dispatch is now a tool-level capability, not a named skill | rewrite — replace with "the Agent/Workflow tools' parallel dispatch" |
| `strategic-looping` | none — no direct replacement for "pause-and-reflect at a phase boundary" | rewrite — describe as a manual practice, drop the skill name |
| `failure-capture`, `[SNAG]` inline capture | `systematic-debugging` skill is the closest live analog for root-cause diagnosis (not identical to "capture a surprise inline", which needs no specific tool) | rewrite — replace the skill reference with `systematic-debugging`; keep `[SNAG]`-style inline capture as a still-valid practice, not a tool claim |
| `requesting-code-review` (skill name) | `code-review` skill — exists, same role | rewrite — rename |
| `verification-before-completion` (skill name) | `verify` skill — exists, exact conceptual match ("verify a change actually does what it's supposed to") | rewrite — rename |
| `/thermo-nuclear-code-quality-review`, "thermonuclear review" | `/code-review ultra` (multi-agent cloud review) — this session's own operating guidance maps this directly | rewrite — rename; plain `code-review` skill for the non-ultra case |
| `code-reviewer` / `requesting-code-review` / `/ultrareview` (line 73's own parenthetical, describing a historical tool transition) | n/a — this sentence describes the OLD doc's internal history, not current tooling | simplify — drop the historical aside, it no longer resolves to anything a reader needs |
| `test-driven-development` (skill name) | `tdd` skill — exists, same concept | rewrite — rename |
| `characterization-testing`, `writing-plans`, `executing-plans`, `brainstorming`, `systematic-debugging`, `Explore` (agent type), Docs MCP `get_docs` | all exist exactly as named | accurate — no change |
| `4-Invariables Pre-Ship Gate` | not in Issue 10's named tool list; no evidence found either way | left as-is — out of this issue's scope, not confirmed dead |

## Resolution

Preserved (this issue's own instruction — a methodology refresh, not a deletion sweep): the three
ordering principles, the phase definitions (0–3 + Continuous), the classification/parallelism section,
the validation-gate mechanism, the reducibility classifier, the "deceptively-simple" detector table,
and the enumerated-vs-discovered boundary logic — none of these depend on named dead tooling, they're
the document's real, load-bearing ideas.

Rewrote: "Tactics & tooling", "When the implementer is an LLM", the phase→skill table in "Mechanical
decomposition", "Pre/post review per task/wave/phase", and "Context-load per step" — these five
sections carried nearly every dead-tool reference, since they're where the doc gets concrete about
*how* to execute rather than *what* to build.

**Done 2026-07-05** (`8047626`): every named tool/skill from the issue's list is confirmed live,
renamed to its current equivalent, or removed with a one-line note on what (if anything) replaced it.
No structural content deleted — every rewritten passage keeps the same claim, pointed at what's
actually here today. Recheck: `grep` for every named dead tool across lines 1-261 post-edit returns
zero hits.

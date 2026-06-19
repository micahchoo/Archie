---
name: librarian
description: >-
  Manage the project .claude/ directory — organize, audit, split, migrate, catalog,
  archive, prune, index, and persist reference docs. Triggers on: "librarian",
  "organize claude", "audit .claude", "split CLAUDE.md", "catalog", "archive context",
  "persist this", "save reference", "index the docs", "clean up .claude".
  Also triggers automatically at session start in any project with a .claude/ dir
  (deploy-librarian.sh copies this skill there).

  Do NOT use for: ~/.claude/ personal config management, git operations, or
  project code organization outside .claude/.
compatibility: Requires bash and git; auto-deployment into projects depends on ~/.claude/scripts/deploy-librarian.sh (SessionStart hook). Optional qmd for index duties.
metadata:
  version: "1.0.0"
  domain: workflow
  triggers: find document, search knowledge, look up skill, locate reference, knowledge base search
  role: specialist
  scope: analysis
  output-format: analysis
  related-skills: hybrid-research, qmd
---

# Librarian

**Deepen:** `simplify` — prune docs; compression test catches decoration.

Steward project `.claude/`. Maximize what's committed and team-shared; minimize what leaks to `~/.claude/` (personal only). Test: "Would a new teammate benefit?" → project. Otherwise → personal.

`.claude/` is a level-stack: CLAUDE.md (principle — identity, stack, commands) → rules/ (pattern — path-gated conventions) → skills/ (instance — multi-file workflows) → docs/ (situated reference snapshots). Bridges live in INDEX.md and `@`-includes; when they break, the levels read as disconnected pieces. Subtraction usually beats hierarchy: deleting a stale rule outperforms refining one nobody runs.

Scope is the project tree only. `~/.claude/` itself is out of scope except for Duty 10's reference-docs stewardship.

---

## Cached Signals (check before acting)

SessionStart hooks already flagged work — read the caches, don't re-derive. Canonical map: `~/.claude/docs/ref-skill-recommendation-map.md`.

| Cache / producer | Finding shape | Maps to duty |
|---|---|---|
| `readme-seam-check.sh` stdout (SessionStart) | `R1` setup-cmd refs missing files · `R2` dir refs don't exist · `R3` dep-count drift · `R4` lang claims wrong · `R5` README stale vs commits · orphaned plans >30d · specs w/o status frontmatter | §6 persist, §1 catalog, §5 prune |
| `observability-scan.sh` stdout (SessionStart) | `[HIGH] orphan` write-only outputs · `[MED] drift` doc↔code · `[LOW] tool-gc` stale `/tmp` | §1 orphan detection, §5 prune |
| `metastructure-audit.sh` (on-demand) | top-level dir missing MANIFEST · depth >6 · `drafts/`/`spikes/` without EXPIRATION · `generated/` without GENERATOR · `shared/` without manifest · cross-world refs without provenance | §3 split, §8 cross-ref |
| `measure-leverage.sh` stdout (SessionStart) | `M2` deprecated references in active skills · `M8` memory files without TTL frontmatter | §1 catalog, §4 migrate |
| `check-memory-freshness.sh` (SessionStart) | memory files >30d without verification | §5 prune / freshen |
| `expertise-vs-antipatterns.sh` → seeds `expertise-gap` label | mulch domain where anti-pattern density > pattern density | §6 persist |
| `claude-md-nudge.sh` stdout (SessionStart) | project CLAUDE.md absent | §3 split (bootstrap from nudge template) |
| `.claude/SUGGESTED_SKILLS.md` (skill-recommendation-aggregator) | ranked candidates with evidence | §9 triage |

Gate: act only on a signal whose cache exists this session (absence ≠ clean — producer may have failed). Cite the cache path and finding line in any recommendation.

---

## Auto-Deploy

Self-installs into any project with `.claude/` via `deploy-librarian.sh` (wired to SessionStart). Manual bootstrap:

```bash
mkdir -p .claude/skills/librarian
cp ~/.claude/skills/librarian/SKILL.md .claude/skills/librarian/SKILL.md
git add .claude/skills/librarian/SKILL.md
```

Refresh from user-level: `bash ~/.claude/scripts/deploy-librarian.sh --force`.

---

## Duties

### 1. Catalog & Index

`.claude/INDEX.md` is the manifest — every file, purpose, last-updated. Reconcile with `find .claude/ -type f | sort`. Flag orphaned (no inbound ref), stale (no commits in 30d — `git log --since=30.days .claude/`), duplicate (same content twice).

### 2. Audit & Diagnose

- CLAUDE.md >80 lines → recommend split to `rules/` (Duty 3).
- Project-specific content hiding in `~/.claude/` → offer migration (Duty 4).
- `.claude/.gitignore` covers `settings.local.json` and optionally `agent-memory/`.
- Rules mentioning specific dirs but missing `paths:` frontmatter → path-gate them (Duty 7).
- Content repeated across skills/rules → extract to `docs/`, `@`-include (Duty 8).

### 3. Split CLAUDE.md

When bloated, decompose:

| Content type | Destination |
|---|---|
| Code style/naming | `rules/code-style.md` |
| Architecture/layers | `rules/architecture.md` |
| Test conventions | `rules/testing.md` |
| Path-specific guidance | `rules/<topic>.md` with `paths:` frontmatter |
| Build/test/lint commands | Keep in root CLAUDE.md (<40 lines after split) |

### 4. Migrate Personal → Project

Project knowledge in `~/.claude/` → `.claude/`. Copy across, verify via `/memory` or `/skills`, then delete original only with explicit user approval.

### 5. Prune & Archive

Rules/skills with no invocation history (`git log --oneline -- .claude/<file>`) are candidates. Before deletion, move to `.claude/archive/` with datestamp prefix: `2026-04-09_old-rule.md`. Also prune `docs/` entries no skill references. The pruning instinct should be Monderman: ask whether removing the rule outperforms refining it — a "clean" rule nobody invokes costs context every session and prevents nothing.

### 6. Persist Reference Docs

When the session produces something worth keeping — decision, API gotcha, architecture conclusion, research finding — write a timestamped snapshot:

```
.claude/docs/ref-YYYY-MM-DD-<slug>.md
```

```markdown
---
created: 2026-04-09
source: conversation / web search / file analysis
tags: [api-design, migration]
---
# <Descriptive Title>

<Compressed, actionable. Bullets fine. No filler, no hedging.>
```

≤60 lines per doc; split by topic if longer. Strip examples unless they're the point. Add to INDEX.md immediately. Skills reference via `@.claude/docs/ref-YYYY-MM-DD-slug.md`.

Proactive triggers (don't wait to be asked): user states a design decision verbally · research yields a non-obvious API gotcha · debugging reveals a root cause not obvious from code · architecture discussion produces conclusions.

### 7. Path-Gate Rules

Any rule scoped to specific directories needs `paths` frontmatter so it doesn't burn context when Claude works elsewhere:

```yaml
---
paths: src/frontend/**
---
```

### 8. Cross-Reference

Before embedding content in a new rule/skill, check `docs/` and `@`-include instead. One source of truth per topic — duplicated content reifies into two truths that drift, and the reader can't tell which is load-bearing. If the same shape appears in 3+ places without an `@`-include, extract; two is coincidence, three is a pattern (rule of three).

### 9. Skill Recommendation Triage

When `.claude/SUGGESTED_SKILLS.md` exists (written by `skill-recommendation-aggregator.sh` at SessionStart):

1. Present each candidate to user with its evidence lines.
2. User picks **install** (copy SKILL.md from user-level into `.claude/skills/<name>/`), **defer** (leave in suggestions), or **dismiss** (append name to `.claude/.skill-recommendations-dismissed`; 3 dismissals = 30d suppression).
3. After processing, delete `SUGGESTED_SKILLS.md` (regenerated next session).
4. Closing the loop: if user installs a skill that wasn't on the list, ask "what signal would have caught this?" and add a row to `~/.claude/docs/ref-skill-recommendation-map.md`.

### 10. User-Level `~/.claude/docs/` Maintenance

Librarian also stewards user-level reference material extracted from CLAUDE.md: `ref-vocabulary.md`, `ref-infrastructure-topology.md`, `ref-agent-roster.md`, `ref-artifact-verification.md`, `ref-cognitive-guardrails-table.md`, `ref-gram-flags.md`, `ref-skill-recommendation-map.md`.

Naming:
- `ref-<slug>.md` — durable reference, lives until superseded.
- `ref-YYYY-MM-DD-<slug>.md` — timestamped snapshot (research finding, decision context).

When CLAUDE.md grows past ~350 lines again, audit for extraction candidates: tables, glossaries, lookups — anything consulted on trigger rather than every turn.

---

## Target Structure

```
project/
├── CLAUDE.md                    # <40 lines: identity, stack, commands only
├── .mcp.json                    # Team MCP servers
├── .claude/
│   ├── INDEX.md                 # Manifest of everything below
│   ├── settings.json            # Permissions, hooks, env vars
│   ├── settings.local.json      # Personal overrides (gitignored)
│   ├── .gitignore
│   ├── rules/                   # Auto-loaded, path-gatable
│   ├── commands/                # /project:name slash commands
│   ├── skills/                  # Multi-file workflows (this file lives here)
│   ├── agents/                  # Subagent definitions
│   ├── docs/                    # On-demand reference (not auto-loaded)
│   │   └── ref-YYYY-MM-DD-*.md  # Timestamped context snapshots
│   ├── output-styles/           # Custom formatting
│   └── archive/                 # Datestamped retired files
```

What stays in `~/.claude/`: personal tone prefs, cross-project shortcuts, personal MCP servers, personal permission overrides. Nothing project-specific.

---

## Diffusion Triggers

| Upstream skill | When to route here |
|---|---|
| `hybrid-research` | After synthesis — persist key findings as reference docs |
| `brainstorming` | After design doc written — catalog it in INDEX.md |
| `handoff` | Before writing HANDOFF.md — persist context that outlasts sessions |
| `executing-plans` | After plan completion — archive the plan, update INDEX.md |
| `codebase-diagnostics` | After analysis — persist architecture findings as ref docs |

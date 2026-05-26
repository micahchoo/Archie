---
status: accepted
date: 2026-05-24
---

# The annotation spine: append-only log → version-parent DAG → three-way merge without git → heads/history WADM serialization

**Context & decision.** This is one ADR, not three, because the pieces form a single argument and constitute a **data-model decision** (each piece looks like an implementation choice in isolation; together they are the model). Each Note carries `{logicalId, version:int, parent, modifiedAt, lastEditor:clientId}`. The annotation store is an **append-only log** — edits bump `version` and keep the prior version (the parent chain); deletes are tombstones; logical IDs and version IDs are never reused. This is locked for **both** scholarly citation integrity (provenance) **and** a genuine async multi-author zip-exchange workflow (the Review-Changes merge UI), accepted knowingly as v1 scope despite neither being maximally minimal.

**The argument chain.** Append-only enables stable **logical IDs**; logical IDs + immutable versions form a **version-parent DAG**; the DAG yields **three-way-merge semantics without git** (the merge-base for any two heads is found by walking the parent chain); and a **heads-projection / history-sidecar** serialization preserves all of it for external WADM consumers.

**Merge.** Compare heads per `logicalId`: same version → no card; one side fast-forwarded (its parent is the other's head) → no card; both advanced from a common ancestor → a manual conflict card. Wall-clock `modifiedAt` is **only an in-card tiebreaker** — never the primary auto-resolution signal, because clock skew makes timestamp-LWW a silent data-loss bug. Most "conflicts" in async-zip exchange are fast-forwards in disguise (disjoint note sets).

**WADM serialization (heads + history, "log + projection").** The canvas `AnnotationPage` that viewers load contains **only head version(s)** — plural after an unresolved concurrent merge, because showing both competing overlays is *honest* degradation, not a bug. Full version chains persist per-`logicalId` as WADM `AnnotationPage`s at `annotations/history/{logicalId}.json`, indexed by `annotations/history/index.json` (the merge load target; per-note pages are citation-dereference targets). Heads link out via `archie:hasHistory` (→ history page) and `prov:wasRevisionOf` (→ prior version id); pure consumers ignore both. Versioned id = `{logicalId}/v{n}` (a resolvable path on a static host). A "compile heads page" step in the Studio publish pipeline is a pure, idempotent function of the log.

**Three-tier interop contract:** pure WADM consumer → current state; PROV-aware consumer → history; Archie viewer → full DAG. Each strictly more informed; none broken.

## Rejected alternatives (one per layer — each is information that would otherwise be re-derived)

- **Mutation-in-place** (vs append-only) — rejected for provenance: destroys the prior version, breaks citation stability, makes the version DAG impossible.
- **Two-way merge, every diff a card** (v4 literal) — rejected: discards the common ancestor the append-only DAG hands you for free, producing maximal manual friction and no auto-resolution.
- **Pure wall-clock LWW** — rejected: clock skew (routinely 1–30s) silently loses the older-by-the-clock-but-actually-later edit.
- **git-on-folder for three-way merge** — rejected: line-diff-on-JSON is the wrong granularity for annotations, and it leaks git into a no-terminal product; the parent DAG gives three-way *semantics* without git.
- **All versions in the canvas AnnotationPage, flag non-heads** — rejected: a pure WADM consumer doesn't know the flag and renders *every historical version* as a live overlay (v1, v2, v3 stacked) — breaks graceful degradation.
- **History in a non-WADM store** — rejected: prior versions stop being dereferenceable WADM resources, surrendering the citation-integrity reason append-only was locked for.

## Consequences

- **Append-only does not serve a future Yjs path** (Yjs uses its own Y.Doc CRDT, not a WADM substrate) — it is justified by provenance + the zip-merge DAG, *not* by collaboration-via-Yjs. Record this so the justification isn't mis-cited later.
- The **merge conflict-card UI is the one interactive/stateful projection** in the architecture (computed at resolution time over two diverging logs) — highest implementation-risk-per-line; the place "thin projection" strains hardest. Its UI + the async-zip exchange manifest + review-workflow affordances are ~4–6 weeks of work not derivable from the locked frames.
- `version` increment + parent pointer must be written on **every** edit from day one — retrofitting the DAG onto a mutable store is the expensive path this ADR exists to avoid.

## Refinement — 2026-05-25 (found during P0-4 implementation)

**Finding.** The original model conflated two distinct ids onto `{logicalId}/v{n}`: the **citation IRI** (a resolvable, human/scholar-facing path) and the **DAG-node id** (the `parent` pointer). These cannot be the same identifier under concurrency. First-order concurrent edits (Alice v2 + Bob v2, both from v1) collide on `{logicalId}/v2`; worse, a resolution version v3 with `parent = {logicalId}/v2` is **ambiguous** between the two concurrent v2s — version-id-as-parent-pointer fails on second-order lineage. Renumbering the incoming branch was rejected (Q-6): it would break the citation integrity that justifies append-only in the first place.

**Decision (amends the data-model spine).** Each record carries a separate **`rev: RevId`** — a per-record-unique ULID, the DAG node id. `parent: RevId | null` points to `rev`, never to the version id. The DAG (ancestors / common-ancestor / merge classification) walks `rev`. `version: number` and the `{logicalId}/v{n}` IRI are retained as the **citation projection**, emitted by serialization (P0-6) and disambiguated *only on collision* (the narrowed scope of Q-6 — the existing/earlier record keeps its IRI, a later-arriver gets a deterministic suffix, preserving prior citations). This follows git's model exactly: commit hash = `rev`, parent = hash, tag/version = human-facing ref.

**Rejected:** content-hash as `rev` — it silently coalesces two *genuinely concurrent* edits that happen to produce identical content into one node (and an unchanged-body delete still needs a fresh id). A ULID per record keeps "same edit event" distinct from "same data."

Doing this in Phase 0 honors the line above (retrofitting the DAG is the expensive path). Q-6 narrows from "collision scheme TBD" to just the serializer's collision-suffix rule.

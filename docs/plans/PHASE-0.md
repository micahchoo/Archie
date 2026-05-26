# PLAN — Phase 0: Skeleton, seams & the data-model spine

> **STATUS: COMPLETE (2026-05-25).** All 9 leaf tasks closed; 96 tests green; typecheck clean;
> the pure-WADM-consumer interop GATE (P0-7) passed. See `HANDOFF.md`. ADR-0003 was amended
> mid-phase (added `rev`). Next: Phase 1 decomposer pass.


Decomposer pass (strong-model `writing-plans` + TDD) for Phase 0 of `IMPLEMENTATION-STRATEGY.md`.
Phase 0 is **serial Prep, NOT dispatch** (strategy §180). One executor (this session), test-first throughout.

Implements: ADR-0002 (package boundaries), ADR-0003 (annotation spine — the keystone).
Donor source verified present: `anvil/app/src/lib/**` (spike 0001).

## Frozen "Phase 0 done" checklist (hard gate to Phase 1 — strategy §195; do not move goalposts)

- [ ] pnpm workspaces bootstrap; `pnpm test` runs across packages.
- [ ] Packages exist with declared boundaries: `@render/core`, `@render/mount`, `@render/svelte`; apps `studio` (Svelte SPA), `viewer` (Astro + Svelte islands). Stubs OK — *the boundary is the contract*.
- [ ] Data-model corpus GREEN:
  - [ ] append-only log: append never mutates; version increments; deletes = tombstone versions; ids never reused.
  - [ ] version-DAG merge: fast-forward (no card), concurrent-from-common-ancestor (card), ancestor-walk finds exact common ancestor; `modifiedAt` is in-card tiebreaker ONLY (does not drive primary auto-resolution).
  - [ ] heads-projection: idempotent; plural heads after unresolved concurrent merge; single head after FF.
  - [ ] WADM round-trip for **rect + polygon** (the adopted v1 shape vocab).
  - [ ] history sidecar: `{logicalId}/v{n}` ids; `annotations/history/{logicalId}.json` + `index.json`.
  - [ ] **pure-WADM-consumer interop (THE GATE)** — naive consumer sees exactly one head/logicalId, zero history leak.
- [ ] `Filesystem` seam declared as an interface (no backends — those are Phase 2).
- [ ] CLEAN-LIFT pure modules present + tested: URL↔selector, geometry/selector parsing, IIIF resolution.
- [ ] EXIF 8-orientation **fixture set** present (no consumer test — wired when EXIF lands, orphan-gate §39).
- [ ] Q-N minted for ADR-0001..0004 + source/projection principle.

## Locked tooling (do not relitigate — strategy §6, ADR guardrails)

- pnpm workspaces · TypeScript strict · vitest (Docs-MCP indexed, strategy §70).
- Branded types = **plain TS** (anvil ADR-0029 pattern), NOT zod/arktype/valibot.
- Svelte everywhere (ADR-0002): studio = Svelte SPA (Vite); viewer = Astro + Svelte islands.
- No wasm-vips (ADR-0004). No shared object pool (ADR-0001). No React adapter (ADR-0002).

## Reducibility note

Data model is **greenfield-specifiable**: no donor, but binary tests *are* writable → the test corpus IS the enumeration (strategy §174, §224). One test ⇄ one task. Pure modules are **adopted** (donor-defined). Neither is invented-UX → no human gate in Phase 0; the corpus is the review.

## Leaf tasks (rigid schema; execute in order — source before projection)

```
TASK P0-1  scaffold
  implements:    ADR-0002 (Q-2)
  donor:         greenfield-per ADR-0002
  write-targets: pnpm-workspace.yaml, package.json, tsconfig.base.json, vitest.config.ts,
                 packages/render-core|mount|svelte/{package.json,tsconfig,src/index.ts},
                 apps/studio, apps/viewer
  change:        pnpm workspace; 3 render packages + 2 app shells; TS strict; vitest wired.
  acceptance:    RUN `pnpm -r test` → MUST exit 0 (placeholder test green) AND `pnpm -r typecheck` clean.

TASK P0-2  branded-types + wadm-types
  implements:    ADR-0003 (Q-3)
  donor:         anvil app/src/lib/wadm-types.ts (29 LOC), anvil-uri.ts:17-25 (Brand pattern)
  write-targets: packages/render-core/src/wadm/types.ts, brand.ts
  change:        Brand<T,Tag>; LogicalId, VersionId, ClientId, ExhibitId; W3C annotation/body/selector types.
  acceptance:    RUN `pnpm --filter @render/core test brand` → MUST pass (brand nominal-typing guard test).

TASK P0-3  append-only log    (single-writer-linear ONLY — Q-6)
  implements:    ADR-0003 (Q-3), Q-6 (deferred concurrent-head collision)
  donor:         greenfield-per ADR-0003
  write-targets: packages/render-core/src/spine/log.ts + log.test.ts
  change:        helpers appendNew/appendEdit/appendDelete enforce SINGLE-WRITER invariants
                 (v1 parent=null; version===parent.version+1; parent resolves in-log; tombstone delete;
                 pure — never mutate). Do NOT put a global versionId-uniqueness key on the log type:
                 the log MUST tolerate colliding (logicalId,version) records assembled directly (= plural
                 heads after merge, P0-4). IRI disambiguation is P0-6's job, not the log's (Q-6).
  acceptance:    RUN `pnpm --filter @render/core test log` → helper preconditions enforced AND a directly-
                 assembled log with two plural-head records sharing (logicalId,version) is accepted.

TASK P0-4  version-DAG + merge-base
  implements:    ADR-0003
  donor:         greenfield-per ADR-0003
  write-targets: packages/render-core/src/spine/dag.ts, merge.ts + tests
  change:        walk parent chain; commonAncestor(a,b); classify(headA,headB) → 'same'|'ff'|'conflict'.
  acceptance:    RUN `pnpm --filter @render/core test merge` → FF/concurrent/ancestor + tiebreaker-only cases pass.

TASK P0-5  heads-projection
  implements:    ADR-0003
  donor:         greenfield-per ADR-0003
  write-targets: packages/render-core/src/spine/heads.ts + test
  change:        projectHeads(log) → head version(s) per logicalId; tombstones excluded; plural on unresolved.
  acceptance:    RUN `pnpm --filter @render/core test heads` → idempotency + plural-heads + FF-single pass.

TASK P0-6  history-sidecar serialization
  implements:    ADR-0003
  donor:         anvil wadm-types.ts (AnnotationPage shape)
  write-targets: packages/render-core/src/spine/serialize.ts + test
  change:        toHeadsPage(log) (head AnnotationPage w/ archie:hasHistory + prov:wasRevisionOf);
                 toHistory(log) → {index.json, {logicalId}.json}; versioned id {logicalId}/v{n}.
  acceptance:    RUN `pnpm --filter @render/core test serialize` → round-trip rect+polygon; id grammar; index map.

TASK P0-7  pure-WADM-consumer interop  ← THE GATE
  implements:    ADR-0003 three-tier interop contract
  donor:         greenfield-per ADR-0003
  write-targets: packages/render-core/src/spine/interop.test.ts (+ fixture)
  change:        build a real heads page from a log w/ an edited note; parse as NAIVE WADM consumer
                 (resolve only stock WADM; ignore archie:/prov:); assert 1 head/logicalId, 0 history leak.
  acceptance:    RUN `pnpm --filter @render/core test interop` → MUST pass. Phase 0 NOT done until green.

TASK P0-8  CLEAN-LIFT pure modules
  implements:    ADR-0002 (@render/core surface), spike 0001
  donor:         anvil share-url.ts, anvil-uri.ts, storage/annotations.ts:19, annotation-fields.ts:67,96
  write-targets: packages/render-core/src/{url,geometry,iiif}/*.ts + tests
  change:        lift encode/decodeContentState, buildShareUrl, parse/buildAnvilUri, isDegenerateSelector,
                 shapeLabel, matchesFilter as plain TS; scout each donor file:line via fff before lifting.
  acceptance:    RUN `pnpm --filter @render/core test` (url/geometry) → lifted-module tests pass.

TASK P0-9  Filesystem seam + EXIF fixtures
  implements:    ADR-0003 storage-seam, orphan-gate §39
  donor:         anvil storage/backends/types.ts (33 LOC, interface only)
  write-targets: packages/render-core/src/fs/seam.ts; packages/render-core/test/fixtures/exif/README.md
  change:        Filesystem/Directory/File/Writable interfaces (NO backends);
                 EXIF: enumerate the 8-orientation fixture set (manifest only; consumer wired later).
  acceptance:    RUN `pnpm --filter @render/core typecheck` clean; fixture manifest present.
```

## Sequence & gate

Strict order P0-1 → P0-9 (each: write test RED → implement → GREEN). Q-N minted before P0-2 (so code cites). If any step needs >2 retries to green → STOP, re-read the ADR (strategy "mental model is wrong" signal). **Phase 0 closes only when P0-7 (the interop gate) is green** and the frozen checklist is fully checked. Close = `record-extractor` → mulch + HANDOFF write-back (strategy §196 — no write-back, next session can't continue).

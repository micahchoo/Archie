---
scope: packages/render-core/**
tags: [data-integrity, persistence, serialization]
priority: high
source: hand-written
---

# render-core data-integrity contracts (tend 2026-07-17, Issues 19/21/23)

Three conventions now hold across render-core's storage and mapping layers. Each was installed to
close a real silent-data-loss bug; don't regress them.

## 1. Multi-file writes: content first, marker/index LAST

A multi-file store is a transaction whether you designed one or not. `spine/persist.ts` writes
history pages BEFORE `history/index.json`; `publish/site.ts` writes `archie.json` (marker +
`generation`) as the LAST file. The index/marker is the commit point — a torn write must leave a
tree that reads as *stale or refused*, never as *complete*. Any new multi-file write path follows
the same ordering.

## 2. Corrupt ≠ empty; reads are per-item tolerant

`readAnnotations` skips-and-reports a bad page (`AnnotationsCorruptError`); it never rejects the
whole log for one file, and callers never map a corruption throw to "nothing authored" (`[]`).
Same policy for optional fetches: `getOptional` returns `null` ONLY for absent (404/not-found);
5xx / fetch-throw / torn JSON throw `FailedReadError`, and `readExhibitTree` degrades per-layer,
flipping `exhibit.incomplete`. New readers must preserve the absent-vs-failed distinction — a
handler that collapses them converts outages into permanent-looking data loss.

## 3. Model-field carries are compiler-guarded (model/carry.ts)

Every boundary that hand-maps model fields (serialize/deserialize, working mappers,
objectsFromManifest, resolveConflict, append*) carries a co-located
`satisfies Record<keyof Source, CarryDisposition>` sentinel. Writing a NEW mapper over a model
type means adding its sentinel; a DELIBERATE drop (tombstones, `seedVersion`) is a named exclusion
in the sentinel, never silence. This is what makes "added a field, forgot a copy site" a compile
error instead of the recurring bug class it was (cover/format/originalName, sections/readings,
note-copy emphasis/geo all fell to it).

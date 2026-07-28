# ADR-0025 — A pasted IIIF Collection unpacks into Exhibits; a Collection is never a thing inside Archie

**Status:** accepted (2026-07-19, grill — user-gated)

## Context

The manifest-paste import (Archie-bc01) deliberately refused Collection URLs: `manifestToExhibit`
plans exactly one Manifest into one Exhibit, and a Collection is a list of manifests. That refusal
was correct v1 scoping, but it left an asymmetry — Archie *publishes* a `collection.json`
(Library → Collection, `iiif/collection.ts`, CONTEXT §Language) that its own import cannot read,
and real institutional archives are reached through collection URLs, often nested
(root → category collections → item manifests).

The IIIF Presentation mapping suggests Collection = Library. But Archie has exactly **one Library
per binding** — "everything a user has" (CONTEXT.md §Core nouns) — and the Library is a **flat**
list of Exhibits with no grouping construct. There is no second library to import a Collection
*as*, and no hierarchy to import its nesting *into*.

## Decision

Pasting a Collection URL **unpacks** it: one new Exhibit per member Manifest, appended to the
current Library in collection order, nested sub-collections flattened by depth-first traversal.
A Collection never becomes an object inside Archie's model — the glossary term is **Collection
unpacking** (CONTEXT.md §Ingest).

Consequences accepted with the decision:

- The collection's own label/summary is **not** imported — the Library keeps its identity; a paste
  never mutates library metadata.
- Sub-collection names survive only as **searchable provenance** stamped into each unpacked
  exhibit's description ("From: {root} › {sub-collection}"), never as structure. The existing
  unified search (Archie-2308) is the grouping mechanism.
- Subsetting is by URL and by picker: any sub-collection URL is itself a valid paste target, and
  the create dialog offers a checkbox picker over discovered manifests.
- The unpacked set is remembered as an **Import batch**, undoable as one act (removal, not
  rollback).

## Alternatives rejected

1. **Collection → one Exhibit (flatten all canvases in).** The "mega-manifest" shape: claims many
   objects are one object, destroys item-level identity and per-item metadata, and contradicts the
   publish-side canon (Exhibit = Manifest) in the ugliest way — a round trip of Archie's own
   published collection would fuse a whole library into a single exhibit.
2. **Collection → picker for a single manifest only.** A navigation aid, not an import: turns a
   520-manifest archive into 520 pastes, dodging the bulk on-ramp that motivated URL import in the
   first place (Archie-bc01: "one paste bootstraps from 50k+ institutional IIIF collections").
3. **Collection → a Library-like grouping inside Archie.** Would introduce hierarchy into the flat
   Library — a new core noun with UI, persistence, and publish-side consequences far beyond
   import, purchased to preserve structure the provenance stamp preserves searchably for free.

## Why an ADR

Hard to reverse: imports create user data shaped by the flatten — regrouping it later cannot be
automatic. Surprising without context: IIIF canon reads Collection = Library, and Archie
deliberately does not map it. Real trade-off: three coherent shapes existed; this one is the only
one that honors Manifest = Exhibit in both directions.

Spec detail (caps, picker, fetch policy, failure handling): `ledgers/PLAN-collection-import-2026-07-19.md`.

// W3C Web Annotation Data Model (WADM) structural types + Archie's spine record.
// ADR-0003 / Q-3. Spec: https://www.w3.org/TR/annotation-model/
//
// These are defined LOCALLY (not re-exported from @annotorious/openseadragon) to keep
// @render/core pure and testable without the renderer. They are designed to be
// STRUCTURALLY COMPATIBLE with Annotorious's W3CImageAnnotation; Phase 1 verifies the
// compatibility at the W3CImageFormat mount seam (spike-0001 module 2). [NOTE persisted]
//
// v1 shape vocab (Q-1 shape decision / ADR shape-vocab): FragmentSelector (rect) +
// SvgSelector (polygon) only — the two that round-trip losslessly through stock
// W3CImageFormat. Ellipse/path deferred to v1.1 behind a custom svgpath module.

import type { LogicalId, RevId, ClientId } from "./brand.js";

/** Canonical WADM JSON-LD context IRI. Never mix contexts on one resource (Q-3). */
export const WADM_CONTEXT = "https://www.w3.org/ns/anno.jsonld" as const;

/** Head link-out to the per-logicalId history page. Pure WADM consumers ignore it. */
export const ARCHIE_HAS_HISTORY = "archie:hasHistory" as const;
/** Head link-out to the immediately-prior version id. Pure WADM consumers ignore it. */
export const PROV_WAS_REVISION_OF = "prov:wasRevisionOf" as const;

// Archie DAG metadata, embedded as WADM extension fields on HISTORY-page annotations only
// (NOT the heads page — that stays consumer-minimal). History is the reload/merge source, and
// ADR-0003 rejects a non-WADM log store, so the DAG metadata must ride on the WADM annotations.
// A pure consumer ignores all `archie:` keys; Archie reads them to reconstruct the log.
export const ARCHIE_LOGICAL_ID = "archie:logicalId" as const;
/** READ-ONLY LEGACY KEY (ADR-0007 contraction landed). `archie:layers` is NEVER written anymore —
 *  the `layers` field is retired from the model. This const survives ONLY as the recognised key for
 *  OLD persisted data: deserialize.ts reads it and folds the values into Tags (purpose:tagging) on
 *  load, then drops it. Do not re-introduce a writer. (Kept as a named const, not inlined, to avoid a
 *  magic string at the one back-compat read site.) */
export const ARCHIE_LAYERS = "archie:layers" as const;
/** Reading membership (per-note, single — ADR-0007). A Reading = a mutually-exclusive interpretive pass,
 *  serialized as the AnnotationPage the note lands in (`partOf` → the reading's AnnotationCollection).
 *  On heads + history (round-trip). A pure consumer ignores it (three-tier: Archie filters, pure shows all). */
export const ARCHIE_READING = "archie:reading" as const;
/** Per-note visual emphasis (1489). The ONLY per-note styling — colour stays reading-driven (ADR-0007).
 *  On heads + history (round-trip), mirroring ARCHIE_READING. Emitted ONLY when authored (no default-serialize,
 *  so existing snapshots stay byte-stable); absence reads back as `"normal"` via `emphasisOf`. */
export const ARCHIE_EMPHASIS = "archie:emphasis" as const;
/** Region-override (ADR-0018): force the whole-object frame on a note that DOES carry a region
 *  selector, regardless of coverage. A whole-object Note proper is a bare-IRI target (no selector)
 *  and is whole-object by construction — it needs no flag; this is the override for the region case
 *  (the read-but-never-written seam this round closes). On heads + history (round-trip), emitted ONLY
 *  when `true` (byte-stable when absent), mirroring ARCHIE_EMPHASIS; read by `wholeObjectFlagOf`. */
export const ARCHIE_WHOLE_OBJECT = "archie:wholeObject" as const;
/** Durable geographic anchor for an annotation on a MAP surface (geo-annotation extension; DESIGN.md D2).
 *  Rides alongside the pixel selector: the pixel selector is the render path every existing consumer reads
 *  (fitBounds, markers, IIIF publish), while `archie:geo` is the source-of-truth lng/lat Archie re-projects
 *  if the basemap baseline ever changes. Emitted ONLY when authored — byte-stable when absent, pure
 *  WADM/IIIF consumers ignore it (three-tier interop, Q-3) — mirroring ARCHIE_EMPHASIS exactly. NB: in the
 *  Phase-1 prototype the lng/lat readout is DERIVED from the pixel selector (the basemap baseline is fixed),
 *  so this key is the schema reservation; durable serialization through the spine is Phase-1-proper plumbing. */
export const ARCHIE_GEO = "archie:geo" as const;
export const ARCHIE_REV = "archie:rev" as const;
export const ARCHIE_PARENT = "archie:parent" as const;
/** Additional parents of a merge-resolution node (Q-7) — the other branch heads it reconciles. */
export const ARCHIE_MERGE_PARENTS = "archie:mergeParents" as const;
export const ARCHIE_VERSION = "archie:version" as const;
export const ARCHIE_LAST_EDITOR = "archie:lastEditor" as const;
export const ARCHIE_DELETED = "archie:deleted" as const;
/** Role marker for a non-Note annotation — e.g. a Section serialized as a supplementing annotation
 *  (ADR-0017). Pure consumers ignore it; Archie recognises the annotation WITHOUT parsing IIIF Ranges.
 *  Distinct from the DAG fields: a section-annotation carries NO logicalId/rev/version/lastEditor, so the
 *  reload importer (`recordFromHistoryAnnotation`) skips it — no double-count with the `structures[]` Range. */
export const ARCHIE_ROLE = "archie:role" as const;
/** Spine position of a section-annotation (0-based). Ordering baked into the annotation, redundant with the
 *  AnnotationCollection item order for robustness (WADM has no per-annotation order). */
export const ARCHIE_ORDER = "archie:order" as const;

/** ISO-8601 datetime string (e.g. `2026-05-24T12:00:00.000Z`). */
export type IsoDateTime = string;

// ---- Bodies ----

/** Inline text body — comment, tag, alt-text, or imported transcript cue. */
export interface W3CTextualBody {
  type: "TextualBody";
  value: string;
  /** `text/plain` | `text/html` | `text/markdown`. */
  format?: string;
  /** `commenting` | `tagging` | `supplementing` | `describing` | ... */
  purpose?: string;
  language?: string;
}

/** External resource body — a referenced media/document IRI (e.g. an AV source). */
export interface W3CExternalBody {
  id: string;
  /** `Image` | `Sound` | `Video` | `Text` | `Dataset`. */
  type?: string;
  format?: string;
  purpose?: string;
}

export type W3CBody = W3CTextualBody | W3CExternalBody;

// ---- Selectors (v1: rect + polygon only) ----

/** Rect / media-fragment selector. `value` is `xywh=pixel:x,y,w,h` or `t=start,end`. */
export interface W3CFragmentSelector {
  type: "FragmentSelector";
  /** `http://www.w3.org/TR/media-frags/` */
  conformsTo?: string;
  value: string;
}

/** Polygon selector — an SVG fragment. Only `<polygon>`/`<rect>` round-trip in v1. */
export interface W3CSvgSelector {
  type: "SvgSelector";
  value: string;
}

/** The two selector types v1 emits. Ellipse/path are a v1.1 svgpath gate. */
export type W3CSelector = W3CFragmentSelector | W3CSvgSelector;

// ---- Targets ----

/** A target with a selector — wraps the source Canvas/Object IRI + a region/time selector. */
export interface W3CSpecificResource {
  type?: "SpecificResource";
  source: string;
  selector?: W3CSelector | W3CSelector[];
}

/** A WADM target: either a bare resource IRI or a SpecificResource. */
export type W3CTarget = string | W3CSpecificResource;

// ---- Annotation + Page ----

/** A W3C Web Annotation. Structurally compatible with Annotorious W3CImageAnnotation. */
export interface W3CAnnotation {
  "@context"?: string | string[];
  id: string;
  type: "Annotation";
  motivation?: string | string[];
  body?: W3CBody | W3CBody[];
  target: W3CTarget | W3CTarget[];
  created?: IsoDateTime;
  modified?: IsoDateTime;
  creator?: unknown;
}

/**
 * An Archie head annotation as serialized into the canvas AnnotationPage viewers load.
 * Adds two link-outs a PROV-aware / Archie consumer follows; a pure WADM consumer
 * assigns it to W3CAnnotation and never reads the extensions (three-tier interop, Q-3).
 */
export interface ArchieAnnotation extends W3CAnnotation {
  "archie:hasHistory"?: string;
  "prov:wasRevisionOf"?: string;
}

/** A WADM AnnotationPage — the container viewers load (items, not a bare array; Q-3). */
export interface W3CAnnotationPage {
  "@context"?: string | string[];
  id: string;
  type: "AnnotationPage";
  items: W3CAnnotation[];
  /** Layer membership (IIIF AnnotationCollection reference). */
  partOf?: unknown;
}

/**
 * A Section (the narrative spine; ADR-0005) ALSO serialized as a WADM annotation — the additive,
 * all-round-compatible export view (ADR-0017). The canonical Section transport stays the IIIF `Range`
 * in `manifest.structures[]` (Archie reads that); this lets a pure WADM/IIIF *annotation* tool — which
 * reads AnnotationPages, NOT Ranges — consume the narrative. The Range affordances are baked in: the
 * title → `label`, the active region → a FragmentSelector `target`, the prose → a `describing` body, the
 * spine position → `archie:order`. It carries NO archie DAG fields, so the reload importer ignores it;
 * there is no double-count with the `structures[]` Range round-trip.
 */
export interface SectionAnnotation extends W3CAnnotation {
  /** The Section title as a IIIF label. IIIF tools render it; a pure-WADM/JSON-LD consumer ignores the
   *  unknown term — more compatible than a custom title extension or a guess-which-body scheme. */
  label?: Record<string, string[]>;
  /** Marks this annotation as a Section (also inferable from collection membership + `supplementing`). */
  "archie:role"?: "section";
  /** 0-based spine position — the ordering affordance, baked in. */
  "archie:order"?: number;
}

/**
 * A WADM AnnotationCollection — an ordered grouping of annotations, paged via `first`/`last`
 * (W3C / ActivityStreams). Archie emits the narrative spine as one self-contained collection per
 * exhibit: `first` is an embedded AnnotationPage carrying the section-annotations inline in spine order
 * (a static export has no server to dereference a bare page id). Each IIIF Range links here via its
 * `supplementary` property (IIIF Presentation 3 §5.4) — the ecosystem-sanctioned Range↔annotation bridge —
 * so both IIIF and pure-WADM consumers discover it.
 */
export interface W3CAnnotationCollection {
  "@context"?: string | string[];
  id: string;
  type: "AnnotationCollection";
  label?: Record<string, string[]>;
  summary?: Record<string, string[]>;
  total?: number;
  first?: W3CAnnotationPage;
}

// ---- The spine's log element ----

/**
 * One entry in the append-only annotation log (ADR-0003 / Q-3). Carries the version
 * metadata that forms the version-parent DAG. `modifiedAt` is an in-card merge
 * tiebreaker ONLY — never a primary auto-resolution signal (clock skew = data loss).
 * A delete is a tombstone version (`deleted: true`), not a removal — append-only.
 */
export interface AnnotationRecord {
  logicalId: LogicalId;
  /**
   * Per-record-unique DAG node id (ULID). The `parent` pointer targets this, never the
   * version id — so the DAG is collision-free under concurrency (ADR-0003 Refinement).
   */
  rev: RevId;
  /** Citation ordinal per logicalId (the `{logicalId}/v{n}` projection). NOT unique under concurrency. */
  version: number;
  /** The rev this one was edited from; `null` for v1 (the DAG root). */
  parent: RevId | null;
  /** Extra parents for a merge-resolution node (Q-7): the other branch heads it reconciles. */
  mergeParents?: RevId[];
  /** ISO datetime. In-card tiebreaker ONLY (Q-3). */
  modifiedAt: IsoDateTime;
  lastEditor: ClientId;
  /** Tombstone flag — a deleted version is still appended, never erased. */
  deleted: boolean;
  body?: W3CBody | W3CBody[];
  target: W3CTarget;
  motivation?: string | string[];
  /** The single Reading this Note belongs to (mutually exclusive — ADR-0007), or undefined = base.
   *  A Reading is a curated interpretive pass; the id resolves against the Exhibit's reading registry. */
  reading?: string;
  /** Authored per-note visual emphasis (1489), or undefined = default `"normal"`. Mirrors `reading`'s
   *  optional shape; serialized to `archie:emphasis` only when set, so existing records stay byte-stable. */
  emphasis?: Emphasis;
  /** Region-override (ADR-0018): force the whole-object frame on a note that HAS a region selector,
   *  regardless of coverage. Undefined/absent = no override (a bare-IRI target is whole-object by
   *  construction; the ≥75% coverage heuristic still applies to region notes). Serialized to
   *  `archie:wholeObject` only when `true`, so existing records stay byte-stable; mirrors `emphasis`. */
  wholeObject?: boolean;
  /** Geographic anchor for a Map annotation (geo-truth — Q4 / ADR-0015): lng/lat is the SOURCE OF TRUTH,
   *  the target's pixel selector its derived projection. Set only on Map-targeted notes. Serialized to
   *  `archie:geo` only when set (byte-stable when absent), mirroring `emphasis`; pure consumers ignore it. */
  geo?: GeoAnchor;
}

/** Per-note visual emphasis (1489) — the single source of truth (query/published.ts imports this). */
export type Emphasis = "muted" | "normal" | "strong";

/** A geographic anchor for a Map annotation (the `archie:geo` value; geo-truth — ADR-0015 / Q4). A **Box**
 *  anchors as a `bbox`; an **Outline** as a `polygon` (a ring of `[lng, lat]`). NO point form — pins were
 *  dropped in the 2026-06-18 grilling; geo-Notes are Box/Outline only (CONTEXT geo-annotation UX). */
export type GeoAnchor =
  | { type: "bbox"; west: number; south: number; east: number; north: number }
  | { type: "polygon"; coordinates: Array<[number, number]> };

/** The append-only annotation log — the authoritative source every projection reads. */
export type AnnotationLog = readonly AnnotationRecord[];

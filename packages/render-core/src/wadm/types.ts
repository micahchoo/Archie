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
/** @deprecated Layer membership (per-note, multi-valued). SUPERSEDED by ARCHIE_READING (ADR-0007);
 *  kept during the expand-and-contract rename. Migrated to Tags on read (layers[] → purpose:tagging). */
export const ARCHIE_LAYERS = "archie:layers" as const;
/** Reading membership (per-note, single — ADR-0007). A Reading = a mutually-exclusive interpretive pass,
 *  serialized as the AnnotationPage the note lands in (`partOf` → the reading's AnnotationCollection).
 *  On heads + history (round-trip). A pure consumer ignores it (three-tier: Archie filters, pure shows all). */
export const ARCHIE_READING = "archie:reading" as const;
export const ARCHIE_REV = "archie:rev" as const;
export const ARCHIE_PARENT = "archie:parent" as const;
/** Additional parents of a merge-resolution node (Q-7) — the other branch heads it reconciles. */
export const ARCHIE_MERGE_PARENTS = "archie:mergeParents" as const;
export const ARCHIE_VERSION = "archie:version" as const;
export const ARCHIE_LAST_EDITOR = "archie:lastEditor" as const;
export const ARCHIE_DELETED = "archie:deleted" as const;

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
  /** @deprecated Multi-valued layer membership. SUPERSEDED by `reading` (ADR-0007); kept during the
   *  expand-and-contract rename, migrated to Tags on read. Do not set on new records. */
  layers?: string[];
  /** The single Reading this Note belongs to (mutually exclusive — ADR-0007), or undefined = base.
   *  A Reading is a curated interpretive pass; the id resolves against the Exhibit's reading registry. */
  reading?: string;
}

/** The append-only annotation log — the authoritative source every projection reads. */
export type AnnotationLog = readonly AnnotationRecord[];

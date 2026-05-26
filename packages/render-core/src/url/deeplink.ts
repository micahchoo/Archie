// URL <-> selector serialization (spike-0001 module 4, CLEAN-LIFT from anvil share-url.ts).
//
// Only the PURE parts live in @render/core: IIIF Content State encode/decode (the canonical
// annotation deep-link payload, ADR-0022) and Archie's #/a/<id> hash deep-link (Q8 nav
// contract). buildShareUrl / copyToClipboard touch window/navigator/document and belong in
// the adapter (Phase 1), NOT here. btoa/atob are standard in both browser and node runtimes.

export interface SelectorRef {
  type: string;
  value?: string;
}

interface ContentState {
  "@context": string;
  id: string;
  type: "Annotation";
  motivation: "highlighting";
  target: {
    id: string;
    type: "SpecificResource";
    source: string;
    selector: SelectorRef;
  };
}

/** Encode an annotation reference + canvas into a IIIF Content State (base64url) param. */
export function encodeContentState(annotationId: string, canvasId: string, selector: SelectorRef): string {
  const cs: ContentState = {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    id: annotationId,
    type: "Annotation",
    motivation: "highlighting",
    target: {
      id: selector.value ? `${canvasId}#${selector.value}` : canvasId,
      type: "SpecificResource",
      source: canvasId,
      selector: { type: selector.type, ...(selector.value !== undefined ? { value: selector.value } : {}) },
    },
  };
  const b64 = btoa(encodeURIComponent(JSON.stringify(cs)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a IIIF Content State param value. Null on invalid input. */
export function decodeContentState(encoded: string): { annotationId: string; selector: SelectorRef } | null {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const cs = JSON.parse(decodeURIComponent(atob(b64))) as Partial<ContentState>;
    if (!cs || cs.type !== "Annotation" || cs.motivation !== "highlighting") return null;
    const sel = cs.target?.selector;
    if (!sel || typeof sel.type !== "string") return null;
    return {
      annotationId: (typeof cs.id === "string" ? cs.id : cs.target?.source) ?? "",
      selector: { type: sel.type, ...(sel.value !== undefined ? { value: sel.value } : {}) },
    };
  } catch {
    return null;
  }
}

/** Detect a legacy `?annotation=urn:...` param (for redirect to Content State). */
export function detectLegacyAnnotationParam(search: string): string | null {
  const urn = new URLSearchParams(search).get("annotation");
  return urn && urn.startsWith("urn:") ? urn : null;
}

// ---- Archie note deep-link: #/a/<logicalId>[?xywh=...] (Q8) ----

export interface NoteDeepLink {
  logicalId: string;
  xywh?: string;
}

/** Build the canonical note deep-link fragment. */
export function buildNoteDeepLink(logicalId: string, opts: { xywh?: string } = {}): string {
  const base = `#/a/${logicalId}`;
  return opts.xywh !== undefined ? `${base}?xywh=${opts.xywh}` : base;
}

const NOTE_HASH_RE = /^#\/a\/([^?]+)(?:\?(.*))?$/;

/** Parse a note deep-link fragment back to its parts. Null if it is not a note link. */
export function parseNoteDeepLink(hash: string): NoteDeepLink | null {
  const m = hash.match(NOTE_HASH_RE);
  if (!m) return null;
  const logicalId = m[1]!;
  const xywh = m[2] ? new URLSearchParams(m[2]).get("xywh") : null;
  return xywh !== null ? { logicalId, xywh } : { logicalId };
}

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

/** A media-fragment head split off a fragment value / `#…` IRI tail: the `xywh=` or `t=` key
 *  stripped. The ONE definition both the embed's route ladder (target-resolve.ts fragmentOfStart)
 *  and its Content State recovery (content-state.ts) consume — the two used to carry identical
 *  3-line copies that could drift apart. */
export interface MediaFragmentHead {
  kind: "xywh" | "t";
  value: string;
}

/** Split the `xywh=`/`t=` head off a media-fragment value (or a `#…` IRI tail). Bare/unknown →
 *  undefined (whole-resource / no fragment). Value-agnostic: a `pixel:`/`percent:` region or a
 *  `t=` offset rides through unchanged — parsing the number grammar is parseMediaFragment's job. */
export function parseMediaFragmentHead(value: string | undefined): MediaFragmentHead | undefined {
  if (!value) return undefined;
  if (value.startsWith("xywh=")) return { kind: "xywh", value: value.slice("xywh=".length) };
  if (value.startsWith("t=")) return { kind: "t", value: value.slice("t=".length) };
  return undefined;
}

/** The decoded Content State — the codec's return. ADR-0022: the `iiif-content` ATTRIBUTE grammar is
 *  frozen; the return SHAPE is not, and it now carries the resource IRI the old return dropped. The
 *  embed used to re-decode the same base64 payload by hand ("in lock-step" with this gate) to recover
 *  `target.source`; that workaround is the reason this field exists. */
export interface DecodedContentState {
  annotationId: string;
  selector: SelectorRef;
  /** The resource IRI the Content State references — `target.source` (a Canvas/Manifest IRI per the
   *  SpecificResource shape), or `target.id` with any `#fragment` stripped when source is absent
   *  (a bare-IRI target form). Fragment-stripping happens here so consumers match clean IRIs. */
  source: string;
  /** The FULL `target.id` as authored. When the state carries its fragment only in the `#…` tail
   *  (a foreign shape; encodeContentState always mirrors it into the selector too), the tail is
   *  recoverable from here — the fragment-less `source` above has already stripped it. */
  id?: string;
}

/** Decode a IIIF Content State param value. Null on invalid input (or no target IRI). */
export function decodeContentState(encoded: string): DecodedContentState | null {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const cs = JSON.parse(decodeURIComponent(atob(b64))) as Partial<ContentState>;
    if (!cs || cs.type !== "Annotation" || cs.motivation !== "highlighting") return null;
    const target = cs.target;
    const sel = target?.selector;
    if (!target || !sel || typeof sel.type !== "string") return null;
    // The resource IRI: prefer `source` (the SpecificResource's Canvas/Manifest IRI); else `target.id`
    // with any `#…` tail cut (a bare-IRI target). The raw id is still returned for the tail's
    // fragment, which `source` cannot carry without corrupting the match key.
    const rawId = typeof target.id === "string" ? target.id : undefined;
    const hashIdx = rawId ? rawId.indexOf("#") : -1;
    const source = typeof target.source === "string"
      ? target.source
      : rawId && hashIdx === -1 ? rawId
      : rawId ? rawId.slice(0, hashIdx)
      : "";
    if (!source) return null;
    return {
      annotationId: (typeof cs.id === "string" ? cs.id : source) ?? "",
      selector: { type: sel.type, ...(sel.value !== undefined ? { value: sel.value } : {}) },
      source,
      ...(rawId !== undefined ? { id: rawId } : {}),
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

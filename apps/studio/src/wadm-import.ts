// W3C/WADM annotation import (contributor-broadening ⑦ slice A): load an AnnotationPage (or a
// bare Annotation array / single Annotation) exported by Archie itself, Recogito, or any standard
// WADM producer, onto the current exhibit. Donor crosswalk shape: mirador AnnotationFactory
// (Prior Art/14). Legacy `oa:`/sc:AnnotationList is REFUSED honestly (its `on`/`resource` grammar
// is a later slice), never half-parsed.
//
// TRUST BOUNDARY (review round 6): foreign JSON crosses into the session and onward into PUBLISH,
// where third-party viewers render it. Nothing downstream validates — so nothing passes verbatim:
// selectors are whitelisted by type + shape and REBUILT field-by-field; bodies are rebuilt to
// TextualBody {value, purpose} only. Unsupported/unsafe rows skip with a reason.
//
// Anchoring: a foreign page's `target.source` is the PUBLISHER's canvas IRI. We re-anchor by the
// trailing `/canvas/<objectId>` segment when this exhibit has that object; rows that don't match
// skip (never silently misplace someone's scholarship).

export type ImportedSelector =
  | { type: "FragmentSelector"; conformsTo: "http://www.w3.org/TR/media-frags/"; value: string }
  | { type: "SvgSelector"; value: string };

export interface ImportedBody {
  type: "TextualBody";
  value: string;
  purpose: "commenting" | "tagging";
}

export interface WadmNotePlan {
  objectId: string;
  selector: ImportedSelector;
  body: ImportedBody[];
}

export interface WadmImportPlan {
  notes: WadmNotePlan[];
  skipped: { index: number; reason: string }[];
}

type Json = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** True for legacy Open-Annotation list shapes we deliberately refuse (on/resource grammar). */
export function isLegacyAnnotationList(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const o = json as Json;
  return /sc:AnnotationList|oa:AnnotationList/i.test(String(o["type"] ?? o["@type"] ?? "")) || Array.isArray(o["resources"]);
}

/** The annotation list inside whatever shape arrived (AnnotationPage | array | single Annotation). */
export function annotationsIn(json: unknown): Json[] {
  if (Array.isArray(json)) return json as Json[];
  if (!json || typeof json !== "object") return [];
  const o = json as Json;
  const type = String(o["type"] ?? o["@type"] ?? "");
  if (/AnnotationPage|AnnotationCollection/i.test(type)) return asArray(o["items"]) as Json[];
  if (/Annotation$/i.test(type)) return [o];
  return [];
}

/** The `/canvas/<id>` tail of a canvas IRI (fragment-tolerant), or null. */
export function canvasObjectId(source: unknown): string | null {
  const m = String(source ?? "").split("#")[0]!.match(/\/canvas\/([^/?#]+)\/?$/);
  return m ? m[1]! : null;
}

// media-frags shapes we render: spatial xywh (optionally pixel:/percent:) and temporal t=.
const FRAGMENT_RE = /^(xywh=(pixel:|percent:)?-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}|t=\d+(\.\d+)?(,\d+(\.\d+)?)?)$/;

/** Whitelist + REBUILD a selector — never pass foreign objects through. Unwraps Choice.items[0]. */
export function sanitizeSelector(raw: unknown): { ok: ImportedSelector } | { err: string } {
  let s = asArray(raw)[0] as Json | undefined;
  if (s && /^Choice$/i.test(String(s["type"] ?? ""))) s = asArray(s["items"])[0] as Json | undefined;
  if (!s || typeof s !== "object") return { err: "the region is missing or unreadable" };
  const t = String(s["type"] ?? "");
  const v = String(s["value"] ?? "");
  if (t === "FragmentSelector") {
    if (!FRAGMENT_RE.test(v)) return { err: "unsupported region shape" };
    return { ok: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: v } };
  }
  if (t === "SvgSelector") {
    // Shape-only SVG: reject anything that could carry script into a third-party viewer.
    if (!/^<svg[\s>]/.test(v.trim()) || /<script|<foreignObject|<use|on\w+\s*=|javascript:|href\s*=/i.test(v)) {
      return { err: "unsupported or unsafe region shape" };
    }
    return { ok: { type: "SvgSelector", value: v } };
  }
  return { err: "unsupported region shape" };
}

/** Rebuild bodies to TextualBody {value, purpose} only — foreign fields (format, ids, …) drop. */
export function sanitizeBodies(raw: unknown[]): ImportedBody[] {
  return raw
    .map((b) => (typeof b === "string" ? { type: "TextualBody", value: b, purpose: "commenting" } : b))
    .filter((b): b is Json => !!b && typeof b === "object")
    .filter((b) => String(b["type"]) === "TextualBody" && typeof b["value"] === "string" && (b["value"] as string).trim() !== "")
    .map((b) => ({ type: "TextualBody" as const, value: b["value"] as string, purpose: b["purpose"] === "tagging" ? ("tagging" as const) : ("commenting" as const) }));
}

export function planWadmImport(json: unknown, ctx: { objectIds: Set<string> }): WadmImportPlan {
  if (isLegacyAnnotationList(json)) {
    return { notes: [], skipped: [{ index: 0, reason: "This file uses an older annotation format Archie can't read yet. Re-export it as W3C Web Annotation (for example, from Mirador) and try again." }] };
  }
  const annos = annotationsIn(json);
  if (annos.length === 0) {
    return { notes: [], skipped: [{ index: 0, reason: "No notes found in that file. Archie reads a W3C Web Annotation file (a single note or a list)." }] };
  }
  const notes: WadmNotePlan[] = [];
  const skipped: WadmImportPlan["skipped"] = [];
  for (let i = 0; i < annos.length; i++) {
    const a = annos[i]!;
    const target = a["target"] as Json | string | undefined;
    const source = typeof target === "string" ? target.split("#")[0] : target?.["source"];
    const objectId = canvasObjectId(source);
    if (!objectId || !ctx.objectIds.has(objectId)) {
      skipped.push({ index: i + 1, reason: "Points to media that isn't in this exhibit." });
      continue;
    }
    // String targets ("…/canvas/o1#xywh=1,2,3,4") carry their selector in the fragment.
    const rawSelector = typeof target === "string"
      ? { type: "FragmentSelector", value: target.split("#")[1] ?? "" }
      : target?.["selector"];
    const sel = sanitizeSelector(rawSelector);
    if ("err" in sel) { skipped.push({ index: i + 1, reason: sel.err }); continue; }
    const body = sanitizeBodies(asArray(a["body"]));
    if (body.length === 0) { skipped.push({ index: i + 1, reason: "no usable note text" }); continue; }
    notes.push({ objectId, selector: sel.ok, body });
  }
  return { notes, skipped };
}

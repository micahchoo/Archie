// IIIF manifest URL → exhibit plan (contributor-broadening ②, seed Archie-bc01).
// A minimal lift of cozy-iiif's parseURL *algorithm* (Cozy.ts:31 — fetch, classify, extract;
// Prior Art/14-import-interop.md): Archie only needs {title, canvases → objects}, so we read the
// image/label/dims subset of Presentation 3 AND legacy Presentation 2 directly instead of pulling
// @iiif/parser for full normalization. DOM-free + fetch-free: callers fetch, this module plans.

import { matchDctermsProperty, dctermsLabel, METADATA_EXCLUDED_PROPERTIES, DEFAULT_ATTRIBUTION_LABEL, type MetadataEntry, type RightsFields } from "@render/core";

/** One planned object from a manifest canvas — mirrors ExhibitMeta's object fields. */
export interface PlannedObject {
  source: string;
  label: string;
  width?: number;
  height?: number;
  mediaType?: "sound" | "video";
  duration?: number;
  /** Descriptive entries mapped from the canvas's `metadata` pairs (Archie-c6bf). */
  metadata?: MetadataEntry[];
}

export interface ManifestPlan {
  title: string;
  /** Manifest-level `summary` (P3) / `description` (P2) → the exhibit's NATIVE summary. */
  summary?: string;
  /** Manifest-level `rights` (P3) / `license` (P2) → the exhibit's NATIVE license URI. */
  rights?: string;
  /** Manifest-level `requiredStatement` (P3) / `attribution` (P2) → the exhibit's NATIVE credit. */
  requiredStatement?: RightsFields["requiredStatement"];
  /** Manifest-level `metadata` pairs → the exhibit's descriptive entries (Archie-c6bf). */
  metadata?: MetadataEntry[];
  objects: PlannedObject[];
}

/** IIIF label → display string: P3 {lang: [values]} (first value of any language, "none" first),
 *  P2 plain string or {"@value": ...} forms. */
export function labelToString(label: unknown, fallback: string): string {
  if (typeof label === "string") return label.trim() || fallback;
  if (Array.isArray(label)) return labelToString(label[0], fallback);
  if (label && typeof label === "object") {
    const o = label as Record<string, unknown>;
    if (typeof o["@value"] === "string") return (o["@value"] as string).trim() || fallback;
    const langs = ["none", "en", ...Object.keys(o)];
    for (const k of langs) {
      const v = o[k];
      if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
    }
  }
  return fallback;
}

/** IIIF value → ALL its display strings, one per repeated entry (Archie-c6bf import mapping).
 *  P3 language map: the FIRST language's values ("none", then "en", then first key) — each array
 *  element becomes one repeated entry. P2 forms: plain string, `{"@value"}`, or arrays of either.
 *  Blank strings are dropped. */
export function valuesToStrings(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(valuesToStrings);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o["@value"] === "string") return valuesToStrings(o["@value"]);
    for (const k of ["none", "en", ...Object.keys(o)]) {
      const v = o[k];
      if (Array.isArray(v) && v.some((x) => typeof x === "string" && x.trim())) return valuesToStrings(v);
    }
  }
  return [];
}

/**
 * Map a IIIF `metadata` pair list (P3 or P2) → Archie MetadataEntry[] (Archie-c6bf, fixed mapping):
 *  • label matches a dcterms preferred label / import alias (case-insensitive) → `{ property,
 *    label: original-when-it-differs-from-the-preferred-label, value }`;
 *  • label maps to an EXCLUDED property (title/description/abstract/rights/license — the native-field
 *    collision set) → VERBATIM `{ label, value }`: never double-author, never clobber a native field;
 *  • no match → verbatim `{ label, value }`.
 * A multi-valued pair (language-map array / repeated P2 values) yields one entry PER value.
 */
export function metadataEntriesFromPairs(raw: unknown): MetadataEntry[] {
  const out: MetadataEntry[] = [];
  for (const pair of asArray(raw)) {
    const label = labelToString(pair["label"] ?? pair["@label"], "").trim();
    if (!label) continue; // a pair with no legible label can't be displayed or matched — skip it
    const values = valuesToStrings(pair["value"] ?? pair["@value"]);
    const property = matchDctermsProperty(label);
    const mapped = property !== undefined && !METADATA_EXCLUDED_PROPERTIES.has(property) ? property : undefined;
    for (const value of values) {
      if (mapped !== undefined) {
        // Keep the third party's own wording when it differs from the vocabulary's preferred label
        // (an alias like "Author" → dcterms:creator by definition differs) — lossless display.
        out.push({ property: mapped, ...(label !== dctermsLabel(mapped) ? { label } : {}), value });
      } else {
        out.push({ label, value });
      }
    }
  }
  return out;
}

export type Json = Record<string, unknown>;
// Exported so collection-import.ts (Archie-cc77) reuses the ONE id/array reader instead of
// re-deriving P3-vs-P2 shape handling — a second copy would drift the way the open-seam copies did.
export const asArray = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : v ? [v as Json] : []);
export const idOf = (o: Json | undefined): string => String(o?.["id"] ?? o?.["@id"] ?? "");

/** Sniff a fetched IIIF document by its type field (P3 `type` / P2 `@type`) and shape. Shared by
 *  manifestToExhibit (one-manifest contract) and collection traversal (Archie-cc77, PLAN §7).
 *  "unknown" folds BOTH non-objects and object shapes we don't read — manifestToExhibit maps it to
 *  the same "didn't return a IIIF manifest" refusal it has always thrown, so behavior is unchanged. */
export function classifyIiifDocument(json: unknown): "manifest" | "collection" | "unknown" {
  if (!json || typeof json !== "object") return "unknown";
  const m = json as Json;
  const type = String(m["type"] ?? m["@type"] ?? "");
  if (/Collection/i.test(type)) return "collection";
  const isP3 = /Manifest$/i.test(type) && Array.isArray(m["items"]);
  const isP2 = /Manifest$/i.test(type) || Array.isArray((asArray(m["sequences"])[0] ?? {})["canvases"]);
  return isP3 || isP2 ? "manifest" : "unknown";
}

/** Is this `service` entry a IIIF Image API service? Bodies on real institutional manifests also
 *  carry auth/search services — preferring one of those would import a silently-broken source. */
function isImageService(service: Json | undefined): boolean {
  if (!service) return false;
  const t = String(service["type"] ?? service["@type"] ?? "");
  const hint = String(service["profile"] ?? "") + String(service["@context"] ?? "");
  return /^ImageService\d/i.test(t) || /api\/image\//i.test(hint);
}

/** Prefer the Image-API service base (deep-zoomable; matches Archie's existing object sources),
 *  else the direct content URL. AV bodies never take a service — theirs are auth/search, not media. */
function sourceOf(body: Json): string {
  if (mediaTypeOf(body)) return idOf(body);
  const service = asArray(body["service"]).find(isImageService);
  return idOf(service) || idOf(body);
}

function mediaTypeOf(body: Json): "sound" | "video" | undefined {
  const t = String(body["type"] ?? body["@type"] ?? "");
  if (/sound|audio/i.test(t)) return "sound";
  if (/video/i.test(t)) return "video";
  return undefined;
}

/** The painting body of a P3 canvas (items → AnnotationPage → painting annotation → body). */
function p3Body(canvas: Json): Json | undefined {
  const page = asArray(canvas["items"])[0];
  const anno = asArray(page?.["items"])[0];
  const body = anno?.["body"];
  return asArray(body)[0];
}

/** The image resource of a P2 canvas (images → image annotation → resource). */
function p2Body(canvas: Json): Json | undefined {
  const image = asArray(canvas["images"])[0];
  return image?.["resource"] as Json | undefined;
}

export class ManifestImportError extends Error {}

/** Plan an exhibit from a fetched IIIF manifest (Presentation 3 or 2). Throws ManifestImportError
 *  with a user-facing message for collections and shapes we don't read. */
export function manifestToExhibit(json: unknown, url: string): ManifestPlan {
  const kind = classifyIiifDocument(json);
  if (kind === "collection") {
    throw new ManifestImportError(
      "This is a IIIF Collection (a list of manifests). Paste the URL of a single manifest instead.",
    );
  }
  if (kind !== "manifest") throw new ManifestImportError("That URL didn't return a IIIF manifest.");
  const m = json as Json;
  const type = String(m["type"] ?? m["@type"] ?? "");
  const isP3 = /Manifest$/i.test(type) && Array.isArray(m["items"]);

  const canvases: Json[] = isP3 ? asArray(m["items"]) : asArray(asArray(m["sequences"])[0]?.["canvases"]);
  const objects: PlannedObject[] = [];
  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i]!;
    const body = isP3 ? p3Body(canvas) : p2Body(canvas);
    if (!body) continue; // an empty canvas paints nothing importable
    const source = sourceOf(body);
    if (!source) continue;
    const mediaType = mediaTypeOf(body);
    // Dims resolve as a PAIR from one source — mixing canvas width with body height could pair
    // inconsistent aspect ratios.
    const dimsOf = (o: Json) => (Number(o["width"]) && Number(o["height"]) ? { width: Number(o["width"]), height: Number(o["height"]) } : null);
    const dims = dimsOf(canvas) ?? dimsOf(body);
    const duration = Number(canvas["duration"] ?? body["duration"]) || undefined;
    // Per-canvas descriptive metadata → this object's entries (Archie-c6bf).
    const canvasMeta = metadataEntriesFromPairs(canvas["metadata"]);
    objects.push({
      source,
      label: labelToString(canvas["label"], `Canvas ${i + 1}`),
      ...(mediaType ? { mediaType, ...(duration ? { duration } : {}) } : dims ?? {}),
      ...(canvasMeta.length ? { metadata: canvasMeta } : {}),
    });
  }
  if (objects.length === 0) throw new ManifestImportError("That IIIF link has no images or media Archie can add.");

  const fallbackTitle = (() => {
    try { return new URL(url).hostname; } catch { return "Untitled exhibit"; }
  })();

  // Manifest-level descriptive data (Archie-c6bf): stop dropping what institutions author.
  // The IIIF TYPED slots land on the NATIVE fields (they ARE those fields — research asset §4):
  // summary/description → summary, rights/license → rights, requiredStatement/attribution → credit.
  // The free-form `metadata` pairs map to the exhibit's entries.
  const summary = labelToString(m["summary"] ?? m["description"], "").trim();
  const rightsRaw = m["rights"] ?? m["license"];
  const rights = typeof rightsRaw === "string" ? rightsRaw.trim() : idOf(asArray(rightsRaw)[0]);
  const requiredStatement = (() => {
    const rs = m["requiredStatement"] as Json | undefined;
    if (rs && typeof rs === "object") {
      const value = labelToString(rs["value"], "").trim();
      if (value) return { label: labelToString(rs["label"], DEFAULT_ATTRIBUTION_LABEL), value };
    }
    const attribution = labelToString(m["attribution"], "").trim(); // P2
    return attribution ? { label: DEFAULT_ATTRIBUTION_LABEL, value: attribution } : undefined;
  })();
  const manifestMeta = metadataEntriesFromPairs(m["metadata"]);

  return {
    title: labelToString(m["label"], fallbackTitle),
    ...(summary ? { summary } : {}),
    ...(rights ? { rights } : {}),
    ...(requiredStatement ? { requiredStatement } : {}),
    ...(manifestMeta.length ? { metadata: manifestMeta } : {}),
    objects,
  };
}

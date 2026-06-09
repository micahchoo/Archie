// IIIF manifest URL → exhibit plan (contributor-broadening ②, seed Archie-bc01).
// A minimal lift of cozy-iiif's parseURL *algorithm* (Cozy.ts:31 — fetch, classify, extract;
// Prior Art/14-import-interop.md): Archie only needs {title, canvases → objects}, so we read the
// image/label/dims subset of Presentation 3 AND legacy Presentation 2 directly instead of pulling
// @iiif/parser for full normalization. DOM-free + fetch-free: callers fetch, this module plans.

/** One planned object from a manifest canvas — mirrors ExhibitMeta's object fields. */
export interface PlannedObject {
  source: string;
  label: string;
  width?: number;
  height?: number;
  mediaType?: "sound" | "video";
  duration?: number;
}

export interface ManifestPlan {
  title: string;
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

type Json = Record<string, unknown>;
const asArray = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : v ? [v as Json] : []);
const idOf = (o: Json | undefined): string => String(o?.["id"] ?? o?.["@id"] ?? "");

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
  if (!json || typeof json !== "object") throw new ManifestImportError("That URL didn't return a IIIF manifest.");
  const m = json as Json;
  const type = String(m["type"] ?? m["@type"] ?? "");

  if (/Collection/i.test(type)) {
    throw new ManifestImportError(
      "That's a IIIF Collection (a list of manifests). Paste the URL of one of its manifests — collection import is on the roadmap.",
    );
  }
  const isP3 = /Manifest$/i.test(type) && Array.isArray(m["items"]);
  const isP2 = /Manifest$/i.test(type) || Array.isArray((asArray(m["sequences"])[0] ?? {})["canvases"]);
  if (!isP3 && !isP2) throw new ManifestImportError("That URL didn't return a IIIF manifest.");

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
    objects.push({
      source,
      label: labelToString(canvas["label"], `Canvas ${i + 1}`),
      ...(mediaType ? { mediaType, ...(duration ? { duration } : {}) } : dims ?? {}),
    });
  }
  if (objects.length === 0) throw new ManifestImportError("That manifest has no canvases Archie can read.");

  const fallbackTitle = (() => {
    try { return new URL(url).hostname; } catch { return "Imported manifest"; }
  })();
  return { title: labelToString(m["label"], fallbackTitle), objects };
}

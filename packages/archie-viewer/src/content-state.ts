// IIIF Content State interop for <archie-viewer> (ADR-0021 deferred-additive interop target).
//
// WHY: an Archie embed should be targetable by the IIIF ecosystem's canonical deep-link format —
// a base64url IIIF Presentation 3 Content State (ADR-0022). The `iiif-content` attribute carries one;
// this module is the PURE decode → internal-target mapping so the element can resolve+apply it through
// the EXISTING resolveExhibitTarget / #applyTarget path with degrade-upward (ADR-0021): an unknown /
// foreign Content State lands on the gallery, a malformed one is rejected gracefully (no throw).
//
// DONOR (the canonical codec, NOT re-implemented for validity): render-core url/deeplink.ts —
//   decodeContentState(encoded): { annotationId, selector } | null   (deeplink.ts:45-60)
//     — the Annotation/motivation:"highlighting" gate + base64url+atob+JSON.parse, null on garbage.
//   We USE it as the validity gate. But its return DROPS `target.source` (the Canvas IRI we must
//   match against `exhibit.canvasIdByObject`), so we additionally recover the target IRI here from the
//   same decoded JSON. Self-contained: no apps/viewer import (ADR-0019 bundle rule), render-core only.
//
// CANVAS/MANIFEST IRI shape (render-core iiif/manifest.ts:65,361 — published trees):
//   Canvas IRI   = `{base}{slug}/canvas/{objectId}`
//   Manifest IRI = `{base}{slug}/manifest.json`
// The AUTHORITATIVE per-object Canvas IRI is `exhibit.canvasIdByObject[objectId]` (read.ts:62) — so we
// match the Content State's Canvas IRI DIRECTLY against those values (no fragile string parsing). A
// Content State that references only a Manifest (no Canvas) maps to a SLUG via the shared `{base}{slug}/`
// prefix of that exhibit's canvas IRIs.

import { decodeContentState, type SelectorRef } from "@render/core";
import type { ExhibitsJson, PortableExhibit, ViewerRoute } from "@render/core";

/** The bits of a Content State we resolve against the loaded library: the referenced resource IRI
 *  (a Canvas IRI via `target.source`, falling back to `target.id` stripped of its fragment), and any
 *  selector fragment (`xywh=` spatial / `t=` temporal). `decodeContentState` is the VALIDITY gate;
 *  this is the structural recovery the gate's return value omits (it keeps only annotationId+selector). */
export interface ContentStateTarget {
  /** The referenced resource IRI — a Canvas IRI to match against `canvasIdByObject`, or a Manifest IRI. */
  resourceIri: string;
  /** A media fragment recovered from the selector or the `target.id#…` tail: `xywh=` / `t=` value, stripped of its key. */
  fragment?: { kind: "xywh" | "t"; value: string };
}

/** Parse the raw `xywh=`/`t=` head off a FragmentSelector value (or a `#…` IRI tail), returning the
 *  typed fragment. Bare/unknown → undefined (whole-resource). Mirrors target-resolve fragmentOfStart. */
function fragmentFromSelectorValue(value: string | undefined): ContentStateTarget["fragment"] {
  if (!value) return undefined;
  if (value.startsWith("xywh=")) return { kind: "xywh", value: value.slice("xywh=".length) };
  if (value.startsWith("t=")) return { kind: "t", value: value.slice("t=".length) };
  return undefined;
}

/**
 * Decode + structurally recover a Content State into the resource IRI + fragment we resolve against the
 * library. Returns null on ANYTHING malformed — `decodeContentState` rejects non-Annotation / wrong
 * motivation / bad base64 / bad JSON (deeplink.ts:50-52,57), and we additionally reject a Content State
 * with no usable target IRI. NEVER throws (the gate + our guards are total).
 */
export function parseContentStateTarget(encoded: string): ContentStateTarget | null {
  if (typeof encoded !== "string" || encoded.length === 0) return null;
  // 1. VALIDITY GATE (donor): rejects garbage / wrong-motivation / bad base64. null ⇒ reject.
  const gated = decodeContentState(encoded);
  if (!gated) return null;

  // 2. STRUCTURAL RECOVERY: re-decode the SAME base64url JSON to read `target.source`/`target.id`,
  //    which the gate's return drops. Re-using the gate's exact base64url normalisation keeps the two
  //    in lock-step; any decode error here is impossible (the gate already parsed it) but is guarded.
  let cs: { target?: { source?: unknown; id?: unknown; selector?: unknown } };
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    cs = JSON.parse(decodeURIComponent(atob(b64)));
  } catch {
    return null;
  }
  const target = cs?.target;
  if (!target || typeof target !== "object") return null;

  // The referenced resource: prefer `source` (the Canvas IRI per the SpecificResource shape,
  // deeplink.ts:33-38); fall back to `id` with any `#fragment` stripped.
  const rawId = typeof target.id === "string" ? target.id : undefined;
  const hashIdx = rawId ? rawId.indexOf("#") : -1;
  const idIri = rawId ? (hashIdx === -1 ? rawId : rawId.slice(0, hashIdx)) : undefined;
  const source = typeof target.source === "string" ? target.source : undefined;
  const resourceIri = source ?? idIri;
  if (!resourceIri) return null;

  // The fragment: the selector value (gate already validated selector.type is a string), else the
  // `#…` tail of `target.id`. A `pixel:`/`percent:` xywh or a `t=` offset rides through unchanged.
  const sel = gated.selector as SelectorRef;
  const fromSelector = fragmentFromSelectorValue(sel?.value);
  const fromHash = hashIdx >= 0 && rawId ? fragmentFromSelectorValue(rawId.slice(hashIdx + 1)) : undefined;
  const fragment = fromSelector ?? fromHash;

  return fragment ? { resourceIri, fragment } : { resourceIri };
}

/** The slug + (optional) objectId a Content State resource IRI maps to, within ONE loaded exhibit. */
export interface ContentStateMatch {
  slug: string;
  /** Present when the IRI matched a specific Canvas (object); absent when it matched only the manifest/slug. */
  objectId?: string;
}

/** The `{base}{slug}/` prefix shared by an exhibit's canvas IRIs — recovered from any one canvas IRI by
 *  cutting at `/canvas/`. Lets a Manifest-only Content State (`{base}{slug}/manifest.json`) map to the
 *  slug without the gallery carrying manifest IRIs (it carries only slugs — exhibits.ts ExhibitCard). */
function manifestPrefixOf(canvasIri: string): string | null {
  const i = canvasIri.indexOf("/canvas/");
  return i === -1 ? null : canvasIri.slice(0, i + 1); // include trailing slash → `{base}{slug}/`
}

/**
 * Match a Content State's resource IRI to (slug, objectId) WITHIN one loaded exhibit. PURE — the element
 * drives the per-exhibit scan (exhibits load lazily; mirrors how #applyTarget pre-checks the slug, then
 * hands the loaded PortableExhibit to resolveExhibitTarget). Returns:
 *   • a Canvas-IRI exact hit  → { slug, objectId }   (the strongest, deep-link to the object)
 *   • a Manifest/slug-prefix hit → { slug }           (exhibit-level — no specific object)
 *   • null                     → this exhibit doesn't own the IRI (caller tries the next, else degrades)
 */
export function matchContentStateInExhibit(exhibit: PortableExhibit, resourceIri: string): ContentStateMatch | null {
  const byObj = exhibit.canvasIdByObject ?? {};
  // 1. Exact Canvas-IRI hit — the authoritative per-object map (read.ts:62). Strongest signal.
  for (const [objectId, canvasIri] of Object.entries(byObj)) {
    if (canvasIri === resourceIri) return { slug: exhibit.slug, objectId };
  }
  // 2. Manifest / slug-prefix hit — the IRI shares this exhibit's `{base}{slug}/` canvas prefix
  //    (a Manifest IRI `{base}{slug}/manifest.json`, or a foreign canvas under the same exhibit base).
  for (const canvasIri of Object.values(byObj)) {
    const prefix = manifestPrefixOf(canvasIri);
    if (prefix && resourceIri.startsWith(prefix)) return { slug: exhibit.slug };
  }
  return null;
}

/** A pre-scan over the GALLERY: which exhibit slugs to try, in order. The element still must LOAD each
 *  exhibit to read its `canvasIdByObject` (the IRI map isn't in the gallery index) — this just bounds the
 *  scan to real slugs. Returns all slugs (the gallery carries no manifest IRIs to pre-filter on). */
export function candidateSlugs(gallery: ExhibitsJson): string[] {
  return [...gallery.exhibits].sort((a, b) => a.order - b.order).map((e) => e.slug);
}

/**
 * Build the internal ViewerRoute a matched Content State lands on, so the element can feed it straight
 * into the EXISTING resolveExhibitTarget. An object hit becomes an `/o/<id>` route carrying the fragment
 * (xywh → ?xywh, t → ?t); a slug-only hit becomes a bare exhibit route. The element applies this through
 * its normal #openExhibit → resolveExhibitTarget → #applyResolved path — so a region/time fragment rides
 * the SAME surface-fit machinery as a native cite (and degrades identically when off-fit).
 */
export function contentStateMatchToRoute(match: ContentStateMatch, fragment?: ContentStateTarget["fragment"]): ViewerRoute {
  if (!match.objectId) return { view: "exhibit", slug: match.slug };
  const route: Extract<ViewerRoute, { view: "exhibit" }> = { view: "exhibit", slug: match.slug, objectId: match.objectId };
  if (fragment?.kind === "xywh") route.xywh = fragment.value;
  else if (fragment?.kind === "t") route.t = fragment.value;
  return route;
}

/**
 * The full PURE pipeline: an `iiif-content` value + a loaded gallery + a per-slug exhibit loader →
 * the internal ViewerRoute to apply (or null to DEGRADE to the gallery). The element supplies `loadExhibit`
 * (its lazy zip/tree reader); this stays headless-testable by passing a synchronous map in tests.
 *
 * DEGRADE-UPWARD (ADR-0021): malformed Content State → null (gallery). A valid Content State whose IRI no
 * loaded exhibit owns (foreign / unknown) → null (gallery). A Canvas/Manifest hit → its route. Never throws.
 */
export async function resolveContentState(
  encoded: string,
  gallery: ExhibitsJson,
  loadExhibit: (slug: string) => Promise<PortableExhibit | null>,
): Promise<ViewerRoute | null> {
  const parsed = parseContentStateTarget(encoded);
  if (!parsed) return null; // malformed → degrade to gallery

  for (const slug of candidateSlugs(gallery)) {
    let exhibit: PortableExhibit | null;
    try {
      exhibit = await loadExhibit(slug);
    } catch {
      continue; // an unreadable exhibit doesn't sink the whole resolve — try the next
    }
    if (!exhibit) continue;
    const match = matchContentStateInExhibit(exhibit, parsed.resourceIri);
    if (match) return contentStateMatchToRoute(match, parsed.fragment);
  }
  return null; // foreign / unknown IRI → degrade to gallery
}

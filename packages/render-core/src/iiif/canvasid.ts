// The ONE canvas-IRI minter (ADR-0001, ADR-0014). Every canvas id in the system is
// `${base}${slug}/canvas/${objectId}` — the manifest writer (`toManifest`), the Studio's working-store
// seeds, and the Viewer's published-tree helper all mint the SAME string so they can't drift. The
// `base` differs per caller on purpose (the working IRI namespace vs the published deploy origin vs ""
// for a relative manifest); the SHAPE is what's shared. Pure.
//
// NOTE (canvasId SNAG, see manifest.ts canvasIdMap): consumers wiring annotation TARGETING read the
// full IRI from the published manifest (`canvasIdMap`), which bakes the real publish origin — NOT from
// this minter with a fixed viewer-side base. This builder is for the WRITE side (mint the id) and for
// the working-store seeds; it is not a substitute for reading the baked id back.

/** Mint a canvas IRI: `${base}${slug}/canvas/${objectId}`. `base` is "" for a relative manifest, the
 *  publish origin for a real publish, or the working-store IRI namespace for the Studio seeds. */
export function canvasIdFor(base: string, slug: string, objectId: string): string {
  return `${base}${slug}/canvas/${objectId}`;
}

/**
 * The ONE canvas-IRI REBASER — the inverse-and-remint of `canvasIdFor`, for the seam where a library
 * changes origin (a re-publish of a loaded tree, a Studio library authored against `WORKING_IRI_BASE`
 * and published to a deploy origin).
 *
 * WHY THIS EXISTS. `publishLibrary` groups annotation heads by EXACT canvas-IRI equality against the
 * base it is publishing to (`site.ts`, the heads filter). A log whose targets were minted against a
 * different base therefore matches nothing and every note is dropped — silently, with a successful,
 * healthy-looking publish. That shipped: `apps/viewer/libraries/archie-library.archie.zip` carries
 * manifest/canvas ids at the real deploy origin, 182 history records targeting `https://archie.demo/`
 * (`WORKING_IRI_BASE`), and **zero** inline annotations on all 21 canvases. `loadLibrary` already
 * recovers ASSET sources across exactly this base change (`recoverAssetSources`, deriving the base
 * from the manifest's own id); annotation targets had no equivalent. This closes that asymmetry.
 *
 * NOT a fuzzy match. Prior art is unanimous that the canvas IRI *is* the identity — cozy-iiif's
 * `importAnnotationsToManifest` keys `bySource[canvas.id]`, clover's `Painting.tsx` compares
 * `canvas.id === target.source.id`, immarkus reads the baked id back via cozy-iiif — none of them
 * matches by suffix, and neither does this. A rebase happens ONLY when the slug segment and the
 * object-id tail both match this exhibit exactly, i.e. when the IRI provably denotes THIS canvas
 * republished at a new origin. Anything else — another exhibit's canvas, an external IIIF canvas, a
 * tail that is not one of this exhibit's objects — is returned untouched.
 *
 * Idempotent: an IRI already at `base` re-mints to itself, so applying this twice cannot corrupt one.
 */
export function rebaseCanvasId(iri: string, base: string, slug: string, isObjectId: (id: string) => boolean): string {
  const marker = `${slug}/canvas/`;
  // lastIndexOf, not indexOf: a base may itself contain the slug (`https://host/screenshots/published/`),
  // and the canvas segment is always the RIGHTMOST occurrence.
  const at = iri.lastIndexOf(marker);
  if (at === -1) return iri;
  // Keep any fragment (`#xywh=…`) attached to the tail — a bare-string target may carry one (ADR-0018
  // whole-object notes are bare IRIs, but a media-fragment string target is legal WADM too). The
  // fragment is not part of the object id and must survive the re-mint.
  const tail = iri.slice(at + marker.length);
  const hash = tail.indexOf("#");
  const objectId = hash === -1 ? tail : tail.slice(0, hash);
  const fragment = hash === -1 ? "" : tail.slice(hash);
  if (objectId.length === 0 || objectId.includes("/") || !isObjectId(objectId)) return iri;
  return `${canvasIdFor(base, slug, objectId)}${fragment}`;
}

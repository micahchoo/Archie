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

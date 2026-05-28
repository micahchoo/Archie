// Published-tree base + canvas-IRI helper, OWNED by the viewer (not the demo). The shell
// (ViewerShell/ExhibitView) imports canvasIdFor from HERE, never from sample-data — genericity
// requires the read path to carry no demo code.
//
// PUBLISH_BASE configures the absolute base URL for manifest/canvas/annotation IDs at publish
// time (e.g. "https://micahchoo.github.io/Archie/viewer/published/"). Set it in the build
// environment; defaults to the demo base for local dev. In the browser (Astro client bundle),
// process is undefined and the demo fallback is used — but the Viewer now reads canvas IRIs
// from the manifest's canvasIdByObject, so the fallback rarely triggers.

export const BASE =
  typeof process !== "undefined" && process.env?.PUBLISH_BASE
    ? process.env.PUBLISH_BASE
    : "https://archie.demo/";

export const canvasIdFor = (slug: string, objectId: string): string => `${BASE}${slug}/canvas/${objectId}`;

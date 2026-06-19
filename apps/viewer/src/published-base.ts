// Published-tree base + canvas-IRI helper, OWNED by the viewer (not the demo). The shell
// (ViewerShell/ExhibitView) imports canvasIdFor from HERE, never from sample-data — genericity
// requires the read path to carry no demo code.
//
// PUBLISH_BASE configures the absolute base URL for manifest/canvas/annotation IDs at publish
// time (e.g. "https://micahchoo.github.io/Archie/viewer/published/"). Set it in the build
// environment; otherwise it DEFAULTS from the ONE config source (archie.config.json, ADR-0013
// amendment) — the same value build-gh-pages.sh computes for PUBLISH_BASE — so a plain `pnpm gen`
// / dev bakes the real canonical origin into the tree instead of a stand-in (no more archie.demo).
// JSON import works in both node (gen) and the Astro client bundle (cf. og-image.ts).

import config from "../../../archie.config.json";

/** Build-time default base for published-tree IDs, from archie.config.json (canonicalOrigin + viewerPath). */
const CONFIG_BASE = `${config.canonicalOrigin}${config.viewerPath}published/`;

export const BASE =
  typeof process !== "undefined" && process.env?.PUBLISH_BASE
    ? process.env.PUBLISH_BASE
    : CONFIG_BASE;

// The interactive Viewer's base (the canonical instance, ADR-0013) — where in-prose cites resolve so a
// click lands in the live reading experience (`{VIEWER_BASE}#/<slug>/a/<id>`). PUBLIC_CANONICAL_ORIGIN
// overrides per deploy (build-gh-pages.sh sets it); otherwise defaults from archie.config.json. Without
// this, cites fall back to the durable static-archival anchor — fine, but not the in-app route.
export const VIEWER_BASE =
  typeof process !== "undefined" && process.env?.PUBLIC_CANONICAL_ORIGIN
    ? process.env.PUBLIC_CANONICAL_ORIGIN
    : `${config.canonicalOrigin}${config.viewerPath}`;

export const canvasIdFor = (slug: string, objectId: string): string => `${BASE}${slug}/canvas/${objectId}`;

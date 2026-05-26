// Published-tree base + canvas-IRI helper, OWNED by the viewer (not the demo). The shell
// (ViewerShell/ExhibitView) imports canvasIdFor from HERE, never from sample-data — genericity
// requires the read path to carry no demo code.
//
// NOTE (Phase-B owed, see LOCAL-VIEW-LOOP.md): canvasIdFor reconstructs the canvas IRI from a
// fixed BASE. That matches the demo (published with this same BASE), but a real publish bakes a
// different origin into the manifest's canvas ids — so the correct long-term source is the
// manifest's own canvas id (objectsFromManifest currently discards it). Fine for Phase A
// (demo-fed); Phase B must read the IRI from the manifest to make non-demo publishes' annotations
// target correctly.

export const BASE = "https://archie.demo/";

export const canvasIdFor = (slug: string, objectId: string): string => `${BASE}${slug}/canvas/${objectId}`;

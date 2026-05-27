# Portable Viewer read seam = data-provider + blob URLs (not a Service Worker)

Status: accepted (2026-05-27)

The portable Viewer (ADR-0008) consumes the loaded `Filesystem` via a **data-provider branch in `apps/viewer/src/published.ts`**: hosted → `fetch(`${PUBLISHED}/…`)`; portable → `loadPortableExhibit(fs, slug)`, which reads the same data out of the in-memory `ZipFilesystem` and mints `blob:` object URLs for embedded `/assets/` media — rewriting **both** `object.source` and the `/assets/` tokens inside note-body markdown — with a `revoke()` lifecycle. Chosen over a Service Worker that would intercept `${BASE_URL}published/*` (leaving `published.ts` and every component literally unchanged).

## Evidence

Spike at `spikes/portable-viewer-seam/` (quarantined; 16 vitest tests green, Node v24 + happy-dom).

- **Service Worker (S) — rejected for v1.** Its media/deep-link win is real *only* if the SW reliably intercepts `/<repo>/published/*` on a GitHub **project** site (GH can't set `Service-Worker-Allowed`) AND wins a "SW active + page→worker zip handoff before the first fetch" race. Neither is node-verifiable; the failure mode is a blank exhibit on first paint. S replaces the absent server with a worker pretending to be one — more moving parts, fighting the locked "no server" frame.
- **Data-provider (P) — chosen.** ~174 LOC of pure, fully node-tested data code; **zero component changes**, because the image sinks already pass `blob:`/`data:` through unchanged (`packages/render-core/src/iiif/resolve.ts:41`, verified) — so `ObjectGrid`/`Reader`/`MediaPlayer`/`NoteMedia` are untouched once URLs are rewritten. Blob URLs are origin-scoped per-load, so cache-isolation is free (S had to namespace by `libraryId` to prevent cross-library reads in its shared URL space).

## Consequences

- `published.ts` gains a portable branch adapting the spike's `loadPortableExhibit`. Core's `readPublishedExhibit` (`publish/site.ts`) omits the Readings registry, so the portable reader re-implements the readings read (~30 LOC, mirroring `published.ts:50,60`).
- **Browser-verify owed before ship:** a real `<img>/<video>/<audio src="blob:">` actually paints; OSD `type:'image'` accepts a `blob:` tile source; RAM peak for a large-media library + `revoke()` fires on nav/close before the next exhibit mints.
- If network-true deep-links *into* a portable library are ever required, revisit S as a **v1.1 hybrid layered on P**, not the v1 seam.

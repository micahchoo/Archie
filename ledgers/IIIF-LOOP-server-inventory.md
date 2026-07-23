# Server & source inventory — self-hosted IIIF loop (Archie-20c2)

Captured 2026-07-19 from user grilling + direct machine checks. The facts later tickets depend on.

## Topology: everything is one machine

The "home server" IS the authoring machine. Consequences:

- The **folder = docroot** publish lane is a plain local path — no mount, no sync daemon.
  Studio (browser, FSA folder binding per Archie-aa69) binds the docroot directly; publish
  writes land live.
- LAN-first (public exposure deferred — Archie-e8c7). No TLS needed for the authoring loop;
  browser Studio on localhost fetching http://localhost images is same/plain-http and fine.

## Web server

- **nginx** (user's choice) — **not yet installed** (`nginx: command not found`, unit inactive,
  2026-07-19). Install + vhost setup belongs to the server-config ticket (Archie-e392) checklist.
- Serving rules inherited from the map: honest 404s (no SPA rewrite over the tree), CORS for
  cross-origin viewer pages, deny-list `/.git/` and the WebDAV upload path from public serving.

## Source folder

- Path: `/mnt/Ghar/2TA/BHC006_GAWANMUSEUMTRUST` — 1252 files (2026-07-19).
- Top-level structure (collection-shaped): `Artifacts/`, `Audio Interviews (AI)/`,
  `Documents (D)/`, `Photo Narratives (PN)/`, `Video (V)/`, `Extras/`, plus four Excel
  registers (`BHC006_*.xlsx`) and a **`tiny-iiif/`** directory — an existing IIIF attempt;
  prior art the derivative survey (Archie-b0e2) must examine before recommending tooling.
- NOT images-only: audio interviews and video are first-class content → the manifest
  generator and derivative pipeline must cover AV (Archie ingests sound/video objects by URL;
  media-src rules apply).
- The Excel registers are the likely source for bulk labels/rights metadata (map Fog:
  "bulk rights metadata" — this is where it would come from).

## Open follow-ups owned by other tickets

- docroot path choice + nginx install/config → Archie-e392.
- Folder contents detail (formats, sizes, EXIF, tiny-iiif assessment) → Archie-b0e2.

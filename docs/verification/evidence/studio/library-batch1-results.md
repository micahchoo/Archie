# Studio Library baseline checks

Executed against isolated Studio Vite `http://localhost:5198/studio/` with Node 22 and fresh Playwright contexts. The create/reopen harness is `apps/studio/e2e/user-stories-library.mjs`.

- `STU-LIB-001`: Pass — library rendered six exhibits/examples and exhibit navigation opened an overview. Screenshot: `/tmp/archie-batch1/001-home.png`.
- `STU-LIB-002`: Partial — `Rosettes` search returned a matching result. Clearing and media-title search were not asserted.
- `STU-LIB-003`: Partial — All images wall rendered. Reload persistence and empty-library fallback were not asserted.
- `STU-LIB-004`: Pass — image wall card opened `#/voynich-rosettes/o/ex-voynich.o9`. Screenshot: `/tmp/archie-batch1/004-image-open.png`.
- `STU-LIB-005`: Pass — `Baseline Empty Exhibit` opened an empty overview, returned to library, and remained reopenable. JSON: `/tmp/archie-library-stories.json`.
- `STU-LIB-006`: Fail — editing `Name this library` to `Same Context Library`, blurring, waiting 1.5s, reloading, and reopening Details returned an empty title. This is an actual persistence failure under the isolated Studio browser flow.
- `STU-LIB-011`: Pass for identity write/read in the same test context — `Baseline Curator` remained visible after reload; cross-context verification is pending.
- `STU-LIB-007`, `STU-LIB-008`, `STU-LIB-009`: Not tested in this run; no pass inferred from drawer/control visibility.

Follow-up durable harness run (`apps/studio/e2e/user-stories-library.mjs`, output `/tmp/archie-library-stories.json`) passed `STU-LIB-007`: renamed the created exhibit, reloaded, and found the renamed card; the Details drawer also showed the unlisted checkbox checked after reload. `STU-LIB-008` passed delete confirmation and reload absence. `STU-LIB-009` exposed Select all and Clear, but the post-Clear body still contained selection text; this is a provisional UX failure requiring focused DOM inspection.

Supporting launch screenshots and suite results are in this directory and `/tmp/archie-batch1/`.

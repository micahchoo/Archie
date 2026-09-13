# STU-LIB-006 metadata persistence reproduction

Playwright flow against isolated Studio `http://localhost:5198/studio/`:

1. Open the Library Details dialog using the visible Details control.
2. Fill `input[placeholder="Name this library"]` with `Same Context Library`.
3. Press Tab to blur and wait 1.5 seconds.
4. Reload the same browser page.
5. Reopen Details and read the exact input value.

Observed value after reload: empty string (`""`). The save indicator changed to “Save to disk · this browser” while the dialog was open. This is based on `inputValue()`, not body text. Reproduction was repeated in the same browser context.

Relevant boot path: `apps/studio/src/App.svelte:434` calls `lib.setMeta({...lib.meta, exhibits: ...})` during startup; this is the suspected loaded-meta overwrite seam for the observed loss.

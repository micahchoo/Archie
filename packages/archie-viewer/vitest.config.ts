import { defineConfig } from "vitest/config";

// happy-dom so the custom element (customElements / HTMLElement / Shadow DOM / DataTransfer) and the
// render-mount import (OSD touches `document` at module load) resolve in node. We do NOT construct a
// real OSD viewer headlessly — the reader mount is tested at the seam (the load-seam + the lazy-import
// boundary), mirroring read-mount.test.ts's fake-viewer idiom. No live render here.
export default defineConfig({
  test: {
    environment: "happy-dom",
  },
});

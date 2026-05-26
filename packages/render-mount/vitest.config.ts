import { defineConfig } from "vitest/config";

// happy-dom so OpenSeadragon (which touches `document` at module load) can be imported in
// node tests. We do NOT construct a real OSD viewer headlessly (memory: don't browser-verify
// here — use happy-dom for import/logic, leave real-render visuals to the human). The
// behavioral oracle is the pure dispatchFitBounds gate (gate.test.ts), not a live OSD.
export default defineConfig({
  test: {
    environment: "happy-dom",
  },
});

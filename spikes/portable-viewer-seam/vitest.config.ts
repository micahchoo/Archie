import { defineConfig } from "vitest/config";

// happy-dom gives us Blob, File, URL.createObjectURL/revokeObjectURL, Request, Response —
// the browser surface both approaches lean on at the DATA layer. We do NOT register a real
// Service Worker or construct an OSD viewer here (project memory: don't browser-verify in
// this repo — happy-dom for import/logic, real-render + SW interception left to the human).
export default defineConfig({
  test: {
    environment: "happy-dom",
  },
});

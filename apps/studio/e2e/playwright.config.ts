import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Studio e2e gate (Archie-d80f). The one place we mount the REAL App + a real browser history —
// the popstate/hashchange re-entrancy bug class (App.svelte `applyPlace`/`onLocationChange`, ADR-0024)
// is invisible to the repo's pure-module vitest posture, which never has a `history` to traverse.
//
// Scoped to apps/studio only: this config lives under apps/studio/e2e and its webServer boots the
// STUDIO vite dev server alone (no front-door proxy, no viewer). Chromium-only — the annotation
// stack (Annotorious/PixiJS) is the app's only browser-engine concern and it ships to a single
// Chromium webview (Tauri) anyway, so cross-browser coverage would buy nothing here.

// Dedicated port so a running `pnpm dev` (:5174, strictPort) never collides with the gate.
// Env-overridable (STUDIO_E2E_PORT) so concurrent sessions/agents can each pick a free port.
const PORT = Number(process.env.STUDIO_E2E_PORT) || 5198;
// vite serves the SPA under `base: "/studio/"` (single-origin dev contract); a bare-root hit 302s here.
const BASE_URL = `http://localhost:${PORT}/studio/`;
// apps/studio — where vite.config.ts lives, so the dev server reads the studio base/config.
const STUDIO_DIR = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One retry in CI so `trace: on-first-retry` captures a failing traversal; none locally (fail fast).
  retries: process.env.CI ? 1 : 0,
  // Serial: the specs share one dev server and drive global browser history; parallel workers would
  // only add nondeterminism without isolating anything the per-test browser context doesn't already.
  workers: 1,
  // `flaky-reporter` raises a retried-but-passed test to a GitHub annotation + the job summary,
  // carrying the FIRST run's error. The retry stays (a real browser under runner load will noise
  // occasionally, and a build that cries wolf gets ignored) — but a load-sensitive DEFECT looks
  // exactly like that noise, which is how one nearly shipped on 2026-07-26. Human ruling: keep the
  // retry, surface the flake. See scripts/flaky-reporter.mjs for the full reasoning.
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["../../../scripts/flaky-reporter.mjs"]]
    : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `vite` (not the `dev` script) — sync-learn only stages tutorial assets, irrelevant to navigation,
    // and skipping it keeps startup lean. --strictPort makes a port clash fail loudly, not silently drift.
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    cwd: STUDIO_DIR,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

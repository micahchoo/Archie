import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Viewer e2e gate. The viewer had NO browser gate at all: `svelte-check` types the islands and
// vitest exercises pure modules, but neither can see whether a prop is actually BOUND, whether a
// control renders, or whether the crawler's page has a body — and all three shipped broken in one
// session (.claude/rules/svelte-no-typecheck-net.md: a typed-but-undestructured `oncancel` passed
// svelte-check at 1464 files / 0 errors while the Cancel button silently never rendered).
//
// BUILT OUTPUT, not dev. Two reasons, both load-bearing:
//  1. The static exhibit shell (V107) is produced by a build-time `import.meta.glob` inside
//     `getStaticPaths`. An earlier attempt used runtime fs reads, which silently yielded EMPTY object
//     lists while the build stayed green — only measuring the built HTML caught it. A dev-server gate
//     would have shipped that.
//  2. Astro dev has no index.html entry crawl, so a sibling instance rewriting the shared
//     optimizeDeps cache can wedge a long-running server (.claude/rules/viewer-optimizedeps-bare-includes.md).
//     `astro preview` serves static files and has no optimizer, so the gate can't catch that flake.
//
// HERMETIC. Every bundled sample exhibit sources its images from a remote IIIF service (Yale,
// archive.org, OSM tiles). The specs abort all non-localhost requests, so CI never depends on a third
// party being up — and the assertions are stronger for it: they prove the chrome, the filmstrip and
// the object grid render from the MANIFEST, independent of whether a single tile ever loads.
const PORT = Number(process.env.VIEWER_E2E_PORT) || 4326;
// SITE_BASE=/viewer/ mirrors both dev (scripts/dev.sh) and the GH-Pages deploy layout, so hrefs and
// asset paths under test are the ones that ship. A bare "/" base would exercise paths nothing serves.
const BASE_URL = `http://localhost:${PORT}/viewer/`;
const VIEWER_DIR = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build INSIDE the gate rather than trusting a dist/ someone else left behind — a stale build is
    // exactly the failure this suite exists to catch, and `prebuild` (gen-published) must run so the
    // published tree under test is the current one. Slower than a dev server; deterministic instead.
    command: `pnpm build && pnpm exec astro preview --port ${PORT}`,
    cwd: VIEWER_DIR,
    env: { SITE_BASE: "/viewer/" },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 420_000,
  },
});

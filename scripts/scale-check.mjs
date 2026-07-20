// Archie pre-release scale drill (Archie-676f).
//
// Seeds the REAL 70-object OPFS library through the Studio UI (scripts/seed-fixture.mjs — folder
// ingest, production bytes, idempotent) and then asserts coarse scale budgets against it:
//   1. asset-count threshold — the three seeded exhibits report their full media counts
//      (30 + 30 + 10 = 70 objects survived ingest + reload from OPFS);
//   2. library mount cost — the library home shows all three cards within a budget;
//   3. overview open cost — opening the 30-object exhibit renders all its plates within a budget
//      (plates are content-visibility-virtualized, so the DOM count is the honest total).
//
// Budgets are deliberately COARSE (cold CI runners, dev-server compile-on-demand) — this is a
// release-readiness drill, not a perf benchmark. Override via SCALE_BUDGET_LIBRARY_MS /
// SCALE_BUDGET_OVERVIEW_MS. Runs from .github/workflows/scale-check.yml (workflow_dispatch only —
// never a PR gate).
//
// Run:  node scripts/scale-check.mjs           (boots the Studio dev server if none is up)
//       SEED_FRESH=1 node scripts/scale-check.mjs   (wipe + reseed first)

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import { sleep, PLATE_SELECTOR, settle, launchPersistentProfile, ensureStudioServer } from "./lib/driver.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_DIR = process.env.SEED_PROFILE ?? path.join(REPO, ".scratch", "seed-profile");
const VIEWPORT = { width: 1440, height: 900 };
const STUDIO_CANDIDATES = [process.env.STUDIO_URL, "http://localhost:5174/studio/", "http://localhost:5173/studio/"].filter(Boolean);

// The seed-fixture contract (scripts/seed-fixture.mjs EXHIBITS): folder basename = exhibit title.
const EXPECTED = [
  { name: "Coastal Survey", count: 30 },
  { name: "Archive Scans", count: 30 },
  { name: "Field Notes", count: 10 },
];
const TOTAL = EXPECTED.reduce((a, e) => a + e.count, 0);

const BUDGET_LIBRARY_MS = Number(process.env.SCALE_BUDGET_LIBRARY_MS ?? 30_000);
const BUDGET_OVERVIEW_MS = Number(process.env.SCALE_BUDGET_OVERVIEW_MS ?? 45_000);

const results = [];
let failed = false;
function assert(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

/** Poll `fn` (→ boolean) every 250ms until true or `deadlineMs`; returns elapsed ms or null. */
async function timeUntil(fn, deadlineMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < deadlineMs) {
    if (await fn()) return Date.now() - t0;
    await sleep(250);
  }
  return null;
}

/** Run seed-fixture as a child (it is idempotent; --fresh via SEED_FRESH=1). */
function runSeeder(studioUrl) {
  const args = ["scripts/seed-fixture.mjs", ...(process.env.SEED_FRESH ? ["--fresh"] : [])];
  return new Promise((resolve, reject) => {
    const child = spawn("node", args, { cwd: REPO, stdio: "inherit", env: { ...process.env, STUDIO_URL: studioUrl } });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed-fixture exited ${code}`))));
    child.on("error", reject);
  });
}

async function main() {
  console.log(`\n=== Archie scale check (${TOTAL}-object fixture) ===`);
  await mkdir(path.join(REPO, ".scratch"), { recursive: true });
  const { url: STUDIO, stop: stopServer } = await ensureStudioServer({ repo: REPO, candidates: STUDIO_CANDIDATES });

  console.log("• Seeding the fixture library (idempotent)…");
  await runSeeder(STUDIO);

  const context = await launchPersistentProfile(PROFILE_DIR, { viewport: VIEWPORT });
  try {
    const page = context.pages()[0] ?? (await context.newPage());

    // 1+2 — library mount: all three seeded cards visible, then their counts add up to 70.
    const t0 = Date.now();
    await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const libMs = await timeUntil(async () => {
      const seen = await Promise.all(EXPECTED.map((ex) => page.locator("button.card", { hasText: ex.name }).count()));
      return seen.every((n) => n > 0);
    }, BUDGET_LIBRARY_MS - (Date.now() - t0));
    assert(`library mounts all ${EXPECTED.length} seeded exhibits within ${BUDGET_LIBRARY_MS / 1000}s`, libMs !== null,
      libMs !== null ? `${((Date.now() - t0) / 1000).toFixed(1)}s` : "timed out");

    let total = 0;
    for (const ex of EXPECTED) {
      const meta = await page.locator("button.card", { hasText: ex.name }).first().locator(".meta").innerText().catch(() => "");
      const m = meta.match(/(\d+)\s+media item/i);
      const n = m ? Number(m[1]) : 0;
      total += n;
      assert(`"${ex.name}" carries its full ${ex.count} objects`, n === ex.count, `card reports ${n}`);
    }
    assert(`asset-count threshold: ${TOTAL} objects survived ingest + OPFS reload`, total === TOTAL, `${total}/${TOTAL}`);

    // 3 — overview open: the 30-object exhibit renders every plate (DOM count; plates are
    // content-visibility-virtualized so presence, not paint, is the stable signal).
    const big = EXPECTED[0];
    const tOpen = Date.now();
    await page.locator("button.card", { hasText: big.name }).first().click();
    const openMs = await timeUntil(async () => (await page.locator(PLATE_SELECTOR).count()) >= big.count, BUDGET_OVERVIEW_MS);
    assert(`overview of "${big.name}" renders ${big.count} plates within ${BUDGET_OVERVIEW_MS / 1000}s`, openMs !== null,
      openMs !== null ? `${((Date.now() - tOpen) / 1000).toFixed(1)}s` : `timed out at ${await page.locator(PLATE_SELECTOR).count()} plates`);
    await settle(page, 500);
  } finally {
    await context.close();
    stopServer();
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} assertions held.`);
  console.log(failed ? "=== SCALE CHECK: FAIL ===" : "=== SCALE CHECK: PASS ===");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });

// THROWAWAY PROTOTYPE (ticket Archie-a66d / D1). Delete once the D1 ledger is written.
// Two-tab driver for the D1 prototype. Runs against the live bun dev server.
//   1. bun run dev   (in this dir; serves http://localhost:3001/)
//   2. node verify-two-tab.mjs   (uses the repo-root playwright + chromium)
// Drives: (T1) A's edit appears live in B; (T2) concurrent same-annotation edits => 2 heads in
// both; (T3) resolving in one tab clears the conflict in both. All via the REAL render-core spine.
import pw from "/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/node_modules/playwright/index.js";
const { chromium } = pw;

const URL = process.env.D1_URL || "http://localhost:3001/";
const LID0 = "01JADAA0000000000000000A0A"; // first seed annotation
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function firstHeadBody(page, lid) {
  return page.evaluate((lid) => {
    const l = window.__d1.log();
    const recs = l.filter((r) => r.logicalId === lid);
    const referenced = new Set();
    for (const r of recs) { if (r.parent) referenced.add(r.parent); for (const m of r.mergeParents || []) referenced.add(m); }
    const heads = recs.filter((r) => !referenced.has(r.rev));
    const b = heads[0]?.body;
    const one = Array.isArray(b) ? b[0] : b;
    return { headCount: heads.length, body: one?.value ?? "" };
  }, lid);
}

async function conflictCount(page) {
  return page.locator(".card.conflict").count();
}

let failures = 0;
const check = (name, ok, detail = "") => {
  log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
const A = await ctx.newPage();
const B = await ctx.newPage();
A.on("pageerror", (e) => log("A pageerror:", e.message));
B.on("pageerror", (e) => log("B pageerror:", e.message));

log("== opening two tabs ==");
await A.goto(URL);
await B.goto(URL);
await A.waitForSelector(".card");
await B.waitForSelector(".card");
const seedCountA = await A.locator(".card").count();
const seedCountB = await B.locator(".card").count();
check("both tabs render the 3 seed annotations", seedCountA === 3 && seedCountB === 3, `A=${seedCountA} B=${seedCountB}`);

log("\n== TEST 1: edit in A appears live in B ==");
await A.evaluate((lid) => window.__d1.edit(lid, "EDITED-BY-A-live"), LID0);
await B.waitForFunction((lid) => {
  const l = window.__d1.log().filter((r) => r.logicalId === lid);
  return l.some((r) => (Array.isArray(r.body) ? r.body[0] : r.body)?.value === "EDITED-BY-A-live");
}, LID0, { timeout: 4000 }).catch(() => {});
const bAfter = await firstHeadBody(B, LID0);
check("B's head body reflects A's edit", bAfter.body === "EDITED-BY-A-live", `B body="${bAfter.body}"`);

log("\n== TEST 2: concurrent same-annotation edits -> 2 heads in BOTH tabs ==");
await A.evaluate(() => window.__d1.transport.pause());
await B.evaluate(() => window.__d1.transport.pause());
await A.evaluate((lid) => window.__d1.edit(lid, "A: the cipher is Latin"), LID0);
await B.evaluate((lid) => window.__d1.edit(lid, "B: the cipher is a hoax"), LID0);
await A.evaluate(() => window.__d1.transport.resume());
await B.evaluate(() => window.__d1.transport.resume());
await sleep(400);
const headsA = (await firstHeadBody(A, LID0)).headCount;
const headsB = (await firstHeadBody(B, LID0)).headCount;
const confA = await conflictCount(A);
const confB = await conflictCount(B);
check("tab A shows 2 heads", headsA === 2, `heads=${headsA}`);
check("tab B shows 2 heads", headsB === 2, `heads=${headsB}`);
check("tab A renders a conflict panel", confA === 1, `panels=${confA}`);
check("tab B renders a conflict panel", confB === 1, `panels=${confB}`);
// branch bodies visible in both
const branchesA = await A.locator(".card.conflict .branch-body").allTextContents();
check("both branch bodies visible in A", branchesA.join("|").includes("Latin") && branchesA.join("|").includes("hoax"), branchesA.join(" ; "));

log("\n== TEST 3: resolve in one tab clears the conflict in BOTH ==");
await A.locator(".card.conflict .branch button").first().click();
await sleep(400);
const headsA2 = (await firstHeadBody(A, LID0)).headCount;
const headsB2 = (await firstHeadBody(B, LID0)).headCount;
const confA2 = await conflictCount(A);
const confB2 = await conflictCount(B);
check("tab A conflict cleared (1 head)", headsA2 === 1 && confA2 === 0, `heads=${headsA2} panels=${confA2}`);
check("tab B conflict cleared (1 head)", headsB2 === 1 && confB2 === 0, `heads=${headsB2} panels=${confB2}`);
const finalA = (await firstHeadBody(A, LID0)).body;
const finalB = (await firstHeadBody(B, LID0)).body;
check("both tabs converge to same resolved body", finalA === finalB && finalA.length > 0, `A="${finalA}" B="${finalB}"`);

// rev-count / grow-only sanity: nothing was overwritten
const totalRevsA = await A.evaluate((lid) => window.__d1.log().filter((r) => r.logicalId === lid).length, LID0);
log(`\n  (grow-only check: LID0 now has ${totalRevsA} revs in the log — seed + A-edit + 2 siblings + merge node = 5 expected)`);
check("grow-only log retained all revs for LID0", totalRevsA === 5, `revs=${totalRevsA}`);

await browser.close();
log(`\n==== ${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"} ====`);
process.exit(failures === 0 ? 0 : 1);

// Accessibility as a MEASURED BUILD OUTPUT (Archie-ea57) — an axe-core ratchet over the published
// static pages, with the same discipline as the payload and bundle budgets: record a baseline, fail
// on regression, never silently drift.
//
// THE THREE DECISIONS THIS TICKET ASKED FOR, and why:
//
// 1. WHICH PAGES. The published static tree under `apps/viewer/public/published/` — the library
//    landing plus every exhibit `index.html`. That tree is the ARTIFACT this ticket is about: it is
//    what a reader with no JavaScript gets, what a crawler indexes, and what an institution deposits.
//    It is also checked in, so the pages exist without a build step and the check is deterministic.
//    The viewer SHELL is deliberately out of scope until self-replicating publish lands — its own
//    e2e suite already carries a11y specs (inert-a11y.spec.ts), and duplicating them here would give
//    two sources for one fact.
//
// 2. WHICH RULESET. WCAG 2.1 A + AA (`wcag2a,wcag2aa,wcag21a,wcag21aa`). That is the standard almost
//    every institution's procurement actually names, so a violation here is a claim someone can act
//    on. Axe's `best-practice` tag is EXCLUDED on purpose: it is advice, not a standard, and mixing
//    it in makes a ratchet that fails for reasons nobody agreed to — which is how a gate gets
//    disabled rather than fixed.
//
// 3. WHERE. Its own step in checks.yml beside the other ratchets, gated on the committed tree, so it
//    runs on every PR without needing a build.
//
// Baseline: `scripts/a11y-baseline.json`, refreshed ONLY through `pnpm a11y:baseline`. Never written
// as a side effect of the check — see `.claude/rules/archie-viewer-eager-closure.md`, where a build
// that rewrote its own baseline turned a 231 KB regression into a green run. A gate whose reference
// point is writable by the thing it gates is not a gate.
//
// Run:  node scripts/a11y-check.mjs            (report only)
//       node scripts/a11y-check.mjs --check    (fail on regression — CI)
//       node scripts/a11y-check.mjs --update   (rewrite the baseline)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { launchBrowser } from "./lib/driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const TREE = path.join(REPO, "apps/viewer/public/published");
const BASELINE = path.join(HERE, "a11y-baseline.json");

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const mode = process.argv.includes("--update") ? "update" : process.argv.includes("--check") ? "check" : "report";

/** Every static page in the committed tree: the landing plus one per exhibit. */
function pages() {
  const out = [];
  if (existsSync(path.join(TREE, "index.html"))) out.push("index.html");
  for (const entry of readdirSync(TREE, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = `${entry.name}/index.html`;
    if (existsSync(path.join(TREE, rel))) out.push(rel);
  }
  return out.sort();
}

const req = createRequire(path.join(REPO, "package.json"));
const AXE_SOURCE = readFileSync(req.resolve("axe-core"), "utf8");

const list = pages();
if (list.length === 0) {
  console.error(`a11y-check: no static pages under ${TREE} — nothing to measure.`);
  process.exit(1);
}

const browser = await launchBrowser();
const page = await browser.newPage();
const results = {};
try {
  for (const rel of list) {
    await page.goto(pathToFileURL(path.join(TREE, rel)).href, { waitUntil: "load" });
    await page.addScriptTag({ content: AXE_SOURCE });
    const violations = await page.evaluate(
      async (tags) => {
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
        // Keep the RULE ids and their counts, not the node HTML: the baseline is a diffable record of
        // what is wrong, and pasting markup into it would make every content edit look like a change.
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })).sort((a, b) => a.id.localeCompare(b.id));
      },
      WCAG_TAGS,
    );
    results[rel] = violations;
  }
} finally {
  await browser.close();
}

const totalOf = (r) => Object.values(r).reduce((n, vs) => n + vs.reduce((m, v) => m + v.nodes, 0), 0);
const total = totalOf(results);

for (const [rel, vs] of Object.entries(results)) {
  const n = vs.reduce((m, v) => m + v.nodes, 0);
  console.log(`${n === 0 ? "ok   " : "WARN "} ${rel} — ${n} violating node(s)${vs.length ? `: ${vs.map((v) => `${v.id}×${v.nodes}`).join(", ")}` : ""}`);
}
console.log(`\nWCAG 2.1 A+AA over ${list.length} published page(s): ${total} violating node(s) total`);

if (mode === "update") {
  writeFileSync(BASELINE, `${JSON.stringify({ tags: WCAG_TAGS, pages: results }, null, 2)}\n`);
  console.log(`baseline written → ${path.relative(REPO, BASELINE)}`);
  process.exit(0);
}

if (mode !== "check") process.exit(0);

if (!existsSync(BASELINE)) {
  console.error(`\na11y-check: no baseline at ${path.relative(REPO, BASELINE)} — run \`pnpm a11y:baseline\` once and commit it.`);
  process.exit(1);
}
const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const baseTotal = totalOf(base.pages ?? {});

// The ratchet: a NEW page starts at zero, and no page may get worse. Per-page, not just the total —
// a total-only check lets one page regress while another improves, which is exactly the drift a
// ratchet exists to prevent.
const failures = [];
for (const [rel, vs] of Object.entries(results)) {
  const now = vs.reduce((m, v) => m + v.nodes, 0);
  const was = (base.pages?.[rel] ?? []).reduce((m, v) => m + v.nodes, 0);
  if (base.pages?.[rel] === undefined && now > 0) failures.push(`${rel} is NEW and already has ${now} violating node(s) — a new page starts clean`);
  else if (now > was) failures.push(`${rel} regressed: ${was} → ${now} violating node(s)`);
}

if (failures.length > 0) {
  console.error(`\nFAIL — accessibility regressed (${baseTotal} → ${total} nodes):`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error(`\nFix the violation, or — if it is genuinely intended — refresh the baseline with \`pnpm a11y:baseline\` in its own commit, so the change reads as a decision in review.`);
  process.exit(1);
}
console.log(`ok — no page regressed (baseline total ${baseTotal})`);

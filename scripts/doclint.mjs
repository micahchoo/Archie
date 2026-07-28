#!/usr/bin/env node
// doclint — deterministic gate over the knowledge layer.
// Design: ledgers/DESIGN-knowledge-layer-2026-07-27.md (§2 Q6, §3b).
// Usage:  node scripts/doclint.mjs          run all checks, exit 1 on any ERROR
//         node scripts/doclint.mjs --index  regenerate hubs/INDEX.md (the only writer)
//
// The allowlist (scripts/doclint-allow.json) is a hand-maintained reference: editing
// it is a deliberate, reviewable act — the same pattern as `pnpm bundle:baseline`.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync, lstatSync, realpathSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOW = JSON.parse(readFileSync(join(ROOT, "scripts/doclint-allow.json"), "utf8"));
const git = (args) =>
  execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trimEnd();

const findings = [];
const err = (check, msg) => findings.push({ check, msg });
const ok = (check, msg) => console.log(`DOCLINT ok    ${check} — ${msg}`);

// ---------- shared helpers ----------

const trackedFiles = git("ls-files").split("\n");

function globToRegex(glob) {
  let s = glob.replace(/[.+^${}()|\\]/g, "\\$&");
  s = s.replace(/\*\*\//g, "\u0000").replace(/\*\*/g, "\u0001").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  s = s.replaceAll("\u0000", "(?:.*/)?").replaceAll("\u0001", ".*");
  return new RegExp(`^${s}$`);
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    if (val === "" || val === "|") {
      const list = [];
      while (i + 1 < lines.length && lines[i + 1].match(/^\s+-\s+/)) list.push(lines[++i].replace(/^\s+-\s+/, "").trim().replace(/^["']|["']$/g, ""));
      out[key] = list;
    } else if (val.startsWith("[")) {
      out[key] = val.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else out[key] = val.replace(/^["']|["']$/g, "");
  }
  return out;
}

const scopesOf = (fm) => (Array.isArray(fm.scope) ? fm.scope : fm.scope ? fm.scope.split(",").map((x) => x.trim()) : []);

function mdFiles(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  // symlinks are excluded: .claude/rules/hub-*.md are scope-push aliases of hubs/*.md
  // (single source of truth is hubs/); counting them here would double every hub.
  return readdirSync(abs)
    .filter((f) => f.endsWith(".md") && !lstatSync(join(abs, f)).isSymbolicLink())
    .map((f) => join(dir, f));
}

const RULE_DIRS = [".claude/rules"];
const HUB_DIR = "hubs";
const ruleFiles = RULE_DIRS.flatMap(mdFiles);
const hubFiles = mdFiles(HUB_DIR).filter((f) => !f.endsWith("INDEX.md"));
const priorArtFiles = mdFiles(join(HUB_DIR, "prior-art"));
const wikiFiles = [...ruleFiles, ...hubFiles, ...priorArtFiles];

// ---------- 1. dangling [[links]] ----------
{
  const known = new Set(wikiFiles.map((f) => f.split("/").pop().replace(/\.md$/, "")));
  const bad = [];
  for (const f of wikiFiles) {
    const text = readFileSync(join(ROOT, f), "utf8")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]*`/g, "");
    for (const m of text.matchAll(/\[\[([\w-]+)\]\]/g)) {
      const name = m[1];
      if (!known.has(name) && !ALLOW.danglingLinks.includes(name)) bad.push(`${f} → [[${name}]]`);
    }
  }
  bad.length ? err("links", `dangling wikilinks (add page or allowlist):\n    ${bad.join("\n    ")}`) : ok("links", `all [[links]] resolve across ${wikiFiles.length} pages`);
}

// ---------- 2. dead scopes ----------
{
  const bad = [];
  for (const f of [...ruleFiles, ...hubFiles]) {
    for (const scope of scopesOf(frontmatter(readFileSync(join(ROOT, f), "utf8")))) {
      const re = globToRegex(scope);
      if (!trackedFiles.some((t) => re.test(t))) bad.push(`${f} — scope "${scope}" matches no tracked file`);
    }
  }
  bad.length ? err("scopes", `dead scopes (retarget or delete per CLAUDE.md pruning):\n    ${bad.join("\n    ")}`) : ok("scopes", "every scope glob matches ≥1 tracked file");
}

// ---------- 3. stale hubs ----------
{
  const bad = [];
  for (const f of hubFiles) {
    const fm = frontmatter(readFileSync(join(ROOT, f), "utf8"));
    const scopes = scopesOf(fm);
    if (!fm.updated || !scopes.length) { bad.push(`${f} — missing updated:/scope: frontmatter`); continue; }
    const pathspecs = scopes.map((s) => `":(glob)${s}"`).join(" ");
    let last = "";
    try { last = git(`log -1 --format=%cs -- ${pathspecs}`); } catch { /* no commits */ }
    if (last && last > fm.updated) bad.push(`${f} — updated: ${fm.updated} but scope last touched ${last} (closure forgot the hub line?)`);
  }
  if (hubFiles.length) bad.length ? err("stale-hubs", bad.join("\n    ")) : ok("stale-hubs", `${hubFiles.length} hubs current vs their scopes`);
}

// ---------- 4. INDEX drift ----------
function renderIndex() {
  const rows = hubFiles
    .map((f) => {
      const text = readFileSync(join(ROOT, f), "utf8");
      const fm = frontmatter(text);
      const q = (text.match(/^>\s*\*(.+?)\*/m) || [, "?"])[1];
      return `| [${f.split("/").pop().replace(/\.md$/, "")}](${f.split("/").pop()}) | ${q} | ${fm.updated ?? "?"} |`;
    })
    .sort();
  return [
    "# Hub index",
    "",
    "GENERATED by `node scripts/doclint.mjs --index` — do not edit by hand.",
    "",
    "| hub | answers | updated |",
    "| --- | --- | --- |",
    ...rows,
    "",
    `Prior-art pages: ${priorArtFiles.length} under [prior-art/](prior-art/).`,
    "",
  ].join("\n");
}
if (process.argv.includes("--index")) {
  writeFileSync(join(ROOT, HUB_DIR, "INDEX.md"), renderIndex());
  console.log("DOCLINT wrote hubs/INDEX.md");
  process.exit(0);
}
if (hubFiles.length) {
  const on_disk = existsSync(join(ROOT, HUB_DIR, "INDEX.md")) ? readFileSync(join(ROOT, HUB_DIR, "INDEX.md"), "utf8") : "";
  on_disk === renderIndex() ? ok("index", "hubs/INDEX.md matches regeneration") : err("index", "hubs/INDEX.md drifted — run `node scripts/doclint.mjs --index`");
}

// ---------- 5. pointer integrity (ticket ids + shas cited in hubs) ----------
{
  const bad = [];
  let checked = 0;
  const seedIds = new Set();
  if (existsSync(join(ROOT, ".seeds/issues.jsonl")))
    for (const line of readFileSync(join(ROOT, ".seeds/issues.jsonl"), "utf8").split("\n"))
      if (line.trim()) try { seedIds.add(JSON.parse(line).id); } catch { /* torn line is sd's problem */ }
  for (const f of [...hubFiles, ...priorArtFiles]) {
    const text = readFileSync(join(ROOT, f), "utf8");
    for (const m of text.matchAll(/\b(Archie-[0-9a-f]{4})\b/g)) {
      checked++;
      if (!seedIds.has(m[1])) bad.push(`${f} cites ${m[1]} — not in .seeds/issues.jsonl`);
    }
    for (const m of text.matchAll(/\b(Archie-[0-9a-f]{4})\s*\/\s*([0-9a-f]{7,40})\b/g)) {
      checked++;
      try { git(`cat-file -e ${m[2]}^{commit}`); } catch { bad.push(`${f} cites sha ${m[2]} — unknown to git`); }
    }
  }
  bad.length ? err("pointers", bad.join("\n    ")) : ok("pointers", `${checked} ticket/sha citations verified`);
}

// ---------- 5b. TRACKERS drift ----------
if (existsSync(join(ROOT, "docs/TRACKERS.md"))) {
  const regen = execSync("node scripts/trackers-gen.mjs --stdout", { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  regen === readFileSync(join(ROOT, "docs/TRACKERS.md"), "utf8")
    ? ok("trackers", "docs/TRACKERS.md matches regeneration")
    : err("trackers", "docs/TRACKERS.md drifted — run `node scripts/trackers-gen.mjs`");
}

// ---------- 5c. evidence paths exist ----------
// Territory hubs only: prior-art pages cite file:line inside CORPUS clones
// (e.g. quire's packages/11ty/...), which are not paths in this repo.
{
  const bad = [];
  let checked = 0;
  for (const f of hubFiles) {
    const text = readFileSync(join(ROOT, f), "utf8");
    for (const m of text.matchAll(/`((?:docs|ledgers|apps|packages|scripts|recipes|src-tauri|hubs|\.github|\.claude|\.seeds)\/[A-Za-z0-9_\-./]+?)(?::\d[\d-]*)?`/g)) {
      const p = m[1];
      if (p.includes("*") || p.endsWith("/")) continue;
      checked++;
      if (!existsSync(join(ROOT, p))) bad.push(`${f} → \`${p}\` does not exist`);
    }
  }
  bad.length ? err("evidence-paths", bad.join("\n    ")) : ok("evidence-paths", `${checked} cited paths exist`);
}

// ---------- 6. untracked doc files ----------
{
  const bad = [];
  const status = git("status --porcelain=v1 -uall").split("\n").filter(Boolean);
  for (const line of status) {
    if (!line.startsWith("??")) continue;
    const p = line.slice(3);
    const docish = p.endsWith(".md") && (["docs/", "ledgers/", "hubs/", ".claude/rules/", ".teach/"].some((d) => p.startsWith(d)) || !p.includes("/"));
    if (docish && !ALLOW.untracked.some((a) => p.startsWith(a))) bad.push(p);
  }
  bad.length ? err("untracked-docs", `doc files one git-clean from gone:\n    ${bad.join("\n    ")}`) : ok("untracked-docs", "no unprotected doc files");
}

// ---------- 7. declared mirrors ----------
{
  const bad = [];
  for (const [link, target] of Object.entries(ALLOW.mirrors)) {
    const abs = join(ROOT, link);
    try {
      if (!lstatSync(abs).isSymbolicLink()) bad.push(`${link} is not a symlink (dual maintenance risk)`);
      else if (realpathSync(abs) !== realpathSync(join(ROOT, target))) bad.push(`${link} resolves to ${realpathSync(abs)}, expected ${target}`);
    } catch (e) { bad.push(`${link}: ${e.message}`); }
  }
  bad.length ? err("mirrors", bad.join("\n    ")) : ok("mirrors", `${Object.keys(ALLOW.mirrors).length} declared mirror(s) are symlinks to canon`);
}

// ---------- 8. ledger naming (dated evidence only) ----------
{
  const dated = /^[A-Z][A-Z0-9]*(-[A-Za-z0-9_.]+)*-\d{4}-\d{2}-\d{2}[a-z]?\.md$/;
  const bad = mdFiles("ledgers")
    .map((f) => f.split("/").pop())
    .filter((name) => !dated.test(name) && !ALLOW.standingLedgers.includes(name));
  bad.length
    ? err("ledger-naming", `undated ledgers — migrate per design §2 or allowlist deliberately:\n    ${bad.join("\n    ")}`)
    : ok("ledger-naming", "ledgers/ is dated-only (plus allowlisted standing files)");
}

// ---------- 9. rule accretion (3+ inline corrections ⇒ rewrite) ----------
{
  const bad = [];
  for (const f of ruleFiles) {
    const text = readFileSync(join(ROOT, f), "utf8");
    const n = [...text.matchAll(/\*\*[^*\n]*(Corrected|Updated|Closed|added)\s+2\d{3}-\d{2}-\d{2}/gi)].length;
    if (n >= 3 && !ALLOW.accretionExempt.includes(f.split("/").pop())) bad.push(`${f} — ${n} inline corrections; rewrite it (writing-great-skills pruning: sentence-level no-op hunt, keep evidence)`);
  }
  bad.length ? err("accretion", bad.join("\n    ")) : ok("accretion", "no rule has accreted 3+ corrections");
}

// ---------- 10. scope coverage (every populated top-level dir claimed by a hub) ----------
if (hubFiles.length) {
  const hubScopes = hubFiles.flatMap((f) => scopesOf(frontmatter(readFileSync(join(ROOT, f), "utf8")))).map(globToRegex);
  const topDirs = [...new Set(trackedFiles.filter((f) => f.includes("/")).map((f) => f.split("/")[0]))];
  const bad = topDirs.filter((d) => !ALLOW.coverageIgnore.includes(d) && !trackedFiles.some((t) => t.startsWith(d + "/") && hubScopes.some((re) => re.test(t))));
  bad.length ? err("coverage", `top-level dirs no hub claims (add scope or coverageIgnore):\n    ${bad.join("\n    ")}`) : ok("coverage", `all ${topDirs.length} populated top-level dirs claimed`);
}

// ---------- verdict ----------
if (findings.length) {
  for (const f of findings) console.error(`DOCLINT ERROR ${f.check} — ${f.msg}`);
  console.error(`\nDOCLINT: FAIL (${findings.length} finding${findings.length > 1 ? "s" : ""})`);
  process.exit(1);
}
console.log("\nDOCLINT: PASS");

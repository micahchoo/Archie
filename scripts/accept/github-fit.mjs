// Archie-c74e step 6 — the GitHub-fit verdict, with real numbers.
//
// Two files for the reason `scripts/verify-publish.mjs:22-32` states: the checks import render-core's
// REAL `planPush` / `gitBlobSha`, and plain Node cannot resolve render-core's TS-source workspace
// package (its relative imports use TS's `.js`-for-`.ts` convention, which Node's type-stripping does
// not remap). The real logic runs under `vite-node`, spawned from here.
//
// Usage: node scripts/accept/github-fit.mjs <tree> [<republished tree>]
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const VIEWER_DIR = path.join(REPO, "apps/viewer");

const argv = process.argv.slice(2);
if (argv.length === 0) { console.error("usage: node scripts/accept/github-fit.mjs <tree> [<republished tree>]"); process.exit(2); }
const forward = argv.map((a) => (a.startsWith("--") ? a : path.resolve(process.cwd(), a)));

const req = createRequire(path.join(VIEWER_DIR, "package.json"));
const pkgPath = req.resolve("vite-node/package.json");
const cli = path.join(path.dirname(pkgPath), req(pkgPath).bin["vite-node"]);
const r = spawnSync(process.execPath, [cli, path.join(HERE, "github-fit.mts"), ...forward], { cwd: VIEWER_DIR, stdio: "inherit" });
if (r.error) { console.error("github-fit: failed to launch vite-node —", r.error); process.exit(1); }
process.exit(r.status ?? 1);

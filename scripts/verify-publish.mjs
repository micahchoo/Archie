#!/usr/bin/env node
// Post-publish verification (Archie-fde8): fetch the live/local published tree back and verify it
// actually carries what `publishLibrary` wrote — the enforcement arm of this repo's own doctrine
// that a gate must measure the ARTIFACT, not the exit code (.claude/rules/svelte-no-typecheck-net.md
// general form). "Publish said success" and "the site works" are different claims; this checks the
// second one, against the SERVED bytes, not the code that wrote them.
//
// Usage:
//   node scripts/verify-publish.mjs <baseUrl-or-dir> [--generation <id>]
//
//   <baseUrl-or-dir>  an http(s):// base URL of a hosted published tree (e.g. a GitHub Pages URL),
//                     OR a local directory holding one (e.g. apps/viewer/public/published, or a
//                     temp dir a `publishLibrary()` call wrote to). Both are "the same tree", read
//                     through the read stack's two real byte sources.
//   --generation <id> optional: assert archie.json's `generation` field equals this — the value the
//                     publish step itself reported. Omitted: the generation is printed, not asserted
//                     (nothing to compare it against).
//
// Exit 0 = every check passed. Exit 1 = at least one failed. Per-item tolerant: every check runs and
// is printed regardless of earlier failures — read the full PASS/FAIL list, not just the exit code.
//
// WHY THIS IS TWO FILES. This plain-node entrypoint is the one the gate above documents ("runs under
// plain node"). The actual checks (verify-publish-run.mts) import @render/core's REAL readers
// (readExhibitTree, assertArchieTreeMarker, HttpFilesystem, fsJsonSource) — the design requirement
// is "exercise the same code path the viewer uses", not a hand-rolled re-implementation that could
// silently drift from it. Plain Node can't resolve render-core's TS-source workspace package (its
// relative imports use TS's `.js`-for-`.ts` convention, which Node's own type-stripping does not
// remap) and per scripts/perf/publishrun.mjs's header, render-core's isomorphic-dompurify dep has
// import-time CJS interop effects that need a bundler present to resolve safely. So the real logic
// runs under `vite-node` — already a workspace devDependency (apps/viewer's own
// `scripts/gen-published.mts` boots the identical way to bake the sample-data tree) — spawned from
// here. The user-facing command stays `node scripts/verify-publish.mjs …`.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const VIEWER_DIR = path.join(REPO, "apps/viewer"); // depends on @render/core AND vite-node; same
// directory apps/viewer/scripts/gen-published.mts already runs vite-node from.

const argv = process.argv.slice(2);
const target = argv[0];
if (!target) {
  console.error("usage: node scripts/verify-publish.mjs <baseUrl-or-dir> [--generation <id>]");
  process.exit(2);
}

// Resolve a directory target to an ABSOLUTE path here, in the OUTER process — the inner script runs
// with cwd=VIEWER_DIR (so vite-node resolves @render/core), so a relative path forwarded unresolved
// would silently resolve against the WRONG directory. An http(s) URL passes through untouched.
const isUrl = /^https?:\/\//i.test(target);
const resolvedTarget = isUrl ? target : path.resolve(process.cwd(), target);
const forwardArgs = [resolvedTarget, ...argv.slice(1)];

// Resolve vite-node's CLI via a package that actually depends on it (apps/viewer) — not a hardcoded
// pnpm-store hash path, which is unstable across installs/pnpm versions.
const req = createRequire(path.join(VIEWER_DIR, "package.json"));
const viteNodePkgPath = req.resolve("vite-node/package.json");
const viteNodePkg = req(viteNodePkgPath);
const viteNodeCli = path.join(path.dirname(viteNodePkgPath), viteNodePkg.bin["vite-node"]);

const inner = path.join(HERE, "verify-publish-run.mts");
const result = spawnSync(process.execPath, [viteNodeCli, inner, ...forwardArgs], {
  cwd: VIEWER_DIR,
  stdio: "inherit",
});
if (result.error) {
  console.error("verify-publish: failed to launch vite-node —", result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);

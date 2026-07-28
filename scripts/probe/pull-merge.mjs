// Archie-30ff — "Pull-merge probe: is a published tree a mergeable remote?"
//
// A Node probe, NO UI. Publishes the Voynich seed (the same fixture apps/viewer/scripts/gen-published.mts
// bakes), serves the tree on a plain static HTTP server (no framework, no CORS header — most static
// hosts don't send one, per docs/research/next-level-2026-07-26.md rank 2), constructs
// `new HttpFilesystem(base)` against it, reads the published annotation log back with `readAnnotations`,
// and classifies every logicalId against the LOCAL in-memory log with `classifyLogical`.
//
// Two passes, deliberately:
//   PASS 1 (echo) — local log vs. the tree it was published FROM. Expect every logicalId identical.
//   PASS 2 (mutate) — one local note is edited (a genuine new revision, `appendEdit`) BEFORE
//   reclassifying, so the output must show at least one logicalId as something other than
//   "identical". A probe whose output cannot change is not evidence of anything
//   (.claude/rules/post-review-fixes-are-unreviewed.md — "a probe whose output is identical in the
//   world you fear and the world you expect has zero information content").
//
// Run (needs vite-node's TS loader to transform the .ts imports below — same loader
// apps/viewer/scripts/gen-published.mts uses; scripts/perf/publishbench.ts is the donor for
// importing render-core by RELATIVE path instead of the "@render/core" bare specifier, which only
// resolves from inside a package that declares it as a dependency — this script lives at repo-root
// scripts/probe/, outside every such package, so the bare specifier 404s):
//   apps/viewer/node_modules/.bin/vite-node scripts/probe/pull-merge.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, mkdir, rm, readFile as readFileFs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { extname } from "node:path";

import { MemoryFilesystem } from "../../packages/render-core/src/fs/memory.ts";
import { HttpFilesystem } from "../../packages/render-core/src/fs/http.ts";
import { publishLibrary } from "../../packages/render-core/src/publish/site.ts";
import { collectFiles } from "../../packages/render-core/src/publish/ghpages.ts";
import { readAnnotations } from "../../packages/render-core/src/spine/persist.ts";
import { classifyLogical } from "../../packages/render-core/src/spine/merge.ts";
import { appendEdit, linearHead } from "../../packages/render-core/src/spine/log.ts";
import { asClientId } from "../../packages/render-core/src/wadm/brand.ts";

// The exact fixture apps/viewer/scripts/gen-published.mts bakes by default (no dropped zip).
import { library, getLog } from "../../apps/viewer/fixtures/sample-data.ts";

const SLUG = "voynich";
const EXHIBIT_ID = "ex-voynich";
const HOST = "127.0.0.1";
// Picked after `ss -ltn` on this box (2026-07-27): nothing bound on 4460-4470. Not one of the
// registered viewer/studio dev ports (5173-5174, 4321) or e2e's shared 4326
// (.claude/rules/viewer-e2e-shared-port.md) — this probe boots its own throwaway server and tears
// it down in a `finally`, so the shared-port hazard doesn't apply, but picking outside the known
// ranges avoids colliding with a sibling worktree's dev server too.
const PORT = 4462;
const BASE = `http://${HOST}:${PORT}/`;

const MIME = {
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function say(s) {
  console.log(s);
}

async function main() {
  say("=== Archie-30ff pull-merge probe ===\n");

  // 1. Publish the seed to an in-memory tree (publishLibrary is pure — no browser needed).
  const mem = new MemoryFilesystem();
  const result = await publishLibrary(mem, library, getLog, { baseUrl: BASE });
  say(`publishLibrary: ${library.exhibits.length} exhibits, ${result.brokenLinks?.length ?? 0} broken link(s)`);

  const files = await collectFiles(await mem.root());
  say(`collectFiles: ${Object.keys(files).length} files flattened from the memory tree`);

  // 2. Write the flattened tree to a REAL temp dir on disk, so a plain static server can serve it
  //    exactly as a static host would (GitHub Pages, Netlify, a bucket, ...).
  const dir = await mkdtemp(path.join(tmpdir(), "archie-pull-merge-"));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(dir, relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    if ("text" in content) await writeFile(abs, content.text, "utf8");
    else await writeFile(abs, Buffer.from(content.base64, "base64"));
  }
  say(`wrote tree to disk: ${dir}`);
  say(`  annotations dir on disk: ${path.join(dir, SLUG, "annotations", "history")}`);

  // 3. Serve it — plain node:http, NO Access-Control-Allow-Origin header. This deliberately mimics
  //    "most static hosts don't send ACAO" (the research doc's framing) rather than GH Pages' `*`.
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, BASE).pathname);
      const filePath = path.join(dir, urlPath);
      if (!filePath.startsWith(dir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFileFs(filePath);
      res.writeHead(200, {
        "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
        "content-length": String(data.byteLength),
        // deliberately no access-control-allow-origin — see header comment above.
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolve);
  });
  say(`serving ${dir}\n  on ${BASE} (no ACAO header)\n`);

  try {
    // 4. HttpFilesystem read-back, over real HTTP, exactly as a Studio "paste a URL" flow would do it.
    const httpFs = new HttpFilesystem(BASE);
    const exhibitDir = await (await httpFs.root()).getDirectory(SLUG);
    const annDir = await exhibitDir.getDirectory("annotations");
    const remoteLog = await readAnnotations(annDir);
    say(`HttpFilesystem(${BASE}) -> readAnnotations(${SLUG}/annotations): ${remoteLog.length} record(s)`);

    // Print the subject, not only the verdict (post-review-fixes-are-unreviewed.md, habit 1a): show
    // one raw response's headers so "no CORS header" is a measurement, not an assertion.
    const probeUrl = `${BASE}${SLUG}/annotations/history/index.json`;
    const probeRes = await fetch(probeUrl);
    say(`\nraw response headers for ${probeUrl}:`);
    for (const [k, v] of probeRes.headers.entries()) say(`  ${k}: ${v}`);
    say(`  (access-control-allow-origin present: ${probeRes.headers.has("access-control-allow-origin")})`);

    const localLogOriginal = getLog(EXHIBIT_ID);
    const logicalIds = [...new Set(localLogOriginal.map((r) => r.logicalId))];
    say(`\nlocal log (unmutated): ${localLogOriginal.length} record(s), ${logicalIds.length} distinct logicalId(s)`);

    // 5a. PASS 1 — echo: local vs. the tree it was published from.
    say(`\n=== PASS 1: echo (local log, unmutated) ===`);
    let pass1Counts = {};
    for (const id of logicalIds) {
      const cls = classifyLogical(localLogOriginal, remoteLog, id);
      pass1Counts[cls.kind] = (pass1Counts[cls.kind] ?? 0) + 1;
      say(`  ${id}  ${JSON.stringify(cls)}`);
    }
    say(`  tally: ${JSON.stringify(pass1Counts)}`);

    // 5b. PASS 2 — mutate ONE local note (a real appendEdit, new rev, parent = old head), then
    //     reclassify the SAME set of logicalIds against the SAME remote log.
    const mutateId = logicalIds[0];
    const head = linearHead(localLogOriginal, mutateId);
    const { log: mutatedLog, record } = appendEdit(
      localLogOriginal,
      mutateId,
      { lastEditor: asClientId("probe-agent"), body: { type: "TextualBody", value: "PROBE MUTATION — Archie-30ff pull-merge" } },
      head,
    );
    say(`\n=== PASS 2: local mutation on ${mutateId} ===`);
    say(`  new local rev ${record.rev} (version ${record.version}, parent ${record.parent})`);
    say(`  old local head was ${head.rev} (version ${head.version}) — identical to the remote head, since PASS 1 above classified it "identical"`);
    let pass2Counts = {};
    for (const id of logicalIds) {
      const cls = classifyLogical(mutatedLog, remoteLog, id);
      pass2Counts[cls.kind] = (pass2Counts[cls.kind] ?? 0) + 1;
      const marker = id === mutateId ? "  <-- mutated" : "";
      say(`  ${id}  ${JSON.stringify(cls)}${marker}`);
    }
    say(`  tally: ${JSON.stringify(pass2Counts)}`);

    say(`\nPASS 1 vs PASS 2 tallies differ: ${JSON.stringify(pass1Counts) !== JSON.stringify(pass2Counts)}`);
    if (JSON.stringify(pass1Counts) === JSON.stringify(pass2Counts)) {
      say(`  *** WARNING: tallies identical — the mutation did not change any classification. Probe is not proving anything. ***`);
      process.exitCode = 1;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
    say(`\nserver stopped (port ${PORT} released), temp dir removed`);
  }

  // 6. Live CORS ground-truth: what does a real published-elsewhere tree actually send?
  say(`\n=== live CORS check: https://micahchoo.github.io/test/ ===`);
  try {
    const liveRes = await fetch("https://micahchoo.github.io/test/");
    say(`  status: ${liveRes.status}`);
    for (const [k, v] of liveRes.headers.entries()) say(`  ${k}: ${v}`);
    say(`  access-control-allow-origin present: ${liveRes.headers.has("access-control-allow-origin")}`);
  } catch (e) {
    say(`  fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

await main();

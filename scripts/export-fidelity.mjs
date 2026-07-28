#!/usr/bin/env node
// Archie-027c — export-fidelity gate: drive the REAL publish pipeline in headless Chromium, then
// assert the produced tree / .archie.zip against what went in.
//
// WHY A BROWSER AT ALL. Archie's publish is not portable to Node: the OPFS backend needs
// `navigator.storage`, the DZI slicer and bake pool need `OffscreenCanvas` inside module Workers,
// and both worker paths degrade SILENTLY to a main-thread fallback (perf-measure-the-flow §2), so a
// Node run would measure a pipeline the user never executes. This is freecut's headless principle
// applied to publish rather than render — "the engine depends on browser APIs …, a Node port would
// be a fragile rewrite. Instead, a tiny Node driver launches headless Chrome, loads a UI-less
// harness page … that reuses the exact export pipeline … and captures the output"
// (`Prior Art/freecut/headless/README.md:6-12`; the shape is `render.mjs:69-107` — start a server,
// launch Chrome, `waitForFunction` on the harness handle, then one `page.evaluate` that returns a
// summary while the bytes come out of band). `docs/research/freecut-gaps.md:120-146` names this as
// the Archie mapping ("a CI harness that renders a published exhibit in real Chromium and diffs it
// for fidelity").
//
// WHERE THE ASSERTIONS LIVE. In Node, over bytes that have left the browser. The harness reports
// evidence and streams files; it decides nothing. A check that runs inside the thing it measures can
// be skipped by the same failure that broke the thing.
//
// COMPOSITION, NOT DUPLICATION. `scripts/verify-publish.mjs` (Archie-fde8) already reads a published
// tree back through the REAL render-core readers. This harness produces a tree by driving the real
// browser-side publish and then RUNS that verifier over it (the last check). What is new here is the
// producing half — real OPFS, real workers — plus four invariants a static tree cannot answer:
// write ORDER, in-vs-out annotation counts, in-vs-out image bytes, and tree-vs-zip agreement.
//
// Run:   node scripts/export-fidelity.mjs
//        node scripts/export-fidelity.mjs --keep      (leave the produced tree on disk and print it)
//        node scripts/export-fidelity.mjs --out <dir> (write the tree here instead of a temp dir)
//        HEADED=1 node scripts/export-fidelity.mjs    (watch it)
//
// Exit 0 = every check passed. Exit 1 = at least one failed. Per-item tolerant: every check runs and
// prints PASS/FAIL with a DETAIL field naming its SUBJECT, so a check that examined nothing is
// visible as such (post-review-fixes-are-unreviewed §1a).
//
// PORTS: the vite server binds an OS-assigned free port pinned with `strictPort`, never a fixed or
// auto-incrementing one — two agents running this at once must not drive each other's build
// (viewer-e2e-shared-port). See the note at `server:` for why `listen(0)` is NOT that.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";
import { launchBrowser } from "./lib/driver.mjs";

/** A port the OS says is free right now. Reserved-then-released, so there IS a race window — which
 *  is why the caller pairs it with `strictPort: true`. */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const argv = process.argv.slice(2);
const KEEP = argv.includes("--keep");
const outIdx = argv.indexOf("--out");
const OUT_DIR_ARG = outIdx !== -1 ? path.resolve(process.cwd(), argv[outIdx + 1]) : null;

// ── reporting ────────────────────────────────────────────────────────────────────────────────────
const results = [];
const check = (ok, label, detail) => {
  results.push({ ok, label, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  return ok;
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ── ref sweep (the Archie-19d7 invariant, computed from the ARTIFACT) ─────────────────────────────
// A published manifest may not reference a file the tree lacks. This derives the answer from the
// written bytes rather than trusting a field the publish step returns about itself: the JSON-only
// recovery path writes no bytes, so a result object cannot check its own output.
//
// SCOPE, stated because an implicit one is where these go wrong: only strings that (a) resolve into
// the tree — either absolute under the publish baseUrl, or relative — and (b) end in a known FILE
// extension. A IIIF canvas id like `{base}/ex0/canvas/1` is an identifier, not a file, and is
// correctly not swept. Remote absolute URLs (a live IIIF service) are out of scope by construction.
const FILE_EXT = /\.(jpe?g|png|webp|gif|avif|tiff?|mp3|mp4|m4a|wav|ogg|ogv|webm|json|dzi|xml|html|txt|cff|vtt|svg)$/i;

function collectStrings(node, out) {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const v of node) collectStrings(v, out);
  else if (node && typeof node === "object") for (const v of Object.values(node)) collectStrings(v, out);
}

function resolveRef(str, fromPath, baseUrl) {
  if (!str || /\s/.test(str)) return null;
  const noHash = str.split("#")[0].split("?")[0];
  if (!FILE_EXT.test(noHash)) return null;
  if (noHash.startsWith(baseUrl)) return normalize(noHash.slice(baseUrl.length));
  if (/^[a-z][a-z0-9+.-]*:/i.test(noHash)) return null; // some other scheme/origin — out of scope
  if (noHash.startsWith("/")) return null; // root-absolute: not a tree-relative publish ref
  // A bare filename with no directory is NOT swept. Measured why: `images.json` carries
  // `"title": "plate-a.jpg"` — an object LABEL that happens to be the filename — and sweeping it
  // produced 3 false danglings. A path-shaped relative ref (`assets/x.jpg`, `./x.jpg`) is swept; a
  // genuine same-directory ref written bare is the stated blind spot, and publish does not emit one
  // (root-level refs come through absolute, e.g. `{base}exhibits.json`).
  if (!noHash.includes("/")) return null;
  return normalize(path.posix.join(path.posix.dirname(fromPath), noHash));
}

function normalize(rel) {
  const parts = [];
  for (const seg of rel.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

async function main() {
  const outDir = OUT_DIR_ARG ?? (await mkdtemp(path.join(tmpdir(), "archie-fidelity-")));
  await mkdir(outDir, { recursive: true });

  // ── vite dev server on an EPHEMERAL port ───────────────────────────────────────────────────────
  const req = createRequire(path.join(REPO, "apps/studio/package.json"));
  const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);
  const server = await createServer({
    root: HERE,
    configFile: false,
    logLevel: "warn",
    // The `@render/core` alias applies to BARE specifiers only, i.e. exactly the four studio worker
    // modules (dzi-slicer/dzi-slice-pool/bake/bake-worker). MEASURED here, not assumed: without it
    // every DZI worker died at module-evaluation with `TypeError: Cannot read properties of
    // undefined (reading 'bind')` inside `node_modules/.vite/deps/isomorphic-dompurify.js:1450` —
    // DOMPurify has no `document` in a Worker, so `createDOMPurify()` returns a stub and the
    // package's own `purify.sanitize.bind(purify)` at module scope throws. The pool then fell back
    // to the inline slicer SILENTLY, which is the degradation this harness exists to catch. The
    // shim re-exports the geometry/concurrency modules those four files actually import, so no
    // measured code is substituted (scripts/perf/render-core-shim.ts:9-12).
    //
    // WHAT THIS COSTS, stated: with the alias, "the worker booted" is a claim about the worker's
    // ALGORITHM, not about the real barrel's import graph. `scripts/perf/worker-smoke.mjs` is the
    // gate for the latter (it boots the BUILT worker chunks) and this harness does not replace it.
    resolve: { alias: { "@render/core": path.join(REPO, "scripts/perf/render-core-shim.ts") } },
    // EPHEMERAL PORT. `server.listen(0)` does NOT work — vite treats 0 as absent, falls back to its
    // default 5173 and INCREMENTS on collision (measured: it landed on 5175, i.e. straight into a
    // sibling worktree's range — the exact false-green shape of [[viewer-e2e-shared-port]]). So ask
    // the OS for a free port and pin it: `strictPort` turns a lost race into a loud EADDRINUSE
    // rather than a quiet hop onto someone else's server.
    server: { port: await freePort(), strictPort: true, fs: { allow: [REPO] } },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const url = `http://127.0.0.1:${port}/export-fidelity.html`;
  console.log(`• harness ${url}  (ephemeral port — never a shared fixed one)`);
  console.log(`• tree out ${outDir}`);

  const browser = await launchBrowser({ headless: !process.env.HEADED, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log(`  [pageerror] ${e.stack ?? e.message}`));
  page.on("console", (m) => { if (m.type() === "error") console.log(`  [page:error] ${m.text()}`); });

  // Bytes come out of band, one file at a time, so a tile pyramid never has to fit in one
  // page.evaluate return value.
  const files = new Map(); // tree-relative path -> Buffer
  let zipBuf = null;
  await page.exposeBinding("__emitFile", async (_src, p, b64) => {
    const buf = Buffer.from(b64, "base64");
    if (p === "library.archie.zip") { zipBuf = buf; return; }
    const rel = p.replace(/^tree\//, "");
    files.set(rel, buf);
    const dest = path.join(outDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buf);
  });

  const t0 = Date.now();
  let outcome;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__ARCHIE_FIDELITY__), null, { timeout: 120_000 });
    console.log("• publishing in the browser (real OPFS, real workers)…");
    outcome = await page.evaluate(() => window.__ARCHIE_FIDELITY__.run());
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
  const wallMs = Date.now() - t0;

  if (!outcome?.ok) {
    check(false, "harness · the browser publish completed", String(outcome?.error ?? "no result").slice(0, 400));
    return finish(outDir, wallMs);
  }
  const r = outcome.report;
  console.log(`• published ${files.size} files (${r.elapsedMs} ms in-page), zip ${r.zipBytes} bytes\n`);

  // ── 1. workers ─────────────────────────────────────────────────────────────────────────────────
  const w = r.workers;
  check(
    w.poolAvailable && w.workerCtorCount > 0 && w.bakeFallbacks === 0 && w.fallbackWarnings.length === 0,
    "workers · the DZI + bake worker pools actually ran (no silent fallback)",
    `poolAvailable=${w.poolAvailable} workersConstructed=${w.workerCtorCount} bakeFallbacks=${w.bakeFallbacks} fallbackWarnings=${w.fallbackWarnings.length}${w.fallbackWarnings.length ? ` [${w.fallbackWarnings[0]}]` : ""}`,
  );

  // ── 2. the tiled object really produced a pyramid ──────────────────────────────────────────────
  const tilePaths = [...files.keys()].filter((p) => /_files\/\d+\/\d+_\d+\./.test(p));
  check(
    r.authored.tiledObjects.length > 0 && tilePaths.length > 0,
    "tiling · the oversized object shipped a DZI pyramid",
    `tileObject returned tiles for [${r.authored.tiledObjects.join(", ") || "nothing"}]; ${tilePaths.length} tile files in the tree`,
  );

  // ── 3. marker present, current-schema ──────────────────────────────────────────────────────────
  const markerBuf = files.get("archie.json");
  let marker = null;
  try { marker = markerBuf ? JSON.parse(markerBuf.toString("utf8")) : null; } catch { marker = null; }
  check(
    !!marker && marker.format === "archie-library" && marker.generator === "archie" && typeof marker.version === "number" && typeof marker.generation === "string" && marker.generation.length > 0,
    "marker · archie.json is present and is a current-schema Archie marker (ADR-0020)",
    marker ? `format=${marker.format} version=${marker.version} generator=${marker.generator} generation=${marker.generation}` : "archie.json ABSENT or unparseable",
  );

  // ── 4. marker written LAST ─────────────────────────────────────────────────────────────────────
  const order = r.writeOrder;
  const last = order[order.length - 1];
  const markerAt = order.lastIndexOf("archie.json");
  check(
    order.length > 1 && last === "archie.json" && markerAt === order.length - 1,
    "marker · archie.json is the LAST write to COMMIT — the tree's commit point (ADR-0020)",
    `${order.length} writes committed; last=${last}; archie.json at index ${markerAt}/${order.length - 1}; ${order.length - 1 - markerAt} write(s) after it`,
  );

  // ── 5. no dangling refs (Archie-19d7) ──────────────────────────────────────────────────────────
  const dangling = [];
  let refsChecked = 0;
  const jsonFiles = [...files.keys()].filter((p) => p.endsWith(".json"));
  for (const p of jsonFiles) {
    let doc;
    try { doc = JSON.parse(files.get(p).toString("utf8")); } catch { continue; }
    const strs = [];
    collectStrings(doc, strs);
    for (const s of strs) {
      const rel = resolveRef(s, p, r.baseUrl);
      if (!rel) continue;
      refsChecked++;
      if (!files.has(rel)) dangling.push(`${p} → ${s} (resolved ${rel})`);
    }
  }
  check(
    refsChecked > 0 && dangling.length === 0,
    "refs · every file reference in the published JSON has a file behind it (Archie-19d7)",
    `${refsChecked} file refs resolved across ${jsonFiles.length} JSON files; ${dangling.length} dangling${dangling.length ? `: ${dangling.slice(0, 3).join(" | ")}` : ""}`,
  );

  // ── 6. annotation counts in == out, on BOTH published surfaces ─────────────────────────────────
  // The heads land twice: inlined on each manifest canvas, and as a `{slug}/canvas/{objId}/
  // annotations.json` sidecar. Counting both and requiring all three numbers to agree also catches
  // the two surfaces DRIFTING from each other, which one count could not see.
  const manifestIds = new Set();
  const perManifest = [];
  for (const p of jsonFiles.filter((f) => f.endsWith("/manifest.json"))) {
    const before = manifestIds.size;
    collectAnnotationIds(JSON.parse(files.get(p).toString("utf8")), manifestIds);
    perManifest.push(`${p}=${manifestIds.size - before}`);
  }
  const sidecarIds = new Set();
  const sidecars = jsonFiles.filter((f) => /\/canvas\/[^/]+\/annotations\.json$/.test(f));
  for (const p of sidecars) collectAnnotationIds(JSON.parse(files.get(p).toString("utf8")), sidecarIds);
  const authored = r.authored.annotationHeads;
  check(
    authored > 0 && manifestIds.size === authored && sidecarIds.size === authored,
    "annotations · heads authored == heads published, on the manifest AND the canvas sidecar",
    `authored ${authored} (${r.authored.assets.length} objects x ${r.authored.notesPerObject}); manifests ${manifestIds.size} [${perManifest.join(" ")}]; ${sidecars.length} canvas sidecars ${sidecarIds.size}`,
  );

  // ── 7. image bytes in == out ───────────────────────────────────────────────────────────────────
  const byteRows = [];
  let allBytesMatch = r.authored.assets.length > 0;
  for (const a of r.authored.assets) {
    const rel = `${a.slug}/assets/${a.name}`;
    const got = files.get(rel);
    const ok = !!got && sha256(got) === a.sha256;
    if (!ok) allBytesMatch = false;
    byteRows.push(`${rel}: ${ok ? `identical (${a.bytes}B, ${a.sha256.slice(0, 12)}…)` : got ? `DIFFERS (in ${a.bytes}B/${a.sha256.slice(0, 12)}… vs out ${got.length}B/${sha256(got).slice(0, 12)}…)` : "MISSING from the tree"}`);
  }
  check(allBytesMatch, "bytes · every published master is byte-identical to the asset handed to publish", byteRows.join("; "));

  // ── 8. the .archie.zip carries the same tree ───────────────────────────────────────────────────
  let zipDetail = "zip not emitted";
  let zipOk = false;
  if (zipBuf) {
    const zipPath = path.join(outDir, "library.archie.zip");
    await writeFile(zipPath, zipBuf);
    const fflate = createRequire(path.join(REPO, "packages/render-core/package.json"))("fflate");
    const entries = fflate.unzipSync(new Uint8Array(zipBuf));
    const zipNames = new Set(Object.keys(entries).filter((n) => !n.endsWith("/")));
    const treeNames = new Set(files.keys());
    const onlyTree = [...treeNames].filter((n) => !zipNames.has(n));
    const onlyZip = [...zipNames].filter((n) => !treeNames.has(n));
    const differing = [...treeNames].filter((n) => zipNames.has(n) && sha256(Buffer.from(entries[n])) !== sha256(files.get(n)));
    zipOk = treeNames.size > 0 && onlyTree.length === 0 && onlyZip.length === 0 && differing.length === 0;
    zipDetail = `${zipNames.size} zip entries vs ${treeNames.size} tree files; tree-only ${onlyTree.length}${onlyTree.length ? ` [${onlyTree.slice(0, 3)}]` : ""}; zip-only ${onlyZip.length}${onlyZip.length ? ` [${onlyZip.slice(0, 3)}]` : ""}; byte-differing ${differing.length}${differing.length ? ` [${differing.slice(0, 3)}]` : ""}`;
  }
  check(zipOk, "zip · the .archie.zip export carries the same files, byte-for-byte, as the published tree", zipDetail);

  // ── 9. compose with the existing verifier ──────────────────────────────────────────────────────
  // Archie-fde8's verify-publish.mjs reads the tree back through render-core's REAL readers. Running
  // it here is the point: a tree this harness produced is now checked by the same code the viewer
  // uses, rather than by a second hand-rolled reader that could drift from it.
  const verify = spawnSync(process.execPath, [path.join(HERE, "verify-publish.mjs"), outDir, ...(marker?.generation ? ["--generation", marker.generation] : [])], { encoding: "utf8" });
  const verifyTail = (verify.stdout ?? "").trim().split("\n").filter((l) => /^(PASS|FAIL)/.test(l));
  const verifyFails = verifyTail.filter((l) => l.startsWith("FAIL"));
  check(
    verify.status === 0,
    "compose · scripts/verify-publish.mjs (Archie-fde8, real render-core readers) passes on this tree",
    `exit ${verify.status}; ${verifyTail.length} checks, ${verifyFails.length} failed${verifyFails.length ? `: ${verifyFails.slice(0, 2).join(" | ")}` : ""}`,
  );

  return finish(outDir, wallMs);
}

/** Collect AUTHORED annotation ids from any published JSON. Walks by `type` rather than a fixed key
 *  path, so a layout change shows up as a count change instead of a crash — and skips IIIF PAINTING
 *  annotations, which are the image-on-canvas plumbing (one per canvas), not notes. Measured: without
 *  that filter a 3-object / 9-note library counted 3, not 9. */
function collectAnnotationIds(node, out) {
  if (Array.isArray(node)) { for (const v of node) collectAnnotationIds(v, out); return; }
  if (!node || typeof node !== "object") return;
  const motiv = Array.isArray(node.motivation) ? node.motivation : [node.motivation];
  if (node.type === "Annotation" && node.id && !motiv.includes("painting")) out.add(node.id);
  for (const v of Object.values(node)) collectAnnotationIds(v, out);
}

async function finish(outDir, wallMs) {
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed  (drive ${(wallMs / 1000).toFixed(1)}s — goto→publish→emit, excludes vite boot and browser launch)`);
  if (KEEP || OUT_DIR_ARG) console.log(`tree kept at ${outDir}`);
  else await rm(outDir, { recursive: true, force: true }).catch(() => {});
  console.log(fails.length ? "RESULT: FAIL" : "RESULT: PASS");
  process.exit(fails.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\nexport-fidelity: harness error —", e?.stack ?? e);
  process.exit(1);
});

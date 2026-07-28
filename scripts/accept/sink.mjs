// A REAL folder sink for the browser-side acceptance harness (Archie-c74e).
//
// WHY THIS EXISTS. Every derivative Archie writes — the baked display master, the thumbnail, the DZI
// tiles, the WebP web-tier re-encode — is produced by a browser encoder (`OffscreenCanvas` /
// `convertToBlob`). Node has none. But the artifact this ticket has to measure is a REAL FOLDER on a
// real disk: `scripts/verify-publish.mjs` walks a directory, and 592k files cannot live in OPFS in a
// shape anything else can read. So the pixels are made in Chromium and the bytes land on disk through
// this server.
//
// WHY THAT IS A FAIR PROXY, and not a shortcut. On desktop — the platform Archie-c74e says to run on —
// the shipping folder store is `TauriFilesystem` (`packages/render-core/src/fs/tauri.ts`), which is
// exactly this shape: a browser-side `Filesystem` implementation whose every write crosses an IPC
// boundary to a native process that owns the real fs. This server replaces Tauri's IPC with HTTP over
// loopback. It is therefore structurally the desktop folder sink, with a different transport.
//
// WHAT THAT COSTS, stated so the numbers can be read honestly: HTTP framing per file is not free, and
// the publish wall-clock reported through this sink INCLUDES it. `thousand.mjs` measures the same
// publish into an in-page `MemoryFilesystem` as a paired control, so the transport's share is a
// DIFFERENCE rather than a guess (.claude/rules/perf-measure-the-flow.md).
//
// Protocol (deliberately dumb — every request is one file):
//   PUT  /w/<rel-path>   body = bytes           -> write, creating parents
//   GET  /r/<rel-path>                          -> bytes, or 404
//   HEAD /r/<rel-path>                          -> 200 + content-length, or 404
//   DELETE /w/<rel-path>                        -> remove (recursive), 404-tolerant
//   GET  /ls/<rel-path>                         -> JSON [{name, kind}] of a directory, or 404
//   GET  /stats                                 -> {writes, bytes} since boot
import { createServer } from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/** Start the sink. `root` must exist. Returns { port, stop, stats }. */
export async function startSink(root, port) {
  await fsp.mkdir(root, { recursive: true });
  const stats = { writes: 0, bytes: 0, reads: 0 };
  // Parent directories already created — a Set is one syscall saved per file, and at 592k files the
  // mkdir storm is otherwise a real fraction of the run.
  const made = new Set();

  const resolveRel = (url, prefix) => {
    const rel = decodeURIComponent(url.slice(prefix.length).split("?")[0]);
    const abs = path.join(root, rel);
    // Containment. The paths come from the model (exhibit slugs, asset names) which the seam's own
    // `assertSafeName` treats as untrusted — same trust boundary, so the same refusal here.
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    return abs;
  };

  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,PUT,HEAD,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") { res.writeHead(204, cors).end(); return; }
      const url = req.url ?? "/";

      if (url === "/stats") {
        res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify(stats));
        return;
      }

      if (req.method === "PUT" && url.startsWith("/w/")) {
        const abs = resolveRel(url, "/w/");
        if (!abs) { res.writeHead(403, cors).end(); return; }
        const dir = path.dirname(abs);
        if (!made.has(dir)) { await fsp.mkdir(dir, { recursive: true }); made.add(dir); }
        const chunks = [];
        let n = 0;
        for await (const c of req) { chunks.push(c); n += c.length; }
        await fsp.writeFile(abs, Buffer.concat(chunks, n));
        stats.writes++; stats.bytes += n;
        res.writeHead(204, cors).end();
        return;
      }

      if (req.method === "DELETE" && url.startsWith("/w/")) {
        const abs = resolveRel(url, "/w/");
        if (!abs) { res.writeHead(403, cors).end(); return; }
        await fsp.rm(abs, { recursive: true, force: true });
        res.writeHead(204, cors).end();
        return;
      }

      if (url.startsWith("/ls/")) {
        const abs = resolveRel(url, "/ls/");
        if (!abs) { res.writeHead(403, cors).end(); return; }
        let ents;
        try { ents = await fsp.readdir(abs, { withFileTypes: true }); }
        catch { res.writeHead(404, cors).end(); return; }
        res.writeHead(200, { ...cors, "content-type": "application/json" })
          .end(JSON.stringify(ents.map((e) => ({ name: e.name, kind: e.isDirectory() ? "directory" : "file" }))));
        return;
      }

      if (url.startsWith("/r/")) {
        const abs = resolveRel(url, "/r/");
        if (!abs) { res.writeHead(403, cors).end(); return; }
        let st;
        try { st = await fsp.stat(abs); } catch { res.writeHead(404, cors).end(); return; }
        if (!st.isFile()) { res.writeHead(404, cors).end(); return; }
        if (req.method === "HEAD") {
          res.writeHead(200, { ...cors, "content-length": String(st.size) }).end();
          return;
        }
        stats.reads++;
        res.writeHead(200, { ...cors, "content-length": String(st.size), "content-type": "application/octet-stream" });
        fs.createReadStream(abs).pipe(res);
        return;
      }

      res.writeHead(404, cors).end();
    } catch (e) {
      res.writeHead(500, { ...cors, "content-type": "text/plain" }).end(String(e?.stack ?? e));
    }
  });
  // Loopback only, and a taken port FAILS rather than reusing someone else's server —
  // .claude/rules/viewer-e2e-shared-port.md.
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 130_000;
  server.maxRequestsPerSocket = 0;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    port,
    stats,
    stop: () => new Promise((r) => server.close(() => r())),
  };
}

/** Walk a published tree: file count, total bytes, and a per-extension breakdown. */
export async function walkTree(dir) {
  let files = 0, dirs = 0, bytes = 0;
  const byExt = new Map();
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop();
    let ents;
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { dirs++; stack.push(p); continue; }
      const st = await fsp.stat(p);
      files++; bytes += st.size;
      const ext = path.extname(e.name).toLowerCase() || "(none)";
      const cur = byExt.get(ext) ?? { n: 0, bytes: 0 };
      cur.n++; cur.bytes += st.size;
      byExt.set(ext, cur);
    }
  }
  return { files, dirs, bytes, byExt: Object.fromEntries([...byExt].sort((a, b) => b[1].n - a[1].n)) };
}

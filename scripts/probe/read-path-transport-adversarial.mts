// read-path-transport-adversarial.mts — Probe 1 of the read-path adversarial pair (shared
// contract: local://read-path-adversarial-contract.md). Owns the HTTP/TRANSPORT surface of the
// published-tree read path, driven against a REAL local fault-injection node:http server over the
// committed published tree (apps/viewer/public/published — 7 exhibits, valid archie.json marker).
// Probe 2 (read-path-in-core-adversarial.mts) owns the in-core surface; this probe never touches
// ZipFilesystem / openArchieLibrary / assertSafeSegment directly.
//
// The REAL clients from @render/core — never re-implemented:
//   HttpFilesystem, fsJsonSource, httpJsonSource, readExhibitTree, assertArchieTreeMarker,
//   classifyArchieMarker (via the tree-open path), FailedReadError, NotAnArchieLibraryError.
//
// Run (pnpm --filter exec runs with cwd = apps/viewer, so the script path is relative to it):
//   pnpm --filter @archie/viewer exec vite-node ../../scripts/probe/read-path-transport-adversarial.mts
//
// Exit: 0 when every check passes; 1 when any FAIL line (a FINDING) is reported.
//
// Former expected-finding cases now PASS: the hang case is bounded by the per-read timeout
// (HttpFilesystem's AbortSignal — case 1) and query/fragment-carrying base URLs keep their
// query/fragment as a SUFFIX after the joined path (cases 8a/8b). Any remaining FAIL is a
// genuine finding.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { createChecklist } from "../lib/checklist.mjs";
import {
  HttpFilesystem,
  fsJsonSource,
  httpJsonSource,
  readExhibitTree,
  assertArchieTreeMarker,
  classifyArchieMarker,
  FailedReadError,
  NotAnArchieLibraryError,
  type ExhibitsJson,
} from "../../packages/render-core/src/index.js";

// ---------------------------------------------------------------------------------------------
// Fixture: the committed published tree, loaded into memory once.
// ---------------------------------------------------------------------------------------------

const TREE_DIR = fileURLToPath(new URL("../../apps/viewer/public/published/", import.meta.url));

async function loadTree(dir: string): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  async function walk(rel: string): Promise<void> {
    const entries = await readdir(join(dir, rel), { withFileTypes: true });
    for (const e of entries) {
      const r = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.set(r, new Uint8Array(await readFile(join(dir, r))));
    }
  }
  await walk("");
  return out;
}

// ---------------------------------------------------------------------------------------------
// Fault server — the shared contract shape (local://read-path-adversarial-contract.md), plus the
// two additions this probe's cases need: `slowbody` (dribbled body for fail-fast / mid-transfer
// chaos) and `gen` (per-?g= content for the generation-keying concurrency case).
// ---------------------------------------------------------------------------------------------

type Fault =
  | { kind: "status"; status: number; body?: string | Uint8Array; headers?: Record<string, string> }
  | { kind: "torn"; status?: number; contentLength: number; body: string } // declares more than it sends
  | { kind: "gzip"; status?: number; body: Uint8Array } // served with content-encoding: gzip
  | { kind: "redirect"; to: string; status?: number } // 302 by default
  | { kind: "delay"; ms: number; then: Fault } // slowloris-style: stall, then serve
  | { kind: "hang" } // never respond, never close
  | { kind: "slowbody"; status?: number; headers?: Record<string, string>; total: number; chunk: number; gapMs: number }
  | { kind: "gen"; by: Record<string, string | Uint8Array>; fallback?: string | Uint8Array };

interface RequestRecord {
  pathname: string; // RAW (percent-encoded) pathname as the client sent it
  query: string; // raw search string ("" when none)
  status?: number;
  closeInfo?: { premature: boolean; writableEnded: boolean; bytesFlushed?: number };
}

class FaultServer {
  readonly requests: RequestRecord[] = [];
  private readonly server: Server;
  private readonly faults = new Map<string, Fault>();
  private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  private port = 0;

  constructor(
    private readonly files: Map<string, Uint8Array>,
    faults: Record<string, Fault> = {},
  ) {
    for (const [p, f] of Object.entries(faults)) this.faults.set(p, f);
    this.server = createServer((req, res) => this.handle(req, res));
    this.server.on("clientError", (_err, socket) => socket.destroy());
  }

  start(): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        this.port = (this.server.address() as { port: number }).port;
        resolve(this.base());
      });
    });
  }

  base(): string {
    return `http://127.0.0.1:${this.port}/`;
  }

  /** The bound port — NOT named `port()` because the private field `port` shadows a same-named method. */
  portNumber(): number {
    return this.port;
  }

  setFault(path: string, fault: Fault | null): void {
    if (fault === null) this.faults.delete(path);
    else this.faults.set(path, fault);
  }

  destroyConnections(): void {
    this.server.closeAllConnections();
  }

  async close(): Promise<void> {
    this.stopped = true;
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers.clear();
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  // --- routing: exact path first, then longest prefix, then default (serve the real file) ---

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    const rec: RequestRecord = { pathname: u.pathname, query: u.search };
    this.requests.push(rec);
    res.on("finish", () => {
      rec.status = res.statusCode;
    });
    res.on("close", () => {
      rec.status ??= res.statusCode;
      rec.closeInfo = { premature: !res.writableEnded, writableEnded: res.writableEnded, bytesFlushed: res.socket?.bytesWritten };
    });
    res.on("error", () => {}); // client gone mid-write — nothing to do

    const fault = this.matchFault(u.pathname);
    if (!fault) {
      this.serveFile(u.pathname, res);
      return;
    }
    switch (fault.kind) {
      case "status": {
        res.writeHead(fault.status, fault.headers ?? {});
        const body = fault.body ?? "";
        res.end(typeof body === "string" ? body : Buffer.from(body));
        break;
      }
      case "gzip": {
        res.writeHead(fault.status ?? 200, { "content-encoding": "gzip", "content-length": String(fault.body.length) });
        res.end(Buffer.from(fault.body));
        break;
      }
      case "redirect": {
        res.writeHead(fault.status ?? 302, { location: fault.to });
        res.end();
        break;
      }
      case "torn": {
        res.writeHead(fault.status ?? 200, { "content-length": String(fault.contentLength) });
        res.write(fault.body, () => res.socket?.destroy());
        break;
      }
      case "hang":
        break; // never respond, never close
      case "delay": {
        const t = setTimeout(() => this.handle(req, res), fault.ms);
        this.pendingTimers.add(t);
        break;
      }
      case "slowbody": {
        res.writeHead(fault.status ?? 200, fault.headers ?? {});
        this.dribble(res, fault.total, fault.chunk, fault.gapMs);
        break;
      }
      case "gen": {
        const g = u.searchParams.get("g") ?? "";
        const body = fault.by[g] ?? fault.fallback ?? "{}";
        const buf = Buffer.from(typeof body === "string" ? body : body);
        res.writeHead(200, { "content-length": String(buf.length) });
        res.end(buf);
        break;
      }
    }
  }

  private matchFault(pathname: string): Fault | null {
    const exact = this.faults.get(pathname);
    if (exact) return exact;
    let best: { prefix: string; fault: Fault } | null = null;
    for (const [prefix, fault] of this.faults) {
      if (prefix.endsWith("/") && pathname.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
        best = { prefix, fault };
      }
    }
    return best?.fault ?? null;
  }

  private serveFile(pathname: string, res: ServerResponse): void {
    let key = pathname.slice(1); // raw (percent-encoded) key
    let bytes = this.files.get(key);
    if (!bytes) {
      try {
        key = decodeURIComponent(key);
        bytes = this.files.get(key);
      } catch {
        /* not valid percent-encoding — stay 404 */
      }
    }
    if (!bytes) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("no such file");
      return;
    }
    res.writeHead(200, { "content-length": String(bytes.byteLength) });
    res.end(Buffer.from(bytes));
  }

  private dribble(res: ServerResponse, total: number, chunk: number, gapMs: number): void {
    let sent = 0;
    const buf = Buffer.alloc(chunk, 0x62);
    const tick = (): void => {
      if (this.stopped || res.destroyed || res.writableEnded) return;
      if (sent >= total) {
        res.end();
        return;
      }
      try {
        res.write(buf);
      } catch {
        return;
      }
      sent += chunk;
      const t = setTimeout(tick, gapMs);
      this.pendingTimers.add(t);
    };
    tick();
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Outcome =
  | { kind: "ok"; value: unknown }
  | { kind: "absent"; error: unknown } // null result (getOptional) OR the seam's `no such file:` error
  | { kind: "failed"; status?: number; message: string; error: unknown };

/** Classify a read the way the absent-vs-failed contract does: null → absent, FailedReadError
 *  (or the seam's `no such file:` error) → absent/failed, anything else → failed. */
async function classifyRead(p: Promise<unknown>): Promise<Outcome> {
  try {
    const value = await p;
    if (value === null) return { kind: "absent", error: null };
    return { kind: "ok", value };
  } catch (e) {
    if (e instanceof Error && /no such (file|directory)/i.test(e.message)) return { kind: "absent", error: e };
    if (e instanceof FailedReadError) return { kind: "failed", status: e.status, message: e.message, error: e };
    return { kind: "failed", message: e instanceof Error ? e.message : String(e), error: e };
  }
}

function isCapError(e: unknown): boolean {
  return e instanceof FailedReadError && /exceeds the .*-byte cap/.test(e.message);
}

/** Runtime-narrowed access to a parsed ExhibitsJson (the successful-read cases validate the shape). */
function isExhibitsJson(v: unknown): v is ExhibitsJson {
  return typeof v === "object" && v !== null && "exhibits" in v && Array.isArray(v.exhibits);
}

/** Runtime-narrowed read of a parsed `{"which": …}` payload (the generation-keying case). */
function whichOf(v: unknown): string | undefined {
  return typeof v === "object" && v !== null && "which" in v && typeof v.which === "string" ? v.which : undefined;
}

function outcomeDetail(r: Outcome): string {
  return r.kind === "failed" ? ` (${r.message})` : r.kind === "absent" ? " (absent)" : " (ok)";
}

/** Silence console.warn around lenient marker-gate calls (their transient-fault warning is expected). */
async function quietWarn<T>(fn: () => Promise<T>): Promise<T> {
  const w = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = w;
  }
}

const MARKER_STRICT = { requirePresent: true } as const;

// ---------------------------------------------------------------------------------------------
// The probe
// ---------------------------------------------------------------------------------------------

const checks = createChecklist();

const tree = await loadTree(TREE_DIR);
const realExhibitsBytes = tree.get("exhibits.json");
if (!realExhibitsBytes) throw new Error("fixture missing exhibits.json — tree not loaded");
const parsedExhibits: unknown = JSON.parse(new TextDecoder().decode(realExhibitsBytes));
if (!isExhibitsJson(parsedExhibits) || parsedExhibits.exhibits.length !== 7) {
  throw new Error("fixture exhibits.json is not the expected 7-exhibit tree");
}

const server = new FaultServer(tree);
await server.start();
const base = server.base();
const src = httpJsonSource(base);
const capSrc = httpJsonSource(base, { maxBytes: 64 * 1024 });

try {
  // ---- Case 1: hung server (respond nothing, never close) -----------------------------------
  {
    server.setFault("/exhibits.json", { kind: "hang" });
    // The read path owns a per-read deadline (HttpFilesystem's AbortSignal.timeout): a hung server
    // must classify FAILED (FailedReadError), never hang the viewer forever. Inject a 2s timeout
    // (the production default is 30s) so the probe stays fast while exercising the real path.
    const hangSrc = fsJsonSource(new HttpFilesystem(base, { timeoutMs: 2000 }));
    const r = await classifyRead(hangSrc.getOptional("exhibits.json"));
    server.setFault("/exhibits.json", null);
    checks.check(
      r.kind === "failed" && r.error instanceof FailedReadError,
      "1 hung server (respond nothing, never close)",
      `bounded by the per-read timeout (2s injected; default 30s) — the read settled as ${r.kind}${outcomeDetail(r)}; the timeout abort classifies FAILED, never absent, never a hang`,
    );
  }

  // ---- Case 2: redirects ---------------------------------------------------------------------
  {
    server.setFault("/redir-a", { kind: "redirect", to: "/exhibits.json" });
    const r = await classifyRead(src.getOptional("redir-a"));
    server.setFault("/redir-a", null);
    const r2aDetail = r.kind === "ok" && isExhibitsJson(r.value) ? `, ${r.value.exhibits.length} exhibits` : outcomeDetail(r);
    checks.check(
      r.kind === "ok" && isExhibitsJson(r.value) && r.value.exhibits.length === 7,
      "2a redirect on-base (302 → /exhibits.json)",
      `fetch follows the redirect and the read succeeds — ${r.kind}${r2aDetail}`,
    );

    server.setFault("/redir-off", { kind: "redirect", to: "http://127.0.0.1:1/x" });
    const r2 = await classifyRead(src.getOptional("redir-off"));
    server.setFault("/redir-off", null);
    checks.check(
      r2.kind === "failed" && r2.error instanceof FailedReadError,
      "2b redirect off-host (302 → 127.0.0.1:1)",
      `fetch follows off-host and the connect fails → ${r2.kind}${outcomeDetail(r2)} — a network fault classifies FAILED, never absent`,
    );

    server.setFault("/loop-a", { kind: "redirect", to: "/loop-b" });
    server.setFault("/loop-b", { kind: "redirect", to: "/loop-a" });
    const r3 = await classifyRead(src.getOptional("loop-a"));
    server.setFault("/loop-a", null);
    server.setFault("/loop-b", null);
    checks.check(
      r3.kind === "failed" && r3.error instanceof FailedReadError,
      "2c redirect loop",
      `fetch hits its redirect limit and throws → ${r3.kind}${outcomeDetail(r3)} — classified FAILED, never absent`,
    );
  }

  // ---- Case 3: non-404/500 statuses -----------------------------------------------------------
  {
    for (const status of [401, 403, 429, 502, 418]) {
      server.setFault(`/status-${status}`, { kind: "status", status, body: "rejected" });
      const r = await classifyRead(src.getOptional(`status-${status}`));
      server.setFault(`/status-${status}`, null);
      checks.check(
        r.kind === "failed" && r.error instanceof FailedReadError && r.status === status,
        `3 status ${status}`,
        `expected FailedReadError carrying status ${status} — got ${r.kind}${r.kind === "failed" ? ` (status=${r.status ?? "unset"})` : outcomeDetail(r)}`,
      );
    }

    // 3xx with a body but NO Location header: empirically undici RETURNS the 3xx response (per the
    // fetch spec, a redirect without Location is not a redirect); HttpFilesystem's !ok branch then
    // classifies it — the outcome still satisfies the contract (FAILED, never absent).
    server.setFault("/redir-noloc", { kind: "status", status: 302, body: "redirecting (no location)" });
    const r = await classifyRead(src.getOptional("redir-noloc"));
    server.setFault("/redir-noloc", null);
    checks.check(
      r.kind === "failed" && r.error instanceof FailedReadError && r.status === 302,
      "3f 3xx with body, no Location",
      `undici returns the 3xx (no Location → not a redirect); the !ok branch classifies → ${r.kind} (status=${r.status ?? "unset"}) — FAILED, never absent`,
    );
  }

  // ---- Case 4: gzip content-encoding ----------------------------------------------------------
  {
    server.setFault("/exhibits.json", { kind: "gzip", body: gzipSync(Buffer.from(realExhibitsBytes)) });
    const r = await classifyRead(src.getOptional("exhibits.json"));
    server.setFault("/exhibits.json", null);
    const r4aDetail = r.kind === "ok" && isExhibitsJson(r.value) ? `, ${r.value.exhibits.length} exhibits parsed` : outcomeDetail(r);
    checks.check(
      r.kind === "ok" && isExhibitsJson(r.value) && r.value.exhibits.length === 7,
      "4a gzip content-encoding over a real file",
      `fetch auto-decompresses — read ${r.kind}${r4aDetail}`,
    );

    // Gzip bomb: ~4 KiB compressed → 4 MiB decompressed, cap 64 KiB. The declared (compressed)
    // length passes the pre-read cap; the POST-read cap must catch the DECOMPRESSED length.
    const bomb = gzipSync(Buffer.alloc(4 * 1024 * 1024, 0x61));
    server.setFault("/bomb.json", { kind: "gzip", body: bomb });
    const r2 = await classifyRead(capSrc.getOptional("bomb.json"));
    server.setFault("/bomb.json", null);
    checks.check(
      r2.kind === "failed" && isCapError(r2.error),
      "4b gzip bomb (tiny compressed, huge decompressed, small maxBytes)",
      `compressed ${bomb.length} B, decompressed 4 MiB, cap 64 KiB → ${r2.kind}${outcomeDetail(r2)} — the post-read cap catches the DECOMPRESSED length`,
    );
  }

  // ---- Case 5: non-UTF8 bytes served as exhibits.json ------------------------------------------
  {
    server.setFault("/exhibits.json", { kind: "status", status: 200, body: new Uint8Array([0xff, 0xfe, 0x00, 0x41, 0x42]) });
    const r = await classifyRead(src.getOptional("exhibits.json"));
    server.setFault("/exhibits.json", null);
    checks.check(
      r.kind === "failed" && r.error instanceof FailedReadError,
      "5 non-UTF8 bytes (0xFF 0xFE) as exhibits.json",
      `TextDecoder (non-fatal) → U+FFFD → JSON.parse fails → ${r.kind}${outcomeDetail(r)} — present-but-torn classifies FAILED, never absent`,
    );
  }

  // ---- Case 6: empty 200 body for exhibits.json ------------------------------------------------
  {
    server.setFault("/exhibits.json", { kind: "status", status: 200, body: "" });
    const r = await classifyRead(src.getOptional("exhibits.json"));
    server.setFault("/exhibits.json", null);
    checks.check(
      r.kind === "failed" && r.error instanceof FailedReadError,
      "6 empty 200 body for exhibits.json",
      `0 bytes → JSON.parse('') fails → ${r.kind}${outcomeDetail(r)} — an empty body is NOT absence (never null)`,
    );
  }

  // ---- Case 7: non-numeric / missing content-length ----------------------------------------------
  {
    server.setFault("/exhibits.json", { kind: "status", status: 200, body: "hello world", headers: { "content-length": "banana" } });
    const r = await classifyRead(src.getOptional("exhibits.json"));
    server.setFault("/exhibits.json", null);
    checks.check(
      r.kind === "failed" && r.error instanceof FailedReadError,
      "7a non-numeric content-length (banana)",
      `undici discards the body on an invalid content-length (observed 0 bytes) → ${r.kind}${outcomeDetail(r)} — bounded at the TRANSPORT, below HttpFilesystem; the pre-read cap is skipped and the post-read cap never sees bytes`,
    );

    // Missing content-length (chunked) + a body over the cap: pre-read skipped, POST-read must catch it.
    server.setFault("/exhibits.json", { kind: "status", status: 200, body: Buffer.alloc(4 * 1024 * 1024, 0x63) });
    const r2 = await classifyRead(capSrc.getOptional("exhibits.json"));
    server.setFault("/exhibits.json", null);
    checks.check(
      r2.kind === "failed" && isCapError(r2.error),
      "7b no content-length, body over cap",
      `chunked 4 MiB with cap 64 KiB → ${r2.kind}${outcomeDetail(r2)} — the post-read cap bounds the body when the header is absent`,
    );
  }

  // ---- Case 8: base URL carrying a query or fragment ----------------------------------------------
  {
    const baseQ = `http://127.0.0.1:${server.portNumber()}/?g=gen`;
    const r = await classifyRead(httpJsonSource(baseQ).getOptional("exhibits.json"));
    const wire = server.requests.at(-1);
    checks.check(
      r.kind === "ok" &&
        isExhibitsJson(r.value) &&
        r.value.exhibits.length === 7 &&
        wire?.pathname === "/exhibits.json" &&
        wire?.query === "?g=gen",
      "8a base URL carrying a query (?g= generation keying)",
      `segments join into the PATH after the query — wire request was pathname '${wire?.pathname}' query '${wire?.query}' and the read succeeded (${r.kind === "ok" && isExhibitsJson(r.value) ? `${r.value.exhibits.length} exhibits` : outcomeDetail(r)})`,
    );

    const r2 = await classifyRead(httpJsonSource(`http://127.0.0.1:${server.portNumber()}/#frag`).getOptional("exhibits.json"));
    const wire2 = server.requests.at(-1);
    checks.check(
      r2.kind === "ok" &&
        isExhibitsJson(r2.value) &&
        r2.value.exhibits.length === 7 &&
        wire2?.pathname === "/exhibits.json" &&
        wire2?.query === "",
      "8b hostile base with #fragment",
      `the fragment stays a suffix (stripped by fetch) — wire request was pathname '${wire2?.pathname}' query '${wire2?.query}' and the read succeeded (${r2.kind === "ok" && isExhibitsJson(r2.value) ? `${r2.value.exhibits.length} exhibits` : outcomeDetail(r2)})`,
    );
  }

  // ---- Case 9: hostile literal segments via getFile ----------------------------------------------
  {
    const fs = new HttpFilesystem(base);
    const root = await fs.root();
    const hostile: Array<[string, string]> = [
      ["%2e%2e", "/%252e%252e"],
      ["http:evil", "/http%3Aevil"],
      ["?x", "/%3Fx"],
      ["#y", "/%23y"],
    ];
    for (const [name, expectedWire] of hostile) {
      const file = await root.getFile(name);
      const r = await classifyRead(file.readable());
      const wire = server.requests.at(-1);
      checks.check(
        r.kind === "absent" && wire?.pathname === expectedWire,
        `9 getFile(${JSON.stringify(name)}) stays literal`,
        `assertSafeName passes it (no / \\ NUL), encodeURIComponent makes it literal on the wire — request was '${wire?.pathname}' (expected '${expectedWire}'), read classified ${r.kind} — never escaped the base`,
      );
    }
  }

  // ---- Case 10: 404 body never read --------------------------------------------------------------
  {
    server.setFault("/exhibits.json", { kind: "slowbody", status: 404, total: 8 * 1024 * 1024, chunk: 64 * 1024, gapMs: 50 });
    const t0 = Date.now();
    const r = await classifyRead(src.getOptional("exhibits.json"));
    const elapsed = Date.now() - t0;
    server.setFault("/exhibits.json", null);
    checks.check(
      r.kind === "absent" && elapsed < 2000,
      "10 404 with an 8 MiB dribbled body (fail-fast on status)",
      `read returned ${r.kind} in ${elapsed}ms while a full body takes ~6.4s to deliver — the client throws at the status line and never consumes the 404 body`,
    );
  }

  // ---- Case 11: concurrency ----------------------------------------------------------------------
  {
    const opens = await Promise.all(
      Array.from({ length: 16 }, async () => {
        const s = httpJsonSource(base);
        const marker = await assertArchieTreeMarker(s);
        const ex = await readExhibitTree(s, "sampler");
        return { marker, ex };
      }),
    );
    checks.check(
      opens.length === 16 && opens.every((o) => o.ex.slug === "sampler" && o.ex.title === "Showroom Sampler" && o.ex.objects.length >= 1) && opens.every((o) => o.marker?.generation === "1n8551j"),
      "11a 16 parallel opens of the same tree",
      `all 16 opens succeeded (slug, title, ${opens[0]?.ex.objects.length ?? "?"} objects, marker generation ${opens[0]?.marker?.generation ?? "missing"}) — independent, no shared state`,
    );

    const reads = await Promise.all(Array.from({ length: 16 }, () => classifyRead(src.getOptional("voynich/manifest.json"))));
    const first = reads[0]?.kind === "ok" ? JSON.stringify(reads[0].value) : null;
    checks.check(
      reads.length === 16 && reads.every((r) => r.kind === "ok" && JSON.stringify(r.value) === first) && first !== null,
      "11b 16 parallel reads of the same file",
      `all 16 reads of voynich/manifest.json succeeded with byte-identical content (${first?.length ?? 0} chars)`,
    );

    // Generation keying at the fetch boundary — mirrors the viewer's genFetch/applyGen
    // (apps/viewer/src/published.ts): the ?g= cache key is appended AFTER the path, per fetch,
    // never baked into the base.
    const genFetch = (g: string): typeof fetch => (input, init) => {
      const url = String(input);
      return fetch(url.includes("?") || url.includes("archie.json") ? input : `${url}?g=${encodeURIComponent(g)}`, init);
    };
    const srcA = fsJsonSource(new HttpFilesystem(base, { fetch: genFetch("genA") }));
    const srcB = fsJsonSource(new HttpFilesystem(base, { fetch: genFetch("genB") }));
    server.setFault("/probe-gen.json", {
      kind: "gen",
      by: { genA: JSON.stringify({ which: "genA" }), genB: JSON.stringify({ which: "genB" }) },
      fallback: JSON.stringify({ which: "none" }),
    });
    const [a, b] = await Promise.all([classifyRead(srcA.getOptional("probe-gen.json")), classifyRead(srcB.getOptional("probe-gen.json"))]);
    const genRequests = server.requests.filter((r) => r.pathname === "/probe-gen.json").map((r) => r.query);
    server.setFault("/probe-gen.json", null);
    const whichA = whichOf(a.kind === "ok" ? a.value : undefined);
    const whichB = whichOf(b.kind === "ok" ? b.value : undefined);
    checks.check(
      a.kind === "ok" && whichA === "genA" && b.kind === "ok" && whichB === "genB",
      "11c concurrent generation-keyed reads (?g=genA vs ?g=genB)",
      `each client got its OWN generation's bytes (A=${String(whichA)}, B=${String(whichB)}); server saw queries ${JSON.stringify(genRequests)} — no cross-contamination`,
    );
  }

  // ---- Case 12: chaos — destroy the server mid-transfer ------------------------------------------
  {
    server.setFault("/big.bin", { kind: "slowbody", status: 200, total: 8 * 1024 * 1024, chunk: 64 * 1024, gapMs: 10 });
    const p = src.getOptional("big.bin").then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await sleep(150); // well inside the ~1.3s delivery window — the read is mid-transfer
    server.destroyConnections();
    const rr = await p;
    server.setFault("/big.bin", null);
    checks.check(
      !rr.ok && rr.e instanceof FailedReadError && !(rr.e instanceof Error && /no such file/i.test(rr.e.message)),
      "12a server destroyed mid-transfer (connection reset)",
      `read ${rr.ok ? "SUCCEEDED" : "failed"}${rr.ok ? "" : ` with ${(rr.e as Error).constructor.name}: ${(rr.e as Error).message}`} — a killed transfer classifies FAILED, never absent, never partial`,
    );

    server.setFault("/exhibits.json", { kind: "torn", contentLength: 10000, body: "short" });
    const r = await classifyRead(src.getOptional("exhibits.json"));
    server.setFault("/exhibits.json", null);
    checks.check(
      r.kind === "failed" && r.error instanceof FailedReadError,
      "12b torn body (declared 10000 bytes, sent 5)",
      `socket closed mid-body → ${r.kind}${outcomeDetail(r)} — a torn transfer classifies FAILED, never absent`,
    );
  }

  // ---- Case 13: marker gate over HTTP -------------------------------------------------------------
  {
    server.setFault("/archie.json", { kind: "status", status: 500, body: "boom" });
    let strictErr: unknown = null;
    try {
      await assertArchieTreeMarker(src, MARKER_STRICT);
    } catch (e) {
      strictErr = e;
    }
    checks.check(
      strictErr instanceof NotAnArchieLibraryError && /could not be read/.test(strictErr.message),
      "13a marker read fault (500) under requirePresent strict",
      `refusal — ${strictErr instanceof NotAnArchieLibraryError ? strictErr.message.slice(0, 60) + "…" : String(strictErr)}`,
    );

    const lenient = await quietWarn(() => assertArchieTreeMarker(src));
    server.setFault("/archie.json", null);
    checks.check(
      lenient === null,
      "13b marker read fault (500) lenient default",
      `lenient mode skips the version gate on a transient read fault → ${String(lenient)}`,
    );

    server.setFault("/archie.json", { kind: "status", status: 200, body: '{"format": "archie-library", "vers' });
    let tornStrict: unknown = null;
    try {
      await assertArchieTreeMarker(src, MARKER_STRICT);
    } catch (e) {
      tornStrict = e;
    }
    const tornLenient = await quietWarn(() => assertArchieTreeMarker(src));
    server.setFault("/archie.json", null);
    checks.check(
      tornStrict instanceof NotAnArchieLibraryError,
      "13c 200-but-torn marker JSON, requirePresent strict",
      `torn marker JSON → getOptional throws FailedReadError → strict refuses: ${tornStrict instanceof NotAnArchieLibraryError ? tornStrict.message.slice(0, 60) + "…" : String(tornStrict)}`,
    );
    checks.check(
      tornLenient === null,
      "13c' 200-but-torn marker JSON, lenient default",
      `lenient skips the gate on the read fault → ${String(tornLenient)}`,
    );

    server.setFault("/archie.json", { kind: "status", status: 404, body: "nope" });
    const absentL = await assertArchieTreeMarker(src);
    let absentStrict: unknown = null;
    try {
      await assertArchieTreeMarker(src, MARKER_STRICT);
    } catch (e) {
      absentStrict = e;
    }
    server.setFault("/archie.json", null);
    checks.check(
      absentL === null,
      "13d absent marker, lenient default",
      `a genuine 404 marker stays ABSENT → gate returns ${String(absentL)} (pre-marker trees still open)`,
    );
    checks.check(
      absentStrict instanceof NotAnArchieLibraryError && /no archie\.json marker/.test(absentStrict.message),
      "13d' absent marker, requirePresent strict",
      `strict refuses — ${absentStrict instanceof NotAnArchieLibraryError ? absentStrict.message.slice(0, 60) + "…" : String(absentStrict)}`,
    );

    const realMarker = await assertArchieTreeMarker(src);
    const realStrict = await assertArchieTreeMarker(src, MARKER_STRICT);
    checks.check(
      realMarker?.generation === "1n8551j" && realStrict?.generation === "1n8551j" && classifyArchieMarker(realMarker).kind === "current",
      "13e real marker, both modes",
      `the committed marker (generation ${realMarker?.generation}) passes lenient AND strict; classifyArchieMarker → ${classifyArchieMarker(realMarker).kind}`,
    );

    server.setFault("/archie.json", { kind: "status", status: 200, body: JSON.stringify({ format: "not-archie", version: 1 }) });
    let foreignL: unknown = null;
    let foreignS: unknown = null;
    try {
      await assertArchieTreeMarker(src);
    } catch (e) {
      foreignL = e;
    }
    try {
      await assertArchieTreeMarker(src, MARKER_STRICT);
    } catch (e) {
      foreignS = e;
    }
    server.setFault("/archie.json", null);
    checks.check(
      foreignL instanceof NotAnArchieLibraryError && foreignS instanceof NotAnArchieLibraryError,
      "13f foreign marker, both modes",
      `a PRESENT foreign marker is refused even lenient (absent is lenient, foreign is not) — ${foreignL instanceof NotAnArchieLibraryError ? foreignL.message.slice(0, 40) + "…" : String(foreignL)}`,
    );

    server.setFault("/archie.json", { kind: "status", status: 200, body: JSON.stringify({ format: "archie-library" }) });
    let malformedL: unknown = null;
    try {
      await assertArchieTreeMarker(src);
    } catch (e) {
      malformedL = e;
    }
    server.setFault("/archie.json", null);
    checks.check(
      malformedL instanceof NotAnArchieLibraryError,
      "13g malformed marker (missing version), lenient",
      `a PRESENT malformed marker is refused even lenient — ${malformedL instanceof NotAnArchieLibraryError ? malformedL.message.slice(0, 40) + "…" : String(malformedL)}`,
    );
  }

  // ---- Case 14: wrong-shape valid JSON ------------------------------------------------------------
  {
    server.setFault("/exhibits.json", { kind: "status", status: 200, body: "[]" });
    const v = await src.get<unknown>("exhibits.json");
    server.setFault("/exhibits.json", null);
    let consumed: unknown = null;
    try {
      // Mirrors loadGallery/mergeGalleries (apps/viewer/src/published.ts): the consumer reads
      // `.exhibits` off the parsed JSON with NO schema validation — the point is that a wrong
      // shape must throw HERE (`hosted.exhibits.filter` on undefined), never render an empty hall.
      const asExhibits = v as { exhibits?: unknown[] };
      asExhibits.exhibits.map(() => 0);
    } catch (e) {
      consumed = e;
    }
    checks.check(
      consumed instanceof TypeError,
      "14a exhibits.json = []",
      `the JSON source is shape-blind (parses to an array), but consuming it as ExhibitsJson throws ${consumed instanceof Error ? consumed.constructor.name : String(consumed)} — loud failure, never silent-empty`,
    );

    server.setFault("/exhibits.json", { kind: "status", status: 200, body: '"string"' });
    const v2 = await src.get<unknown>("exhibits.json");
    server.setFault("/exhibits.json", null);
    let consumed2: unknown = null;
    try {
      // Same unvalidated consumer access as 14a — must throw, never be silent-empty.
      const asExhibits2 = v2 as { exhibits?: unknown[] };
      asExhibits2.exhibits.map(() => 0);
    } catch (e) {
      consumed2 = e;
    }
    checks.check(
      consumed2 instanceof TypeError,
      "14b exhibits.json = \"string\"",
      `parses to a JSON string; consuming it as ExhibitsJson throws ${consumed2 instanceof Error ? consumed2.constructor.name : String(consumed2)} — loud, never silent-empty`,
    );

    for (const [label, body] of [
      ["{\"foo\":1}", '{"foo":1}'],
      ["a JSON string", '"string"'],
    ] as const) {
      server.setFault("/sampler/manifest.json", { kind: "status", status: 200, body });
      let exErr: unknown = null;
      try {
        await readExhibitTree(src, "sampler");
      } catch (e) {
        exErr = e;
      }
      server.setFault("/sampler/manifest.json", null);
      checks.check(
        exErr instanceof TypeError && !(exErr instanceof FailedReadError),
        `14c/d manifest.json = ${label} via readExhibitTree`,
        `readExhibitTree throws ${exErr instanceof Error ? `${exErr.constructor.name}: ${exErr.message.slice(0, 60)}` : String(exErr)} — a wrong-shape manifest is loud, never a silent-empty exhibit`,
      );
    }
  }

  // ---- Case 15: fsJsonSource.get (non-optional) on torn JSON ---------------------------------------
  {
    server.setFault("/torn.json", { kind: "status", status: 200, body: '{"a": ' });
    let getErr: unknown = null;
    try {
      await src.get("torn.json");
    } catch (e) {
      getErr = e;
    }
    checks.check(
      getErr instanceof SyntaxError && !(getErr instanceof FailedReadError),
      "15a get() (non-optional) on torn JSON",
      `documented: the raw SyntaxError propagates UNCLASSIFIED from get() (existing tests only cover getOptional) — callers like readExhibitTree's manifest read surface it raw; the absent-vs-failed contract lives on getOptional`,
    );

    const r = await classifyRead(src.getOptional("torn.json"));
    server.setFault("/torn.json", null);
    checks.check(
      r.kind === "failed" && r.error instanceof FailedReadError,
      "15b getOptional() on the same torn JSON",
      `the optional surface classifies the identical bytes → ${r.kind}${outcomeDetail(r)} — the two surfaces are asymmetric by design`,
    );
  }

  // ---- Close + findings ----------------------------------------------------------------------------
} finally {
  await server.close();
}

const failed = checks.results.filter((r) => !r.pass);
if (failed.length > 0) {
  console.log("\nFINDINGS (real defects, with the case that proved each):");
  for (const f of failed) console.log(`  FAIL  ${f.label} — ${f.detail}`);
  console.log("  Observations (documented, not defects):");
  console.log("    - fsJsonSource.get() propagates a raw SyntaxError on torn JSON (case 15a); the");
  console.log("      absent-vs-failed contract is the getOptional surface.");
  console.log("    - undici discards the response body on an invalid content-length header (case 7a),");
  console.log("      so the cap enforcement is at the transport there, not HttpFilesystem's post-check.");
}

await checks.finish();

// HttpFilesystem — the READ-ONLY HTTP(S) backend behind the Filesystem seam: the fourth backend
// beside FSA/OPFS (browser handles), Tauri (native paths), and Zip (in-memory archive). It lets
// the read stack consume a PUBLISHED TREE served by any plain static host (`${base}exhibits.json`,
// `${base}${slug}/manifest.json`, ...) — fully static and local-first: no server component, just
// `fetch` over a directory of files. Donor for the fetch discipline: the embed's `httpJsonSource`
// (packages/archie-viewer/src/load.ts) and `fetchArchieLibraryBytes` (../publish/open.ts).
//
// The guarantees the browser backends get for free are re-established here (the tauri-fs-seam
// discipline, read-side):
//   • Name containment — every caller-supplied segment is `assertSafeName`-checked AND
//     percent-encoded before it is joined onto the base URL, so a hostile slug (`..`, `a/b`,
//     `..%2f`) cannot escape the base path (fs/names.ts, shared with the Tauri backend).
//   • Absent vs failed (render-core-data-integrity contract #2) — a 404 throws the seam's
//     canonical `no such file:` error, which `fsJsonSource.getOptional` (../publish/read.ts)
//     reads as ABSENT (`null`); a network fault, a non-OK non-404 status, a torn body, or a cap
//     breach throws `FailedReadError` — FAILED, never silently collapsed into "no data".
//   • Capped reads — every response is bounded by the canonical `SRC_MAX_BYTES` (the layer-zero
//     ../limits.ts definition, never redeclared), checked cheaply against a declared `content-length`
//     BEFORE the body is read and again against the actual byte length after, so a missing or
//     lying header can't bypass the cap (same double-check as `fetchArchieLibraryBytes`).
//
// Deliberate divergences from the writable backends (pinned by the read-only conformance subset):
//   • READ-ONLY: every mutating operation (`writable`, `remove`, any `{ create: true }`) throws
//     `ReadOnlyFilesystemError`.
//   • LAZY existence: plain HTTP has no cheap existence probe (HEAD is 405 on some static hosts
//     and would double every read's latency), so `getFile`/`getDirectory` hand back handles
//     without a round-trip; absence surfaces when the bytes are actually read. Prior art:
//     `httpJsonSource` performs exactly one GET per read.
//   • NO `entries()`: plain HTTP has no directory listing, so enumerating throws rather than
//     yielding nothing — an empty answer would collapse "can't list" into "empty", the same
//     corrupt≠empty trap contract #2 forbids.

import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";
import { assertSafeName } from "./names.js";
import { SRC_MAX_BYTES } from "../limits.js";
import { FailedReadError } from "../errors.js";

/** A mutating operation was attempted on a read-only backend. Named so callers can distinguish
 *  "this store can't be written" from a failed write. */
export class ReadOnlyFilesystemError extends Error {
  constructor(op: string) {
    super(`this filesystem is read-only: ${op} is not supported`);
    this.name = "ReadOnlyFilesystemError";
  }
}

/** Shared per-instance config, threaded to every handle. */
interface HttpFsConfig {
  /** Base URL, normalized to a trailing slash. */
  readonly base: string;
  readonly fetchImpl: typeof fetch;
  readonly maxBytes: number;
}

class HttpFile implements FsFile {
  constructor(
    private readonly cfg: HttpFsConfig,
    /** Tree-relative path, raw segments — for error messages (mirrors JsonSource paths). */
    private readonly path: string,
    /** The same path, percent-encoded per segment — what actually joins onto the base URL. */
    private readonly encodedPath: string,
    readonly name: string,
  ) {}

  /** ONE capped GET; the absent-vs-failed classification lives here and nowhere else. */
  private async fetchBytes(): Promise<ArrayBuffer> {
    let res: Response;
    try {
      res = await this.cfg.fetchImpl(this.cfg.base + this.encodedPath);
    } catch (e) {
      throw new FailedReadError(this.path, e); // network fault — FAILED, never absent
    }
    if (res.status === 404) throw new Error(`no such file: ${this.name}`); // absent — canonical seam phrasing
    if (!res.ok) throw new FailedReadError(this.path, new Error(`HTTP ${res.status}`), { status: res.status });
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > this.cfg.maxBytes) {
      throw new FailedReadError(this.path, new Error(`declared content-length ${declared} exceeds the ${this.cfg.maxBytes}-byte cap`));
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await res.arrayBuffer();
    } catch (e) {
      throw new FailedReadError(this.path, e); // torn body / aborted transfer — FAILED
    }
    if (bytes.byteLength > this.cfg.maxBytes) {
      throw new FailedReadError(this.path, new Error(`response of ${bytes.byteLength} bytes exceeds the ${this.cfg.maxBytes}-byte cap`));
    }
    return bytes;
  }

  async readable(): Promise<ArrayBuffer> {
    return this.fetchBytes();
  }

  async writable(): Promise<FsWritable> {
    throw new ReadOnlyFilesystemError("writable()");
  }

  async getFile(): Promise<File> {
    return new File([await this.fetchBytes()], this.name);
  }
}

class HttpDir implements FsDirectory {
  constructor(
    private readonly cfg: HttpFsConfig,
    /** Tree-relative dir path, raw ("" at the root, else "a/b"). */
    private readonly path: string,
    private readonly encodedPath: string,
  ) {}

  /** Containment gate: validate then encode the segment BEFORE it joins the URL. */
  private child(name: string): { path: string; encodedPath: string } {
    assertSafeName(name);
    const enc = encodeURIComponent(name);
    return {
      path: this.path === "" ? name : `${this.path}/${name}`,
      encodedPath: this.encodedPath === "" ? enc : `${this.encodedPath}/${enc}`,
    };
  }

  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    if (opts?.create === true) throw new ReadOnlyFilesystemError("getDirectory({ create: true })");
    const c = this.child(name);
    return new HttpDir(this.cfg, c.path, c.encodedPath); // lazy — no existence probe over plain HTTP
  }

  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    if (opts?.create === true) throw new ReadOnlyFilesystemError("getFile({ create: true })");
    const c = this.child(name);
    return new HttpFile(this.cfg, c.path, c.encodedPath, name); // lazy — absence surfaces on read
  }

  async remove(name: string): Promise<void> {
    throw new ReadOnlyFilesystemError(`remove(${JSON.stringify(name)})`);
  }

  // eslint-disable-next-line require-yield -- enumerating is unsupported, not empty
  async *entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    throw new Error("HttpFilesystem cannot enumerate entries: plain HTTP has no directory listing — read known paths instead");
  }
}

/** A read-only Filesystem over a published tree at `base` (any plain static HTTP(S) host). */
export class HttpFilesystem implements Filesystem {
  private readonly cfg: HttpFsConfig;
  constructor(base: string, opts?: { fetch?: typeof fetch; maxBytes?: number }) {
    this.cfg = {
      base: base.endsWith("/") ? base : `${base}/`,
      // BOUND, never bare `fetch`: cfg stores this and `fetchBytes` invokes it as `this.cfg.fetchImpl(…)`
      // — a method call whose receiver is `cfg`, not `Window`. Browsers brand-check the receiver and
      // throw "Illegal invocation"; Node's fetch doesn't, so vitest is structurally blind to the
      // difference (recipes/smoke.mjs is the browser gate). See .claude/rules/bound-fetch-defaults.md.
      fetchImpl: opts?.fetch ?? globalThis.fetch.bind(globalThis),
      maxBytes: opts?.maxBytes ?? SRC_MAX_BYTES,
    };
  }
  async root(): Promise<FsDirectory> {
    return new HttpDir(this.cfg, "", "");
  }
}

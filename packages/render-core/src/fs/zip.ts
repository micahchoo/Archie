// ZipFilesystem — the DownloadFilesystem core (ADR-0003 storage / Q-5; UX-Q2). Backs the
// Filesystem seam over an in-memory flat file tree, serializable to/from a `.archie.zip`
// (fflate). On non-Chromium the zip IS the canonical file: explicit Save = download the zip,
// Open = pick it (the "Word-doc 2003" model). Directories are implicit (zip path prefixes).

import { zipSync, unzipSync, strToU8, type Zippable, type ZipOptions } from "fflate";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";

/** Store (no deflate). */
const STORED: ZipOptions = { level: 0 };

/**
 * Is this entry ALREADY compressed, so deflating it is pure cost?
 *
 * A published library is overwhelmingly JPEG DZI tiles, baked thumbnails and masters — all
 * entropy-coded already. Measured on a 1073-entry / 9.4 MB tree shaped like one pyramid: deflate at
 * fflate's default level took **150 ms and saved 0.7%**; storing took **19 ms** (~8x) and cost 0.7%
 * in the other direction. `toZip` is synchronous and on the main thread, so that time is a hard UI
 * freeze that scales with library size.
 *
 * Text (manifest.json, the HTML pages, sitemaps) still deflates — it compresses several-fold and is
 * a small share of the bytes, so it is worth the milliseconds. Extension-based on purpose: the store
 * is a flat path→bytes map with no recorded MIME.
 *
 * NOTE the streaming sink (`ZipStreamFilesystem`) uses `ZipPassThrough`, i.e. STORED for *everything*
 * including text. The two sinks therefore emit different bytes for the same tree; both are valid
 * zips and both round-trip through `fromZip`, so nothing depends on them agreeing.
 */
function isPrecompressed(path: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|heic|mp3|m4a|aac|ogg|opus|mp4|webm|mov|zip|gz|br|woff2?)$/i.test(path);
}

/**
 * Decompression caps for `fromZip` — zip-bomb defense on the file-drop path (strategy 5.1). The
 * file-drop flow (`apps/studio/src/ingest-flows.ts`, `apps/viewer/src/published.ts`) feeds
 * attacker-controlled bytes straight into `unzipSync`; without a ceiling a few-KB archive that
 * DECLARES gigabytes uncompressed would OOM the tab. The `?src=` fetch path already had a 256MB
 * byte cap at the network layer; these caps close the matching gap on the drop path, where the
 * bytes never traverse the network.
 *
 * Defaults (rescaled by SCALE zip round-trip — the old 512 MB / 50k refused a legitimately large
 * library that Studio's OWN export produced, so Archie's viewer/ingest couldn't reopen it):
 *  - `maxTotalBytes` 4 GiB — total DECLARED uncompressed bytes across all entries. A 100-exhibit ×
 *    100-object library with masters + baked thumbnails + publish-time DZI tiles runs to several GB;
 *    512 MB was well under a real media library. The open side decodes the whole archive into an
 *    in-memory Map, so this is ALSO the practical ceiling of what a browser tab can reopen — a
 *    library beyond a few GB is a HOSTED published tree, not a zip round-trip. Paired with `maxRatio`
 *    (per-entry) it still refuses a single-entry declared-huge bomb.
 *  - `maxEntries` 500 000 — a large library is ~70k structural files (folios + sidecars + per-reading
 *    annotation pages); publish-time DZI tiling of large masters adds pyramids (~1.4k tiles per
 *    >4096px image), so a media-heavy export reaches the 10^5–10^6 range. 500k admits that with
 *    headroom while a "millions of empty inodes" handle-exhaustion archive (10M+) is still refused.
 *    OUT OF SCOPE by design: a library whose tiling ALONE exceeds ~500k entries (thousands of huge
 *    masters) is not a zip round-trip candidate — host it as a published tree (folder / GitHub Pages);
 *    the cap message says so.
 *  - `maxRatio` 100 — per-entry decompressed:compressed (UNCHANGED — this is the real bomb defense).
 *    Deflate tops out near ~1032:1 on pathological input; 100:1 admits all real text/JSON/media while
 *    rejecting the classic single-entry bomb.
 *
 * Enforced from the CENTRAL DIRECTORY (via fflate's `filter`) BEFORE any entry is decompressed —
 * the declared `originalSize` / compressed `size` are read from directory headers, so a bomb is
 * rejected without paying to inflate it.
 */
export interface ZipLimits {
  readonly maxTotalBytes: number;
  readonly maxEntries: number;
  readonly maxRatio: number;
}
export const ZIP_LIMITS: ZipLimits = {
  maxTotalBytes: 4 * 1024 * 1024 * 1024,
  maxEntries: 500_000,
  maxRatio: 100,
};

/** A chunk sink for streaming serialization (A.1). Mirrors the slice of FileSystemWritableFileStream
 *  we need; `write` may be async (the browser sink awaits disk) and is drained serially. */
export interface ZipSink {
  write(chunk: Uint8Array): void | Promise<void>;
  close(): void | Promise<void>;
}

/**
 * Classic (non-Zip64) .zip WRITER ceilings — what fflate 0.8.2/0.8.3 can emit CORRECTLY on its own. Its
 * end-of-central-directory writer (`wzf`) stores the entry count in a 2-byte field and every offset in
 * a 4-byte field with NO overflow check (verified against the pinned source: the only Zip64 CODE anywhere
 * in the bundle is on the READ side — `z64hs`/`zh` — there is no write-side Zip64 emission at all), so an
 * archive with more than 65 535 entries or data past 4 GiB isn't refused by fflate itself — it's emitted
 * with silently wrapped/truncated headers that readers then mis-parse (fflate's own `unzipSync` reads the
 * 2-byte count back, so a 70k-entry export would reopen as ~4.5k files: silent data loss).
 *
 * `ZipFilesystem.toZip` (eager) enforces the ENTRIES ceiling and throws an ACTIONABLE error — it is the
 * non-Chromium fallback (memory-bounded separately, see `ZipStore`/`EAGER_ZIP_CEILING_BYTES`), and
 * fixing its entries cap the same way `ZipStreamFilesystem` does below would mean re-deriving its
 * central-directory offset/size independently of `zipSync`'s single-shot output (the same corruption
 * `ZipStreamFilesystem` routes around) — deferred as out of scope for Archie-1cf0's low-priority pass;
 * `libraryToZip`'s own doc calls this path "the non-Chromium fallback", not the one that matters at scale.
 * It has NO bytes handling either (was never exercised — its store is separately capped well under 4 GiB)
 * — this remains true after Archie-1cf0's byte-dimension pass below, which is streaming-only by the same
 * scoping the ticket already applied to the entries dimension.
 *
 * `ZipStreamFilesystem` (Archie-1cf0) refuses on NEITHER ceiling. It doesn't use fflate's `Zip`/
 * `ZipPassThrough` writer at all — every local header, central-directory entry, and the trailing EOCD
 * block is hand-written in `zip-stream.ts` from offset/size/crc values it tracks itself. Past
 * `maxEntries` (entries dimension) and/or past `maxBytes` (bytes dimension — an entry's own size, or its
 * local-header offset, or the central directory's own size/offset) it switches the affected field(s) to
 * Zip64 (sentinel + extra field) instead of trusting a 4-byte write that fflate's own writer would
 * silently truncate. See `zip-stream.ts`'s module doc for the full fflate trace (why patching only the
 * trailing block, as the entries-only fix originally did, is NOT sufficient once bytes are in play) and
 * `zip-stream.test.ts` for the round-trip proofs (fflate's `unzipSync`, `ZipFilesystem.fromZip`, Info-ZIP
 * `unzip -t`, and Python's `zipfile` — the last two are load-bearing past 4 GiB: fflate's own zip64
 * EOCD-record lookup does a 32-bit offset read, so IT cannot correctly reopen an archive whose central
 * directory starts past 4 GiB, independent of whether this writer produced it correctly).
 *
 * Injectable only so tests can trip the guard cheaply (a tiny ceiling) — production always uses this
 * default. NOTE: distinct from `ZIP_LIMITS`, the READ-side zip-bomb caps.
 */
export interface ZipFormatLimits {
  /** Max central-directory entries a 2-byte EOCD count can index. */
  readonly maxEntries: number;
  /** Max bytes (an entry's size, an offset, the central directory's own size/offset) a 4-byte zip
   *  format field can hold before `ZipStreamFilesystem` switches that field to Zip64. */
  readonly maxBytes: number;
}
export const ZIP_FORMAT_LIMITS: ZipFormatLimits = {
  maxEntries: 65_535,
  maxBytes: 0xffff_ffff,
};

/** The actionable refusal `ZipFilesystem.toZip` (eager) throws at its entries ceiling — the only
 *  `ZIP_FORMAT_LIMITS` breach anything still refuses on (see the doc above: the streaming writer
 *  no longer refuses on either dimension, so it never calls this). */
export function zipFormatError(_kind: "entries", limits: ZipFormatLimits): Error {
  return new Error(
    `This library doesn't fit in a .archie.zip: it has more than ${limits.maxEntries.toLocaleString()} ` +
      `files, which is past what the classic .zip format can index — the archive would be silently ` +
      `corrupt. Publish to a folder instead (it has no such limit), or export a subset of exhibits.`,
  );
}

/**
 * The eager in-memory tree behind a `ZipFilesystem`. Optionally bounded by `maxBytes`: the eager
 * publish/assembly path (`toZip()` builds a 2nd full copy, so peak ≈ 2× the tree) holds the WHOLE
 * published tree — media included — in this Map, which OOMs a webview at scale. When a ceiling is
 * set, `set()` tracks cumulative retained bytes and throws an ACTIONABLE error the moment assembly
 * crosses it (early-abort per SCALE requirement #2), catching generated media — DZI tiles, remote
 * bakes — that a pre-assembly asset-size ESTIMATE can't see. `fromZip` constructs an UNBOUNDED store
 * (decode is already gated by `ZIP_LIMITS`), so loading never trips this.
 */
class ZipStore {
  readonly files = new Map<string, Uint8Array>();
  private total = 0;
  constructor(private readonly maxBytes?: number) {}
  set(path: string, bytes: Uint8Array): void {
    if (this.maxBytes !== undefined) {
      this.total += bytes.byteLength - (this.files.get(path)?.byteLength ?? 0);
      if (this.total > this.maxBytes) {
        const mb = Math.round(this.total / (1024 * 1024));
        throw new Error(
          `This library is too large to build a .archie.zip in memory here (~${mb} MB and counting). ` +
            `Publish to a folder instead (Chromium “Save to disk” streams straight to disk), or link ` +
            `large media by URL so the library references it rather than copying it in.`,
        );
      }
    }
    this.files.set(path, bytes);
  }
  delete(path: string): void {
    if (this.maxBytes !== undefined) this.total -= this.files.get(path)?.byteLength ?? 0;
    this.files.delete(path);
  }
}

function join(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

class ZipFile implements FsFile {
  constructor(
    private readonly store: ZipStore,
    private readonly path: string,
    public readonly name: string,
  ) {}
  async readable(): Promise<ArrayBuffer> {
    const bytes = this.store.files.get(this.path);
    if (bytes === undefined) throw new Error(`no such file: ${this.path}`);
    return bytes.slice().buffer;
  }
  async writable(): Promise<FsWritable> {
    let buf = new Uint8Array(0);
    return {
      write: async (data) => {
        if (typeof data === "string") buf = strToU8(data);
        else if (data instanceof ArrayBuffer) buf = new Uint8Array(data);
        else buf = new Uint8Array(await data.arrayBuffer());
      },
      close: async () => {
        this.store.set(this.path, buf);
      },
    };
  }
  async getFile(): Promise<File> {
    const bytes = this.store.files.get(this.path) ?? new Uint8Array(0);
    return new File([bytes.slice()], this.name);
  }
  async size(): Promise<number> {
    return this.store.files.get(this.path)?.byteLength ?? 0;
  }
}

class ZipDir implements FsDirectory {
  constructor(
    private readonly store: ZipStore,
    private readonly prefix: string,
  ) {}
  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    const p = join(this.prefix, name);
    if (opts?.create !== true) {
      const exists = [...this.store.files.keys()].some((k) => k === p || k.startsWith(`${p}/`));
      if (!exists) throw new Error(`no such directory: ${name}`);
    }
    return new ZipDir(this.store, p);
  }
  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    const p = join(this.prefix, name);
    if (!this.store.files.has(p)) {
      if (opts?.create !== true) throw new Error(`no such file: ${name}`);
      this.store.set(p, new Uint8Array(0));
    }
    return new ZipFile(this.store, p, name);
  }
  async remove(name: string): Promise<void> {
    const p = join(this.prefix, name);
    this.store.delete(p);
    for (const k of [...this.store.files.keys()]) if (k.startsWith(`${p}/`)) this.store.delete(k);
  }
  async *entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    const pre = this.prefix === "" ? "" : `${this.prefix}/`;
    const seen = new Set<string>();
    for (const k of this.store.files.keys()) {
      if (!k.startsWith(pre)) continue;
      const rest = k.slice(pre.length);
      const slash = rest.indexOf("/");
      if (slash === -1) {
        if (!seen.has(rest)) {
          seen.add(rest);
          yield { name: rest, kind: "file" };
        }
      } else {
        const dir = rest.slice(0, slash);
        if (!seen.has(`d:${dir}`)) {
          seen.add(`d:${dir}`);
          yield { name: dir, kind: "directory" };
        }
      }
    }
  }
}

export class ZipFilesystem implements Filesystem {
  private readonly store: ZipStore;
  /**
   * @param opts.maxUncompressedBytes Early-abort ceiling for the EAGER assembly path (the whole tree
   *   is held in memory, and `toZip()` doubles it). Omit (the default, and what `fromZip` uses) for
   *   an unbounded store. The streaming export path uses `ZipStreamFilesystem` instead — it never
   *   accumulates the tree, so it needs no such ceiling.
   */
  constructor(opts?: { maxUncompressedBytes?: number }) {
    this.store = new ZipStore(opts?.maxUncompressedBytes);
  }
  async root(): Promise<FsDirectory> {
    return new ZipDir(this.store, "");
  }
  /** Serialize the whole tree to a zip (the canonical `.archie.zip` to download on Save). Refuses a
   *  tree past `ZIP_FORMAT_LIMITS.maxEntries` — many small files (DZI tiles) can breach the 2-byte
   *  entry count well under the byte ceilings, and fflate would emit a silently corrupt archive.
   *  (The byte side needs no check here: the eager path is ceilinged at 1 GiB by its store, far
   *  below the 4 GiB offset overflow.) `limits` is injectable ONLY for tests (fromZip's pattern);
   *  production always serializes under the canonical default. */
  toZip(limits: ZipFormatLimits = ZIP_FORMAT_LIMITS): Uint8Array {
    if (this.store.files.size > limits.maxEntries) throw zipFormatError("entries", limits);
    const data: Zippable = {};
    for (const [k, v] of this.store.files) {
      data[k] = isPrecompressed(k) ? [v, STORED] : v;
    }
    return zipSync(data);
  }

  /**
   * Load a ZipFilesystem from `.archie.zip` bytes (the Open / file-drop flow). Capped against zip
   * bombs (strategy 5.1 — see {@link ZIP_LIMITS}): rejects, with a clear error, an archive that
   * declares too many total uncompressed bytes, too many entries, or any single entry whose
   * decompression ratio is implausibly high. The checks run from the central directory (fflate's
   * `filter`, invoked per entry BEFORE decompression), so a bomb is refused without inflating it.
   *
   * `limits` defaults to the canonical `ZIP_LIMITS` — the untrusted-open seam (`open.ts`) always
   * calls `fromZip(raw)` with the default. It is injectable ONLY so tests can drive the enforcement
   * cheaply (a tiny ceiling) instead of building a production-cap-sized real archive; production
   * never passes it.
   */
  static fromZip(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): ZipFilesystem {
    const fs = new ZipFilesystem();
    let entries = 0;
    let totalBytes = 0;
    // fflate calls `filter` once per central-directory entry, before decompressing. We don't drop
    // anything (always extract); we use it purely as a pre-decompression gate that throws on breach.
    const unzipped = unzipSync(bytes, {
      filter: (file) => {
        entries++;
        if (entries > limits.maxEntries) {
          throw new Error(
            `archie.zip rejected: too many entries (> ${limits.maxEntries.toLocaleString()}) — possible zip bomb`,
          );
        }
        const declared = file.originalSize; // uncompressed size from the directory header
        const compressed = file.size;
        // Per-entry ratio: a small compressed blob declaring a huge uncompressed size is the classic
        // single-file bomb. Guard only when there's something to compare against (compressed > 0).
        if (compressed > 0 && declared / compressed > limits.maxRatio) {
          throw new Error(
            `archie.zip rejected: entry "${file.name}" has an implausible compression ratio ` +
              `(${Math.round(declared / compressed)}× > ${limits.maxRatio}×) — possible zip bomb`,
          );
        }
        totalBytes += declared;
        if (totalBytes > limits.maxTotalBytes) {
          throw new Error(
            `archie.zip rejected: total uncompressed size exceeds the ` +
              `${(limits.maxTotalBytes / (1024 * 1024)).toFixed(0)} MB cap — possible zip bomb`,
          );
        }
        return true;
      },
    });
    for (const [k, v] of Object.entries(unzipped)) fs.store.set(k, v);
    return fs;
  }
}

// Annotation persistence (ADR-0003 / Q-5) — write the spine to disk through the Filesystem
// seam and reload it. On disk (within an annotations directory):
//   heads.json                      — the consumer heads page (current versions only)
//   history/index.json              — logicalId -> history page url (the merge/reload load target)
//   history/{logicalId}.json        — full version chain w/ archie: DAG metadata
// Reload reconstructs the full DAG from the history pages (NOT the consumer-minimal heads page).

import { toHistory, toHeadsPage, type SerializeOptions } from "./serialize.js";
import { fromHistory } from "./deserialize.js";
import type { FsDirectory } from "../fs/seam.js";
import type { AnnotationLog, W3CAnnotationPage } from "../wadm/types.js";

const HISTORY_DIR = "history";
const INDEX_FILE = "index.json";
const HEADS_FILE = "heads.json";

async function writeJson(dir: FsDirectory, name: string, data: unknown): Promise<void> {
  const file = await dir.getFile(name, { create: true });
  const w = await file.writable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

async function readJson<T>(dir: FsDirectory, name: string): Promise<T> {
  const file = await dir.getFile(name);
  return JSON.parse(new TextDecoder().decode(await file.readable())) as T;
}

/**
 * Write the annotation log into `annDir`: the consumer heads page + the history sidecar +
 * the index. Pure idempotent projection of the log (re-writing the same log is a no-op result).
 */
export async function writeAnnotations(annDir: FsDirectory, log: AnnotationLog, opts: SerializeOptions = {}, only?: ReadonlySet<string>): Promise<void> {
  const headsPage = toHeadsPage(log, `${opts.baseUrl ?? ""}heads.json`, opts);
  await writeJson(annDir, HEADS_FILE, headsPage);

  const { index, pages } = toHistory(log, opts);
  const histDir = await annDir.getDirectory(HISTORY_DIR, { create: true });
  // PERF: history pages are independent files — write them concurrently instead of awaiting each in turn
  // (the autosave latency was linear in note count: one round-trip per page). Distinct paths → race-free
  // across all fs backends (a writable locks only its own file).
  //
  // INCREMENTAL: when `only` is given (the session's dirty logicalIds), rewrite JUST those pages —
  // editing one note rewrites one file, not all N (the write-amplification fix). heads.json + index.json
  // are ALWAYS rewritten in full (small, whole-log projections that reload reads); unnamed pages stay on
  // disk from a prior full write. SAFE because the index still lists every logicalId, so reload reads them
  // all — the un-rewritten ones are byte-identical to what's on disk. `only` undefined = full write (the
  // first save / post-seed / post-merge, and every publish/zip projection).
  const entries = only ? Object.entries(pages).filter(([id]) => only.has(id)) : Object.entries(pages);
  await Promise.all(entries.map(([logicalId, page]) => writeJson(histDir, `${logicalId}.json`, page)));
  // COMMIT POINT (Issue 19): the index is written LAST — it is what `readAnnotations` reads to discover
  // the pages, so it must not name a page that isn't on disk yet. Writing it before its pages made a torn
  // write (tab close / crash / quota between the index and the pages) leave the index referencing a page
  // that never landed; reload then read that store as EMPTY and the exhibit's notes silently vanished.
  // Pages-first / index-last makes an interrupted write roll back to "no committed index" (= empty, safe)
  // instead of "index → missing page" (= silent loss). A crash between the pages and this line just leaves
  // a stale index that the NEXT full write overwrites — no torn state is ever the committed state.
  await writeJson(histDir, INDEX_FILE, index);
}

/** A history page the index referenced but that could not be read (missing file / unparseable JSON) —
 *  a torn write or on-disk corruption. Distinct from an ABSENT store (which is simply empty). */
export interface CorruptAnnotationPage {
  /** The logicalId whose history page failed to read. */
  logicalId: string;
  /** The page url as recorded in the index. */
  url: string;
  /** The underlying read/parse failure message. */
  reason: string;
}

/** The outcome of a tolerant annotation read: the log reconstructed from every page that DID read,
 *  plus the pages that did not (empty when the store is clean or absent). */
export interface AnnotationReadResult {
  log: AnnotationLog;
  corrupt: CorruptAnnotationPage[];
}

/**
 * Thrown when an annotation store's committed index references pages that cannot be read (a torn
 * write / corruption) — the "corrupt ≠ empty" distinction (Issue 19). A caller that must not present
 * corruption as "nothing authored" (and must not overwrite the torn store with a fresh seed) throws
 * or surfaces this instead of swallowing the read to `[]`.
 */
export class AnnotationsCorruptError extends Error {
  constructor(
    readonly corrupt: CorruptAnnotationPage[],
    label = "annotation store",
  ) {
    super(`${label} is corrupt: ${corrupt.length} unreadable page(s) — ${corrupt.map((c) => c.logicalId).join(", ")}`);
    this.name = "AnnotationsCorruptError";
  }
}

/**
 * Reload the full append-only log from `annDir`, PER-PAGE TOLERANT: a page the index lists but that
 * is missing or unparseable is skipped and REPORTED (in `corrupt`) rather than rejecting the whole
 * read — one torn page can no longer empty an entire exhibit (Issue 19). An absent store (no history
 * dir, or no committed index) is genuinely empty: `{ log: [], corrupt: [] }`.
 */
export async function readAnnotationsReport(annDir: FsDirectory): Promise<AnnotationReadResult> {
  let histDir: FsDirectory;
  try {
    histDir = await annDir.getDirectory(HISTORY_DIR);
  } catch {
    return { log: [], corrupt: [] }; // nothing persisted yet
  }
  let index: Record<string, string>;
  try {
    index = await readJson<Record<string, string>>(histDir, INDEX_FILE);
  } catch {
    // No committed index (absent or unparseable). With pages-first / index-last ordering, an absent
    // index means the write never reached its commit point → the store is EMPTY, not corrupt. (A
    // PRESENT index naming a torn page IS surfaced, per-page, below.)
    return { log: [], corrupt: [] };
  }
  const corrupt: CorruptAnnotationPage[] = [];
  // PERF: read the history pages concurrently (exhibit-open latency was linear in note count — one
  // round-trip per page). Promise.all preserves array order, so fromHistory sees the same page order.
  const results = await Promise.all(
    Object.entries(index).map(async ([logicalId, url]) => {
      try {
        return await readJson<W3CAnnotationPage>(histDir, `${logicalId}.json`);
      } catch (e) {
        corrupt.push({ logicalId, url, reason: e instanceof Error ? e.message : String(e) });
        return null;
      }
    }),
  );
  const pages = results.filter((p): p is W3CAnnotationPage => p !== null);
  return { log: fromHistory(pages), corrupt };
}

/**
 * Reload the full append-only log from `annDir` (the tolerant read's log half — every page that read).
 * Callers needing the corrupt-vs-empty distinction use {@link readAnnotationsReport} instead; this
 * convenience keeps the common "just give me the log" call sites unchanged.
 */
export async function readAnnotations(annDir: FsDirectory): Promise<AnnotationLog> {
  return (await readAnnotationsReport(annDir)).log;
}

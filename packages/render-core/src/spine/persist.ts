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
  await writeJson(histDir, INDEX_FILE, index);
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
}

/**
 * Reload the full append-only log from `annDir` by reconstructing the DAG from the history
 * pages (the index lists them). Returns an empty log if no annotations have been written.
 */
export async function readAnnotations(annDir: FsDirectory): Promise<AnnotationLog> {
  let histDir: FsDirectory;
  try {
    histDir = await annDir.getDirectory(HISTORY_DIR);
  } catch {
    return []; // nothing persisted yet
  }
  const index = await readJson<Record<string, string>>(histDir, INDEX_FILE);
  // PERF: read the history pages concurrently (exhibit-open latency was linear in note count — one
  // round-trip per page). Promise.all preserves array order, so fromHistory sees the same page order.
  const pages = await Promise.all(
    Object.keys(index).map((logicalId) => readJson<W3CAnnotationPage>(histDir, `${logicalId}.json`)),
  );
  return fromHistory(pages);
}

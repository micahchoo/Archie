// Annotation persistence (ADR-0003 / Q-5) — write the spine to disk through the Filesystem
// seam and reload it. On disk (within an annotations directory):
//   heads.json                      — the consumer heads page (current versions only)
//   history/index.json              — logicalId -> history page url (the merge/reload load target)
//   history/{logicalId}.json        — full version chain w/ archie: DAG metadata
// Reload reconstructs the full DAG from the history pages (NOT the consumer-minimal heads page).

import { toHistory, toHeadsPage, type SerializeOptions } from "./serialize.js";
import { fromHistoryPage } from "./deserialize.js";
import type { FsDirectory } from "../fs/seam.js";
import { readHistoryRecords, writeHistoryPages, writeJson } from "./page-store.js";
import type { AnnotationLog, W3CAnnotationPage } from "../wadm/types.js";

/**
 * Write the annotation log into `annDir`: the consumer heads page + the history sidecar +
 * the index. Pure idempotent projection of the log (re-writing the same log is a no-op result).
 */
export async function writeAnnotations(annDir: FsDirectory, log: AnnotationLog, opts: SerializeOptions = {}, only?: ReadonlySet<string>): Promise<void> {
 const headsPage = toHeadsPage(log, `${opts.baseUrl ?? ""}heads.json`, opts);
 await writeJson(annDir, "heads.json", headsPage);
 // Only dirty history pages change on incremental saves; the index still names the full log.
 await writeHistoryPages(annDir, toHistory(log, opts), only);
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
 const { log, corrupt } = await readHistoryRecords(annDir, (raw) => {
  if (raw === null || typeof raw !== "object" ||
   (raw as { type?: unknown }).type !== "AnnotationPage" ||
   !Array.isArray((raw as { items?: unknown }).items)) {
   throw new Error("not an annotation history page (expected AnnotationPage with items)");
  }
  return fromHistoryPage(raw as W3CAnnotationPage);
 }, ({ id, url, reason }) => new AnnotationsCorruptError(
  [{ logicalId: id, url, reason }], "index.json",
 ));
 return { log, corrupt: corrupt.map(({ id, url, reason }) => ({ logicalId: id, url, reason })) };
}

/**
 * Reload the full append-only log from `annDir` (the tolerant read's log half — every page that read).
 * Callers needing the corrupt-vs-empty distinction use {@link readAnnotationsReport} instead; this
 * convenience keeps the common "just give me the log" call sites unchanged.
 */
export async function readAnnotations(annDir: FsDirectory): Promise<AnnotationLog> {
 return (await readAnnotationsReport(annDir)).log;
}

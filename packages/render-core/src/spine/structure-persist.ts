// Structure-log persistence (Archie-a911) — write the section rev-log to disk through the
// Filesystem seam and reload it. The structure sibling of persist.ts, layout kept parallel to
// the annotation store (within an exhibit's structure directory, beside `annotations/`):
//   history/index.json          — localId -> history page url (the commit point, written LAST)
//   history/{localId}.json      — full version chain for one section
// No heads page: sections have no external WADM consumer — the consumer projection is
// `projectSections`/`toWorkingSections` at the publish seam, derived from the reloaded log.
//
// Crash-consistency (rule render-core-data-integrity #1): content pages FIRST, index LAST. The
// index is what the read discovers pages through, so a torn write (crash/quota between files)
// leaves either "no committed index" (reads as EMPTY — stale, safe) or a stale index the next
// full write overwrites. In-place page replacement does not provide snapshot isolation.

import { toStructureHistory, sectionRecordsFromPage, type StructureSerializeOptions } from "./structure-serialize.js";
import type { SectionLog } from "./structure.js";
import type { ExhibitId } from "../wadm/brand.js";
import type { FsDirectory } from "../fs/seam.js";
import { readHistoryRecords, writeHistoryPages } from "./page-store.js";

/**
 * Write the structure log into `structDir` (the exhibit's structure directory): one history page
 * per section + the index. A pure idempotent projection of the log. WRITE ORDER (rule #1): the
 * pages are written first (concurrently — distinct paths, race-free across fs backends); the
 * index is the COMMIT POINT, written last, so it never names a page that isn't on disk yet.
 */
export async function writeStructure(structDir: FsDirectory, log: SectionLog, opts: StructureSerializeOptions = {}): Promise<void> {
 await writeHistoryPages(structDir, toStructureHistory(log, opts));
}

/** A history page the index referenced but that could not be read (missing file / unparseable or
 *  wrong-schema JSON) — a torn write or on-disk corruption. Distinct from an ABSENT store. */
export interface CorruptStructurePage {
 /** The section localId whose history page failed to read. */
 localId: string;
 /** The page url as recorded in the index. */
 url: string;
 /** The underlying read/parse failure message. */
 reason: string;
}

/** The outcome of a tolerant structure read: the log reconstructed from every page that DID read,
 *  plus the pages that did not (empty when the store is clean or absent). */
export interface StructureReadResult {
 log: SectionLog;
 corrupt: CorruptStructurePage[];
}

/**
 * Thrown when a structure store's committed index references pages that cannot be read — the
 * "corrupt ≠ empty" distinction (rule #2, sibling of AnnotationsCorruptError). A caller that must
 * not present corruption as "no sections authored" (and must not clobber the torn store with a
 * fresh write) throws or surfaces this instead of swallowing the read to `[]`.
 */
export class StructureCorruptError extends Error {
 constructor(
  readonly corrupt: CorruptStructurePage[],
  label = "structure store",
 ) {
  super(`${label} is corrupt: ${corrupt.length} unreadable page(s) — ${corrupt.map((c) => c.localId).join(", ")}`);
  this.name = "StructureCorruptError";
 }
}

/**
 * Reload the full append-only structure log from `structDir`, PER-PAGE TOLERANT (rule #2): a page
 * the index lists but that is missing, unparseable, or not a structure page is skipped and
 * REPORTED in `corrupt` — one torn page never rejects the whole log, and corruption is never
 * collapsed to "nothing authored". An absent store (no history dir, or no committed index — the
 * write never reached its commit point) is genuinely empty: `{ log: [], corrupt: [] }`.
 * `exhibitId` recomposes the on-disk local ids into SectionKeys — the exhibit context comes from
 * where the pages live, not from the pages themselves.
 */
export async function readStructureReport(structDir: FsDirectory, exhibitId: ExhibitId): Promise<StructureReadResult> {
 const { log, corrupt } = await readHistoryRecords(structDir,
  (page) => sectionRecordsFromPage(page, exhibitId),
  ({ id, url, reason }) => new StructureCorruptError([{ localId: id, url, reason }], "structure index.json"),
 );
 return { log, corrupt: corrupt.map(({ id, url, reason }) => ({ localId: id, url, reason })) };
}

/**
 * Reload the structure log (the tolerant read's log half — every page that read). Callers needing
 * the corrupt-vs-empty distinction use {@link readStructureReport}; this convenience mirrors
 * `readAnnotations`.
 */
export async function readStructure(structDir: FsDirectory, exhibitId: ExhibitId): Promise<SectionLog> {
 return (await readStructureReport(structDir, exhibitId)).log;
}

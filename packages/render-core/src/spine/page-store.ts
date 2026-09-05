// Internal persistence mechanics shared by annotation and structure history stores.
// Codecs own domain validation; this module owns recovery, absence classification, and commit order.
import { isNotFound, type FsDirectory } from "../fs/seam.js";

export interface CorruptHistoryPage {
  id: string;
  url: string;
  reason: string;
}

export async function writeJson(dir: FsDirectory, name: string, data: unknown): Promise<void> {
  const writer = await (await dir.getFile(name, { create: true })).writable();
  await writer.write(JSON.stringify(data, null, 2));
  await writer.close();
}

async function readJson(dir: FsDirectory, name: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await (await dir.getFile(name)).readable()));
}

/** Finish every started write before rejecting, so a retry cannot race residual page writes.
 * Pages precede the discovery index. Existing pages are replaced in place: this is not snapshot
 * isolation, and an interrupted update can still leave a mixture of old and new page contents. */
export async function writeHistoryPages(
  dir: FsDirectory,
  history: { index: Record<string, string>; pages: Record<string, unknown> },
  only?: ReadonlySet<string>,
): Promise<void> {
  const hist = await dir.getDirectory("history", { create: true });
  const entries = Object.entries(history.pages).filter(([id]) => !only || only.has(id));
  const results = await Promise.allSettled(entries.map(([id, page]) => writeJson(hist, `${id}.json`, page)));
  for (const result of results) if (result.status === "rejected") throw result.reason;
  await writeJson(hist, "index.json", history.index);
}

/** Recover independent pages through their codec, then deduplicate revisions in index order.
 * Only not-found is absence; inaccessible stores reject and malformed indexes use the domain error. */
export async function readHistoryRecords<T extends { rev: string }>(
  dir: FsDirectory,
  decode: (page: unknown) => readonly T[],
  indexError: (corrupt: CorruptHistoryPage) => Error,
): Promise<{ log: T[]; corrupt: CorruptHistoryPage[] }> {
  let hist: FsDirectory;
  try {
    hist = await dir.getDirectory("history");
  } catch (error) {
    if (isNotFound(error)) return { log: [], corrupt: [] };
    throw error;
  }
  let index: Record<string, string>;
  try {
    const raw = await readJson(hist, "index.json");
    if (raw === null || typeof raw !== "object" || Array.isArray(raw) ||
      !Object.values(raw).every((url) => typeof url === "string")) {
      throw new Error("not a history index (expected an object mapping ids to page URLs)");
    }
    index = raw as Record<string, string>;
  } catch (error) {
    if (isNotFound(error)) return { log: [], corrupt: [] };
    throw indexError({ id: "index.json", url: "index.json", reason: reason(error) });
  }
  const results = await Promise.all(Object.entries(index).map(async ([id, url]) => {
    try {
      return { records: decode(await readJson(hist, `${id}.json`)) };
    } catch (error) {
      return { corrupt: { id, url, reason: reason(error) } };
    }
  }));
  const seen = new Set<string>();
  const log: T[] = [];
  const corrupt: CorruptHistoryPage[] = [];
  for (const result of results) {
    if (result.corrupt) corrupt.push(result.corrupt);
    else for (const record of result.records!) {
      if (!seen.has(record.rev)) { seen.add(record.rev); log.push(record); }
    }
  }
  return { log, corrupt };
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

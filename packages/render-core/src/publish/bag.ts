// "Deposit a copy" (Archie-039e) — wrap a published Archie tree as a BagIt bag (RFC 8493).
//
// WHY AN EXPORT ARRANGEMENT AND NOT IN-TREE FILES. A bag's defining structure is that ALL payload
// lives under `data/`. A published Archie tree is a WEB SITE: `index.html`, `{slug}/index.html`,
// `viewer.html`, relative links between them. Moving that under `data/` and putting `bagit.txt` at
// the root would either break every relative link or make the bag a second, differently-shaped tree
// maintained beside the first. So the bag is a SEPARATE ARRANGEMENT of the same bytes, produced on
// demand — the ticket's "Deposit a copy" charting. The published tree keeps its own root-level
// `manifest-sha256.txt` (PublishOptions.fixity) and stays a browsable site; the bag is what a
// repository's ingest workflow accepts.
//
// WHERE HASHING LIVES: PUBLISH TIME. The ticket asks the question explicitly, and this file is the
// answer. `publishLibrary` hashes each file as its bytes pass through the write pass — the only
// moment they are in hand on every sink (`ZipStreamFilesystem` streams media straight out and cannot
// be read back). This function therefore re-hashes NOTHING of the payload: it publishes into `data/`
// with fixity on and prefixes the resulting manifest lines. The only bytes hashed here are the four
// tag files, for the optional tag manifest. Doing it at export time instead would mean a second full
// read of every asset and tile, and would leave the published tree with no fixity at all.
//
// WRITE ORDER (render-core-data-integrity rule 1): payload → `bagit.txt` → `manifest-sha256.txt` →
// `bag-info.txt` → `tagmanifest-sha256.txt` LAST. The tag manifest is the bag's commit point: a bag
// torn before it has no tag manifest, and `bagit.py --validate` on a bag whose payload manifest is
// missing or short fails loudly rather than passing on a subset.

import type { Filesystem, FsDirectory } from "../fs/seam.js";
import { ZipFilesystem } from "../fs/zip.js";
import { sha256Hex } from "../fs/hashing.js";
import type { Library, MetadataEntry } from "../model/model.js";
import { publishLibrary, type LogLookup, type PublishOptions, type PublishResult } from "./site.js";
import { FIXITY_MANIFEST_NAME, formatFixityManifest, type FixityEntry } from "./fixity.js";

/** The bag's payload directory — fixed by RFC 8493 §2.1.2. */
export const BAG_PAYLOAD_DIR = "data";
export const BAGIT_TXT_NAME = "bagit.txt";
export const BAG_INFO_NAME = "bag-info.txt";
export const BAG_TAGMANIFEST_NAME = "tagmanifest-sha256.txt";

/** `bagit.txt`'s fixed content (RFC 8493 §2.1.1) — version and tag-file encoding, in that order. */
const BAGIT_TXT = "BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n";

export interface BagOptions {
  /**
   * `Bagging-Date` as `YYYY-MM-DD` (RFC 8493 §2.2.2 requires that form). INJECTED, never defaulted
   * to `Date.now()` inside this module: a bag's bytes are otherwise a pure function of the library,
   * and a test that asserts them must not depend on the wall clock. Product code passes
   * `new Date().toISOString().slice(0, 10)`.
   */
  baggingDate: string;
  /** Overrides {@link bagInfoFromLibrary}'s derivation of `Source-Organization`. */
  sourceOrganization?: string;
  /** Extra `bag-info.txt` fields, appended in the order given. Repeats are allowed by the RFC. */
  extraInfo?: { label: string; value: string }[];
}

export interface BagResult extends PublishResult {
  /** `Payload-Oxum` — `<octet count>.<stream count>` over everything under `data/`. */
  oxum: string;
  payloadFiles: number;
  payloadBytes: number;
}

/** A Filesystem rooted at a named subdirectory of another one — how the published tree lands under
 *  `data/` without `publishLibrary` knowing anything about bags. */
class SubtreeFilesystem implements Filesystem {
  constructor(
    private readonly base: Filesystem,
    private readonly name: string,
  ) {}
  async root(): Promise<FsDirectory> {
    return (await this.base.root()).getDirectory(this.name, { create: true });
  }
}

async function writeText(dir: FsDirectory, name: string, text: string): Promise<{ sha256: string; bytes: number }> {
  const file = await dir.getFile(name, { create: true });
  const w = await file.writable();
  await w.write(text);
  await w.close();
  const bytes = new TextEncoder().encode(text);
  return { sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
}

/** The first metadata entry whose dcterms property or display label matches `want` (case-insensitive
 *  on the local name), or undefined. */
function metadataValue(entries: MetadataEntry[] | undefined, want: string): string | undefined {
  const target = want.toLowerCase();
  return entries?.find((e) => {
    const local = e.property?.replace(/^dcterms:/i, "").toLowerCase();
    return local === target || e.label?.toLowerCase() === target;
  })?.value;
}

/**
 * Derive `bag-info.txt` fields from what the Library already records, so a depositor types nothing
 * twice. Sources, in the order the RFC's field meanings actually map onto this model:
 *
 * | field | from |
 * |---|---|
 * | `Source-Organization` | `dcterms:publisher`, else the attribution credit (`requiredStatement.value`) |
 * | `External-Identifier` | the publish base URL, else the Library id |
 * | `External-Description` | `library.summary` |
 * | `Contact-Name` | `dcterms:creator` |
 *
 * A field with no source is OMITTED. Every one of these is optional in RFC 8493 §2.2.2, and an empty
 * or invented value is worse than an absent one — it teaches an ingest workflow a wrong fact with the
 * bag's authority behind it (the same reasoning `citationCff` already applies to a creator-less CFF).
 */
export function bagInfoFromLibrary(
  library: Library,
  opts: { baggingDate: string; oxum: string; baseUrl?: string; sourceOrganization?: string; extra?: { label: string; value: string }[] },
): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = [];
  const org = opts.sourceOrganization ?? metadataValue(library.metadata, "publisher") ?? library.requiredStatement?.value;
  if (org) fields.push({ label: "Source-Organization", value: org });
  const contact = metadataValue(library.metadata, "creator");
  if (contact) fields.push({ label: "Contact-Name", value: contact });
  const ident = opts.baseUrl && opts.baseUrl !== "" ? opts.baseUrl : String(library.id);
  fields.push({ label: "External-Identifier", value: ident });
  if (library.title !== undefined) fields.push({ label: "Bag-Group-Identifier", value: library.title });
  if (library.summary !== undefined) fields.push({ label: "External-Description", value: library.summary });
  fields.push({ label: "Bagging-Date", value: opts.baggingDate });
  fields.push({ label: "Payload-Oxum", value: opts.oxum });
  fields.push({ label: "Bag-Software-Agent", value: "Archie (publishLibrary)" });
  for (const e of opts.extra ?? []) fields.push(e);
  return fields;
}

/** Render `bag-info.txt`. Values are single-line: RFC 8493 §2.2.2 allows folding a long value onto
 *  continuation lines, and a value containing a newline would otherwise forge a new field — so any
 *  CR/LF in a value collapses to a space rather than being emitted. */
export function formatBagInfo(fields: readonly { label: string; value: string }[]): string {
  return fields.map((f) => `${f.label}: ${f.value.replace(/[\r\n]+/g, " ").trim()}\n`).join("");
}

/**
 * Publish `library` into `target` as a BagIt bag: the whole published tree under `data/`, plus
 * `bagit.txt`, `manifest-sha256.txt`, `bag-info.txt` and `tagmanifest-sha256.txt`.
 *
 * `publishOpts.fixity` is forced on (the payload manifest IS the tree's manifest, prefixed) and
 * `publishOpts.incremental` is refused: a deposit is a full, self-contained copy, and a carried-forward
 * manifest line has no byte size, so `Payload-Oxum` could not be computed honestly.
 */
export async function writeBag(
  target: Filesystem,
  library: Library,
  getLog: LogLookup,
  publishOpts: PublishOptions,
  bagOpts: BagOptions,
): Promise<BagResult> {
  if (publishOpts.incremental !== undefined) {
    throw new Error("writeBag: a deposit bag is always a full publish — PublishOptions.incremental is not supported");
  }
  const root = await target.root();
  const result = await publishLibrary(new SubtreeFilesystem(target, BAG_PAYLOAD_DIR), library, getLog, {
    ...publishOpts,
    fixity: true,
  });
  const published = result.fixity ?? [];

  // The tree's own manifest and marker are payload files too — they sit under `data/`. They are the
  // only two the publish pass could not hash (it wrote the manifest, and wrote the marker after it),
  // so they are hashed here and nowhere else. Everything else is re-used, not re-read.
  const payloadDir = await root.getDirectory(BAG_PAYLOAD_DIR);
  const selfHashed: { path: string; sha256: string; bytes: number }[] = [];
  for (const name of [FIXITY_MANIFEST_NAME, "archie.json"]) {
    const bytes = new Uint8Array(await (await payloadDir.getFile(name)).readable());
    selfHashed.push({ path: `${BAG_PAYLOAD_DIR}/${name}`, sha256: await sha256Hex(bytes), bytes: bytes.byteLength });
  }

  const payload: FixityEntry[] = [];
  let payloadBytes = 0;
  for (const e of [...published.map((p) => ({ ...p, path: `${BAG_PAYLOAD_DIR}/${p.path}` })), ...selfHashed]) {
    if (e.bytes === null) {
      // Unreachable while `incremental` is refused above; asserted rather than silently producing an
      // Oxum that under-counts, which `bagit.py --validate` would report as a corrupt bag.
      throw new Error(`writeBag: no byte size for ${e.path} — a carried-forward manifest line cannot be deposited`);
    }
    payloadBytes += e.bytes;
    payload.push({ path: e.path, sha256: e.sha256 });
  }
  const oxum = `${payloadBytes}.${payload.length}`;

  // Tag files, in commit order. Each is hashed as it is written; the tag manifest closes the bag.
  const tags: FixityEntry[] = [];
  const record = async (name: string, text: string): Promise<void> => {
    const { sha256 } = await writeText(root, name, text);
    tags.push({ path: name, sha256 });
  };
  await record(BAGIT_TXT_NAME, BAGIT_TXT);
  await record(FIXITY_MANIFEST_NAME, formatFixityManifest(payload));
  await record(
    BAG_INFO_NAME,
    formatBagInfo(
      bagInfoFromLibrary(library, {
        baggingDate: bagOpts.baggingDate,
        oxum,
        ...(publishOpts.baseUrl !== undefined ? { baseUrl: publishOpts.baseUrl } : {}),
        ...(bagOpts.sourceOrganization !== undefined ? { sourceOrganization: bagOpts.sourceOrganization } : {}),
        ...(bagOpts.extraInfo !== undefined ? { extra: bagOpts.extraInfo } : {}),
      }),
    ),
  );
  await writeText(root, BAG_TAGMANIFEST_NAME, formatFixityManifest(tags));

  return { ...result, oxum, payloadFiles: payload.length, payloadBytes };
}

/** Assemble a deposit bag as an in-memory `.zip` — the "Deposit a copy" download. */
export async function libraryToBagZip(
  library: Library,
  getLog: LogLookup,
  publishOpts: PublishOptions,
  bagOpts: BagOptions,
): Promise<{ zip: Uint8Array } & BagResult> {
  const fs = new ZipFilesystem();
  const result = await writeBag(fs, library, getLog, publishOpts, bagOpts);
  return { zip: fs.toZip(), ...result };
}

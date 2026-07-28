// The fixity manifest (Archie-039e) — `manifest-sha256.txt` in BagIt (RFC 8493 §2.1.3) line format,
// so the file a published tree carries IS the file a BagIt bag needs, modulo a `data/` prefix.
//
// FORMAT (RFC 8493 §2.1.3): one entry per line, `checksum` then whitespace then `filename`. The
// checksum is lowercase hex. The filename is `/`-separated and relative to the manifest's own
// directory. A filename containing LF, CR or `%` MUST percent-encode those three characters as
// `%0A`, `%0D`, `%25` — nothing else is encoded, and nothing else may be.
//
// Two spaces are used as the separator: that is what `sha256sum`, `bagit-python` and every reference
// implementation emit, and RFC 8493 permits any whitespace run.
//
// ADR-0020 RELATIONSHIP — this AGREES with that ADR, it does not reverse it. ADR-0020 rejected L2/L3
// integrity: a hash or signature stamped ON the `archie.json` marker, sealing the archive. That was
// rejected because crypto-sealing and the hand-editability requirement are mutually exclusive, and
// because a signature needs key distribution this project has no server for. A SEPARATE manifest file
// makes neither claim:
//   • it is not on the marker, so the marker stays what ADR-0020 made it — a validation gate;
//   • it authenticates NOTHING (an attacker who can rewrite a payload file can rewrite this file
//     beside it — same forgery cost as the marker itself, stated plainly in ADR-0020);
//   • it catches ACCIDENTS — bit rot, a truncated transfer, a partial rsync, a half-copied USB stick,
//     a file a static host silently dropped — which is the failure mode a depositing institution
//     actually asks about;
//   • a legitimate hand-edit invalidates one line, not the artifact. Regenerating is a republish, and
//     the mismatch in the meantime is INFORMATION ("you changed this file"), not a lock.

/** The tree-root file a published Archie tree carries its payload checksums in. */
export const FIXITY_MANIFEST_NAME = "manifest-sha256.txt";

/** One manifest line: a lowercase-hex SHA-256 and the path it covers. */
export interface FixityEntry {
  path: string;
  sha256: string;
}

/** Percent-encode the three characters RFC 8493 §2.1.3 reserves in a manifest filename, and only
 *  those. `%` goes first or the encoding of the other two would be re-encoded. */
export function encodeManifestPath(path: string): string {
  return path.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Inverse of {@link encodeManifestPath}. Case-insensitive on the hex digits, as RFC 3986 requires
 *  of any percent-encoding consumer. */
export function decodeManifestPath(path: string): string {
  return path.replace(/%(0A|0D|25)/gi, (_, hex: string) => {
    const h = hex.toUpperCase();
    return h === "0A" ? "\n" : h === "0D" ? "\r" : "%";
  });
}

/**
 * Render manifest lines. SORTED BY PATH — RFC 8493 does not require an order, and determinism does:
 * publish here is contracted to be a byte-stable projection (see `PublishOptions.generation`), so an
 * unsorted manifest would make every republish a spurious diff and every `computeDelta` report this
 * one file changed.
 */
export function formatFixityManifest(entries: readonly FixityEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sorted.map((e) => `${e.sha256}  ${encodeManifestPath(e.path)}\n`).join("");
}

/**
 * Parse manifest lines. TOLERANT PER ITEM, in the shape render-core-data-integrity rule 2 asks for:
 * a blank line is skipped and a line that is not `<hex> <path>` is skipped rather than throwing, so
 * one malformed line in a carried-forward manifest cannot present as "this tree has no fixity at
 * all". A caller that needs to know reconciles the count it got against the file it read.
 */
export function parseFixityManifest(text: string): FixityEntry[] {
  const out: FixityEntry[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") continue;
    const m = /^([0-9a-fA-F]{64})[ \t]+(.+)$/.exec(line);
    if (!m) continue;
    out.push({ sha256: m[1]!.toLowerCase(), path: decodeManifestPath(m[2]!) });
  }
  return out;
}

/**
 * Merge the files written in THIS publish pass with the manifest a previous pass left behind — the
 * whole of the incremental-correctness design, in one function.
 *
 * An incremental publish (`PublishOptions.incremental`) deliberately does not rewrite an out-of-scope
 * exhibit's bytes, and deliberately does not re-write the ~1 MB `_viewer/` bundle. Those files are
 * still IN the tree, so a manifest listing only what this pass wrote would be missing most of the
 * library and would fail its own verifier — the hazard the research note flagged as the reason this
 * has to be designed in from the first commit rather than retrofitted.
 *
 * The carry-forward is sound because of one contract publish already holds: **publish never removes a
 * file except through `removedExhibits` / `removedObjects`**, and those go through
 * `FsDirectory.remove`, which `HashingFilesystem` observes. So:
 *   • a path written this pass  → this pass's hash wins (bytes may have changed);
 *   • a path removed this pass  → dropped, along with everything under it if it was a directory;
 *   • anything else in `prior`  → still on disk, unchanged, so its prior hash is still true.
 *
 * `exclude` drops the manifest's own name and the `archie.json` marker: the manifest cannot list
 * itself, and the marker is written AFTER it (render-core-data-integrity rule 1 — the marker is the
 * commit point, so nothing may be written after it, including a hash of it).
 */
export function mergeFixity(
  prior: readonly FixityEntry[],
  written: readonly FixityEntry[],
  removedPrefixes: readonly string[],
  exclude: readonly string[],
): FixityEntry[] {
  const removed = (p: string): boolean =>
    removedPrefixes.some((r) => p === r || p.startsWith(`${r}/`));
  const merged = new Map<string, string>();
  for (const e of prior) {
    if (removed(e.path)) continue;
    merged.set(e.path, e.sha256);
  }
  for (const e of written) merged.set(e.path, e.sha256);
  for (const name of exclude) merged.delete(name);
  return [...merged].map(([path, sha256]) => ({ path, sha256 })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// Pre-push preflight over a BUILT publish tree, plus the rights-coverage report (Archie-0cd6 /
// Archie-8772). Pure and Filesystem-only, so the same walk serves every destination adapter and can
// be tested without a network.
//
// THE SEVERITY MODEL, decided once here rather than three times in three panels — which is exactly
// what the batch:publish-gates note warns against. The question a finding must answer is not "how
// bad does this look" but WHO CAN ACT AND WHEN:
//
//   block  — the published site is CERTAINLY broken, and publishing cannot fix it. Refusing costs the
//            author one round trip; not refusing costs them a broken public site they may not notice
//            for weeks. Only one finding qualifies today (LFS pointers) and that is deliberate:
//            every hard stop spends the author's trust, so the bar is "certainly", not "probably".
//   warn   — the site will publish and probably degrade. The author is the only one who can judge
//            whether it matters for THIS library, so state it plainly and let them through.
//   report — nothing is wrong; this is editorial information the author owns (rights coverage). It
//            must never gate, because "which objects carry a licence" is a curatorial decision, not
//            a correctness one, and a tool that blocks on it is asserting an editorial policy it has
//            no standing to assert.
//
// The existing Publish dialog already renders warn-shaped advisories (torn logs, missing assets,
// incomplete canvases). These findings join that surface; they do not get a panel of their own.

import type { FsDirectory } from "../fs/seam.js";
import type { Library } from "../model/model.js";

/** What the author can do about a finding, and when. See the severity model above. */
export type PreflightSeverity = "block" | "warn" | "report";

export interface PreflightFinding {
  code: "lfs-pointer" | "tree-size" | "no-404" | "rights-gap";
  severity: PreflightSeverity;
  /** How many things this finding covers (files, exhibits, objects). */
  count: number;
  /** Up to a handful of examples — the dialog shows the first few and counts the rest. */
  examples: string[];
  /** Bytes, for `tree-size` only. */
  bytes?: number;
}

/**
 * GitHub's soft limit for a repository. Not enforced at push time — a repo over it keeps working and
 * the owner gets an email — so this is a WARN, not a block. Publishing a 1.2 GB library successfully
 * and then being told by GitHub is a worse experience than being told here first.
 */
export const REPO_SIZE_SOFT_LIMIT_BYTES = 1_000_000_000;

/**
 * The Git LFS pointer magic. An LFS-managed file that was checked out without the smudge filter is a
 * ~130-byte TEXT file beginning with this line. GitHub Pages serves the pointer verbatim, so the
 * published site ships that text where a JPEG belongs — every image broken, and nothing in the
 * publish path errors. This is the one finding that blocks.
 */
const LFS_MAGIC = "version https://git-lfs.github.com/spec/v1";

/** A pointer is tiny by construction; reading more than this to identify one is waste. */
const LFS_SNIFF_BYTES = 200;

/** Bytes look like an LFS pointer: the exact magic line at offset 0. */
export function looksLikeLfsPointer(bytes: Uint8Array): boolean {
  if (bytes.byteLength < LFS_MAGIC.length || bytes.byteLength > 1024) return false; // a real asset is bigger
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, LFS_SNIFF_BYTES));
  return head.startsWith(LFS_MAGIC);
}

const MAX_EXAMPLES = 5;

/**
 * Walk a built tree: total size, LFS pointers, and whether a 404 page exists.
 *
 * NOT CHECKED, deliberately: base-path shape. Whether a tree's absolute asset URLs match the base it
 * is being published to is exactly the question Archie-3504 ("decide how publish learns its
 * destination URL") has not answered yet, and a check written against a guess at that answer would
 * have to be rewritten with it. The ticket's own instruction — "start with LFS alone as the hard
 * block, highest damage-to-effort" — is the shape this follows.
 */
export async function preflightTree(
  root: FsDirectory,
  /** Overridable so the size warn is testable without writing a gigabyte. Production callers omit it. */
  sizeLimitBytes: number = REPO_SIZE_SOFT_LIMIT_BYTES,
): Promise<PreflightFinding[]> {
  const lfs: string[] = [];
  let lfsCount = 0;
  let totalBytes = 0;
  let has404 = false;

  const walk = async (dir: FsDirectory, prefix: string): Promise<void> => {
    for await (const entry of dir.entries()) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.kind === "directory") {
        await walk(await dir.getDirectory(entry.name), path);
        continue;
      }
      if (path === "404.html") has404 = true;
      const buf = await (await dir.getFile(entry.name)).readable();
      totalBytes += buf.byteLength;
      // Only a small file can be a pointer, so the decode is bounded and cheap.
      if (buf.byteLength <= 1024 && looksLikeLfsPointer(new Uint8Array(buf))) {
        lfsCount++;
        if (lfs.length < MAX_EXAMPLES) lfs.push(path);
      }
    }
  };
  await walk(root, "");

  const findings: PreflightFinding[] = [];
  if (lfsCount > 0) findings.push({ code: "lfs-pointer", severity: "block", count: lfsCount, examples: lfs });
  if (totalBytes > sizeLimitBytes) {
    findings.push({ code: "tree-size", severity: "warn", count: 1, examples: [], bytes: totalBytes });
  }
  // A missing 404.html only costs a reader who mistypes a deep link the friendly page; the site works.
  if (!has404) findings.push({ code: "no-404", severity: "warn", count: 1, examples: [] });
  return findings;
}

/** One level that carries neither a licence nor a credit. */
export interface RightsGap {
  kind: "library" | "exhibit" | "object";
  /** `slug` for an exhibit, `slug/label` for an object, the title for the library. */
  where: string;
}

/**
 * Which levels carry no `rights` URI and no `requiredStatement` (Archie-8772).
 *
 * KEYED READ ONLY, per `.claude/rules/metadata-rights-keyed-writebacks.md`: this looks at the two
 * rights properties and never at `metadata`. A level with Dublin Core entries but no licence still
 * has a rights gap — descriptive metadata is not a rights statement, and treating it as one would
 * report coverage this library does not have.
 *
 * A level is covered by EITHER field: a credit with no licence is a real (if partial) rights
 * statement, and so is a licence with no credit. Requiring both would report a gap on libraries that
 * made a deliberate choice.
 */
export function rightsCoverage(library: Library): RightsGap[] {
  const gaps: RightsGap[] = [];
  const bare = (r: { rights?: string; requiredStatement?: { value: string } }): boolean =>
    !r.rights && !r.requiredStatement?.value?.trim();

  if (bare(library)) gaps.push({ kind: "library", where: library.title ?? "This library" });
  for (const ex of library.exhibits) {
    if (bare(ex)) gaps.push({ kind: "exhibit", where: ex.slug });
    for (const obj of ex.objects) {
      if (bare(obj)) gaps.push({ kind: "object", where: `${ex.slug}/${obj.label}` });
    }
  }
  return gaps;
}

/** The rights gaps as a `report` finding, or nothing when coverage is complete. */
export function rightsCoverageFinding(library: Library): PreflightFinding | null {
  const gaps = rightsCoverage(library);
  if (gaps.length === 0) return null;
  return {
    code: "rights-gap",
    severity: "report",
    count: gaps.length,
    examples: gaps.slice(0, MAX_EXAMPLES).map((g) => g.where),
  };
}

/** Does anything in this set refuse the publish? The dialog's gate, in one place. */
export const blocksPublish = (findings: readonly PreflightFinding[]): boolean =>
  findings.some((f) => f.severity === "block");

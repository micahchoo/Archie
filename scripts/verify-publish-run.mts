// Archie-fde8 — the real checks behind scripts/verify-publish.mjs. Run via `vite-node` (see that
// file's header for why); never invoke this directly with plain `node`, it will fail to resolve
// `@render/core`.
//
// Reads the published tree back through the SAME two real byte sources the apps use — an http(s)
// base through render-core's `HttpFilesystem` (the fourth Filesystem backend, read-only; exactly
// what `<archie-viewer src=…>`'s `openLibraryFromTree` and apps/viewer's hosted mode use), or a local
// directory through a small node:fs-backed reader (render-core has no Filesystem backend targeting a
// plain node:fs directory — every existing backend is FSA/OPFS/Zip/Tauri/Memory/Http, none of which
// fit "a folder on the CI runner's disk" — so this one function is the unavoidable hand roll; it
// mirrors `fsJsonSource`'s absent-vs-failed contract exactly). Both sources feed the REAL
// `readExhibitTree` / `assertArchieTreeMarker` — this script exercises the identical read path the
// viewer does, not a re-implementation that could silently drift from it.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SCHEMA_VERSION,
  readExhibitTree,
  HttpFilesystem,
  fsJsonSource,
  FailedReadError,
  isNotFound,
  FIXITY_MANIFEST_NAME,
  parseFixityManifest,
  sha256Hex,
  type JsonSource,
  type Filesystem,
  type ExhibitsJson,
  type ArchieMarker,
} from "@render/core";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const target = argv[0];
if (!target) {
  console.error("usage: verify-publish.mjs <baseUrl-or-dir> [--generation <id>]");
  process.exit(2);
}
const genIdx = argv.indexOf("--generation");
const expectedGeneration = genIdx !== -1 ? argv[genIdx + 1] : undefined;

const isUrl = /^https?:\/\//i.test(target);
const base = isUrl ? (target.endsWith("/") ? target : `${target}/`) : target;

console.log(`verify-publish: checking ${isUrl ? "http base" : "directory"} ${base}\n`);

// ---------------------------------------------------------------------------
// Reporting — per-item tolerant: every check runs and prints, PASS or FAIL, with its SUBJECT (a
// count/value), never just a verdict. Nothing here stops at the first failure.
// ---------------------------------------------------------------------------
interface CheckResult {
  pass: boolean;
  label: string;
  detail: string;
}
const results: CheckResult[] = [];
function check(pass: boolean, label: string, detail: string): boolean {
  results.push({ pass, label, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  return pass;
}

// ---------------------------------------------------------------------------
// Byte source: ONE `readRaw(path) -> bytes | null` (null = absent, throw = failed — the
// render-core-data-integrity contract #2 absent-vs-failed rule, applied uniformly to both modes) that
// both the JsonSource and the raw-text reads (index.html, the archie.demo scan) share.
// ---------------------------------------------------------------------------
let httpFs: Filesystem | undefined;
let readRaw: (path: string) => Promise<Uint8Array | null>;

if (isUrl) {
  // The REAL backend — same class the embed/viewer use for a hosted tree.
  httpFs = new HttpFilesystem(base);
  readRaw = async (path: string): Promise<Uint8Array | null> => {
    const parts = path.split("/");
    let dir = await httpFs!.root();
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!);
    const file = await dir.getFile(parts[parts.length - 1]!);
    try {
      return new Uint8Array(await file.readable());
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  };
} else {
  // The hand-rolled half (see header): a plain node:fs directory walk, ENOENT -> absent.
  readRaw = async (path: string): Promise<Uint8Array | null> => {
    try {
      return new Uint8Array(await readFile(join(base, ...path.split("/"))));
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw e;
    }
  };
}

async function readRawText(path: string): Promise<string | null> {
  const bytes = await readRaw(path);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

/** Per-item-tolerant wrapper: a transport fault (offline host, timeout, a torn body) on ANY one
 *  read must not abort the rest of the run — every remaining check still executes and prints. Used
 *  at every `readRawText` call site below instead of a bare `await`. */
async function tryReadText(path: string): Promise<{ ok: true; text: string | null } | { ok: false; error: unknown }> {
  try {
    return { ok: true, text: await readRawText(path) };
  } catch (error) {
    return { ok: false, error };
  }
}

/** A JsonSource over `readRaw`, matching `fsJsonSource`'s contract (absent -> null on getOptional,
 *  throw on get; a present-but-torn file -> FailedReadError, never silently "no data"). Used ONLY for
 *  local-dir mode; the http mode below uses render-core's REAL `fsJsonSource(HttpFilesystem)` — the
 *  literal code the viewer runs — instead of this derived version. */
function jsonSourceFromRaw(raw: (path: string) => Promise<Uint8Array | null>): JsonSource {
  const parse = <T,>(bytes: Uint8Array, path: string): T => {
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch (e) {
      throw new FailedReadError(path, e);
    }
  };
  return {
    get: async <T,>(path: string): Promise<T> => {
      const bytes = await raw(path);
      if (bytes === null) throw new Error(`no such file: ${path}`);
      return parse<T>(bytes, path);
    },
    getOptional: async <T,>(path: string): Promise<T | null> => {
      let bytes: Uint8Array | null;
      try {
        bytes = await raw(path);
      } catch (e) {
        if (e instanceof FailedReadError) throw e;
        throw new FailedReadError(path, e);
      }
      return bytes === null ? null : parse<T>(bytes, path);
    },
  };
}

const src: JsonSource = isUrl ? fsJsonSource(httpFs!) : jsonSourceFromRaw(readRaw);

// ---------------------------------------------------------------------------
// 1. Marker present + valid (ADR-0020).
//
// NOT `assertArchieTreeMarker` (the DESIGN brief's "validateArchieMarker" is the zip-path validator;
// the tree-path twin is this one) — deliberately not delegated to it either, because that function is
// LENIENT-ON-ABSENT (a tree need not ship a marker at all; the read.ts doc comment: "some static
// hosts strip dotted files"). That's the right policy for OPENING an arbitrary tree, and the wrong
// one for VERIFYING a tree this repo's own `publishLibrary` just wrote — render-core-data-integrity
// rule 1 states `archie.json` is written LAST as the commit point, so a fresh publish must always
// carry it; its absence here is a failure to report, not to tolerate. So: read it directly with the
// same `src.getOptional` contract, and apply the SAME field checks (format / SCHEMA_VERSION) by hand.
// ---------------------------------------------------------------------------
let marker: Partial<ArchieMarker> | null = null;
let markerReadFailed: unknown;
try {
  marker = await src.getOptional<Partial<ArchieMarker>>("archie.json");
} catch (e) {
  markerReadFailed = e;
}

if (markerReadFailed !== undefined) {
  check(
    false,
    "marker: archie.json reads cleanly",
    String(markerReadFailed instanceof Error ? markerReadFailed.message : markerReadFailed),
  );
} else if (marker === null) {
  check(
    false,
    "marker: archie.json is present",
    "ABSENT — publishLibrary writes archie.json LAST as the commit point (render-core-data-integrity rule 1); a fresh publish must carry it",
  );
} else {
  check(
    marker.format === "archie-library" && marker.version === SCHEMA_VERSION,
    "marker: archie.json is a valid current-schema Archie marker",
    `format=${String(marker.format)} version=${String(marker.version)} (want format=archie-library version=${SCHEMA_VERSION}) generation=${marker.generation ?? "<absent>"}`,
  );
}

// ---------------------------------------------------------------------------
// 2. generation matches — only ASSERTED when --generation was passed (the value the publish step
//    itself reported); otherwise reported so the run isn't silent about it.
// ---------------------------------------------------------------------------
if (expectedGeneration !== undefined) {
  check(
    marker?.generation === expectedGeneration,
    "marker: generation matches the publish step's own report",
    `archie.json generation=${marker?.generation ?? "<absent>"} expected=${expectedGeneration}`,
  );
} else {
  console.log(
    `SKIP  marker: generation matches — no --generation given; observed generation=${marker?.generation ?? "<absent>"}`,
  );
}

// ---------------------------------------------------------------------------
// 3. Every slug in the gallery (exhibits.json) resolves.
// ---------------------------------------------------------------------------
let gallery: ExhibitsJson | undefined;
let galleryReadError: unknown;
try {
  gallery = await src.get<ExhibitsJson>("exhibits.json");
} catch (e) {
  galleryReadError = e;
}
const slugs = gallery?.exhibits.map((e) => e.slug) ?? [];
check(
  gallery !== undefined,
  "gallery: exhibits.json parses",
  gallery === undefined
    ? String(galleryReadError instanceof Error ? galleryReadError.message : galleryReadError)
    : `library.title=${gallery.library.title ?? "<untitled>"}, ${slugs.length} exhibit(s): ${slugs.join(", ") || "<none>"}`,
);

// ---------------------------------------------------------------------------
// 4/5. Per slug: manifest + annotation pages parse (readExhibitTree — the REAL reader, so this is
// exactly what the viewer does on open), total annotation heads, index.html non-empty + carries the
// exhibit title.
// ---------------------------------------------------------------------------
const demoScanFiles: string[] = ["archie.json", "exhibits.json", "index.html"];
let libraryTotalHeads = 0;

for (const slug of slugs) {
  demoScanFiles.push(`${slug}/manifest.json`, `${slug}/index.html`);

  let exhibit;
  try {
    exhibit = await readExhibitTree(src, slug);
  } catch (e) {
    check(false, `slug ${slug}: manifest.json + annotations parse (readExhibitTree)`, String(e instanceof Error ? e.message : e));
    continue;
  }

  check(
    exhibit.incomplete !== true,
    `slug ${slug}: manifest + annotation pages parse (readExhibitTree)`,
    exhibit.incomplete
      ? "flagged INCOMPLETE — an authored layer (annotations/readings) FAILED to load (not merely absent — render-core-data-integrity rule 2)"
      : `${exhibit.objects.length} object(s), ${exhibit.readings.length} reading(s)`,
  );

  const baseHeads = exhibit.objects.reduce((n, o) => n + (exhibit.annotationsByObject[o.id]?.length ?? 0), 0);
  const readingHeads = exhibit.objects.reduce(
    (n, o) => n + exhibit.readings.reduce((m, r) => m + (exhibit.readingAnnotationsByObject[o.id]?.[r.id]?.length ?? 0), 0),
    0,
  );
  const slugHeads = baseHeads + readingHeads;
  libraryTotalHeads += slugHeads;
  check(true, `slug ${slug}: annotation heads present`, `${baseHeads} base + ${readingHeads} reading-scoped = ${slugHeads} total`);

  const htmlRead = await tryReadText(`${slug}/index.html`);
  const titleTag = `<h1>${escHtml(exhibit.title)}</h1>`;
  check(
    htmlRead.ok && htmlRead.text !== null && htmlRead.text.length > 0 && htmlRead.text.includes(titleTag),
    `slug ${slug}: index.html non-empty and carries the exhibit title`,
    !htmlRead.ok
      ? `read FAILED — ${String(htmlRead.error instanceof Error ? htmlRead.error.message : htmlRead.error)}`
      : htmlRead.text === null
        ? "index.html is ABSENT"
        : `${htmlRead.text.length} bytes; title tag ${htmlRead.text.includes(titleTag) ? "present" : `MISSING (looked for ${JSON.stringify(titleTag)})`}`,
  );
}
check(true, "library: total annotation heads across all exhibits", String(libraryTotalHeads));

// ---------------------------------------------------------------------------
// 6. Library landing page (root index.html) non-empty + carries the library title.
// ---------------------------------------------------------------------------
{
  const htmlRead = await tryReadText("index.html");
  const libTitle = gallery?.library.title ?? "Library";
  const titleTag = `<h1>${escHtml(libTitle)}</h1>`;
  check(
    htmlRead.ok && htmlRead.text !== null && htmlRead.text.length > 0 && htmlRead.text.includes(titleTag),
    "library: root index.html non-empty and carries the library title",
    !htmlRead.ok
      ? `read FAILED — ${String(htmlRead.error instanceof Error ? htmlRead.error.message : htmlRead.error)}`
      : htmlRead.text === null
        ? "index.html is ABSENT"
        : `${htmlRead.text.length} bytes; title tag ${htmlRead.text.includes(titleTag) ? "present" : `MISSING (looked for ${JSON.stringify(titleTag)})`}`,
  );
}

// ---------------------------------------------------------------------------
// 7. No occurrence of the authoring namespace (`archie.demo`, WORKING_IRI_BASE) on the FOUR
//    ABSOLUTE-URL SURFACES — the regression net for the base-URL fix (Archie-3504/19c5). Archie-3504's
//    DECIDED note names exactly four fields that carry an ABSOLUTE url in a relative-first tree:
//    og:url, JSON-LD url, IIIF canvas ids, and the canonical link. Every one of those lives in either
//    a slug's manifest.json (canvas ids) or an index.html (og:url / JSON-LD / canonical), so that is
//    what this scans: the marker, the gallery, every exhibit's manifest + static page, and the
//    library landing page.
//
//    THE LABEL SAYS THAT, AND USED NOT TO (Archie-fde8, corrected 2026-07-27). It read "no
//    occurrences anywhere in the served tree" while the detail beside it admitted a 5-file scan of a
//    438-file tree — a check whose name claimed the whole artifact and whose measurement covered
//    1%. The `8d3d` agent then measured **4 real `archie.demo` occurrences** the scan never saw, in
//    an annotation page: a TOMBSTONE's `target.source`, which `rebaseCanvasId` deliberately does not
//    re-mint (its contract is a provable match against this exhibit's own canvases, never a fuzzy
//    one). See ledgers/PUBLISH-test-republish-2026-07-27.md.
//
//    So the label is narrowed rather than the scan widened, and that is the substantive choice:
//    widening it would report those tombstones as leaks, which they are not — they are authored
//    history, correctly preserved verbatim. A wider scan therefore needs an allowlist for
//    `target.source` on tombstoned records before it means anything, and an allowlist is a claim
//    about which absolute URLs are legitimate that nobody has made yet. Until someone does, a check
//    that states its real scope is worth more than one that overstates it: see
//    .claude/rules/post-review-fixes-are-unreviewed.md on a probe answering a narrower question than
//    its name implies, and reporting the narrow answer with the confidence of the broad one.
// ---------------------------------------------------------------------------
const NEEDLE = "archie.demo";
let demoHits = 0;
for (const path of demoScanFiles) {
  const textRead = await tryReadText(path);
  if (!textRead.ok) {
    // A transport FAILURE (not absence) means the scan can't vouch for this file — that's a gap,
    // not a pass, so it counts against the summary rather than being silently skipped.
    check(false, `archie.demo scan: ${path}`, `could not be read — ${String(textRead.error instanceof Error ? textRead.error.message : textRead.error)}`);
    continue;
  }
  if (textRead.text === null) continue; // absence is already reported by the checks above; not this scan's job
  const n = countOccurrences(textRead.text, NEEDLE);
  if (n > 0) {
    demoHits += n;
    check(false, `archie.demo scan: ${path}`, `${n} occurrence(s) of "${NEEDLE}" — the authoring namespace leaked into an absolute-URL surface`);
  }
}
check(
  demoHits === 0,
  "archie.demo scan: the authoring namespace is absent from the four ABSOLUTE-URL surfaces (canonical, og:url, JSON-LD url, IIIF canvas ids)",
  `scanned ${demoScanFiles.length} file(s) — the marker, the gallery, and each exhibit's manifest.json + index.html plus the landing page; ${demoHits} total occurrence(s). NOT a whole-tree scan: annotation pages are deliberately out of scope (a tombstone's target.source keeps its authored origin verbatim)`,
);

// ---------------------------------------------------------------------------
// 8. FIXITY (Archie-039e) — re-hash every file `manifest-sha256.txt` lists and compare. This is the
//    one check here that reads the tree's BYTES rather than its structure, and it is the reason the
//    manifest exists: "publish wrote these bytes" and "these bytes are still here" are different
//    claims, and only a re-hash settles the second. Absent manifest = the tree was published without
//    PublishOptions.fixity; reported as a SKIP with the reason, never as a pass.
//
//    Per-file tolerant like everything above: a missing or mismatched file is one FAIL line naming
//    that path, and the sweep continues, so one truncated tile does not hide a second.
// ---------------------------------------------------------------------------
{
  const manifestRead = await tryReadText(FIXITY_MANIFEST_NAME);
  if (!manifestRead.ok) {
    check(false, `fixity: ${FIXITY_MANIFEST_NAME} reads cleanly`, String(manifestRead.error instanceof Error ? manifestRead.error.message : manifestRead.error));
  } else if (manifestRead.text === null) {
    console.log(`SKIP  fixity: no ${FIXITY_MANIFEST_NAME} — this tree was published without PublishOptions.fixity, so there is nothing to verify`);
  } else {
    const entries = parseFixityManifest(manifestRead.text);
    const lines = manifestRead.text.split("\n").filter((l) => l.trim() !== "").length;
    // Reconcile the parsed count against the raw line count: a manifest whose lines silently failed
    // to parse would otherwise verify a SUBSET and report a clean pass over it.
    check(
      entries.length === lines,
      `fixity: every line of ${FIXITY_MANIFEST_NAME} parsed`,
      `${entries.length} entr(ies) parsed from ${lines} non-blank line(s)`,
    );

    let verified = 0;
    const bad: string[] = [];
    for (const entry of entries) {
      let bytes: Uint8Array | null;
      try {
        bytes = await readRaw(entry.path);
      } catch (e) {
        bad.push(entry.path);
        check(false, `fixity: ${entry.path}`, `read FAILED — ${String(e instanceof Error ? e.message : e)}`);
        continue;
      }
      if (bytes === null) {
        bad.push(entry.path);
        check(false, `fixity: ${entry.path}`, "listed in the manifest but ABSENT from the tree");
        continue;
      }
      const actual = await sha256Hex(bytes as Uint8Array<ArrayBuffer>);
      if (actual !== entry.sha256) {
        bad.push(entry.path);
        check(false, `fixity: ${entry.path}`, `sha256 MISMATCH — manifest ${entry.sha256}, served bytes ${actual} (${bytes.byteLength} bytes)`);
        continue;
      }
      verified++;
    }
    check(
      bad.length === 0 && entries.length > 0,
      "fixity: every listed file re-hashes to its manifest checksum",
      `${verified}/${entries.length} verified, ${bad.length} bad${bad.length > 0 ? `: ${bad.join(", ")}` : ""}`,
    );
  }
}

// ---------------------------------------------------------------------------
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log(`${failed.length} FAILURE(S):`);
  for (const f of failed) console.log(`  FAIL  ${f.label} — ${f.detail}`);
  process.exit(1);
}
process.exit(0);

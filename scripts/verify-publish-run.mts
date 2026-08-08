// Archie-fde8 — the real checks behind scripts/verify-publish.mjs. Run via `vite-node` (see that
// file's header for why); never invoke this directly with plain `node`, it will fail to resolve
// `@render/core`.
//
// Reads the published tree back through the SAME two real byte sources the apps use — an http(s)
// base through render-core's `HttpFilesystem` (read-only; exactly what `<archie-viewer src=…>`'s
// `openLibraryFromTree` and apps/viewer's hosted mode use), or a local directory through render-core's
// `NodeFilesystem` (the node:fs directory backend — the seam's answer to "a folder on the CI
// runner's disk"). Both modes compose the REAL `fsJsonSource` over their backend and feed the REAL
// `readExhibitTree` / `assertArchieTreeMarker` — this script exercises the identical read path the
// viewer does, not a re-implementation that could silently drift from it.
import {
  SCHEMA_VERSION,
  assertArchieTreeMarker,
  readExhibitTree,
  HttpFilesystem,
  fsJsonSource,
  tryResolveFile,
  isNotFound,
  FIXITY_MANIFEST_NAME,
  parseFixityManifest,
  sha256Hex,
  type JsonSource,
  type Filesystem,
  type ExhibitsJson,
  type ArchieMarker,
} from "@render/core";
import { NodeFilesystem } from "@render/core/node";
import { createChecklist } from "./lib/checklist.mjs";

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
// count/value), never just a verdict. Nothing here stops at the first failure. The loop is owned by
// scripts/lib/checklist.mjs; this gate supplies only its tail: the FAIL re-list + the 0/1 exit.
// ---------------------------------------------------------------------------
const { check, finish } = createChecklist({
  onExit: (ctx: { passed: number; total: number; failed: { label: string; detail: string }[] }) => {
    console.log(`\n${ctx.passed}/${ctx.total} checks passed`);
    if (ctx.failed.length > 0) {
      console.log(`${ctx.failed.length} FAILURE(S):`);
      for (const f of ctx.failed) console.log(`  FAIL  ${f.label} — ${f.detail}`);
      process.exit(1);
    }
    process.exit(0);
  },
});

// ---------------------------------------------------------------------------
// Byte source: ONE `readRaw(path) -> bytes | null` (null = absent, throw = failed — the
// render-core-data-integrity contract #2 absent-vs-failed rule, applied uniformly to both modes) that
// both the JsonSource and the raw-text reads (index.html, the archie.demo scan, the fixity sweep)
// share. Both modes walk their backend through the seam, so absence classifies by the canonical
// `isNotFound` in exactly one place.
// ---------------------------------------------------------------------------
let httpFs: Filesystem | undefined;
let nodeFs: NodeFilesystem | undefined;
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
  // Local-dir mode: the REAL node:fs directory backend, driven the same way the http mode drives
  // its backend. JSON reads compose `fsJsonSource(nodeFs)` below — the literal code the viewer
  // runs; these raw byte reads (index.html, the fixity sweep) walk the same seam instance rather
  // than a second node:fs path, so absent-vs-failed is classified by the one `isNotFound`.
  nodeFs = new NodeFilesystem(base);
  readRaw = async (path: string): Promise<Uint8Array | null> => {
    const file = await tryResolveFile(nodeFs!, path.split("/"));
    if (file === null) return null;
    return new Uint8Array(await file.readable());
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

const src: JsonSource = isUrl ? fsJsonSource(httpFs!) : fsJsonSource(nodeFs!);

// ---------------------------------------------------------------------------
// 1. Marker present + valid (ADR-0020), STRICT.
//
// `assertArchieTreeMarker(src, { requirePresent: true })` — the SAME gate the viewer's open path uses,
// with its strict option: a tree this repo's own `publishLibrary` just wrote must ALWAYS carry the
// marker (render-core-data-integrity rule 1: archie.json is written LAST as the commit point), so
// absence is a failure to report, not to tolerate — and a marker read fault (5xx/torn) is a real
// verification failure too, not a transient blip worth skipping (the strict gate throws on it; see
// read.ts's doc comment for the decision). The strict gate throws NotAnArchieLibraryError for all three
// failure classes (read fault / absent / invalid marker) with the stable message prefixes matched below,
// so the old labels stay honest: a torn read is "reads cleanly", an absent marker is "is present", and
// only an actually-invalid marker gets the field-check label.
// ---------------------------------------------------------------------------
const STRICT_READ_FAILED_PREFIX = "This published tree's archie.json marker could not be read";
const STRICT_ABSENT_PREFIX = "This published tree has no archie.json marker";

let marker: Partial<ArchieMarker> | null = null;
let markerError: unknown;
try {
  marker = await assertArchieTreeMarker(src, { requirePresent: true });
} catch (e) {
  markerError = e;
}

if (markerError !== undefined) {
  const msg = markerError instanceof Error ? markerError.message : String(markerError);
  const label = msg.startsWith(STRICT_READ_FAILED_PREFIX)
    ? "marker: archie.json reads cleanly"
    : msg.startsWith(STRICT_ABSENT_PREFIX)
      ? "marker: archie.json is present"
      : "marker: archie.json is a valid current-schema Archie marker";
  check(false, label, msg);
} else {
  check(
    true,
    "marker: archie.json is a valid current-schema Archie marker",
    `format=${String(marker!.format)} version=${String(marker!.version)} (want format=archie-library version=${SCHEMA_VERSION}) generation=${marker!.generation ?? "<absent>"}`,
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
await finish();

// Does the published tree fit GitHub Pages, and what does a republish cost? (Archie-c74e step 6.)
//
// Run through `github-fit.mjs`, which spawns this under vite-node — the same two-file idiom, and for
// the same reason, as `scripts/verify-publish.mjs`: this imports render-core's REAL `planPush` and
// `gitBlobSha` rather than re-deriving git's blob format, and plain Node cannot resolve render-core's
// TS-source workspace package.
//
// THE FOUR LIMITS, each read from the source on 2026-07-27 and each cited where it is applied:
//   · a published Pages SITE may be no larger than 1 GB
//   · a repo is "ideally less than 1 GB", strongly recommended under 5 GB
//   · a single file warns above 50 MiB and is BLOCKED above 100 MiB
//   · a Pages deployment times out at 10 minutes
//   (docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits,
//    .../managing-large-files/about-large-files-on-github)
//
// The fifth constraint is not published and is the one that actually decides this: GitHub's
// secondary rate limit on CONTENT-CREATING requests, measured by this repo at ~80/min, which
// `archive-probe.ts` turns into a derived `practicalFileCeiling` of 4,800 files (one hour of
// uploading). `PROTO-folder-probe-2026-07-27.md` records it as "the one destination constant in the
// module that is a judgement rather than a citation".
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { planPush, gitBlobSha } from "../../packages/render-core/src/publish/push-delta.ts";

const argv = process.argv.slice(2);
const A = argv[0]!;                 // the tree as first published
const B = argv[1] ?? "";            // the same library republished (optional) — the delta subject
const WRITES_PER_MIN = Number(process.env.WRITES_PER_MIN ?? "80");

const GB = 1e9, MiB = 1024 * 1024;
const SITE_LIMIT = 1 * GB;
const REPO_IDEAL = 1 * GB, REPO_MAX = 5 * GB;
const FILE_WARN = 50 * MiB, FILE_BLOCK = 100 * MiB;
const PRACTICAL_FILE_CEILING = 4800; // archive-probe.ts, derived — one hour at ~80 writes/min

async function walk(root: string): Promise<{ rel: string; bytes: number }[]> {
  const out: { rel: string; bytes: number }[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const d = stack.pop()!;
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      out.push({ rel: path.relative(root, p), bytes: (await stat(p)).size });
    }
  }
  return out.sort((x, y) => (x.rel < y.rel ? -1 : 1));
}

/** `path -> git blob sha` for a whole tree, through render-core's own `gitBlobSha`. */
async function shas(root: string, files: { rel: string; bytes: number }[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const f of files) {
    const buf = await readFile(path.join(root, f.rel));
    map[f.rel] = await gitBlobSha({ base64: buf.toString("base64") } as never);
  }
  return map;
}

const mins = (n: number) => `${(n / WRITES_PER_MIN).toFixed(0)} min`;

const files = await walk(A);
const bytes = files.reduce((n, f) => n + f.bytes, 0);
const biggest = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
const over50 = files.filter((f) => f.bytes > FILE_WARN);
const over100 = files.filter((f) => f.bytes > FILE_BLOCK);

const rows: { check: string; verdict: "FITS" | "NO" | "NOTE"; detail: string }[] = [];
const push = (check: string, verdict: "FITS" | "NO" | "NOTE", detail: string) => rows.push({ check, verdict, detail });

push("published site ≤ 1 GB", bytes <= SITE_LIMIT ? "FITS" : "NO",
  `${(bytes / GB).toFixed(3)} GB of 1 GB — ${((100 * bytes) / SITE_LIMIT).toFixed(0)}% used, ${((SITE_LIMIT - bytes) / GB).toFixed(3)} GB spare`);
push("source repo ≤ 1 GB ideal / 5 GB recommended", bytes <= REPO_IDEAL ? "FITS" : bytes <= REPO_MAX ? "NOTE" : "NO",
  `${(bytes / GB).toFixed(3)} GB (the repo carries the same tree; git's own object overhead is NOT counted here)`);
push("no file above the 100 MiB block", over100.length === 0 ? "FITS" : "NO",
  `${over100.length} file(s) over 100 MiB, ${over50.length} over the 50 MiB warning; largest ${biggest.map((f) => `${f.rel} ${(f.bytes / MiB).toFixed(1)} MiB`).join(", ")}`);
push(`file count vs the derived ~${PRACTICAL_FILE_CEILING}-file practical ceiling`, files.length <= PRACTICAL_FILE_CEILING ? "FITS" : "NO",
  `${files.length.toLocaleString("en-US")} files — a FIRST publish is ${files.length} content-writes at ~${WRITES_PER_MIN}/min = ${mins(files.length)}`);
push("Pages deployment ≤ 10 min", "NOTE",
  "the 10-minute cap is on GitHub's own BUILD of a pushed tree, not on the upload; not measurable from here");

console.log(`\ntree: ${A}`);
console.log(`  ${files.length.toLocaleString("en-US")} files · ${(bytes / GB).toFixed(3)} GB\n`);
for (const r of rows) console.log(`${r.verdict.padEnd(5)} ${r.check.padEnd(48)} ${r.detail}`);

let delta: ReturnType<typeof planPush> | null = null;
if (B) {
  // THE REPUBLISH DELTA, measured rather than assumed. `PROTO-folder-probe` states "ghpages.ts:202
  // uses no base_tree, so every republish re-uploads every blob" — that is OUT OF DATE for the
  // browser PAT path: Archie-53e3 landed the incremental push, and `ghpages.ts`'s own header now
  // says the tree is still emitted complete but "an unchanged file contributes a `sha` reference to
  // a blob GitHub already stores rather than its bytes, so a republish costs one blob POST per
  // CHANGED asset". `planPush` is that decision, and this runs it over two REAL trees.
  const filesB = await walk(B);
  const [localShas, remoteShas] = await Promise.all([shas(B, filesB), shas(A, files)]);
  delta = planPush(localShas, { blobs: remoteShas, truncated: false });
  console.log(`\nrepublish delta (${A}  ->  ${B}):`);
  console.log(`  toUpload   ${delta.toUpload.length.toLocaleString("en-US")}  (blob POSTs — ${mins(delta.toUpload.length)} at ~${WRITES_PER_MIN}/min)`);
  console.log(`  toReference ${delta.toReference.length.toLocaleString("en-US")}  (named by sha, zero bytes uploaded)`);
  console.log(`  toDelete   ${delta.toDelete.length.toLocaleString("en-US")}`);
  if (delta.toUpload.length > 0) console.log(`  changed, first 8: ${delta.toUpload.slice(0, 8).join(", ")}`);
  // PRINT THE SUBJECT: a delta of 0 over two IDENTICAL trees proves the trees are byte-stable, and
  // proves nothing about the incremental push's ability to notice a change. Say which this is.
  console.log(`  subject: ${filesB.length.toLocaleString("en-US")} local paths vs ${files.length.toLocaleString("en-US")} remote paths`);
}

console.log(JSON.stringify({
  __JSON__: true,
  dir: A, files: files.length, bytes,
  over50: over50.length, over100: over100.length,
  largest: biggest,
  firstPublishWrites: files.length, firstPublishMin: files.length / WRITES_PER_MIN,
  rows,
  ...(delta ? { republish: { toUpload: delta.toUpload.length, toReference: delta.toReference.length, toDelete: delta.toDelete.length, minutes: delta.toUpload.length / WRITES_PER_MIN, sample: delta.toUpload.slice(0, 8) } } : {}),
}));

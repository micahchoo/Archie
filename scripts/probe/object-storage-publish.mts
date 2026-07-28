// Archie-c85f prototype probe: "Publish to object storage, with incremental sync".
//
// SCOPE, per sd show Archie-c85f (the grilling on 2026-07-26 supersedes the ticket's original
// question, and the ticket is the spec — see ledgers/PROTO-object-storage-2026-07-27.md for the full
// citation): Archie NEVER uploads to a bucket directly, on any platform, and never handles
// credentials. It writes a folder (already works, no size caps) and hands the author a copyable
// `rclone sync ./out r2:my-archive` command. INCREMENTAL SYNC IS THEREFORE RCLONE'S JOB, NOT
// ARCHIE'S — rclone diffs source against the bucket by size/etag/hash. What Archie owns instead is a
// sharper constraint: its folder output must be BYTE-DETERMINISTIC across publishes, or rclone sees
// churn on every file and re-uploads gigabytes it didn't need to.
//
// This probe measures that constraint against REAL infrastructure:
//   1. publishLibrary (MemoryFilesystem) -> a real disk folder, twice, unchanged input — are the
//      bytes IDENTICAL? (computeDelta, packages/render-core/src/publish/delta.ts)
//   2. Same, but with one exhibit edited between publishes — which files change?
//   3. `rclone sync` that first folder into a real local MinIO bucket (S3-compatible), then sync the
//      edited folder over it — how many objects does rclone actually transfer, second time?
//   4. A direct unauthenticated PUT against the same bucket, to make concrete WHY Archie declining to
//      embed credentials was the right call (kept minimal — this mechanism is explicitly out of
//      scope for Archie itself per the grilling; see the ledger for the citation).
//
// Run:
//   pnpm --filter @archie/viewer exec vite-node <repo>/scripts/probe/object-storage-publish.mts
// Requires env (set by the caller, see ledgers/PROTO-object-storage-2026-07-27.md for the exact
// docker/rclone bootstrap commands used):
//   S3_ENDPOINT           e.g. http://127.0.0.1:19000
//   RCLONE_CONFIG         path to an rclone.conf with an `archieprobe` S3 remote
//   ARCHIE_PROBE_BUCKET   a bucket that already exists on that remote
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  MemoryFilesystem, publishLibrary, collectFiles, computeDelta,
  asExhibitId, asObjectId, asLibraryId, asClientId, appendNew, canvasIdFor,
  type AnnotationLog, type Library, type FileContent,
} from "../../packages/render-core/src/index.js";

const BASE_URL = "https://archive.example/lib/";
const S3_ENDPOINT = process.env.S3_ENDPOINT ?? "http://127.0.0.1:19000";
const RCLONE_CONFIG = process.env.RCLONE_CONFIG;
const BUCKET = process.env.ARCHIE_PROBE_BUCKET ?? "archie-test-bucket";
const REMOTE = `archieprobe:${BUCKET}`;

if (!RCLONE_CONFIG) {
  console.error("RCLONE_CONFIG env var required (path to an rclone.conf with an `archieprobe` S3 remote). See ledger for bootstrap.");
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Fixture: three exhibits, a couple of objects + notes each. Remote https sources only (no
// getAsset/tileObject) so this runs in plain Node — no OffscreenCanvas, no browser dependency.
// ---------------------------------------------------------------------------------------------
const alice = asClientId("alice");
function makeLibrary(): { library: Library; getLog: (id: string) => AnnotationLog } {
  const exA = {
    id: asExhibitId("exA"), slug: "alpha", title: "Alpha",
    objects: [
      { id: asObjectId("o1"), source: "https://img.example/a1.jpg", label: "A1", width: 800, height: 600 },
      { id: asObjectId("o2"), source: "https://img.example/a2.jpg", label: "A2", width: 800, height: 600 },
    ],
  };
  const exB = {
    id: asExhibitId("exB"), slug: "beta", title: "Beta",
    objects: [{ id: asObjectId("o1"), source: "https://img.example/b1.jpg", label: "B1", width: 800, height: 600 }],
  };
  const exC = {
    id: asExhibitId("exC"), slug: "gamma", title: "Gamma",
    objects: [{ id: asObjectId("o1"), source: "https://img.example/c1.jpg", label: "C1", width: 800, height: 600 }],
  };
  const library: Library = { id: asLibraryId("lib"), title: "Probe Library", exhibits: [exA, exB, exC] };
  // Target the PUBLISHED canvas IRI directly (canvasIdFor(BASE_URL, slug, objId)) — this is what
  // site.ts's heads filter matches by exact equality (see rebaseCanvasId's doc comment: a target
  // minted against a different base matches nothing and the note is silently dropped from the
  // canvas heads page — the 182-record bug it exists to fix). Targeting the raw image `source` URL
  // (as some render-core unit tests do, for their own narrower purpose) does NOT land the note in
  // canvas/{objId}/annotations.json — only in the history sidecar + the unfiltered static HTML page.
  const logA = appendNew([], { target: canvasIdFor(BASE_URL, "alpha", "o1"), body: { type: "TextualBody", value: "note on A1" }, lastEditor: alice, modifiedAt: "2026-01-01T00:00:00Z", now: 1 }).log;
  const logB = appendNew([], { target: canvasIdFor(BASE_URL, "beta", "o1"), body: { type: "TextualBody", value: "note on B1" }, lastEditor: alice, modifiedAt: "2026-01-01T00:00:00Z", now: 2 }).log;
  const logs: Record<string, AnnotationLog> = { exA: logA, exB: logB, exC: [] };
  return { library, getLog: (id) => logs[id] ?? [] };
}

/** Edit ONE exhibit (beta): add a second note. Everything else in the library is untouched. */
function makeEditedLibrary(base: ReturnType<typeof makeLibrary>): { library: Library; getLog: (id: string) => AnnotationLog } {
  const editedLogB = appendNew(base.getLog("exB"), { target: canvasIdFor(BASE_URL, "beta", "o1"), body: { type: "TextualBody", value: "SECOND note on B1 (the edit)" }, lastEditor: alice, modifiedAt: "2026-01-02T00:00:00Z", now: 3 }).log;
  const logs: Record<string, AnnotationLog> = { exA: base.getLog("exA"), exB: editedLogB, exC: base.getLog("exC") };
  return { library: base.library, getLog: (id) => logs[id] ?? [] };
}

async function publishToDisk(library: Library, getLog: (id: string) => AnnotationLog, outDir: string): Promise<Record<string, FileContent>> {
  const fs = new MemoryFilesystem();
  // No publishedAt, no generation supplied — matches Studio's CURRENT wiring (STATIC_PAGE_OPTS in
  // apps/studio/src/publish-flows.svelte.ts does NOT set publishedAt; grepped, zero hits — see ledger).
  // That means site.ts's own doc comment applies: "absent = ... byte-stable republish contract".
  await publishLibrary(fs, library, getLog, { baseUrl: BASE_URL });
  const files = await collectFiles(await fs.root());
  rmSync(outDir, { recursive: true, force: true });
  for (const [path, fc] of Object.entries(files)) {
    const full = join(outDir, path);
    mkdirSync(dirname(full), { recursive: true });
    if ("text" in fc) writeFileSync(full, fc.text);
    else writeFileSync(full, Buffer.from(fc.base64, "base64"));
  }
  return files;
}

/** `rclone sync SRC DEST` — stats (files transferred/checked) go to stderr under -v, so capture both. */
function rcloneSyncVerbose(src: string, dest: string): string {
  const r = spawnSync("rclone", ["sync", src, dest, "--config", RCLONE_CONFIG!, "-v", "--stats-one-line", "--stats", "1s"], { encoding: "utf8" });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() || `(rclone exited ${r.status}, no output)`;
}
function rcloneRun(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("rclone", [...args, "--config", RCLONE_CONFIG!], { encoding: "utf8" });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), "archie-proto-c85f-"));
  const dir1 = join(work, "publish-1-full");
  const dir2 = join(work, "publish-2-unchanged");
  const dir3 = join(work, "publish-3-edited");

  console.log("== Archie-c85f probe: object storage via rclone, byte-stable incremental delta ==\n");
  console.log(`work dir: ${work}`);

  const base = makeLibrary();

  // --- 1. byte-stability: same input published twice ---
  const files1 = await publishToDisk(base.library, base.getLog, dir1);
  const files2 = await publishToDisk(base.library, base.getLog, dir2);
  const stableDelta = computeDelta(files1, files2);
  console.log(`\n[1] SAME input, published twice — files: ${Object.keys(files1).length}`);
  console.log(`    unchanged: ${stableDelta.unchanged.length}  changed: ${stableDelta.changed.length}  added: ${stableDelta.added.length}  removed: ${stableDelta.removed.length}`);
  if (stableDelta.changed.length > 0) console.log(`    CHANGED (should be empty): ${stableDelta.changed.join(", ")}`);

  // --- 2. one exhibit edited, republish FULL ---
  const edited = makeEditedLibrary(base);
  const files3 = await publishToDisk(edited.library, edited.getLog, dir3);
  const editDelta = computeDelta(files1, files3);
  console.log(`\n[2] ONE exhibit (beta) edited, full republish — files: ${Object.keys(files3).length}`);
  console.log(`    unchanged: ${editDelta.unchanged.length}  changed: ${editDelta.changed.length}`);
  console.log(`    changed paths: ${editDelta.changed.join(", ")}`);

  // --- 3. rclone sync against real MinIO ---
  console.log(`\n[3] rclone sync -> ${REMOTE} (endpoint ${S3_ENDPOINT})`);
  const emptyCheck = rcloneRun(["lsf", REMOTE]);
  console.log(`    bucket before first sync: ${emptyCheck.stdout.trim().length === 0 ? "(empty)" : emptyCheck.stdout.trim().split("\n").length + " objects"}`);

  const syncLog1 = rcloneSyncVerbose(dir1, REMOTE);
  console.log(`    -- sync 1 (full, empty bucket) --\n${syncLog1.trim()}`);

  const syncLog2 = rcloneSyncVerbose(dir3, REMOTE);
  console.log(`    -- sync 2 (edited republish, bucket already has publish 1) --\n${syncLog2.trim()}`);

  const afterList = rcloneRun(["lsf", REMOTE, "-R"]);
  console.log(`    bucket after both syncs: ${afterList.stdout.trim().split("\n").filter(Boolean).length} objects`);

  // --- 4. direct unauthenticated PUT — why credentials-in-browser was declined ---
  console.log(`\n[4] direct unauthenticated PUT (no SigV4) against the SAME bucket, simulating a browser fetch with no secret`);
  try {
    const res = await fetch(`${S3_ENDPOINT}/${BUCKET}/probe-unauth-test.txt`, { method: "PUT", body: "hello" });
    console.log(`    PUT (no auth header) -> HTTP ${res.status} ${res.statusText}`);
    console.log(`    (expected: 403 — S3-compatible servers reject unsigned writes; this is why Archie`);
    console.log(`     never embeds a bucket secret in the browser — see ledger for the full tradeoff.)`);
  } catch (e) {
    console.log(`    PUT threw: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(`\nDONE. Work dir left at ${work} for inspection.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

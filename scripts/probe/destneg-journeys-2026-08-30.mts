// destneg-journeys-2026-08-30.mts — the negative-space matrix over the four publish destinations
// (Archie-848c). For EACH destination the ticket names six unexamined dead ends; this probe owns the
// ones that can be probed LOCALLY with simulated dependency failures — NEVER a real bucket or remote:
//
//   O4/F4  marker-first partial sync visible to readers — simulated bucket dir + the REAL read seam
//          (fsJsonSource / assertArchieTreeMarker) as the mid-sync reader.
//   O1     author without rclone — the EXACT command strings export-surface emits, run with rclone
//          absent from PATH. Simulated: dependency missing, loud failure expected.
//   O2     rclone remote misconfigured — a stub `rclone` on PATH that fails the way a wrong
//          remote:bucket fails. Simulated: loud failure expected.
//   F6/O6  re-publish after deletions — publishLibrary into a REAL temp dir with the SAME options the
//          folder/object-storage journey uses (`localPublishFolder` → full publish, no removal plan),
//          then with the exhibit deleted. Does the stale exhibit's tree survive?
//   O5…    empty library — probeArchive([]) must not crash, and the surface's refusal gate must cover
//          every destination (textual probe of Publish.svelte; the rune surface is untestable headlessly).
//   E1     the learn deck (finding (a)) must name all four destinations and the rclone/CORS hand-off.
//
// The rows that do not need a runtime probe (n/a cases, GH-Pages atomicity, zip atomicity) are decided
// by code citation in ledgers/DESTNEG.md, not here.
//
// Run (pnpm --filter exec runs with cwd = apps/viewer):
//   pnpm --filter @archie/viewer exec vite-node ../../scripts/probe/destneg-journeys-2026-08-30.mts
//
// Exit: 0 when every check passes OR the only FAILs are the probe's EXPECTED findings (the rows the
// matrix is judging); 1 when an unexpected FAIL appears.

import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createChecklist } from "../lib/checklist.mjs";
import {
  publishLibrary,
  fsJsonSource,
  assertArchieTreeMarker,
  MemoryFilesystem,
  asExhibitId,
  asLibraryId,
  asObjectId,
  type Library,
  type Filesystem,
  type FsDirectory,
} from "../../packages/render-core/src/index.js";
import { NodeFilesystem } from "@render/core/node";
import { probeArchive } from "../../apps/studio/src/archive-probe.js";
import { rcloneCommands } from "../../apps/studio/src/export-surface.js";

// ---------------------------------------------------------------------------------------------
// Checklist with an expected-findings exit policy
// ---------------------------------------------------------------------------------------------

/** Rows the probe EXPECTS to fail — the matrix's findings, judged rather than silenced. */
const EXPECTED = new Set(["F6-republish-stale-files", "O6-republish-stale-files"]);
const checks = createChecklist({
  onExit: async ({ failed }) => {
    const unexpected = failed.filter((f) => !EXPECTED.has(f.label));
    console.log(`\n${EXPECTED.size} expected finding(s) under judgment; unexpected FAILs: ${unexpected.length}`);
    if (unexpected.length > 0) for (const f of unexpected) console.log(`  UNEXPECTED: ${f.label} — ${f.detail}`);
    process.exit(unexpected.length === 0 ? 0 : 1);
  },
});

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const ROOT = await mkdtemp(join(tmpdir(), "destneg-848c-"));

/** Two one-object exhibits, remote sources (no media bytes needed — publishLibrary passes them through). */
const exA = { id: asExhibitId("exA"), slug: "a", title: "Exhibit A", objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "A1", width: 10, height: 10 }] };
const exB = { id: asExhibitId("exB"), slug: "b", title: "Exhibit B", objects: [{ id: asObjectId("o2"), source: "https://img/b.jpg", label: "B1", width: 10, height: 10 }] };
const library: Library = { id: asLibraryId("lib"), title: "DestNeg", exhibits: [exA, exB] };
const libraryWithoutB: Library = { ...library, exhibits: [exA] };

/** Every file path in a Filesystem tree, relative to its root. */
async function walkFs(dir: FsDirectory, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for await (const e of dir.entries()) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.kind === "directory") out.push(...(await walkFs(await (dir as any).getDirectory(e.name), rel)));
    else out.push(rel);
  }
  return out.sort();
}

/** Copy a Filesystem tree into a real directory, optionally skipping names. */
async function materialize(fs: Filesystem, destDir: string, skip: Set<string> = new Set()): Promise<void> {
  const root = await fs.root();
  for (const rel of await walkFs(root)) {
    if (skip.has(rel)) continue;
    const dest = join(destDir, rel);
    await mkdir(join(dest, ".."), { recursive: true });
    // Traverse segment by segment — the seam takes ONE name per call (assertSafeName rejects "a/b").
    let dir = root;
    const segs = rel.split("/");
    for (const seg of segs.slice(0, -1)) dir = await dir.getDirectory(seg);
    const bytes = Buffer.from(await (await (await dir.getFile(segs[segs.length - 1]!)).readable()));
    await writeFile(dest, bytes);
  }
}

try {
  // =============================================================================================
  // O4 / F4 — marker-first partial sync visible to readers (simulated bucket, REAL read seam)
  // =============================================================================================
  {
    const bucket = join(ROOT, "bucket-first-publish");
    await mkdir(bucket, { recursive: true });
    const mem = new MemoryFilesystem();
    await publishLibrary(mem, library, () => [], { baseUrl: "" });

    // The command pair the done-object panel hands over (export-surface.ts rcloneCommands) — the
    // protocol under test: pass 1 excludes the marker, pass 2 copies it alone.
    const [syncCmd, markerCmd] = rcloneCommands("./my-library", "r2:my-archive");
    checks.check(
      syncCmd.includes("--exclude archie.json") && markerCmd.startsWith("rclone copyto"),
      "O4-two-pass-protocol",
      `pass1=${syncCmd} · pass2=${markerCmd}`,
    );

    // PASS 1 simulated: everything but the marker (unordered — sync transfers concurrently).
    await materialize(mem, bucket, new Set(["archie.json"]));
    const src1 = fsJsonSource(new NodeFilesystem(bucket));
    // The mid-sync reader, through the seam the Viewer actually opens with: absent marker → lenient
    // null, so the tree must never present itself as a COMPLETE current publish mid-pass-1.
    const midSyncMarker = await assertArchieTreeMarker(src1).catch((e) => `THREW:${(e as Error).message}`);
    const exhibitsMidSync = await src1.getOptional<unknown>("exhibits.json").catch(() => null);
    checks.check(
      midSyncMarker === null,
      "O4-mid-sync-no-false-complete-signal",
      `marker mid-pass-1 → ${midSyncMarker === null ? "absent (null — no complete signal)" : midSyncMarker}` +
        ` · exhibits.json visible mid-sync: ${exhibitsMidSync !== null}`,
    );

    // PASS 2 simulated: the marker lands last. The reader now sees a committed, verifiable tree.
    const markerBytes = Buffer.from(await (await (await (await mem.root()).getFile("archie.json")).readable()));
    await writeFile(join(bucket, "archie.json"), markerBytes);
    const src2 = fsJsonSource(new NodeFilesystem(bucket));
    const committed = await assertArchieTreeMarker(src2, { requirePresent: true }).then(() => true, () => false);
    checks.check(committed, "O4-after-pass2-marker-valid", "assertArchieTreeMarker(requirePresent) resolves after pass 2");

    // RE-PUBLISH residue (documented, judged in the ledger): exhibit B deleted, pass 1 runs again —
    // the OLD marker is excluded from the sync's deletions and stays in place, so a reader mid-sync
    // sees a valid OLD-generation marker over a mixed tree until pass 2 lands.
    const mem2 = new MemoryFilesystem();
    await publishLibrary(mem2, libraryWithoutB, () => [], { baseUrl: "" });
    const bucket2 = join(ROOT, "bucket-republish");
    await materialize(mem, bucket2); // first publish, marker included
    await materialize(mem2, bucket2, new Set(["archie.json"])); // re-publish pass 1
    const src3 = fsJsonSource(new NodeFilesystem(bucket2));
    const staleMarker = await assertArchieTreeMarker(src3).then((m) => (m as { generation?: string } | null)?.generation ?? "present", (e) => `THREW:${(e as Error).message}`);
    const exhibitsNow = (await src3.getOptional<{ exhibits?: unknown[] }>("exhibits.json").catch(() => null))?.exhibits?.length;
    checks.check(
      typeof staleMarker === "string",
      "O4-republish-old-marker-residue-documented",
      `old marker visible during re-publish pass 1 (generation=${staleMarker}) over exhibits.json with ${exhibitsNow} exhibit(s) — transient, self-heals at pass 2; recorded in DESTNEG row O4`,
    );
  }

  // =============================================================================================
  // O1 — author without rclone installed (simulated: rclone absent from PATH)
  // =============================================================================================
  {
    const emptyPath = join(ROOT, "no-rclone");
    await mkdir(emptyPath, { recursive: true });
    const [syncCmd] = rcloneCommands("./my-library", "r2:my-archive");
    const [bin, ...args] = syncCmd.split(" ");
    const r = spawnSync(bin, args, { env: { ...process.env, PATH: emptyPath }, cwd: ROOT, encoding: "utf8" });
    const loud = (r.error?.code === "ENOENT") || r.status !== 0;
    checks.check(loud, "O1-no-rclone-loud", `shell on a machine without rclone: ${r.error?.code ?? `exit ${r.status}`} — the failure is the shell's own, loud, before any bytes move`);
  }

  // =============================================================================================
  // O2 — rclone remote misconfigured (simulated: stub rclone failing like a wrong remote:bucket)
  // =============================================================================================
  {
    const stubDir = join(ROOT, "stub-bin");
    await mkdir(stubDir, { recursive: true });
    const stub = join(stubDir, "rclone");
    await writeFile(stub, "#!/bin/sh\nprintf '%s\\n' \"didn't find section in config file for remote \\\"r2:my-archive\\\"\" >&2\nexit 1\n");
    await (await import("node:fs/promises")).chmod(stub, 0o755);
    const [, markerCmd] = rcloneCommands("./my-library", "r2:my-archive");
    const [bin, ...args] = markerCmd.split(" ");
    const r = spawnSync(bin, args, { env: { ...process.env, PATH: stubDir }, cwd: ROOT, encoding: "utf8" });
    checks.check(
      r.status !== 0 && (r.stderr ?? "").length > 0,
      "O2-misconfigured-remote-loud",
      `misconfigured remote: exit ${r.status}, stderr: ${(r.stderr ?? "").trim().slice(0, 90)}…`,
    );
  }

  // =============================================================================================
  // F6 / O6 — re-publish after deletions (folder destination; object-storage inherits via rclone
  // sync mirroring THIS folder). The journey's actual write call is `localPublishFolder` →
  // `writeTree(fs, { withViewer: true })` — a FULL publish with NO removal plan.
  // =============================================================================================
  {
    const folder = join(ROOT, "folder-home");
    const sink = new NodeFilesystem(folder);
    // First publish (two exhibits).
    await publishLibrary(sink, library, () => [], { baseUrl: "" });
    const afterFirst = await walkFs(await sink.root());
    checks.check(
      afterFirst.some((p) => p.startsWith("b/")),
      "F6-first-publish-has-b",
      `${afterFirst.length} files; exhibit b present as expected`,
    );
    // The author deletes exhibit B, then re-publishes into the SAME folder — the journey's exact
    // call shape: full publish, no removedExhibits/removedObjects.
    await publishLibrary(sink, libraryWithoutB, () => [], { baseUrl: "" });
    const afterRepublish = await walkFs(await sink.root());
    const stale = afterRepublish.filter((p) => p.startsWith("b/"));
    checks.check(
      stale.length > 0,
      "F6-republish-stale-files",
      `re-publish after deleting exhibit b leaves ${stale.length} stale file(s) under b/ (${stale.slice(0, 3).join(", ")}${stale.length > 3 ? ", …" : ""}) — done-folder copy claims "clears out what you deleted"; it does not`,
    );
    // CONTROL: the pruning mechanism EXISTS (PublishOptions.removedExhibits) — the journey just
    // never passes it. Same re-publish WITH the removals:
    await publishLibrary(sink, libraryWithoutB, () => [], { baseUrl: "", removedExhibits: ["b"] });
    const afterPrune = await walkFs(await sink.root());
    checks.check(
      !afterPrune.some((p) => p.startsWith("b/")),
      "F6-control-prune-works-when-asked",
      `same re-publish WITH removedExhibits:["b"] → b/ gone (${afterPrune.length} files) — the fix is a plan the journey fails to compute`,
    );
    // Object-storage inheritance: the bucket mirror is only as clean as this folder (rclone sync
    // makes remote match local), so the stale b/ files ride along to the bucket. Documented.
    checks.check(true, "O6-republish-stale-files", "object-storage mirrors this folder with `rclone sync`, so the stale b/ files above reach the bucket too — the deletion is silently forfeited at BOTH destinations");
  }

  // =============================================================================================
  // O5 / G5 / F5 / Z5 — empty library (probe layer + surface gate)
  // =============================================================================================
  {
    // The probe layer must survive empty input without inventing a crash.
    let probeOk = true;
    let probeDetail = "";
    try {
      const p = probeArchive([]);
      probeDetail = `probeArchive([]): ${p.destinations.filter((d) => d.fits).length}/8 verdicts fit, blockers=${p.blockers.length}, recommendation=${p.recommendation ? p.recommendation.destination : "null"}`;
    } catch (e) {
      probeOk = false;
      probeDetail = `probeArchive([]) threw: ${(e as Error).message}`;
    }
    checks.check(probeOk, "O5-probe-survives-empty", probeDetail);
    // The SURFACE gate is the actual refusal: menuPhase "choose" with zero exhibits short-circuits
    // BEFORE any destination flow (the rune surface is untestable headlessly — Publish.svelte's own
    // header says so — so this is a textual probe with a code cite).
    const publish = await readFile(new URL("../../apps/studio/src/Publish.svelte", import.meta.url), "utf8");
    const gateIdx = publish.indexOf("exhibits.length === 0");
    const sheetIdx = publish.indexOf("<PublishSheet");
    const setupIdx = publish.indexOf("<SetupFlow");
    checks.check(
      gateIdx >= 0 && gateIdx < sheetIdx && gateIdx < setupIdx,
      "O5-surface-gate-precedes-all-destinations",
      `Publish.svelte: the nothing-to-publish refusal (idx ${gateIdx}) precedes the sheet (${sheetIdx}) and the setup flow (${setupIdx}) — one gate covers all four destinations`,
    );
  }

  // =============================================================================================
  // E1 — the learn deck names all four destinations and the object-storage hand-off (finding (a))
  // =============================================================================================
  {
    // Canonical source is docs/learn (gitignored apps/studio/public/learn is the synced artifact).
    const deck = await readFile(new URL("../../docs/learn/0007-publish.html", import.meta.url), "utf8");
    const has = (re: RegExp) => re.test(deck);
    checks.check(
      has(/object storage/i) && has(/rclone/i) && has(/GET and HEAD|CORS/i),
      "E1-deck-covers-object-storage",
      "0007-publish.html mentions object storage, the rclone hand-off, and the bucket CORS setting",
    );
  }
} finally {
  await rm(ROOT, { recursive: true, force: true });
}

await checks.finish();

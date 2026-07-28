#!/usr/bin/env node
// Archie-039e — the fixity + BagIt gate, RED-GREEN BY CONSTRUCTION.
//
// It is not enough to run a validator and see it pass: a validator that cannot fail proves nothing
// (.claude/rules/drive-must-not-recreate-the-thing-under-test.md). So every check here is run TWICE —
// once against the artifact as published, once against the same artifact with one payload file
// corrupted — and the run only passes if the first is green AND the second is red. It then restores
// the byte and re-runs, so a red that was really a leftover cannot pass for a red that was the tamper.
//
//   node scripts/bag-validate.mjs [--keep]
//
// Four checks:
//   1. verify-publish over the published tree        → expect exit 0
//   2. verify-publish with one tile truncated        → expect exit 1, naming that file
//   3. bagit.py --validate over the deposit bag      → expect exit 0
//   4. bagit.py --validate with one payload BIT flipped (same size) → expect non-zero, blaming the
//      sha256 rather than Payload-Oxum
//
// Check 3/4 need bagit-python (the RFC 8493 reference implementation). `pipx install bagit` puts
// `bagit.py` on PATH; `pip install bagit` gives `python3 -m bagit`. When NEITHER is present the two
// bag checks are reported as UNAVAILABLE and the run exits 2 — deliberately not 0. A missing external
// validator is an unrun gate, not a passed one.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const VIEWER_DIR = path.join(REPO, "apps/viewer");
const keep = process.argv.includes("--keep");

const req = createRequire(path.join(VIEWER_DIR, "package.json"));
const viteNodePkgPath = req.resolve("vite-node/package.json");
const viteNodeCli = path.join(path.dirname(viteNodePkgPath), req(viteNodePkgPath).bin["vite-node"]);

const results = [];
function record(pass, label, detail) {
  results.push({ pass, label, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

/** How to invoke bagit-python here, or null. Both packaging shapes are tried; the one that answers
 *  `--version` wins. */
function findBagit() {
  for (const cmd of [["bagit.py"], [process.env.HOME + "/.local/bin/bagit.py"], ["python3", "-m", "bagit"]]) {
    const r = spawnSync(cmd[0], [...cmd.slice(1), "--version"], { encoding: "utf8" });
    if (r.status === 0) return { cmd, version: (r.stdout + r.stderr).trim() };
  }
  return null;
}

/** Every file under `dir`, recursively, as absolute paths. */
async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/** Drop the LAST BYTE of a file — the smallest possible corruption, and the shape a truncated
 *  transfer actually takes. Returns a restore function. */
async function truncateOneByte(file) {
  const original = await readFile(file);
  await writeFile(file, original.subarray(0, original.length - 1));
  return async () => writeFile(file, original);
}

/** Flip ONE BIT, leaving the byte count identical — bit rot, not truncation.
 *
 *  This is the tamper the BAG checks use, and the distinction is load-bearing. `bagit.py` validates
 *  `Payload-Oxum` FIRST, so a truncation fails on the octet count and the run never reaches a
 *  checksum: a green-then-red pair proves only that the byte total is watched. A same-size flip makes
 *  the SHA-256 in `manifest-sha256.txt` the only thing that can catch it — which is the claim this
 *  ticket is actually making. Returns a restore function. */
async function flipOneBit(file) {
  const original = await readFile(file);
  const tampered = Buffer.from(original);
  tampered[tampered.length - 1] ^= 0x01;
  await writeFile(file, tampered);
  return async () => writeFile(file, original);
}

const work = await mkdtemp(path.join(tmpdir(), "archie-deposit-"));
try {
  // ---- build the artifacts -------------------------------------------------
  const build = spawnSync(process.execPath, [viteNodeCli, path.join(HERE, "deposit-fixture.mts"), work], {
    cwd: VIEWER_DIR,
    encoding: "utf8",
  });
  if (build.status !== 0) {
    console.error(build.stdout, build.stderr);
    console.error("bag-validate: could not build the fixture");
    process.exit(1);
  }
  const built = JSON.parse(build.stdout.slice(build.stdout.indexOf("{")));
  console.log(`built: tree ${built.tree.files} files / ${built.tree.manifestLines} manifest lines · bag ${built.bag.files} files, Payload-Oxum ${built.bag.oxum}\n`);

  const tree = path.join(work, "tree");
  const bag = path.join(work, "bag");

  // The subject of the tamper: a real payload byte, chosen by PATH so the report can name it.
  const treeVictim = (await walk(tree)).find((f) => f.includes(`${path.sep}assets${path.sep}`));
  const bagVictim = (await walk(bag)).find((f) => f.includes(`${path.sep}assets${path.sep}`));
  if (!treeVictim || !bagVictim) {
    console.error("bag-validate: the fixture carries no asset file to tamper — this check would be vacuous");
    process.exit(1);
  }

  // ---- 1 & 2: verify-publish, green then red -------------------------------
  const verify = (dir) => spawnSync(process.execPath, [path.join(HERE, "verify-publish.mjs"), dir], { encoding: "utf8" });

  const clean = verify(tree);
  const fixityLine = (clean.stdout.match(/^(PASS|FAIL) {2}fixity: every listed file re-hashes.*$/m) ?? ["<no fixity line>"])[0];
  record(clean.status === 0 && fixityLine.startsWith("PASS"), "verify-publish: the published tree verifies", `exit ${clean.status} · ${fixityLine}`);

  const restoreTree = await truncateOneByte(treeVictim);
  const tampered = verify(tree);
  const rel = path.relative(tree, treeVictim).split(path.sep).join("/");
  const namesVictim = tampered.stdout.includes(`fixity: ${rel}`) && /sha256 MISMATCH/.test(tampered.stdout);
  record(
    tampered.status === 1 && namesVictim,
    "verify-publish: one truncated payload byte makes it FAIL, naming the file",
    `exit ${tampered.status} · ${(tampered.stdout.match(/^FAIL {2}fixity: .*sha256 MISMATCH.*$/m) ?? ["<no mismatch line>"])[0]}`,
  );
  await restoreTree();
  record(verify(tree).status === 0, "verify-publish: restoring the byte makes it PASS again", "the red was the tamper, not a leftover");

  // ---- 3 & 4: bagit-python, green then red ---------------------------------
  const bagit = findBagit();
  if (!bagit) {
    console.log("\nUNAVAILABLE  bagit-python is not installed — `pipx install bagit` (or `pip install bagit`).");
    console.log("             The two external-validator checks did NOT run. Exiting 2: an unrun gate is not a passed one.");
    process.exit(2);
  }
  console.log(`\nexternal validator: ${bagit.version} (${bagit.cmd.join(" ")})`);
  const validate = () => spawnSync(bagit.cmd[0], [...bagit.cmd.slice(1), "--validate", bag], { encoding: "utf8" });

  const bagClean = validate();
  record(bagClean.status === 0, "bagit.py --validate: the deposit bag is a valid BagIt bag", `exit ${bagClean.status} · ${(bagClean.stdout + bagClean.stderr).trim().split("\n").pop()}`);

  // A same-size BIT FLIP, not a truncation — see flipOneBit for why Payload-Oxum would otherwise be
  // the thing that caught it, leaving the manifest checksums untested.
  const restoreBag = await flipOneBit(bagVictim);
  const bagTampered = validate();
  const blamesChecksum = /checksum|sha256/i.test(bagTampered.stdout + bagTampered.stderr);
  record(
    bagTampered.status !== 0 && blamesChecksum,
    "bagit.py --validate: one FLIPPED payload bit (same size) makes it FAIL on the sha256, not the Oxum",
    `exit ${bagTampered.status} · ${(bagTampered.stdout + bagTampered.stderr).trim().split("\n").pop()}`,
  );
  await restoreBag();
  record(validate().status === 0, "bagit.py --validate: restoring the byte makes it valid again", "the red was the tamper, not a leftover");
} finally {
  if (keep) console.log(`\nartifacts kept at ${work}`);
  else await rm(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

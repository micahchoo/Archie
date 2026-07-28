// Did the web tier's SELECTOR RESCALE hold at 1,000 objects? (Archie-c74e step 4.)
//
// Archie-4b0a's blocker was that annotation geometry is stored in ABSOLUTE IMAGE PIXELS against the
// published master, while the web tier serves that master at 2400 px — so every region landed 2.5x
// out of place until `publishLibrary` grew `scaleSelectors`. The fix has unit tests
// (`site-rescale.test.ts`) and an artifact drive at fixture scale. This asks the only question those
// cannot: does it still hold across a whole 1,000-object library, on objects of many different
// dimensions, where the factor is different for every one?
//
// THE CHECK IS A THREE-WAY RECONCILIATION, and that is what makes it able to fail:
//   1. the AUTHORED selector       — `work/annotated.json`, in the ingested master's pixel space
//   2. the SERVED canvas dimensions — the web tree's `manifest.json` for that object
//   3. the PUBLISHED selector      — the web tree's heads page for that canvas
// A correct tree satisfies published ≈ authored x (served / authored-dims) on BOTH axes. Reading only
// (2) and (3) would pass against a tree that never rescaled anything, because a manifest and its own
// heads pages are written by the same pass; the authored value is the independent third point.
//
// Run: node scripts/accept/check-selectors.mjs --web <dir> --work <dir> [--n 20]
import fs from "node:fs";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const WEB = path.resolve(arg("web", ""));
const WORK = path.resolve(arg("work", ""));
const N = Number(arg("n", "20"));
const SEED = Number(arg("seed", "20260727"));
if (!WEB || !WORK) throw new Error("pass --web <published web tree> --work <working store>");

const results = [];
const record = (ok, label, detail) => { results.push({ ok, label, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`); };

const annotated = JSON.parse(fs.readFileSync(path.join(WORK, "annotated.json"), "utf8"));
if (annotated.length === 0) throw new Error("annotated.json is empty — the subject of this check does not exist");

// A deterministic sample, so a re-run examines the same objects and a difference is a real difference.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(SEED);
const pool = [...annotated];
const sample = [];
// The target is fixed BEFORE the loop: `Math.min(N, pool.length)` re-evaluated inside a loop that
// splices from `pool` converges at half of N, which is how the first version of this silently
// examined 10 objects while reporting a check of 20.
const want = Math.min(N, pool.length);
while (sample.length < want) sample.push(...pool.splice(Math.floor(r() * pool.length), 1));

const parseXywh = (v) => {
  const m = /^xywh=pixel:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(v ?? "");
  return m ? m.slice(1).map(Number) : null;
};

let checked = 0, rescaledSeen = 0;
for (const a of sample) {
  const manifest = JSON.parse(fs.readFileSync(path.join(WEB, a.slug, "manifest.json"), "utf8"));
  const canvas = manifest.items?.find((c) => String(c.id).endsWith(`/canvas/${a.objectId}`));
  if (!canvas) { record(false, `object ${a.objectId}`, "no canvas in the served manifest"); continue; }
  const servedW = canvas.width, servedH = canvas.height;

  const dir = path.join(WEB, a.slug, "canvas", a.objectId);
  let pages;
  try { pages = fs.readdirSync(dir); } catch { record(false, `object ${a.objectId}`, `no heads directory at ${path.relative(WEB, dir)}`); continue; }
  const base = pages.find((p) => /^(base|annotations)\.json$/.test(p)) ?? pages[0];
  const page = JSON.parse(fs.readFileSync(path.join(dir, base), "utf8"));
  const items = page.items ?? [];
  if (items.length === 0) { record(false, `object ${a.objectId}`, `heads page ${base} carries no annotations`); continue; }

  // Match on the AUTHORED box's identity rather than on position in the page: note ids are minted with
  // an unseeded ULID suffix, so page ORDER is not stable across runs
  // (.claude/rules/a-green-run-is-one-sample.md). The expected box is what identifies it.
  const sx = servedW / a.width, sy = servedH / a.height;
  const want = [a.xywh[0] * sx, a.xywh[1] * sy, a.xywh[2] * sx, a.xywh[3] * sy];
  const boxes = items.map((it) => parseXywh(it.target?.selector?.value)).filter(Boolean);
  const tol = 1.5; // fitWithin rounds each axis independently; a sub-pixel residue is the contract
  const hit = boxes.find((b) => b.every((v, k) => Math.abs(v - want[k]) <= tol));
  if (a.width !== servedW) rescaledSeen++;
  checked++;
  record(
    !!hit,
    `object ${a.objectId} (${a.slug})`,
    hit
      ? `authored ${a.width}x${a.height} -> served ${servedW}x${servedH} (sx=${sx.toFixed(4)}) · selector ${a.xywh.join(",")} -> ${hit.map((v) => v.toFixed(1)).join(",")}, want ${want.map((v) => v.toFixed(1)).join(",")}`
      : `authored ${a.width}x${a.height} -> served ${servedW}x${servedH} (sx=${sx.toFixed(4)}) · NO published selector within ${tol}px of ${want.map((v) => v.toFixed(1)).join(",")}; page carries ${JSON.stringify(boxes.slice(0, 3))}`,
  );
}

// PRINT THE SUBJECT (.claude/rules/post-review-fixes-are-unreviewed.md 1a): a check that examined
// nothing prints the same verdict as one that examined everything.
console.log(`\nsubject: ${checked} object(s) examined of ${annotated.length} annotated · ${rescaledSeen} of them were actually RESCALED by the web tier (a check over 0 rescaled objects proves nothing about rescaling)`);
const failed = results.filter((x) => !x.ok);
console.log(`RESULT: ${failed.length === 0 && rescaledSeen > 0 ? "PASS" : "FAIL"}  (${results.length - failed.length}/${results.length})`);
process.exit(failed.length === 0 && rescaledSeen > 0 ? 0 : 1);

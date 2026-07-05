// Sync packages/archie-viewer/dist/ to the repo root dist/.
// Canonical build output is packages/archie-viewer/dist/ (built by
// `pnpm --filter archie-viewer build`); this copy exists ONLY so the README's
// jsDelivr recipe (cdn.jsdelivr.net/gh/.../@v1/dist/archie-viewer.js) resolves
// at the repo root, which is where jsDelivr's /gh/ raw-file serving looks.
// Run before tagging a new @vN release (see docs/adr/0019, README "Embed an exhibit").
// `--check` compares without writing and exits 1 on any drift — no baseline file,
// the source of truth is the package's own dist/.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const src = join(root, "packages", "archie-viewer", "dist");
const dest = join(root, "dist");

if (!existsSync(src)) {
  console.error(`[sync-dist] source missing: ${src} — run \`pnpm --filter archie-viewer build\` first`);
  process.exit(1);
}

function listFiles(dir) {
  return readdirSync(dir).sort();
}

if (process.argv.includes("--check")) {
  if (!existsSync(dest)) {
    console.error(`[sync-dist] ${dest} is missing — run \`node scripts/sync-dist.mjs\` first`);
    process.exit(1);
  }
  const srcFiles = listFiles(src);
  const destFiles = listFiles(dest);
  let drifted = srcFiles.length !== destFiles.length;
  if (!drifted) {
    for (const name of srcFiles) {
      if (!readFileSync(join(src, name)).equals(readFileSync(join(dest, name)))) {
        drifted = true;
        break;
      }
    }
  }
  if (drifted) {
    console.error(`[sync-dist] ${dest} has drifted from ${src} — run \`node scripts/sync-dist.mjs\` to resync`);
    process.exit(1);
  }
  console.log("[sync-dist] root dist/ matches packages/archie-viewer/dist/");
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[sync-dist] copied ${src} -> ${dest}`);

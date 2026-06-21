// Sync the onboarding tutorial decks into the Studio app's served assets.
// Canonical source stays docs/learn (the documentation spine); this copies it to
// apps/studio/public/learn so Vite serves it at <base>/learn/ for the in-app Help → Tutorial.
// Runs before `dev` and `build` (see package.json) so the embedded tutorial never goes stale.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rmSync, cpSync, existsSync, mkdirSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");            // apps/studio/scripts -> repo root
const src = resolve(repo, "docs", "learn");
const dest = resolve(here, "..", "public", "learn");      // apps/studio/public/learn

if (!existsSync(src)) {
  console.error(`[sync-learn] source missing: ${src}`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[sync-learn] copied ${src} -> ${dest}`);

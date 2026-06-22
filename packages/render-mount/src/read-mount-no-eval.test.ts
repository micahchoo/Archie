// P0-10 — SOURCE-LEVEL proof that the read-only mount path carries NO eval-causing dep. The
// @annotorious/* + pixi graph is what forces `script-src 'unsafe-eval'` (.claude/rules/tauri-csp.md:
// PixiJS compiles WebGL shaders with new Function()). ADR-0019 drops that path read-only. This test
// reads the read-only module SOURCES and asserts NO import of @annotorious/openseadragon,
// @annotorious/plugin-tools, or pixi — the static proof the dep is absent at the source level.
//
// DEFERRED (named): the LIVE strict-CSP browser run of the packaged element is a PHASE-1 boundary task
// (strategy §Phase 1) — Phase 0 proves source/bundle-level ABSENCE of the eval-causing dep, not a
// packaged-app CSP run. Do NOT attempt the live run here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// The read-only module graph (the files createReadOnlyMount/createReadOnlyOverlay actually import).
const READ_ONLY_MODULES = ["read-mount.ts", "read-overlay.ts"];
const FORBIDDEN = ["@annotorious/openseadragon", "@annotorious/plugin-tools", "@annotorious", "pixi", "@pixi"];

/** Extract the module specifiers from `import ... from "x"` / `import "x"` statements. */
function importSpecifiers(src: string): string[] {
  const specs: string[] = [];
  const re = /\bimport\b[^;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) specs.push(m[1] ?? m[2]!);
  return specs;
}

describe("read-only mount path contains NO @annotorious/* or pixi import (the no-unsafe-eval keystone)", () => {
  for (const file of READ_ONLY_MODULES) {
    it(`${file} imports neither Annotorious nor pixi`, () => {
      const src = readFileSync(join(here, file), "utf8");
      const specs = importSpecifiers(src);
      for (const spec of specs) {
        for (const bad of FORBIDDEN) {
          expect(spec.includes(bad), `${file} must not import "${spec}" (matches forbidden "${bad}")`).toBe(false);
        }
      }
    });
  }

  it("the read-only modules DO keep openseadragon (deep-zoom tiles stay — ADR-0019)", () => {
    const src = readFileSync(join(here, "read-mount.ts"), "utf8");
    expect(importSpecifiers(src)).toContain("openseadragon");
  });
});

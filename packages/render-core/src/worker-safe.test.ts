import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// The gate on `src/worker.ts`'s promise: nothing in its transitive import closure may need a DOM.
//
// This is a STATIC WALK rather than a runtime check, deliberately. The failure it guards is an
// import-time explosion in a Web Worker — `isomorphic-dompurify/dist/browser.mjs:4` does
// `DOMPurify.sanitize.bind(DOMPurify)` at module scope and DOMPurify has no `.sanitize` without a
// window. A runtime test cannot see that, because vitest runs with happy-dom, so a window always
// exists and the import always succeeds. Same epistemic shape as `.claude/rules/bound-fetch-defaults.md`:
// the test runtime is more permissive than the runtime that ships.
//
// It also covers the DEV path, which `scripts/perf/worker-smoke.mjs` cannot: the smoke boots the BUILT
// workers, and Rollup tree-shakes the offending re-export away, so the built workers pass (measured
// 2026-07-27: 2/2 PASS, zero occurrences of dompurify in either chunk) while `pnpm dev` is broken.
// Keep both gates — they see different things.

const SRC = path.resolve(import.meta.dirname);
const ENTRY = path.join(SRC, "worker.ts");

/** Identifiers that only exist with a DOM. A module naming one cannot be imported by a worker. */
const DOM_GLOBALS = ["document", "window", "HTMLElement", "Image(", "createObjectURL", "navigator."];

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // bare specifier — handled separately below
  const base = path.resolve(path.dirname(fromFile), spec.replace(/\.js$/, ""));
  for (const cand of [`${base}.ts`, path.join(base, "index.ts")]) if (existsSync(cand)) return cand;
  return null;
}

/** Every VALUE import reachable from `entry` (type-only imports are erased, so they cannot crash). */
function closureOf(entry: string): { files: Set<string>; bare: Map<string, string> } {
  const files = new Set<string>();
  const bare = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const src = readFileSync(file, "utf8");
    // `import ... from "x"`, `export ... from "x"` — skipping `import type` / `export type`.
    for (const m of src.matchAll(/(?:^|\n)\s*(import|export)(\s+type)?\s[^;]*?from\s*["']([^"']+)["']/g)) {
      if (m[2]) continue; // type-only: erased at compile time
      const spec = m[3]!;
      // A `{ type Foo }`-only specifier list is also erased, but treating it as a value import is the
      // conservative direction: it can only ever make this test stricter, never blind.
      const resolved = resolveImport(file, spec);
      if (resolved) queue.push(resolved);
      else if (!spec.startsWith(".")) bare.set(spec, path.relative(SRC, file));
    }
  }
  return { files, bare };
}

describe("@render/core/worker is DOM-free", () => {
  const { files, bare } = closureOf(ENTRY);

  it("the walk actually examined a non-empty closure", () => {
    // Print the subject, not only the verdict — a walk that resolved nothing would pass every
    // assertion below (post-review-fixes-are-unreviewed.md, probe 1a).
    const rel = [...files].map((f) => path.relative(SRC, f)).sort();
    expect(rel.length, `closure: ${rel.join(", ")}`).toBeGreaterThanOrEqual(4);
    expect(rel).toContain("worker.ts");
    expect(rel).toContain("geometry/downscale.ts");
    expect(rel).toContain("geometry/dzi.ts");
    expect(rel).toContain("concurrency.ts");
  });

  it("never reaches text/sanitize.ts — the module that dies on import in a worker", () => {
    const rel = [...files].map((f) => path.relative(SRC, f));
    expect(rel, `closure was: ${rel.sort().join(", ")}`).not.toContain("text/sanitize.ts");
  });

  it("pulls in NO third-party runtime dependency", () => {
    // Not a style rule. Any bare dependency is a module whose body runs on import, in an environment
    // with no DOM, and whose behaviour there we do not control — which is exactly how this broke.
    expect(
      [...bare.entries()].map(([spec, importer]) => `${spec} (from ${importer})`),
      "a bare import reached the worker-safe closure",
    ).toEqual([]);
  });

  it("no module in the closure names a DOM-only global", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Strip comments first, so prose about `document` in a header is not a failure.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
      for (const g of DOM_GLOBALS) if (code.includes(g)) offenders.push(`${path.relative(SRC, f)} -> ${g}`);
    }
    expect(offenders, "a worker-safe module reaches for the DOM").toEqual([]);
  });
});

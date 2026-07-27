import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eagerFiles, eagerGzKB } from "./eager-closure.mjs";

// A manifest shaped like studio's: one html entry, a static import chain, and a lazy chunk that
// itself statically imports something. The lazy chunk's subtree must stay OUT.
const MANIFEST = {
  "index.html": { file: "assets/index.js", isEntry: true, css: ["assets/index.css"], imports: ["_shared.js"], dynamicImports: ["src/Publish.svelte"] },
  "_shared.js": { file: "assets/shared.js", imports: ["_tokens.js"] },
  "_tokens.js": { file: "assets/tokens.js" },
  "src/Publish.svelte": { file: "assets/Publish.js", css: ["assets/Publish.css"], imports: ["_embed.js"] },
  "_embed.js": { file: "assets/embed.js" },
};

test("the eager closure follows imports and stops at the lazy boundary", () => {
  assert.deepEqual([...eagerFiles(MANIFEST)].sort(), ["assets/index.css", "assets/index.js", "assets/shared.js", "assets/tokens.js"]);
});

test("a chunk reachable ONLY through dynamicImports is excluded — including its own static subtree", () => {
  const files = eagerFiles(MANIFEST);
  // Publish is lazy; embed.js is static-from-Publish but still off the load path.
  for (const excluded of ["assets/Publish.js", "assets/Publish.css", "assets/embed.js"]) {
    assert.ok(!files.has(excluded), `${excluded} must not be eager`);
  }
});

test("the same chunk becomes eager the moment a STATIC edge reaches it", () => {
  // The regression this gate exists to catch: one import moves from dynamic to static.
  const leaked = structuredClone(MANIFEST);
  leaked["index.html"].imports.push("src/Publish.svelte");
  const files = eagerFiles(leaked);
  assert.ok(files.has("assets/Publish.js"));
  assert.ok(files.has("assets/embed.js"), "the lazy chunk's own subtree comes with it");
});

test("multiple entries all contribute, and a shared chunk is counted once", () => {
  const twoEntries = {
    "a.html": { file: "a.js", isEntry: true, imports: ["_c.js"] },
    "b.html": { file: "b.js", isEntry: true, imports: ["_c.js"] },
    "_c.js": { file: "c.js" },
  };
  assert.deepEqual([...eagerFiles(twoEntries)].sort(), ["a.js", "b.js", "c.js"]);
});

test("a cycle terminates", () => {
  const cyclic = { "a.html": { file: "a.js", isEntry: true, imports: ["_b.js"] }, "_b.js": { file: "b.js", imports: ["a.html"] } };
  assert.deepEqual([...eagerFiles(cyclic)].sort(), ["a.js", "b.js"]);
});

test("a dist with no manifest measures null, never zero", () => {
  const dir = mkdtempSync(join(tmpdir(), "eager-closure-"));
  try {
    assert.equal(eagerGzKB(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("eagerGzKB sums only the eager files on disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "eager-closure-"));
  try {
    mkdirSync(join(dir, ".vite"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, ".vite", "manifest.json"), JSON.stringify(MANIFEST));
    // Distinct, highly compressible payloads: the lazy one is an order of magnitude bigger, so a
    // walk that wrongly followed dynamicImports could not produce a near-identical number by luck.
    for (const [f, n] of [["assets/index.js", 2000], ["assets/index.css", 500], ["assets/shared.js", 500], ["assets/tokens.js", 500], ["assets/Publish.js", 200000], ["assets/Publish.css", 200000], ["assets/embed.js", 200000]]) {
      writeFileSync(join(dir, f), "x".repeat(n));
    }
    const eager = eagerGzKB(dir);
    assert.ok(eager > 0, "four real files were measured");
    // gz of 600KB of lazy filler is still hundreds of bytes; the bound is loose enough to be
    // machine-independent and tight enough that including any lazy file breaks it.
    assert.ok(eager < 1, `eager must exclude the 600KB of lazy chunks, got ${eager}KB`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

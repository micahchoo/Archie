// Unit proof for the desktop capability gate (Archie-91e7) — node's built-in runner, no deps:
//   node --test scripts/lib/*.test.mjs
// (The glob form is what CI runs; the bare-dir form fails on Node 24 — see capture-gate.test.mjs.)
//
// The cases that matter are the two ways this gate can be USELESS rather than the ways it can be
// wrong: a parser that silently returns nothing (every method vacuously granted), and a new bridge
// method sliding past because nobody mapped it. Both are asserted below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  auditCapabilities, bridgeMethods, grantedPermissions, REQUIRED_PERMISSIONS,
  auditScope, dotPathSegments, scopeWildcardRoots,
} from "./tauri-capabilities.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const BRIDGE_SRC = readFileSync(`${root}packages/render-core/src/fs/tauri.ts`, "utf8");
const MANIFEST = JSON.parse(readFileSync(`${root}src-tauri/capabilities/default.json`, "utf8"));

test("the REAL bridge and the REAL manifest agree", () => {
  const r = auditCapabilities(BRIDGE_SRC, MANIFEST);
  assert.deepEqual(r.unmapped, [], "a bridge method has no REQUIRED_PERMISSIONS entry");
  assert.deepEqual(r.missing, [], "a required fs permission is not granted by the manifest");
  assert.equal(r.ok, true);
});

test("the parser finds the real methods — a silent zero-parse would make the gate vacuous", () => {
  const methods = bridgeMethods(BRIDGE_SRC);
  // Spot-check the load-bearing ones rather than pinning the whole list (which would just restate
  // the interface and break on every unrelated addition).
  for (const m of ["readFile", "writeFile", "open", "rename", "mkdir", "readDir", "remove", "exists", "stat"]) {
    assert.ok(methods.includes(m), `parser missed ${m}()`);
  }
  assert.ok(methods.length >= 9);
});

test("prose in a doc comment cannot masquerade as a method", () => {
  const source = [
    "export interface TauriFsBridge {",
    "  /** Mentions rename(oldPath, newPath) and stat(path) in prose only. */",
    "  // readFile(path) is discussed here too",
    "  writeFile(path: string, data: Uint8Array): Promise<void>;",
    "}",
  ].join("\n");
  assert.deepEqual(bridgeMethods(source), ["writeFile"]);
});

test("a NEW bridge method with no mapping FAILS as unmapped", () => {
  const source = BRIDGE_SRC.replace(
    "export interface TauriFsBridge {",
    "export interface TauriFsBridge {\n  copyFile(from: string, to: string): Promise<void>;",
  );
  const r = auditCapabilities(source, MANIFEST);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unmapped, ["copyFile"]);
});

test("the ACTUAL shipped defect: dropping fs:allow-rename fails, naming the method", () => {
  const broken = { ...MANIFEST, permissions: MANIFEST.permissions.filter((p) => p !== "fs:allow-rename") };
  const r = auditCapabilities(BRIDGE_SRC, broken);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [{ method: "rename", permission: "fs:allow-rename" }]);
});

test("dropping fs:allow-stat fails too", () => {
  const broken = { ...MANIFEST, permissions: MANIFEST.permissions.filter((p) => p !== "fs:allow-stat") };
  const r = auditCapabilities(BRIDGE_SRC, broken);
  assert.deepEqual(r.missing, [{ method: "stat", permission: "fs:allow-stat" }]);
});

test("object-form permissions (fs:scope, opener:*) count as granted", () => {
  const granted = grantedPermissions({ permissions: ["fs:default", { identifier: "fs:scope", allow: [] }] });
  assert.ok(granted.has("fs:scope"));
  assert.ok(granted.has("fs:default"));
});

test("every REQUIRED_PERMISSIONS value is an array of fs: identifiers", () => {
  for (const [method, perms] of Object.entries(REQUIRED_PERMISSIONS)) {
    assert.ok(Array.isArray(perms), `${method} maps to a non-array`);
    for (const p of perms) assert.match(p, /^fs:allow-/, `${method} maps to a non-fs permission ${p}`);
  }
});

test("a missing interface is an ERROR, never an empty pass", () => {
  assert.throws(() => bridgeMethods("export interface Something Else {}"), /not found/);
});

// --- SCOPE audit (Archie-7b48) -------------------------------------------------------------------
// The permission audit above is blind to this class: the command was granted and the PATH refused.

/** The real app sources, the same set the CLI feeds the scope audit. */
function realSources() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push({ path, text: readFileSync(path, "utf8") });
    }
  };
  walk(`${root}apps/studio/src`);
  walk(`${root}packages/render-core/src`);
  return out;
}

test("the REAL sources and the REAL manifest agree on scope", () => {
  const r = auditScope(realSources(), MANIFEST);
  assert.deepEqual(r.missing, [], "a hidden path the app requests is outside the manifest scope");
  assert.ok(r.ok);
});

test("the derivation actually finds the known hidden paths (never a vacuous zero)", () => {
  const segs = dotPathSegments(realSources()).map((s) => s.segment);
  // Both are real: asset-store.ts writes .bake-schema, resident-store.ts creates .archie-cache/.
  assert.ok(segs.includes(".bake-schema"), `expected .bake-schema, got ${segs.join(", ")}`);
  assert.ok(segs.includes(".archie-cache"), `expected .archie-cache, got ${segs.join(", ")}`);
});

test("THE ACTUAL SHIPPED DEFECT: dropping the dot-globs fails, naming each root", () => {
  const stripped = {
    ...MANIFEST,
    permissions: MANIFEST.permissions.map((p) =>
      p && typeof p === "object" && p.identifier === "fs:scope"
        ? { ...p, allow: p.allow.filter((a) => !a.path.includes("/.*")) }
        : p),
  };
  const r = auditScope(realSources(), stripped);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.map((m) => m.glob).sort(), [
    "$APPDATA/**/.*", "$APPDATA/**/.*/**", "$HOME/**/.*", "$HOME/**/.*/**",
  ]);
});

test("a const-bound marker is followed, not just a bare literal", () => {
  const segs = dotPathSegments([
    { path: "x.ts", text: 'const MARKER = ".bake-schema";\nawait dir.getFile(MARKER, { create: true });' },
  ]);
  assert.deepEqual(segs.map((s) => s.segment), [".bake-schema"]);
});

test("file EXTENSIONS and the .tmp- suffix are NOT treated as hidden segments", () => {
  // These are dot-strings that are not leading-dot path COMPONENTS; flagging them would be noise.
  const segs = dotPathSegments([
    { path: "x.ts", text: 'await dir.getFile("library.json");\nconst T = ".tmp-";\nawait dir.getFile(`${p}${T}${n}`);' },
  ]);
  assert.deepEqual(segs, []);
});

test("no dot-segments anywhere means the scope requirement does not apply", () => {
  const r = auditScope([{ path: "x.ts", text: 'await dir.getFile("plain.json");' }], { permissions: [] });
  assert.ok(r.ok);
  assert.deepEqual(r.segments, []);
});

test("a wildcard-containing path is NOT read as a root (else the requirement regresses forever)", () => {
  // $APPDATA/**/.*/** also ends in /**; treating it as a root would demand $APPDATA/**/.*/**/.*.
  const roots = scopeWildcardRoots({
    permissions: [{ identifier: "fs:scope", allow: [{ path: "$APPDATA/**" }, { path: "$APPDATA/**/.*/**" }] }],
  });
  assert.deepEqual(roots, ["$APPDATA"]);
});

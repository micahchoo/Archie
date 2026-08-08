// NodeFilesystem conformance — the real node:fs directory backend against the one shared seam contract
// (conformance.ts). Green here proves the backend's path / dir / file logic over an ACTUAL disk; the
// writable subset is exactly what Memory/Zip run in-core (conformance.test.ts), so interchangeability
// is the same proof, not an HTTP-shaped loosening. Unlike tauri.test.ts there is no bridge or double —
// node:fs/promises IS the production surface, and the temp dir IS the root.

import { afterEach, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as nodeJoin } from "node:path";
import { runConformance, runReadConformance, seedWritableFs } from "./conformance.js";
import { NodeFilesystem } from "./node.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Each conformance test wants an isolated root; mint a fresh temp dir per factory call.
runConformance("NodeFilesystem (real disk)", () => {
  const root = mkdtempSync(nodeJoin(tmpdir(), "archie-node-"));
  roots.push(root);
  return new NodeFilesystem(root);
});

// The read-only subset must ALSO hold for the writable backends, seeded by writes — the shared
// contract's read half, the same pairing conformance.test.ts runs for Memory/Zip.
runReadConformance("NodeFilesystem (seeded)", (files) => {
  const root = mkdtempSync(nodeJoin(tmpdir(), "archie-node-r-"));
  roots.push(root);
  return seedWritableFs(new NodeFilesystem(root), files);
});

// Backend-specific hardening beyond the shared seam contract (atomic write — the Tauri discipline).
describe("NodeFilesystem hardening", () => {
  it("close() commits via a same-dir temp+rename and leaves no .tmp-* sibling", async () => {
    const root = mkdtempSync(nodeJoin(tmpdir(), "archie-node-h-"));
    roots.push(root);
    const dir = await new NodeFilesystem(root).root();
    const w = await (await dir.getFile("m.json", { create: true })).writable();
    await w.write('{"ok":true}');
    await w.close();
    const names: string[] = [];
    for await (const e of dir.entries()) names.push(e.name);
    expect(names).toContain("m.json");
    expect(names.some((n) => n.includes(".tmp-"))).toBe(false);
    expect(new TextDecoder().decode(await (await dir.getFile("m.json")).readable())).toBe('{"ok":true}');
  });
});

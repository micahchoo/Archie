// TauriFilesystem conformance — binds the path-based TauriFsBridge to node:fs over temp dirs and
// runs the one shared seam contract (conformance.ts). Green here proves the backend's path / dir /
// file logic; the production binding (@tauri-apps/plugin-fs, in apps/studio/src/tauri-fs.ts) is a
// 1:1 adapter over the same TauriFsBridge surface, so it needs no separate logic test — only the
// thin plugin wiring is browser/desktop-verified. node:fs is used as the test double because
// plugin-fs is a structural subset of it (readFile/writeFile/mkdir/readDir/remove/exists).

import { afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as nodeJoin } from "node:path";
import { runConformance } from "./conformance.js";
import { TauriFilesystem, type TauriFsBridge, type TauriDirEntry } from "./tauri.js";

const roots: string[] = [];

/** A TauriFsBridge backed by node:fs — the conformance test double for @tauri-apps/plugin-fs. */
const nodeBridge: TauriFsBridge = {
  async readFile(path) {
    return new Uint8Array(await fsp.readFile(path));
  },
  async writeFile(path, data) {
    await fsp.writeFile(path, data);
  },
  async mkdir(path) {
    await fsp.mkdir(path, { recursive: true });
  },
  async readDir(path): Promise<TauriDirEntry[]> {
    const ents = await fsp.readdir(path, { withFileTypes: true });
    return ents.map((d) => ({ name: d.name, isDirectory: d.isDirectory() }));
  },
  async remove(path) {
    // force:false → rejects on a missing path, satisfying the seam's "remove must reject if missing".
    await fsp.rm(path, { recursive: true });
  },
  async exists(path) {
    try {
      await fsp.access(path);
      return true;
    } catch {
      return false;
    }
  },
};

// Each conformance test wants an isolated root; mint a fresh temp dir per factory call.
runConformance("TauriFilesystem (node-bridge)", () => {
  const root = mkdtempSync(nodeJoin(tmpdir(), "archie-tauri-"));
  roots.push(root);
  return new TauriFilesystem(nodeBridge, root);
});

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

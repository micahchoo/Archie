// Tauri desktop glue — the platform binding for the TauriFilesystem backend (the headless core +
// node-bridge conformance live in @render/core fs/tauri.ts). Mirrors the headless-core / app-glue
// split that src/binding.ts documents for the browser (FSA/zip/localStorage). This is the ONLY
// place @tauri-apps/* is touched.
//
// The @tauri-apps/* imports are LITERAL dynamic imports: Vite bundles each as its own lazy chunk,
// so they are resolvable inside the webview at runtime BUT are never fetched on the web (isTauri()
// is false there, so the import() never runs). That keeps the desktop deps off the browser's hot
// path while still letting the packaged app load them from the bundle.

import { TauriFilesystem, type TauriFsBridge, type TauriDirEntry } from "@render/core";

/** True when running inside the Tauri webview. v2 always injects __TAURI_INTERNALS__. */
export function isTauri(): boolean {
  return typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

/** Build the TauriFsBridge over @tauri-apps/plugin-fs — the 1:1 adapter the conformance test stands in for. */
export async function tauriFsBridge(): Promise<TauriFsBridge> {
  const fs = await import("@tauri-apps/plugin-fs");
  return {
    readFile: (path) => fs.readFile(path),
    writeFile: (path, data) => fs.writeFile(path, data),
    mkdir: (path) => fs.mkdir(path, { recursive: true }),
    async readDir(path): Promise<TauriDirEntry[]> {
      return (await fs.readDir(path)).map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
    },
    remove: (path) => fs.remove(path, { recursive: true }),
    exists: (path) => fs.exists(path),
  };
}

/** Default library root inside the OS app-data dir (the desktop analogue of OPFS-only "this browser"). */
export async function defaultLibraryRoot(): Promise<string> {
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  return join(await appDataDir(), "library");
}

/** Prompt for a folder to bind a Project to — the desktop analogue of src/binding.ts `pickFolder()`. */
export async function pickTauriFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false });
  return typeof picked === "string" ? picked : null;
}

/**
 * The desktop Filesystem for a given root folder. App.svelte (via folder-backend) selects this over
 * the browser backends when `isTauri()` — one native backend replaces the FSA-vs-zip capability dance.
 */
export async function makeTauriFilesystem(rootPath: string): Promise<TauriFilesystem> {
  return new TauriFilesystem(await tauriFsBridge(), rootPath);
}

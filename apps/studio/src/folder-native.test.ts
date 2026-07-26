// Archie-ce7a — the desktop folder walker. The tests that matter here are the two properties the
// browser path gets for free and this one has to earn: the paths are ROOT-PREFIXED exactly as a
// `webkitdirectory` pick is (folder-import's grouping and title logic reads the first segment), and
// bytes are NEVER read for a file the planner would discard (the memory bound — a browser File is a
// lazy disk reference, `bridge.readFile` is not).

import { describe, it, expect } from "vitest";
import { readNativeFolderFiles, folderNameFromPath, type NativeFolderBridge } from "./folder-native.js";
import { summarizeFolderFiles, planFolderImportGroups } from "./folder-import.js";
import { pickedFromFiles } from "./create-exhibit-dialog.js";

/** A fake native tree. Keys are full paths; a string[] value is a directory listing, a Uint8Array a file. */
type Tree = Record<string, string[] | Uint8Array>;

function fakeBridge(tree: Tree, opts: { unreadable?: Set<string> } = {}) {
  const readFileCalls: string[] = [];
  const readDirCalls: string[] = [];
  const bridge: NativeFolderBridge = {
    async readDir(path) {
      readDirCalls.push(path);
      if (opts.unreadable?.has(path)) throw new Error(`EACCES ${path}`);
      const entry = tree[path];
      if (!Array.isArray(entry)) throw new Error(`ENOTDIR ${path}`);
      return entry.map((name) => ({ name, isDirectory: Array.isArray(tree[`${path}/${name}`]) }));
    },
    async readFile(path) {
      readFileCalls.push(path);
      if (opts.unreadable?.has(path)) throw new Error(`EACCES ${path}`);
      const entry = tree[path];
      if (!(entry instanceof Uint8Array)) throw new Error(`EISDIR ${path}`);
      return entry;
    },
  };
  return { bridge, readFileCalls, readDirCalls };
}

const bytes = (n = 4) => new Uint8Array(n);

describe("folderNameFromPath", () => {
  it("takes the last segment", () => {
    expect(folderNameFromPath("/home/m/Pictures/Voynich")).toBe("Voynich");
  });
  it("tolerates a trailing separator and backslashes", () => {
    expect(folderNameFromPath("/home/m/Voynich/")).toBe("Voynich");
    expect(folderNameFromPath("C:\\Users\\m\\Voynich")).toBe("Voynich");
  });
});

describe("readNativeFolderFiles", () => {
  const tree: Tree = {
    "/pick/Voynich": ["notes.txt", "page-10.jpg", "page-2.jpg", "scans", ".thumbnails"],
    "/pick/Voynich/page-2.jpg": bytes(),
    "/pick/Voynich/page-10.jpg": bytes(),
    "/pick/Voynich/notes.txt": bytes(),
    "/pick/Voynich/scans": ["a.tiff", "clip.mp4"],
    "/pick/Voynich/scans/a.tiff": bytes(),
    "/pick/Voynich/scans/clip.mp4": bytes(),
    "/pick/Voynich/.thumbnails": ["cache.jpg"],
    "/pick/Voynich/.thumbnails/cache.jpg": bytes(),
  };

  it("root-prefixes every path, exactly as a webkitdirectory pick does", async () => {
    const { bridge } = fakeBridge(tree);
    const { files } = await readNativeFolderFiles("/pick/Voynich", bridge);
    expect(files.map((f) => f.webkitRelativePath).sort()).toEqual([
      "Voynich/page-10.jpg",
      "Voynich/page-2.jpg",
      "Voynich/scans/a.tiff",
      "Voynich/scans/clip.mp4",
    ]);
  });

  // THE MEMORY BOUND. If this regresses, a media folder is read into RAM in full.
  it("never reads bytes for a non-media file", async () => {
    const { bridge, readFileCalls } = fakeBridge(tree);
    await readNativeFolderFiles("/pick/Voynich", bridge);
    expect(readFileCalls).not.toContain("/pick/Voynich/notes.txt");
    expect(readFileCalls).toHaveLength(4);
  });

  it("prunes a hidden directory without descending into it", async () => {
    const { bridge, readDirCalls, readFileCalls } = fakeBridge(tree);
    await readNativeFolderFiles("/pick/Voynich", bridge);
    expect(readDirCalls).not.toContain("/pick/Voynich/.thumbnails");
    expect(readFileCalls).not.toContain("/pick/Voynich/.thumbnails/cache.jpg");
  });

  it("admits a .tiff the OS gave no MIME for (extension inference is the shared definition)", async () => {
    const { bridge } = fakeBridge(tree);
    const { files } = await readNativeFolderFiles("/pick/Voynich", bridge);
    expect(files.map((f) => f.name)).toContain("a.tiff");
  });

  it("skips an unreadable file and keeps walking", async () => {
    const { bridge } = fakeBridge(tree, { unreadable: new Set(["/pick/Voynich/page-2.jpg"]) });
    const { files, skipped } = await readNativeFolderFiles("/pick/Voynich", bridge);
    expect(skipped).toBe(1);
    expect(files.map((f) => f.name).sort()).toEqual(["a.tiff", "clip.mp4", "page-10.jpg"]);
  });

  it("skips an unreadable subdirectory and keeps the rest of the walk", async () => {
    const { bridge } = fakeBridge(tree, { unreadable: new Set(["/pick/Voynich/scans"]) });
    const { files, skipped } = await readNativeFolderFiles("/pick/Voynich", bridge);
    expect(skipped).toBe(1);
    expect(files.map((f) => f.name).sort()).toEqual(["page-10.jpg", "page-2.jpg"]);
  });

  it("an unreadable ROOT is one skip and an empty result, not a throw", async () => {
    const { bridge } = fakeBridge(tree, { unreadable: new Set(["/pick/Voynich"]) });
    const { files, skipped } = await readNativeFolderFiles("/pick/Voynich", bridge);
    expect(files).toEqual([]);
    expect(skipped).toBe(1);
  });

  it("a folder with no importable media yields no files and no skips", async () => {
    const { bridge } = fakeBridge({ "/pick/Empty": ["readme.md"], "/pick/Empty/readme.md": bytes() });
    const { files, skipped } = await readNativeFolderFiles("/pick/Empty", bridge);
    expect(files).toEqual([]);
    expect(skipped).toBe(0);
  });

  // The whole point of matching webkitdirectory's shape: the existing pure planner must read the
  // native walk identically. This is the contract test, not a restatement of the walker.
  it("feeds the existing planner the same shape a browser pick does", async () => {
    const { bridge } = fakeBridge(tree);
    const { files } = await readNativeFolderFiles("/pick/Voynich", bridge);
    const picked = pickedFromFiles(files);

    expect(summarizeFolderFiles(picked)).toMatchObject({ name: "Voynich", total: 4, images: 3, video: 1 });

    // One exhibit per first-level subfolder, loose top-level files under the root name.
    const groups = planFolderImportGroups(picked);
    expect(groups.map((g) => g.name)).toEqual(["Voynich", "scans"]);
    // Natural order inside the loose group: page-2 before page-10.
    expect(groups[0]!.files.map((f) => f.name)).toEqual(["page-2.jpg", "page-10.jpg"]);
  });
});

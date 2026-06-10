import { describe, it, expect } from "vitest";
import { folderNameFrom, inferredMime, isHiddenPath, isImportableMedia, mediaFilesInOrder, planFolderImportGroups } from "./folder-import.js";

const f = (relativePath: string, type = "") => ({ name: relativePath.split("/").pop() ?? "", relativePath, type });

describe("folderNameFrom — the picked folder names the exhibit", () => {
  it("takes the root segment webkitdirectory prefixes onto every file", () => {
    expect(folderNameFrom([f("Voynich Scans/page-1.jpg")])).toBe("Voynich Scans");
  });
  it("falls back when the list is empty", () => {
    expect(folderNameFrom([])).toBe("Imported folder");
  });
  it("a slashless path (bare filename) titles the exhibit without the extension", () => {
    expect(folderNameFrom([f("photo.jpg")])).toBe("photo");
  });
});

describe("inferredMime — what ingest will see", () => {
  it("passes File.type through when present", () => {
    expect(inferredMime(f("a/x.weird", "image/png"))).toBe("image/png");
  });
  it("infers from the extension when File.type is empty (the plan and ingest must agree)", () => {
    expect(inferredMime(f("a/scan.tiff"))).toBe("image/tiff");
    expect(inferredMime(f("a/rec.mp3"))).toBe("audio/mpeg");
    expect(inferredMime(f("a/notes.txt"))).toBe("");
  });
});

describe("isImportableMedia — MIME first, extension fallback", () => {
  it("accepts images/audio/video by MIME", () => {
    expect(isImportableMedia(f("a/x.weird", "image/png"))).toBe(true);
    expect(isImportableMedia(f("a/x.weird", "audio/mpeg"))).toBe(true);
  });
  it("accepts by extension when the browser leaves File.type empty", () => {
    expect(isImportableMedia(f("a/page.tiff"))).toBe(true);
    expect(isImportableMedia(f("a/rec.mp3"))).toBe(true);
  });
  it("rejects non-media", () => {
    expect(isImportableMedia(f("a/notes.txt"))).toBe(false);
    expect(isImportableMedia(f("a/data.json", "application/json"))).toBe(false);
  });
});

describe("isHiddenPath — dotfiles and OS junk never become objects", () => {
  it("flags hidden segments anywhere in the path", () => {
    expect(isHiddenPath("scans/.thumbnails/t1.jpg")).toBe(true);
    expect(isHiddenPath("scans/.DS_Store")).toBe(true);
    expect(isHiddenPath("__MACOSX/scans/page.jpg")).toBe(true);
    expect(isHiddenPath("scans/Thumbs.db")).toBe(true);
    expect(isHiddenPath("scans/desktop.ini")).toBe(true);
  });
  it("passes normal paths", () => {
    expect(isHiddenPath("scans/page-1.jpg")).toBe(false);
  });
});

describe("mediaFilesInOrder — the import plan", () => {
  it("filters junk and natural-sorts numbered scans into reading order", () => {
    const plan = mediaFilesInOrder([
      f("box/page-10.jpg", "image/jpeg"),
      f("box/notes.txt"),
      f("box/page-2.jpg", "image/jpeg"),
      f("box/.DS_Store"),
      f("box/page-1.jpg", "image/jpeg"),
    ]);
    expect(plan.map((x) => x.name)).toEqual(["page-1.jpg", "page-2.jpg", "page-10.jpg"]);
  });
  it("orders across subfolders by relative path", () => {
    const plan = mediaFilesInOrder([
      f("box/2-verso/a.jpg", "image/jpeg"),
      f("box/1-recto/a.jpg", "image/jpeg"),
    ]);
    expect(plan.map((x) => x.relativePath)).toEqual(["box/1-recto/a.jpg", "box/2-verso/a.jpg"]);
  });
});

describe("planFolderImportGroups — one exhibit per subfolder (slice B)", () => {
  it("splits first-level subfolders into exhibits, loose files into a root-named one", () => {
    const groups = planFolderImportGroups([
      f("Box 7/2-verso/b.jpg", "image/jpeg"),
      f("Box 7/loose.jpg", "image/jpeg"),
      f("Box 7/1-recto/a.jpg", "image/jpeg"),
      f("Box 7/1-recto/.DS_Store"),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Box 7", "1-recto", "2-verso"]);
    expect(groups[0]!.files.map((x) => x.name)).toEqual(["loose.jpg"]);
  });
  it("deeper nesting stays inside its first-level subfolder", () => {
    const groups = planFolderImportGroups([
      f("root/sub/deep/x.jpg", "image/jpeg"),
      f("root/sub/y.jpg", "image/jpeg"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe("sub");
    expect(groups[0]!.files).toHaveLength(2);
  });
  it("orders by EXIF capture date when EVERY file has one (shot order beats filename order)", () => {
    const groups = planFolderImportGroups([
      { ...f("trip/IMG_100.jpg", "image/jpeg"), capturedAt: 3000 },
      { ...f("trip/IMG_099.jpg", "image/jpeg"), capturedAt: 5000 },
      { ...f("trip/IMG_101.jpg", "image/jpeg"), capturedAt: 1000 },
    ]);
    expect(groups[0]!.files.map((x) => x.name)).toEqual(["IMG_101.jpg", "IMG_100.jpg", "IMG_099.jpg"]);
  });
  it("ANY missing date falls back to natural path order for the whole group (predictable scans)", () => {
    const groups = planFolderImportGroups([
      { ...f("box/page-10.jpg", "image/jpeg"), capturedAt: 1000 },
      { ...f("box/page-2.jpg", "image/jpeg"), capturedAt: null },
    ]);
    expect(groups[0]!.files.map((x) => x.name)).toEqual(["page-2.jpg", "page-10.jpg"]);
  });
});

describe("planFolderImportGroups — mixed camera rolls (review r9)", () => {
  it("AV files never veto shot-time ordering: dated images sort by date, AV appends after", () => {
    const groups = planFolderImportGroups([
      { ...f("roll/clip.mp4", "video/mp4") },
      { ...f("roll/IMG_2.jpg", "image/jpeg"), capturedAt: 9000 },
      { ...f("roll/IMG_1.jpg", "image/jpeg"), capturedAt: 1000 },
    ]);
    expect(groups[0]!.files.map((x) => x.name)).toEqual(["IMG_1.jpg", "IMG_2.jpg", "clip.mp4"]);
  });
  it("a loose-files root name colliding with a subfolder gets suffixed", () => {
    const groups = planFolderImportGroups([
      f("Box/Box/a.jpg", "image/jpeg"),
      f("Box/b.jpg", "image/jpeg"),
    ]);
    expect(groups.map((g) => g.name).sort()).toEqual(["Box", "Box (loose files)"]);
  });
});

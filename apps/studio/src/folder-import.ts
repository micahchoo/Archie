// Folder → exhibit import planning (contributor-broadening ① sub-cycle A, seed Archie-e1d6).
// Pure helpers over the File list a `webkitdirectory` input yields — the ingest itself reuses
// addObjectFromFile (EXIF bake, OPFS, AV branch); this module only decides WHAT to import, in
// WHAT order, and what to call the exhibit. Kept DOM-free so it unit-tests without a browser.

/** The slice of File this module reads — keeps tests free of real File construction. */
export interface PickedFile {
  name: string;
  /** Path relative to the picked folder root, e.g. "scans/page-2.jpg" (webkitRelativePath). */
  relativePath: string;
  /** MIME type if the browser knows it (File.type; often "" for unusual extensions). */
  type: string;
  /** EXIF capture moment (epoch ms), when the caller pre-read it; null = read attempted, absent. */
  capturedAt?: number | null;
}

// Extension → MIME for files the browser leaves untyped (.tiff on Linux, .avif, …). The plan and
// the ingest MUST agree on importability — addObjectFromFile branches on MIME, so anything the
// plan admits gets a usable type from here (review finding: a typeless .tiff would otherwise
// count in the progress total, then silently drop at ingest).
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp", svg: "image/svg+xml",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4", ogv: "video/ogg",
};

/** The file's MIME as ingest will see it: File.type, else inferred from the extension, else "". */
export function inferredMime(f: PickedFile): string {
  return f.type || EXT_MIME[f.name.split(".").pop()?.toLowerCase() ?? ""] || "";
}

/** Media we can ingest — true exactly when inferredMime lands in addObjectFromFile's branches. */
export function isImportableMedia(f: PickedFile): boolean {
  return /^(image|audio|video)\//.test(inferredMime(f));
}

/** True when any path segment is hidden (".thumbnails/…") or OS junk we never want as an object. */
export function isHiddenPath(relativePath: string): boolean {
  return relativePath
    .split("/")
    .some((seg) => seg.startsWith(".") || seg === "__MACOSX" || /^(thumbs\.db|desktop\.ini)$/i.test(seg));
}

/** The picked folder's name — the first path segment webkitdirectory prefixes onto every file.
 *  A slashless path means the picker gave bare filenames; use the first name sans extension
 *  rather than titling the exhibit "photo.jpg". */
export function folderNameFrom(files: PickedFile[]): string {
  const first = files[0]?.relativePath ?? "";
  const root = first.includes("/") ? (first.split("/")[0] ?? "") : first.replace(/\.[^.]+$/, "");
  return root.trim() || "Imported folder";
}

/** The import plan: visible media files, natural-sorted by relative path so numbered page scans
 *  ("page-2" before "page-10") land in reading order. */
export function mediaFilesInOrder<T extends PickedFile>(files: T[]): T[] {
  return files
    .filter((f) => !isHiddenPath(f.relativePath) && isImportableMedia(f))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: "base" }));
}

/** One exhibit's worth of a folder import (slice B, Archie-e1d6). */
export interface FolderImportGroup<T extends PickedFile> {
  name: string;
  files: T[];
}

/** Group a picked folder into exhibits: ONE EXHIBIT PER FIRST-LEVEL SUBFOLDER ("each box is an
 *  exhibit"); loose top-level files become an exhibit named for the root folder. Within a group,
 *  files order by EXIF capture date when EVERY file carries one (photo folders sort by shot time —
 *  ⑫), else by natural path order (numbered scans). */
export function planFolderImportGroups<T extends PickedFile>(files: T[]): FolderImportGroup<T>[] {
  const media = files.filter((f) => !isHiddenPath(f.relativePath) && isImportableMedia(f));
  const byKey = new Map<string, T[]>();
  for (const f of media) {
    const segs = f.relativePath.split("/");
    // [root, file] → loose (""); [root, sub, …] → first-level subfolder; bare names → loose.
    const key = segs.length >= 3 ? segs[1]! : "";
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(f);
  }
  const rootName = folderNameFrom(files);
  const byPath = (a: T, b: T) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: "base" });
  // The capture-date rule is scoped to IMAGES (review r9): a camera roll mixes JPG+MP4, and AV
  // never carries capturedAt — it must not veto shot-time ordering. When every image is dated,
  // images sort by shot time and AV appends after (path-ordered: a recording isn't a page in the
  // photo sequence); any undated image -> the whole group falls back to predictable path order.
  const order = (fs: T[]): T[] => {
    const images = fs.filter((f) => inferredMime(f).startsWith("image/"));
    const av = fs.filter((f) => !inferredMime(f).startsWith("image/"));
    const imagesDated = images.length > 0 && images.every((f) => typeof f.capturedAt === "number");
    if (!imagesDated) return [...fs].sort(byPath);
    return [...[...images].sort((a, b) => (a.capturedAt! - b.capturedAt!) || byPath(a, b)), ...[...av].sort(byPath)];
  };
  const entries = [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const subNames = new Set(entries.filter(([k]) => k !== "").map(([k]) => k.trim().toLowerCase()));
  return entries.map(([key, fs]) => ({
    // A loose-files group whose root name collides with a subfolder would mint two identically-
    // titled exhibits (slugs dedupe; titles confuse) — suffix the loose one (review r9).
    name: key === "" ? (subNames.has(rootName.trim().toLowerCase()) ? `${rootName} (loose files)` : rootName) : key,
    files: order(fs),
  }));
}

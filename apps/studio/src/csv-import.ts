// CSV → annotation bulk import (contributor-broadening ⑥, seed Archie-79c0).
// Authors who live in Excel/Sheets annotate THERE and bulk-load the result — zero annotation-UI
// learning curve (the FromThePage/Transkribus final mile). One fixed, documented dialect (no
// column-mapping UI):
//
//   object,comment[,x,y,w,h][,tags][,reading]
//
//   object  — the object id (o1) OR its label (case-insensitive); blank = the current object
//   comment — the note body (markdown allowed) — REQUIRED
//   x,y,w,h — the region in image pixels (the same xywh the canvas draws) — OPTIONAL
//   tags    — optional, space- or |-separated
//   reading — optional reading NAME or id (must already exist)
//
// Sub-cycle A required x,y,w,h on every row — but a spreadsheet author has the COMMENTS, not the
// pixels (Axis-14 gap: no surveyed repo imports coordinate-free annotations). Sub-cycle B makes the
// region OPTIONAL: a row with all four region cells blank/absent becomes a PENDING note — text held
// outside the annotation log until the author draws its box in the editor ("Set area"). This keeps
// the log-boundary invariant intact (session.ts: no degenerate geometry ever enters the log) while
// letting the import carry pure text. A row that gives SOME-but-not-all of x,y,w,h (or a non-numeric
// one) is still an ERROR — skipped — because that's a malformed region, not an omitted one.
//
// DOM-free planner: the caller feeds `notes` to session.createNote (the seeds' own path) and stages
// `pending` in the editor's placement tray.

export interface CsvNotePlan {
  objectId: string;
  region: [number, number, number, number];
  comment: string;
  tags: string[];
  /** Resolved reading id (when the reading column matched). */
  reading?: string;
}

/** A note whose text arrived but whose region did not — staged for "Set area" placement.
 *  Same shape as CsvNotePlan minus `region` (assigned later by the drawn box). */
export interface CsvPendingNote {
  objectId: string;
  comment: string;
  tags: string[];
  reading?: string;
}

export interface CsvImportPlan {
  notes: CsvNotePlan[];
  /** Rows with text but no region — staged for editor placement (NOT imported to the log here). */
  pending: CsvPendingNote[];
  /** Per-row reasons, numbered as the SPREADSHEET shows them (header = line 1). */
  skipped: { row: number; reason: string }[];
}

/** A starter CSV the author downloads, fills in (Excel/Sheets), and adds back — the "fill in the blank"
 *  on-ramp. Header + example rows seeded with THIS exhibit's real object labels, demonstrating BOTH a
 *  coordinate-free row (→ "needs placement", drawn later with Set area) and a pixel-region row. Pure. */
export function buildCsvTemplate(objects: { id: string; label: string; mediaType?: string }[]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const images = objects.filter((o) => !o.mediaType); // regions/notes via CSV are image-only
  const header = "object,x,y,w,h,comment,tags,reading";
  const rows: string[] = [];
  const a = images[0];
  if (a) {
    rows.push(`${q(a.label)},,,,,${q("Leave x,y,w,h blank to place this note with Set area")},,`);
    rows.push(`${q(a.label)},100,100,400,300,${q("Or give a pixel box if you already have one")},example tag,`);
  } else {
    // No image objects yet — still hand back a valid, fillable shape (blank object = the current item).
    rows.push(`,,,,,${q("Leave the object blank to use the item you're viewing")},,`);
  }
  const b = images[1];
  if (b) rows.push(`${q(b.label)},,,,,${q("One row per note — the object column takes a label or an id like o2")},,`);
  return `${[header, ...rows].join("\n")}\n`;
}

/** Minimal RFC 4180 parse: quoted fields, doubled quotes, CRLF/LF. Returns rows of fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false, i = 0;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { pushField(); i++; continue; }
    if (c === "\r") { if (text[i + 1] === "\n") { i++; continue; } pushRow(); i++; continue; } // lone CR = Mac-CSV row break
    if (c === "\n") { pushRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0]!.trim() === "")); // drop blank lines
}

export interface CsvImportContext {
  /** The exhibit's objects, for id/label resolution. AV objects are rejected per row (regions are image-only). */
  objects: { id: string; label: string; mediaType?: string }[];
  /** The exhibit's readings, for name/id resolution. */
  readings: { id: string; name: string }[];
  /** Where blank `object` cells land (the object open in the editor). */
  currentObjectId: string;
}

const REQUIRED = ["object", "comment"] as const; // x,y,w,h are OPTIONAL (sub-cycle B: coordinate-free → pending)

/** The three outcomes of reading a row's x,y,w,h cells (sub-cycle B):
 *  - `pending`: all four blank/absent → text held for "Set area" placement,
 *  - `region`: all four present & valid → a placed note's `[x,y,w,h]`,
 *  - `error`: some-but-not-all, non-numeric, or w/h ≤ 0 → a malformed (not omitted) region. */
export type RegionResult =
  | { kind: "pending" }
  | { kind: "region"; region: [number, number, number, number] }
  | { kind: "error"; reason: string };

/** Classify the four raw region cells. `Number("")` is 0, so a partial/blank cell must SKIP rather
 *  than silently place the note at the origin; w and h must be > 0. Pure + unit-tested. */
export function parseRegion(rawNums: readonly [string, string, string, string]): RegionResult {
  if (rawNums.every((v) => v === "")) return { kind: "pending" };
  const nums = rawNums.map(Number);
  if (rawNums.some((v) => v === "") || nums.some((n) => !Number.isFinite(n)) || nums[2]! <= 0 || nums[3]! <= 0) {
    return { kind: "error", reason: "x, y, w, h must all be numbers, and w and h must be greater than zero." };
  }
  return { kind: "region", region: nums as [number, number, number, number] };
}

/** Plan an import from CSV text. Header row is required (column order is therefore free). */
export function planCsvImport(text: string, ctx: CsvImportContext): CsvImportPlan {
  const rows = parseCsv(text);
  if (rows.length === 0) return { notes: [], pending: [], skipped: [{ row: 0, reason: "the file is empty" }] };

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const missing = REQUIRED.filter((c) => col(c) === -1);
  if (missing.length > 0) {
    return { notes: [], pending: [], skipped: [{ row: 0, reason: `Missing columns: ${missing.join(", ")}. The first row must be a header like: object,comment (x,y,w,h optional)` }] };
  }

  const byId = new Map(ctx.objects.map((o) => [o.id.toLowerCase(), o.id]));
  const byLabel = new Map(ctx.objects.map((o) => [o.label.trim().toLowerCase(), o.id]));
  const avIds = new Set(ctx.objects.filter((o) => o.mediaType).map((o) => o.id));
  const readingById = new Map(ctx.readings.map((r) => [r.id.toLowerCase(), r.id]));
  const readingByName = new Map(ctx.readings.map((r) => [r.name.trim().toLowerCase(), r.id]));

  const notes: CsvNotePlan[] = [];
  const pending: CsvPendingNote[] = [];
  const skipped: CsvImportPlan["skipped"] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const cell = (name: string) => (cells[col(name)] ?? "").trim(); // absent column → col()=-1 → "" (so x,y,w,h read blank)

    const objRaw = cell("object");
    const objectId = objRaw === "" ? ctx.currentObjectId : (byId.get(objRaw.toLowerCase()) ?? byLabel.get(objRaw.toLowerCase()));
    if (!objectId) { skipped.push({ row: r + 1, reason: `no media item named "${objRaw}"` }); continue; }
    if (avIds.has(objectId)) { skipped.push({ row: r + 1, reason: "Audio and video can't take a region — skipped." }); continue; }

    const comment = cell("comment");
    if (comment === "") { skipped.push({ row: r + 1, reason: "empty comment" }); continue; }

    // Reading + tags apply to BOTH placed and pending notes (region-independent), so resolve them first.
    const readingRaw = col("reading") === -1 ? "" : cell("reading");
    let reading: string | undefined;
    if (readingRaw !== "") {
      reading = readingById.get(readingRaw.toLowerCase()) ?? readingByName.get(readingRaw.toLowerCase());
      if (!reading) { skipped.push({ row: r + 1, reason: `no reading named "${readingRaw}" — add it to this exhibit first` }); continue; }
    }
    const tagsRaw = col("tags") === -1 ? "" : cell("tags");
    const tags = tagsRaw.split(/[|\s]+/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean);

    // Region is OPTIONAL. All four cells blank/absent → PENDING (placed later via "Set area"). All four
    // present & valid → a placed note. Some-but-not-all (or non-numeric) → an ERROR: a malformed region
    // is not an omitted one, so skip it loudly rather than silently drop the x the author DID type.
    const region = parseRegion((["x", "y", "w", "h"] as const).map((n) => cell(n)) as [string, string, string, string]);
    if (region.kind === "pending") {
      pending.push({ objectId, comment, tags, ...(reading ? { reading } : {}) });
      continue;
    }
    if (region.kind === "error") {
      skipped.push({ row: r + 1, reason: region.reason });
      continue;
    }

    notes.push({ objectId, region: region.region, comment, tags, ...(reading ? { reading } : {}) });
  }
  return { notes, pending, skipped };
}

// CSV → annotation bulk import (contributor-broadening ⑥ sub-cycle A, seed Archie-79c0).
// Authors who live in Excel/Sheets annotate THERE and bulk-load the result — zero annotation-UI
// learning curve (the FromThePage/Transkribus final mile). One fixed, documented dialect (no
// column-mapping UI in this slice):
//
//   object,x,y,w,h,comment[,tags][,reading]
//
//   object  — the object id (o1) OR its label (case-insensitive); blank = the current object
//   x,y,w,h — the region in image pixels (the same xywh the canvas draws)
//   comment — the note body (markdown allowed)
//   tags    — optional, space- or |-separated
//   reading — optional reading NAME or id (must already exist)
//
// DOM-free planner: the caller feeds rows to session.createNote (the seeds' own path).

export interface CsvNotePlan {
  objectId: string;
  region: [number, number, number, number];
  comment: string;
  tags: string[];
  /** Resolved reading id (when the reading column matched). */
  reading?: string;
}

export interface CsvImportPlan {
  notes: CsvNotePlan[];
  /** Per-row reasons, numbered as the SPREADSHEET shows them (header = line 1). */
  skipped: { row: number; reason: string }[];
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

const REQUIRED = ["object", "x", "y", "w", "h", "comment"] as const;

/** Plan an import from CSV text. Header row is required (column order is therefore free). */
export function planCsvImport(text: string, ctx: CsvImportContext): CsvImportPlan {
  const rows = parseCsv(text);
  if (rows.length === 0) return { notes: [], skipped: [{ row: 0, reason: "the file is empty" }] };

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const missing = REQUIRED.filter((c) => col(c) === -1);
  if (missing.length > 0) {
    return { notes: [], skipped: [{ row: 0, reason: `missing column(s): ${missing.join(", ")} — expected a header row like "object,x,y,w,h,comment"` }] };
  }

  const byId = new Map(ctx.objects.map((o) => [o.id.toLowerCase(), o.id]));
  const byLabel = new Map(ctx.objects.map((o) => [o.label.trim().toLowerCase(), o.id]));
  const avIds = new Set(ctx.objects.filter((o) => o.mediaType).map((o) => o.id));
  const readingById = new Map(ctx.readings.map((r) => [r.id.toLowerCase(), r.id]));
  const readingByName = new Map(ctx.readings.map((r) => [r.name.trim().toLowerCase(), r.id]));

  const notes: CsvNotePlan[] = [];
  const skipped: CsvImportPlan["skipped"] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const cell = (name: string) => (cells[col(name)] ?? "").trim();

    const objRaw = cell("object");
    const objectId = objRaw === "" ? ctx.currentObjectId : (byId.get(objRaw.toLowerCase()) ?? byLabel.get(objRaw.toLowerCase()));
    if (!objectId) { skipped.push({ row: r + 1, reason: `unknown object "${objRaw}"` }); continue; }
    if (avIds.has(objectId)) { skipped.push({ row: r + 1, reason: "AV object — regions are image-only" }); continue; }

    const rawNums = (["x", "y", "w", "h"] as const).map((n) => cell(n));
    const nums = rawNums.map(Number);
    // Number("") is 0 — a blank cell must SKIP, not silently place the note at the origin.
    if (rawNums.some((v) => v === "") || nums.some((n) => !Number.isFinite(n)) || nums[2]! <= 0 || nums[3]! <= 0) {
      skipped.push({ row: r + 1, reason: "x,y,w,h must all be numbers with positive w,h" });
      continue;
    }

    const comment = cell("comment");
    if (comment === "") { skipped.push({ row: r + 1, reason: "empty comment" }); continue; }

    const readingRaw = col("reading") === -1 ? "" : cell("reading");
    let reading: string | undefined;
    if (readingRaw !== "") {
      reading = readingById.get(readingRaw.toLowerCase()) ?? readingByName.get(readingRaw.toLowerCase());
      if (!reading) { skipped.push({ row: r + 1, reason: `unknown reading "${readingRaw}" — create it first` }); continue; }
    }

    const tagsRaw = col("tags") === -1 ? "" : cell("tags");
    const tags = tagsRaw.split(/[|\s]+/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean);

    notes.push({ objectId, region: nums as [number, number, number, number], comment, tags, ...(reading ? { reading } : {}) });
  }
  return { notes, skipped };
}

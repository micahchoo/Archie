// Catalogue-spreadsheet → OBJECT METADATA bulk import (Archie-3754). A small institution arrives with
// half its archive in folders and half in a collections-system export; folder ingest handles the first
// half, and this is the door for the second. At 1,000 objects, typing is not a plan.
//
// A DELIBERATE DIVERGENCE FROM csv-import.ts, recorded so it is not re-litigated. That module's header
// (csv-import.ts:1-6) states the annotation dialect is "One fixed, documented dialect (no column-mapping
// UI)", and that was the right call there: an annotation sheet is authored TO Archie's spec by someone
// who chose to annotate in Excel. A catalogue export is not — it is produced by someone else's
// collections system and cannot be reshaped on demand, so a fixed dialect pushes the reshaping onto the
// institution, which is the audience least equipped to do it. Hence a COLUMN-MAPPING step
// (Archie-3754 "UI/UX decided", Archie-34a2 decision 12). What IS reused verbatim: csv-import's
// `parseCsv` (RFC 4180, no new dependency) and its skip-and-report row tolerance.
//
// THE FOUR CONTRACTS THIS MODULE HOLDS
//
// 1. KEYED PARTIAL PATCHES (.claude/rules/metadata-rights-keyed-writebacks.md). A patch carries ONLY the
//    keys the curator mapped. It never reconstructs a whole `RightsFields`, so an import that maps a
//    license can never blank a `metadata` array and vice versa. `assertPatchIsKeyed` in the suite pins it.
//
// 2. RE-IMPORT UPDATES, IDEMPOTENTLY (Archie-3754 DECIDED 2026-07-27). Same sheet + same mapping + same
//    key = the same objects, byte for byte. A key whose value already equals the object's current value
//    is OMITTED from the patch, so a second run reports "nothing changed" rather than churning the store.
//
// 3. A BLANK CELL SAYS NOTHING — it does not clear. Catalogue exports are sparse by nature; reading an
//    empty cell as "delete what's there" would make one import destroy data the sheet never described.
//    Clearing a field stays a deliberate act in the object's own editor.
//
// 4. PER-ROW TOLERANCE (render-core-data-integrity contract #2, and csv-import's own precedent). A row
//    that matches nothing, matches two things, or carries a malformed license is SKIPPED and REPORTED by
//    spreadsheet line number. A whole-file refusal is reserved for a file with no header or no match
//    column — the two conditions under which no row could ever be read.

import {
  DEFAULT_ATTRIBUTION_LABEL,
  LICENSES,
  METADATA_EXCLUDED_PROPERTIES,
  dctermsLabel,
  matchDctermsProperty,
  type MetadataEntry,
  type RightsFields,
} from "@render/core";
import { parseCsv } from "./csv-import.js";

// ---------------------------------------------------------------------------------------------
// The mapping model
// ---------------------------------------------------------------------------------------------

/** The Archie fields a column can be pointed at.
 *  - `ignore` — the column is carried by the sheet and wanted by nobody (accession dates, internal notes).
 *  - `native` — a field Archie owns as a typed slot: the object's name, its description, its license, its
 *    credit. These are exactly the ground `METADATA_EXCLUDED_PROPERTIES` keeps OUT of Dublin Core, so a
 *    title lands in `label` and never also as a `dcterms:title` — publish never emits two disagreeing
 *    title surfaces (model/dcterms.ts:127-140).
 *  - `dcterms` — any NON-excluded dcterms property (creator, date, identifier, subject, type, source …),
 *    stored as a `MetadataEntry` in the object's `metadata` array. */
export type FieldTarget =
  | { kind: "ignore" }
  | { kind: "native"; field: NativeField }
  | { kind: "dcterms"; property: string };

export type NativeField = "label" | "summary" | "rights" | "credit";

/** How a sheet row finds its object. A user choice, not a fixed rule — an institutional export rarely
 *  carries anything Archie minted (Archie-3754: "folder ingest mints its own" ids).
 *  - `archieId` — Archie's own object id. What {@link buildMetadataCsvTemplate} emits, so the
 *    export-fill-reimport door matches with no guessing at all.
 *  - `filename` — the imported file's name. See {@link filenameKeysOf} for why this is a TIERED match
 *    rather than one string comparison.
 *  - `path` — the object's `source` as stored (an `/assets/…` path, a remote URL, a IIIF service base).
 *    For a sheet that lists two same-named files in different folders, this is the key that separates them.
 *  - `identifier` — the object's existing `dcterms:identifier` metadata value. The key for a second pass
 *    over a library whose identifiers a FIRST pass already wrote. */
export type MatchKey = "archieId" | "filename" | "path" | "identifier";

/** One import's configuration: what each column means, and which column finds the object.
 *  `targets` is index-aligned with the header row — NOT keyed by header text, because a catalogue export
 *  may repeat a header ("Date", "Date") and two columns must stay separately mappable. */
export interface ColumnMapping {
  /** One target per header column, index-aligned. A shorter array reads as `ignore` past its end. */
  targets: FieldTarget[];
  /** The index of the column holding the match key. */
  matchColumn: number;
  matchKey: MatchKey;
}

/** What the planner needs to know about one object to match it and to compute a minimal patch. */
export interface ImportObject extends RightsFields {
  id: string;
  source: string;
  label: string;
  summary?: string;
  /** The preserved-original storage name, when the object was imported with one. */
  originalName?: string;
}

// ---------------------------------------------------------------------------------------------
// The patch
// ---------------------------------------------------------------------------------------------

/** The patch one row produces — a KEYED PARTIAL over the object's fields. Every key is present ONLY
 *  because the curator mapped a column to it AND the incoming value differs from what is stored.
 *  There is no `undefined`-valued key: this import never clears (contract 3), so "absent" is the only
 *  way a field is left alone and there is nothing to disambiguate. */
export interface ObjectFieldsPatch {
  label?: string;
  summary?: string;
  rights?: string;
  requiredStatement?: { label: string; value: string };
  metadata?: MetadataEntry[];
}

/** One planned change, in the curator's words — what the preview table shows. */
export interface PlannedChange {
  /** The Archie field's display name, as the object's own editor says it ("Title", "Creator", "License"). */
  field: string;
  /** The stored value this would replace, absent when the field is empty today. */
  from?: string;
  to: string;
}

export interface PlannedUpdate {
  /** The spreadsheet's own line number (header = line 1), so a report names a line the curator can find. */
  row: number;
  objectId: string;
  objectLabel: string;
  patch: ObjectFieldsPatch;
  changes: PlannedChange[];
}

export interface MetadataImportPlan {
  updates: PlannedUpdate[];
  /** Rows that matched an object and asked for nothing it does not already say (contract 2). */
  unchanged: number;
  /** Per-row reasons, numbered as the SPREADSHEET shows them. */
  skipped: { row: number; reason: string }[];
  /** Set when the FILE could not be read at all — no header, or a match column that isn't there. A
   *  refusal of this kind is not a row-level skip: no row could have been read either way. */
  refusal?: string;
}

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------

const lower = (s: string) => s.trim().toLowerCase();
const basename = (s: string) => s.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
const stripExt = (s: string) => s.replace(/\.[^./]+$/, "");

/**
 * The strings that count as "this object's file name", in two TIERS.
 *
 * Why tiers, and why `label` is in here: Studio does NOT store the user's filename verbatim. An imported
 * file becomes `source = /assets/{objectId}-{safeName}` and, on the TIFF and EXIF paths, its extension is
 * rewritten (`ingest-flows.ts:511` → `.webp`, `:517` → `.png`). The one field that reliably holds what the
 * curator typed into their spreadsheet is `label`, which import sets to `file.name` minus its extension
 * (`ingest-flows.ts:563`). So a filename match has to consider the label, the stored source, and the
 * preserved-original name — and has to tolerate a changed extension.
 *
 * Tier 1 is the exact name; tier 2 drops the extension and the `{objectId}-` storage prefix. Tier 1 is
 * tried across ALL objects before tier 2 is tried at all, so `plate.tif` and `plate.jpg` sitting in one
 * exhibit resolve exactly rather than collapsing into an ambiguity.
 */
export function filenameKeysOf(o: ImportObject): { exact: string[]; loose: string[] } {
  const raws = [o.label, basename(o.source), o.originalName ? basename(o.originalName) : ""].filter((s) => s !== "");
  const exact = raws.map(lower);
  const loose = raws.flatMap((r) => {
    const noExt = stripExt(r);
    const noPrefix = r.startsWith(`${o.id}-`) ? r.slice(o.id.length + 1) : "";
    return [noExt, noPrefix, noPrefix ? stripExt(noPrefix) : ""].filter((s) => s !== "");
  }).map(lower);
  return { exact: dedupe(exact), loose: dedupe(loose.filter((l) => !exact.includes(l))) };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** The `dcterms:identifier` value an object currently carries, if any — the `identifier` match key's side. */
export function identifierOf(o: ImportObject): string | undefined {
  return o.metadata?.find((e) => e.property === "dcterms:identifier")?.value;
}

export type MatchResult =
  | { kind: "one"; objectId: string }
  | { kind: "none" }
  | { kind: "ambiguous"; count: number };

/** An index built once per import, so matching N rows against M objects stays O(N + M) rather than O(N·M)
 *  — a 1,000-row sheet against a 1,000-object exhibit is the case this feature exists for. */
export interface MatchIndex {
  key: MatchKey;
  exact: Map<string, string[]>;
  loose: Map<string, string[]>;
}

export function buildMatchIndex(objects: readonly ImportObject[], key: MatchKey): MatchIndex {
  const exact = new Map<string, string[]>();
  const loose = new Map<string, string[]>();
  const put = (m: Map<string, string[]>, k: string, id: string) => {
    if (k === "") return;
    const at = m.get(k);
    if (at) { if (!at.includes(id)) at.push(id); } else m.set(k, [id]);
  };
  for (const o of objects) {
    if (key === "archieId") put(exact, lower(o.id), o.id);
    else if (key === "path") {
      put(exact, lower(o.source), o.id);
      put(loose, lower(o.source.replace(/^\.\//, "")), o.id);
    } else if (key === "identifier") {
      const ident = identifierOf(o);
      if (ident) put(exact, lower(ident), o.id);
    } else {
      const keys = filenameKeysOf(o);
      for (const k of keys.exact) put(exact, k, o.id);
      for (const k of keys.loose) put(loose, k, o.id);
    }
  }
  return { key, exact, loose };
}

/** Look one cell up. Exact tier first across every object, then the loose tier — see {@link filenameKeysOf}. */
export function matchRow(index: MatchIndex, cell: string): MatchResult {
  const raw = lower(cell);
  if (raw === "") return { kind: "none" };
  const candidates = index.key === "filename" ? dedupe([raw, lower(basename(cell)), lower(stripExt(basename(cell)))]) : [raw];
  for (const tier of [index.exact, index.loose]) {
    for (const c of candidates) {
      const hit = tier.get(c);
      if (!hit) continue;
      return hit.length === 1 ? { kind: "one", objectId: hit[0]! } : { kind: "ambiguous", count: hit.length };
    }
  }
  return { kind: "none" };
}

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

/** Accept a license cell. A URI passes through; a curator-facing label from the approved picker
 *  (`LICENSES`, iiif/rights.ts:26) resolves to its URI, because "CC BY 4.0" is what a spreadsheet
 *  actually holds. Anything else is refused — `rights` is an IIIF MUST-be-a-URI slot, and quietly
 *  storing "Public domain, we think" there would publish a broken rights statement. */
export function resolveLicense(cell: string): string | undefined {
  const v = cell.trim();
  if (v === "") return undefined;
  const byUri = LICENSES.find((l) => l.uri !== "" && l.uri.toLowerCase() === v.toLowerCase());
  if (byUri) return byUri.uri;
  const byLabel = LICENSES.find((l) => l.uri !== "" && l.label.toLowerCase() === v.toLowerCase());
  if (byLabel) return byLabel.uri;
  return /^https?:\/\/\S+$/i.test(v) ? v : undefined;
}

/** The display name a preview/report uses for a target. These are the words the object's own editor
 *  uses — Title / Description (DetailsEditor.svelte:143,148), License / Attribution / credit
 *  (RightsEditor.svelte:50,60) — so one field is not named two things across two surfaces. */
export function targetLabel(target: FieldTarget): string {
  if (target.kind === "ignore") return "";
  if (target.kind === "native") {
    return target.field === "label" ? "Title"
      : target.field === "summary" ? "Description"
      : target.field === "rights" ? "License"
      : "Attribution / credit";
  }
  return dctermsLabel(target.property) ?? target.property.slice("dcterms:".length);
}

/**
 * Merge the mapped dcterms values into an object's existing `metadata` array.
 *
 * The rules, and each one is load-bearing for a different contract:
 *  - An entry whose property is NOT mapped is carried through untouched, in place. That is contract 1 at
 *    the array level: mapping "Creator" must not disturb a verbatim entry a IIIF import left behind.
 *  - A mapped property REPLACES the first existing entry with that property IN PLACE, so display order
 *    survives a re-import, and DROPS any later repeats of that same property — otherwise every re-import
 *    would append another Creator and the second run would not be idempotent (contract 2).
 *  - A mapped property with no existing entry appends, in mapping order.
 *  - A BLANK incoming cell contributes nothing at all: the existing entry stays (contract 3).
 *
 * Returns the merged array, or `undefined` when nothing about it would change — the caller omits the key.
 */
export function mergeMetadata(
  existing: readonly MetadataEntry[] | undefined,
  incoming: readonly { property: string; value: string }[],
): MetadataEntry[] | undefined {
  const wanted = new Map<string, string>();
  for (const { property, value } of incoming) {
    const v = value.trim();
    if (v !== "") wanted.set(property, v); // last mapped column for a property wins
  }
  if (wanted.size === 0) return undefined;

  const out: MetadataEntry[] = [];
  const placed = new Set<string>();
  for (const entry of existing ?? []) {
    const p = entry.property;
    if (p === undefined || !wanted.has(p)) { out.push(entry); continue; }
    if (placed.has(p)) continue; // a later repeat of a property we are now authoring — drop it
    placed.add(p);
    out.push({ ...entry, value: wanted.get(p)! });
  }
  for (const [property, value] of wanted) {
    if (placed.has(property)) continue;
    out.push({ property, value });
  }
  return sameEntries(existing ?? [], out) ? undefined : out;
}

function sameEntries(a: readonly MetadataEntry[], b: readonly MetadataEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i]!;
    return x.property === y.property && x.label === y.label && x.value === y.value && x.sourceProperty === y.sourceProperty;
  });
}

// ---------------------------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------------------------

/** Guess a target for each header cell, so the mapping step opens filled in rather than blank. Wrong
 *  guesses are cheap (the curator is looking straight at them in a dropdown); a blank grid over
 *  twenty columns is not. A header that maps to an EXCLUDED dcterms property is routed to its NATIVE
 *  twin — "Title" means `label` here, never `dcterms:title` (model/dcterms.ts:134-140). */
export function suggestMapping(header: readonly string[]): FieldTarget[] {
  return header.map((raw) => {
    const h = lower(raw);
    if (h === "") return { kind: "ignore" } as const;
    if (/^(title|object title|item title|name)$/.test(h)) return { kind: "native", field: "label" } as const;
    if (/^(description|summary|caption|abstract|notes?)$/.test(h)) return { kind: "native", field: "summary" } as const;
    if (/^(rights|license|licence|rights statement)$/.test(h)) return { kind: "native", field: "rights" } as const;
    if (/^(credit|attribution|credit line|courtesy)$/.test(h)) return { kind: "native", field: "credit" } as const;
    const property = matchDctermsProperty(raw);
    if (property && !METADATA_EXCLUDED_PROPERTIES.has(property)) return { kind: "dcterms", property } as const;
    return { kind: "ignore" } as const;
  });
}

/** The column a match key would most likely live in, or -1. Same reasoning as {@link suggestMapping}. */
export function suggestMatchColumn(header: readonly string[], key: MatchKey): number {
  const wants: Record<MatchKey, RegExp> = {
    archieId: /^(archie[ _]?id|archie item id)$/,
    filename: /^(file ?name|file|image|image file|filename\.ext)$/,
    path: /^(path|file ?path|relative path|location)$/,
    identifier: /^(identifier|accession|accession no\.?|accession number|call number|object number|id)$/,
  };
  return header.findIndex((h) => wants[key].test(lower(h)));
}

/** Everything the planner needs about the exhibit. */
export interface MetadataImportContext {
  objects: readonly ImportObject[];
}

/**
 * Plan an import: parse, match every row, and compute one MINIMAL keyed patch per matched object.
 *
 * The plan is data, not an effect — the dialog previews `updates[0..5]` before anything is written, and
 * the host then applies each `patch` through `lib.patchObject`. Nothing here touches the store, which is
 * what makes preview-before-commit (Archie-3754, required) a property of the design rather than a promise.
 */
export function planMetadataImport(text: string, mapping: ColumnMapping, ctx: MetadataImportContext): MetadataImportPlan {
  const empty: MetadataImportPlan = { updates: [], unchanged: 0, skipped: [] };
  const rows = parseCsv(text);
  if (rows.length === 0) return { ...empty, refusal: "That file is empty." };
  const header = rows[0]!;
  if (mapping.matchColumn < 0 || mapping.matchColumn >= header.length) {
    return { ...empty, refusal: "Pick the column that says which media item each row is about." };
  }
  const targets = mapping.targets;
  const mapped = targets.some((t) => t.kind !== "ignore");
  if (!mapped) return { ...empty, refusal: "Point at least one column at a field before importing." };

  const index = buildMatchIndex(ctx.objects, mapping.matchKey);
  const byId = new Map(ctx.objects.map((o) => [o.id, o]));

  const updates: PlannedUpdate[] = [];
  const skipped: MetadataImportPlan["skipped"] = [];
  // One object per import run, even if the sheet names it twice: the second row would otherwise plan
  // against a pre-merge snapshot and silently lose the first row's values.
  const claimed = new Map<string, number>();
  let unchanged = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const line = r + 1;
    const cell = (i: number) => (cells[i] ?? "").trim();

    const match = matchRow(index, cell(mapping.matchColumn));
    if (match.kind === "none") {
      const raw = cell(mapping.matchColumn);
      skipped.push({ row: line, reason: raw === "" ? "no media item named in the match column" : `no media item matches “${raw}”` });
      continue;
    }
    if (match.kind === "ambiguous") {
      skipped.push({ row: line, reason: `“${cell(mapping.matchColumn)}” matches ${match.count} media items — pick a column that names each one once` });
      continue;
    }
    const object = byId.get(match.objectId)!;
    const firstLine = claimed.get(object.id);
    if (firstLine !== undefined) {
      skipped.push({ row: line, reason: `“${object.label}” was already updated from line ${firstLine}` });
      continue;
    }

    const built = buildObjectPatch(object, targets, cell);
    if (built.error) { skipped.push({ row: line, reason: built.error }); continue; }
    claimed.set(object.id, line);
    if (built.changes.length === 0) { unchanged++; continue; }
    updates.push({ row: line, objectId: object.id, objectLabel: object.label, patch: built.patch, changes: built.changes });
  }

  return { updates, unchanged, skipped };
}

/**
 * One row → one keyed patch. Every branch here either adds a key BECAUSE a column was mapped to it and
 * its value differs, or adds nothing. There is no path that writes a whole `RightsFields`
 * (.claude/rules/metadata-rights-keyed-writebacks.md rule 2) and no path that writes a key from an
 * unmapped column — `patch-shape` in the suite asserts exactly that, over every target combination.
 */
function buildObjectPatch(
  object: ImportObject,
  targets: readonly FieldTarget[],
  cell: (i: number) => string,
): { patch: ObjectFieldsPatch; changes: PlannedChange[]; error?: string } {
  const patch: ObjectFieldsPatch = {};
  const changes: PlannedChange[] = [];
  const dcIncoming: { property: string; value: string }[] = [];

  for (let c = 0; c < targets.length; c++) {
    const target = targets[c]!;
    if (target.kind === "ignore") continue;
    const value = cell(c);
    if (value === "") continue; // contract 3: a blank cell says nothing

    if (target.kind === "dcterms") { dcIncoming.push({ property: target.property, value }); continue; }

    switch (target.field) {
      case "label":
        if (value === object.label) break;
        patch.label = value;
        changes.push({ field: "Title", from: object.label, to: value });
        break;
      case "summary":
        if (value === object.summary) break;
        patch.summary = value;
        changes.push({ field: "Description", ...(object.summary ? { from: object.summary } : {}), to: value });
        break;
      case "rights": {
        const uri = resolveLicense(value);
        // A row-level refusal, per csv-import's precedent: the license is unusable, so say which cell and
        // what a usable one looks like rather than storing a rights statement that is not a URI.
        if (!uri) return { patch, changes, error: `“${value}” isn’t a license Archie can publish — use a license URL, or one of the names in the license picker` };
        if (uri === object.rights) break;
        patch.rights = uri;
        changes.push({ field: "License", ...(object.rights ? { from: object.rights } : {}), to: uri });
        break;
      }
      case "credit": {
        const current = object.requiredStatement;
        if (current?.value === value) break;
        // The label is PRESERVED when the object already carries a custom one — RightsEditor.setCredit's
        // idiom (RightsEditor.svelte:24-31), not BulkRightsDialog's uniform-stamp divergence: a per-row
        // import writes per-object values, so there is no uniformity argument for overwriting the label.
        patch.requiredStatement = { label: current?.label || DEFAULT_ATTRIBUTION_LABEL, value };
        changes.push({ field: "Attribution / credit", ...(current?.value ? { from: current.value } : {}), to: value });
        break;
      }
    }
  }

  const metadata = mergeMetadata(object.metadata, dcIncoming);
  if (metadata) {
    patch.metadata = metadata;
    const before = new Map((object.metadata ?? []).filter((e) => e.property).map((e) => [e.property!, e.value]));
    for (const { property, value } of dcIncoming) {
      const from = before.get(property);
      if (from === value.trim()) continue;
      changes.push({ field: targetLabel({ kind: "dcterms", property }), ...(from ? { from } : {}), to: value.trim() });
    }
  }
  // INVARIANT: an empty change list means an empty patch, so what the preview shows and what the store
  // is asked to write can never disagree. There is exactly one way they could drift, and it is worth
  // naming: `mergeMetadata` may return a new array that only COLLAPSED a pre-existing duplicate
  // property — a real array difference carrying no value difference, which would preview as a row with
  // nothing in it and write anyway. Tidying a duplicate the sheet never mentioned is not this import's
  // job, so the patch goes with the changes.
  if (changes.length === 0) return { patch: {}, changes };
  return { patch, changes };
}

// ---------------------------------------------------------------------------------------------
// Door 2: the starter CSV
// ---------------------------------------------------------------------------------------------

/** The metadata template's columns, in order. `archie_id` first because it is what makes the round trip
 *  trivial — fill the sheet, add it back, match on Archie id, no guessing about filenames at all. */
export const METADATA_TEMPLATE_COLUMNS = [
  "archie_id", "filename", "title", "description", "creator", "date", "identifier", "subject", "type", "rights",
] as const;

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * The export-fill-reimport door (Archie-3754: "BOTH DOORS SHIP IN V1") — a starter CSV seeded with THIS
 * exhibit's items and their CURRENT metadata, carrying Archie's own object ids. The on-ramp for an
 * institution with no existing catalogue: there is nothing to map columns from, so the sheet is Archie's
 * own shape and re-import matches on `archie_id`.
 *
 * Deliberately a SEPARATE file from `buildCsvTemplate` (csv-import.ts:54) rather than more columns on it.
 * That template's rows are NOTES — one row per annotation, repeating the object — while these are one row
 * per OBJECT. Folding them together would make a sheet whose rows mean two different things depending on
 * which columns are filled, which is precisely the shape institutional data gets mangled in.
 */
export function buildMetadataCsvTemplate(objects: readonly ImportObject[]): string {
  const dc = (o: ImportObject, property: string) =>
    o.metadata?.find((e) => e.property === `dcterms:${property}`)?.value ?? "";
  const lines = [METADATA_TEMPLATE_COLUMNS.join(",")];
  for (const o of objects) {
    lines.push([
      o.id,
      basename(o.source),
      o.label,
      o.summary ?? "",
      dc(o, "creator"),
      dc(o, "date"),
      dc(o, "identifier"),
      dc(o, "subject"),
      dc(o, "type"),
      o.rights ?? "",
    ].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** The mapping the template's own header implies — so re-importing a filled template needs no mapping
 *  work at all. Derived from {@link suggestMapping} plus the `archie_id` key, and pinned by a test that
 *  round-trips the template through the planner. */
export function templateMapping(header: readonly string[]): ColumnMapping {
  return {
    targets: suggestMapping(header),
    matchColumn: header.findIndex((h) => lower(h) === "archie_id"),
    matchKey: "archieId",
  };
}

/** A one-line summary of a plan, for the import note. Skips and a plan that did nothing are outcomes the
 *  curator must act on, so they are never dressed as a success (csv-import's `setImportNote` idiom). */
export function summarizePlan(plan: MetadataImportPlan): { text: string; ok: boolean } {
  if (plan.refusal) return { text: plan.refusal, ok: false };
  const parts: string[] = [];
  const n = plan.updates.length;
  if (n > 0) parts.push(`Updated ${n} media item${n === 1 ? "" : "s"} from your spreadsheet.`);
  if (plan.unchanged > 0) parts.push(`${plan.unchanged} already matched the sheet.`);
  if (plan.skipped.length > 0) {
    const head = plan.skipped.slice(0, 3).map((s) => `line ${s.row}: ${s.reason}`).join("; ");
    parts.push(`Skipped ${plan.skipped.length}: ${head}${plan.skipped.length > 3 ? "; …" : ""}`);
  }
  if (parts.length === 0) return { text: "That spreadsheet had nothing to update.", ok: false };
  return { text: parts.join(" "), ok: plan.skipped.length === 0 && n > 0 };
}

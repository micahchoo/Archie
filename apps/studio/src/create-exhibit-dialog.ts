// Create/import dialog — pure logic (Archie-51cc, decided by Archie-8482 "one scrimmed dialog,
// three in-surface paths" / Archie-beb6 "one grammar for adding things"). Kept out of
// CreateExhibitDialog.svelte so path-validity and IIIF-preview orchestration are unit-testable
// headless — same split as folder-import.ts / iiif-import.ts, whose exports this module reuses
// rather than re-deciding folder-grouping or manifest-shape rules of its own.
//
// previewManifest is the one function here that touches `fetch` (iiif-import.ts's own docstring
// says that module stays "DOM-free + fetch-free: callers fetch, this module plans" — a validation
// PREVIEW is a caller, so its fetch belongs here, not there). It mirrors ingest-flows.ts's
// `newExhibitFromManifest` fetch/cap shape exactly (same IIIF_MANIFEST_MAX_BYTES cap, imported —
// not redeclared) but never creates anything: a read-only check the user can back out of for free.
import { manifestToExhibit, ManifestImportError, type ManifestPlan } from "./iiif-import.js";
import { IIIF_MANIFEST_MAX_BYTES, type CollectionPreview, type CollectionImportOutcome } from "./ingest-flows.js";
import { urlSegment, type DiscoveredManifest, type TraverseSkip, type SkipReason } from "./collection-import.js";
import type { PickedFile } from "./folder-import.js";

/** The dialog's scope (Archie-beb6, both variants now wired). "new-exhibit" (LibraryHome) mints a NEW
 *  exhibit via oncreate / oncreatefromfolder / oncreatefrommanifest. "add-to-exhibit" (Archie-56cf: the
 *  overview Add-media plate + the editor object-zone "+ Add media" button) adds INTO an existing exhibit:
 *  files/folder + IIIF append to `slug`, and the Map path (absorbed from the retired AddMapModal) adds a
 *  map object — so those same three callbacks are wired to the into-exhibit ingest flows instead. */
export type CreateSurfaceScope = { kind: "new-exhibit" } | { kind: "add-to-exhibit"; slug: string; title: string };

export function surfaceTitle(scope: CreateSurfaceScope): string {
  return scope.kind === "new-exhibit" ? "New exhibit" : `Add to “${scope.title}”`;
}

export function createActionLabel(scope: CreateSurfaceScope): string {
  return scope.kind === "new-exhibit" ? "Create exhibit" : "Add to exhibit";
}

/** Whether the "Start empty" path applies to this scope — there's nothing to start empty when
 *  adding into an exhibit that already exists (add-to-exhibit hides it). */
export function offersStartEmpty(scope: CreateSurfaceScope): boolean {
  return scope.kind === "new-exhibit";
}

/** Whether the "Map" path applies to this scope (Archie-56cf). A Map is a new OBJECT in an EXISTING
 *  exhibit (its add flow, addMapObject, needs a current exhibit to append onto) — so it shows only in
 *  add-to-exhibit scope, never when minting a brand-new exhibit that has nowhere to hang it yet. */
export function offersMap(scope: CreateSurfaceScope): boolean {
  return scope.kind === "add-to-exhibit";
}

/** Whether the "From a link" path applies to this scope (Archie-32e8 — restoring the pre-Archie-56cf
 *  URL-add UI onto ingest-flows.ts's addObject, which survived that cut ready-made but UI-less). Same
 *  reasoning as offersMap: a remote-URL object is a new OBJECT that needs an EXISTING exhibit to append
 *  onto — add-to-exhibit scope only. A lone remote object isn't a sensible way to mint a brand-new
 *  exhibit, so new-exhibit scope never offers it. */
export function offersLink(scope: CreateSurfaceScope): boolean {
  return scope.kind === "add-to-exhibit";
}

/** Light validation for the "From a link" path (Archie-32e8): non-empty, http(s) scheme only. No
 *  fetch/sniff/dimension-probe preview here — that's what keeps this path cheap (addObject itself does
 *  the media-type sniff + best-effort image dimension probe once submitted; see ingest-flows.ts). */
export function linkPathValid(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** File → the {name, relativePath, type} shape the folder-import pure helpers read — the one place
 *  a real DOM File touches this module (a deterministic field read, not folder-walking; the actual
 *  drag-and-drop entry walk lives in folder-drop.ts, which is DOM-only end to end). */
export function pickedFromFiles(files: File[]): PickedFile[] {
  return files.map((f) => ({ name: f.name, relativePath: f.webkitRelativePath || f.name, type: f.type }));
}

export function emptyPathValid(title: string): boolean {
  return title.trim() !== "";
}

/** Whether the folder path's title field applies (Archie-46bf, restoring the prototype's editable
 *  title after the Archie-51cc ship deviation). New-exhibit scope only — add-to-exhibit never names
 *  anything, it appends into an exhibit that already has a title. Within new-exhibit scope: a flat
 *  folder or the "flatten" grouping choice makes exactly ONE exhibit, which the title names; the
 *  "per-subfolder" choice makes SEVERAL exhibits (one per subfolder name), where a single title is
 *  semantically inapplicable — hidden there. */
export function folderTitleFieldApplies(
  scope: CreateSurfaceScope,
  folderGroups: number,
  grouping: "per-subfolder" | "flatten",
): boolean {
  return scope.kind === "new-exhibit" && !(folderGroups > 1 && grouping === "per-subfolder");
}

/** Whether the IIIF path's title field applies — new-exhibit scope only (same reasoning as
 *  folderTitleFieldApplies); an add-to-exhibit IIIF import always appends into one existing
 *  exhibit, never names one. */
export function iiifTitleFieldApplies(scope: CreateSurfaceScope): boolean {
  return scope.kind === "new-exhibit";
}

/** Prefill precedence for a derived title (folder name / manifest label): user edit wins — only
 *  overwrite an EMPTY title, mirroring the prototype's `if (!state.title.trim()) state.title = …`
 *  guard (prototypes/create-surface/app.js, applyFolderFiles / setIiifUrl). Called on folder
 *  pick/re-pick and on a successful IIIF validation. */
export function prefillTitle(currentTitle: string, derived: string): string {
  return currentTitle.trim() === "" ? derived : currentTitle;
}

/** @param titleApplies whether this path is currently showing an editable title field (see
 *  folderTitleFieldApplies) — when it is, the prototype gates Create on a non-blank title too. */
export function folderPathValid(summary: { total: number } | null, titleApplies = false, title = ""): boolean {
  return !!summary && summary.total > 0 && (!titleApplies || title.trim() !== "");
}

export type IiifStatus = "idle" | "checking" | "valid" | "invalid";

/** @param titleApplies whether this path is currently showing an editable title field (see
 *  iiifTitleFieldApplies) — when it is, the prototype gates Create on a non-blank title too. */
export function iiifPathValid(status: IiifStatus, titleApplies = false, title = ""): boolean {
  return status === "valid" && (!titleApplies || title.trim() !== "");
}

/** A pasted/typed IIIF value that isn't even a well-formed URL yet — checked BEFORE fetching, so a
 *  still-being-typed paste shows quiet "not yet a link" copy rather than flashing a fetch error. */
export function looksLikeUrl(value: string): boolean {
  try {
    new URL(value.trim());
    return true;
  } catch {
    return false;
  }
}

export type ManifestPreview = { status: "valid"; title: string; canvases: number } | { status: "invalid"; message: string };

// Plain-language copy (spec: "never a raw error string when a mapped message exists"). The two
// ManifestImportError messages are reused verbatim from iiif-import.ts — not duplicated here, read
// straight off the thrown error below. UNREACHABLE/TOO_LARGE cover cases that module never sees
// (it's fetch-free), matching the reference prototype's copy (prototypes/create-surface/README.md).
const UNREACHABLE_MESSAGE = "Couldn't reach that link — check the URL and try again.";
const TOO_LARGE_MESSAGE = "That IIIF link is too large to check here.";
const NOT_A_MANIFEST_MESSAGE = "That URL didn't return a IIIF manifest.";

/** Fetch + plan a IIIF manifest for the dialog's live preview. Never throws — every failure mode
 *  (unreachable host, non-OK response, oversized body, unparseable JSON, a manifest shape
 *  `manifestToExhibit` rejects, or `signal` aborting) resolves to a tagged
 *  `{status:"invalid", message}` the caller can render directly (an aborted call's result is
 *  discarded by the caller's own token check, so its message is never actually shown). Reuses
 *  `manifestToExhibit`/`ManifestImportError` for the manifest-shape decision — this module adds no
 *  new parsing rules, only the fetch + a plain-language mapping. `signal` (optional) lets the
 *  caller actually stop the network request on close/supersede instead of merely discarding its
 *  result once it eventually resolves. */
export async function previewManifest(url: string, signal?: AbortSignal): Promise<ManifestPreview> {
  const trimmed = url.trim();
  let json: unknown;
  try {
    const resp = await fetch(trimmed, signal ? { signal } : undefined);
    if (!resp.ok) return { status: "invalid", message: UNREACHABLE_MESSAGE };
    // Cap enforced twice, mirroring ingest-flows.ts's newExhibitFromManifest: cheaply against a
    // declared content-length before reading the body, then against the actual received size.
    const declared = Number(resp.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > IIIF_MANIFEST_MAX_BYTES) return { status: "invalid", message: TOO_LARGE_MESSAGE };
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > IIIF_MANIFEST_MAX_BYTES) return { status: "invalid", message: TOO_LARGE_MESSAGE };
    json = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return { status: "invalid", message: UNREACHABLE_MESSAGE };
  }
  try {
    const plan = manifestToExhibit(json, trimmed);
    return { status: "valid", title: plan.title, canvases: plan.objects.length };
  } catch (e) {
    return { status: "invalid", message: e instanceof ManifestImportError ? e.message : NOT_A_MANIFEST_MESSAGE };
  }
}

// ── Collection preview + picker (Archie-a9e2, PLAN §3–5). The dialog's IIIF path, in new-exhibit scope,
// routes a pasted URL through ingest-flows' fetchCollectionPreview (the ONE fetch head — Archie-656a);
// this module owns only the PURE mapping of that discriminated result into the dialog's picker state and
// the label-hydration pool, injected-fetcher style like previewManifest above, so the whole picker is
// unit-testable headless. Add-to-exhibit scope never reaches here — it keeps previewManifest's verbatim
// single-manifest refusal (PLAN §4), so the collection contract is additive, not a rewrite.

/** One selectable manifest row in the picker. `label` starts as the collection's inline label or a URL-
 *  segment fallback (`needsHydration` marks the fallback rows a background fetch may replace in place);
 *  `context` is the parent-collection trail minus the root, " › "-joined (empty when the manifest sits
 *  directly under the root). `ref` is carried verbatim so a confirm emits the original DiscoveredManifest
 *  in collection order. */
export interface PickerRow {
  ref: DiscoveredManifest;
  label: string;
  context: string;
  needsHydration: boolean;
  checked: boolean;
}

/** DiscoveredManifest[] (collection/document order) → picker rows, ALL checked by default (PLAN §3).
 *  Label fallback is collection-import's ONE urlSegment definition (never a second copy — same reason the
 *  traversal shares it). */
export function buildPickerRows(manifests: readonly DiscoveredManifest[]): PickerRow[] {
  return manifests.map((ref) => ({
    ref,
    label: ref.label ?? urlSegment(ref.id),
    context: ref.trail.slice(1).join(" › "),
    needsHydration: ref.label === undefined,
    checked: true,
  }));
}

/** Live count of checked rows — drives the header ("N exhibits will be created") and the confirm's
 *  disabled-at-zero gate. */
export function checkedCount(rows: readonly PickerRow[]): number {
  return rows.reduce((n, r) => n + (r.checked ? 1 : 0), 0);
}

/** The confirm payload: checked rows' original refs, in COLLECTION ORDER (rows are already document-order,
 *  filter preserves it) — never check order, so the same collection always imports the same library order. */
export function selectedRefs(rows: readonly PickerRow[]): DiscoveredManifest[] {
  return rows.filter((r) => r.checked).map((r) => r.ref);
}

/** Select-all / select-none — mutates `checked` in place (the component's rows are $state, so the mutation
 *  is reactive; a plain array in a test reads back the same way). */
export function setAllChecked(rows: PickerRow[], checked: boolean): void {
  for (const r of rows) r.checked = checked;
}

export const HYDRATION_CAP = 100;
export const HYDRATION_CONCURRENCY = 4;

/** The injected label-hydration fetcher — ingest-flows' `fetchManifestPlan` shape. It returns `null` on
 *  ANY failure (calling its `onError`), which is why the pool passes a no-op `onError`: a hydration failure
 *  must NEVER alert (PLAN §5) — the row simply keeps its URL fallback. */
export type PlanFetcher = (
  url: string,
  opts: { signal?: AbortSignal; onError?: (msg: string) => void },
) => Promise<ManifestPlan | null>;

export interface HydrationSummary {
  hydrated: number;
  failed: number;
  /** Fallback rows left un-fetched because the hydration cap was hit — surfaced in the quiet note. */
  cappedOut: number;
}

/** Background label hydration (PLAN §5): for rows still on a URL-segment fallback, fetch the full manifest
 *  plan through a concurrency-`4` worker pool (cap `100` fetches), updating `row.label` IN PLACE and
 *  populating `cache` (keyed by `ref.id`) so the import never double-fetches. Respects `signal` — the pool
 *  checks it between jobs and stops, so dialog-close / path-switch / a newer paste (which abort the shared
 *  controller) also stop pending hydration. Failures are silent (row keeps its fallback); selection never
 *  blocks on it. Pure but for the injected `fetchPlan`, so the pool's cap/abort/cache behaviour is tested
 *  headless with a fake fetcher. */
export async function hydrateRowLabels(
  rows: PickerRow[],
  cache: Map<string, ManifestPlan>,
  fetchPlan: PlanFetcher,
  opts: { signal?: AbortSignal; concurrency?: number; cap?: number } = {},
): Promise<HydrationSummary> {
  const { signal } = opts;
  const cap = opts.cap ?? HYDRATION_CAP;
  const concurrency = opts.concurrency ?? HYDRATION_CONCURRENCY;
  const pending = rows.filter((r) => r.needsHydration);
  const targets = pending.slice(0, cap);
  const summary: HydrationSummary = { hydrated: 0, failed: 0, cappedOut: pending.length - targets.length };
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < targets.length) {
      if (signal?.aborted) return;
      const row = targets[next++]!;
      // A no-op onError is load-bearing: fetchManifestPlan defaults onError to ctx.alert, so omitting it
      // would pop a modal per failed hydration. We detect failure from the null return instead.
      const plan = await fetchPlan(row.ref.id, { onError: () => {}, ...(signal ? { signal } : {}) });
      if (signal?.aborted) return;
      if (plan) {
        cache.set(row.ref.id, plan);
        row.label = plan.title;
        row.needsHydration = false;
        summary.hydrated++;
      } else {
        summary.failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  return summary;
}

/** Over-manifest-cap refusal copy (PLAN §5) — names the true count and points at a smaller sub-collection,
 *  matching the single-manifest refusals' plain-language voice above. No picker is shown in this state. */
export function overCapRefusal(manifestCount: number): string {
  return `This collection lists ${manifestCount} manifests — more than Archie can import at once. Paste the URL of a smaller sub-collection instead.`;
}

const SKIP_REASON_TEXT: Record<SkipReason, string> = {
  duplicate: "already listed elsewhere",
  "depth-cap": "nested too deep",
  "doc-cap": "collection too large to fully scan",
  "fetch-failed": "couldn't be read",
};

/** The quiet skip note's headline ("N items skipped") — never silent, never modal (PLAN §2). Null when the
 *  traversal skipped nothing. */
export function skipNote(skips: readonly TraverseSkip[]): string | null {
  if (skips.length === 0) return null;
  return `${skips.length} item${skips.length === 1 ? "" : "s"} skipped`;
}

/** The skip note's detail (for a title attr / expander): counts grouped by reason, plain-language. */
export function skipDetail(skips: readonly TraverseSkip[]): string {
  const counts = new Map<SkipReason, number>();
  for (const s of skips) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  return [...counts].map(([reason, n]) => `${n} ${SKIP_REASON_TEXT[reason]}`).join(", ");
}

/** The dialog's routing of a `CollectionPreview` (ingest-flows' discriminated preview result). Keeps the
 *  branch decision out of the component and testable:
 *   - `aborted`    → the caller discards silently (a superseded keystroke) — no state change (PLAN §5);
 *   - `manifest`   → the caller shows the single-manifest preview from the CARRIED plan (title + count) —
 *                    no re-fetch (Archie-cbf6 / D2: fetchCollectionPreview already parsed it);
 *   - `error`      → a message the dialog renders in its existing invalid state;
 *   - `collection` → over-manifest-cap becomes an `over-cap` refusal (message, no picker); otherwise a
 *                    `collection` route carrying the built picker rows + the traversal skips. */
export type CollectionRoute =
  | { kind: "aborted" }
  | { kind: "manifest"; plan: ManifestPlan }
  | { kind: "error"; message: string }
  | { kind: "over-cap"; message: string }
  | { kind: "collection"; rootTitle: string; rows: PickerRow[]; skips: TraverseSkip[] };

export function routeCollectionPreview(preview: CollectionPreview): CollectionRoute {
  switch (preview.kind) {
    case "aborted":
      return { kind: "aborted" };
    case "manifest":
      return { kind: "manifest", plan: preview.plan };
    case "error":
      return { kind: "error", message: preview.message };
    case "collection":
      if (preview.result.status === "over-manifest-cap") {
        return { kind: "over-cap", message: overCapRefusal(preview.result.manifestCount) };
      }
      return {
        kind: "collection",
        rootTitle: preview.rootTitle,
        rows: buildPickerRows(preview.result.manifests),
        skips: preview.result.skips,
      };
  }
}

// ── Import summary (Archie-cbf6, PLAN §6/§8). The dialog runs the batch (newExhibitsFromCollection) and
// awaits its CollectionImportOutcome; this PURE mapping turns that outcome into the summary state the dialog
// renders (headline + per-failure lines + an "…and N more" overflow), so the copy — including the
// truncate-past-10 rule and the four tones — is tested headless. The dialog owns only the markup + the Undo
// wiring; the "Import batch" (created slugs) rides the outcome, not this function.

/** How many failed manifests we name in full before collapsing the rest into "…and N more" (PLAN §6). */
export const IMPORT_FAILURE_LIST_CAP = 10;

export interface ImportSummary {
  /** success = every selected manifest imported; partial = some skipped; cancelled = user aborted;
   *  fatal = a storage write broke mid-batch and it stopped. Drives the surface's tone. */
  tone: "success" | "partial" | "cancelled" | "fatal";
  headline: string;
  /** One line per failed manifest (its label, else its URL, + the one-line reason), already truncated to
   *  IMPORT_FAILURE_LIST_CAP. Empty for a clean success. */
  failures: string[];
  /** Failures beyond the cap, elided into an "…and N more" line (0 = nothing elided). */
  overflow: number;
  /** Committed exhibits (createdSlugs.length) — the count Undo removes; Undo shows only when > 0. */
  createdCount: number;
}

const exhibitsWord = (n: number): string => `exhibit${n === 1 ? "" : "s"}`;

/** One failure line: prefer the manifest's own label, fall back to its URL, then the one-line reason. */
function failureLine(s: { id: string; label?: string; reason: string }): string {
  const name = s.label && s.label.trim() !== "" ? s.label : s.id;
  return `${name} — ${s.reason}`;
}

/** Map a finished import's outcome to its summary surface (PLAN §6). `total` is how many manifests the user
 *  selected (the outcome doesn't carry it — cancel abandons un-fetched slots without recording them). */
export function summarizeImport(outcome: CollectionImportOutcome, total: number): ImportSummary {
  const created = outcome.createdSlugs.length;
  const allFailures = outcome.skipped.map(failureLine);
  const failures = allFailures.slice(0, IMPORT_FAILURE_LIST_CAP);
  const overflow = allFailures.length - failures.length;

  // Precedence: a fatal storage stop is the most urgent thing to say, then a user cancel, then a
  // clean-but-partial result, else full success. fatal + cancelled can BOTH be set if an abort raced the
  // storage failure — fatal wins because it's the condition the user has to act on (free space / re-save).
  if (outcome.fatal !== null) {
    // Zero committed (the very first mint threw, or the batch rejected before committing) — don't say "Kept
    // the 0 exhibits that imported first"; say plainly that nothing landed.
    return {
      tone: "fatal",
      headline: created === 0
        ? "Couldn't save to this device — nothing was imported."
        : `Couldn't save to this device, so the import stopped. Kept the ${created} ${exhibitsWord(created)} that imported first.`,
      failures, overflow, createdCount: created,
    };
  }
  if (outcome.cancelled) {
    return {
      tone: "cancelled",
      headline: `Imported ${created} of ${total} ${exhibitsWord(total)} before cancelling.`,
      failures, overflow, createdCount: created,
    };
  }
  if (outcome.skipped.length > 0) {
    return {
      tone: "partial",
      headline: `Created ${created} ${exhibitsWord(created)}. ${outcome.skipped.length} couldn't be imported:`,
      failures, overflow, createdCount: created,
    };
  }
  return { tone: "success", headline: `Created ${created} ${exhibitsWord(created)}.`, failures: [], overflow: 0, createdCount: created };
}

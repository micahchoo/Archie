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
import { manifestToExhibit, ManifestImportError } from "./iiif-import.js";
import { IIIF_MANIFEST_MAX_BYTES } from "./ingest-flows.js";
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

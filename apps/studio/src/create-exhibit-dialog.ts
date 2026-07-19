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

/** The dialog's scope (Archie-beb6): today only "new-exhibit" is wired end to end — oncreate /
 *  oncreatefromfolder / oncreatefrommanifest all mint a NEW exhibit. "add-to-exhibit" is accepted
 *  as a prop-level parameter now so Archie-56cf can reuse this surface without reshaping it later,
 *  but nothing in this ticket constructs or wires that variant. */
export type CreateSurfaceScope = { kind: "new-exhibit" } | { kind: "add-to-exhibit"; slug: string; title: string };

export function surfaceTitle(scope: CreateSurfaceScope): string {
  return scope.kind === "new-exhibit" ? "New exhibit" : `Add to “${scope.title}”`;
}

export function createActionLabel(scope: CreateSurfaceScope): string {
  return scope.kind === "new-exhibit" ? "Create exhibit" : "Add to exhibit";
}

/** Whether the "Start empty" path applies to this scope — there's nothing to start empty when
 *  adding into an exhibit that already exists (unwired today; see CreateSurfaceScope above). */
export function offersStartEmpty(scope: CreateSurfaceScope): boolean {
  return scope.kind === "new-exhibit";
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

export function folderPathValid(summary: { total: number } | null): boolean {
  return !!summary && summary.total > 0;
}

export type IiifStatus = "idle" | "checking" | "valid" | "invalid";

export function iiifPathValid(status: IiifStatus): boolean {
  return status === "valid";
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
 *  `manifestToExhibit` rejects) resolves to a tagged `{status:"invalid", message}` the caller can
 *  render directly. Reuses `manifestToExhibit`/`ManifestImportError` for the manifest-shape
 *  decision — this module adds no new parsing rules, only the fetch + a plain-language mapping. */
export async function previewManifest(url: string): Promise<ManifestPreview> {
  const trimmed = url.trim();
  let json: unknown;
  try {
    const resp = await fetch(trimmed);
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

// The Safety State computation (CONTEXT.md → Persistence; ticket Archie-0b7b "One save vocabulary").
// "Safety state" is the single user-facing answer to "will my work survive?" — Saved / Saving… /
// Action needed / Failed, with STRICT precedence Failed > Action needed > Saving > Saved. It reports
// the WHOLE pipeline: the session stage (edits into the working store — exhibit-session.svelte.ts'
// `dirty` + the app-wide save-queue health, save-queue.svelte.ts) AND the mirror stage (the bound-disk
// copy — binding-store.svelte.ts' `dirty`/`busy`/`error`/`binding.kind`). "Saved" is claimed only when
// BOTH are clean.
//
// A pure function, not a rune container (cf. binding-store.svelte.ts / exhibit-session.svelte.ts, which
// own live $state) — every input here is already live state owned elsewhere; this module just names the
// decision so it's independently testable and identical at every mount site (SafetyState.svelte wraps it
// in a `$derived`).
import type { Binding } from "@render/core";
import type { SaveHealth } from "./save-queue.svelte.js";

export type SafetyStateValue = "failed" | "action-needed" | "saving" | "saved";

export interface SafetyStateInputs {
  /** Session stage, immediate: an edit made in the last debounce window, not yet even enqueued for the
   *  OPFS write (exhibit-session.svelte.ts `dirty`). Only meaningful while an exhibit is open in the
   *  editor — pass `false` at a mount site with no current exhibit (e.g. the library home). */
  sessDirty: boolean;
  /** Session stage, app-wide: the save-queue's health (save-queue.svelte.ts `saveStatus.health`) — covers
   *  every enqueued persist (notes, library metadata, the folder mirror) regardless of which exhibit. */
  saveHealth: SaveHealth;
  /** Mirror stage: where the library's canonical bytes live (binding-store.svelte.ts `binding.kind`). */
  bindingKind: Binding["kind"];
  /** Mirror stage: unsaved-to-disk at the library scale (binding-store.svelte.ts `dirty`). Always false
   *  while unbound — an unbound library has no disk copy to fall behind. */
  bindingDirty: boolean;
  /** Mirror stage: a Save/Open is in flight (binding-store.svelte.ts `busy`) — the needed act is already
   *  underway, so it reads as progress (Saving…), not as still-needed. */
  bindingBusy: boolean;
  /** Mirror stage: a bound location's write failed / is unreachable, or null (binding-store.svelte.ts
   *  `error`). Sticky until the user acts (retry) or the condition clears. */
  bindingError: string | null;
  /** True once ANY exhibit has left template/seed status — real, user-authored content exists (App.svelte's
   *  `templateSlugs`, seeded from seed-data.ts' DEFAULT_EXHIBITS). Only consulted while unbound: an
   *  untouched seed library is never "Action needed" (CONTEXT.md — "never for untouched seed/template
   *  content"). Use `hasRealWorkIn` to compute this from `exhibits` + `isTemplate`. */
  hasRealWork: boolean;
}

/** Library-level identity a user can author WITHOUT creating an exhibit: title / summary / credit /
 *  required-statement (App.svelte's setLibraryTitle/Summary/Rights → lib.meta). No stored "dirty" flag
 *  exists for these (they're not model additions — Archie-c76d forbids new fields), so "edited" = any of
 *  them is present. Empty strings / undefined = untouched. */
export interface LibraryMetaLike {
  title?: string;
  summary?: string;
  rights?: string;
  requiredStatement?: unknown;
}
export function libraryMetaEdited(meta: LibraryMetaLike | undefined): boolean {
  if (!meta) return false;
  return !!(meta.title?.trim() || meta.summary?.trim() || meta.rights || meta.requiredStatement);
}

/** Real, user-authored content exists when either (a) some exhibit is no longer a template/seed slug —
 *  the per-exhibit playground gate (§115) — OR (b) library-level meta has been edited (Archie-c76d
 *  decision (d): title/summary/rights count as work for the unbound Action-needed gate). `libraryMeta`
 *  is optional so the original two-arg callers (and tests) that only weigh exhibits stay valid. */
export function hasRealWorkIn(
  exhibits: readonly { slug: string }[],
  isTemplate: (slug: string) => boolean,
  libraryMeta?: LibraryMetaLike,
): boolean {
  return exhibits.some((e) => !isTemplate(e.slug)) || libraryMetaEdited(libraryMeta);
}

/**
 * The one decision. Evaluated top-down in precedence order — each predicate is independent, strict
 * precedence just picks the first that's true:
 *   1. Failed        — a write errored (queue-wide) or the mirror stage is sticky-unreachable.
 *   2. Action needed  — the mirror stage can't auto-complete and nothing is currently trying: a `file`
 *                        binding has gone stale (needs an explicit flush), or the library is `unbound`
 *                        with real work (needs an explicit first bind). Both exclude `bindingBusy` — once
 *                        the act is underway, it reads as progress, not as still-needed. `folder` never
 *                        qualifies (CONTEXT.md: a folder auto-mirrors — its stage always auto-completes).
 *   3. Saving         — something is provably in flight or not yet even queued: an immediate session
 *                        edit pending its debounce, the app-wide queue draining, an explicit Save/Open in
 *                        flight, or a `folder` binding whose mirror hasn't caught up yet.
 *   4. Saved          — the default: nothing dirty, nothing in flight, nothing failed.
 */
export function computeSafetyState(inputs: SafetyStateInputs): SafetyStateValue {
  const { sessDirty, saveHealth, bindingKind, bindingDirty, bindingBusy, bindingError, hasRealWork } = inputs;

  if (saveHealth === "error" || bindingError !== null) return "failed";

  const actionNeeded =
    !bindingBusy &&
    ((bindingKind === "file" && bindingDirty) || (bindingKind === "unbound" && hasRealWork));
  if (actionNeeded) return "action-needed";

  const saving =
    sessDirty || saveHealth === "saving" || bindingBusy || (bindingKind === "folder" && bindingDirty);
  if (saving) return "saving";

  return "saved";
}

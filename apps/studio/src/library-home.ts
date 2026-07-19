// Studio Library home — pure, framework-free helpers (cf. gallery-data.ts) for the Archie-2308 layout:
// SafetyState moved to the header, so the project bar demotes to a one-line "where does this live"
// statement; the grid splits into an "own exhibits" shelf (+ New-exhibit cell) leading a collapsible
// Examples shelf. Kept out of LibraryHome.svelte so the phrasing + collapse rule are unit-testable
// headless, the same split gallery-data.ts already draws for flatten/cover/filter.
import type { Binding } from "@render/core";

/**
 * The project bar's ONE-LINE "where does this live" phrase (Archie-2308 / CONTEXT.md → Persistence).
 * SafetyState now owns every save-state word (Saved/Saving/Action needed/Failed) at the library HEADER,
 * so this line states location ONLY — never dirty/auto-mirror mechanics, never "Save".
 */
export function bindingLocationLabel(binding: Binding): string {
  if (binding.kind === "unbound") return "this browser";
  const kind = binding.kind === "folder" ? "folder" : "file";
  return `${kind} “${binding.name ?? ""}”`;
}

/**
 * The Examples shelf's default open/closed state (Archie-2308): expanded when the user owns nothing yet
 * (so the playground is the first thing they see), auto-collapsed to its header line once they have
 * their own work to look at instead. A pure predicate over the COUNT (not the component's live $state)
 * so the shelf-collapse rule is independently testable; LibraryHome seeds a local $state from this once
 * — a later manual toggle is the user's call, not re-decided by this function on every render.
 */
export function examplesDefaultOpen(ownExhibitCount: number): boolean {
  return ownExhibitCount === 0;
}

/** Split a library's exhibits into the user's own (non-template) and the bundled Examples, preserving
 *  each subset's relative order (library order). Own exhibits + the New-exhibit cell lead the grid;
 *  Examples sit in their own shelf below (Archie-2308 item 4). */
export function partitionExhibits<T extends { slug: string }>(
  exhibits: ReadonlyArray<T>,
  isTemplate: (slug: string) => boolean,
): { own: T[]; examples: T[] } {
  const own: T[] = [];
  const examples: T[] = [];
  for (const e of exhibits) (isTemplate(e.slug) ? examples : own).push(e);
  return { own, examples };
}

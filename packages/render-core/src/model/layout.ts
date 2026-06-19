// Layout resolution (CONTEXT §Layout v1: Single + Grid + Narrative; ADR-0016 "narrative as an
// emergent reading mode"). The leading surface is a PURE FUNCTION OF CONTENT — `resolveLayout`
// always DERIVES the type (sections → narrative, multiple objects → grid, one object → single)
// and IGNORES any author-stored `exhibit.layout` (deprecated; see model.ts). Slideshow is a Grid
// MODE, not a type. Pure; the UI renders from this descriptor.

import type { AObject, Exhibit, LayoutType, Section } from "./model.js";

export interface LayoutDescriptor {
  type: LayoutType;
  objects: AObject[];
  /** Present only for narrative layouts. */
  sections?: Section[];
}

// The type discriminant in exactly one place (ADR-0016: single source of truth). `resolveLayout`
// and the Studio's display-only `currentLayout` both DELEGATE here — no hand-copied discriminant.
// Pure; depends only on the two `.length` counts, so any content shape (Exhibit, WorkingExhibitMeta)
// can pass its own `objects`/`sections`.
export function resolveLayoutType(
  objects: { length: number },
  sections?: { length: number } | undefined,
): LayoutType {
  return (sections?.length ?? 0) > 0 ? "narrative" : objects.length > 1 ? "grid" : "single";
}

export function resolveLayout(exhibit: Exhibit): LayoutDescriptor {
  // Derive from content only — `exhibit.layout` is deprecated and intentionally NOT consulted
  // (ADR-0016): the reading mode emerges from what the exhibit contains, not a stored declaration.
  const type: LayoutType = resolveLayoutType(exhibit.objects, exhibit.sections);
  return {
    type,
    objects: exhibit.objects,
    ...(type === "narrative" && exhibit.sections ? { sections: exhibit.sections } : {}),
  };
}

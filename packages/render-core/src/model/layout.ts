// Layout resolution (CONTEXT §Layout v1: Single + Grid + Narrative). "Layout = the author's
// declaration of reading intent" — the explicit `exhibit.layout` wins; otherwise infer (sections
// → narrative, multiple objects → grid, one object → single). Slideshow is a Grid MODE, not a
// type. Pure; the UI renders from this descriptor.

import type { AObject, Exhibit, LayoutType, Section } from "./model.js";

export interface LayoutDescriptor {
  type: LayoutType;
  objects: AObject[];
  /** Present only for narrative layouts. */
  sections?: Section[];
}

export function resolveLayout(exhibit: Exhibit): LayoutDescriptor {
  const type: LayoutType =
    exhibit.layout ??
    (exhibit.sections && exhibit.sections.length > 0 ? "narrative" : exhibit.objects.length > 1 ? "grid" : "single");
  return {
    type,
    objects: exhibit.objects,
    ...(type === "narrative" && exhibit.sections ? { sections: exhibit.sections } : {}),
  };
}

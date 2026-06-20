// Exhibit↔Library up-navigation model (CONTEXT deep-link decision §125: a clickable
// `Project›Exhibit›Section›Object` breadcrumb, "always shown + clickable"; `Project` = the Gallery,
// doubling as the "what else is here" affordance). Pure: takes resolved labels, emits crumbs whose
// hashes come from routeToHash so the shell just renders <a href={crumb.hash}>. The render is the
// app's (apps/viewer); this is the testable model.

import { routeToHash, type ViewerRoute } from "./route.js";

export interface Crumb {
  label: string;
  /** Target hash for this level (always navigable, per CONTEXT §125). */
  hash: string;
  /** Which trail level this crumb is. Lets the render special-case the Exhibit level — whose
   *  "natural start" (CONTEXT §142) is the OVERVIEW for a multi-object exhibit but the lone item for a
   *  single-object one, and whose object selection is component-local (un-routed), so the shell resets
   *  that state on click instead of relying on a hash change that wouldn't fire. */
  level: "library" | "exhibit" | "section";
}

export interface BreadcrumbContext {
  /** Display label for the Gallery/top level; falls back to "Gallery". */
  libraryLabel?: string;
  /** Resolved exhibit title; falls back to the slug. */
  exhibitTitle?: string;
  /** Resolved label for the landed note/section level (omit → no third crumb). */
  sectionLabel?: string;
}

/** Build the breadcrumb trail for a route. Top crumb (`#/`) is always the Gallery. */
export function breadcrumbFor(route: ViewerRoute, ctx: BreadcrumbContext = {}): Crumb[] {
  const gallery: Crumb = { label: ctx.libraryLabel ?? "Gallery", hash: "#/", level: "library" };
  if (route.view === "gallery") return [gallery];

  const crumbs: Crumb[] = [
    gallery,
    { label: ctx.exhibitTitle ?? route.slug, hash: routeToHash({ view: "exhibit", slug: route.slug }), level: "exhibit" },
  ];
  // Section/Object level only when we landed deep AND the shell resolved a label for it.
  if (route.noteId && ctx.sectionLabel) {
    crumbs.push({ label: ctx.sectionLabel, hash: routeToHash(route), level: "section" });
  }
  return crumbs;
}

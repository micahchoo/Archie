// Publish-time torn ANNOTATION store surfacing (Archie-a690) — warn parity with the structure
// side's warns in publish-flows.svelte.ts#getStructure. Lives in its own tiny module (not in
// publish-flows) because the caller is App.svelte's loadAllLogs, which is in the STARTUP chunk —
// publish-flows is lazily imported and must stay out of that chunk. Type-only @render/core
// import keeps this module weightless.
import type { CorruptAnnotationPage } from "@render/core";

/** One exhibit's torn-store finding, carried from the publish loaders into the Publish dialog's
 *  pre-publish advisory (Archie-a690 remaining scope). BOTH log families share this shape so the
 *  dialog renders one advisory list. `allCorrupt` is the load-bearing distinction: true = the
 *  export drops this family entirely and reads as never-authored; false = the readable subset ships.
 *  Type-only, so importing it into the lazy publish-flows / Publish.svelte adds no runtime weight. */
export interface CorruptLogFinding {
  slug: string;
  family: "annotations" | "sections";
  corruptCount: number;
  /** true → all pages unreadable, so nothing of this family ships (reads as never-authored). */
  allCorrupt: boolean;
}

/** Warn when annotation history publishes from a torn store, AND return the finding for the dialog
 *  advisory (null = clean, nothing to surface). Called by the App's `loadAllLogs` ONLY on the publish
 *  path (the same loader also feeds citation building, where a "Publish:" warn would be a lie).
 *  Posture matches structure (Archie-aef4): publish ships what READS; all-corrupt → the export carries
 *  no annotations (reads as never-authored — the rule-2 collapse, made loud); partial-corrupt → the
 *  readable entries ship, with an advisory. */
export function warnAnnotationPublishCorruption(slug: string, entryCount: number, corrupt: readonly CorruptAnnotationPage[]): CorruptLogFinding | null {
  if (corrupt.length === 0) return null;
  const allCorrupt = entryCount === 0;
  if (allCorrupt) {
    console.warn(`Publish: exhibit "${slug}" annotation history was NOT exported — all ${corrupt.length} of its history page(s) are unreadable, so the published library will look as if it never had annotations. The local store is untouched; repair it before sharing.`, corrupt);
  } else {
    console.warn(`Publish: exhibit "${slug}" has ${corrupt.length} unreadable annotation history page(s); publishing the readable annotations`, corrupt);
  }
  return { slug, family: "annotations", corruptCount: corrupt.length, allCorrupt };
}

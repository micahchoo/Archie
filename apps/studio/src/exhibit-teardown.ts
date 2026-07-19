// The ONE exhibit-teardown definition (Archie-ddaa). Removing an exhibit is NOT meta-only: before the
// library.json entry goes, each exhibit's session + on-disk logs must be torn down, or a recreated same-slug
// exhibit (ids are deterministic `ex-${slug}`) RESURRECTS the orphaned annotation/structure logs. The singular
// per-exhibit delete (App.svelte's removeExhibitById) always did this; bulk delete and undo-import went
// straight to the meta-only `lib.removeExhibits` and skipped it. This helper is the single place the teardown
// sequence lives — App wires the real session/store deps in; removeExhibitById delegates here with one slug.
//
// Ordering is deliberate and matches the singular path exactly (render-core "content first, marker LAST"):
// per slug we forget the session (only when it's the loaded exhibit — Archie-79be), drop the structure
// session's cached log then its on-disk dir (Archie-2a9a), then wipe the annotation log — ALL on-disk content
// first — and only THEN remove the library.json entries in one meta write (the commit point). A torn run
// leaves logs gone but meta possibly stale, which reads as a degraded-but-safe exhibit, never a resurrection.

export interface ExhibitTeardownDeps {
  /** The currently-loaded exhibit's slug — its session/assets get the extra teardown a background slug doesn't. */
  currentSlug: string;
  /** `sess.forgetCurrent()` — nulls the session's annDir so a later openExhibit flush can't recreate the log. */
  forgetCurrentSession: () => void;
  /** `structure.forget(slug)` — bumps the forget generation so an in-flight load/persist can't recreate it. */
  forgetStructure: (slug: string) => void;
  /** `clearExhibitStructure(slug)` — remove the exhibit's on-disk structure rev-log dir (flag-independent). */
  clearStructure: (slug: string) => Promise<void>;
  /** `clearExhibitAnnotations(slug)` — remove the exhibit's on-disk annotation log. */
  clearAnnotations: (slug: string) => Promise<void>;
  /** `lib.removeExhibits(slugs)` — ONE meta mutation + ONE persist + ONE signal (the commit point). */
  removeMeta: (slugs: string[]) => Promise<void>;
  /** `assets.revokeAll()` — free the loaded exhibit's blob: URLs; fires once, only if a deleted slug was loaded. */
  revokeAssets: () => void;
}

/** Tear down N exhibits, then remove their metadata in one write. Safe for background slugs (session/asset
 *  teardown fires only for the loaded target) and idempotent on unknown slugs (removeMeta ignores absent ones). */
export async function teardownAndRemoveExhibits(deps: ExhibitTeardownDeps, slugs: string[]): Promise<void> {
  let hadLoaded = false;
  for (const slug of slugs) {
    if (slug === deps.currentSlug) {
      deps.forgetCurrentSession();
      hadLoaded = true;
    }
    deps.forgetStructure(slug);
    await deps.clearStructure(slug);
    await deps.clearAnnotations(slug);
  }
  await deps.removeMeta(slugs);
  if (hadLoaded) deps.revokeAssets();
}

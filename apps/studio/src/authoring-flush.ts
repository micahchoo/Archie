/** The one authoring-to-export barrier shared by Publish and project Save. */
export function createAuthoringFlush(
  saveCurrentExhibit: () => Promise<void>,
  flushStructure: (slug: string) => Promise<void>,
  currentSlug: () => string,
  flushLibrary?: () => Promise<boolean | void>,
): () => Promise<void> {
  return async () => {
    await saveCurrentExhibit();
    await flushStructure(currentSlug());
    // Library-level edits (title, rights, exhibit metadata) use their own debounced queue. A
    // project Save/Publish must await that queue too, otherwise a failed metadata write cannot be
    // retried by the same Save action and exports can observe stale library.json.
    const libraryResult = await flushLibrary?.();
    if (libraryResult === false) throw new Error("Library details were not stored; retry is required.");
  };
}

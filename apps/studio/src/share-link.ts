// Minting the viewer links Studio hands out (Archie-4f7c).
//
// THE DEFECT THIS FIXES. Publish.svelte minted `${CANONICAL_VIEWER}?src=<url>` — a REAL query param,
// before any hash. The viewer never reads one: `ViewerShell.svelte:55,136` calls
// `parseRoute(location.hash)`, and `location.search` is read nowhere in apps/viewer/src. So the
// pointer was dropped and every link opened the bare Library Gallery instead of the shared library.
// Every share link a user copied, and every iframe snippet (embedSnippet derives from shareLink),
// was dead on arrival — silently, because the viewer loads perfectly and simply shows the wrong thing.
//
// The grammar was never ambiguous: `url/route.ts:8-11` documents `?src=` as living INSIDE the hash
// and composing with any route (`#/voynich/a/n3?src=…` opens the zip AND deep-links), and ADR-0009
// says the same. `parseRoute` even proves it — it slices the leading `#`, then looks for `?` in what
// remains. A real query param is invisible to it.
//
// WHY THIS MODULE EXISTS AT ALL, rather than a one-character fix in the component. The old form was
// a `$derived.by` inside Publish.svelte, so nothing could test it: vitest does not render the
// component, and svelte-check cannot tell a working URL grammar from a broken one. Extracting the
// pure part makes the round-trip assertion in share-link.test.ts possible — mint a link, hand its
// hash to the REAL `parseRoute`, and assert the src comes back. That test fails against the old
// form, which is the only reason to trust it.

/**
 * The canonical viewer link for a hosted `.archie.zip`.
 *
 * Returns "" for empty/unusable input (a junk string must compose a junk link, not a broken one) —
 * callers branch on the empty string to hide the share affordances entirely.
 *
 * @param canonicalViewer e.g. "https://micahchoo.github.io/Archie/viewer/" (origin + viewerPath)
 * @param zipUrl the hosted archive URL the user pasted
 */
export function viewerShareLink(canonicalViewer: string, zipUrl: string): string {
  const u = zipUrl.trim();
  if (!u) return "";
  try {
    const p = new URL(u);
    // Only http(s) — a `javascript:` or `data:` string must never be composed into a link we hand
    // the user to paste elsewhere.
    if (p.protocol !== "https:" && p.protocol !== "http:") return "";
  } catch {
    return "";
  }
  // `#/?src=…` — the hash-query grammar route.ts parses. The `/` before `?` is the empty path that
  // means "the Gallery", exactly as `parseRoute("#/?src=x")` reads it; it is not decoration, it
  // keeps the form identical to every other route so a deep-linked variant is a pure suffix change.
  return `${canonicalViewer}#/?src=${encodeURIComponent(u)}`;
}

/** The iframe embed for a share link. Empty in, empty out — same contract as viewerShareLink. */
export function viewerEmbedSnippet(shareLink: string): string {
  if (shareLink === "") return "";
  return `<iframe src="${shareLink}" width="100%" height="600" style="border:0" allowfullscreen loading="lazy" referrerpolicy="no-referrer" title="Archie exhibit"></iframe>`;
}

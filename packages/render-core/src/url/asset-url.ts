// Resolving a published tree's asset references (V7 / V11).
//
// A published manifest carries object sources and covers as TREE-RELATIVE paths —
// `screenshots/assets/o1-e1-embed.png` — which are meaningless without the library base they are
// relative TO. Handed straight to the DOM they resolve against `document.baseURI`, i.e. whatever
// directory the current page happens to sit in.
//
// This bit twice, in two consumers, which is why the rule lives here now:
//
//   V7  (app)   the gallery resolved a tree-relative cover against the page directory.
//   V11 (embed) measured 2026-07-25 driving `recipes/try.html`:
//                 HTTP 404 /recipes/screenshots/assets/o1-e1-embed.png
//               — the library base is `/apps/viewer/public/published/`, and the host page's
//               directory is `/recipes/`.
//
// The embed's exposure is strictly WORSE, and that is the reason to share rather than re-fix.
// `<archie-viewer src="…">` is loaded from an ARBITRARY host page at an arbitrary path, so the
// host's directory is never the library base. In the app the two coincided often enough to hide it.
//
// A second copy of this rule is exactly how V7 and V11 drifted apart in the first place, so
// `publishedAssetUrl` (apps/viewer) is now a thin wrapper over this, not a parallel implementation.

/**
 * Resolve one asset reference against a library `base`.
 *
 * Pass-through, unchanged, for anything that already knows where it lives:
 *   - absolute with a scheme  (`https:…`, `blob:…`, `data:…`)
 *   - protocol-relative       (`//host/…`)
 *   - root-anchored           (`/published/…`)
 * Everything else is tree-relative and is anchored to `base`.
 *
 * `blob:` matters here beyond tidiness: the ZIP/portable path mints blob URLs for its assets
 * (loadPortableExhibit, ADR-0010), and rewriting one would break it. It is covered by the scheme
 * test rather than by a special case, but it is the reason that test comes first.
 *
 * Empty / whitespace / nullish → `undefined`, so a caller can spread it away rather than emitting
 * an `src=""` (which browsers resolve to the current document — the same class of bug).
 */
export function assetUrlAgainst(base: string, ref: string | undefined | null): string | undefined {
  const r = (ref ?? "").trim();
  if (!r) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(r) || r.startsWith("//") || r.startsWith("/")) return r;
  return `${base.replace(/\/+$/, "")}/${r}`;
}

// Shared title-search primitive (SCALE-GALLERY spike-0004 §4 / spike-0003 §4). The Studio overview
// toolbar, the Studio all-images wall, and the Viewer Gallery all filter by Object/Exhibit TITLE with ONE
// definition — a case-insensitive, diacritic-insensitive substring test, so "muller" matches "Müller".
// DISTINCT from the full-text annotation search (MiniSearch, apps/viewer/src/lib/search-index.ts): titles
// are short, and substring is the right shape for them.

/** NFKD-fold: decompose, strip combining marks, lowercase — so accent/case differences don't block a match. */
function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Does `title` contain `query`, ignoring case and diacritics? An empty / whitespace-only query matches all. */
export function matchesTitle(title: string, query: string): boolean {
  const q = fold(query.trim());
  if (q === "") return true;
  return fold(title).includes(q);
}

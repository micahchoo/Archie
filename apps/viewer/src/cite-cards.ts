// Cite-card splitting: turn a BLOCK exhibit cite (a paragraph whose only content is an exhibit-cite
// link) into a rich preview card, leaving everything else — inline cites, note cites, external links —
// as plain prose. Operates on the sanitized HTML renderMarkdown produces (snarkdown wraps a standalone
// link line in its own `<p><a>…</a></p>`, so block cites are cleanly detectable; splitting only on
// COMPLETE `<p>…</p>` units keeps every html segment balanced — no mid-paragraph cuts). Pure + tested.
import { citedExhibitSlug } from "@render/core";

export type ProseSegment =
  | { kind: "html"; html: string }
  | { kind: "cite"; slug: string; label: string };

// A paragraph containing ONLY an anchor (optional surrounding whitespace) — a standalone-link line.
const CITE_PARAGRAPH = /<p>\s*<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>\s*<\/p>/gi;

/**
 * Split rendered prose HTML into ordered segments, promoting each block exhibit-cite paragraph to a
 * `cite` segment (the Viewer renders these as ExhibitCiteCard); all other content stays `html`. A
 * paragraph whose link is a note cite / external / unknown slug is left in the html (a plain link).
 */
export function splitProseCites(html: string, knownSlugs: ReadonlySet<string>): ProseSegment[] {
  if (typeof html !== "string" || html.length === 0) return [];
  const out: ProseSegment[] = [];
  let last = 0;
  for (const m of html.matchAll(CITE_PARAGRAPH)) {
    const slug = citedExhibitSlug(m[1]!, knownSlugs);
    if (slug === null) continue; // not a block exhibit cite — leave the paragraph as html (plain link)
    const start = m.index!;
    if (start > last) out.push({ kind: "html", html: html.slice(last, start) });
    out.push({ kind: "cite", slug, label: m[2]! });
    last = start + m[0].length;
  }
  if (last < html.length) out.push({ kind: "html", html: html.slice(last) });
  return out.length > 0 ? out : [{ kind: "html", html }];
}

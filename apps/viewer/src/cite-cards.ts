// Cite-card splitting: turn a BLOCK cite (a standalone-link "line" — an <a> alone on its own line)
// into a rich typed preview, leaving inline cites and external links as plain prose. Operates on the
// HTML renderMarkdown produces. NOTE: renderMarkdown = sanitizeHtml(snarkdown(...)) emits NO <p> tags —
// snarkdown turns paragraph breaks into <br> and a standalone link into a bare <a>. So a block cite is
// an <a> that is ALONE on its <br>-delimited line (an earlier <p><a></p> assumption never matched real
// output — cards silently never formed). Pure + tested against real renderMarkdown output.
//
// Phase 4 (ADR-0018): promotion is TYPE-AWARE — `classifyCite` sorts each block cite into the ladder
// (exhibit / object / note / region), and ProseCites renders each kind with its own card. External /
// cross-library / unknown-slug links stay plain html (a plain link).
import { classifyCite, type ClassifiedCite } from "@render/core";

export type ProseSegment =
  | { kind: "html"; html: string }
  | { kind: "cite"; cite: ClassifiedCite; label: string };

const BR = /<br\s*\/?>/i;
// A "line" that is SOLELY an anchor (after trim) — snarkdown's standalone-link form.
const ONLY_LINK = /^<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>$/i;

/**
 * Split rendered prose HTML into ordered segments, promoting each standalone-link line that resolves to
 * a same-library cite into a typed `cite` segment (the Viewer renders the type's card); everything else
 * stays `html`. Splits on snarkdown's `<br>` line breaks, so it matches real renderMarkdown output.
 * Inline cites (a link amid other text on a line) and external / cross-library / unknown-slug links stay html.
 */
export function splitProseCites(html: string, knownSlugs: ReadonlySet<string>): ProseSegment[] {
  if (typeof html !== "string" || html.length === 0) return [];
  const lines = html.split(BR);
  const out: ProseSegment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length > 0) {
      out.push({ kind: "html", html: buf.join("<br>") });
      buf = [];
    }
  };
  for (const line of lines) {
    const m = line.trim().match(ONLY_LINK);
    if (m) {
      const cite = classifyCite(m[1]!, knownSlugs);
      if (cite.kind !== "external") {
        flush(); // the card is a block element, so the surrounding <br> separators are dropped
        // The cards render the label as TEXT ({label} / title=), so strip any inline markup snarkdown
        // emitted from emphasis/code in the link text (e.g. <em>…</em>) — else the raw tags show.
        out.push({ kind: "cite", cite, label: m[2]!.replace(/<[^>]*>/g, "") });
        continue;
      }
    }
    buf.push(line);
  }
  flush();
  return out.length > 0 ? out : [{ kind: "html", html }];
}

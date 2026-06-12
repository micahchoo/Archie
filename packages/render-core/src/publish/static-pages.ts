// Static pages — the self-describing published artifact (ADR-0014 / archie-linkability Q-2).
// Pure string builders (site.ts does the IO): a library landing page, a per-exhibit page carrying
// the FULL heads projection's note texts with per-note anchors (`note-<logicalId>` — the DURABLE
// REF; frozen grammar, see static-pages.test.ts), and sitemap.txt. This is an archival/citation
// surface, NOT a second exhibit UI — zero JavaScript, tiny inline style, links out to the
// interactive Viewer when `viewerBase` is known. Bodies render through the injected `renderBody`
// (Studio passes the SAME snarkdown+DOMPurify pipeline the live Viewer uses — P-1 Q3's no-drift
// invariant); the default renderer ESCAPES everything (the safe floor for non-DOM contexts).

import type { Library, Exhibit } from "../model/model.js";
import type { AnnotationRecord } from "../wadm/types.js";
import { recordToAnnotation } from "../spine/serialize.js";
import { targetSource } from "../spine/serialize.js";
import { commentOfAnnotation, tagsOfAnnotation } from "../query/published.js";

export interface StaticPageOptions {
  baseUrl: string;
  /** The interactive Viewer's base URL (the canonical instance). Absent = no outbound links. */
  viewerBase?: string;
  /** Markdown → SAFE html. Default escapes everything (entity-encoded, paragraph breaks only). */
  renderBody?: (md: string) => string;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The escape-only body renderer: entity-encode, keep paragraph structure. The XSS floor. */
export const escapeBody = (md: string): string =>
  `<p>${esc(md).replace(/\r?\n\r?\n+/g, "</p>\n<p>").replace(/\r?\n/g, "<br>")}</p>`;

// One shared, deliberately minimal chrome: readable column, no script, archival tone.
const STYLE = `body{max-width:42rem;margin:2rem auto;padding:0 1rem;font-family:Georgia,serif;line-height:1.55;color:#222}h1,h2{line-height:1.2}article{margin:1.5rem 0;padding:0.75rem 1rem;border-left:3px solid #3a6b4c;background:#f7f5f0}article .reading{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:#9a6f1e}article .tags,footer,.credit{color:#666;font-size:0.9rem}a{color:#3a6b4c}`;

function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
<footer>Published with Archie — this page is the exhibit&#8217;s archival text; annotations and deep zoom live in the interactive viewer.</footer>
</body>
</html>
`;
}

/** sitemap.txt — exactly the emitted pages: library first, then exhibits in library order. */
export function sitemapTxt(library: Library, baseUrl: string): string {
  return [`${baseUrl}index.html`, ...library.exhibits.map((e) => `${baseUrl}${e.slug}/index.html`)].map((u) => `${u}\n`).join("");
}

/** The library landing page — the human entry a published data repo never had. */
export function libraryPageHtml(library: Library, opts: StaticPageOptions): string {
  const parts: string[] = [];
  parts.push(`<h1>${esc(library.title ?? "Library")}</h1>`);
  if (library.summary) parts.push(`<p>${esc(library.summary)}</p>`);
  if (library.requiredStatement) parts.push(`<p class="credit">${esc(library.requiredStatement.label)}: ${esc(library.requiredStatement.value)}</p>`);
  if (opts.viewerBase) parts.push(`<p><a href="${esc(opts.viewerBase)}">Open the interactive viewer</a></p>`);
  parts.push("<ul>");
  for (const e of library.exhibits) {
    parts.push(`<li><a href="${esc(e.slug)}/index.html">${esc(e.title)}</a>${e.summary ? ` — ${esc(e.summary)}` : ""}</li>`);
  }
  parts.push("</ul>");
  return pageShell(library.title ?? "Library", parts.join("\n"));
}

/**
 * The per-exhibit archival page. `records` = the FULL heads projection (all readings — a
 * reading-scoped citation must resolve), with in-body `archie:` refs already rewritten to display
 * URLs (the same projection rule the JSON heads pages use). Notes group under their object where
 * the target matches a canvas IRI; exhibit/library-level prose lands in an "Exhibit notes" section.
 */
export function exhibitPageHtml(exhibit: Exhibit, records: AnnotationRecord[], opts: StaticPageOptions): string {
  const render = opts.renderBody ?? escapeBody;
  const readings = exhibit.readings ?? [];
  const readingName = (rid: string | undefined): string | undefined =>
    rid === undefined ? undefined : (readings.find((r) => r.id === rid)?.name ?? rid);
  const canvasIRI = (objId: string) => `${opts.baseUrl}${exhibit.slug}/canvas/${objId}`;

  const noteHtml = (rec: AnnotationRecord): string => {
    const ann = recordToAnnotation(rec, rec.logicalId);
    const comment = commentOfAnnotation(ann);
    const tags = tagsOfAnnotation(ann);
    const rname = readingName(rec.reading);
    const live = opts.viewerBase ? `${opts.viewerBase}#/${exhibit.slug}/a/${rec.logicalId}` : undefined;
    return [
      `<article id="note-${rec.logicalId}">`,
      ...(rname !== undefined ? [`<div class="reading">${esc(rname)}</div>`] : []),
      render(comment),
      ...(tags.length > 0 ? [`<div class="tags">${tags.map((t) => `#${esc(t)}`).join(" ")}</div>`] : []),
      ...(live ? [`<div class="tags"><a href="${esc(live)}">View on the image</a></div>`] : []),
      `</article>`,
    ].join("\n");
  };

  const parts: string[] = [];
  parts.push(`<p><a href="../index.html">${esc("← Library")}</a></p>`);
  parts.push(`<h1>${esc(exhibit.title)}</h1>`);
  if (exhibit.summary) parts.push(`<p>${esc(exhibit.summary)}</p>`);
  if (exhibit.requiredStatement) parts.push(`<p class="credit">${esc(exhibit.requiredStatement.label)}: ${esc(exhibit.requiredStatement.value)}</p>`);
  if (opts.viewerBase) parts.push(`<p><a href="${esc(opts.viewerBase)}#/${esc(exhibit.slug)}">Open this exhibit in the interactive viewer</a></p>`);

  const used = new Set<AnnotationRecord>();
  for (const obj of exhibit.objects) {
    const mine = records.filter((r) => targetSource(r) === canvasIRI(obj.id));
    if (mine.length === 0) continue;
    parts.push(`<h2>${esc(obj.label)}</h2>`);
    for (const r of mine) {
      parts.push(noteHtml(r));
      used.add(r);
    }
  }
  const rest = records.filter((r) => !used.has(r));
  if (rest.length > 0) {
    parts.push(`<h2>Exhibit notes</h2>`);
    for (const r of rest) parts.push(noteHtml(r));
  }
  return pageShell(`${exhibit.title}${" — archival text"}`, parts.join("\n"));
}

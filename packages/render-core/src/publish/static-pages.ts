// Static pages — the self-describing published artifact (ADR-0014 / archie-linkability Q-2).
// Pure string builders (site.ts does the IO): a library landing page, a per-exhibit page carrying
// the FULL heads projection's note texts with per-note anchors (`note-<logicalId>` — the DURABLE
// REF; frozen grammar, see static-pages.test.ts), and sitemap.txt. This is an archival/citation
// surface, NOT a second exhibit UI — zero JavaScript, tiny inline style, links out to the
// interactive Viewer when `viewerBase` is known. Bodies render through the injected `renderBody`
// (Studio passes the SAME snarkdown+DOMPurify pipeline the live Viewer uses — P-1 Q3's no-drift
// invariant); the default renderer ESCAPES everything (the safe floor for non-DOM contexts).

import type { Library, Exhibit, RightsFields } from "../model/model.js";
import type { AnnotationRecord } from "../wadm/types.js";
import { cslItemFor, citationText, apaText, bibtexText, type CslItem } from "../cite/citation.js";
import { recordToAnnotation } from "../spine/serialize.js";
import { targetSource } from "../spine/serialize.js";
import { commentOfAnnotation, tagsOfAnnotation } from "../query/published.js";
import { metadataRows } from "../model/metadata-display.js";
import { licenseLabel } from "../iiif/rights.js";

export interface StaticPageOptions {
  baseUrl: string;
  /** The interactive Viewer's base URL (the canonical instance). Absent = no outbound links. */
  viewerBase?: string;
  /** Markdown → SAFE html. Default escapes everything (entity-encoded, paragraph breaks only). */
  renderBody?: (md: string) => string;
  /** The artifact's true publish time (ISO 8601). Threaded into JSON-LD `datePublished`/`dateModified`
   *  and the sitemap `<lastmod>`. Absent = those fields are omitted (the honest default). */
  publishedAt?: string;
  /**
   * A note's BIOGRAPHY: logicalId → every deduped record for it, oldest first (Archie-a1d4). Exactly
   * what `recordsByLogicalId` returns and what the JSON history sidecar is built from — one grouping,
   * so the rendered version numbers cannot drift from the citation ids.
   *
   * Absent = no version block, and the page is byte-identical to before. That matters: a publish
   * without a log, and every pre-existing caller, must keep their current output.
   */
  history?: ReadonlyMap<string, readonly AnnotationRecord[]>;
}

/** The SEO head projection a page carries (Q-8): Open Graph + Twitter card + a canonical link + one
 *  schema.org JSON-LD object. URLs are ABSOLUTE (built from the publish baseUrl). */
export interface PageMeta {
  title: string;
  description?: string;
  /** ABSOLUTE og:image URL. OMITTED when the tree carries no image to point at — advertising a card
   *  that was never written is worse than carrying no card (Archie-5a15: both static pages named
   *  `og-card.png`, nothing in the repo ever wrote one, and it 404'd on the live site). */
  ogImage?: string;
  /** ABSOLUTE canonical URL of this page. */
  canonical: string;
  /** og:type — "article" for an exhibit, "website" for the library landing. */
  ogType: "article" | "website";
  /** The schema.org object serialized into `<script type="application/ld+json">`. */
  jsonLd: Record<string, unknown>;
  /** The CSL item this page is citable as (Archie-321c) — projected to `citation_*` + `DC.*` tags,
   *  which is what Zotero's and Google Scholar's translators actually read. Absent = no tags. */
  csl?: CslItem;
}

/**
 * The machine-citable head block (Archie-321c): Google Scholar's `citation_*` names plus the
 * Dublin Core `DC.*` set. These are what a reference manager's page translator reads — Zotero's
 * generic translator looks for exactly these, and finds neither OpenGraph nor schema.org JSON-LD
 * sufficient for an item type + author + date.
 *
 * VALIDATE-AND-OMIT, per the decision: every tag is emitted only when its source field exists. In
 * particular an unknown author degrades to OMITTED, never to "Anonymous" — a fabricated author is a
 * false attribution carried into somebody's bibliography, which is worse than an incomplete record
 * the citing scholar can see is incomplete.
 */
function citationTags(item: CslItem | undefined): string[] {
  if (!item) return [];
  const tag = (name: string, content: string): string => `<meta name="${esc(name)}" content="${esc(content)}">`;
  const out: string[] = [tag("citation_title", item.title), tag("DC.title", item.title)];
  for (const a of item.author ?? []) {
    const full = a.given ? `${a.family}, ${a.given}` : a.family;
    out.push(tag("citation_author", full), tag("DC.creator", full));
  }
  const year = item.issued?.["date-parts"]?.[0]?.[0];
  if (year !== undefined) out.push(tag("citation_publication_date", String(year)), tag("DC.date", String(year)));
  if (item.publisher) out.push(tag("citation_publisher", item.publisher), tag("DC.publisher", item.publisher));
  if (item["container-title"]) out.push(tag("citation_inbook_title", item["container-title"]));
  if (item.URL) out.push(tag("citation_public_url", item.URL), tag("DC.identifier", item.URL));
  if (item.rights) out.push(tag("DC.rights", item.rights));
  return out;
}

const abs = (u: string | undefined): string | undefined => (u && /^https?:\/\//.test(u) ? u : undefined);

/** og:image for an exhibit: the cover if absolute, else the first object's absolute source, else NONE.
 *  Mirrors apps/viewer ogImageFor but works from the baseUrl render-core already holds (the viewer
 *  module reads archie.config.json — not importable cleanly into core).
 *
 *  There is deliberately no fallback. The old one named `${baseUrl}og-card.png`, which no code path in
 *  this repo has ever written (Archie-5a15) — so every card-less exhibit advertised a 404 to every
 *  crawler and social unfurler that asked. Callers must be handed the PUBLISHED object projection for
 *  this to resolve: a working `/assets/…` path is not absolute and falls through to undefined. */
function ogImageForExhibit(exhibit: Exhibit, _baseUrl: string): string | undefined {
  return abs(exhibit.cover) ?? abs(exhibit.objects[0]?.source);
}

/** og:image for the library landing: the first listed exhibit that offers one. Same no-fallback rule. */
function ogImageForLibrary(library: Library): string | undefined {
  for (const e of library.exhibits) {
    const img = abs(e.cover) ?? abs(e.objects[0]?.source);
    if (img) return img;
  }
  return undefined;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The escape-only body renderer: entity-encode, keep paragraph structure. The XSS floor. */
export const escapeBody = (md: string): string =>
  `<p>${esc(md).replace(/\r?\n\r?\n+/g, "</p>\n<p>").replace(/\r?\n/g, "<br>")}</p>`;

// One shared, deliberately minimal chrome: readable column, no script, archival tone.
// Verdant Clearing palette (design/design.md v0.4): parchment ground, moss ink, hunter accent, amber
// reading-label. System sans echoes LARAZ without shipping a webfont on this archival surface.
const STYLE = `body{max-width:42rem;margin:2rem auto;padding:0 1rem;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.55;color:#1A3C23;background:#F7F4EC}h1,h2{line-height:1.2}article{margin:1.5rem 0;padding:0.75rem 1rem;border-left:3px solid #2D5F3A;background:#EEF1E6}article .reading{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:#9A7B39}article .tags,footer,.credit{color:#6B7D6A;font-size:0.9rem}a{color:#2D5F3A}dl.meta{margin:0.75rem 0;font-size:0.9rem}dl.meta dt{font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;color:#6B7D6A}dl.meta dd{margin:0 0 0.5rem}details.versions{margin-top:0.5rem;font-size:0.85rem;color:#6B7D6A}details.versions summary{cursor:pointer}details.versions ol{margin:0.35rem 0 0;padding-left:1.25rem}details.cite{margin:1.5rem 0;font-size:0.9rem}details.cite summary{cursor:pointer}details.cite pre{white-space:pre-wrap;word-break:break-word;margin:0}`;

/** The SEO head tags (Q-8): Open Graph + Twitter card + canonical + JSON-LD. Rendered only when a
 *  page supplies `meta`; the bare shell (no meta) keeps the minimal charset/viewport/title head. */
function metaTags(meta: PageMeta): string {
  const lines = [
    ...(meta.description ? [`<meta name="description" content="${esc(meta.description)}">`] : []),
    `<link rel="canonical" href="${esc(meta.canonical)}">`,
    `<meta property="og:type" content="${meta.ogType}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    ...(meta.description ? [`<meta property="og:description" content="${esc(meta.description)}">`] : []),
    `<meta property="og:url" content="${esc(meta.canonical)}">`,
    ...(meta.ogImage ? [`<meta property="og:image" content="${esc(meta.ogImage)}">`] : []),
    // `summary_large_image` REQUIRES an image; without one Twitter/X renders nothing at all, so the
    // card type degrades with the image rather than advertising a large card over a blank.
    `<meta name="twitter:card" content="${meta.ogImage ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    ...(meta.description ? [`<meta name="twitter:description" content="${esc(meta.description)}">`] : []),
    ...(meta.ogImage ? [`<meta name="twitter:image" content="${esc(meta.ogImage)}">`] : []),
    // JSON.stringify already escapes the JSON; guard the one HTML-significant sequence that can break
    // out of a <script> element (`</` → `<\/`).
    ...citationTags(meta.csl),
    `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/<\//g, "<\\/")}</script>`,
  ];
  return lines.join("\n");
}

/**
 * One level's rights block: the MUST-display credit, the licence as VISIBLE linked text, and the
 * descriptive metadata as a finding-aid `<dl>`. Used at all three levels (library · exhibit · object),
 * so the archival page shows the same ladder the embed does.
 *
 * WHY (V103/V104, Archie-a5b1). This page had NO concept of descriptive metadata — `grep -n metadata`
 * over this file returned nothing, the same signature V110's missing sections had — and it emitted the
 * licence URI ONLY into schema.org JSON-LD. So the durable, citable, zero-JS face of an exhibit showed
 * a reader asking "may I use this?" nothing at all, over published manifests carrying a `rights` URI on
 * every canvas and ten `dcterms` entries per folio. This is the same defect the EMBED had and fixed
 * (packages/archie-viewer/src/element.ts:958 `creditHtml`, Archie-b681/V105 — "an embed that strips a
 * required statement is legal exposure, not a missing feature"); the archival page was the last surface
 * still missing it.
 *
 * ALREADY-RESOLVED VALUES ONLY, like every other surface: the opt-in cascade collapses at publish, so
 * each level prints its OWN fields and nothing is inherited here. That is what makes the three blocks
 * on one page a readable ladder rather than three copies of the same sentence.
 *
 * NO DISCLOSURE. The Viewer and the embed hide the licence and the metadata rows behind an ⓘ; this page
 * ships zero JavaScript and is read by crawlers and by people with the page saved to disk, so
 * everything is in the document. Prior art for visible licence prose on a static scholarly page:
 * quire's `packages/11ty/_includes/components/copyright/licensing.js:24-27` renders
 * `This work is licensed under a <a rel="license" href=…>NAME</a>.` — the `rel="license"` link
 * relation is taken from there.
 */
function rightsHtml(fields: RightsFields | undefined): string {
  const parts: string[] = [];
  const rs = fields?.requiredStatement;
  if (rs) parts.push(`<p class="credit">${esc(rs.label)}: ${esc(rs.value)}</p>`);
  // `licenseLabel` returns the URI itself for a URI outside the approved list — forward-compatible, and
  // still better to a reader than nothing. The href is always the raw URI.
  const uri = fields?.rights;
  const licence = licenseLabel(uri);
  if (uri && licence) {
    parts.push(`<p class="credit">License: <a rel="license" href="${esc(uri)}">${esc(licence)}</a></p>`);
  }
  // The SAME `metadataRows` projection the Viewer panel and the embed use — excluded properties, blank
  // values, credit echoes and repeat merging all resolve identically, so the three surfaces cannot
  // disagree about what this level says. Repeats join with "; " (MetadataRun's delimiter): two values
  // run together read as one.
  const rows = metadataRows(fields);
  if (rows.length > 0) {
    parts.push(
      `<dl class="meta">${rows
        .map((r) => `<dt>${esc(r.label)}</dt><dd>${r.values.map((v) => esc(v.text)).join("; ")}</dd>`)
        .join("")}</dl>`,
    );
  }
  return parts.join("\n");
}

function pageShell(title: string, body: string, meta?: PageMeta): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${meta ? metaTags(meta) + "\n" : ""}<style>${STYLE}</style>
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

/** sitemap.xml — the same page set as sitemapTxt, in the sitemaps.org 0.9 schema so crawlers ingest
 *  it directly (ABSOLUTE `<loc>`s, library first then exhibits in order). `lastmod` carries the
 *  publish timestamp when known. */
export function sitemapXml(library: Library, baseUrl: string, lastmod?: string): string {
  const urls = [`${baseUrl}index.html`, ...library.exhibits.map((e) => `${baseUrl}${e.slug}/index.html`)];
  const lm = lastmod ? `\n    <lastmod>${esc(lastmod)}</lastmod>` : "";
  const body = urls.map((u) => `  <url>\n    <loc>${esc(u)}</loc>${lm}\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** schema.org `ImageObject` for one object, with REAL numeric pixel dims when the model carries them.
 *  `contentUrl` is the absolute object source (or the published canvas image URL the publish step set). */
function imageObjectFor(obj: Exhibit["objects"][number]): Record<string, unknown> {
  return {
    "@type": "ImageObject",
    contentUrl: obj.source,
    ...(typeof obj.width === "number" ? { width: obj.width } : {}),
    ...(typeof obj.height === "number" ? { height: obj.height } : {}),
  };
}

/** The library landing page — the human entry a published data repo never had. */
export function libraryPageHtml(library: Library, opts: StaticPageOptions): string {
  const parts: string[] = [];
  parts.push(`<h1>${esc(library.title ?? "Library")}</h1>`);
  if (library.summary) parts.push(`<p>${esc(library.summary)}</p>`);
  const libRights = rightsHtml(library);
  if (libRights) parts.push(libRights);
  if (opts.viewerBase) parts.push(`<p><a href="${esc(opts.viewerBase)}">Open the interactive viewer</a></p>`);
  parts.push("<ul>");
  for (const e of library.exhibits) {
    parts.push(`<li><a href="${esc(e.slug)}/index.html">${esc(e.title)}</a>${e.summary ? ` — ${esc(e.summary)}` : ""}</li>`);
  }
  parts.push("</ul>");

  // schema.org CollectionPage (Q-8): one hasPart CreativeWork per exhibit. Honest — only modelled fields.
  const title = library.title ?? "Library";
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: `${opts.baseUrl}index.html`,
    ...(library.summary ? { description: library.summary } : {}),
    ...(library.rights ? { license: library.rights } : {}),
    ...(library.requiredStatement ? { creditText: library.requiredStatement.value } : {}),
    hasPart: library.exhibits.map((e) => ({
      "@type": "CreativeWork",
      name: e.title,
      url: `${opts.baseUrl}${e.slug}/index.html`,
      ...(e.summary ? { description: e.summary } : {}),
    })),
  };
  const csl = cslItemFor({ title, url: `${opts.baseUrl}index.html`, rights: library, id: String(library.id), type: "webpage" });
  const meta: PageMeta = {
    title,
    ...(library.summary ? { description: library.summary } : {}),
    ...(ogImageForLibrary(library) ? { ogImage: ogImageForLibrary(library)! } : {}),
    canonical: `${opts.baseUrl}index.html`,
    ogType: "website",
    jsonLd,
    csl,
  };
  return pageShell(title, parts.join("\n"), meta);
}


/**
 * The "Cite this" block (Archie-321c). Three renderings of ONE CSL item, so they cannot disagree:
 * APA and a plain Chicago-ish line for a reader writing prose, and BibTeX for a reader with a
 * bibliography file. Collapsed in a `<details>` — zero JS, like the version block — because a
 * citation apparatus is a tool you reach for, not something that should push the exhibit down.
 *
 * The CSL-JSON itself is deliberately NOT printed: it is the interchange format, and the `citation_*`
 * head tags already hand it to the reference managers that consume interchange.
 */
function citeBlock(item: CslItem): string {
  return [
    `<details class="cite">`,
    `<summary>Cite this exhibit</summary>`,
    `<dl class="meta">`,
    `<dt>APA</dt><dd>${esc(apaText(item))}</dd>`,
    `<dt>Chicago</dt><dd>${esc(citationText(item))}</dd>`,
    `<dt>BibTeX</dt><dd><pre>${esc(bibtexText(item))}</pre></dd>`,
    `</dl>`,
    `</details>`,
  ].join("\n");
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

  /**
   * The version block: for a note past v1, a COLLAPSED list of its prior versions with a durable
   * anchor each. Strictly additive to the frozen `#note-<logicalId>` grammar (decision P-1) — the
   * article keeps its id and its existing children; this appends inside it, so every existing
   * citation still resolves to the same element.
   *
   * `<details>` because it must be zero-JS: the disclosure is native, so a reader with scripting off
   * (and a crawler) still reaches the content. Anchors are `note-<lid>@v<n>`; `@` is legal in a
   * fragment and cannot collide with a logicalId, which is ULID-shaped.
   *
   * Prior versions carry the biography — when, and by whom when known — NOT their bodies. A page that
   * reprinted every superseded body would bury the current reading under its own history, and the
   * full record is one dereference away in the history sidecar this page's tree already ships.
   */
  const versionsHtml = (rec: AnnotationRecord): string => {
    const all = opts.history?.get(rec.logicalId);
    if (!all) return "";
    const prior = all.filter((r) => r.version < rec.version);
    if (prior.length === 0) return "";
    const rows = prior.map((r) => {
      const when = r.modifiedAt ? `<time datetime="${esc(r.modifiedAt)}">${esc(r.modifiedAt)}</time>` : "";
      // "when available" is load-bearing: a solo library has no editor identity, and printing an
      // empty by-line would read as a missing attribution rather than an absent concept.
      const who = r.lastEditor ? `<span class="editor">${esc(r.lastEditor)}</span>` : "";
      const sep = when && who ? " · " : "";
      return `<li id="note-${esc(rec.logicalId)}@v${r.version}">v${r.version}${when || who ? " — " : ""}${when}${sep}${who}</li>`;
    });
    const n = prior.length;
    return [
      `<details class="versions">`,
      `<summary>${n} earlier version${n === 1 ? "" : "s"}</summary>`,
      `<ol>`,
      ...rows,
      `</ol>`,
      `</details>`,
    ].join("\n");
  };

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
      ...(versionsHtml(rec) ? [versionsHtml(rec)] : []),
      `</article>`,
    ].join("\n");
  };

  const parts: string[] = [];
  parts.push(`<p><a href="../index.html">${esc("← Library")}</a></p>`);
  parts.push(`<h1>${esc(exhibit.title)}</h1>`);
  if (exhibit.summary) parts.push(`<p>${esc(exhibit.summary)}</p>`);
  const exRights = rightsHtml(exhibit);
  if (exRights) parts.push(exRights);
  if (opts.viewerBase) parts.push(`<p><a href="${esc(opts.viewerBase)}#/${esc(exhibit.slug)}">Open this exhibit in the interactive viewer</a></p>`);

  // V110 — the ADR-0014 archival page had NO CONCEPT of a section (`grep -n sections` over this file
  // returned nothing), so a narrative exhibit's authored prose — the thing the exhibit exists to say —
  // was absent from the durable artifact entirely. Measured on the seed: 13,491 characters of body text
  // and zero of the six sections' prose. The notes were all there; the argument tying them together
  // wasn't.
  //
  // Sections lead, before the per-object notes: in a narrative exhibit the spine IS the reading, and the
  // notes are what it cites. Each carries a deep link on the section rung of the cite ladder (ADR-0021)
  // so a reader can cross from the archive back into the live spine at the right place.
  const sections = exhibit.sections ?? [];
  if (sections.length > 0) {
    parts.push(`<h2>${esc("The narrative")}</h2>`);
    for (const sec of sections) {
      const live = opts.viewerBase ? `${opts.viewerBase}#/${exhibit.slug}/s/${sec.id}` : undefined;
      parts.push(
        [
          `<section id="section-${esc(sec.id)}">`,
          `<h3>${esc(sec.title)}</h3>`,
          ...(sec.prose ? [render(sec.prose)] : []),
          ...(live ? [`<div class="tags"><a href="${esc(live)}">Read this part in the viewer</a></div>`] : []),
          `</section>`,
        ].join("\n"),
      );
    }
  }

  const used = new Set<AnnotationRecord>();
  for (const obj of exhibit.objects) {
    const mine = records.filter((r) => targetSource(r) === canvasIRI(obj.id));
    // The object's OWN credit / licence / metadata, printed under its heading rather than hoisted into
    // one block at the top — quire puts the per-figure credit inside the figure's own caption for the
    // same reason (`packages/11ty/_includes/components/figure/caption.js:25`,
    // `<span class="q-figure__credit">`): on a citation surface the reader needs to know which item a
    // rights statement is about, and a hoisted block cannot say that. This is where the licence
    // actually lives in this corpus — every seed folio carries `rights` on the canvas and none of it
    // reached this page before.
    const objRights = rightsHtml(obj);
    if (mine.length === 0 && objRights === "") continue;
    parts.push(`<h2>${esc(obj.label)}</h2>`);
    if (objRights) parts.push(objRights);
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

  // The citable projection of THIS exhibit (Archie-321c) — one CSL item feeding both the head's
  // citation_*/DC.* tags and the on-page "Cite this" block, so the machine-readable and the
  // human-readable citation cannot disagree.
  const exhibitCsl = cslItemFor({
    title: exhibit.title,
    url: `${opts.baseUrl}${exhibit.slug}/index.html`,
    rights: exhibit,
    id: exhibit.slug,
    type: "webpage",
  });
  parts.push(citeBlock(exhibitCsl));

  // schema.org CreativeWork (Q-8): map ONLY what the model carries. NO `author` — the model has no
  // structured author. `image`/`hasPart` carry REAL pixel dims; multi-object → hasPart array.
  const images = exhibit.objects.map(imageObjectFor);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: exhibit.title,
    url: `${opts.baseUrl}${exhibit.slug}/index.html`,
    ...(exhibit.summary ? { description: exhibit.summary } : {}),
    ...(exhibit.rights ? { license: exhibit.rights } : {}),
    ...(exhibit.requiredStatement ? { creditText: exhibit.requiredStatement.value } : {}),
    ...(opts.publishedAt ? { datePublished: opts.publishedAt, dateModified: opts.publishedAt } : {}),
    ...(images.length === 1 ? { image: images[0] } : images.length > 1 ? { hasPart: images } : {}),
  };
  const meta: PageMeta = {
    title: exhibit.title,
    ...(exhibit.summary ? { description: exhibit.summary } : {}),
    ...(ogImageForExhibit(exhibit, opts.baseUrl) ? { ogImage: ogImageForExhibit(exhibit, opts.baseUrl)! } : {}),
    canonical: `${opts.baseUrl}${exhibit.slug}/index.html`,
    ogType: "article",
    jsonLd,
    csl: exhibitCsl,
  };
  return pageShell(`${exhibit.title}${" — archival text"}`, parts.join("\n"), meta);
}

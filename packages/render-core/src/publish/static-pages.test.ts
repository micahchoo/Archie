import { describe, it, expect } from "vitest";
import { publishLibrary } from "./site.js";
import { sitemapXml, exhibitPageHtml, libraryPageHtml } from "./static-pages.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { appendNew, appendEdit, appendDelete } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";

// THE FROZEN CONTRACT (ADR-0014 / archie-linkability Q-2, written RED before the emitter exists):
// publishLibrary makes the published artifact SELF-DESCRIBING — static HTML with per-note anchors
// (the durable ref `{slug}/index.html#note-<logicalId>`). The anchor grammar freezes the day a
// citation circulates; this corpus is the contract, the implementation follows it.

const BASE = "https://u.gh.io/lib/";
const alice = asClientId("alice");

// Targets matching publish's canvas IRI grammar + one exhibit-level (non-canvas) note.
const canvas = (slug: string, objId: string) => ({ type: "SpecificResource" as const, source: `${BASE}${slug}/canvas/${objId}` });

function fixture() {
  let log: AnnotationLog = [];
  let r = appendNew(log, { target: canvas("a", "o1"), body: { type: "TextualBody", value: "First note **bold** words" }, lastEditor: alice, modifiedAt: "t1", now: 1 });
  log = r.log;
  const l1 = r.record.logicalId;
  r = appendNew(log, { target: canvas("a", "o1"), body: { type: "TextualBody", value: "<script>alert(1)</script> hostile <img src=x onerror=alert(2)>" }, lastEditor: alice, modifiedAt: "t2", now: 2, reading: "cipher" });
  log = r.log;
  const l2 = r.record.logicalId;
  r = appendNew(log, { target: `${BASE}a/manifest.json`, body: { type: "TextualBody", value: "Curatorial exhibit-level prose" }, lastEditor: alice, modifiedAt: "t3", now: 3 });
  log = r.log;
  const l3 = r.record.logicalId;
  // A deleted note: must NOT appear on the page (heads projection excludes tombstones).
  r = appendNew(log, { target: canvas("a", "o1"), body: { type: "TextualBody", value: "DELETED-WORDS-MUST-NOT-APPEAR" }, lastEditor: alice, modifiedAt: "t4", now: 4 });
  log = appendDelete(r.log, r.record.logicalId, { lastEditor: alice, modifiedAt: "t5", now: 5 }).log;

  const library: Library = {
    id: asLibraryId("lib"),
    title: "The Library",
    summary: "A library summary",
    requiredStatement: { label: "Attribution", value: "Library credit line — Beinecke" },
    exhibits: [
      {
        id: asExhibitId("exA"), slug: "a", title: "Exhibit Alpha", summary: "Alpha summary",
        rights: "https://creativecommons.org/licenses/by/4.0/",
        requiredStatement: { label: "Attribution", value: "Alpha exhibit credit" },
        objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "Folio 1", width: 10, height: 10 }],
        readings: [{ id: "cipher", name: "Cipher", colour: "#aa3333" }],
      },
      { id: asExhibitId("exB"), slug: "b", title: "Exhibit Beta", objects: [] },
    ],
  };
  const logs: Record<string, AnnotationLog> = { exA: log, exB: [] };
  return { library, getLog: (id: string) => logs[id] ?? [], l1, l2, l3 };
}

async function readText(fs: MemoryFilesystem, path: string[]): Promise<string> {
  let dir = await fs.root();
  for (const seg of path.slice(0, -1)) dir = await dir.getDirectory(seg);
  const file = await dir.getFile(path[path.length - 1]!);
  return new TextDecoder().decode(await file.readable());
}

async function publishToMem(opts: Record<string, unknown> = {}) {
  const { library, getLog, l1, l2, l3 } = fixture();
  const fs = new MemoryFilesystem();
  await publishLibrary(fs, library, getLog, { baseUrl: BASE, ...opts });
  return { fs, l1, l2, l3 };
}

describe("static pages — the self-describing artifact (ADR-0014, frozen contract)", () => {
  it("emits index.html, {slug}/index.html for every exhibit, and sitemap.txt", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["index.html"])).toContain("The Library");
    expect(await readText(fs, ["a", "index.html"])).toContain("Exhibit Alpha");
    expect(await readText(fs, ["b", "index.html"])).toContain("Exhibit Beta");
    expect(await readText(fs, ["sitemap.txt"])).toBeTruthy();
  });

  it("anchors EVERY head note — base, reading-scoped, and non-canvas targets — as note-<logicalId>", async () => {
    const { fs, l1, l2, l3 } = await publishToMem();
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain(`id="note-${l1}"`);
    expect(html).toContain(`id="note-${l2}"`); // reading-scoped: FULL heads projection, not base-only
    expect(html).toContain(`id="note-${l3}"`); // exhibit-level prose: anchored too
    expect(html).toContain("First note");
    expect(html).toContain("Curatorial exhibit-level prose");
  });

  it("logicalIds are anchor-safe (the ULID charset assertion the grammar relies on)", async () => {
    const { l1, l2, l3 } = await publishToMem();
    for (const id of [l1, l2, l3]) expect(id).toMatch(/^[0-9A-Za-z_-]+$/);
  });

  it("a hostile body arrives ENTITY-ESCAPED under the default renderer (the XSS boundary)", async () => {
    const { fs } = await publishToMem();
    const html = await readText(fs, ["a", "index.html"]);
    // No EXECUTABLE script from a body (the JSON-LD `application/ld+json` block is inert data, not JS).
    expect(html).not.toMatch(/<script(?![^>]*type="application\/ld\+json")/);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img src=x");
  });

  it("a tombstoned note's words do NOT appear (heads projection, not the raw log)", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["a", "index.html"])).not.toContain("DELETED-WORDS-MUST-NOT-APPEAR");
  });

  it("renders the MUST-display credit (requiredStatement) at each level", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["index.html"])).toContain("Library credit line — Beinecke");
    expect(await readText(fs, ["a", "index.html"])).toContain("Alpha exhibit credit");
  });

  it("names the note's Reading beside it (interpretation context survives archiving)", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["a", "index.html"])).toContain("Cipher");
  });

  it("sitemap.txt lists exactly the emitted pages, library first then exhibits in order", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["sitemap.txt"])).toBe(`${BASE}index.html\n${BASE}a/index.html\n${BASE}b/index.html\n`);
  });

  it("is idempotent — republishing the SAME library/log produces byte-identical pages", async () => {
    const { library, getLog } = fixture();
    const fs1 = new MemoryFilesystem();
    const fs2 = new MemoryFilesystem();
    await publishLibrary(fs1, library, getLog, { baseUrl: BASE });
    await publishLibrary(fs2, library, getLog, { baseUrl: BASE });
    expect(await readText(fs1, ["a", "index.html"])).toBe(await readText(fs2, ["a", "index.html"]));
    expect(await readText(fs1, ["index.html"])).toBe(await readText(fs2, ["index.html"]));
  });

  it("links out to the interactive Viewer when viewerBase is supplied (and omits it otherwise)", async () => {
    const { fs, l1 } = await publishToMem({ viewerBase: "https://host/viewer/" });
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain(`https://host/viewer/#/a/a/${l1}`); // per-note interactive ref
    expect(html).toContain("https://host/viewer/#/a"); // exhibit-level link
    const bare = await readText((await publishToMem()).fs, ["a", "index.html"]);
    expect(bare).not.toContain("https://host/viewer/");
  });

  it("an injected renderBody is used for note bodies (the A3 pipeline seam) — chrome stays escaped", async () => {
    const { fs, l1 } = await publishToMem({ renderBody: (md: string) => `<em data-injected>${md.length}</em>` });
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain("<em data-injected>"); // bodies went through the injected renderer
    expect(html).toContain(`id="note-${l1}"`); // grammar unchanged by the renderer choice
    expect(html).toContain("Exhibit Alpha"); // chrome (titles/credits) never passes through renderBody
  });

  it("the landing page links every exhibit page (the human entry the data repo never had)", async () => {
    const { fs } = await publishToMem();
    const html = await readText(fs, ["index.html"]);
    expect(html).toContain('href="a/index.html"');
    expect(html).toContain('href="b/index.html"');
    expect(html).toContain("A library summary");
  });
});

// SEO surface (Task 2 / decision Q-8): every published page is self-describing to a crawler/social
// unfurl — Open Graph + Twitter card + a canonical link + schema.org JSON-LD. The JSON-LD is HONEST:
// it maps ONLY fields the model actually carries (no fabricated author), and image dimensions are the
// REAL numeric pixels. All emitted URLs are ABSOLUTE (canonical origin + path = the publish baseUrl).
describe("SEO meta — og/twitter/canonical + schema.org JSON-LD (Q-8)", () => {
  const jsonLd = (html: string): unknown => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!m) throw new Error("no JSON-LD script found");
    return JSON.parse(m[1]!);
  };

  it("the exhibit page carries og:title, og:type, an ABSOLUTE og:image, twitter:card and a canonical link", async () => {
    const { fs } = await publishToMem();
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:type"');
    expect(html).toMatch(/property="og:image" content="https?:\/\/[^"]+"/);
    expect(html).toContain('name="twitter:card"');
    expect(html).toMatch(new RegExp(`<link rel="canonical" href="${BASE}a/index.html"`));
  });

  it("the exhibit page emits a CreativeWork with license, creditText, datePublished and a numeric-dim ImageObject — and NO author", async () => {
    const { fs } = await publishToMem({ publishedAt: "2026-06-20T00:00:00.000Z" });
    const ld = jsonLd(await readText(fs, ["a", "index.html"])) as Record<string, unknown>;
    expect(ld["@type"]).toBe("CreativeWork");
    expect(ld["name"]).toBe("Exhibit Alpha");
    expect(ld["license"]).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(ld["creditText"]).toBe("Alpha exhibit credit");
    expect(ld["datePublished"]).toBe("2026-06-20T00:00:00.000Z");
    expect(ld).not.toHaveProperty("author");
    const img = (ld["image"] ?? (ld["hasPart"] as unknown[])?.[0]) as Record<string, unknown>;
    expect(img["@type"]).toBe("ImageObject");
    expect(img["width"]).toBe(10);
    expect(img["height"]).toBe(10);
    expect(typeof img["contentUrl"]).toBe("string");
  });

  // Archie-5a15 defect 1. The page and the manifest are two projections of ONE exhibit, and they were
  // built from different objects: site.ts handed the static page the pre-rewrite working model while
  // the manifest was built from the published projection. So the shipped page advertised a
  // `/assets/…` contentUrl — a path that exists only inside the author's OPFS — to every crawler.
  // Asserting `typeof contentUrl === "string"` (as the ImageObject test above did, and still does for
  // its own purpose) cannot see this: the broken value is a perfectly good string.
  it("an IMPORTED object's contentUrl is the PUBLISHED url, and agrees with the manifest byte for byte", async () => {
    const fs = new MemoryFilesystem();
    const exC = {
      id: asExhibitId("exC"), slug: "c", title: "C",
      objects: [{ id: asObjectId("o1"), source: "/assets/photo.jpg", label: "Imported", width: 4, height: 4 }],
    };
    await publishLibrary(fs, { id: asLibraryId("lib"), title: "L", exhibits: [exC] }, () => [], {
      baseUrl: BASE, getAsset: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    });
    const html = await readText(fs, ["c", "index.html"]);
    const ld = jsonLd(html) as Record<string, unknown>;
    const img = (ld["image"] ?? (ld["hasPart"] as unknown[])?.[0]) as Record<string, unknown>;

    expect(img["contentUrl"]).toBe(`${BASE}c/assets/photo.jpg`);
    // The working path must be GONE from the whole page, not merely absent from this one field.
    expect(html).not.toContain('"/assets/photo.jpg"');

    // …and it must equal what the manifest says. Two projections of one exhibit that disagree is the
    // shape of this bug; pinning them together is what stops it recurring in a different field.
    const manifest = JSON.parse(await readText(fs, ["c", "manifest.json"]));
    expect(JSON.stringify(manifest)).toContain(img["contentUrl"] as string);
  });

  // Archie-5a15 defect 2. Both static pages advertised `${baseUrl}og-card.png`; nothing in this repo
  // has ever written that file, and it 404'd on the live site. The tag is now emitted only when there
  // is a real image, and the twitter card type degrades with it — `summary_large_image` over a
  // missing image renders nothing at all.
  it("omits og:image entirely (and downgrades the twitter card) when the tree carries no image", async () => {
    const fs = new MemoryFilesystem();
    const exN = { id: asExhibitId("exN"), slug: "n", title: "No pictures", objects: [] };
    await publishLibrary(fs, { id: asLibraryId("lib"), title: "L", exhibits: [exN] }, () => [], { baseUrl: BASE });

    for (const page of [["n", "index.html"], ["index.html"]]) {
      const html = await readText(fs, page);
      expect(html, `${page.join("/")} still advertises an og:image`).not.toContain('property="og:image"');
      expect(html, `${page.join("/")} still advertises a twitter:image`).not.toContain('name="twitter:image"');
      expect(html).toContain('name="twitter:card" content="summary"');
      // The phantom file, by name — the regression this ticket is actually about.
      expect(html).not.toContain("og-card.png");
    }
  });

  it("the library page emits a CollectionPage with one hasPart entry per exhibit", async () => {
    const { fs } = await publishToMem();
    const ld = jsonLd(await readText(fs, ["index.html"])) as Record<string, unknown>;
    expect(ld["@type"]).toBe("CollectionPage");
    expect(Array.isArray(ld["hasPart"])).toBe(true);
    expect((ld["hasPart"] as unknown[]).length).toBe(2);
  });

  it("emits sitemap.xml — well-formed, one <loc> per page (library root + each exhibit), ABSOLUTE, with <lastmod>", async () => {
    const { fs } = await publishToMem({ publishedAt: "2026-06-20T00:00:00.000Z" });
    const xml = await readText(fs, ["sitemap.xml"]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs).toEqual([`${BASE}index.html`, `${BASE}a/index.html`, `${BASE}b/index.html`]);
    for (const u of locs) expect(u.startsWith("https://")).toBe(true);
    expect(xml).toContain("<lastmod>2026-06-20T00:00:00.000Z</lastmod>");
  });

  it("sitemapXml builder is well-formed and lists library-first then exhibits in order", () => {
    const { library } = fixture();
    const xml = sitemapXml(library, BASE, "2026-06-20T00:00:00.000Z");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs).toEqual([`${BASE}index.html`, `${BASE}a/index.html`, `${BASE}b/index.html`]);
  });
});

// V110: the archival page (ADR-0014) had no concept of a section, so a narrative exhibit's authored
// prose — the argument the notes are evidence FOR — never reached the durable artifact.
describe("exhibitPageHtml — the narrative reaches the archival page (V110)", () => {
  const withSections = {
    id: "ex-1", slug: "walk", title: "A walk", objects: [],
    sections: [
      { id: "s1", title: "First part", objectId: "o1", prose: "herbal: a plant to a page" },
      { id: "s2", title: "Second part", objectId: "o1" },
    ],
  } as unknown as Parameters<typeof exhibitPageHtml>[0];

  it("renders each section's title and prose", () => {
    const html = exhibitPageHtml(withSections, [], { baseUrl: "https://x/", viewerBase: "https://v/" });
    expect(html).toContain("First part");
    expect(html).toContain("herbal: a plant to a page");
    expect(html).toContain("Second part");
  });

  it("deep-links each section on the cite ladder's section rung", () => {
    const html = exhibitPageHtml(withSections, [], { baseUrl: "https://x/", viewerBase: "https://v/" });
    expect(html).toContain("https://v/#/walk/s/s1");
  });

  it("says nothing about a narrative when the exhibit has no sections", () => {
    const plain = { id: "ex-2", slug: "grid", title: "Grid", objects: [] } as unknown as Parameters<typeof exhibitPageHtml>[0];
    expect(exhibitPageHtml(plain, [], { baseUrl: "https://x/" })).not.toContain("The narrative");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V103 / V104 (Archie-a5b1) — the rights ladder and the Dublin Core rows reach the archival page.
//
// Before this, `grep -n metadata` over static-pages.ts returned NOTHING (V110's exact signature) and
// the licence URI went only into schema.org JSON-LD, so the durable citation surface answered "may I
// use this?" with silence over manifests carrying a `rights` URI on every canvas and ten dcterms
// entries per folio.
//
// Its OWN fixture, deliberately: the file's shared `fixture()` is consumed by twenty assertions
// including a byte-identical-idempotency one, and `.claude/rules/test-fixtures.md` forbids reshaping a
// shared fixture for one test. These call the builders directly, as the V110 block above does.
// ─────────────────────────────────────────────────────────────────────────────
describe("the rights ladder reaches the archival page (V103/V104)", () => {
  const exhibit = {
    id: "ex-r", slug: "r", title: "Rights Exhibit", summary: "sum",
    rights: "http://creativecommons.org/licenses/by/4.0/",
    requiredStatement: { label: "Source", value: "EXHIBIT-CREDIT-LINE" },
    metadata: [
      { property: "dcterms:subject", value: "EXHIBIT-SUBJECT" },
      { property: "dcterms:creator", value: "Ada" },
      { property: "dcterms:creator", value: "Grace" },
      { property: "dcterms:title", value: "EXCLUDED-COLLIDES-WITH-NATIVE-TITLE" },
      { property: "dcterms:date", value: "   " },
    ],
    objects: [
      {
        id: "o1", source: "https://img/1.jpg", label: "Folio One",
        rights: "http://creativecommons.org/publicdomain/mark/1.0/",
        requiredStatement: { label: "Held by", value: "OBJECT-CREDIT-LINE" },
        metadata: [{ property: "dcterms:provenance", value: "OBJECT-PROVENANCE" }],
      },
      { id: "o2", source: "https://img/2.jpg", label: "BARE-OBJECT-NO-RIGHTS" },
    ],
  } as unknown as Parameters<typeof exhibitPageHtml>[0];

  const html = () => exhibitPageHtml(exhibit, [], { baseUrl: "https://x/" });

  it("prints the exhibit's Dublin Core rows as a finding-aid <dl>", () => {
    const h = html();
    expect(h).toContain("<dl class=\"meta\">");
    expect(h).toContain("<dt>Subject</dt><dd>EXHIBIT-SUBJECT</dd>");
  });

  it("prints the OBJECT's own rows under the object's heading — the level where the licence actually lives", () => {
    const h = html();
    // Ordering is the assertion, not mere presence: a hoisted block at the top of the page would
    // contain the same string and could not say WHICH item the statement is about.
    const heading = h.indexOf("<h2>Folio One</h2>");
    expect(heading, "the object heading must render even though it carries no notes").toBeGreaterThan(-1);
    const provenance = h.indexOf("OBJECT-PROVENANCE");
    expect(provenance).toBeGreaterThan(heading);
    expect(h.indexOf("OBJECT-CREDIT-LINE")).toBeGreaterThan(heading);
  });

  it("renders the licence as VISIBLE linked text at both levels, not only as JSON-LD `license`", () => {
    const h = html();
    // `rel="license"` cannot appear inside the JSON-LD object, so this fails against the old code
    // (which emitted the URI only into `jsonLd.license`) and against any regression back to it.
    expect(h).toContain('<a rel="license" href="http://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>');
    expect(h).toContain('<a rel="license" href="http://creativecommons.org/publicdomain/mark/1.0/">Public Domain Mark 1.0</a>');
  });

  it("links a licence OUTSIDE the approved vocabulary as its own URI rather than dropping it", () => {
    // `licenseLabel` falls back to the URI itself for anything not in `LICENSES` — forward
    // compatibility, and the behaviour 15 of the seed's 40 licensed items actually take today
    // (CC 3.0 versions and ODbL are simply not in the picker's list). A reader still gets a
    // resolvable link; what they must never get is silence.
    const odbl = {
      ...(exhibit as unknown as Record<string, unknown>),
      rights: "https://opendatacommons.org/licenses/odbl/",
      metadata: [],
    } as unknown as Parameters<typeof exhibitPageHtml>[0];
    const h = exhibitPageHtml(odbl, [], { baseUrl: "https://x/" });
    expect(h).toContain('<a rel="license" href="https://opendatacommons.org/licenses/odbl/">https://opendatacommons.org/licenses/odbl/</a>');
  });

  it("goes through the metadataRows projection — repeats merge, excluded and blank entries drop", () => {
    const h = html();
    // Merged repeat, delimited (two stacked values read as one without it).
    expect(h).toContain("<dt>Creator</dt><dd>Ada; Grace</dd>");
    // `dcterms:title` collides with the native title already on the page; `dcterms:date` is blank.
    expect(h).not.toContain("EXCLUDED-COLLIDES-WITH-NATIVE-TITLE");
    expect(h).not.toContain("<dt>Date</dt>");
  });

  it("stays silent for an object with neither notes nor rights (no empty headings)", () => {
    expect(html()).not.toContain("BARE-OBJECT-NO-RIGHTS");
  });

  it("entity-escapes a hostile metadata value (the same XSS floor as note bodies)", () => {
    const hostile = {
      ...(exhibit as unknown as Record<string, unknown>),
      metadata: [{ property: "dcterms:provenance", value: "<script>alert(1)</script>" }],
    } as unknown as Parameters<typeof exhibitPageHtml>[0];
    const h = exhibitPageHtml(hostile, [], { baseUrl: "https://x/" });
    expect(h).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(h).not.toContain("<script>alert(1)</script>");
  });

  it("the library page carries the library's own credit, licence and rows", () => {
    const library = {
      id: "lib", title: "L", summary: "s",
      rights: "http://rightsstatements.org/vocab/InC/1.0/",
      requiredStatement: { label: "Attribution", value: "LIBRARY-CREDIT-LINE" },
      metadata: [{ property: "dcterms:publisher", value: "LIBRARY-PUBLISHER" }],
      exhibits: [],
    } as unknown as Library;
    const h = libraryPageHtml(library, { baseUrl: "https://x/" });
    expect(h).toContain("LIBRARY-CREDIT-LINE");
    expect(h).toContain('<a rel="license" href="http://rightsstatements.org/vocab/InC/1.0/">In Copyright</a>');
    expect(h).toContain("<dt>Publisher</dt><dd>LIBRARY-PUBLISHER</dd>");
  });
});

// Archie-a1d4 — the note's BIOGRAPHY on the archival page. Version-anchored citation needs prior
// versions to be addressable in the artifact itself, not only in the JSON sidecar beside it.
describe("version block — the note's biography (Archie-a1d4)", () => {
  /** A library whose single note has been edited twice: v1 → v2 → v3 (the head). */
  async function publishEditedNote(): Promise<{ fs: MemoryFilesystem; lid: string }> {
    let log: AnnotationLog = [];
    const a = appendNew(log, { target: canvas("a", "o1"), body: { type: "TextualBody", value: "draft" }, lastEditor: alice, modifiedAt: "2026-01-01T00:00:00.000Z", now: 1 });
    log = a.log;
    const lid = a.record.logicalId;
    log = appendEdit(log, lid, { body: { type: "TextualBody", value: "second" }, lastEditor: alice, modifiedAt: "2026-02-02T00:00:00.000Z", now: 2 }).log;
    log = appendEdit(log, lid, { body: { type: "TextualBody", value: "final reading" }, lastEditor: alice, modifiedAt: "2026-03-03T00:00:00.000Z", now: 3 }).log;

    const library: Library = {
      id: asLibraryId("lib"), title: "L",
      exhibits: [{ id: asExhibitId("exA"), slug: "a", title: "A", objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "F1", width: 4, height: 4 }] }],
    };
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, () => log, { baseUrl: BASE });
    return { fs, lid };
  }

  it("lists every PRIOR version under a durable anchor, and not the head", async () => {
    const { fs, lid } = await publishEditedNote();
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain(`<li id="note-${lid}@v1"`);
    expect(html).toContain(`<li id="note-${lid}@v2"`);
    expect(html).not.toContain(`<li id="note-${lid}@v3"`); // the head is the article itself
    expect(html).toContain("2 earlier versions");
  });

  it("carries each version's date, and NOT its superseded body", async () => {
    const { fs } = await publishEditedNote();
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain('<time datetime="2026-01-01T00:00:00.000Z">');
    expect(html).toContain('<time datetime="2026-02-02T00:00:00.000Z">');
    // The current reading is on the page; the superseded ones are one dereference away, in the
    // history sidecar. Reprinting them would bury the note under its own history.
    expect(html).toContain("final reading");
    expect(html).not.toContain("second");
    expect(html).not.toContain(">draft<");
  });

  it("is ADDITIVE: the frozen #note-<logicalId> anchor still resolves to the article", async () => {
    const { fs, lid } = await publishEditedNote();
    const html = await readText(fs, ["a", "index.html"]);
    // decision P-1: the anchor grammar is frozen. The block appends INSIDE the article, so the
    // article keeps its id and every existing citation still lands on the same element.
    expect(html).toContain(`<article id="note-${lid}">`);
    const article = html.slice(html.indexOf(`<article id="note-${lid}">`));
    const end = article.indexOf("</article>");
    expect(article.slice(0, end)).toContain('<details class="versions">');
  });

  it("ZERO JS: the disclosure is a native <details>, so it opens with scripting off", async () => {
    const { fs } = await publishEditedNote();
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain("<details class=\"versions\">");
    expect(html).toContain("<summary>");
    expect(html).not.toContain("<script>"); // the only script tag is the JSON-LD one (typed)
  });

  it("a NEVER-EDITED note gets no block at all (v1 has no biography to tell)", async () => {
    const { fs } = await publishToMem();
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).not.toContain('<details class="versions">');
  });
});

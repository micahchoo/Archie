// The reader's CHROME — object navigation (V30), the note list (V70) and the reading legend (V56).
//
// LAZY BY CONSTRUCTION. element.ts imports this module with `await import("./reader-chrome.js")` from
// the same place it already does `await import("./reader.js")`, so none of it is in the entry's static
// closure and none of it lands in `eagerGzKB`. That is the whole reason Archie-52a9 could decide
// "parity by default": the weight argument dissolves behind a boundary the canvas already needed.
// Prior art for the posture: universalviewer names lazy-loading an explicit Design Pattern on its
// content handlers (`manual/ARCHITECTURE.md:42,60`) rather than a workaround.
//
// WHY EACH PIECE EXISTS (Archie-52a9's measurements, re-verified 2026-07-25):
//   V30 — a 12-object exhibit's entire visible control set in the reader was `["← The Whole
//         Manuscript"]`. There was no way to move between objects AT ALL.
//   V70 — with no list, the marker was the ONLY door to a note. Per Archie-c982 the list is the
//         INDEX; read-overlay.ts:212 even names that contract ("The shell's route is the notes list
//         … The embed has no list, so the regions carry it") — this is the list it was waiting for.
//   V56 — three readings in the library, zero coloured marks, no legend.
//
// This module renders PLAIN DOM. Donor markup and behaviour: apps/viewer SidebarObjectNav.svelte
// (Back to Exhibit + Prev · N of M · Next), Reader.svelte's note-card list, ReadingLegend.svelte
// (radiogroup + swatch). Ported structure, NOT the Svelte components — the same rule element.ts:9
// records, now with the capability contract in ADR-0019 and recipes/smoke.mjs watching it.

import {
  commentOfAnnotation,
  overlay,
  stripMarkdown,
  readingMarkerStyle,
  type AObject,
  type PortableExhibit,
  type Reading,
  type W3CAnnotation,
} from "@render/core";

/**
 * The notes ON the canvas for one object under a reading layer: the always-visible base plus the
 * active Reading's notes overlaid (ADR-0007 / Q16). ExhibitView.svelte's `annotationsOf`, through the
 * SAME render-core `overlay` — the list, the legend counts and the marks all read this one function,
 * so the index can never disagree with the canvas.
 *
 * It lives in THIS module, not on the element, for eager-closure reasons: it is only ever reachable
 * past the lazy boundary, but as an element method its `overlay` import sat in the entry's static
 * graph. See the note at element.ts `#openObject`.
 */
export function annotationsFor(
  exhibit: PortableExhibit,
  objectId: string,
  activeReading: string | null,
): W3CAnnotation[] {
  const base = exhibit.annotationsByObject?.[objectId] ?? [];
  if (activeReading === null) return base;
  return overlay(base, exhibit.readingAnnotationsByObject?.[objectId]?.[activeReading]);
}

/**
 * The base layer's mark colour — the notes that belong to no Reading (ADR-0007's always-visible
 * base). ONE constant, shared by the legend's "General notes" swatch and by the canvas pass
 * (reading-marks.ts), so the chip and the mark can never disagree about what "base" looks like.
 * Value is the token palette's `--mist-blue`, resolved: a custom property cannot be handed to
 * `readingMarkerStyle`, which returns concrete style numbers for SVG attributes.
 */
export const BASE_MARK_COLOUR = "#6B7D6A";

/**
 * Inject a stylesheet that covers `anchor` and its siblings, and hand back the node for teardown.
 *
 * A ShadowRoot accepts a `<style>` child directly and that is the live path (the element's own root).
 * A plain Document does NOT — it allows exactly one element child — so a non-shadow host (a test, a
 * programmatic mount) needs `<head>`. Getting this wrong throws rather than degrading, which is how
 * it was found.
 */
export function injectStyle(anchor: Element, css: string, marker: string): HTMLStyleElement {
  const doc = anchor.ownerDocument;
  const style = doc.createElement("style");
  style.setAttribute(marker, "");
  style.textContent = css;
  const root = anchor.getRootNode() as ShadowRoot | Document;
  const target: ParentNode = (root as ShadowRoot).host ? root : (doc.head ?? doc.documentElement!);
  target.appendChild(style);
  return style;
}

/** Same string the shell's stepper renders (`apps/viewer/src/exhibit-nav.ts` positionLabel). */
export function positionLabel(index: number, total: number, unit: string): string {
  return `${unit} ${index + 1} of ${total}`;
}

/** The list row's preview: the note's first plain-text content, capped. Mirrors the shell's
 *  `stripMarkdown(commentOf(it))` card preview — the SAME render-core strip the overlay's accessible
 *  name uses (reader.ts labelFromAnnotations), so a row and its mark announce the same words. */
export function previewOf(ann: W3CAnnotation): string {
  const text = stripMarkdown(commentOfAnnotation(ann)).replace(/\s+/g, " ").trim();
  if (text.length === 0) return "Untitled note";
  return text.length > 180 ? `${text.slice(0, 179)}…` : text;
}

/** One search hit: the note, and — the part Archie-9eeb is open about — WHERE it is. */
export interface NoteHit {
  id: string;
  objectId: string;
  /** The object's own label. A hit that does not say where it lives is the defect, not the feature. */
  objectLabel: string;
  preview: string;
}

/**
 * Find notes across the WHOLE exhibit whose words match `query`.
 *
 * NO INDEX, AND THAT IS THE FINDING. `Archie-1820` expected this row to resolve as DROP-justified
 * because "the index and minisearch are real weight" — but the embed does not need either. The shell
 * builds a MiniSearch over the exhibit (`search-index.ts:48-56`, prefix + fuzzy 0.2) because its
 * finder is a library-scale browse surface; the embed already holds the exhibit's entire note tree in
 * memory the moment the exhibit opens (`annotationsByObject`), so a scan over it is exact, allocation
 * -light, and costs no dependency at all. The weight objection dissolves rather than being paid.
 *
 * What is deliberately NOT ported: fuzzy and prefix matching. A substring match is a promise the embed
 * can keep exactly ("these notes contain what you typed"); fuzzy scoring without a relevance-ranked UI
 * is a promise it cannot.
 *
 * Scope mirrors the shell's `flattenExhibitNotes` (`search-index.ts:62-77`): base notes PLUS every
 * reading's notes, de-duped by id, first occurrence winning. The finder is mode-INDEPENDENT on
 * purpose — a note that lives only in a reading the visitor has not activated is still findable, or
 * the search quietly lies about what the exhibit contains.
 */
export function searchExhibit(exhibit: PortableExhibit, query: string): NoteHit[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const hits: NoteHit[] = [];
  const seen = new Set<string>();
  for (const obj of exhibit.objects ?? []) {
    const byR = exhibit.readingAnnotationsByObject?.[obj.id] ?? {};
    const pools = [exhibit.annotationsByObject?.[obj.id] ?? [], ...Object.values(byR)];
    for (const pool of pools) {
      for (const ann of pool) {
        const id = String(ann.id ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        // Match the words a READER sees, never the markup: `stripMarkdown` is the same canonical
        // strip `previewOf` uses, so a hit can never be on a `](url)` the reader cannot see.
        const text = stripMarkdown(commentOfAnnotation(ann));
        if (!text.toLowerCase().includes(q)) continue;
        hits.push({ id, objectId: obj.id, objectLabel: obj.label, preview: previewOf(ann) });
      }
    }
  }
  return hits;
}

/**
 * annotation id → its Reading's colour, for ONE object. Built from the exhibit's own
 * `readingAnnotationsByObject`, exactly as ExhibitView.svelte's `readingColourById` does — a note not
 * on any reading is base (absent from the map), which is what makes the base layer colourless rather
 * than mis-coloured.
 */
export function readingColourById(exhibit: PortableExhibit, objectId: string): Record<string, string> {
  const m: Record<string, string> = {};
  const byR = exhibit.readingAnnotationsByObject?.[objectId] ?? {};
  for (const r of exhibit.readings ?? []) {
    if (!r.colour) continue;
    for (const a of byR[r.id] ?? []) if (a.id) m[String(a.id)] = r.colour;
  }
  return m;
}

export interface ReaderChromeOptions {
  exhibit: PortableExhibit;
  object: AObject;
  /** The notes currently ON the surface for this object (base + the active reading) — the list and the
   *  canvas must show the same set, or the list stops being an index of what is there. */
  annotations: readonly W3CAnnotation[];
  /** The active reading id, or null for base-only (the shell's `activeReading`; ADR-0007 / Q16). */
  activeReading: string | null;
  /** A row (or a legend layer) was chosen. */
  onselect(id: string): void;
  onreading(id: string | null): void;
  onstep(objectId: string): void;
  onoverview(): void;
  /** A search hit on ANOTHER object: open that object AND land on that note (Archie-1820). */
  onfind(objectId: string, noteId: string): void;
}

export interface ReaderChrome {
  /** Reflect the surface's current selection into the list (the canvas is the other direction). */
  setSelected(id: string | null): void;
  destroy(): void;
}

const CHROME_STYLES = `
  .rc-aside { display: flex; flex-direction: column; min-height: 100%; padding: var(--space-5) var(--space-5) var(--space-6); box-sizing: border-box; font-family: var(--font-body); color: var(--ink-paper-primary); }
  .rc-eyebrow { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-paper-secondary); margin: 0 0 var(--space-2); }
  .rc-empty { margin: 0; font-size: .9rem; font-style: italic; color: var(--ink-paper-muted); }
  .rc-notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); flex: 1 1 auto; }
  .rc-notes > li { margin: 0; }
  /* The card idiom of the shell's note list: warm paper, a reading-colour left edge, a 3-line clamp. */
  .rc-notes button {
    display: block; width: 100%; text-align: left; cursor: pointer; font: inherit;
    padding: var(--space-3); border: 1px solid var(--border-paper); border-left: 3px solid transparent;
    border-radius: var(--radius-sm); background: var(--surface-paper-card); color: inherit;
    font-size: .9rem; line-height: 1.45;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .rc-find {
    width: 100%; box-sizing: border-box; margin: 0 0 var(--space-3);
    padding: var(--space-2) var(--space-3); font: inherit; font-size: var(--text-ui-sm);
    color: inherit; background: var(--surface-paper-card);
    border: 1px solid var(--border-paper); border-radius: var(--radius-sm);
  }
  .rc-find:focus { outline: 2px solid var(--accent-2); outline-offset: 1px; }
  .rc-list { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
  .rc-note-text { display: block; }
  /* The locus. Quiet, but always present on a hit — see rowFor()'s note on Archie-9eeb. */
  .rc-where {
    display: block; margin-top: var(--space-1); font-family: var(--font-ui);
    font-size: var(--text-ui-xs); letter-spacing: .06em; color: var(--ink-paper-secondary);
  }
  .rc-notes button:hover { background: var(--surface-paper-hover); }
  .rc-notes button[aria-current="true"] { background: var(--surface-paper-hover); border-color: var(--accent); font-weight: 600; }
  /* Object nav — SidebarObjectNav.svelte in plain DOM: sticky foot, Back to Exhibit + Prev/N of M/Next. */
  .rc-nav { position: sticky; bottom: 0; margin: var(--space-5) calc(-1 * var(--space-5)) calc(-1 * var(--space-6)); padding: var(--space-3) var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); background: var(--surface-paper); border-top: 1px solid var(--border-canvas); }
  .rc-nav .rc-overview { align-self: start; display: inline-flex; align-items: center; gap: var(--space-2); background: none; border: none; padding: var(--space-1) 0; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  .rc-nav .rc-overview:hover { color: var(--accent-2); }
  .rc-stepper { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .rc-stepper .rc-step { display: inline-flex; align-items: center; gap: var(--space-1); background: none; border: none; padding: var(--space-2); cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-paper-secondary); }
  .rc-stepper .rc-step:hover:not(:disabled) { color: var(--accent-2); }
  .rc-stepper .rc-step:disabled { opacity: .32; cursor: default; }
  .rc-pos { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: var(--text-ui-sm); letter-spacing: .08em; color: var(--ink-paper-muted); }
  /* Legend — a DOCKED bar above the canvas (ADR-0019's layout row), ReadingLegend.svelte's placement
     and language, which are now the same thing on both sides of the contract. It was an absolute
     overlay at the canvas's top-left; as a row it needs no plate, no shadow and no contrast floor,
     because nothing is behind it. The radios read as a horizontal chip row, exactly as the shell's do. */
  .rc-legend { display: flex; align-items: center; flex-wrap: nowrap; gap: var(--space-3); min-width: 0; color: var(--ink-canvas-primary); font-family: var(--font-body); }
  .rc-legend .rc-eyebrow { margin: 0; color: var(--ink-canvas-secondary); }
  /* ONE ROW, chips SCROLL rather than wrap — the shell's legend does exactly the same, and for the
     same reason: the bar's height is the whole cost of docking and it comes out of the image. Measured
     on a four-reading object: wrapping 81px, one scrolling row 34px.
     (No backticks in this comment: it lives inside the CHROME_STYLES template literal, and one would
     terminate the string. That has cost two builds already.) */
  .rc-legend .rc-opts { display: flex; flex: 1 1 auto; min-width: 0; flex-direction: row; flex-wrap: nowrap; align-items: center; gap: var(--space-1); overflow-x: auto; scrollbar-width: thin; }
  .rc-legend .rc-opt { flex: none; white-space: nowrap; }
  .rc-legend .rc-opt { display: flex; align-items: center; gap: var(--space-2); text-align: left; padding: var(--space-1) var(--space-2); border: none; border-radius: var(--radius-sm); background: transparent; color: var(--ink-canvas-secondary); cursor: pointer; font: inherit; font-size: .9rem; }
  .rc-legend .rc-opt:hover { color: var(--ink-canvas-primary); }
  .rc-legend .rc-opt[aria-checked="true"] { color: var(--ink-canvas-primary); font-weight: 600; background: var(--surface-canvas-overlay); box-shadow: inset 0 -2px 0 var(--rc-rd, var(--accent)); }
  .rc-legend .rc-sw { flex: none; width: 14px; height: 14px; overflow: visible; border-radius: 2px; box-shadow: 0 0 0 1px var(--border-canvas-emphasis); }
  .rc-legend .rc-nm { min-width: 0; }
  .rc-legend .rc-ct { flex: none; padding-left: var(--space-2); font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: .78rem; color: var(--ink-canvas-muted); }
  .rc-legend .rc-desc { margin: 0; padding-left: var(--space-3); border-left: 1px solid var(--border-canvas); font-size: .82rem; font-style: italic; line-height: 1.5; color: var(--ink-canvas-secondary); min-width: 0; max-width: 28ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

const NS = "http://www.w3.org/2000/svg";

/**
 * V47's rule, held here too: the swatch IS the mark. Its fill/stroke come out of `readingMarkerStyle`
 * — the SAME call the canvas paints with (reading-marks.ts) and the SAME one ReadingLegend.svelte's
 * swatch makes — so there is no second copy of 0.18/0.95/2 anywhere in the embed. Built with
 * createElementNS + setAttribute, never innerHTML (ADR-0019's overlay rule, applied by habit).
 */
function swatch(doc: Document, colour: string): SVGSVGElement {
  const ms = readingMarkerStyle(colour, "normal");
  const svg = doc.createElementNS(NS, "svg") as SVGSVGElement;
  svg.setAttribute("class", "rc-sw");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("aria-hidden", "true");
  const rect = doc.createElementNS(NS, "rect");
  rect.setAttribute("x", "1.5");
  rect.setAttribute("y", "1.5");
  rect.setAttribute("width", "11");
  rect.setAttribute("height", "11");
  rect.setAttribute("fill", ms.fill);
  rect.setAttribute("fill-opacity", String(ms.fillOpacity));
  rect.setAttribute("stroke", ms.stroke);
  rect.setAttribute("stroke-opacity", String(ms.strokeOpacity));
  rect.setAttribute("stroke-width", String(ms.strokeWidth));
  svg.append(rect);
  return svg;
}

/**
 * Mount the reader chrome. `aside` receives the note list + object nav; `dock` (the stage's chrome row,
 * `.reader-dock`) receives the reading legend. Both are children of the element's shadow root, which is
 * re-rendered wholesale per view — so `destroy()` is about the CURRENT view's teardown (object change,
 * back), not about surviving a re-render.
 *
 * `dock` used to be the positioned canvas host, because the legend was an absolute overlay on it.
 * Handing it the ROW instead is the whole of the embed's half of ADR-0019's layout row.
 */
export function mountReaderChrome(
  aside: HTMLElement,
  dock: HTMLElement,
  opts: ReaderChromeOptions,
): ReaderChrome {
  const doc = aside.ownerDocument;
  const { exhibit, object, annotations } = opts;
  const objects = exhibit.objects ?? [];
  const colourById = readingColourById(exhibit, object.id);

  // The chrome's stylesheet rides the shadow root beside the element's own; it is removed by
  // destroy() so a torn-down reader leaves no orphan <style> behind on the next view.
  const style = injectStyle(aside, CHROME_STYLES, "data-archie-chrome");

  // ---- V70: the note list, which IS the index (Archie-c982) --------------------------------------
  const pane = doc.createElement("div");
  pane.className = "rc-aside";

  const heading = doc.createElement("p");
  heading.className = "rc-eyebrow";
  heading.textContent = `${annotations.length} ${annotations.length === 1 ? "note" : "notes"}`;
  pane.append(heading);

  // ---- the finder (Archie-1820) ------------------------------------------------------------------
  // A filter over the pane's own list rather than a modal over the canvas. The shell needs an overlay
  // because its finder is library-scale and has nowhere else to live; the embed's reading pane is
  // already a note index, so searching it in place costs no new surface, no scrim, and no second
  // focus trap — and it never covers the image, which is what ADR-0019's layout row asks of chrome.
  const find = doc.createElement("input");
  find.type = "search";
  find.className = "rc-find";
  find.setAttribute("aria-label", "Search notes in this exhibit");
  find.placeholder = "Search notes in this exhibit…";
  pane.append(find);

  const listHost = doc.createElement("div");
  listHost.className = "rc-list";
  pane.append(listHost);

  let rows = new Map<string, HTMLButtonElement>();

  /** Build one row. `where` names the object when the row is a search hit from elsewhere. */
  const rowFor = (id: string, preview: string, where: string | null, onclick: () => void): HTMLLIElement => {
    const li = doc.createElement("li");
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.dataset["note"] = id;
    // textContent, never innerHTML: a list preview is plain stripped text, and the only sanitized
    // HTML in this package goes through note-card.ts's renderMarkdown pipeline.
    const line = doc.createElement("span");
    line.className = "rc-note-text";
    line.textContent = preview;
    btn.append(line);
    if (where !== null) {
      // THE LOCUS. Archie-9eeb is open against the shell's finder precisely because its results say
      // what a note says and never where it is, so on a 21-object exhibit every hit reads as if it
      // came from the same place. A hit here names its object before it is ever clicked. Donor for
      // the shape (opened at the line): clover-iiif `ContentSearch.tsx:50-58` groups hits by
      // `target.source.id` and renders the canvas label as a group HEADER (`:83-88`) rather than
      // repeating it per row — a refinement worth taking if these lists ever get long enough to
      // repeat a name many times.
      const loc = doc.createElement("span");
      loc.className = "rc-where";
      loc.textContent = where;
      btn.append(loc);
    }
    const colour = colourById[id];
    if (colour) btn.style.borderLeftColor = colour;
    btn.addEventListener("click", onclick);
    rows.set(id, btn);
    li.append(btn);
    return li;
  };

  /** The object's OWN notes — the default view of the pane (V70's index). */
  function renderNotes(): void {
    listHost.textContent = "";
    rows = new Map();
    heading.textContent = `${annotations.length} ${annotations.length === 1 ? "note" : "notes"}`;
    if (annotations.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "rc-empty";
      empty.textContent = "No notes on this item yet.";
      listHost.append(empty);
      return;
    }
    const list = doc.createElement("ul");
    list.className = "rc-notes";
    list.setAttribute("aria-label", "Notes on this item");
    for (const ann of annotations) {
      const id = String(ann.id ?? "");
      list.append(rowFor(id, previewOf(ann), null, () => opts.onselect(id)));
    }
    listHost.append(list);
  }

  /** Search results, exhibit-wide. */
  function renderHits(q: string): void {
    const hits = searchExhibit(exhibit, q);
    listHost.textContent = "";
    rows = new Map();
    heading.textContent = `${hits.length} ${hits.length === 1 ? "match" : "matches"} in this exhibit`;
    if (hits.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "rc-empty";
      // Name the query back, so an empty result is legible as "nothing matched THIS".
      empty.textContent = `No notes match “${q}”.`;
      listHost.append(empty);
      return;
    }
    const list = doc.createElement("ul");
    list.className = "rc-notes";
    list.setAttribute("aria-label", "Search results");
    for (const h of hits) {
      list.append(rowFor(h.id, h.preview, h.objectLabel, () => {
        // A hit on THIS object is an ordinary selection; one elsewhere has to travel. Both land on
        // the note itself, never on the object's top — which is the second half of what Archie-9eeb
        // asks for, and the half clover-iiif does NOT deliver for search hits (its poll-then-zoom at
        // `Item.tsx:119-132` is gated on `isContentState`, a prop `ContentSearch.tsx` never passes,
        // so its cross-canvas path stops at the canvas). No swept system demonstrates this working;
        // the embed gets it for free only because `resolveExhibitTarget` already existed.
        if (h.objectId === object.id) opts.onselect(h.id);
        else opts.onfind(h.objectId, h.id);
      }));
    }
    listHost.append(list);
  }

  find.addEventListener("input", () => {
    const q = find.value.trim();
    if (q.length === 0) renderNotes();
    else renderHits(q);
  });
  renderNotes();

  // ---- V30: object navigation (donor: SidebarObjectNav.svelte) -----------------------------------
  // Shown whenever the exhibit HAS siblings. A single-object exhibit still gets "Back to Exhibit" —
  // the way up is the one control the reader never had a duplicate of.
  const idx = objects.findIndex((o) => o.id === object.id);
  const nav = doc.createElement("nav");
  nav.className = "rc-nav";
  nav.setAttribute("aria-label", "Objects in this exhibit");

  const overview = doc.createElement("button");
  overview.type = "button";
  overview.className = "rc-overview";
  overview.dataset["act"] = "overview";
  // "Back to Exhibit" is the LOCKED canonical term for going up a level (system.md Archie-dba2 /
  // Archie-2cc1) — the shell's breadcrumb, its reader-back and this stepper all say the same phrase.
  overview.textContent = "▦ Back to Exhibit";
  nav.append(overview);
  overview.addEventListener("click", () => opts.onoverview());

  if (objects.length > 1) {
    const prev = idx > 0 ? objects[idx - 1] : undefined;
    const next = idx >= 0 && idx < objects.length - 1 ? objects[idx + 1] : undefined;
    const stepper = doc.createElement("div");
    stepper.className = "rc-stepper";

    const mkStep = (
      target: AObject | undefined,
      act: string,
      label: string,
      whenNone: string,
    ): HTMLButtonElement => {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "rc-step";
      b.dataset["act"] = act;
      b.textContent = label;
      b.disabled = !target;
      b.setAttribute("aria-label", target ? `${label.trim()} object: ${target.label}` : whenNone);
      b.title = target ? `${label.trim()}: ${target.label}` : whenNone;
      if (target) b.addEventListener("click", () => opts.onstep(target.id));
      return b;
    };

    const pos = doc.createElement("span");
    pos.className = "rc-pos";
    pos.textContent = idx >= 0 ? positionLabel(idx, objects.length, "Object") : `– of ${objects.length}`;

    stepper.append(
      mkStep(prev, "prev", "‹ Prev", "This is the first object"),
      pos,
      mkStep(next, "next", "Next ›", "This is the last object"),
    );
    nav.append(stepper);
  }
  pane.append(nav);
  aside.append(pane);

  // ---- V56: the reading legend, DOCKED (donor: ReadingLegend.svelte) ------------------------------
  // immarkus's Legend.tsx tracks ACTIVE state rather than listing every possible category
  // (`src/pages/knowledgegraph/Legend/Legend.tsx`, rows keyed off `settings.*`). Applied here: the
  // legend lists the readings that actually carry notes on THIS object, plus the always-present base
  // layer — not the library's full reading set, which on a single-folio object would offer layers
  // that light up nothing.
  const byR = exhibit.readingAnnotationsByObject?.[object.id] ?? {};
  const baseCount = (exhibit.annotationsByObject?.[object.id] ?? []).length;
  const present: Reading[] = (exhibit.readings ?? []).filter((r) => (byR[r.id] ?? []).length > 0);
  let legend: HTMLElement | null = null;
  if (present.length > 0) {
    legend = doc.createElement("aside");
    legend.className = "rc-legend";
    legend.setAttribute("aria-label", "Readings");

    const title = doc.createElement("p");
    title.className = "rc-eyebrow";
    title.textContent = "Readings";
    legend.append(title);

    const opts_ = doc.createElement("div");
    opts_.className = "rc-opts";
    opts_.setAttribute("role", "radiogroup");
    opts_.setAttribute("aria-label", "Readings of this source");

    const mkOpt = (id: string | null, name: string, colour: string, count: number): HTMLButtonElement => {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "rc-opt";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(opts.activeReading === id));
      b.dataset["reading"] = id ?? "";
      b.style.setProperty("--rc-rd", colour);
      b.append(swatch(doc, colour));
      const nm = doc.createElement("span");
      nm.className = "rc-nm";
      nm.textContent = name;
      const ct = doc.createElement("span");
      ct.className = "rc-ct";
      ct.textContent = String(count);
      ct.title = `${count} notes on this image`;
      b.append(nm, ct);
      b.addEventListener("click", () => opts.onreading(id));
      return b;
    };

    // The base layer is always offered — Q16: base notes stay visible, a reading OVERLAYS them.
    opts_.append(mkOpt(null, "General notes", BASE_MARK_COLOUR, baseCount));
    for (const r of present) {
      opts_.append(mkOpt(r.id, r.name, r.colour ?? "#3A8C5D", (byR[r.id] ?? []).length));
    }
    legend.append(opts_);

    const activeDesc = present.find((r) => r.id === opts.activeReading)?.description;
    if (activeDesc) {
      const p = doc.createElement("p");
      p.className = "rc-desc";
      p.textContent = activeDesc;
      legend.append(p);
    }
    dock.append(legend);
  }

  let selected: string | null = null;
  return {
    setSelected(id: string | null): void {
      if (selected !== null) rows.get(selected)?.removeAttribute("aria-current");
      selected = id;
      if (id !== null) {
        const row = rows.get(id);
        row?.setAttribute("aria-current", "true");
        // A mark clicked on the canvas must find its row even when the list has scrolled past it —
        // otherwise the index answers "where am I" only in one direction.
        row?.scrollIntoView?.({ block: "nearest" });
      }
    },
    destroy(): void {
      pane.remove();
      legend?.remove();
      style.remove();
      rows.clear();
    },
  };
}

// V88 — the narrative spine (ADR-0005) in the embed.
//
// LAZY, AND CONDITIONALLY SO. element.ts reaches this module with `await import("./narrative.js")`
// and ONLY when `exhibit.sections.length > 0`, so an exhibit with no spine never downloads it. That
// is the shape Archie-52a9 costed the capability at (~8KB, and only for exhibits that HAVE sections)
// and the reason it survived the weight objection.
//
// WHAT WAS MISSING. `voynich-reading` — the one exhibit whose entire subject is the narrative —
// rendered 12 thumbnails, zero prose, no sections, no spine. The manifest carried all six Ranges the
// whole time (`structures[]`, recovered into `PortableExhibit.sections` by the SAME `readExhibitTree`
// the shell reads); nothing in the embed ever looked at them.
//
// Donor: apps/viewer NarrativeReader.svelte's aside — eyebrow with the section count and position,
// title, then an ordered list of sections where each row is `title` + its prose. Ported structure,
// not the component (ADR-0019: framework-free by design).

import { renderMarkdown, type PortableExhibit, type Section } from "@render/core";
import { injectStyle, positionLabel } from "./reader-chrome.js";

export interface NarrativeOptions {
  exhibit: PortableExhibit;
  /** Index of the active section. */
  index: number;
  /** A section was chosen (row click, or the stepper). */
  onactivate(index: number): void;
  /** Leave the spine for the object grid — NarrativeReader's "All items" escape. */
  onindex(): void;
}

export interface NarrativeAside {
  destroy(): void;
}

const NARRATIVE_STYLES = `
  .nr-aside { display: flex; flex-direction: column; min-height: 100%; padding: var(--space-5); box-sizing: border-box; font-family: var(--font-body); color: var(--ink-paper-primary); }
  .nr-eyebrow { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-paper-secondary); margin: 0 0 var(--space-2); }
  .nr-title { font-family: var(--font-display-2); font-weight: 400; font-size: 1.35rem; margin: 0 0 var(--space-4); }
  .nr-sections { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); flex: 1 1 auto; }
  .nr-sections > li { margin: 0; }
  .nr-sections button {
    display: block; width: 100%; text-align: left; cursor: pointer; font: inherit; color: inherit;
    padding: var(--space-3) var(--space-4); border: 1px solid var(--border-paper); border-left: 3px solid transparent;
    border-radius: var(--radius-sm); background: var(--surface-paper-card);
  }
  .nr-sections button:hover { background: var(--surface-paper-hover); }
  .nr-sections button[aria-current="true"] { border-left-color: var(--accent); background: var(--surface-paper-hover); }
  .nr-sections .nr-num { display: block; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-paper-secondary); margin-bottom: var(--space-2); }
  .nr-sections .nr-prose { font-size: .92rem; line-height: 1.6; }
  .nr-sections .nr-prose > :first-child { margin-top: 0; }
  .nr-sections .nr-prose > :last-child { margin-bottom: 0; }
  .nr-sections .nr-prose a { color: var(--accent-2-paper); }
  /* Collapsed rows keep the spine scannable: only the ACTIVE section shows its prose in full. */
  .nr-sections button:not([aria-current="true"]) .nr-prose { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--ink-paper-secondary); }
  .nr-foot { position: sticky; bottom: 0; margin: var(--space-5) calc(-1 * var(--space-5)) calc(-1 * var(--space-5)); padding: var(--space-3) var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); background: var(--surface-paper); border-top: 1px solid var(--border-canvas); }
  .nr-foot .nr-index { align-self: start; display: inline-flex; align-items: center; gap: var(--space-2); background: none; border: none; padding: var(--space-1) 0; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  .nr-foot .nr-index:hover { color: var(--accent-2); }
  .nr-stepper { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .nr-stepper button { display: inline-flex; align-items: center; gap: var(--space-1); background: none; border: none; padding: var(--space-2); cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-paper-secondary); }
  .nr-stepper button:hover:not(:disabled) { color: var(--accent-2); }
  .nr-stepper button:disabled { opacity: .32; cursor: default; }
  .nr-pos { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: var(--text-ui-sm); letter-spacing: .08em; color: var(--ink-paper-muted); }
`;

/** The spine, ordered as published. Exposed so the element can resolve a section's object/camera. */
export function sectionsOf(exhibit: PortableExhibit): Section[] {
  return exhibit.sections ?? [];
}

/**
 * Mount the narrative aside into `aside` (the reader layout's reading pane). The canvas half is the
 * ordinary reader surface — a Section names an `objectId` and a `start` fragment, and the element
 * mounts that object and fits that camera, which is exactly ADR-0005's contract.
 */
export function mountNarrative(aside: HTMLElement, opts: NarrativeOptions): NarrativeAside {
  const doc = aside.ownerDocument;
  const sections = sectionsOf(opts.exhibit);
  const index = Math.min(Math.max(opts.index, 0), Math.max(sections.length - 1, 0));

  const style = injectStyle(aside, NARRATIVE_STYLES, "data-archie-narrative");

  const pane = doc.createElement("div");
  pane.className = "nr-aside";

  const eyebrow = doc.createElement("p");
  eyebrow.className = "nr-eyebrow";
  eyebrow.textContent =
    `Narrative · ${sections.length} ${sections.length === 1 ? "section" : "sections"}` +
    (sections.length > 1 ? ` · ${positionLabel(index, sections.length, "Section")}` : "");
  const title = doc.createElement("h1");
  title.className = "nr-title";
  title.textContent = opts.exhibit.title;
  pane.append(eyebrow, title);

  const list = doc.createElement("ol");
  list.className = "nr-sections";
  list.setAttribute("aria-label", "Sections");
  sections.forEach((s, i) => {
    const li = doc.createElement("li");
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.dataset["section"] = String(i);
    if (i === index) btn.setAttribute("aria-current", "true");
    const num = doc.createElement("span");
    num.className = "nr-num";
    num.textContent = s.title;
    const prose = doc.createElement("div");
    prose.className = "nr-prose";
    // renderMarkdown is render-core's snarkdown → DOMPurify pipeline — the SAME sanitized channel
    // note-card.ts uses. Section prose is authored markdown, so it must render as prose; it must also
    // never reach innerHTML unsanitized, and this is the one function in the repo that guarantees both.
    prose.innerHTML = renderMarkdown(s.prose ?? "");
    btn.append(num, prose);
    btn.addEventListener("click", () => opts.onactivate(i));
    li.append(btn);
    list.append(li);
  });
  pane.append(list);

  const foot = doc.createElement("nav");
  foot.className = "nr-foot";
  foot.setAttribute("aria-label", "Narrative");
  const toIndex = doc.createElement("button");
  toIndex.type = "button";
  toIndex.className = "nr-index";
  toIndex.dataset["act"] = "index";
  toIndex.textContent = "▦ All items";
  toIndex.addEventListener("click", () => opts.onindex());
  foot.append(toIndex);

  if (sections.length > 1) {
    const stepper = doc.createElement("div");
    stepper.className = "nr-stepper";
    const mk = (to: number, act: string, label: string): HTMLButtonElement => {
      const b = doc.createElement("button");
      b.type = "button";
      b.dataset["act"] = act;
      b.textContent = label;
      b.disabled = to < 0 || to >= sections.length;
      if (!b.disabled) b.addEventListener("click", () => opts.onactivate(to));
      return b;
    };
    const pos = doc.createElement("span");
    pos.className = "nr-pos";
    pos.textContent = positionLabel(index, sections.length, "Section");
    stepper.append(mk(index - 1, "prev-section", "‹ Prev"), pos, mk(index + 1, "next-section", "Next ›"));
    foot.append(stepper);
  }
  pane.append(foot);
  aside.append(pane);

  return {
    destroy(): void {
      pane.remove();
      style.remove();
    },
  };
}

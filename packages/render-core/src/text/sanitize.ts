// Body sanitization (CONTEXT named cut §151 — XSS). Note bodies may carry user-authored
// HTML/markdown; render them THROUGH this. DOMPurify with the html profile strips scripts,
// event-handler attributes, and javascript: URLs while keeping safe formatting. Donor:
// field-studio sanitizeSvg/sanitizeIIIFResource. Uses the ambient window (browser, or happy-dom
// in tests). Framework-agnostic (no Svelte dependency) — the publish static-pages path documents
// this same pipeline, so it belongs in @render/core, not @render/svelte.

import DOMPurify from "isomorphic-dompurify";
import snarkdown from "snarkdown";

// "No dead anchors" invariant: when sanitization strips an <a>'s href (a disallowed scheme — a stray
// internal `archie:` cite that escaped the publish rewrite, or a javascript: URL), UNWRAP the anchor to
// its text rather than leave a link-colored element that goes nowhere. Mirrors link.ts's "broken refs
// degrade to plain text, never a dead href". Registered once at module load; runs on every sanitizeHtml
// (hence renderMarkdown) call. replaceWith(string) yields a text node — no document handle needed.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && !node.getAttribute("href")) node.replaceWith(node.textContent ?? "");
});

/** Sanitize an HTML body value for safe rendering. Empty/non-string -> "". */
export function sanitizeHtml(dirty: string): string {
  if (typeof dirty !== "string" || dirty.length === 0) return "";
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}

/**
 * Render a markdown body to SAFE HTML for display (note bodies are authored as markdown — e.g. the
 * imported Voynich annotations). snarkdown → sanitizeHtml so markdown content can never inject
 * script. Edit surfaces keep the raw markdown; only DISPLAY goes through this. Empty -> "".
 */
export function renderMarkdown(md: string): string {
  if (typeof md !== "string" || md.length === 0) return "";
  return sanitizeHtml(snarkdown(md));
}

/** Markdown → plain text, for list snippets (block markdown can't live inside a <button>). */
export function stripMarkdown(md: string): string {
  if (typeof md !== "string") return "";
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")     // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // links → their text
    .replace(/[*_`#>~]/g, "")                 // emphasis / heading / quote / code markers
    .replace(/\s+/g, " ")
    .trim();
}

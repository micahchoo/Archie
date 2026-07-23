// Search-aware excerpting for the catalog pickers (CmdK + NotePicker). A note's full text feeds the
// row, visually clamped to two lines — but a query can match DEEP in the note, past the clamp, and an
// invisible match reads as a wrong result. `snippetParts` windows the text so the first match is on
// screen (shifted openings get an "… " prefix at a word boundary) and splits it pre/match/post so the
// component can render the matched run emphasized without any HTML injection.

export interface SnippetParts {
  pre: string;
  match: string; // "" when there is no query or no match — render `pre` alone
  post: string;
}

// Characters from the window's start that a two-line clamp reliably shows; a match that begins
// inside this head needs no shift. Conservative for the 560px drawer (~65 chars/line).
const VISIBLE_HEAD = 90;
// How far before a shifted match the window opens — enough leading context to read the phrase.
const LOOKBACK = 32;

export function snippetParts(text: string, query: string): SnippetParts {
  const q = query.trim().toLowerCase();
  if (!q) return { pre: text, match: "", post: "" };
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return { pre: text, match: "", post: "" }; // matched on metadata (where/title), not the text
  let start = 0;
  let prefix = "";
  if (i > VISIBLE_HEAD) {
    const from = Math.max(0, i - LOOKBACK);
    const space = text.indexOf(" ", from);
    start = space >= 0 && space < i ? space + 1 : from;
    prefix = "… ";
  }
  return {
    pre: prefix + text.slice(start, i),
    match: text.slice(i, i + q.length), // original casing, not the lowercased query
    post: text.slice(i + q.length),
  };
}

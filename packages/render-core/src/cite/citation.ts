// A formatted, copyable reference for whatever the reader is looking at (V102, Archie-3ea1).
//
// PRIOR ART: quire's citation component
// (`packages/11ty/_includes/components/citation/page.js`) adapts page data to a CSL-JSON `webpage`
// item — `author`, `container-title`, `editor`, `issued.date-parts`, `publisher`,
// `publisher-place`, `title`, `type`, `URL` — and hands it to a formatter plugin that renders MLA or
// Chicago. This module deliberately copies quire's FIELD MAPPING and stops short of its formatter.
//
// WHY NOT A REAL CSL FORMATTER. Rendering true MLA/Chicago means citation-js or citeproc — a new
// runtime dependency in the viewer's island graph, which is the exact shape that has bitten this repo
// three times (`.claude/rules/viewer-optimizedeps-bare-includes.md`) and would land on the embed's
// eager budget too. A reader copying a reference into a paper restyles it to their venue anyway. So:
// emit the CSL-JSON (the interchange format — paste it into Zotero and it IS a real citation) and one
// plainly-formatted Chicago-ish line beside it. The CSL item is the part that must be RIGHT; the
// string is a convenience over it, and is built FROM it so the two cannot disagree.
//
// The inputs are all already-resolved published values (ADR: the opt-in cascade collapses at publish),
// so this never re-runs inheritance — same rule the credit line follows.

import { dctermsLabel } from "../model/dcterms.js";
import type { MetadataEntry, RightsFields } from "../model/model.js";

/** A CSL-JSON name variable (quire `name.js`: family/given split). */
export interface CslName {
  family: string;
  given?: string;
}

/** The subset of CSL-JSON this maps onto — quire's `page.js` field set, minus what Archie has no
 *  source for (`editor`, `publisher-place`). Extra keys are legal CSL and are simply absent here. */
export interface CslItem {
  id: string;
  type: "graphic" | "chapter" | "webpage";
  title: string;
  "container-title"?: string;
  author?: CslName[];
  publisher?: string;
  issued?: { "date-parts": number[][] };
  URL?: string;
  /** The IIIF `requiredStatement` — a MUST-display credit, carried so a pasted citation keeps it. */
  note?: string;
  /** The licence URI. CSL has no rights variable; this rides `note` in the rendered string. */
  rights?: string;
}

export interface CitationInput {
  /** What is being cited — an object, a section, a note, or the exhibit itself. */
  title: string;
  /** The exhibit (or library) the cited thing sits in. */
  containerTitle?: string;
  /** The address for this exact rung — READ from the live address, never re-derived (Archie-99b1). */
  url?: string;
  /** Already-resolved rights for the cited thing: credit, licence, Dublin Core. */
  rights?: RightsFields;
  /** Stable id for the CSL item — the note's logical id, the object id, the slug. */
  id?: string;
  /** `graphic` for an object/note on an image, `chapter` for a narrative section. Default `graphic`. */
  type?: CslItem["type"];
}

/** Case-folded property/label match against the Dublin Core entries. */
function metaValues(entries: MetadataEntry[] | undefined, property: string): string[] {
  if (!entries) return [];
  const wantLabel = dctermsLabel(property)?.toLowerCase();
  const out: string[] = [];
  for (const e of entries) {
    const label = (e.label ?? "").trim().toLowerCase();
    const matches = e.property === property || (wantLabel !== undefined && label === wantLabel);
    const v = e.value.trim();
    if (matches && v !== "") out.push(v);
  }
  return out;
}

/** Split a display name into CSL family/given, quire `name.js`'s rule: last token is the family name.
 *  A single-token name (an institution — "Beinecke Rare Book & Manuscript Library") stays whole as
 *  `family`, which is also how CSL represents a literal/institutional name. */
export function cslName(full: string): CslName {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2 || /library|museum|archive|collection|university|foundation/i.test(full)) {
    return { family: full.trim() };
  }
  return { family: parts[parts.length - 1]!, given: parts.slice(0, -1).join(" ") };
}

/** First 4-digit year in a free-text date ("ca. 1404–1438" → 1404). Undefined when there is none —
 *  never a guess: a wrong year in a citation is worse than an absent one. */
export function yearOf(text: string | undefined): number | undefined {
  const m = text?.match(/\b(\d{4})\b/);
  return m ? Number(m[1]) : undefined;
}

/** Build the CSL-JSON item. Pure. */
export function cslItemFor(input: CitationInput): CslItem {
  const md = input.rights?.metadata;
  const creators = metaValues(md, "dcterms:creator");
  const publisher = metaValues(md, "dcterms:publisher")[0];
  const date = metaValues(md, "dcterms:date")[0];
  const year = yearOf(date);
  const credit = input.rights?.requiredStatement?.value;
  return {
    id: input.id ?? input.title,
    type: input.type ?? "graphic",
    title: input.title,
    ...(input.containerTitle ? { "container-title": input.containerTitle } : {}),
    ...(creators.length ? { author: creators.map(cslName) } : {}),
    ...(publisher ? { publisher } : {}),
    ...(year !== undefined ? { issued: { "date-parts": [[year]] } } : {}),
    ...(input.url ? { URL: input.url } : {}),
    ...(credit ? { note: credit } : {}),
    ...(input.rights?.rights ? { rights: input.rights.rights } : {}),
  };
}

const nameText = (n: CslName): string => (n.given ? `${n.given} ${n.family}` : n.family);

/**
 * A plain Chicago-ish reference, built FROM the CSL item so the two can never drift.
 *
 * Shape: `Author. "Title." Container. Publisher, Year. Credit. Licence. URL.`
 * Every segment is omitted when its source field is absent — no empty brackets, no "n.d.", no
 * placeholder the reader has to delete. A citation that invents structure it does not have is worse
 * than a short one.
 */
export function citationText(item: CslItem): string {
  const parts: string[] = [];
  if (item.author?.length) parts.push(`${item.author.map(nameText).join(", ")}.`);
  parts.push(`“${item.title}.”`);
  if (item["container-title"]) parts.push(`${item["container-title"]}.`);
  const year = item.issued?.["date-parts"]?.[0]?.[0];
  if (item.publisher && year !== undefined) parts.push(`${item.publisher}, ${year}.`);
  else if (item.publisher) parts.push(`${item.publisher}.`);
  else if (year !== undefined) parts.push(`${year}.`);
  if (item.note) parts.push(`${item.note.replace(/\.\s*$/, "")}.`);
  if (item.rights) parts.push(`${item.rights}.`);
  if (item.URL) parts.push(item.URL);
  return parts.join(" ");
}

/** The whole projection: the interchange item plus its rendered line. */
export function citationFor(input: CitationInput): { csl: CslItem; text: string } {
  const csl = cslItemFor(input);
  return { csl, text: citationText(csl) };
}

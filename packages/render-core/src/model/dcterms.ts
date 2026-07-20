// DCMI Metadata Terms vocabulary data (Dublin Core pipeline, Archie-c6bf).
//
// The 55 `rdf:Property` terms of http://purl.org/dc/terms/ — prefixed name, preferred display
// label, one-line comment — parsed from Tropy's bundled `dcterms.n3` via the research asset
// (docs/research/dublin-core-vocab.md §1.2; authoritative fallback
// ../tropy/res/vocab/dcterms.n3). dcterms: ONLY, never the legacy `dc:` elements (the 15 dc:
// labels are identical to their dcterms twins', so label matching covers both).
//
// Tropy's decoupling carries here (research asset §2/§4): the VOCABULARY supplies the menu of
// properties + default labels/comments; an entry references a property by prefixed name and may
// override the label per-entry (`MetadataEntry.label`) — display strings are resolved from this
// module, never hardcoded into entries.

/** One dcterms property: prefixed name + preferred label + one-line comment. */
export interface DctermsProperty {
  /** Prefixed name, e.g. "dcterms:creator". */
  property: `dcterms:${string}`;
  /** Preferred display label (the vocabulary's rdfs:label). */
  label: string;
  /** One-line rdfs:comment. */
  comment: string;
}

const P = (name: string, label: string, comment: string): DctermsProperty =>
  ({ property: `dcterms:${name}`, label, comment });

/** All 55 dcterms properties, in the research asset's inventory order (the 15 dc: twins first,
 *  then the refinements/extensions). */
export const DCTERMS_PROPERTIES: readonly DctermsProperty[] = [
  P("title", "Title", "A name given to the resource."),
  P("creator", "Creator", "An entity primarily responsible for making the resource."),
  P("subject", "Subject", "The topic of the resource."),
  P("description", "Description", "An account of the resource."),
  P("publisher", "Publisher", "An entity responsible for making the resource available."),
  P("contributor", "Contributor", "An entity responsible for making contributions to the resource."),
  P("date", "Date", "A point or period of time in the resource's lifecycle."),
  P("type", "Type", "The nature or genre of the resource."),
  P("format", "Format", "The file format, physical medium, or dimensions of the resource."),
  P("identifier", "Identifier", "An unambiguous reference to the resource within a given context."),
  P("source", "Source", "A related resource from which the described resource is derived."),
  P("language", "Language", "A language of the resource."),
  P("relation", "Relation", "A related resource."),
  P("coverage", "Coverage", "Spatial/temporal topic, applicability, or jurisdiction of the resource."),
  P("rights", "Rights", "Information about rights held in and over the resource."),
  P("abstract", "Abstract", "A summary of the resource."),
  P("tableOfContents", "Table Of Contents", "A list of subunits of the resource."),
  P("alternative", "Alternative Title", "An alternative name for the resource."),
  P("created", "Date Created", "Date of creation of the resource."),
  P("issued", "Date Issued", "Date of formal issuance (e.g., publication) of the resource."),
  P("modified", "Date Modified", "Date on which the resource was changed."),
  P("available", "Date Available", "Date (often a range) the resource became/will become available."),
  P("dateAccepted", "Date Accepted", "Date of acceptance of the resource."),
  P("dateCopyrighted", "Date Copyrighted", "Date of copyright."),
  P("dateSubmitted", "Date Submitted", "Date of submission of the resource."),
  P("valid", "Date Valid", "Date (often a range) of validity of a resource."),
  P("extent", "Extent", "The size or duration of the resource."),
  P("medium", "Medium", "The material or physical carrier of the resource."),
  P("bibliographicCitation", "Bibliographic Citation", "A bibliographic reference for the resource."),
  P("spatial", "Spatial Coverage", "Spatial characteristics of the resource."),
  P("temporal", "Temporal Coverage", "Temporal characteristics of the resource."),
  P("accessRights", "Access Rights", "Who can access the resource, or its security status."),
  P("license", "License", "A legal document giving official permission to do something with the resource."),
  P("conformsTo", "Conforms To", "An established standard to which the described resource conforms."),
  P("hasFormat", "Has Format", "A related resource substantially the same but in another format."),
  P("hasPart", "Has Part", "A related resource included physically or logically in this one."),
  P("hasVersion", "Has Version", "A related resource that is a version/edition/adaptation of this one."),
  P("isFormatOf", "Is Format Of", "A related resource substantially the same as this one, in another format."),
  P("isPartOf", "Is Part Of", "A related resource in which this one is physically/logically included."),
  P("isReferencedBy", "Is Referenced By", "A related resource that references or cites this one."),
  P("isReplacedBy", "Is Replaced By", "A related resource that supplants/supersedes this one."),
  P("isRequiredBy", "Is Required By", "A related resource that requires this one to function."),
  P("isVersionOf", "Is Version Of", "A related resource of which this one is a version/edition/adaptation."),
  P("references", "References", "A related resource that this one references or cites."),
  P("replaces", "Replaces", "A related resource that this one supplants/supersedes."),
  P("requires", "Requires", "A related resource that this one requires to function."),
  P("provenance", "Provenance", "A statement of changes in ownership/custody significant for authenticity/integrity."),
  P("rightsHolder", "Rights Holder", "A person or organization owning or managing rights over the resource."),
  P("audience", "Audience", "A class of entity for whom the resource is intended or useful."),
  P("educationLevel", "Audience Education Level", "Audience defined by progression through an educational context."),
  P("mediator", "Mediator", "An entity that mediates access to the resource for the intended audience."),
  P("accrualMethod", "Accrual Method", "The method by which items are added to a collection."),
  P("accrualPeriodicity", "Accrual Periodicity", "The frequency with which items are added to a collection."),
  P("accrualPolicy", "Accrual Policy", "The policy governing the addition of items to a collection."),
  P("instructionalMethod", "Instructional Method", "A process the resource is designed to support (knowledge/attitudes/skills)."),
] as const;

const byProperty = new Map(DCTERMS_PROPERTIES.map((p) => [p.property as string, p]));
const byLowerLabel = new Map(DCTERMS_PROPERTIES.map((p) => [p.label.toLowerCase(), p]));

/** Look up a dcterms property record by its prefixed name ("dcterms:creator"), or undefined. */
export function dctermsProperty(property: string): DctermsProperty | undefined {
  return byProperty.get(property);
}

/** The vocabulary's preferred display label for a prefixed name, or undefined for an unknown one. */
export function dctermsLabel(property: string): string | undefined {
  return byProperty.get(property)?.label;
}

/**
 * Import alias table (Archie-c6bf import mapping): common third-party manifest labels that mean a
 * dcterms property without being its preferred label. Keys are LOWERCASE (the matcher lowercases);
 * conservative on purpose — an alias that guesses wrong silently rewrites a curator's field, while
 * an unmatched label imports verbatim and loses nothing.
 */
export const IMPORT_LABEL_ALIASES: Readonly<Record<string, `dcterms:${string}`>> = {
  author: "dcterms:creator",
  authors: "dcterms:creator",
  artist: "dcterms:creator",
  keywords: "dcterms:subject",
  topic: "dcterms:subject",
  citation: "dcterms:bibliographicCitation",
  "call number": "dcterms:identifier",
};

/**
 * Match a third-party pair's label to a dcterms property: case-insensitive against the 55 preferred
 * labels, then the alias table. Returns the prefixed name or undefined (→ import verbatim). NB: a
 * match may still be EXCLUDED ({@link METADATA_EXCLUDED_PROPERTIES}) — callers check that next.
 */
export function matchDctermsProperty(label: string): `dcterms:${string}` | undefined {
  const key = label.trim().toLowerCase();
  if (key === "") return undefined;
  return byLowerLabel.get(key)?.property ?? IMPORT_LABEL_ALIASES[key];
}

/**
 * Properties NEVER offered/authored as metadata entries: each collides with a NATIVE Archie field
 * that already IS the corresponding IIIF typed slot (research asset §4 overlap flag — title=label,
 * description/abstract=summary, rights/license=rights+requiredStatement). Offering them would
 * publish two disagreeing title/rights surfaces. An import whose label maps here goes VERBATIM
 * (label+value, no property) — never double-authored, never clobbering a native field.
 */
export const METADATA_EXCLUDED_PROPERTIES: ReadonlySet<string> = new Set([
  "dcterms:title",
  "dcterms:description",
  "dcterms:abstract",
  "dcterms:rights",
  "dcterms:license",
]);

/** The default field set offered per level (research asset §4 — Tropy generic / Omeka defaults,
 *  minus what Archie owns natively). Data for the coming picker UI; the pipeline itself accepts
 *  any non-excluded dcterms property. */
export const DEFAULT_METADATA_FIELDS: Readonly<Record<"library" | "exhibit" | "object", readonly `dcterms:${string}`[]>> = {
  library: ["dcterms:creator", "dcterms:publisher", "dcterms:date", "dcterms:identifier"],
  exhibit: ["dcterms:creator", "dcterms:date", "dcterms:subject"],
  object: ["dcterms:creator", "dcterms:date", "dcterms:subject", "dcterms:type", "dcterms:identifier", "dcterms:source"],
};

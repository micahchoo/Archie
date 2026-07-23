# Dublin Core & pick-from-vocab metadata — research asset

Answers the wayfinder ticket: *what is actually in `dc` (15 elements) and `dcterms`
(extended), and how do prior-art tools model "pick a property subset from a vocabulary"
metadata?* Sources are local unless a URL is given: the vocabularies are parsed from
Tropy's bundled copies (`../tropy/res/vocab/dc.n3`, `dcterms.n3`), the template model from
`../tropy/res/ttp/*.ttp` + `../tropy/src/ontology/`.

---

## 1. Property inventory

### 1.1 Dublin Core Elements — `http://purl.org/dc/elements/1.1/` (prefix `dc:`, 15 properties)

The original 15. All are optional, repeatable, and untyped (plain literals) by design — the
"lowest common denominator" set. Parsed from `dc.n3`.

| URI (`dc:`) | Label | Comment |
|---|---|---|
| `dc:title` | Title | A name given to the resource. |
| `dc:creator` | Creator | An entity primarily responsible for making the resource. |
| `dc:subject` | Subject | The topic of the resource. |
| `dc:description` | Description | An account of the resource. |
| `dc:publisher` | Publisher | An entity responsible for making the resource available. |
| `dc:contributor` | Contributor | An entity responsible for making contributions to the resource. |
| `dc:date` | Date | A point or period of time associated with an event in the lifecycle of the resource. |
| `dc:type` | Type | The nature or genre of the resource. |
| `dc:format` | Format | The file format, physical medium, or dimensions of the resource. |
| `dc:identifier` | Identifier | An unambiguous reference to the resource within a given context. |
| `dc:source` | Source | A related resource from which the described resource is derived. |
| `dc:language` | Language | A language of the resource. |
| `dc:relation` | Relation | A related resource. |
| `dc:coverage` | Coverage | The spatial or temporal topic, spatial applicability, or jurisdiction of the resource. |
| `dc:rights` | Rights | Information about rights held in and over the resource. |

### 1.2 DCMI Metadata Terms — `http://purl.org/dc/terms/` (prefix `dcterms:`, 55 properties)

`dcterms.n3` declares 55 `rdf:Property` terms (plus ~40 encoding-scheme/class resources,
excluded here). **15 of them are the same-name refinements of the legacy elements** (e.g.
`dcterms:title rdfs:subPropertyOf dc:title`): DCMI recommends these typed/ranged `dcterms`
versions over the plain `dc:` ones for new work. The rest are net-new extended terms.

The **Refines** column reflects the `rdfs:subPropertyOf` declared in the n3: a `dc:` element
where the n3 says so, `= dc:X (twin)` for the 15 same-name upgrades, a `dcterms:` parent for
second-order refinements, or blank when the term stands alone.

| URI (`dcterms:`) | Label | Refines | Comment |
|---|---|---|---|
| `title` | Title | = dc:title (twin) | A name given to the resource. |
| `creator` | Creator | = dc:creator (twin) | An entity primarily responsible for making the resource. |
| `subject` | Subject | = dc:subject (twin) | The topic of the resource. |
| `description` | Description | = dc:description (twin) | An account of the resource. |
| `publisher` | Publisher | = dc:publisher (twin) | An entity responsible for making the resource available. |
| `contributor` | Contributor | = dc:contributor (twin) | An entity responsible for making contributions to the resource. |
| `date` | Date | = dc:date (twin) | A point or period of time in the resource's lifecycle. |
| `type` | Type | = dc:type (twin) | The nature or genre of the resource. |
| `format` | Format | = dc:format (twin) | The file format, physical medium, or dimensions of the resource. |
| `identifier` | Identifier | = dc:identifier (twin) | An unambiguous reference to the resource within a given context. |
| `source` | Source | = dc:source (twin) | A related resource from which the described resource is derived. |
| `language` | Language | = dc:language (twin) | A language of the resource. |
| `relation` | Relation | = dc:relation (twin) | A related resource. |
| `coverage` | Coverage | = dc:coverage (twin) | Spatial/temporal topic, applicability, or jurisdiction of the resource. |
| `rights` | Rights | = dc:rights (twin) | Information about rights held in and over the resource. |
| `abstract` | Abstract | dc:description | A summary of the resource. |
| `tableOfContents` | Table Of Contents | dc:description | A list of subunits of the resource. |
| `alternative` | Alternative Title | dc:title | An alternative name for the resource. |
| `created` | Date Created | dc:date | Date of creation of the resource. |
| `issued` | Date Issued | dc:date | Date of formal issuance (e.g., publication) of the resource. |
| `modified` | Date Modified | dc:date | Date on which the resource was changed. |
| `available` | Date Available | dc:date | Date (often a range) the resource became/will become available. |
| `dateAccepted` | Date Accepted | dc:date | Date of acceptance of the resource. |
| `dateCopyrighted` | Date Copyrighted | dc:date | Date of copyright. |
| `dateSubmitted` | Date Submitted | dc:date | Date of submission of the resource. |
| `valid` | Date Valid | dc:date | Date (often a range) of validity of a resource. |
| `extent` | Extent | dc:format | The size or duration of the resource. |
| `medium` | Medium | dc:format | The material or physical carrier of the resource. |
| `bibliographicCitation` | Bibliographic Citation | dc:identifier | A bibliographic reference for the resource. |
| `spatial` | Spatial Coverage | dc:coverage | Spatial characteristics of the resource. |
| `temporal` | Temporal Coverage | dc:coverage | Temporal characteristics of the resource. |
| `accessRights` | Access Rights | dc:rights | Who can access the resource, or its security status. |
| `license` | License | dc:rights | A legal document giving official permission to do something with the resource. |
| `conformsTo` | Conforms To | dc:relation | An established standard to which the described resource conforms. |
| `hasFormat` | Has Format | dc:relation | A related resource substantially the same but in another format. |
| `hasPart` | Has Part | dc:relation | A related resource included physically or logically in this one. |
| `hasVersion` | Has Version | dc:relation | A related resource that is a version/edition/adaptation of this one. |
| `isFormatOf` | Is Format Of | dc:relation | A related resource substantially the same as this one, in another format. |
| `isPartOf` | Is Part Of | dc:relation | A related resource in which this one is physically/logically included. |
| `isReferencedBy` | Is Referenced By | dc:relation | A related resource that references or cites this one. |
| `isReplacedBy` | Is Replaced By | dc:relation | A related resource that supplants/supersedes this one. |
| `isRequiredBy` | Is Required By | dc:relation | A related resource that requires this one to function. |
| `isVersionOf` | Is Version Of | dc:relation | A related resource of which this one is a version/edition/adaptation. |
| `references` | References | dc:relation | A related resource that this one references or cites. |
| `replaces` | Replaces | dc:relation | A related resource that this one supplants/supersedes. |
| `requires` | Requires | dc:relation | A related resource that this one requires to function. |
| `provenance` | Provenance | — | A statement of changes in ownership/custody significant for authenticity/integrity. |
| `rightsHolder` | Rights Holder | — | A person or organization owning or managing rights over the resource. |
| `audience` | Audience | — | A class of entity for whom the resource is intended or useful. |
| `educationLevel` | Audience Education Level | dcterms:audience | Audience defined by progression through an educational context. |
| `mediator` | Mediator | dcterms:audience | An entity that mediates access to the resource for the intended audience. |
| `accrualMethod` | Accrual Method | — | The method by which items are added to a collection. |
| `accrualPeriodicity` | Accrual Periodicity | — | The frequency with which items are added to a collection. |
| `accrualPolicy` | Accrual Policy | — | The policy governing the addition of items to a collection. |
| `instructionalMethod` | Instructional Method | — | A process the resource is designed to support (knowledge/attitudes/skills). |

**Takeaway for Archie:** DCMI itself splits the vocabulary into a *stable 15-term display
core* and a *long tail of refinements* almost entirely along four axes — **dates** (10
refinements of `dc:date`), **relations** (15 refinements of `dc:relation`), **rights** (3),
and **coverage/format** (5). A tool that shows `title / creator / date / subject / rights`
by default and lets power users reach the refinements covers the same ground every prior-art
tool below converges on.

---

## 2. Tropy's pick-from-vocab model

Tropy is the closest prior art: a desktop research-photo tool whose *entire* metadata UX is
"a template picks a subset of RDF properties, each rendered as one field." The mechanics:

**A template is a JSON-LD document that lists fields.** (`res/ttp/generic.ttp`,
`src/ontology/template.js`.) A `.ttp` file is `@type tropy#Template` with a `field` array;
`Template.parse`/`Template.defaults` (`template.js:8`, `:47`) show the record shape:
`{ type, name, version, domain, creator, description, field[] }`. The template does **not**
copy the vocabulary — it references properties by URI, and the vocabulary (labels, comments)
is loaded separately (below). This is the core seam: **template = ordered list of property
URIs + per-field presentation overrides.**

**A field entry** (`Field.defaults`, `template.js:66`) carries exactly:

| Key | Meaning |
|---|---|
| `property` | the RDF property URI — the only semantic anchor (e.g. `http://purl.org/dc/elements/1.1/title`) |
| `label` | optional **display override**; `null`/`''` → fall back to the vocabulary's `rdfs:label` |
| `datatype` | value type URI — `xsd:string` (`TYPE.TEXT`), `tropy#date` (`TYPE.DATE`), `xsd:integer` (`TYPE.NUMBER`) (`src/constants/type.js`) |
| `hint` | placeholder/help text shown in the field (e.g. `"ISO format (YYYY-MM-DD)"`) |
| `isRequired` | soft-required flag (the generic template marks only `dc:rights` required) |
| `isConstant` | value is fixed by the template, not user-edited |
| `value` | optional default/constant value |

`generic.ttp` is the instructive example: 10 fields mixing `dc:` elements (`title`, `creator`,
`date`, `type`, `source` relabeled *"Archive"*, `identifier`, `rights`) with Tropy-native
props (`tropy#collection`, `tropy#box`, `tropy#folder`) — i.e. **templates freely mix
vocabularies in one flat field list, and relabel a property for the local context** (`source`
→ "Archive") without changing its URI. `dc.ttp` is the minimal opposite: 15 fields, each just
`{ property, datatype }`, no labels/hints — a pure passthrough of the DC element set.

**How values are stored** (`src/models/metadata.js`): the `metadata` table is
`(id, property, value_id, language)` — keyed by *item id + property URI*. So a value is
**typed** (via a separate `value` table that records the datatype, `models/value.js`) and
**carries an optional language tag**, but the model is **one value per (item, property)** —
metadata is *not* repeatable in Tropy's core store (unlike raw RDF, and unlike Omeka below).
The template's job is purely which properties appear and how they're labelled/typed/hinted;
it does not constrain cardinality.

**How the vocabulary is loaded** (`src/ontology/vocabulary.js`, `ontology.js`): Tropy imports
`.n3`/`.ttl` vocabulary files into an RDF store, then extracts per-term `rdfs:label` and
`rdfs:comment` (localized by `args.locale`) and buckets terms into `classes`, `datatypes`,
`properties` (`vocabulary.js:82-84`). The property picker in the template editor is populated
from that `properties` bucket. **The vocabulary and the template are decoupled: the vocab
supplies the menu of pickable URIs + their default labels/comments; the template records the
chosen subset + overrides.** This is the exact separation Archie would want if it lets users
pick fields.

---

## 3. Omeka S resource templates + IIIF Presentation 3

### 3.1 Omeka S resource templates

Omeka S (the museum/library CMS) models the same idea with a richer per-property record.
(Source: <https://omeka.org/s/docs/user-manual/content/resource-template/>.)

- **A resource template is "a set of pre-defined properties, optionally with a Class."** An
  admin builds one by picking properties from *any installed vocabulary* (dcterms ships as the
  default, alongside Dublin Core Type, bibo, foaf). A new blank template **pre-loads exactly
  two properties: `dcterms:title` and `dcterms:description`** — that pair is Omeka's out-of-box
  default field set.
- **Per-property options** (the field record) go beyond Tropy's: an **alternate label** and
  **alternate comment** (local override of the vocab's label/comment), one or more **data
  types**, a **required** flag, a **private** (default-visibility) flag, and a **default
  language**. Two properties can additionally be flagged *"use for resource title"* / *"use for
  resource description"* to override which property feeds the title/description slots — i.e.
  the title/description surrogates are decoupled from any specific URI.
- **Data types**: three built in — a plain literal, an internal-resource link, and an external
  **URI** link (modules add more, e.g. Value Suggest for controlled vocabularies, numeric,
  geometry). This is how Omeka gets *pick-from-controlled-vocab* values, not just free text.
- **Values are repeatable**: an item may hold many values for one property; the template does
  not cap cardinality, and users may add properties beyond the template. The template *guides*,
  it does not *constrain* (only `required` is enforced).

### 3.2 IIIF Presentation 3 — `metadata` is deliberately non-semantic

(Source: <https://iiif.io/api/presentation/3.0/#metadata>, §3.1 Descriptive Properties.)

IIIF Presentation 3 is the *display* contract Archie's viewer/publish path already speaks, and
its stance on descriptive metadata is the opposite of Dublin Core's: **it carries no vocabulary
at all.**

- The `metadata` property is *"an ordered list of descriptions to be displayed to the user …
  given as pairs of human readable `label` and `value` entries. The content of these entries is
  intended for presentation only; descriptive semantics **should not** be inferred."* Both
  `label` and `value` are language maps (`{ "en": [ "…" ] }`), so every pair is a free-form,
  localizable, **display-only** key/value with no property URI.
- The spec is explicit at the top (§1.1): descriptive information *"is intended for humans to
  read, but not semantically available to machines … it explicitly does **not** aim to provide
  metadata that would allow a search engine to index digital objects."*
- The four *typed* descriptive slots that **do** have fixed meaning are `label` (title
  surrogate, required on Collection/Manifest), `summary` (short description), `requiredStatement`
  (a must-display `label`/`value` pair, e.g. attribution), and `rights` (a single license URI,
  recommended from creativecommons.org / rightsstatements.org).

**The load-bearing consequence:** at the publish boundary, any Dublin Core fields Archie
collects collapse into IIIF `metadata` label/value pairs — the property URIs do **not**
survive into the viewer contract. DC (or a subset of it) is worth adopting as an *authoring
convenience and interchange format*, not because the viewer needs the semantics.

---

## 4. Recommended default field set per level (recommendation, not a decision)

**Overlap flag first.** Archie already has four native descriptive fields, and they are
*exactly* the IIIF Presentation 3 typed descriptive slots: native **title** = `label`,
**summary** = `summary`, **rights** (license URI) = `rights`, **requiredStatement**
(attribution) = `requiredStatement`. These should stay native and **not** be re-offered as
pickable DC fields — doing so would create two title fields and two rights fields that
disagree at publish time. A DC layer in Archie should cover *only the descriptive ground the
native fields don't*: creator, date, subject, type, identifier, and relations.

Both prior-art defaults are narrow: **Omeka pre-loads just `dcterms:title` + `dcterms:description`;
Tropy's generic template is 10 fields** (title, creator, date, type, source, identifier, rights
+ 3 Tropy-native). The recommendation below stays close to Tropy's generic set, minus what
Archie already owns natively, and scales the set down as the level gets more granular.

| Level | Recommended default DC fields (beyond native title/summary/rights/attribution) | Rationale |
|---|---|---|
| **Library** | `dcterms:creator`, `dcterms:publisher`, `dcterms:date` (issued), `dcterms:identifier`, `dcterms:license` | Collection-level provenance and citation. Mirrors Omeka's item-set fields; `license`/attribution already native, so surface `creator`/`publisher` that aren't. |
| **Exhibit** | `dcterms:creator`, `dcterms:date`, `dcterms:subject`, `dcterms:description` | An exhibit is an authored work → who made it, when, what it's about. `description` only if Archie's native summary proves too short; else drop to avoid the Omeka double-description trap. |
| **Object** | `dcterms:creator`, `dcterms:date` (created), `dcterms:subject`, `dcterms:type`, `dcterms:identifier`, `dcterms:source` | This is Tropy's generic template exactly (its tool is *per-object* archival description). `source`/`identifier` capture the holding archive + call number, the fields every prior-art object template keeps. |

**Design carries from the prior art**, if Archie builds a pick-from-vocab UI later:

1. **Reference properties by URI, resolve labels from the vocab** (Tropy's decoupling,
   `vocabulary.js`) — don't hardcode display strings into the picker.
2. **Allow a per-field label override** (both tools: Tropy `field.label`, Omeka "alternate
   label") — `dc:source` relabeled "Archive" is the canonical example.
3. **Default field set = the 15-element display core, refinements on demand** — the long tail
   (10 date refinements, 15 relation refinements) should be reachable, not default-visible.
4. **Decide cardinality explicitly**: Tropy stores one value per (item, property); Omeka allows
   many. Archie's publish target (IIIF `metadata`) is an *ordered list of pairs*, so it can
   represent repeats — a repeatable model is the more faithful fit if the authoring UI can
   afford it.

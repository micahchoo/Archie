/* Archie Studio — pick-from-vocab metadata editor prototype (throwaway).
   Question under test: does default-set + add-field feel pleasant at real vocab scale
   (50 pickable dcterms properties), inside the DetailsEditor drawer?
   Entry model (fixed decision): { property?, label?, value } — property is dcterms:-prefixed
   on save; repeats = repeated entries; array order = display order. */

"use strict";

/* ───────────────────────── vocabulary ─────────────────────────
   All 55 dcterms properties, labels + one-line comments from
   docs/research/dublin-core-vocab.md (parsed from dcterms.n3).
   excluded: never offered — Archie owns these natively (title, description)
   or in the rights block (rights, license); abstract collides with description. */

const VOCAB = [
  { t: "abstract", l: "Abstract", c: "A summary of the resource.", excluded: true },
  { t: "accessRights", l: "Access Rights", c: "Who can access the resource, or its security status." },
  { t: "accrualMethod", l: "Accrual Method", c: "The method by which items are added to a collection." },
  { t: "accrualPeriodicity", l: "Accrual Periodicity", c: "The frequency with which items are added to a collection." },
  { t: "accrualPolicy", l: "Accrual Policy", c: "The policy governing the addition of items to a collection." },
  { t: "alternative", l: "Alternative Title", c: "An alternative name for the resource." },
  { t: "audience", l: "Audience", c: "A class of entity for whom the resource is intended or useful." },
  { t: "educationLevel", l: "Audience Education Level", c: "Audience defined by progression through an educational context." },
  { t: "bibliographicCitation", l: "Bibliographic Citation", c: "A bibliographic reference for the resource." },
  { t: "conformsTo", l: "Conforms To", c: "An established standard to which the described resource conforms." },
  { t: "contributor", l: "Contributor", c: "An entity responsible for making contributions to the resource." },
  { t: "coverage", l: "Coverage", c: "Spatial/temporal topic, applicability, or jurisdiction of the resource." },
  { t: "creator", l: "Creator", c: "An entity primarily responsible for making the resource." },
  { t: "date", l: "Date", c: "A point or period of time in the resource's lifecycle." },
  { t: "dateAccepted", l: "Date Accepted", c: "Date of acceptance of the resource." },
  { t: "available", l: "Date Available", c: "Date (often a range) the resource became or will become available." },
  { t: "dateCopyrighted", l: "Date Copyrighted", c: "Date of copyright." },
  { t: "created", l: "Date Created", c: "Date of creation of the resource." },
  { t: "issued", l: "Date Issued", c: "Date of formal issuance (e.g., publication) of the resource." },
  { t: "modified", l: "Date Modified", c: "Date on which the resource was changed." },
  { t: "dateSubmitted", l: "Date Submitted", c: "Date of submission of the resource." },
  { t: "valid", l: "Date Valid", c: "Date (often a range) of validity of a resource." },
  { t: "description", l: "Description", c: "An account of the resource.", excluded: true },
  { t: "extent", l: "Extent", c: "The size or duration of the resource." },
  { t: "format", l: "Format", c: "The file format, physical medium, or dimensions of the resource." },
  { t: "hasFormat", l: "Has Format", c: "A related resource substantially the same but in another format." },
  { t: "hasPart", l: "Has Part", c: "A related resource included physically or logically in this one." },
  { t: "hasVersion", l: "Has Version", c: "A related resource that is a version, edition, or adaptation of this one." },
  { t: "identifier", l: "Identifier", c: "An unambiguous reference to the resource within a given context." },
  { t: "instructionalMethod", l: "Instructional Method", c: "A process the resource is designed to support (knowledge, attitudes, skills)." },
  { t: "isFormatOf", l: "Is Format Of", c: "A related resource substantially the same as this one, in another format." },
  { t: "isPartOf", l: "Is Part Of", c: "A related resource in which this one is physically or logically included." },
  { t: "isReferencedBy", l: "Is Referenced By", c: "A related resource that references or cites this one." },
  { t: "isReplacedBy", l: "Is Replaced By", c: "A related resource that supplants or supersedes this one." },
  { t: "isRequiredBy", l: "Is Required By", c: "A related resource that requires this one to function." },
  { t: "isVersionOf", l: "Is Version Of", c: "A related resource of which this one is a version, edition, or adaptation." },
  { t: "language", l: "Language", c: "A language of the resource." },
  { t: "license", l: "License", c: "A legal document giving official permission to do something with the resource.", excluded: true },
  { t: "mediator", l: "Mediator", c: "An entity that mediates access to the resource for the intended audience." },
  { t: "medium", l: "Medium", c: "The material or physical carrier of the resource." },
  { t: "provenance", l: "Provenance", c: "A statement of changes in ownership and custody significant for authenticity or integrity." },
  { t: "publisher", l: "Publisher", c: "An entity responsible for making the resource available." },
  { t: "references", l: "References", c: "A related resource that this one references or cites." },
  { t: "relation", l: "Relation", c: "A related resource." },
  { t: "replaces", l: "Replaces", c: "A related resource that this one supplants or supersedes." },
  { t: "requires", l: "Requires", c: "A related resource that this one requires to function." },
  { t: "rights", l: "Rights", c: "Information about rights held in and over the resource.", excluded: true },
  { t: "rightsHolder", l: "Rights Holder", c: "A person or organization owning or managing rights over the resource." },
  { t: "source", l: "Source", c: "A related resource from which the described resource is derived." },
  { t: "spatial", l: "Spatial Coverage", c: "Spatial characteristics of the resource." },
  { t: "subject", l: "Subject", c: "The topic of the resource." },
  { t: "tableOfContents", l: "Table Of Contents", c: "A list of subunits of the resource." },
  { t: "temporal", l: "Temporal Coverage", c: "Temporal characteristics of the resource." },
  { t: "title", l: "Title", c: "A name given to the resource.", excluded: true },
  { t: "type", l: "Type", c: "The nature or genre of the resource." },
];
const byTerm = Object.fromEntries(VOCAB.map((v) => [v.t, v]));
const vocabLabel = (term) => byTerm[term]?.l ?? term;

/* ───────────────────────── per-level state ─────────────────────────
   Default rows (fixed decision): Library creator/publisher/date/identifier ·
   Exhibit creator/date/subject · Object creator/date/subject/type/identifier/source.
   Empty rows are UI scaffolding — they persist nothing (see persistedEntries). */

const LEVELS = {
  library: {
    kicker: "Library",
    name: "Voynich study library",
    showTitle: true,
    title: "Voynich study library",
    summary: "Working material for a close study of Beinecke MS 408 and its herbal quires.",
    credit: "Images courtesy of the Beinecke Rare Book & Manuscript Library.",
    stage: { plates: ["sm", "sm", "sm"], caption: "Library · 3 exhibits" },
    entries: [
      { property: "creator", value: "M. Alexander" },
      { property: "publisher", value: "" },
      { property: "date", value: "" },
      { property: "identifier", value: "" },
    ],
  },
  exhibit: {
    kicker: "Exhibit",
    name: "Herbal quires",
    showTitle: true,
    title: "Herbal quires",
    summary: "The botanical folios read as one sequence — what repeats, what never does.",
    credit: "Curated by M. Alexander.",
    stage: { plates: ["sm", "lg", "sm"], caption: "Exhibit · Herbal quires · 12 objects" },
    entries: [
      { property: "creator", value: "M. Alexander" },
      { property: "date", value: "2026" },
      { property: "subject", value: "" },
    ],
  },
  object: {
    kicker: "Object",
    name: "Folio 2r",
    showTitle: false, // the object's label is edited inline in the rail (DetailsEditor showTitle={false})
    title: "Folio 2r",
    summary: "Root-and-leaf plant drawing with two paragraphs of text in hand 1.",
    credit: "Beinecke Rare Book & Manuscript Library, Yale University.",
    stage: { plates: ["lg"], caption: "Object · Folio 2r" },
    entries: [
      { property: "creator", value: "Unknown scribe (hand 1)" },
      { property: "creator", value: "Unknown illuminator" },
      { property: "date", value: "ca. 1404–1438" },
      { property: "subject", value: "Botany — unidentified plant" },
      { property: "type", value: "" },
      { property: "identifier", value: "Beinecke MS 408, fol. 2r" },
      { property: "source", label: "Archive", value: "Beinecke Rare Book & Manuscript Library, Yale University" },
    ],
  },
};

let level = "object";
let editingLabelIndex = null; // row whose label is in edit mode

/* ───────────────────────── dom handles ───────────────────────── */

const $ = (id) => document.getElementById(id);
const metaRows = $("metaRows");
const picker = $("picker");
const pickerSearch = $("pickerSearch");
const pickerList = $("pickerList");
const pickerCustom = $("pickerCustom");
const addFieldBtn = $("addFieldBtn");

/* ───────────────────────── level chrome ───────────────────────── */

function renderLevel() {
  const L = LEVELS[level];
  $("drawerKicker").textContent = L.kicker;
  $("drawerName").textContent = L.name;
  $("titleField").hidden = !L.showTitle;
  $("titleAside").hidden = L.showTitle;
  $("titleInput").value = L.title;
  $("summaryInput").value = L.summary;
  $("creditInput").value = L.credit;
  document.querySelectorAll(".scope-noun").forEach((el) => (el.textContent = level));
  document.querySelectorAll(".level-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.level === level));

  // stage
  const plates = $("stagePlates");
  plates.innerHTML = "";
  L.stage.plates.forEach((size, i) => {
    const d = document.createElement("div");
    d.className = `plate ${size}`;
    d.textContent = size === "lg" ? L.name : "";
    plates.appendChild(d);
  });
  $("stageCaption").textContent = L.stage.caption;

  closePicker();
  editingLabelIndex = null;
  renderRows();
}

document.querySelectorAll(".level-btn").forEach((b) =>
  b.addEventListener("click", () => { level = b.dataset.level; renderLevel(); }));

$("titleInput").addEventListener("input", (e) => (LEVELS[level].title = e.target.value));
$("summaryInput").addEventListener("input", (e) => (LEVELS[level].summary = e.target.value));
$("creditInput").addEventListener("input", (e) => (LEVELS[level].credit = e.target.value));

/* ───────────────────────── metadata rows ───────────────────────── */

function entries() { return LEVELS[level].entries; }

function displayLabel(entry) {
  if (entry.label) return entry.label;
  if (entry.property) return vocabLabel(entry.property);
  return "Field";
}

function renderRows() {
  metaRows.innerHTML = "";
  const list = entries();
  list.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "mrow";
    const isRepeat = i > 0 && entry.property && list[i - 1].property === entry.property && !entry.label;
    if (isRepeat) row.classList.add("repeat");

    /* label cell */
    const labelCell = document.createElement("div");
    labelCell.className = "mrow-labelcell";
    if (editingLabelIndex === i) {
      const li = document.createElement("input");
      li.className = "mrow-label-input";
      li.value = displayLabel(entry);
      li.setAttribute("aria-label", "Display label");
      const commit = () => {
        const v = li.value.trim();
        if (!entry.property) entry.label = v || "Field";
        else if (v === "" || v.toLowerCase() === vocabLabel(entry.property).toLowerCase()) delete entry.label;
        else entry.label = v;
        editingLabelIndex = null;
        renderRows();
      };
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); editingLabelIndex = null; renderRows(); }
      });
      li.addEventListener("blur", commit);
      labelCell.appendChild(li);
      queueMicrotask(() => { li.focus(); li.select(); });
    } else {
      const lb = document.createElement("button");
      lb.type = "button";
      lb.className = "mrow-label";
      lb.textContent = displayLabel(entry);
      lb.title = entry.property
        ? `dcterms:${entry.property} — ${byTerm[entry.property]?.c ?? ""}\nClick to relabel for this ${level}.`
        : "A custom field (no vocabulary property). Click to rename.";
      lb.addEventListener("click", () => { editingLabelIndex = i; renderRows(); });
      labelCell.appendChild(lb);

      // the spine mark: only when the display label departs from the vocabulary's
      if (entry.property && entry.label) {
        const spine = document.createElement("span");
        spine.className = "mrow-spine";
        spine.innerHTML = `dcterms:${entry.property}`;
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "spine-reset";
        reset.textContent = "reset";
        reset.title = `Restore the vocabulary label “${vocabLabel(entry.property)}”`;
        reset.addEventListener("click", () => { delete entry.label; renderRows(); });
        spine.appendChild(reset);
        labelCell.appendChild(spine);
      }
    }
    row.appendChild(labelCell);

    /* value */
    const input = document.createElement("input");
    input.className = "mrow-value";
    input.type = "text";
    input.value = entry.value;
    input.placeholder = isRepeat ? "another…" : "";
    input.setAttribute("aria-label", displayLabel(entry));
    input.addEventListener("input", (e) => { entry.value = e.target.value; renderPersist(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const next = metaRows.querySelectorAll(".mrow-value")[i + 1];
        if (next) next.focus(); else addFieldBtn.focus();
      }
    });
    row.appendChild(input);

    /* quiet actions */
    const actions = document.createElement("div");
    actions.className = "mrow-actions";
    const mk = (txt, title, fn, disabled = false) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "rbtn"; b.textContent = txt; b.title = title;
      b.disabled = disabled;
      b.addEventListener("click", fn);
      return b;
    };
    actions.appendChild(mk("+", `Add another ${displayLabel(entry).toLowerCase()}`, () => {
      list.splice(i + 1, 0, { ...(entry.property ? { property: entry.property } : { label: displayLabel(entry) }), value: "" });
      renderRows();
      metaRows.querySelectorAll(".mrow-value")[i + 1]?.focus();
    }));
    actions.appendChild(mk("↑", "Move up (Alt+↑)", () => moveRow(i, -1), i === 0));
    actions.appendChild(mk("↓", "Move down (Alt+↓)", () => moveRow(i, 1), i === list.length - 1));
    const rm = mk("×", "Remove this field", () => { list.splice(i, 1); renderRows(); });
    rm.classList.add("rbtn-remove");
    actions.appendChild(rm);
    row.appendChild(actions);

    /* keyboard reorder from anywhere in the row */
    row.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        moveRow(i, e.key === "ArrowUp" ? -1 : 1, /*refocusValue*/ true);
      }
    });

    metaRows.appendChild(row);
  });

  $("metaCount").textContent = `${list.length} field${list.length === 1 ? "" : "s"}`;
  renderPersist();
}

function moveRow(i, delta, refocusValue = false) {
  const list = entries();
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  renderRows();
  const target = metaRows.querySelectorAll(".mrow-value")[j];
  if (refocusValue) target?.focus();
  else metaRows.querySelectorAll(".mrow")[j]?.querySelector(".rbtn")?.focus();
}

/* ───────────────────────── persist inspector ─────────────────────────
   Empty rows persist nothing; property is dcterms:-prefixed on save;
   label only when overridden; array order = display order. */

function persistedEntries() {
  return entries()
    .filter((e) => e.value.trim() !== "")
    .map((e) => ({
      ...(e.property ? { property: `dcterms:${e.property}` } : {}),
      ...(e.label ? { label: e.label } : {}),
      value: e.value.trim(),
    }));
}

function renderPersist() {
  const p = persistedEntries();
  $("persistCount").textContent = `· ${p.length} of ${entries().length} entries`;
  $("persistJson").textContent = JSON.stringify(p, null, 2);
}

/* ───────────────────────── add-a-field picker ───────────────────────── */

let pickerOpen = false;
let pickerItems = []; // filtered vocab entries currently shown
let activeIndex = 0;  // 0..pickerItems.length-1 = list; pickerItems.length = custom option

function remainingVocab() {
  const present = new Set(entries().map((e) => e.property).filter(Boolean));
  return VOCAB
    .filter((v) => !v.excluded && !present.has(v.t))
    .sort((a, b) => a.l.localeCompare(b.l));
}

function openPicker() {
  pickerOpen = true;
  picker.hidden = false;
  addFieldBtn.setAttribute("aria-expanded", "true");
  pickerSearch.value = "";
  activeIndex = 0;
  renderPickerList();
  pickerSearch.focus();
  picker.scrollIntoView({ block: "nearest" });
}

function closePicker(refocus = false) {
  if (!pickerOpen) return;
  pickerOpen = false;
  picker.hidden = true;
  addFieldBtn.setAttribute("aria-expanded", "false");
  if (refocus) addFieldBtn.focus();
}

function renderPickerList() {
  const q = pickerSearch.value.trim().toLowerCase();
  pickerItems = remainingVocab().filter((v) =>
    !q || v.l.toLowerCase().includes(q) || v.t.toLowerCase().includes(q) || v.c.toLowerCase().includes(q));
  if (activeIndex > pickerItems.length) activeIndex = pickerItems.length;

  pickerList.innerHTML = "";
  if (pickerItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "picker-empty";
    empty.textContent = q ? `Nothing in the vocabulary matches “${pickerSearch.value.trim()}”.` : "Every field is already in use.";
    pickerList.appendChild(empty);
  }
  pickerItems.forEach((v, i) => {
    const li = document.createElement("li");
    li.className = "picker-item" + (i === activeIndex ? " active" : "");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === activeIndex));
    li.innerHTML = `<span class="pi-label"></span><span class="pi-term"></span><span class="pi-comment"></span>`;
    li.querySelector(".pi-label").textContent = v.l;
    li.querySelector(".pi-term").textContent = `dcterms:${v.t}`;
    li.querySelector(".pi-comment").textContent = v.c;
    li.addEventListener("mousemove", () => { if (activeIndex !== i) { activeIndex = i; paintActive(); } });
    li.addEventListener("mousedown", (e) => e.preventDefault()); // keep search focus
    li.addEventListener("click", () => pickProperty(v.t));
    pickerList.appendChild(li);
  });
  pickerCustom.classList.toggle("active", activeIndex === pickerItems.length);
}

function paintActive() {
  [...pickerList.querySelectorAll(".picker-item")].forEach((el, i) => {
    el.classList.toggle("active", i === activeIndex);
    el.setAttribute("aria-selected", String(i === activeIndex));
    if (i === activeIndex) el.scrollIntoView({ block: "nearest" });
  });
  pickerCustom.classList.toggle("active", activeIndex === pickerItems.length);
}

function pickProperty(term) {
  entries().push({ property: term, value: "" });
  closePicker();
  renderRows();
  const inputs = metaRows.querySelectorAll(".mrow-value");
  inputs[inputs.length - 1]?.focus();
}

function pickCustom() {
  const q = pickerSearch.value.trim();
  entries().push({ label: q || "Field", value: "" });
  closePicker();
  editingLabelIndex = q ? null : entries().length - 1; // no label typed → drop straight into naming it
  renderRows();
  if (q) {
    const inputs = metaRows.querySelectorAll(".mrow-value");
    inputs[inputs.length - 1]?.focus();
  }
}

addFieldBtn.addEventListener("click", () => (pickerOpen ? closePicker(true) : openPicker()));
pickerCustom.addEventListener("click", pickCustom);
pickerSearch.addEventListener("input", () => { activeIndex = 0; renderPickerList(); });
pickerSearch.addEventListener("keydown", (e) => {
  const max = pickerItems.length; // index `max` = the custom option
  if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, max); paintActive(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); paintActive(); }
  else if (e.key === "Enter") {
    e.preventDefault();
    if (activeIndex < pickerItems.length) pickProperty(pickerItems[activeIndex].t);
    else pickCustom();
  }
  else if (e.key === "Escape") { e.preventDefault(); closePicker(true); }
});
document.addEventListener("mousedown", (e) => {
  if (pickerOpen && !picker.contains(e.target) && e.target !== addFieldBtn) closePicker();
});

/* ───────────────────────── go ───────────────────────── */

renderLevel();

// Metadata-panel prototype (Archie-0ba5). Throwaway — no build step, no framework.
// Seed data is Voynich-flavoured, matching apps/viewer/fixtures/voynich.ts folio labels/IIIF ids.

// ── Seed data ─────────────────────────────────────────────────────────────────
// The object default set (creator, date, subject, type, identifier, source) plus the
// stress cases the prototype exists to show:
//   • repeated property → Creator has TWO values (decision: ONE row, stacked values)
//   • very long value   → Provenance, ~350 chars (decision: 3-line clamp + Show more)
//   • relabeled field   → "Archive" over the default "Source" label
//   • verbatim import   → "Shelfmark: MS 408" (renders as an ordinary row — deliberate)
const PROVENANCE =
  "Possibly commissioned at the court of Rudolf II of Bohemia, who is said to have paid 600 gold " +
  "ducats for it; passed to his botanist Jacobus Horčický de Tepenecz (signature erased on f1r), " +
  "then to Georg Baresch of Prague, sent to Athanasius Kircher in Rome by 1666, and acquired by " +
  "Wilfrid Voynich from the Jesuit library at Villa Mondragone, Frascati, in 1912.";

function objectMeta(folio) {
  return [
    { label: "Creator", values: ["Unknown scribe (Currier hand A)", "Unknown illustrator"] },
    { label: "Date", values: ["ca. 1404–1438 (radiocarbon, 95% conf.)"] },
    { label: "Subject", values: ["Herbal — unidentified botanicals"] },
    { label: "Type", values: ["Illuminated manuscript folio"] },
    { label: "Identifier", values: [`Beinecke MS 408, ${folio}`] },
    { label: "Archive", values: ["Beinecke Rare Book & Manuscript Library, Yale University"] }, // relabel of "Source"
    { label: "Shelfmark", values: ["MS 408"] }, // verbatim imported pair
    { label: "Provenance", values: [PROVENANCE], long: true },
  ];
}

const EXHIBIT_META = [
  { label: "Curator", value: "M. Alexander" },
  { label: "Published", value: "July 2026" },
  { label: "Collection", value: "Beinecke MS 408 digital surrogates (IIIF)" },
];

const iiif = (id) => `https://collections.library.yale.edu/iiif/2/${id}/full/!640,640/0/default.jpg`;
const OBJECTS = [
  { folio: "f1r", label: "f1r — Herbal (opening page)", img: iiif("1006076") },
  { folio: "f18v", label: "f18v — Herbal (the sonified folio)", img: iiif("1006109") },
  { folio: "f25v", label: "f25v — Herbal", img: iiif("1006123") },
  { folio: "f67r", label: "f67r — Astronomical (foldout)", img: iiif("1006194") },
];

// ── Metadata slip renderer (shared by both variants) ─────────────────────────
function renderMetaList(dl, meta) {
  dl.textContent = "";
  for (const row of meta) {
    const div = document.createElement("div");
    div.className = "meta-row";
    const dt = document.createElement("dt");
    dt.textContent = row.label;
    div.appendChild(dt);
    row.values.forEach((v) => {
      const dd = document.createElement("dd");
      if (row.long) {
        const span = document.createElement("span");
        span.className = "v-long";
        span.textContent = v;
        const more = document.createElement("button");
        more.type = "button";
        more.className = "more-link";
        more.textContent = "Show more";
        more.addEventListener("click", () => {
          const open = span.classList.toggle("expanded");
          more.textContent = open ? "Show less" : "Show more";
        });
        dd.appendChild(span);
        dd.appendChild(more);
      } else {
        dd.textContent = v;
      }
      div.appendChild(dd);
    });
    dl.appendChild(div);
  }
}

// ── Variant switch (prototype chrome) ────────────────────────────────────────
const variants = { a: document.getElementById("variant-a"), b: document.getElementById("variant-b") };
document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    const pick = btn.dataset.variant;
    for (const [k, el] of Object.entries(variants)) el.hidden = k !== pick;
    window.scrollTo(0, 0);
  });
});

// ── Variant A: collapsible slip on the object pane ───────────────────────────
const metaA = document.querySelector('[data-meta="f25v"]');
const rowsA = objectMeta("f. 25v");
renderMetaList(metaA, rowsA);
document.querySelector("[data-meta-count]").textContent = `· ${rowsA.length}`;

const toggleA = document.querySelector(".meta-toggle");
toggleA.addEventListener("click", () => {
  const open = toggleA.getAttribute("aria-expanded") !== "true";
  toggleA.setAttribute("aria-expanded", String(open));
  metaA.hidden = !open;
});

// ── Credit ⓘ panels (Credit.svelte idiom): toggle + click-outside dismiss ────
document.querySelectorAll("[data-credit]").forEach((root) => {
  const info = root.querySelector(".credit-info");
  let panel = null;
  const close = () => { panel?.remove(); panel = null; info.setAttribute("aria-expanded", "false"); };
  info.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel) return close();
    panel = document.createElement("div");
    panel.className = "credit-panel";
    panel.innerHTML =
      '<p><span class="k">Attribution</span><span class="v">' + root.querySelector(".credit-line").textContent + "</span></p>" +
      '<p><span class="k">License</span><span class="v"><a href="https://creativecommons.org/publicdomain/mark/1.0/" target="_blank" rel="noopener noreferrer">Public Domain</a></span></p>';
    root.appendChild(panel);
    info.setAttribute("aria-expanded", "true");
  });
  document.addEventListener("click", (e) => { if (panel && !root.contains(e.target)) close(); });
});

// ── Variant B: exhibit-level metadata up top ─────────────────────────────────
const exMeta = document.querySelector("[data-ex-meta]");
for (const { label, value } of EXHIBIT_META) {
  const pair = document.createElement("div");
  pair.className = "pair";
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  pair.appendChild(dt);
  pair.appendChild(dd);
  exMeta.appendChild(pair);
}

// ── Variant B: card grid + on-demand object sheet ────────────────────────────
const grid = document.querySelector("[data-grid]");
for (const obj of OBJECTS) {
  const li = document.createElement("li");
  li.className = "card";
  const body = document.createElement("button");
  body.className = "card-body";
  body.innerHTML = `<img src="${obj.img}" alt="" loading="lazy" /><span class="card-label">${obj.label}</span>`;
  const details = document.createElement("button");
  details.className = "card-details";
  details.textContent = "Details";
  details.addEventListener("click", () => openSheet(obj));
  li.appendChild(body);
  li.appendChild(details);
  grid.appendChild(li);
}

const scrim = document.querySelector("[data-sheet]");
const sheetTitle = document.querySelector("[data-sheet-title]");
const sheetMeta = document.querySelector("[data-sheet-meta]");
function openSheet(obj) {
  sheetTitle.textContent = obj.label;
  renderMetaList(sheetMeta, objectMeta(`f. ${obj.folio.slice(1)}`));
  scrim.hidden = false;
}
const closeSheet = () => { scrim.hidden = true; };
scrim.querySelector(".sheet-close").addEventListener("click", closeSheet);
scrim.addEventListener("click", (e) => { if (e.target === scrim) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !scrim.hidden) closeSheet(); });

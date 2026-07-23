// Archie Studio — editor chrome prototype. Throwaway, hardcoded sample data, no build step.
// Embodies decided contracts: Archie-5e96 (two-zone sidebar, rail = one nav scheme),
// Archie-a9fc (canvas stays primary, chrome trimmed), Archie-da38 (beats are deep links),
// Archie-0b7b (one safety-state indicator).

const READINGS = [
  { id: "general", name: "General notes", colour: "var(--reading-general)" },
  { id: "botanical", name: "Botanical hand", colour: "var(--reading-botanical)" },
  { id: "marginal", name: "Marginal hand", colour: "var(--reading-marginal)" },
];

const OBJECTS = [
  {
    id: "o1", code: "1r", label: "Folio 1r", kind: "image",
    plateTitle: "Folio 1r — Title page",
    detail: { Title: "Herbal, opening leaf", Date: "c. 1450–1480", Material: "Vellum", Hand: "Primary scribe" },
    notes: [
      { id: "n1a", excerpt: "Title cartouche — later addition in different ink", reading: "marginal", tags: ["ink", "later-hand"] },
      { id: "n1b", excerpt: "Rubricated initial, gold leaf ground", reading: "general", tags: ["decoration"] },
    ],
    toPlace: [],
  },
  {
    id: "o2", code: "2r", label: "Folio 2r", kind: "image",
    plateTitle: "Folio 2r — Betony",
    detail: { Title: "Betony (Betonica officinalis)", Date: "c. 1450–1480", Material: "Vellum", Provenance: "Southern German" },
    notes: [
      { id: "n2a", excerpt: "Root system rendered with unusual anatomical care", reading: "botanical", tags: ["botanical", "root"] },
      { id: "n2b", excerpt: "Marginal gloss corrects the plant's Latin name", reading: "marginal", tags: ["gloss", "correction"] },
      { id: "n2c", excerpt: "Pigment loss along the fold, leaf edge abraded", reading: "general", tags: ["condition"] },
      { id: "n2d", excerpt: "Second hand's interlinear note on dosage", reading: "marginal", tags: ["interlinear", "dosage"] },
    ],
    toPlace: [
      { id: "t2a", excerpt: "Stray tick mark near stem — unclear referent", tags: ["unresolved"] },
    ],
  },
  {
    id: "o3", code: "2v", label: "Folio 2v", kind: "image",
    plateTitle: "Folio 2v — Betony, verso",
    detail: { Title: "Betony, continued", Date: "c. 1450–1480", Material: "Vellum" },
    notes: [
      { id: "n3a", excerpt: "Recipe continues from recto, ink shows through", reading: "general", tags: ["recipe"] },
      { id: "n3b", excerpt: "Scribal catchword at foot of page", reading: "general", tags: ["catchword"] },
    ],
    toPlace: [],
  },
  {
    id: "o4", code: "5r", label: "Folio 5r", kind: "image",
    plateTitle: "Folio 5r — Mandrake",
    detail: { Title: "Mandrake (Mandragora)", Date: "c. 1450–1480", Material: "Vellum", Note: "Anthropomorphic root figure" },
    notes: [
      { id: "n4a", excerpt: "Root drawn as a bearded figure, common trope", reading: "botanical", tags: ["botanical", "iconography"] },
      { id: "n4b", excerpt: "Faded caption beneath the figure's feet", reading: "marginal", tags: ["caption", "faded"] },
      { id: "n4c", excerpt: "Compare treatment to folio 2r's root study", reading: "botanical", tags: ["cross-ref"] },
    ],
    toPlace: [
      { id: "t4a", excerpt: "Pinprick pattern along leaf margin — pounce transfer?", tags: ["unresolved", "technique"] },
    ],
  },
  {
    id: "o5", code: "7v", label: "Folio 7v", kind: "image",
    plateTitle: "Folio 7v — Marginalia gathering",
    detail: { Title: "Gathering endleaf", Date: "16th c. addition", Material: "Vellum", Note: "Owner annotations" },
    notes: [
      { id: "n5a", excerpt: "Later owner's ex libris, partially trimmed", reading: "marginal", tags: ["provenance"] },
    ],
    toPlace: [],
  },
  {
    id: "o6", code: "8r", label: "Folio 8r", kind: "audio",
    plateTitle: "Folio 8r — marginal chant (recording)",
    detail: { Title: "Marginal chant, modern reading", Date: "recording 2024", Format: "Audio, 47s", Note: "Read against the neumes in the margin" },
    notes: [
      { id: "n6a", excerpt: "Neume cluster at 0:12 — melisma on 'herba'", reading: "botanical", tags: ["neume", "audio"] },
      { id: "n6b", excerpt: "Reader pauses at damaged parchment, 0:31", reading: "general", tags: ["condition", "audio"] },
    ],
    toPlace: [],
  },
];

const BEATS = [
  { id: "b1", title: "Opening — the herbal's title page sets the register", objectId: "o1" },
  { id: "b2", title: "Betony in hand — the scribe's corrections", objectId: "o2" },
  { id: "b3", title: "The chant in the margin — orality bleeding into the written page", objectId: "o6" },
];

// Fixed marker positions per object (percent offsets), keyed by note id.
const MARKER_POS = {
  n1a: { x: 46, y: 18 }, n1b: { x: 22, y: 30 },
  n2a: { x: 38, y: 62 }, n2b: { x: 66, y: 24 }, n2c: { x: 82, y: 70 }, n2d: { x: 58, y: 46 },
  n3a: { x: 40, y: 55 }, n3b: { x: 50, y: 88 },
  n4a: { x: 44, y: 50 }, n4b: { x: 44, y: 78 }, n4c: { x: 68, y: 34 },
  n5a: { x: 30, y: 20 },
  n6a: { x: 20, y: 50 }, n6b: { x: 65, y: 50 },
};

const state = {
  activeIndex: 1, // Folio 2r, per header contract
  railCollapsed: false,
  variant: "a",
  selectedNoteId: null,
  activeReading: "general",
};

const $ = (id) => document.getElementById(id);
const readingById = (id) => READINGS.find((r) => r.id === id) || READINGS[0];

function currentObject() {
  return OBJECTS[state.activeIndex];
}
function findNote(noteId) {
  for (const obj of OBJECTS) {
    const n = obj.notes.find((n) => n.id === noteId) || obj.toPlace.find((n) => n.id === noteId);
    if (n) return { note: n, object: obj, placed: !!obj.notes.find((x) => x.id === noteId) };
  }
  return null;
}

function setActiveObject(index, opts = {}) {
  state.activeIndex = ((index % OBJECTS.length) + OBJECTS.length) % OBJECTS.length;
  state.selectedNoteId = null;
  render();
  if (opts.announce) {
    setStatus(`Switched to ${currentObject().label}`);
  }
}

function setStatus(text, kind = "info") {
  const strip = $("statusStrip");
  strip.dataset.empty = "false";
  $("statusText").textContent = text;
  clearTimeout(setStatus._t);
  setStatus._t = setTimeout(() => {
    strip.dataset.empty = "true";
    $("statusText").textContent = `Draw mode — filing into ${readingById(state.activeReading).name}`;
  }, 2600);
}

// ── rendering ──────────────────────────────────────────────────────────

function renderHeader() {
  $("crumbObject").textContent = currentObject().label;
}

function renderRail() {
  const track = $("railTrack");
  track.innerHTML = "";
  OBJECTS.forEach((obj, i) => {
    const btn = document.createElement("button");
    btn.className = "rail-thumb" + (i === state.activeIndex ? " active" : "");
    btn.title = obj.label;
    btn.innerHTML = obj.kind === "audio" ? `<span class="av-icon">♪</span>` : obj.code;
    btn.addEventListener("click", () => setActiveObject(i, { announce: true }));
    track.appendChild(btn);
  });
  $("railCounter").textContent = `${state.activeIndex + 1} / ${OBJECTS.length}`;
}

function renderBeats() {
  const list = $("beats");
  list.innerHTML = "";
  BEATS.forEach((beat, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    const isCurrent = OBJECTS[state.activeIndex].id === beat.objectId;
    btn.className = "beat" + (isCurrent ? " current" : "");
    btn.dataset.beatId = beat.id;
    const targetObj = OBJECTS.find((o) => o.id === beat.objectId);
    btn.innerHTML = `<span class="beat-num">${i + 1}</span><span class="beat-title">${beat.title}</span><span class="beat-target">→ ${targetObj.label}</span>`;
    btn.addEventListener("click", () => {
      const idx = OBJECTS.findIndex((o) => o.id === beat.objectId);
      setActiveObject(idx);
      setStatus(`Beat opened — Narrative scrolled to “${beat.title.slice(0, 28)}…”, editor jumped to ${targetObj.label}`);
      requestAnimationFrame(() => {
        const el = list.querySelector(`[data-beat-id="${beat.id}"]`);
        el && el.classList.add("flash");
        setTimeout(() => el && el.classList.remove("flash"), 900);
      });
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function renderReadingsRows(container) {
  container.innerHTML = "";
  READINGS.forEach((r) => {
    const obj = currentObject();
    const count = obj.notes.filter((n) => n.reading === r.id).length;
    const row = document.createElement("div");
    row.className = "reading-row" + (state.activeReading === r.id ? " active-reading" : "");
    row.innerHTML = `
      <span class="reading-dot" style="background:${r.colour}"></span>
      <span class="reading-name">${r.name}</span>
      <span class="reading-count">${count}</span>
      <span class="reading-pen ${state.activeReading === r.id ? "is-active" : ""}" title="File new notes into ${r.name}">✎</span>
    `;
    row.querySelector(".reading-pen").addEventListener("click", () => {
      state.activeReading = r.id;
      setStatus(`Now filing new notes into ${r.name}`);
      render();
    });
    container.appendChild(row);
  });
}

function renderReadingsChip() {
  const dots = $("chipDots");
  dots.innerHTML = READINGS.map((r) => `<span style="background:${r.colour}"></span>`).join("");
}

function renderObjectZone() {
  const obj = currentObject();
  $("objectLabel").textContent = obj.label;

  renderReadingsRows($("readingsRowsA"));
  renderReadingsRows($("readingsRowsB"));
  renderReadingsChip();

  $("notesCount").textContent = obj.notes.length;
  const notesList = $("notesList");
  notesList.innerHTML = "";
  obj.notes.forEach((n) => {
    const li = document.createElement("li");
    const row = document.createElement("button");
    row.className = "item-row" + (state.selectedNoteId === n.id ? " selected" : "");
    const r = readingById(n.reading);
    row.innerHTML = `<span class="item-swatch" style="background:${r.colour}"></span><span class="item-excerpt">${n.excerpt}</span><span class="item-tag">${n.tags[0] || ""}</span>`;
    row.addEventListener("click", () => selectNote(n.id));
    li.appendChild(row);
    notesList.appendChild(li);
  });

  $("toPlaceCount").textContent = obj.toPlace.length;
  const toPlaceList = $("toPlaceList");
  toPlaceList.innerHTML = "";
  $("toPlaceHint").textContent = obj.toPlace.length
    ? "Authored but not yet located on the image."
    : "";
  obj.toPlace.forEach((n) => {
    const li = document.createElement("li");
    const row = document.createElement("button");
    row.className = "item-row" + (state.selectedNoteId === n.id ? " selected" : "");
    row.innerHTML = `<span class="item-swatch" style="background:var(--ink-muted)"></span><span class="item-excerpt">${n.excerpt}</span><span class="item-tag">${n.tags[0] || ""}</span>`;
    row.addEventListener("click", () => selectNote(n.id));
    li.appendChild(row);
    toPlaceList.appendChild(li);
  });

  const dl = $("detailFields");
  dl.innerHTML = "";
  Object.entries(obj.detail).forEach(([k, v]) => {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    dl.appendChild(dt); dl.appendChild(dd);
  });
}

function renderCanvas() {
  const obj = currentObject();
  const plate = $("plate");
  plate.className = "plate" + (obj.kind === "audio" ? " is-av" : "");
  $("plateLabel").innerHTML = obj.kind === "audio"
    ? `${obj.plateTitle}<div class="waveform">${waveformBars()}</div>`
    : obj.plateTitle;

  const markers = $("markers");
  markers.innerHTML = "";
  obj.notes.forEach((n) => {
    const pos = MARKER_POS[n.id] || { x: 50, y: 50 };
    const el = document.createElement("div");
    el.className = "marker" + (state.selectedNoteId === n.id ? " selected" : "");
    el.dataset.reading = n.reading;
    el.style.left = pos.x + "%";
    el.style.top = pos.y + "%";
    el.textContent = obj.notes.indexOf(n) + 1;
    el.title = n.excerpt;
    el.addEventListener("click", () => selectNote(n.id));
    markers.appendChild(el);
  });
}

function waveformBars() {
  let bars = "";
  for (let i = 0; i < 40; i++) {
    const h = 10 + Math.round(Math.abs(Math.sin(i * 1.3)) * 60);
    bars += `<span style="height:${h}px"></span>`;
  }
  return bars;
}

function selectNote(noteId) {
  state.selectedNoteId = noteId;
  render();
}

function renderDock() {
  const empty = $("dockEmpty");
  const form = $("dockForm");
  if (!state.selectedNoteId) {
    empty.hidden = false;
    form.hidden = true;
    return;
  }
  const found = findNote(state.selectedNoteId);
  if (!found) { empty.hidden = false; form.hidden = true; return; }
  empty.hidden = true;
  form.hidden = false;

  $("unplacedBadge").hidden = found.placed;
  $("dockComment").value = found.note.excerpt;
  $("dockTags").value = found.note.tags.join(", ");

  const sel = $("dockReading");
  sel.innerHTML = READINGS.map((r) => `<option value="${r.id}">${r.name}</option>`).join("");
  sel.value = found.note.reading || "general";

  $("dockEmphasis").value = found.note.emphasis || "normal";
}

function render() {
  renderHeader();
  renderRail();
  renderBeats();
  renderObjectZone();
  renderCanvas();
  renderDock();
}

// ── interactions ──────────────────────────────────────────────────────

$("railCollapse").addEventListener("click", () => {
  state.railCollapsed = !state.railCollapsed;
  $("filmstrip").classList.toggle("collapsed", state.railCollapsed);
});

document.querySelectorAll(".variant-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.variant = btn.dataset.variant;
    document.querySelectorAll(".variant-btn").forEach((b) => b.classList.toggle("active", b === btn));
    $("app").dataset.variant = state.variant;
    $("readingsPopover").hidden = true;
    $("readingsChip").setAttribute("aria-expanded", "false");
  });
});

$("readingsChip").addEventListener("click", () => {
  const pop = $("readingsPopover");
  pop.hidden = !pop.hidden;
  $("readingsChip").setAttribute("aria-expanded", String(!pop.hidden));
});
document.addEventListener("click", (e) => {
  const wrap = $("readingsChipWrap");
  if (!wrap.contains(e.target)) {
    $("readingsPopover").hidden = true;
    $("readingsChip").setAttribute("aria-expanded", "false");
  }
});

$("dockSave").addEventListener("click", () => {
  if (!state.selectedNoteId) return;
  const found = findNote(state.selectedNoteId);
  if (!found) return;
  found.note.excerpt = $("dockComment").value || found.note.excerpt;
  found.note.tags = $("dockTags").value.split(",").map((t) => t.trim()).filter(Boolean);
  found.note.reading = $("dockReading").value;
  found.note.emphasis = $("dockEmphasis").value;
  setStatus("Note saved");
  render();
});
$("dockDelete").addEventListener("click", () => {
  if (!state.selectedNoteId) return;
  const obj = currentObject();
  obj.notes = obj.notes.filter((n) => n.id !== state.selectedNoteId);
  obj.toPlace = obj.toPlace.filter((n) => n.id !== state.selectedNoteId);
  state.selectedNoteId = null;
  setStatus("Note deleted");
  render();
});

$("backBtn").addEventListener("click", () => setStatus("Would return to the library (prototype has no library screen)"));
$("publishBtn").addEventListener("click", () => setStatus("Would open the publish flow (out of scope for this prototype)"));
$("helpBtn").addEventListener("click", () => setStatus("Would open help (out of scope for this prototype)"));

document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
  if (e.key === "]") setActiveObject(state.activeIndex + 1, { announce: true });
  if (e.key === "[") setActiveObject(state.activeIndex - 1, { announce: true });
});

// initial status strip state
$("statusStrip").dataset.empty = "false";

render();

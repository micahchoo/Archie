// Archie Studio — new-exhibit create/import surface prototype (Archie-8482, throwaway).
// No build step, no framework. Renders the SAME chooser/path markup into either a scrimmed
// dialog (variant A) or the grid tile itself (variant B) — see renderSurface().
//
// Folder-summary logic (EXT_MIME / inferredMime / isImportableMedia / isHiddenPath /
// folderNameFrom) is a small duplicate of apps/studio/src/folder-import.ts's real rules, kept in
// sync by eye — this prototype needs the SAME "what counts as importable media" answer real
// drag-and-drop gives, so a folder dropped here shows the count the real app would actually import.

// ── mirrors folder-import.ts ──────────────────────────────────────────────────────────────────
const EXT_MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp", svg: "image/svg+xml",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4", ogv: "video/ogg",
};
function inferredMime(f) { return f.type || EXT_MIME[(f.name.split(".").pop() || "").toLowerCase()] || ""; }
function isImportableMedia(f) { return /^(image|audio|video)\//.test(inferredMime(f)); }
function isHiddenPath(relativePath) {
  return relativePath.split("/").some((seg) => seg.startsWith(".") || seg === "__MACOSX" || /^(thumbs\.db|desktop\.ini)$/i.test(seg));
}
function folderNameFrom(files) {
  const first = (files[0] && files[0].relativePath) || "";
  const root = first.includes("/") ? first.split("/")[0] : first.replace(/\.[^.]+$/, "");
  return root.trim() || "Untitled exhibit";
}
function summarizeFolder(files) {
  const media = files.filter((f) => !isHiddenPath(f.relativePath) && isImportableMedia(f));
  const counts = { images: 0, audio: 0, video: 0 };
  for (const f of media) {
    const m = inferredMime(f);
    if (m.startsWith("image/")) counts.images++;
    else if (m.startsWith("audio/")) counts.audio++;
    else if (m.startsWith("video/")) counts.video++;
  }
  return { name: folderNameFrom(files), total: media.length, ...counts };
}

// ── mock IIIF manifests (canned so the demo is deterministic, not dependent on live network) ───
const VALID_URL = "https://collections.library.yale.edu/iiif/2/beinecke:1006032/manifest";
const COLLECTION_URL = "https://example.org/iiif/collections/herbals";
const UNREACHABLE_URL = "https://archive.no-such-host.invalid/manifest.json";

function mockValidate(url) {
  const u = url.trim();
  if (u === VALID_URL || /voynich|yale/i.test(u)) {
    return { status: "valid", preview: { label: "Voynich MS", canvases: 209 } };
  }
  if (u === UNREACHABLE_URL || /no-such-host|\.invalid\b/i.test(u)) {
    return { status: "invalid", message: "Couldn't reach that link — check the URL and try again." };
  }
  if (u === COLLECTION_URL || /collections?\//i.test(u) && /herbal/i.test(u)) {
    return { status: "invalid", message: "This is a IIIF Collection (a list of manifests). Paste the URL of a single manifest instead." };
  }
  return { status: "invalid", message: "That URL didn't return a IIIF manifest." };
}

// ── state ─────────────────────────────────────────────────────────────────────────────────────
const state = {
  variant: "a",
  open: false,
  path: null,       // null (chooser shown) | "empty" | "folder" | "iiif"
  title: "",
  folder: null,      // { name, total, images, audio, video } | null
  iiifUrl: "",
  iiifStatus: "idle", // idle | fetching | valid | invalid
  iiifMessage: "",
  iiifPreview: null,  // { label, canvases }
};
let iiifToken = 0;

// ── surface open/close ───────────────────────────────────────────────────────────────────────
function openSurface() {
  state.open = true;
  state.path = null;
  render();
  requestAnimationFrame(() => {
    const first = document.querySelector(".path-card, .field input");
    if (first) first.focus();
  });
}
function closeSurface() {
  state.open = false;
  state.path = null;
  render();
}
function backToChooser() { state.path = null; render(); }
function selectPath(p) {
  state.path = p;
  render();
  requestAnimationFrame(() => {
    const first = document.querySelector("#surfaceBody .field input, #surfaceBody .dropzone button");
    if (first) first.focus();
  });
}

function createExhibit(titleOverride) {
  const title = (titleOverride ?? state.title).trim();
  if (!title) return;
  showToast(`Created “${title}”.`);
  Object.assign(state, { path: null, title: "", folder: null, iiifUrl: "", iiifStatus: "idle", iiifMessage: "", iiifPreview: null, open: false });
  render();
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 2400);
}

// ── IIIF field ────────────────────────────────────────────────────────────────────────────────
function setIiifUrl(v, opts) {
  opts = opts || {};
  state.iiifUrl = v;
  const trimmed = v.trim();
  if (!trimmed) {
    state.iiifStatus = "idle"; state.iiifMessage = ""; state.iiifPreview = null;
    render();
    return;
  }
  let parsed = true;
  try { new URL(trimmed); } catch { parsed = false; }
  if (!parsed) {
    state.iiifStatus = "invalid"; state.iiifMessage = "That doesn't look like a link yet."; state.iiifPreview = null;
    render();
    return;
  }
  state.iiifStatus = "fetching"; state.iiifMessage = ""; state.iiifPreview = null;
  render();
  const myToken = ++iiifToken;
  const delay = opts.instant ? 250 : 550 + Math.round(Math.random() * 300);
  setTimeout(() => {
    if (myToken !== iiifToken) return; // a newer keystroke superseded this check
    const result = mockValidate(trimmed);
    state.iiifStatus = result.status;
    if (result.status === "valid") {
      state.iiifPreview = result.preview;
      state.iiifMessage = "";
      if (!state.title.trim()) state.title = result.preview.label;
    } else {
      state.iiifPreview = null;
      state.iiifMessage = result.message;
    }
    render();
  }, delay);
}

// ── folder field ──────────────────────────────────────────────────────────────────────────────
function applyFolderFiles(files) {
  const summary = summarizeFolder(files);
  state.folder = summary;
  if (!state.title.trim()) state.title = summary.name;
  render();
}

async function readDroppedEntries(items) {
  const out = [];
  const entries = [];
  for (const it of items) {
    const entry = it.webkitGetAsEntry && it.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }
  async function walk(entry, prefix) {
    if (entry.isFile) {
      await new Promise((resolve) => entry.file((file) => { out.push({ name: file.name, relativePath: prefix + file.name, type: file.type }); resolve(); }));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => new Promise((resolve) => reader.readEntries(resolve));
      let batch;
      while ((batch = await readBatch()) && batch.length) {
        for (const child of batch) await walk(child, prefix + entry.name + "/");
      }
    }
  }
  for (const e of entries) await walk(e, "");
  return out;
}

// ── render ────────────────────────────────────────────────────────────────────────────────────
function pathCardsHtml() {
  return `
    <div class="path-cards">
      <button type="button" class="path-card" data-path="empty">
        <span class="glyph">＋</span>
        <span class="p-title">Start empty</span>
        <span class="p-desc">Begin with a blank exhibit and add media as you go.</span>
      </button>
      <button type="button" class="path-card" data-path="folder">
        <span class="glyph">⌸</span>
        <span class="p-title">From a media folder</span>
        <span class="p-desc">Point at a folder of images, audio, or video — each file becomes an object, in folder order.</span>
      </button>
      <button type="button" class="path-card" data-path="iiif">
        <span class="glyph">⇲</span>
        <span class="p-title">From a IIIF link</span>
        <span class="p-desc">Paste a IIIF link (from a library or museum site) and Archie fetches its pages for you.</span>
      </button>
    </div>`;
}

function pathEmptyHtml() {
  const disabled = state.title.trim() === "" ? "disabled" : "";
  return `
    <button type="button" class="back-link" data-action="back">‹ Back</button>
    <div class="field">
      <label class="f-label" for="titleEmpty">Exhibit title</label>
      <input id="titleEmpty" type="text" placeholder="e.g. Herbal quires" value="${escapeAttr(state.title)}" autocomplete="off">
    </div>
    <div class="path-actions">
      <button type="button" class="btn btn-ghost" data-action="close">Cancel</button>
      <button type="button" class="btn btn-primary" data-action="create" ${disabled}>Create exhibit</button>
    </div>`;
}

function pathFolderHtml() {
  const f = state.folder;
  const disabled = !f || f.total === 0 || state.title.trim() === "" ? "disabled" : "";
  return `
    <button type="button" class="back-link" data-action="back">‹ Back</button>
    ${f ? `
      <div class="folder-summary">
        <span class="fs-icon">⌸</span>
        <span>
          <div class="fs-name">${escapeHtml(f.name)}</div>
          <div class="fs-counts">${f.images} image${f.images === 1 ? "" : "s"} · ${f.audio} audio · ${f.video} video</div>
        </span>
        <button type="button" class="fs-change" data-action="folder-pick">Change folder…</button>
      </div>
      ${f.total === 0 ? `<p class="empty-folder-note">No images, audio, or video found in that folder.</p>` : ""}
      <div class="field">
        <label class="f-label" for="titleFolder">Exhibit title</label>
        <input id="titleFolder" type="text" value="${escapeAttr(state.title)}" autocomplete="off">
        <span class="f-hint">We used the folder's name — change it if you like.</span>
      </div>
    ` : `
      <div class="dropzone" id="dropzone">
        <span class="dz-title">Drag a folder here</span>
        <span class="dz-or">or</span>
        <button type="button" class="btn btn-ghost" data-action="folder-pick">Choose a folder</button>
        <span class="dz-hint">Archie sorts images, audio, and video into reading order automatically.</span>
      </div>
    `}
    <input type="file" id="folderInput" webkitdirectory style="display:none">
    <div class="path-actions">
      <button type="button" class="btn btn-ghost" data-action="close">Cancel</button>
      <button type="button" class="btn btn-primary" data-action="create" ${disabled}>Create exhibit</button>
    </div>`;
}

function pathIiifHtml() {
  const st = state.iiifStatus;
  const fieldClass = st === "valid" ? "has-success" : st === "invalid" ? "has-error" : "";
  const disabled = st !== "valid" || state.title.trim() === "" ? "disabled" : "";
  let statusHtml = "";
  if (st === "fetching") statusHtml = `<div class="iiif-status fetching"><span class="spinner"></span> Checking that link…</div>`;
  else if (st === "valid" && state.iiifPreview) {
    statusHtml = `
      <div class="iiif-status valid">✓ Found it</div>
      <div class="manifest-preview">
        <span class="mp-thumb"></span>
        <span><div class="mp-label">${escapeHtml(state.iiifPreview.label)}</div><div class="mp-count">${state.iiifPreview.canvases} canvases</div></span>
      </div>`;
  } else if (st === "invalid" && state.iiifMessage) {
    statusHtml = `<div class="iiif-status invalid">✗ ${escapeHtml(state.iiifMessage)}</div>`;
  }
  return `
    <button type="button" class="back-link" data-action="back">‹ Back</button>
    <div class="field ${fieldClass}">
      <label class="f-label" for="iiifUrl">IIIF link</label>
      <input id="iiifUrl" type="url" placeholder="https://…/manifest.json" value="${escapeAttr(state.iiifUrl)}" autocomplete="off">
      <span class="f-hint">A IIIF link (from a library or museum site) points at a set of pages Archie can import.</span>
      ${statusHtml}
      <div class="example-chips">
        <button type="button" data-example="valid">try: valid manifest</button>
        <button type="button" data-example="collection">try: a collection link</button>
        <button type="button" data-example="unreachable">try: unreachable host</button>
      </div>
    </div>
    ${st === "valid" ? `
      <div class="field">
        <label class="f-label" for="titleIiif">Exhibit title</label>
        <input id="titleIiif" type="text" value="${escapeAttr(state.title)}" autocomplete="off">
        <span class="f-hint">We used the manifest's label — change it if you like.</span>
      </div>` : ""}
    <div class="path-actions">
      <button type="button" class="btn btn-ghost" data-action="close">Cancel</button>
      <button type="button" class="btn btn-primary" data-action="create" ${disabled}>Create exhibit</button>
    </div>`;
}

function surfaceBodyHtml() {
  if (state.path === null) {
    return `
      <div class="chooser-head">
        <h2>New exhibit</h2>
        <button type="button" class="close-x" data-action="close" aria-label="Close">×</button>
      </div>
      ${pathCardsHtml()}`;
  }
  const label = state.path === "empty" ? "Start empty" : state.path === "folder" ? "From a media folder" : "From a IIIF link";
  const body = state.path === "empty" ? pathEmptyHtml() : state.path === "folder" ? pathFolderHtml() : pathIiifHtml();
  return `
    <div class="chooser-head">
      <h2>${label}</h2>
      <button type="button" class="close-x" data-action="close" aria-label="Close">×</button>
    </div>
    ${body}`;
}

function render() {
  // Variant toggle + surface visibility.
  document.querySelectorAll(".variant-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.variant === state.variant));

  const scrim = document.getElementById("scrim");
  const dialog = document.getElementById("dialog");
  const newTile = document.getElementById("newTile");
  const trigger = document.getElementById("newTileTrigger");
  const tileExpand = document.getElementById("tileExpand");

  const showDialog = state.variant === "a" && state.open;
  scrim.hidden = !showDialog;
  dialog.hidden = !showDialog;

  const showInline = state.variant === "b" && state.open;
  newTile.classList.toggle("expanded", showInline);
  trigger.hidden = showInline;
  tileExpand.hidden = !showInline;

  const target = showDialog ? dialog : showInline ? tileExpand : null;
  if (target) {
    target.innerHTML = `<div id="surfaceBody">${surfaceBodyHtml()}</div>`;
    wireSurfaceBody(target);
  }
}

function wireSurfaceBody(root) {
  root.querySelectorAll("[data-path]").forEach((el) => el.addEventListener("click", () => selectPath(el.dataset.path)));
  root.querySelectorAll('[data-action="back"]').forEach((el) => el.addEventListener("click", backToChooser));
  root.querySelectorAll('[data-action="close"]').forEach((el) => el.addEventListener("click", closeSurface));
  root.querySelectorAll('[data-action="create"]').forEach((el) => el.addEventListener("click", () => createExhibit()));

  const titleInput = root.querySelector("#titleEmpty, #titleFolder, #titleIiif");
  if (titleInput) titleInput.addEventListener("input", (e) => { state.title = e.target.value; syncCreateDisabled(); });

  const iiifInput = root.querySelector("#iiifUrl");
  if (iiifInput) {
    iiifInput.addEventListener("input", (e) => setIiifUrl(e.target.value));
    root.querySelectorAll("[data-example]").forEach((chip) => chip.addEventListener("click", () => {
      const url = chip.dataset.example === "valid" ? VALID_URL : chip.dataset.example === "collection" ? COLLECTION_URL : UNREACHABLE_URL;
      setIiifUrl(url, { instant: true });
    }));
  }

  const dz = root.querySelector("#dropzone");
  const folderInput = root.querySelector("#folderInput");
  root.querySelectorAll('[data-action="folder-pick"]').forEach((el) => el.addEventListener("click", () => folderInput && folderInput.click()));
  if (folderInput) {
    folderInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []).map((f) => ({ name: f.name, relativePath: f.webkitRelativePath || f.name, type: f.type }));
      if (files.length) applyFolderFiles(files);
    });
  }
  if (dz) {
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
    dz.addEventListener("drop", async (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
      const items = Array.from(e.dataTransfer.items || []);
      if (!items.length) return;
      const files = await readDroppedEntries(items);
      if (files.length) applyFolderFiles(files);
    });
  }
}

// A lighter re-sync for the "just typed a character" case — avoids a full render() (and its focus
// churn) on every keystroke; only the primary button's disabled state can change from title edits.
function syncCreateDisabled() {
  const btn = document.querySelector('[data-action="create"]');
  if (!btn) return;
  if (state.path === "empty") btn.disabled = state.title.trim() === "";
  else if (state.path === "folder") btn.disabled = !state.folder || state.folder.total === 0 || state.title.trim() === "";
  else if (state.path === "iiif") btn.disabled = state.iiifStatus !== "valid" || state.title.trim() === "";
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

// ── wiring: proto-controls + surface chrome ──────────────────────────────────────────────────
document.querySelectorAll(".variant-toggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.variant = btn.dataset.variant;
    state.open = false;
    state.path = null;
    render();
  });
});

document.getElementById("newTileTrigger").addEventListener("click", openSurface);
document.getElementById("scrim").addEventListener("click", closeSurface);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.open) closeSurface();
});

// Variant B has no scrim — an outside click collapses it, per the modality contract's spirit
// (Esc/scrim-click = dismiss) even though there's no literal scrim to click.
document.addEventListener("click", (e) => {
  if (state.variant === "b" && state.open) {
    const tile = document.getElementById("newTile");
    if (!tile.contains(e.target)) closeSurface();
  }
}, true);

document.querySelectorAll("[data-demo]").forEach((btn) => {
  btn.addEventListener("click", () => {
    switch (btn.dataset.demo) {
      case "folder":
        state.open = true; state.path = "folder";
        state.folder = { name: "Herbal quires scans", total: 45, images: 42, audio: 3, video: 0 };
        state.title = state.title.trim() || state.folder.name;
        render();
        break;
      case "iiif-valid":
        state.open = true; state.path = "iiif";
        render();
        setIiifUrl(VALID_URL, { instant: true });
        break;
      case "iiif-invalid":
        state.open = true; state.path = "iiif";
        render();
        setIiifUrl("https://example.com/not-a-manifest.html", { instant: true });
        break;
      case "iiif-unreachable":
        state.open = true; state.path = "iiif";
        render();
        setIiifUrl(UNREACHABLE_URL, { instant: true });
        break;
      case "reset":
        Object.assign(state, { open: false, path: null, title: "", folder: null, iiifUrl: "", iiifStatus: "idle", iiifMessage: "", iiifPreview: null });
        render();
        break;
    }
  });
});

render();

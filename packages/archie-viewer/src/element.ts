// <archie-viewer> — the embeddable read-only custom element (ADR-0019).
//
// INSTANCE-CONTEXT SEAM (Phase-4): EVERY piece of load + view state lives on the element instance
// (private fields below), never a module global. Two <archie-viewer> tags on one page own independent
// libraries — the load seam (load.ts) is pure over its `LoadedLibrary`, and the element threads that
// state through its own fields. This is the divergence from apps/viewer/published.ts (which keeps
// portableFs/liveFs as module singletons — one library per tab).
//
// RENDER: plain DOM into an OPEN shadow root (donor markup: apps/viewer Gallery.svelte / ObjectGrid.svelte
// / EmptyHall.svelte — structure ported, NOT the Svelte components, so no Svelte runtime in the bundle).
// Opening an object LAZY-imports ./reader.js (createReadOnlyMount) so OSD weight stays out of the
// gallery path.
//
// ATTRIBUTES (reflected to properties, reactive via attributeChangedCallback → re-render):
//   src           — URL of a `.archie.zip` (or a published-tree base). Absent → the drop/open zone.
//   target        — a native-route address (parseRoute); applied after load (degrade-upward, ADR-0021).
//   iiif-content  — a IIIF Presentation 3 Content State (base64url, ADR-0022, realizing ADR-0021's
//                   deferred-additive interop note): the interop deep-link. Decoded (render-core deeplink.ts decodeContentState),
//                   its referenced Canvas/Manifest IRI matched to a loaded object/exhibit, then applied
//                   through the SAME resolveExhibitTarget path with degrade-upward. PRECEDENCE: a native
//                   `target` WINS — `iiif-content` is the interop fallback, only consulted when `target`
//                   is absent. Foreign/unknown → gallery; malformed → gallery (never an error).
//   offline       — BOOLEAN attr (presence = on): block remote tile/media fetch (passed to the reader).

import { parseRoute, type ViewerRoute, type ExhibitsJson, type AObject, type PortableExhibit } from "@render/core";
import type { ReadOnlyMountSurface } from "@render/mount";
import {
  openLibraryFromFile,
  openLibraryFromSrc,
  readExhibit,
  type LoadedLibrary,
} from "./load.js";
import { OfflineRemoteBlockedError } from "./reader.js";
import { resolveExhibitTarget, type ResolvedTarget } from "./target-resolve.js";
import { resolveContentState } from "./content-state.js";
import { encodeContentState } from "@render/core";

type View =
  | { kind: "empty"; error?: string; cold?: boolean }
  | { kind: "loading" }
  | { kind: "gallery"; cold?: boolean }
  | { kind: "exhibit"; exhibit: PortableExhibit }
  | { kind: "reader"; exhibit: PortableExhibit; object: AObject };

const TEMPLATE_STYLES = `
  :host { display: block; position: relative; min-height: 320px; font-family: system-ui, sans-serif; color: #2a2320; }
  .wrap { min-height: inherit; }
  .empty { display: grid; place-items: center; min-height: 320px; padding: 2rem; text-align: center; background: #f6efe9; }
  .empty .frame { max-width: 30rem; padding: 2.5rem 2rem; border: 1px dashed #c9a98f; border-radius: 12px; }
  .empty h1 { font-weight: 300; font-size: 2rem; margin: 0 0 .5rem; }
  .empty button { font: inherit; padding: .6rem 1.4rem; border: none; border-radius: 8px; background: #d2641e; color: #fff; cursor: pointer; }
  .empty .err { color: #b00020; margin-top: .75rem; }
  .empty .cold { background: #f0e0d4; padding: .5rem .75rem; border-radius: 6px; font-size: .85rem; }
  .wash { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(210,100,30,.12); border: 1px dashed #c9a98f; pointer-events: none; }
  .grid { list-style: none; margin: 0; padding: 2rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; }
  .grid button, .grid a { display: flex; flex-direction: column; text-align: left; width: 100%; padding: 0; border: none; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.08); cursor: pointer; text-decoration: none; color: inherit; }
  .grid .cover { width: 100%; aspect-ratio: 3/2; object-fit: cover; background: #e7ded7; display: grid; place-items: center; color: #8a7a6c; }
  .grid .caption { padding: 1rem; display: flex; flex-direction: column; gap: .25rem; }
  .grid .title { font-size: 1.2rem; }
  .grid .count, .grid .desc { font-size: .85rem; color: #6b5d52; }
  header.intro { padding: 2rem 2rem 0; }
  .intro .cold { background: #f0e0d4; padding: .5rem .75rem; border-radius: 6px; font-size: .85rem; display: inline-block; margin: 0 0 .5rem; }
  header.intro h1 { font-weight: 300; margin: 0 0 .5rem; }
  .topbar { display: flex; gap: .75rem; padding: .75rem 2rem; align-items: center; }
  .topbar button { font: inherit; padding: .35rem .9rem; border: 1px solid #c9a98f; border-radius: 6px; background: transparent; cursor: pointer; }
  .reader-surface { position: relative; width: 100%; height: 70vh; min-height: 320px; background: #1c1714; }
  .notice { padding: 2rem; text-align: center; color: #6b5d52; }
`;

export class ArchieViewerElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["src", "target", "iiif-content", "offline"];
  }

  // --- INSTANCE state (the per-element seam — no module globals) -------------------------------
  #root: ShadowRoot;
  #library: LoadedLibrary | null = null;
  #view: View = { kind: "empty" };
  #surface: ReadOnlyMountSurface | null = null;
  /** Monotonic load token — a newer load() invalidates an in-flight older one (rapid src changes). */
  #loadSeq = 0;
  /** Set once connected, so attribute changes BEFORE connection don't double-load on connect. */
  #connected = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  // --- reflected attribute ⇄ property properties (reactive) ------------------------------------
  get src(): string | null { return this.getAttribute("src"); }
  set src(v: string | null) { v == null ? this.removeAttribute("src") : this.setAttribute("src", v); }

  get target(): string | null { return this.getAttribute("target"); }
  set target(v: string | null) { v == null ? this.removeAttribute("target") : this.setAttribute("target", v); }

  /** IIIF Content State (base64url, ADR-0022) — the interop deep-link. Reflected; native `target` wins. */
  get iiifContent(): string | null { return this.getAttribute("iiif-content"); }
  set iiifContent(v: string | null) { v == null ? this.removeAttribute("iiif-content") : this.setAttribute("iiif-content", v); }

  /** Boolean attribute: presence = offline on. */
  get offline(): boolean { return this.hasAttribute("offline"); }
  set offline(v: boolean) { v ? this.setAttribute("offline", "") : this.removeAttribute("offline"); }

  connectedCallback(): void {
    this.#connected = true;
    void this.#load();
  }

  disconnectedCallback(): void {
    this.#connected = false;
    this.#teardownSurface();
    this.#library?.revoke();
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
    if (oldVal === newVal) return;
    if (!this.#connected) return; // connectedCallback runs the first load
    if (name === "src") void this.#load(); // a new src re-opens from scratch
    else if (name === "target") this.#applyAddress(); // re-route within the loaded library
    else if (name === "iiif-content") this.#applyAddress(); // interop deep-link change → re-route
    // offline takes effect on the NEXT object open; nothing to re-render eagerly.
  }

  // --- LOAD: src → fetch/open; no src → drop zone. State on the instance. ----------------------
  async #load(): Promise<void> {
    const seq = ++this.#loadSeq;
    this.#teardownSurface();
    this.#library?.revoke();
    this.#library = null;

    const src = this.src;
    if (!src) {
      this.#setView({ kind: "empty" });
      return;
    }

    this.#setView({ kind: "loading" });
    try {
      const lib = await this.#openSrc(src);
      if (seq !== this.#loadSeq) { lib.revoke(); return; } // superseded by a newer load
      this.#library = lib;
      this.#setView({ kind: "gallery" });
      this.#applyAddress();
    } catch (e) {
      if (seq !== this.#loadSeq) return;
      this.#setView({ kind: "empty", error: e instanceof Error ? e.message : "Couldn't open the library." });
    }
  }

  /** Open the `src` — offline blocks a remote fetch entirely. Overridable seam for tests (so a test can
   *  inject a pre-built library without a real zip fetch). */
  async #openSrc(src: string): Promise<LoadedLibrary> {
    if (this.offline && /^https?:|^\/\//.test(src)) {
      throw new Error("This viewer is offline and can't fetch a library from a URL.");
    }
    return openLibraryFromSrc(src);
  }

  /** The drop/file-pick handler calls THIS — the no-src load seam. Public-ish (used by the drop UI and
   *  exercised by tests): open a dropped File into this instance's library, then show the gallery. */
  async openFile(file: Blob): Promise<void> {
    const seq = ++this.#loadSeq;
    this.#teardownSurface();
    this.#library?.revoke();
    this.#library = null;
    this.#setView({ kind: "loading" });
    try {
      const lib = await openLibraryFromFile(file);
      if (seq !== this.#loadSeq) { lib.revoke(); return; }
      this.#library = lib;
      this.#setView({ kind: "gallery" });
      this.#applyAddress();
    } catch (e) {
      if (seq !== this.#loadSeq) return;
      this.#setView({ kind: "empty", error: e instanceof Error ? e.message : "Couldn't open the library." });
    }
  }

  // --- ADDRESS dispatch: native `target` vs `iiif-content` (PRECEDENCE: native target WINS) -----------
  // ADR-0021 precedence: a native cite-ladder `target` is authoritative; `iiif-content` is the interop
  // FALLBACK, consulted only when `target` is absent. Both degrade upward to the gallery, never error.
  #applyAddress(): void {
    if (!this.#library) return;
    if (this.target) { this.#applyTarget(); return; } // native wins
    if (this.iiifContent) { void this.#applyContentState(this.iiifContent); return; }
    // neither present → nothing to route (stay on the gallery the load already set).
  }

  // --- IIIF CONTENT STATE: the interop deep-link (ADR-0021 deferred-additive, ADR-0022 codec) ---------
  // Decode → match the referenced Canvas/Manifest IRI to a loaded object/exhibit (content-state.ts, PURE)
  // → feed the recovered internal ViewerRoute into the SAME #openExhibit/resolveExhibitTarget path the
  // native ladder uses, so a region/time fragment rides the same surface-fit machinery. DEGRADE-UPWARD:
  // malformed OR foreign/unknown IRI → null → the gallery (cold), never an error. The per-slug exhibit
  // loader is the element's lazy readExhibit (zip/tree divergence lives on LoadedLibrary).
  async #applyContentState(encoded: string): Promise<void> {
    const lib = this.#library;
    if (!lib) return;
    const seq = ++this.#loadSeq;
    let route: ViewerRoute | null;
    try {
      route = await resolveContentState(encoded, lib.gallery, async (slug) => {
        const { exhibit, lib: nextLib } = await readExhibit(lib, slug);
        this.#library = nextLib; // thread the (possibly blob-augmented) library forward, like #openExhibit
        return exhibit;
      });
    } catch {
      route = null; // any unexpected failure in the resolve degrades upward, never throws out
    }
    if (seq !== this.#loadSeq) return; // superseded by a newer address/load
    if (!route || route.view === "gallery") {
      // malformed / foreign / unknown → the gallery, flagged cold (the nearest existing ancestor).
      this.#setView({ kind: "gallery", cold: true });
      return;
    }
    void this.#openExhibit(route.slug, route);
  }

  // --- TARGET: the FULL cite-ladder address applied after load (ADR-0018 ladder + ADR-0021 degrade) -
  // Two rungs live HERE (above the per-exhibit resolver): no-library / unknown-slug → the Gallery (the
  // nearest existing ancestor). Once the exhibit loads, `#openExhibit` hands it to `resolveExhibitTarget`
  // (target-resolve.ts) which picks object/grid + fragment/select and reports any deeper degrade.
  #applyTarget(): void {
    if (!this.#library) return;
    const target = this.target;
    if (!target) return;
    const route: ViewerRoute = parseRoute(target);
    if (route.view === "gallery") { this.#setView({ kind: "gallery" }); return; }

    const exists = this.#library.gallery.exhibits.some((e) => e.slug === route.slug);
    if (!exists) {
      // DEGRADE UPWARD (ADR-0021): an unknown slug points past this library → the Gallery, flagged cold.
      this.#setView({ kind: "gallery", cold: true });
      return;
    }
    void this.#openExhibit(route.slug, route);
  }

  async #openExhibit(slug: string, route?: ViewerRoute): Promise<void> {
    if (!this.#library) return;
    const seq = ++this.#loadSeq;
    try {
      const { exhibit, lib } = await readExhibit(this.#library, slug);
      if (seq !== this.#loadSeq) { lib.revoke(); return; }
      this.#library = lib;
      // Run the cite-ladder resolver: note/section/object/region/time → an object+fragment, or a
      // degrade-upward to the exhibit grid. A bare exhibit route (or no route) shows the grid.
      const resolved: ResolvedTarget =
        route && route.view === "exhibit" ? resolveExhibitTarget(exhibit, route) : { kind: "exhibit" };
      this.#applyResolved(exhibit, resolved);
    } catch (e) {
      if (seq !== this.#loadSeq) return;
      this.#setView({ kind: "exhibit", exhibit: { slug, title: slug, objects: [] } as unknown as PortableExhibit });
      console.error("archie-viewer: couldn't open exhibit", slug, e);
    }
  }

  /** Land the resolved target: open the object (carrying the select/fragment to apply post-mount) or
   *  show the exhibit grid. `degraded` is informational (the grid is the nearest ancestor either way);
   *  it could drive a per-exhibit cold notice — kept minimal here (the Gallery cold flag covers the
   *  unreachable-slug case; a deeper-than-reachable cite still lands sensibly on the grid). */
  #applyResolved(exhibit: PortableExhibit, resolved: ResolvedTarget): void {
    if (resolved.kind === "gallery") { this.#setView({ kind: "gallery" }); return; }
    if (resolved.kind === "object" && resolved.objectId) {
      const obj = exhibit.objects.find((o) => o.id === resolved.objectId);
      // object-not-found is already mapped to kind:"exhibit" by the resolver; this guard is belt-and-braces.
      if (obj) { void this.#openObject(exhibit, obj, resolved); return; }
    }
    this.#setView({ kind: "exhibit", exhibit });
  }

  // --- READER: lazy-import the deep-zoom mount only when an object opens ------------------------
  // `resolved` (optional) carries a cite-ladder fragment/select to apply ONCE the surface mounts: a
  // note's raw `selectId` (select+fit via the overlay nav contract) and/or a media fragment.
  async #openObject(exhibit: PortableExhibit, object: AObject, resolved?: ResolvedTarget): Promise<void> {
    this.#teardownSurface();
    this.#setView({ kind: "reader", exhibit, object });
    const host = this.#root.querySelector<HTMLElement>(".reader-surface");
    if (!host) return;

    const { openObject } = await import("./reader.js"); // LAZY: OSD weight deferred to this point
    const annotations = exhibit.annotationsByObject?.[object.id] ?? [];
    const canvasId = exhibit.canvasIdByObject?.[object.id];
    try {
      this.#surface = await openObject(host, {
        object,
        annotations,
        ...(canvasId ? { canvasId } : {}),
        offline: this.offline,
      });
      if (resolved) this.#applyFragment(this.#surface, resolved);
    } catch (e) {
      const msg = e instanceof OfflineRemoteBlockedError
        ? e.message
        : "Couldn't load this media item.";
      host.innerHTML = `<p class="notice">${escapeHtml(msg)}</p>`;
    }
  }

  /**
   * Apply a resolved cite-ladder fragment to the freshly-mounted surface.
   *
   * REAL (wired): a note `selectId` → `setSelected` + `fitBounds` — the overlay's nav contract frames the
   * note's own region (the region/time out-of-fit case degrades to the whole object inside the shared
   * fit oracle via clampToContentBounds — render-mount/fitbounds.ts).
   *
   * PARTIAL (deferred, reported honestly): a SECTION's raw `xywh` region and any `t` time offset have NO
   * application path on the current read-only surface — `ReadOnlyMountSurface` exposes only id-keyed
   * `setSelected`/`fitBounds` (read-mount.ts), and the read-only reader mounts NO time-based media
   * surface at all (no seek). Per Section-142, a landing on time-based media must SEEK-TO-OFFSET WITHOUT
   * auto-play; that seam doesn't exist in this reader yet, so we do NOT fake it. When a raw-region fit and
   * an AV seek API land on the surface, wire them here (the resolver already supplies the fragment).
   */
  #applyFragment(surface: ReadOnlyMountSurface, resolved: ResolvedTarget): void {
    if (resolved.selectId) {
      // The note's own shape: select (visual state) then fit (camera). fitBounds resolves the id against
      // the live annotation list through the shared oracle; an off-image region clamps to whole-object.
      surface.setSelected(resolved.selectId);
      surface.fitBounds(resolved.selectId);
    }
    // resolved.fragment (section raw xywh / any t): no surface application path yet — see the doc above.
  }

  #teardownSurface(): void {
    this.#surface?.destroy();
    this.#surface = null;
  }

  // --- REVERSE interop: a IIIF Content State for the CURRENTLY-open object (ADR-0022 codec) -----------
  /**
   * Encode the currently-open object as a IIIF Content State (base64url) — the inverse of the
   * `iiif-content` attribute, so a host can hand the embed's current location BACK to the IIIF ecosystem
   * (share/embed-elsewhere). Returns null when no object is open OR the object has no Canvas IRI (a
   * loose/un-published object isn't IIIF-addressable). Only the reader view is addressable; the gallery /
   * exhibit-grid views have no single Canvas to reference. Donor codec: render-core deeplink.ts
   * encodeContentState (a SpecificResource Annotation w/ motivation:highlighting).
   */
  currentContentState(): string | null {
    const v = this.#view;
    if (v.kind !== "reader") return null;
    const canvasId = v.exhibit.canvasIdByObject?.[v.object.id];
    if (!canvasId) return null;
    // A whole-object reference: a PointSelector-less SpecificResource. We carry no live region here
    // (the read-only surface exposes no current-viewport read-back), so the Content State frames the
    // whole Canvas — the strongest claim we can make truthfully without faking a selector.
    return encodeContentState(canvasId, canvasId, { type: "FragmentSelector" });
  }

  // --- RENDER: plain DOM into the shadow root (donor markup, no Svelte) -------------------------
  #setView(view: View): void {
    this.#view = view;
    this.#render();
  }

  #render(): void {
    const v = this.#view;
    const style = `<style>${TEMPLATE_STYLES}</style>`;
    if (v.kind === "empty") { this.#renderEmpty(style, v.error, v.cold); return; }
    if (v.kind === "loading") { this.#root.innerHTML = `${style}<div class="wrap"><p class="notice">Opening…</p></div>`; return; }
    if (v.kind === "gallery") { this.#renderGallery(style, v.cold); return; }
    if (v.kind === "exhibit") { this.#renderExhibit(style, v.exhibit); return; }
    if (v.kind === "reader") { this.#renderReader(style, v.exhibit, v.object); return; }
  }

  #renderEmpty(style: string, error?: string, cold?: boolean): void {
    this.#root.innerHTML = `${style}
      <div class="wrap empty">
        <div class="frame">
          <h1>Open a library</h1>
          ${cold ? `<p class="cold">That link points into a library that isn't open here yet.</p>` : ""}
          <p>Drop a library file here, or choose one. Library files end in <code>.archie.zip</code>.</p>
          <button type="button" data-act="pick">Open a library…</button>
          ${error ? `<p class="err">${escapeHtml(error)}</p>` : ""}
          <input type="file" accept=".zip" hidden />
        </div>
      </div>`;
    const fileInput = this.#root.querySelector<HTMLInputElement>('input[type="file"]')!;
    this.#root.querySelector<HTMLButtonElement>('[data-act="pick"]')!.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (f) { void this.openFile(f); fileInput.value = ""; }
    });
    this.#wireDrop();
  }

  /** Drop anywhere on the element opens the dropped file (the EmptyHall drag-drop gesture). */
  #wireDrop(): void {
    const wrap = this.#root.querySelector<HTMLElement>(".wrap")!;
    wrap.addEventListener("dragover", (e) => { e.preventDefault(); });
    wrap.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = (e as DragEvent).dataTransfer?.files?.[0];
      if (f) void this.openFile(f);
    });
  }

  #renderGallery(style: string, cold?: boolean): void {
    const gallery: ExhibitsJson | undefined = this.#library?.gallery;
    const cards = gallery ? [...gallery.exhibits].sort((a, b) => a.order - b.order) : [];
    const title = gallery?.library.title ?? "Gallery";
    this.#root.innerHTML = `${style}
      <div class="wrap">
        <header class="intro"><h1>${escapeHtml(title)}</h1>
          ${cold ? `<p class="cold">That link points deeper than this library reaches — here's the whole gallery.</p>` : ""}
        </header>
        <ul class="grid">
          ${cards.map((c) => `
            <li><button type="button" data-slug="${escapeAttr(c.slug)}">
              ${c.cover ? `<img class="cover" src="${escapeAttr(c.cover)}" alt="" loading="lazy" />` : `<span class="cover">${escapeHtml(c.title)}</span>`}
              <span class="caption"><span class="title">${escapeHtml(c.title)}</span>${c.description ? `<span class="desc">${escapeHtml(c.description)}</span>` : ""}</span>
            </button></li>`).join("")}
        </ul>
      </div>`;
    for (const btn of this.#root.querySelectorAll<HTMLButtonElement>("[data-slug]")) {
      btn.addEventListener("click", () => void this.#openExhibit(btn.dataset["slug"]!));
    }
  }

  #renderExhibit(style: string, exhibit: PortableExhibit): void {
    const objects = exhibit.objects ?? [];
    const countOf = (id: string): number => (exhibit.annotationsByObject?.[id] ?? []).length;
    this.#root.innerHTML = `${style}
      <div class="wrap">
        <div class="topbar"><button type="button" data-act="back">← Gallery</button></div>
        <header class="intro"><h1>${escapeHtml(exhibit.title)}</h1></header>
        <ul class="grid">
          ${objects.map((o) => `
            <li><button type="button" data-obj="${escapeAttr(o.id)}">
              ${o.thumbnail ? `<img class="cover" src="${escapeAttr(o.thumbnail)}" alt="" loading="lazy" />` : `<span class="cover">${escapeHtml(o.label)}</span>`}
              <span class="caption"><span class="title">${escapeHtml(o.label)}</span><span class="count">${countOf(o.id)} ${countOf(o.id) === 1 ? "note" : "notes"}</span></span>
            </button></li>`).join("")}
        </ul>
      </div>`;
    this.#root.querySelector<HTMLButtonElement>('[data-act="back"]')!.addEventListener("click", () => this.#setView({ kind: "gallery" }));
    for (const btn of this.#root.querySelectorAll<HTMLButtonElement>("[data-obj]")) {
      btn.addEventListener("click", () => {
        const obj = objects.find((o) => o.id === btn.dataset["obj"]);
        if (obj) void this.#openObject(exhibit, obj);
      });
    }
  }

  #renderReader(style: string, exhibit: PortableExhibit, object: AObject): void {
    this.#root.innerHTML = `${style}
      <div class="wrap">
        <div class="topbar">
          <button type="button" data-act="back">← ${escapeHtml(exhibit.title)}</button>
          <span class="title">${escapeHtml(object.label)}</span>
        </div>
        <div class="reader-surface"></div>
      </div>`;
    this.#root.querySelector<HTMLButtonElement>('[data-act="back"]')!.addEventListener("click", () => {
      this.#teardownSurface();
      this.#setView({ kind: "exhibit", exhibit });
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

/** Register the element. Idempotent — calling twice (double bundle include) is a no-op, not a throw. */
export function defineArchieViewer(tag = "archie-viewer"): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(tag)) customElements.define(tag, ArchieViewerElement);
}

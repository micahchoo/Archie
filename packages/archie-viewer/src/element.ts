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
//   show-unlisted — BOOLEAN attr (presence = on): include `unlisted` exhibit cards in the GALLERY LISTING
//                   (Archie-f735). Default (absent) hides them — the same UNLISTED lever the viewer hall
//                   honors (render-core iiif/exhibits.ts `ExhibitCard.unlisted`), applied to the embed's
//                   own gallery grid. Only the listing filters: direct opening of an unlisted exhibit via
//                   `target`/`iiif-content` (or a card click once shown) is UNAFFECTED — reachability is
//                   unchanged either way.

import { parseRoute, thumbnailCandidates, licenseLabel, metadataRows, type ViewerRoute, type ExhibitsJson, type AObject, type PortableExhibit, type RightsFields, type W3CAnnotation } from "@render/core";
// Type-only (erased): naming the reader's surface costs the eager graph nothing. A VALUE import from
// either module is the leak — .claude/rules/archie-viewer-eager-closure.md.
import type { EmbedReaderSurface } from "./reader.js";
import type { ReaderChrome } from "./reader-chrome.js";
import type { NarrativeAside } from "./narrative.js";
import { TOKENS_CSS } from "./tokens.js";
import {
  openLibraryFromFile,
  openLibraryFromSrc,
  readExhibit,
  type LoadedLibrary,
} from "./load.js";
// From reader-guards.js, NOT reader.js: this is a VALUE import on the eager path (the `instanceof`
// at the openObject catch), so importing it from reader.js would put OSD in the entry's static graph
// and undo the lazy `await import("./reader.js")` below.
import { OfflineRemoteBlockedError } from "./reader-guards.js";
import type { AvPlayerSurface } from "./av-player.js";
import { createNoteCard, noteBodyHtml, type NoteCard } from "./note-card.js";
import { resolveExhibitTarget, type ResolvedTarget } from "./target-resolve.js";
import { resolveContentState } from "./content-state.js";
import { embedHeightMessage, heightToPost, isFramed } from "./embed-autogrow.js";
import { encodeContentState } from "@render/core";

type View =
  | { kind: "empty"; error?: string; cold?: boolean }
  | { kind: "loading" }
  | { kind: "gallery"; cold?: boolean }
  | { kind: "exhibit"; exhibit: PortableExhibit; error?: string }
  /** `section` present ⇒ the NARRATIVE reading of the exhibit (V88): same canvas, spine in the pane. */
  | { kind: "reader"; exhibit: PortableExhibit; object: AObject; section?: number };

// Component CSS, written AGAINST the shared token layer (TOKENS_CSS, tokens.ts) — never against
// literals. Every colour, radius, shadow, step of the type scale and unit of space below resolves to
// a custom property the shell defines in the SAME file it reads itself. That is what V9/V31/V69 were:
// this block used to hold `#f6efe9`, `#d2641e`, `system-ui` and square white cards, which is a second
// (drifted) design system, not a lighter one. The component RULES stay local — the embed has no
// Svelte components to share, and anvil's `applyThemeProps` draws the same line (shared property
// writes, per-caller reset).
const TEMPLATE_STYLES = `
  :host { display: block; position: relative; min-height: 320px; font-family: var(--font-body); color: var(--ink-canvas-primary); }
  .wrap { min-height: inherit; }
  .empty { display: grid; place-items: center; min-height: 320px; padding: var(--space-8); text-align: center; background: var(--surface-canvas); }
  .empty .frame { max-width: 30rem; padding: var(--space-10) var(--space-8); border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-md); }
  .empty h1 { font-family: var(--font-display-2); font-weight: 400; font-size: 2rem; margin: 0 0 var(--space-2); }
  .empty button { font: inherit; font-family: var(--font-ui); padding: var(--space-3) var(--space-6); border: none; border-radius: var(--radius-sm); background: var(--accent); color: var(--ink-on-accent); cursor: pointer; }
  .empty button:hover { background: var(--accent-hover); }
  .empty .err { color: var(--semantic-error); margin-top: var(--space-3); }
  .empty .cold, .intro .cold { background: var(--accent-2-muted); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); font-size: .85rem; }
  .grid { list-style: none; margin: 0; padding: var(--space-8); display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-5); }
  .grid button, .grid a { display: flex; flex-direction: column; text-align: left; width: 100%; padding: 0; border: none; border-radius: var(--radius-md); overflow: hidden; background: var(--surface-canvas-raised); box-shadow: var(--shadow-lift-low); cursor: pointer; text-decoration: none; color: inherit; }
  .grid .cover { width: 100%; aspect-ratio: 3/2; object-fit: cover; background: var(--surface-canvas-overlay); display: grid; place-items: center; color: var(--ink-canvas-muted); }
  .grid .cover .glyph { font-size: 1.8rem; line-height: 1; align-self: end; }
  .grid .cover .kind { align-self: start; font-size: .85rem; }
  .grid .caption { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-1); }
  .grid .title { font-family: var(--font-display-2); font-size: 1.2rem; }
  .grid .count, .grid .desc { font-size: .85rem; color: var(--ink-canvas-secondary); }
  header.intro { padding: var(--space-8) var(--space-8) 0; }
  .intro .cold { display: inline-block; margin: 0 0 var(--space-2); }
  header.intro h1 { font-family: var(--font-display-2); font-weight: 400; margin: 0 0 var(--space-2); }
  .topbar { display: flex; gap: var(--space-3); padding: var(--space-3) var(--space-8); align-items: center; }
  .topbar button { font: inherit; font-family: var(--font-ui); font-size: var(--text-ui-sm); padding: var(--space-2) var(--space-4); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); background: transparent; color: inherit; cursor: pointer; }
  .topbar button:hover { color: var(--accent-2); border-color: var(--accent-2); }
  .topbar .title { font-family: var(--font-display-2); font-size: 1.05rem; }
  /* The reader is a canvas STAGE + a reading pane (the shell's Reader.svelte proportions in plain DOM).
     The pane is where the note LIST and the object stepper mount — see reader-chrome.ts, which is lazy.

     THE STAGE IS A COLUMN, and that is ADR-0019's layout row honoured on this side of the contract:
     the reading legend takes .reader-dock above the canvas and the note card takes .reader-note below
     it, so neither is ever on the image. Both used to be position:absolute over .reader-surface — the
     legend at its top-left, the card at its bottom-right, offset above the OSD locator by a MEASURED
     --archie-locator-h. That measurement is gone with the overlap.

     The cost is real and it lands hardest here, which the ruling named and accepted: a small embed is
     short before it is narrow, and two docked bars come out of the image's height. :empty on both rows
     is what keeps the bill at zero until there is something to show — an object with no readings pays
     nothing for the legend, and the note row exists only while a note is open. */
  .reader { display: flex; align-items: stretch; width: 100%; height: 70vh; min-height: 320px; }
  .reader-stage { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; }
  .reader-surface { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; background: var(--moss-shadow); }
  .reader-dock { flex: none; }
  .reader-dock:not(:empty) { padding: var(--space-2) var(--space-4); background: var(--surface-canvas); border-bottom: 1px solid var(--border-canvas); }
  .reader-note { flex: none; max-height: 38%; min-height: 0; overflow: auto; }
  .reader-note:not(:empty) { border-top: 1px solid var(--border-canvas); }
  /* The pane RESERVES its width from the first paint, before the lazy chrome lands in it. It used to
     collapse while empty, so mounting the chrome shrank the canvas and every region overlay jumped —
     measured as a moving hit target (a click computed against the pre-mount layout landed on nothing).
     An unstyled-but-sized pane for one frame is the correct trade against reflowing the image. */
  .reader-aside { flex: 0 0 clamp(240px, 26%, 360px); overflow-y: auto; background: var(--surface-paper); border-left: 1px solid var(--border-paper); }
  @media (max-width: 720px) { .reader { flex-direction: column; height: auto; } .reader-stage { height: 60vh; } .reader-aside { flex: none; max-height: 40vh; border-left: none; border-top: 1px solid var(--border-paper); } }
  .notice { padding: var(--space-8); text-align: center; color: var(--ink-canvas-secondary); }
  .err { padding: 0 var(--space-8); color: var(--semantic-error); }
  /* Credit line (V105) — apps/viewer Credit.svelte's idiom in plain DOM: one quiet mono line, plus an
     ⓘ disclosure carrying the licence and the descriptive metadata. IIIF makes requiredStatement a
     MUST-display, so the line itself is never behind the disclosure. <details> rather than a wired
     button: the open/close and the a11y semantics are the platform's, and the embed adds no listener. */
  .credit { display: inline-flex; align-items: baseline; gap: var(--space-2); position: relative; font-family: var(--font-mono); font-size: .72rem; letter-spacing: .06em; line-height: 1.5; color: var(--ink-canvas-secondary); }
  .credit .line { font-style: normal; }
  .credit details { display: inline; }
  .credit summary { cursor: pointer; list-style: none; padding: 6px; margin: -6px; font-size: .85rem; line-height: 1; opacity: .7; }
  .credit summary::-webkit-details-marker { display: none; }
  .credit summary:hover { opacity: 1; color: var(--accent-2); }
  .credit .panel {
    position: absolute; z-index: 20; top: 1.5rem; left: 0; min-width: 16rem; max-width: 24rem;
    display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border-radius: var(--radius-sm); box-shadow: var(--shadow-lift-low);
  }
  .credit .panel p { margin: 0; display: flex; flex-direction: column; gap: 2px; font-family: var(--font-body); font-size: .82rem; line-height: 1.6; }
  .credit .panel .k { font-family: var(--font-mono); font-size: .62rem; font-weight: 500; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .credit .panel .v { color: var(--ink-canvas-primary); }
  .credit .panel a { color: var(--accent-2-paper); }
  header.intro .credit { margin: 0 0 var(--space-2); }
  .topbar .credit { margin-left: auto; }
`;

export class ArchieViewerElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["src", "target", "iiif-content", "offline", "show-unlisted"];
  }

  // --- INSTANCE state (the per-element seam — no module globals) -------------------------------
  #root: ShadowRoot;
  #library: LoadedLibrary | null = null;
  #view: View = { kind: "empty" };
  #surface: EmbedReaderSurface | null = null;
  /** The reader's lazy chrome — note list + object nav + reading legend (reader-chrome.ts). */
  #chrome: ReaderChrome | null = null;
  /** The narrative spine's pane, mounted instead of the chrome on a narrative reading (narrative.ts). */
  #narrative: NarrativeAside | null = null;
  /** ADR-0007 / Q16: null = base notes only; a reading id OVERLAYS that reading on the base. Held on
   *  the instance (never a module global, per this file's header).
   *
   *  It PERSISTS across OBJECTS, deliberately: a reader comparing one interpretive pass across a
   *  12-folio manuscript should not be dropped back to base every time they press Next, and the
   *  legend's own radio state says the layer is still on. It is CLEARED when the exhibit changes
   *  (`#openExhibit`), because a Reading id is exhibit-scoped and means nothing in the next one —
   *  which also covers opening a new library, since every route into a library goes through there.
   *
   *  BOTH halves are asserted by `recipes/smoke.mjs`, in a real browser, because both are about what
   *  a visitor sees the legend claim:
   *    kept  — "a reading survives stepping to the next object (V56)"
   *    reset — "a Reading does not follow you into another exhibit (V56)"
   *  The second is not hypothetical: `voynich` and `voynich-rosettes` publish the SAME reading ids
   *  (cipher/hoax/abjad), so a carry-over silently activates a different curator's layer.
   *
   *  This docblock has now been wrong twice — it claimed a reset on object change that never existed
   *  (which is what hid the V56 step-with-a-reading regression, see #openObject), and then claimed a
   *  reset on library open that no code performed. A comment describing lifetime is a claim about
   *  state; assert it or don't write it. */
  #activeReading: string | null = null;
  /** annotation id → its Reading's colour for the OPEN object (reader-chrome readingColourById). Held
   *  so the reader's `markColourOf` seam can be handed to `openObject` before the map is computed. */
  #markColours: Record<string, string> | null = null;
  /** Re-read the layer and repaint the canvas — set by the open that owns the current surface. */
  #reloadAnnotations: (() => void) | null = null;
  /** The open object's notes UNDER the current reading layer (reader-chrome's `annotationsFor`, bound
   *  to this exhibit/object). Lives here rather than as a method so render-core's `overlay` stays out
   *  of the entry's static graph — see #openObject. */
  #layerNotes: (() => W3CAnnotation[]) | null = null;
  /** The AV player surface for a sound/video object — mounted instead of OSD, torn down like #surface. */
  #avSurface: AvPlayerSurface | null = null;
  /** The text-only note card for the open reader — shown on overlay selection, torn down with the surface. */
  #noteCard: NoteCard | null = null;
  /** Monotonic load token — a newer load() invalidates an in-flight older one (rapid src changes). */
  #loadSeq = 0;
  /** Set once connected, so attribute changes BEFORE connection don't double-load on connect. */
  #connected = false;
  // --- Embed auto-grow (DIVERGENCES §5): post rendered height to the parent so an iframe can size to it.
  #resizeObserver: ResizeObserver | null = null;
  #growRaf = 0;
  #lastPostedHeight: number | null = null;

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

  /** Boolean attribute: presence = include `unlisted` exhibit cards in the gallery listing (Archie-f735).
   *  Default (absent) hides them; reachability by direct target/iiif-content is never gated by this. */
  get showUnlisted(): boolean { return this.hasAttribute("show-unlisted"); }
  set showUnlisted(v: boolean) { v ? this.setAttribute("show-unlisted", "") : this.removeAttribute("show-unlisted"); }

  connectedCallback(): void {
    this.#connected = true;
    void this.#load();
    this.#startAutogrow();
  }

  disconnectedCallback(): void {
    this.#connected = false;
    this.#teardownSurface();
    this.#library?.revoke();
    this.#stopAutogrow();
  }

  // --- Embed auto-grow ------------------------------------------------------------------------------
  // Only inside an iframe (a top-level page sizes itself). Observe the HOST element — a STABLE target
  // whose height reflects the shadow content across every view (the shadow tree is re-rendered wholesale,
  // so observing an inner node would break on each render). rAF-coalesce so pan/zoom / reflow bursts post
  // at most once per frame; heightToPost skips the reader view (avoids the 70vh feedback loop) + no-op posts.
  #startAutogrow(): void {
    if (this.#resizeObserver || typeof ResizeObserver === "undefined" || !isFramed(window)) return;
    this.#resizeObserver = new ResizeObserver(() => this.#scheduleGrow());
    this.#resizeObserver.observe(this);
  }

  #scheduleGrow(): void {
    if (this.#growRaf) return; // a post is already queued for this frame
    this.#growRaf = requestAnimationFrame(() => {
      this.#growRaf = 0;
      const h = heightToPost({ viewKind: this.#view.kind, height: this.offsetHeight, lastPosted: this.#lastPostedHeight });
      if (h === null) return;
      this.#lastPostedHeight = h;
      // targetOrigin "*": the payload is a single non-sensitive height integer, and the parent's origin is
      // unknowable from inside a (possibly sandboxed, cross-origin) iframe. The parent validates the
      // sender by `event.source` (its own iframe window) + the namespaced message type — not by origin.
      // Discriminator = the element's `id` only (NOT `src`): in the recommended wrapper-page pattern `src`
      // is a URL the embedding parent can't otherwise see, and the snippet matches by `event.source` anyway.
      window.parent.postMessage(embedHeightMessage(h, this.id || ""), "*");
    });
  }

  #stopAutogrow(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    if (this.#growRaf) { cancelAnimationFrame(this.#growRaf); this.#growRaf = 0; }
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
    if (oldVal === newVal) return;
    if (!this.#connected) return; // connectedCallback runs the first load
    if (name === "src") void this.#load(); // a new src re-opens from scratch
    else if (name === "target") this.#applyAddress(); // re-route within the loaded library
    else if (name === "iiif-content") this.#applyAddress(); // interop deep-link change → re-route
    else if (name === "show-unlisted" && this.#view.kind === "gallery") this.#render(); // re-filter the listing in place
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
    } catch (e) {
      // Any unexpected failure in the resolve degrades upward, never throws out — the degrade itself
      // is correct, but it was previously silent (SILENCE row, tend Issue 4): log so a malformed
      // iiif-content address is at least debuggable.
      console.warn("archie-viewer: couldn't resolve the IIIF Content State address", e);
      route = null;
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
    // A Reading id is EXHIBIT-scoped (`{slug}/readings.json`), so it cannot mean anything in the next
    // exhibit — and if two exhibits happened to share an id like "cipher", carrying it would silently
    // activate a layer the visitor never chose. Reset here, where the exhibit changes; stepping
    // OBJECTS inside one exhibit deliberately keeps it (see #activeReading).
    this.#activeReading = null;
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
      // Previously logged-and-lost (SILENCE row, tend Issue 4): console.error only, the visitor saw a
      // bare empty grid with no indication anything failed. Carry the message into the view itself,
      // same as the top-level open failure (kind:"empty").
      const message = e instanceof Error ? e.message : "Couldn't open this exhibit.";
      this.#setView({ kind: "exhibit", exhibit: { slug, title: slug, objects: [] } as unknown as PortableExhibit, error: message });
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
  async #openObject(
    exhibit: PortableExhibit,
    object: AObject,
    resolved?: ResolvedTarget,
    section?: number,
  ): Promise<void> {
    this.#teardownSurface();
    this.#setView({ kind: "reader", exhibit, object, ...(section !== undefined ? { section } : {}) });
    const host = this.#root.querySelector<HTMLElement>(".reader-surface");
    if (!host) return;

    // The reading-layer projection and the reading-colour map, BOTH from the lazy chrome module.
    //
    // WHY THE MAP IS BUILT HERE AND NOT IN #mountAside (V56, regression fixed 2026-07-25). It used to
    // be assigned inside #mountAside, which runs AFTER the canvas mounts — so `markColourOf` was
    // consulted while `#markColours` was still null (#teardownSurface having cleared it) and every
    // mark took the BASE colour. Nothing repainted afterwards. Measured on voynich/o2 with `cipher`
    // active: reached by Next, both marks base grey; reached by re-picking the reading, correct. The
    // legend showed "Cipher reading" checked, with a green swatch, over a canvas with no green: the
    // audit's original V56 symptom, in the one path the smoke drive did not walk. It now does.
    //
    // WHY `annotationsFor` LIVES IN reader-chrome (eager-closure hygiene). It is reachable only past
    // this boundary, but as an element method its render-core `overlay` import sat in the ENTRY's
    // static graph. See .claude/rules/archie-viewer-eager-closure.md on the shared barrel.
    const { readingColourById, annotationsFor } = await import("./reader-chrome.js");
    const layerNotes = (): W3CAnnotation[] => annotationsFor(exhibit, object.id, this.#activeReading);
    this.#layerNotes = layerNotes;
    this.#markColours = readingColourById(exhibit, object.id);

    // MEDIUM BRANCH (ADR-0019 AV): a sound/video object mounts the plain-DOM AV player (native
    // <audio>/<video> + cue band + note-card), NOT OSD. image (and unknown) → the OSD reader below.
    // Both paths are LAZY-imported so the gallery bundle ships neither until an object opens.
    if (object.mediaType === "sound" || object.mediaType === "video") {
      await this.#openAvObject(host, exhibit, object, resolved);
      // The AV player owns the canvas half only; navigation and the note list are the reader's, and an
      // AV object in a 12-object exhibit needs the way out just as much as an image does.
      await this.#mountAside(exhibit, object, section, layerNotes);
      return;
    }

    const { openObject } = await import("./reader.js"); // LAZY: OSD weight deferred to this point
    let annotations = layerNotes();
    const canvasId = exhibit.canvasIdByObject?.[object.id];

    // The TEXT-ONLY note card: floats on the reader surface, shows the SELECTED annotation's body
    // (commentOfAnnotation → renderMarkdown, the SANITIZED pipeline the full viewer uses). Created
    // before the mount so the overlay's first onSelect has a card to drive; torn down with the surface.
    // The card is a ROW under the canvas, not a float over its corner (ADR-0019's layout row).
    this.#noteCard = createNoteCard(this.#root.querySelector<HTMLElement>(".reader-note") ?? host);
    const onSelect = (id: string | null): void => {
      // noteBodyHtml returns "" for null/unknown ids → show() hides the card.
      this.#noteCard?.show(noteBodyHtml(annotations, id));
      // V70's other direction: a mark clicked on the canvas highlights its row in the index.
      this.#chrome?.setSelected(id);
    };

    try {
      this.#surface = await openObject(host, {
        object,
        annotations,
        ...(canvasId ? { canvasId } : {}),
        offline: this.offline,
        onSelect,
        // V56 canvas half — the colour map is the exhibit's own reading membership (reader-chrome's
        // readingColourById), and the STYLE numbers come from render-core's readingMarkerStyle inside
        // reading-marks.ts. Neither is restated here.
        markColourOf: (id) => this.#markColours?.[id],
      });
      if (resolved) this.#applyFragment(this.#surface, resolved);
    } catch (e) {
      // The mount failed (offline-blocked / load error): drop the card with the surface — the error
      // notice replaces the host content, so the card node is gone; clear the handle too.
      this.#noteCard?.destroy();
      this.#noteCard = null;
      const msg = e instanceof OfflineRemoteBlockedError
        ? e.message
        : "Couldn't load this media item.";
      host.innerHTML = `<p class="notice">${escapeHtml(msg)}</p>`;
    }
    // Assigned BEFORE #mountAside: the legend the chrome mounts can fire `onreading` the moment it
    // exists, and #setReading has nothing to reload without this.
    this.#reloadAnnotations = (): void => {
      annotations = layerNotes();
      this.#surface?.showAnnotations(annotations);
    };
    // The reading pane mounts AFTER the canvas so a mount failure still leaves the way out visible.
    await this.#mountAside(exhibit, object, section, () => annotations);
  }

  /**
   * Mount the reading pane: the NARRATIVE spine when a section index is in play (V88), otherwise the
   * reader chrome — note list (V70), object nav (V30) and the reading legend (V56). Both modules are
   * dynamic imports, so neither is in the entry's static closure; the narrative one is fetched ONLY
   * for an exhibit that actually has sections.
   */
  async #mountAside(
    exhibit: PortableExhibit,
    object: AObject,
    section?: number,
    liveAnnotations?: () => W3CAnnotation[],
  ): Promise<void> {
    const aside = this.#root.querySelector<HTMLElement>(".reader-aside");
    const host = this.#root.querySelector<HTMLElement>(".reader-surface");
    if (!aside || !host) return;

    if (section !== undefined && (exhibit.sections?.length ?? 0) > 0) {
      const { mountNarrative } = await import("./narrative.js"); // LAZY, and only for a real spine
      this.#narrative = mountNarrative(aside, {
        exhibit,
        index: section,
        onactivate: (i) => void this.#openNarrativeSection(exhibit, i),
        onindex: () => { this.#teardownSurface(); this.#setView({ kind: "exhibit", exhibit }); },
      });
      return;
    }

    const { mountReaderChrome } = await import("./reader-chrome.js");
    // #markColours is set by #openObject, BEFORE the canvas paints — see the note there (V56).
    const notes = liveAnnotations ?? this.#layerNotes ?? ((): W3CAnnotation[] => []);
    this.#chrome = mountReaderChrome(aside, this.#root.querySelector<HTMLElement>(".reader-dock") ?? host, {
      exhibit,
      object,
      annotations: notes(),
      activeReading: this.#activeReading,
      onselect: (id) => {
        // A row is a door to the note AND to its place on the image: select (visual state) then fit
        // (camera) — the ADR-0006 nav contract, the same pair a cite-ladder landing applies.
        this.#surface?.setSelected(id);
        this.#surface?.fitBounds(id);
        this.#noteCard?.show(noteBodyHtml(notes(), id));
        // S1: on an AV object the embed owns no note card (the PLAYER owns one), so a row had nothing
        // to open — 5 rows rendered on ex-voynich.o12 and none of them was a door. Route it into the
        // player instead: seek to the note's cue and show its body, exactly as clicking that cue does.
        //
        // The row only takes the CURRENT styling if something actually opened. The first pass marked
        // it unconditionally, so on the AV path the uncued whole-recording row looked selected while
        // still displaying the previous row's body. "Current" is a claim that the pane below is about
        // THIS note; don't make it when it isn't true.
        const opened = this.#avSurface ? this.#avSurface.select(id) !== "unknown" : true;
        if (opened) this.#chrome?.setSelected(id);
      },
      onreading: (id) => void this.#setReading(id),
      onstep: (objectId) => {
        const next = exhibit.objects.find((o) => o.id === objectId);
        if (next) void this.#openObject(exhibit, next);
      },
      onoverview: () => { this.#teardownSurface(); this.#setView({ kind: "exhibit", exhibit }); },
    });
  }

  /** Switch the visible Reading layer without tearing down the canvas (the legend is a radio). */
  async #setReading(id: string | null): Promise<void> {
    const v = this.#view;
    if (v.kind !== "reader") return;
    this.#activeReading = id;
    this.#reloadAnnotations?.();
    // The list and the legend both describe the layer, so they are rebuilt; the canvas is not.
    this.#chrome?.destroy();
    this.#chrome = null;
    await this.#mountAside(v.exhibit, v.object, undefined);
  }

  /**
   * Activate one section of the narrative spine (ADR-0005): open its object and fit its `start`
   * camera. When the section stays on the SAME object the canvas is kept and only the camera and the
   * pane move — remounting OSD per paragraph would throw away the reader's place in the image.
   */
  async #openNarrativeSection(exhibit: PortableExhibit, index: number): Promise<void> {
    const sections = exhibit.sections ?? [];
    const s = sections[index];
    if (!s) return;
    const object = exhibit.objects.find((o) => o.id === s.objectId);
    const v = this.#view;
    if (object && v.kind === "reader" && v.object.id === object.id && this.#surface) {
      this.#view = { kind: "reader", exhibit, object, section: index };
      if (s.start) this.#surface.fitRegion(s.start.startsWith("xywh=") ? s.start : `xywh=${s.start}`);
      this.#narrative?.destroy();
      this.#narrative = null;
      await this.#mountAside(exhibit, object, index);
      return;
    }
    if (!object) {
      // The spine points at an object that is no longer in the exhibit: show the section list against
      // the grid rather than a blank canvas (NarrativeReader's `missing-obj` degrade, simplified).
      this.#setView({ kind: "exhibit", exhibit, error: "This section points to an item that's no longer in the exhibit." });
      return;
    }
    const resolved: ResolvedTarget = s.start
      ? { kind: "object", objectId: object.id, fragment: { kind: "xywh", value: s.start.replace(/^xywh=/, "") } }
      : { kind: "object", objectId: object.id };
    await this.#openObject(exhibit, object, resolved, index);
  }

  // --- AV READER: lazy-import the native-media player only when a sound/video object opens ----------
  // The plain-DOM analogue of #openObject's OSD path: mount a native <audio>/<video> + a cue band that
  // seeks-and-shows-notes (reusing the same note-card pipeline). A resolved `t=` fragment becomes the
  // initialSeek (seek-paused on loadedmetadata, section-142); a resolved note `selectId` becomes the
  // initialSelect (Archie-a9f4) — a TIMED-note cite lands seek-paused at its cue, highlighted, with its
  // note card open (the player resolves the cue from the note's own t= selector). Offline-blocked /
  // load errors render the same notice idiom as the image path; the AV surface tears down with
  // #teardownSurface.
  async #openAvObject(
    host: HTMLElement,
    _exhibit: PortableExhibit,
    object: AObject,
    resolved?: ResolvedTarget,
  ): Promise<void> {
    const { mountAvPlayer, OfflineAvBlockedError } = await import("./av-player.js"); // LAZY: AV weight deferred
    const annotations = _exhibit.annotationsByObject?.[object.id] ?? [];
    // The resolved cite-ladder fragment carries a `t=` offset for an AV landing → seek-paused on load.
    const initialSeek = resolved?.fragment?.kind === "t" ? resolved.fragment.value : undefined;
    try {
      this.#avSurface = mountAvPlayer(host, {
        object,
        annotations,
        ...(initialSeek ? { initialSeek } : {}),
        ...(resolved?.selectId ? { initialSelect: resolved.selectId } : {}),
        offline: this.offline,
      });
    } catch (e) {
      const msg = e instanceof OfflineAvBlockedError ? e.message : "Couldn't load this media item.";
      host.innerHTML = `<p class="notice">${escapeHtml(msg)}</p>`;
    }
  }

  /**
   * Apply a resolved cite-ladder fragment to the freshly-mounted surface.
   *
   * REAL (wired): a note `selectId` → `setSelected` + `fitBounds` — the overlay's nav contract frames the
   * note's own region; AND a spatial `xywh` fragment (a Section's camera target / an explicit `?xywh`
   * cite) → `fitRegion` (Archie-69a7), the raw-region path through the SAME applyFitBounds oracle. When
   * both are present the explicit fragment runs LAST, so it wins the camera (mirrors the resolver's
   * explicit-wins rule). An off-image region degrades safely inside the shared oracle (fitbounds.ts —
   * an unparseable value no-ops; clampToContentBounds guards the fit where content size is known).
   *
   * A `t=` fragment has no application on this SPATIAL surface (fitRegion no-ops it, the editor's
   * contract) — a resolved AV landing never reaches here: #openAvObject routes it to the native player,
   * which seeks-paused on loadedmetadata (Section-142).
   */
  #applyFragment(surface: EmbedReaderSurface, resolved: ResolvedTarget): void {
    if (resolved.selectId) {
      // The note's own shape: select (visual state) then fit (camera). fitBounds resolves the id against
      // the live annotation list through the shared oracle; an off-image region clamps to whole-object.
      surface.setSelected(resolved.selectId);
      surface.fitBounds(resolved.selectId);
    }
    if (resolved.fragment?.kind === "xywh") {
      // The resolver hands the VALUE with the `xywh=` head stripped (route/`Section.start` parsing);
      // fitRegion's parser needs the prefixed FragmentSelector form — add it when absent (mirrors
      // apps/viewer Reader.svelte focusRegion). A `percent:` value parses to null → a safe no-op, so
      // an unsupported region never breaks the landing (the selectId fit above still frames the note).
      const v = resolved.fragment.value;
      surface.fitRegion(v.startsWith("xywh=") ? v : `xywh=${v}`);
    }
  }

  #teardownSurface(): void {
    this.#chrome?.destroy();
    this.#chrome = null;
    this.#narrative?.destroy();
    this.#narrative = null;
    this.#markColours = null;
    this.#reloadAnnotations = null;
    this.#layerNotes = null;
    this.#noteCard?.destroy();
    this.#noteCard = null;
    this.#surface?.destroy();
    this.#surface = null;
    // The AV player owns its OWN note-card (created inside mountAvPlayer); destroy() drops both.
    this.#avSurface?.destroy();
    this.#avSurface = null;
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
    // The SHARED token layer first, component rules after — `var(--…)` below resolves against the same
    // custom properties the shell defines, out of the same file (tokens.ts). A host page's own styles
    // cannot reach in (shadow DOM), so the embed must carry the vocabulary itself.
    const style = `<style>${TOKENS_CSS}${TEMPLATE_STYLES}</style>`;
    if (v.kind === "empty") { this.#renderEmpty(style, v.error, v.cold); return; }
    if (v.kind === "loading") { this.#root.innerHTML = `${style}<div class="wrap"><p class="notice">Opening…</p></div>`; return; }
    if (v.kind === "gallery") { this.#renderGallery(style, v.cold); return; }
    if (v.kind === "exhibit") { this.#renderExhibit(style, v.exhibit, v.error); return; }
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
    const sorted = gallery ? [...gallery.exhibits].sort((a, b) => a.order - b.order) : [];
    // The UNLISTED lever (Archie-77b2), honored in the embed's own gallery listing (Archie-f735): default
    // hides a card the producer marked `unlisted` — the same filter apps/viewer's gallery-view.ts
    // `listedExhibits` applies to the public hall. `show-unlisted` is an explicit host opt-in to include
    // them (e.g. an internal/staging embed). Direct exhibit opening (#openExhibit, reached via a gallery
    // click OR a target/iiif-content address) never consults this flag — only the listing filters.
    const cards = this.showUnlisted ? sorted : sorted.filter((c) => !c.unlisted);
    const title = gallery?.library.title ?? "Gallery";
    this.#root.innerHTML = `${style}
      <div class="wrap">
        <header class="intro"><h1>${escapeHtml(title)}</h1>
          ${cold ? `<p class="cold">That link points deeper than this library reaches — here's the whole gallery.</p>` : ""}
          ${creditHtml(gallery?.library)}
        </header>
        <ul class="grid">
          ${cards.map((c) => `
            <li><button type="button" data-slug="${escapeAttr(c.slug)}">
              ${c.cover ? `<img class="cover" src="${escapeAttr(c.cover)}" alt="" loading="lazy" data-fallback="${escapeAttr(c.title)}" />` : `<span class="cover">${escapeHtml(c.title)}</span>`}
              <span class="caption"><span class="title">${escapeHtml(c.title)}</span>${c.description ? `<span class="desc">${escapeHtml(c.description)}</span>` : ""}</span>
            </button></li>`).join("")}
        </ul>
      </div>`;
    for (const btn of this.#root.querySelectorAll<HTMLButtonElement>("[data-slug]")) {
      btn.addEventListener("click", () => void this.#openExhibit(btn.dataset["slug"]!));
    }
    this.#wireCoverFallbacks();
  }

  /** A 404'd cover/thumb steps down its CANDIDATE CHAIN (thumbnail-mitigations gap 2: `data-srcs`
   *  carries the remaining derived URLs — level-0 static full, possibly the raw source) before
   *  degrading to the SAME label-text cover the no-thumbnail path renders — never a raw broken-image
   *  icon (apps/viewer Gallery.svelte / MediaThumbnail parity). The fallback text rides
   *  `data-fallback` because these cards are built as an innerHTML string. */
  #wireCoverFallbacks(): void {
    for (const img of this.#root.querySelectorAll<HTMLImageElement>("img.cover[data-fallback]")) {
      img.addEventListener("error", () => {
        const rest: string[] = img.dataset["srcs"] ? (JSON.parse(img.dataset["srcs"]) as string[]) : [];
        const next = rest.shift();
        if (next) {
          if (rest.length) img.dataset["srcs"] = JSON.stringify(rest);
          else delete img.dataset["srcs"];
          img.src = next;
          return;
        }
        const span = document.createElement("span");
        span.className = "cover";
        span.textContent = img.dataset["fallback"] ?? "";
        img.replaceWith(span);
      });
    }
  }

  #renderExhibit(style: string, exhibit: PortableExhibit, error?: string): void {
    const objects = exhibit.objects ?? [];
    const countOf = (id: string): number => (exhibit.annotationsByObject?.[id] ?? []).length;
    // V88 entry: an exhibit with a spine offers the authored READ beside the grid of its items. The
    // button is the only eager trace of the narrative — the module itself is fetched on the click.
    const sections = exhibit.sections ?? [];
    this.#root.innerHTML = `${style}
      <div class="wrap">
        <div class="topbar"><button type="button" data-act="back">← Gallery</button>${
          sections.length > 0 ? `<button type="button" data-act="narrative">Read the narrative · ${sections.length} ${sections.length === 1 ? "section" : "sections"}</button>` : ""
        }</div>
        <header class="intro"><h1>${escapeHtml(exhibit.title)}</h1>${creditHtml(exhibit)}</header>
        ${error ? `<p class="err">${escapeHtml(error)}</p>` : ""}
        <ul class="grid">
          ${objects.map((o) => `
            <li><button type="button" data-obj="${escapeAttr(o.id)}">
              ${objectCoverHtml(o)}
              <span class="caption"><span class="title">${escapeHtml(o.label)}</span><span class="count">${countOf(o.id)} ${countOf(o.id) === 1 ? "note" : "notes"}</span></span>
            </button></li>`).join("")}
        </ul>
      </div>`;
    this.#root.querySelector<HTMLButtonElement>('[data-act="back"]')!.addEventListener("click", () => this.#setView({ kind: "gallery" }));
    this.#root.querySelector<HTMLButtonElement>('[data-act="narrative"]')
      ?.addEventListener("click", () => void this.#openNarrativeSection(exhibit, 0));
    this.#wireCoverFallbacks();
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
          ${/* the OBJECT's own credit — no display-time inheritance, matching ExhibitView.svelte's Q5 rule */ ""}
          ${creditHtml(object)}
        </div>
        ${/* The canvas and the reading pane. The pane is filled by the LAZY chrome/narrative modules
             (#mountAside) — it renders empty (and `:empty` hides it) if they never load, so a failed
             lazy import costs the pane, never the image. */ ""}
        <div class="reader">
          <div class="reader-stage">
            <div class="reader-dock"></div>
            <div class="reader-surface"></div>
            <div class="reader-note"></div>
          </div>
          <div class="reader-aside"></div>
        </div>
      </div>`;
    this.#root.querySelector<HTMLButtonElement>('[data-act="back"]')!.addEventListener("click", () => {
      this.#teardownSurface();
      this.#setView({ kind: "exhibit", exhibit });
    });
  }
}

/**
 * The object-card cover cell (apps/viewer MediaThumbnail.svelte parity). An IMAGE-kind object gets a
 * real picture: the shared render-core CANDIDATE CHAIN (`thumbnailCandidates`, thumbnail-mitigations
 * gap 2) — baked `thumbnail` first, then the derived forms (a bare IIIF service base is not itself an
 * `<img src>`; a level-0 host 404s the sized derive, so the remaining candidates ride `data-srcs` for
 * #wireCoverFallbacks to step through on error; remote-IIIF / external-raster objects have NO baked
 * thumbnail by design, see model.ts AObject.thumbnail). AV and map objects get a lightweight
 * glyph+kind cue instead of a fake picture. Kind discriminator matches MediaThumbnail / the model:
 * only an `xyz` tileSource is a MAP — a `dzi` descriptor is a tiled IMAGE. `data-fallback` carries
 * the label the final onerror degrade renders (#wireCoverFallbacks).
 */
function objectCoverHtml(o: AObject): string {
  const kind = o.tileSource?.kind === "xyz" ? "map" : (o.mediaType ?? "image");
  if (kind === "image") {
    const [first, ...rest] = thumbnailCandidates(o, 480);
    const srcsAttr = rest.length ? ` data-srcs="${escapeAttr(JSON.stringify(rest))}"` : "";
    return `<img class="cover" src="${escapeAttr(first!)}"${srcsAttr} alt="" loading="lazy" data-fallback="${escapeAttr(o.label)}" />`;
  }
  const glyph = kind === "video" ? "▶" : kind === "sound" ? "♪" : "⌖";
  const word = kind === "video" ? "Video" : kind === "sound" ? "Audio" : "Map";
  return `<span class="cover"><span class="glyph" aria-hidden="true">${glyph}</span><span class="kind">${word}</span></span>`;
}

/**
 * The credit line + ⓘ disclosure for one view-level's rights (V105, Archie-b681).
 *
 * WHY THIS IS NOT OPTIONAL. `<archie-viewer>` showed NO attribution, licence or metadata at any
 * level, against published manifests that DO carry `requiredStatement` — which IIIF makes a
 * MUST-display and which the shell renders on the same bytes. An embed that strips a required
 * statement is legal exposure, not a missing feature.
 *
 * ALREADY-RESOLVED VALUES ONLY. The opt-in cascade (library → exhibit → object) collapses at publish
 * time, so every level's `RightsFields` arrives complete: the gallery's on `ExhibitsJson.library`,
 * the exhibit's spread onto `PortableExhibit` by `rightsFromIIIF`, the object's on `AObject` (which
 * extends `RightsFields`). Re-running inheritance here would let the embed and the shell disagree
 * about what a work is credited to — see ExhibitView.svelte's Q5 note.
 *
 * The credit VALUE is always in the light DOM, never behind the disclosure — a MUST-display behind a
 * click is not displayed. The licence and the Dublin Core rows (Archie-c6bf, via the same
 * `metadataRows` projection the shell's panel uses) ride the disclosure, as they do in the shell.
 */
function creditHtml(rights: RightsFields | undefined): string {
  const value = rights?.requiredStatement?.value ?? "";
  const label = rights?.requiredStatement?.label || "Attribution";
  const licence = licenseLabel(rights?.rights);
  const rows = metadataRows(rights);
  if (!value && !licence && rows.length === 0) return "";
  const licenceHtml = rights?.rights
    ? `<a href="${escapeAttr(rights.rights)}" target="_blank" rel="noopener noreferrer">${escapeHtml(licence!)}</a>`
    : escapeHtml(licence ?? "");
  return `<div class="credit">
      ${value ? `<span class="line">${escapeHtml(value)}</span>` : ""}
      <details><summary title="About &amp; rights" aria-label="About &amp; rights">ⓘ</summary>
        <div class="panel">
          ${value ? `<p><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span></p>` : ""}
          ${licence ? `<p><span class="k">License</span><span class="v">${licenceHtml}</span></p>` : ""}
          ${rows.map((r) => `<p><span class="k">${escapeHtml(r.label)}</span>${r.values.map((v) => `<span class="v">${escapeHtml(v.text)}</span>`).join("")}</p>`).join("")}
        </div>
      </details>
    </div>`;
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

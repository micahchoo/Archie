/* Archie Learn — canonical glossary (data) + inline popovers (behavior).
   There is no separate glossary page. This is the single source of truth for
   term definitions across every lesson. Mark a term in a lesson with:
       <span class="term" data-term="section">Section</span>
   and its definition appears on hover / focus / tap. Keep definitions tight
   (one or two sentences) — popovers are read at a glance.

   When the product's language sharpens, edit ONLY this map; every lesson updates. */

window.ARCHIE_GLOSSARY = {
  library:   { term: "Library",   def: "The whole site you publish — one Library, one URL. Holds many Exhibits plus site-wide title and rights." },
  exhibit:   { term: "Exhibit",   def: "One self-contained, publishable piece. Owns its own Objects, Notes, and any Sections or Readings — never shared with another Exhibit." },
  object:    { term: "Object",    def: "One media item inside an Exhibit — an image, sound, video, or map. The surface you actually annotate." },
  note:      { term: "Note",      def: "A single annotation pinned to a region, a moment, or a place. Linkable, and kept once you make it." },
  section:   { term: "Section",   def: "One guided step in a walk-through: a piece of prose plus a framed view of one Object. A run of them makes a narrative." },
  narrative: { term: "Narrative", def: "An ordered run of Sections. An Exhibit becomes narrative-led the moment it has one — there is no mode to switch." },
  reading:   { term: "Reading",   def: "One way of reading the material (e.g. “Cipher” vs. “Hoax”). A Note belongs to at most one Reading; the reader switches between them." },
  tag:       { term: "Tag",       def: "A lightweight label you stick on Notes so you can filter and find them later. Stack as many as you like." },
  studio:    { term: "Studio",    def: "The browser app where you author an exhibit — no servers, no build tools." },
  viewer:    { term: "Viewer",    def: "The read-only app where people explore a published exhibit." },
  gallery:   { term: "Gallery",   def: "A Library’s landing page — a card for each Exhibit. Generated for you at publish time." },
  grid:      { term: "Grid",      def: "An Exhibit’s browsable thumbnail layout of its Objects. What visitors get when there is no narrative." },
  playground:{ term: "Playground",def: "An ephemeral, try-first sandbox. One click promotes it to a saved Project when you’re ready." },
  project:   { term: "Project",   def: "A saved Exhibit bound to a folder or a portable file — your real, persisted work." },
  map:       { term: "Map",       def: "An Object that is a slippy-map basemap; geographic Notes are anchored to real coordinates so they stay put." },
  portable:  { term: "Portable file (.archie.zip)", def: "A whole Library exported as one file that opens in the Viewer with no server — the thing you hand someone to read your exhibit." },
  wadm:      { term: "WADM", def: "The W3C Web Annotation Data Model — the open standard every Note is saved as, so any compatible tool can read it." },
  iiif:      { term: "IIIF", def: "The image-interoperability standard Archie speaks: Library→Collection, Exhibit→Manifest, Object→Canvas. Other IIIF viewers can open your work." }
};

(function () {
  var G = window.ARCHIE_GLOSSARY;
  var pop = null;
  var current = null;

  function ensurePop() {
    if (!pop) {
      pop = document.createElement("div");
      pop.className = "gloss-pop hidden";
      pop.innerHTML = '<span class="t"></span><span class="d"></span>';
      document.body.appendChild(pop);
    }
    return pop;
  }

  function place(p, el) {
    var r = el.getBoundingClientRect();
    p.style.maxWidth = "min(19rem, calc(100vw - 1.5rem))";
    p.style.top = (window.scrollY + r.bottom + 8) + "px";
    p.style.left = (window.scrollX + r.left) + "px";
    var pr = p.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8) {
      p.style.left = (window.scrollX + Math.max(8, window.innerWidth - pr.width - 8)) + "px";
    }
    if (r.bottom + pr.height + 12 > window.innerHeight && r.top - pr.height - 8 > 0) {
      p.style.top = (window.scrollY + r.top - pr.height - 8) + "px";
    }
  }

  function show(el) {
    var e = G[el.getAttribute("data-term")];
    if (!e) return;
    var p = ensurePop();
    p.querySelector(".t").textContent = e.term;
    p.querySelector(".d").textContent = e.def;
    p.classList.remove("hidden");
    current = el;
    place(p, el);
  }
  function hide() { if (pop) pop.classList.add("hidden"); current = null; }

  function wire() {
    document.querySelectorAll(".term[data-term]").forEach(function (el) {
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      el.addEventListener("mouseenter", function () { show(el); });
      el.addEventListener("mouseleave", hide);
      el.addEventListener("focus", function () { show(el); });
      el.addEventListener("blur", hide);
      el.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (current === el) { hide(); } else { show(el); }
      });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); show(el); }
      });
    });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") hide(); });
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else { wire(); }
})();

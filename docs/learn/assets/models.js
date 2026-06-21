/* Archie Learn — interactive models.
   Reusable, markup-driven sandboxes. The learner builds intuition by driving
   them, not by reading. Data lives in the lesson (inline JSON); mechanism lives
   here. No dependencies.

   Three models:
     .model.drill  — drill-down containment explorer (data in <script class="drill-data">)
     .model.flip   — grid ⇄ narrative "front door" flipper
     .spine.interactive — click a stage to expand its motivation
*/

(function () {
  /* ---- drill-down containment ---- */
  function wireDrill(root) {
    var data;
    try { data = JSON.parse(root.querySelector(".drill-data").textContent); }
    catch (e) { return; }
    var bar = root.querySelector(".drill-bar");
    var stage = root.querySelector(".drill-stage");
    var depth = 0;

    function render() {
      var lvl = data[depth];

      bar.innerHTML = "";
      data.forEach(function (l, i) {
        if (i > depth) return;
        if (i > 0) {
          var sep = document.createElement("span");
          sep.className = "crumb-sep"; sep.textContent = "›";
          bar.appendChild(sep);
        }
        var c = document.createElement("button");
        c.className = "crumb"; c.textContent = l.name; c.disabled = i === depth;
        c.addEventListener("click", function () { depth = i; render(); });
        bar.appendChild(c);
      });

      var hasChildren = lvl.children && lvl.children.length;
      stage.innerHTML =
        '<p class="level-name">' + lvl.name + "</p>" +
        '<p class="level-tag">' + lvl.tag + "</p>" +
        '<p class="level-def">' + lvl.def + "</p>" +
        (hasChildren
          ? '<p class="child-head">Contains — click to go in</p><div class="children"></div>'
          : '<p class="leaf-note">This is the leaf. Nothing nests inside a ' + lvl.name + ".</p>");

      if (hasChildren) {
        var box = stage.querySelector(".children");
        lvl.children.forEach(function (label) {
          var chip = document.createElement("button");
          chip.className = "chip";
          chip.innerHTML = label + '<span class="arr">↘</span>';
          chip.addEventListener("click", function () { depth = depth + 1; render(); });
          box.appendChild(chip);
        });
      }
    }
    render();
  }

  /* ---- grid ⇄ narrative flipper (real-screenshot variant) ----
     Swaps between actual Viewer front-door screenshots as Sections are added.
     Markup supplies <figure class="shot" data-mode="grid|narr">; this only
     toggles which is visible and updates the labels. */
  function wireFlip(root) {
    var max = parseInt(root.getAttribute("data-max") || "1", 10);
    var countEl = root.querySelector(".flip-count");
    var modeEl = root.querySelector(".flip-mode");
    var addBtn = root.querySelector('[data-act="add"]');
    var remBtn = root.querySelector('[data-act="rem"]');
    var shots = Array.prototype.slice.call(root.querySelectorAll(".flip-stage .shot"));
    var n = 0;

    function render() {
      if (countEl) countEl.textContent = n + (n === 1 ? " Section" : " Sections");
      if (modeEl) modeEl.textContent = n > 0 ? "Narrative-led" : "Grid-led";
      if (addBtn) addBtn.disabled = n >= max;
      if (remBtn) remBtn.disabled = n <= 0;
      var want = n > 0 ? "narr" : "grid";
      shots.forEach(function (f) { f.classList.toggle("hidden", f.dataset.mode !== want); });
    }

    if (addBtn) addBtn.addEventListener("click", function () { if (n < max) { n++; render(); } });
    if (remBtn) remBtn.addEventListener("click", function () { if (n > 0) { n--; render(); } });
    render();
  }

  /* ---- interactive journey spine ---- */
  function wireSpine(spine) {
    spine.querySelectorAll(":scope > li").forEach(function (li) {
      li.addEventListener("click", function () { li.classList.toggle("open"); });
    });
  }

  /* ---- journey pipeline (tap a step → show its purpose) ---- */
  function wirePipeline(root) {
    var steps = Array.prototype.slice.call(root.querySelectorAll(".pstep"));
    var detail = root.querySelector(".pdetail");
    steps.forEach(function (s) {
      s.addEventListener("click", function () {
        steps.forEach(function (x) { x.classList.toggle("on", x === s); });
        if (detail) detail.textContent = s.getAttribute("data-why") || "";
      });
    });
  }

  /* ---- Simple ⇄ Advanced level toggle (persisted across lessons) ---- */
  var LEVEL_KEY = "archie-learn-level";
  function wireLevel(toggle) {
    var btns = Array.prototype.slice.call(toggle.querySelectorAll("button"));
    function apply(level) {
      document.body.setAttribute("data-level", level);
      btns.forEach(function (b) { b.classList.toggle("on", b.dataset.level === level); });
      try { localStorage.setItem(LEVEL_KEY, level); } catch (e) {}
    }
    btns.forEach(function (b) {
      b.addEventListener("click", function () { apply(b.dataset.level); });
    });
    var saved = "simple";
    try { saved = localStorage.getItem(LEVEL_KEY) || "simple"; } catch (e) {}
    apply(saved);
  }

  function init() {
    document.querySelectorAll(".level-toggle").forEach(wireLevel);
    document.querySelectorAll(".model.drill").forEach(wireDrill);
    document.querySelectorAll(".model.flip").forEach(wireFlip);
    document.querySelectorAll(".spine.interactive").forEach(wireSpine);
    document.querySelectorAll(".pipeline").forEach(wirePipeline);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();

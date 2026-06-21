/* Archie Learn — slide deck.
   Each step is a deck of ≤2 slides; one visible at a time. Built to be embedded
   in the app's help section (fills its container, no full-window assumptions).
   Navigation: on-screen Back/Next, ←/→ keys, and progress dots. At the deck's
   edges, Back/Next flow to the previous/next step via data-prev / data-next.

   Markup:
     <div class="deck" data-prev="0001-…html" data-next="0003-…html">
       <div class="deck-stage">
         <section class="slide active">…</section>
         <section class="slide">…</section>
       </div>
       <nav class="deck-nav">
         <button class="dnav prev"></button>
         <div class="dots"></div>
         <button class="dnav next"></button>
       </nav>
     </div>
*/
(function () {
  function wire(deck) {
    var slides = Array.prototype.slice.call(deck.querySelectorAll(".slide"));
    if (!slides.length) return;
    var prevBtn = deck.querySelector(".dnav.prev");
    var nextBtn = deck.querySelector(".dnav.next");
    var dotsBox = deck.querySelector(".dots");
    var prevStep = deck.getAttribute("data-prev") || "";
    var nextStep = deck.getAttribute("data-next") || "";
    var i = 0;

    var dots = slides.map(function (_, n) {
      var d = document.createElement("button");
      d.type = "button";
      d.setAttribute("aria-label", "Slide " + (n + 1));
      d.addEventListener("click", function () { go(n); });
      dotsBox.appendChild(d);
      return d;
    });

    function render() {
      slides.forEach(function (s, n) { s.classList.toggle("active", n === i); });
      dots.forEach(function (d, n) { d.classList.toggle("on", n === i); });

      if (i > 0) { prevBtn.textContent = "‹ Back"; prevBtn.disabled = false; }
      else if (prevStep) { prevBtn.textContent = "‹ Previous step"; prevBtn.disabled = false; }
      else { prevBtn.textContent = "‹ Back"; prevBtn.disabled = true; }

      if (i < slides.length - 1) { nextBtn.textContent = "Next ›"; nextBtn.disabled = false; }
      else if (nextStep) { nextBtn.textContent = "Next step ›"; nextBtn.disabled = false; }
      else { nextBtn.textContent = "Done"; nextBtn.disabled = true; }
    }

    function go(n) { i = Math.max(0, Math.min(slides.length - 1, n)); render(); }

    prevBtn.addEventListener("click", function () {
      if (i > 0) go(i - 1);
      else if (prevStep) location.href = prevStep;
    });
    nextBtn.addEventListener("click", function () {
      if (i < slides.length - 1) go(i + 1);
      else if (nextStep) location.href = nextStep;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") nextBtn.click();
      else if (e.key === "ArrowLeft") prevBtn.click();
    });

    render();
  }

  function init() { document.querySelectorAll(".deck").forEach(wire); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();

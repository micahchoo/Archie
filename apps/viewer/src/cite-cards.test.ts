import { describe, it, expect } from "vitest";
import { splitProseCites } from "./cite-cards.js";

// Block exhibit cites → card segments; inline cites / note cites / external links stay plain html.
const known = new Set(["bidar", "voynich"]);

describe("splitProseCites", () => {
  it("promotes a block exhibit-cite paragraph to a cite segment, keeping the rest as html", () => {
    const html = `<p>Intro.</p><p><a href="https://h/Archie/viewer/#/bidar">Bidar</a></p><p>Outro.</p>`;
    expect(splitProseCites(html, known)).toEqual([
      { kind: "html", html: "<p>Intro.</p>" },
      { kind: "cite", slug: "bidar", label: "Bidar" },
      { kind: "html", html: "<p>Outro.</p>" },
    ]);
  });

  it("leaves an INLINE exhibit cite as a plain link (only standalone-link paragraphs become cards)", () => {
    const inline = `<p>See <a href="https://h/Archie/viewer/#/bidar">Bidar</a> for more.</p>`;
    expect(splitProseCites(inline, known)).toEqual([{ kind: "html", html: inline }]);
  });

  it("leaves a NOTE cite and an external link as html", () => {
    const note = `<p><a href="https://h/Archie/viewer/#/bidar/a/n3">a note</a></p>`;
    expect(splitProseCites(note, known)).toEqual([{ kind: "html", html: note }]);
    const ext = `<p><a href="https://example.org/x">ext</a></p>`;
    expect(splitProseCites(ext, known)).toEqual([{ kind: "html", html: ext }]);
  });

  it("handles the static-archival fallback href and multiple adjacent cites", () => {
    const html = `<p><a href="https://h/lib/bidar/index.html">Bidar</a></p><p><a href="https://h/Archie/viewer/#/voynich">Voynich</a></p>`;
    expect(splitProseCites(html, known)).toEqual([
      { kind: "cite", slug: "bidar", label: "Bidar" },
      { kind: "cite", slug: "voynich", label: "Voynich" },
    ]);
  });

  it("returns a single html segment when there are no cites, and [] for empty", () => {
    expect(splitProseCites("<p>plain prose</p>", known)).toEqual([{ kind: "html", html: "<p>plain prose</p>" }]);
    expect(splitProseCites("", known)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { sanitizeHtml, renderMarkdown, stripMarkdown } from "./sanitize.js";

// Body sanitization (CONTEXT named cut §151; gate: before the first user-authored-HTML exhibit).
// Note bodies may be HTML/markdown; render through this. Donor: field-studio sanitize*.

describe("sanitizeHtml", () => {
  it("keeps safe formatting markup", () => {
    expect(sanitizeHtml("<p>A <strong>bold</strong> <em>note</em></p>")).toBe("<p>A <strong>bold</strong> <em>note</em></p>");
  });
  it("strips <script> entirely", () => {
    expect(sanitizeHtml('<b>hi</b><script>alert(1)</script>')).toBe("<b>hi</b>");
  });
  it("strips event-handler attributes (onerror/onclick)", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)"><b onclick="evil()">t</b>');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("onclick");
  });
  it("strips javascript: hrefs", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
  });
  it("keeps safe links and their text", () => {
    const out = sanitizeHtml('<a href="https://example.org">link</a>');
    expect(out).toContain("https://example.org");
    expect(out).toContain("link");
  });
  it("unwraps an anchor whose href was stripped — no dead, link-colored link (javascript:)", () => {
    expect(sanitizeHtml('<a href="javascript:evil()">click</a>')).toBe("click");
  });
  it("keeps an anchor with a safe href intact (only href-less anchors unwrap)", () => {
    expect(sanitizeHtml('<a href="https://example.org">link</a>')).toContain("<a");
  });
  it("returns empty string for empty / non-string input", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(undefined as unknown as string)).toBe("");
  });
});

describe("renderMarkdown", () => {
  it("renders bold + emphasis markdown to HTML", () => {
    const out = renderMarkdown("**A herbal-quire folio.** A single _composite_ plant.");
    expect(out).toContain("<strong>A herbal-quire folio.</strong>");
    expect(out).toContain("<em>composite</em>");
  });
  it("sanitizes — markdown cannot smuggle script", () => {
    const out = renderMarkdown("ok <script>alert(1)</script> [x](javascript:alert(1))");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("javascript:");
  });
  it("degrades a stray un-rewritten internal `archie:` cite to plain text (defense in depth)", () => {
    // After Bug 1+3 no production path feeds a raw archie: ref here, but if one slips through it must
    // read as honest text, not a dead link-colored anchor (the original 'renders nothing special' symptom).
    const out = renderMarkdown("See [the target](archie:bidar/#/a/abc123).");
    expect(out).toContain("the target"); // label survives as text
    expect(out).not.toContain("archie:"); // internal scheme never reaches display
    expect(out).not.toContain("<a"); // unwrapped — no dead anchor element
  });
  it("returns empty string for empty / non-string input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(undefined as unknown as string)).toBe("");
  });
});

describe("stripMarkdown", () => {
  it("strips emphasis + heading markers to plain text", () => {
    expect(stripMarkdown("**Bold.** A _note_ on `code` and #1.")).toBe("Bold. A note on code and 1.");
  });
  it("keeps link text, drops the url", () => {
    expect(stripMarkdown("see [the catalog](https://example.org)")).toBe("see the catalog");
  });
  it("returns empty string for non-string input", () => {
    expect(stripMarkdown(undefined as unknown as string)).toBe("");
  });
});

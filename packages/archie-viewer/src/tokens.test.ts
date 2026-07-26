// The SHARED token layer (V9/V31/V69) — this suite's job is to prove the embed reads the SHELL's file
// and adapts only what shadow scoping forces. It reads the canonical css off disk itself, so a change
// there flows through both sides of every assertion; there is nothing here that can "pass against a
// stale copy", because there is no copy.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformSync } from "esbuild";
import { describe, it, expect } from "vitest";
import { TOKENS_CSS } from "./tokens.js";

// Resolved against the vitest root (this package), not `import.meta.url` — under vitest that is a
// bare module id, not a file: URL, so `fileURLToPath` throws at collect time.
const CANONICAL = resolve(process.cwd(), "../render-core/src/tokens.css");
const canonicalRaw = readFileSync(CANONICAL, "utf8");
// Compare like with like. The embed's copy is minified, and a css minifier NORMALISES values —
// `rgba(26, 60, 35, 0.30)` becomes `rgba(26, 60, 35, .3)`. That is not drift, and a raw-vs-minified
// string comparison would fail on it while still being blind to the drift that matters (a different
// VALUE). So the expectation goes through the same minify the shipped string does.
const canonical = transformSync(canonicalRaw, { loader: "css", minify: true }).code;

/** Pull a custom property's value out of a css source (whitespace-tolerant, first match wins). */
function tokenValue(css: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
  return m ? m[1]!.trim() : null;
}

describe("the embed's tokens ARE the shell's tokens", () => {
  it("carries the canonical file's values, not a second set", () => {
    // A spread across the families the audit measured as drifted: ground, ink, accent, radius, font.
    for (const name of [
      "--surface-canvas", "--ink-canvas-primary", "--accent", "--accent-2",
      "--radius-md", "--space-4", "--font-body", "--shadow-lift-low",
    ]) {
      const want = tokenValue(canonical, name);
      expect(want, `${name} missing from the canonical tokens.css`).not.toBeNull();
      expect(tokenValue(TOKENS_CSS, name), `${name} drifted`).toBe(want);
    }
  });

  it("is scoped to :host — :root matches nothing inside a shadow root", () => {
    // The one adaptation. If this regressed, every var() in the embed would fall back to its initial
    // value and the whole stylesheet would silently degrade rather than error.
    expect(TOKENS_CSS).toContain(":host{");
    expect(TOKENS_CSS).not.toContain(":root");
  });

  it("every font token keeps a fallback stack — the embed ships no @font-face to a host page", () => {
    for (const name of ["--font-body", "--font-ui", "--font-mono", "--font-display-2"]) {
      const v = tokenValue(TOKENS_CSS, name) ?? "";
      expect(v.split(",").length, `${name} has no fallback`).toBeGreaterThan(1);
      expect(v).toMatch(/system-ui|sans-serif|serif|monospace/);
    }
  });

  it("arrives minified — the build and the test runtime agree on the same string", () => {
    // build.mjs's cssAsText plugin and vitest.config.ts's run the same esbuild css minify. If only one
    // of them did, the token string would differ between the runtime under test and the runtime that
    // ships, which is the exact epistemic hazard .claude/rules/bound-fetch-defaults.md documents.
    expect(TOKENS_CSS.length).toBeLessThan(canonicalRaw.length);
    expect(TOKENS_CSS).not.toContain("/*");
  });
});

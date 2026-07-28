// Studio's design vocabulary IS the shared floor — the anti-copy invariant (Archie-ecf4).
//
// Studio carried a byte-copy of `packages/render-core/src/tokens.css` from the reskin until
// 2026-07-27. Nobody decided to fork it; it drifted the way a copy always drifts, in both directions
// at once: two tokens added only here (--text-lede/--text-note), one added only there (--scrim-dim,
// so TutorialModal.svelte:37 inlined the literal as a var() fallback), and one VALUE edited only
// there (the .eyebrow contrast fix — studio rendered its eyebrows at 0.55 alpha, measured on the
// running app, for as long as the copy existed).
//
// So the thing worth gating is not "do the two agree" — that framing is what let the copy survive
// three sweeps. It is "is there a second file at all". These assertions are DERIVED from the two
// sources; there is no hand-maintained list of tokens to fall out of date, which is the trapdoor
// .claude/rules/post-review-fixes-are-unreviewed.md describes ("a gate's reference point must not be
// writable by the thing it gates").
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";

// Resolved against the vitest root (apps/studio), matching the embed's tokens.test.ts — under vitest
// `import.meta.url` is a bare module id, not a file: URL, so fileURLToPath throws at collect time.
const SRC = resolve(process.cwd(), "src");
const CANONICAL = resolve(process.cwd(), "../../packages/render-core/src/tokens.css");
const canonical = readFileSync(CANONICAL, "utf8");

/** Strip css/js block comments — a token NAMED in prose is not a token DECLARED. */
const uncommented = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** Custom properties DECLARED by a css source. */
function declaredTokens(css: string): Set<string> {
  return new Set([...uncommented(css).matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

/** A custom property's value (whitespace-tolerant, first declaration wins). */
function tokenValue(css: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(uncommented(css));
  return m ? m[1]!.trim() : null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const canonicalTokens = declaredTokens(canonical);

describe("studio's tokens ARE the shared floor", () => {
  it("the entry imports the shared layer, not a local copy", () => {
    const main = readFileSync(join(SRC, "main.ts"), "utf8");
    expect(main).toContain(`import "@render/core/tokens.css"`);
    expect(uncommented(main)).not.toMatch(/import\s+["']\.\/tokens\.css["']/);
  });

  it("declares no floor token of its own — a second copy is what drifts", () => {
    // Derived, not listed: ANY re-declaration of ANY canonical token anywhere under apps/studio/src
    // fails, whether it arrives as a restored tokens.css or as one shadowed value in a component.
    // Component-local custom properties studio genuinely owns (--studio-aside-w, --plate-w) are not
    // canonical names, so they pass untouched — the check is about shadowing the floor, not about
    // forbidding custom properties.
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (!/\.(css|svelte|ts)$/.test(file) || file.endsWith("tokens.test.ts")) continue;
      for (const name of declaredTokens(readFileSync(file, "utf8"))) {
        if (canonicalTokens.has(name)) offenders.push(`${file.slice(SRC.length + 1)} redeclares ${name}`);
      }
    }
    expect(offenders, "the floor is shadowed inside apps/studio/src").toEqual([]);
  });

  it("the floor carries the prose scale studio promoted onto it, at studio's values", () => {
    // The two tokens that were studio-only. Values, not presence — a promotion that silently rounded
    // a size would typecheck, render, and pass every other gate in this repo.
    expect(tokenValue(canonical, "--text-lede")).toBe("1.0625rem");
    expect(tokenValue(canonical, "--text-note")).toBe("0.95rem");
  });

  it("the floor carries the modal scrim studio was missing", () => {
    // TutorialModal.svelte:37 reads `var(--scrim-dim, rgba(26, 60, 35, 0.82))`. The fallback and the
    // token must agree, or unification silently changed a backdrop.
    expect(tokenValue(canonical, "--scrim-dim")).toBe("rgba(26, 60, 35, 0.82)");
    const tutorial = readFileSync(join(SRC, "TutorialModal.svelte"), "utf8");
    expect(tutorial).toContain("var(--scrim-dim, rgba(26, 60, 35, 0.82))");
  });

  it("the global .eyebrow keeps the 0.70 contrast fix", () => {
    // The one VALUE that differed between the copies, and the only visible change unification makes
    // to studio. 0.55 alpha forest on cream sat ~3:1; a revert would silently re-fail contrast on
    // the most-repeated label of BOTH apps now, not just one.
    const rule = /\.eyebrow\s*\{[^}]*\}/.exec(uncommented(canonical))?.[0] ?? "";
    expect(rule, ".eyebrow rule not found in the canonical file").not.toBe("");
    expect(rule).toContain("rgba(26, 60, 35, 0.70)");
  });
});

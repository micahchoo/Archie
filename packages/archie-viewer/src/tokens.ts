// The SHARED design-token layer (V9 / V31 / V69, Archie-52a9 / Archie-c314).
//
// WHAT THIS IS NOT: a copy. The import below resolves (via `tokens-source.mjs`) to the canonical
// token file — the SAME bytes the shell's Astro pages import — as text, and the embed injects it into
// its shadow root. There is one token file; a hue changed there changes both consumers in the same
// commit, by construction. No gate is needed because there is nothing to drift.
//
// WHERE IT LIVES: `packages/render-core/src/tokens.css` — layer zero, BELOW both consumers, so
// neither depends on the other for its design vocabulary. The shell's Astro pages reach it as
// `@render/core/tokens.css`; this package reads the same bytes through `tokens-source.mjs`. (It was
// briefly inside apps/viewer, which had a package resolving up into an app; that is fixed, not
// pending.) The virtual-module indirection means moving it again is one line in `tokens-source.mjs`
// and nothing in `src/` changes.
//
// WHY IT MATTERED. The embed's stylesheet had hand-written literals from the pre-"Verdant Clearing"
// palette — `#f6efe9` ground, `#d2641e` accent, `system-ui` everywhere, square white cards — against
// a shell that had moved to warm parchment, forest ink and a display face. That is exactly the drift
// Archie-52a9 measured as V9/V31/V69, and it is the drift a second copy always produces: the
// canonical file even says so at its own head ("duplicated in apps/viewer/src/tokens.css — keep the
// two in sync"), and the studio/viewer pair HAS since diverged.
//
// PRIOR ART: anvil `app/src/lib/theme-apply.ts` (`applyThemeProps`) is the donor shape — ONE module
// owns the token mapping and two callers apply it, `Read.svelte` to `document.documentElement` and
// the `AnnotatedImage` Web Component to its **shadow host**, with the comment at :5-9 stating the
// split we take verbatim: "Each caller still owns its own reset and color-scheme handling — only the
// property writes are shared here." Here the shell owns `body`/reset/`@font-face`; the embed owns
// its own component CSS (it has no Svelte components to share). Only the custom properties are
// shared — which is the whole of the visual language.
//
// THE ONE REWRITE. `:root` matches nothing inside a shadow root, so the custom properties would
// resolve to nothing; `:host` is its shadow-scope equivalent. The canonical file has exactly one
// `:root` (verified), and the rewrite is a scope translation, not a value change. The trailing
// `body { … }` rule is inert in a shadow root and is left alone rather than stripped — the embed
// takes the file whole and adapts only what shadow scoping forces.
//
// FONTS DEGRADE, DELIBERATELY. Every font token carries a fallback stack ("LARAZ", system-ui,
// sans-serif), and the embed cannot ship the app's @font-face files to an arbitrary host page. So a
// CDN embed gets the shell's colour, spacing, radius and type SCALE with the host's system faces —
// the divergence the audit named (white/orange/square) is closed; the display face is not, and
// cannot be, without shipping webfonts an embed has no business pushing onto a host.
// The specifier is a VIRTUAL module (`tokens-source.mjs` explains why, and holds the one declaration
// of which file it resolves to — repointing the token layer is a one-line change there, in one file).
import tokensCss from "virtual:archie-tokens";

/** The shell's token layer, scoped for a shadow root. Injected as the FIRST rule block of every
 *  view's `<style>` so component CSS below can reference `var(--…)`. */
export const TOKENS_CSS: string = tokensCss.replace(":root", ":host");

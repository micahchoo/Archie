# CANON — markers.css tokenization ledger (Archie-c59a)

Inventory taken 2026-07-23 against `main`. The tokenization was completed during the Verdant Clearing
reskin (dc930c4) — markers.css already uses `var(--annotation-*)` tokens exclusively.

## Status: DONE

| Check | Result |
|---|---|
| `grep '#[0-9a-fA-F]\{6\}' apps/studio/src/markers.css` | Zero matches |
| `grep 'rgba(' apps/studio/src/markers.css` | Zero matches |
| `grep 'drop-shadow' apps/studio/src/markers.css` | Zero matches |
| `diff apps/studio/src/markers.css apps/viewer/src/markers.css` | Identical |
| Tokens defined in both `:root`s | Yes |

## Token inventory (both apps)

| Token | Value | Used in |
|---|---|---|
| `--annotation-halo-stroke` | `rgba(251, 246, 243, 0.75)` | `.a9s-outer` stroke |
| `--annotation-inner-stroke` | `var(--clay-line)` | `.a9s-inner` stroke |
| `--annotation-selected-stroke` | `var(--accent)` | `.a9s-inner.selected` / `.selected .a9s-inner` stroke |
| `--annotation-selected-fill` | `rgba(58, 140, 93, 0.12)` | `.a9s-inner.selected` / `.selected .a9s-inner` fill |

Token names evolved from the ticket spec (`--annotation-halo` → `--annotation-halo-stroke`,
`--annotation-resting-stroke` → `--annotation-inner-stroke`) during the Verdant reskin to align
with the CSS property they feed (stroke/fill) and to chain through palette variables
(`var(--clay-line)`, `var(--accent)`) rather than duplicating hex values.

## Lock

The canonicalization rule: annotation markers reference design tokens ONLY via `var(--annotation-*)`
CSS custom properties. No hardcoded colors, no drop-shadow filter. The token definitions live in
`tokens.css :root` (one copy per app, kept in sync).

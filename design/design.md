---
version: 0.3
name: Sweat Sessions
description: A nocturnal rave-poster system built from heat and noise. The type is essentially one typeface — Archivo, a neo-grotesque — set heavy and italic (Archivo Black oblique) for the marquee, hero, lineup, and numerals, and upright for body and the metadata plate; DM Mono carries small telemetry labels. The palette is a thermal bleed — a warm near-black void (`#0E0A09`) lifting through oxblood crimson (`#7A1C28`) into a hot coral ember (`#CB4A4B`), cut by a muddy olive backlight (`#76783F`) and selectively flushed with pale salmon (`#EEA89B`) — printed on a heavy, coarse screenprint grain and threaded with a thin white wireframe mesh (a warped, draped net). Depth is atmospheric, not cast: gradient bloom, grain, vignette, and layered translucency stand in for drop shadows, which the system avoids entirely. The effect sits between a thermal-camera still and a photocopied warehouse flyer — sweaty, after-dark, and engineered to look like it was screen-printed at 2am.

colors:
  void: "#0E0A09"
  oxblood: "#7A1C28"
  ember: "#CB4A4B"
  flush: "#EEA89B"
  olive: "#76783F"
  bone: "#F4EFE9"
  ash: "#9C8F88"

gradients:
  thermal-ground: "radial-gradient(58% 42% at 50% -4%, #f3a884 0%, rgba(214,90,80,0) 58%), radial-gradient(52% 48% at 29% 44%, rgba(176,176,76,0.82) 0%, rgba(140,142,68,0) 60%), radial-gradient(54% 48% at 81% 67%, rgba(238,162,110,0.7) 0%, rgba(238,162,110,0) 60%), radial-gradient(120% 98% at 56% 22%, #a83842 0%, rgba(140,40,52,0) 64%), radial-gradient(140% 130% at 50% 128%, #0b0807 36%, transparent 100%), radial-gradient(120% 130% at 3% 78%, #0b0807 18%, transparent 56%), {colors.void}"
  thermal-ground-soft: "radial-gradient(120% 90% at 78% 14%, rgba(203, 74, 75, 0.55) 0%, transparent 62%), radial-gradient(90% 80% at 16% 50%, rgba(118, 120, 63, 0.32) 0%, transparent 60%), {colors.void}"
  ember-bloom: "radial-gradient(60% 60% at 50% 30%, {colors.ember} 0%, rgba(203, 74, 75, 0) 70%)"
  olive-bloom: "radial-gradient(55% 55% at 35% 50%, rgba(118, 120, 63, 0.6) 0%, rgba(118, 120, 63, 0) 70%)"
  vignette: "radial-gradient(130% 120% at 50% 40%, transparent 46%, rgba(8, 6, 5, 0.55) 100%)"
  poster-scrim: "linear-gradient(to top, rgba(8, 6, 5, 0.9) 0%, rgba(8, 6, 5, 0.55) 17%, transparent 40%)"

textures:
  grain:
    opacity: 0.30
    blendMode: overlay
    baseFrequency: 0.58
    description: "The page-wide screenprint grain — a coarse SVG fractalNoise (baseFrequency ~0.58, contrast-boosted via feComponentTransfer) on a fixed full-viewport layer at high z-index, ~0.30 opacity, overlay blend. The defining texture of the system: heavy and clearly visible, like riso/screenprint grit, not a faint web noise. Every surface carries it because the overlay sits above the whole page. Always present, and paired with grain-soft below."
  grain-soft:
    opacity: 0.34
    blendMode: soft-light
    baseFrequency: 0.85
    description: "A second, finer page grain (baseFrequency ~0.85) on soft-light at ~0.34, layered over the overlay grain to add tonal density without crushing contrast. The two page layers together read as printed film."
  grain-poster:
    opacity: 0.55
    blendMode: overlay
    baseFrequency: 0.60
    description: "The heavy poster grain — a coarse, contrast-boosted overlay at ~0.55 (baseFrequency ~0.60) applied directly on the cover/poster art beneath the content, plus a finer soft-light pass at ~0.50 (baseFrequency ~0.85). Reserved for the posters and hero, where the grain should visibly break up the gradient and read as screen-printed. Noticeably heavier than the page grain."
  scan-haze:
    opacity: 0.05
    description: "Optional faint horizontal banding (repeating-linear-gradient, ~3px stripe) layered under grain on dark panels to suggest a photocopied print. Subtle; never the primary texture."

typography:
  marquee-hero:
    fontFamily: "'Archivo', sans-serif"
    fontSize: "clamp(44px, 9vw, 120px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.01em"
    textTransform: uppercase
  display:
    fontFamily: "'Archivo', sans-serif"
    fontSize: "clamp(30px, 5vw, 60px)"
    fontWeight: 800
    lineHeight: 1.0
    textTransform: uppercase
  headline:
    fontFamily: "'Archivo', sans-serif"
    fontSize: "clamp(22px, 3.2vw, 40px)"
    fontWeight: 700
    lineHeight: 1.05
    textTransform: uppercase
  lineup-name:
    fontFamily: "'Archivo', sans-serif"
    fontSize: "clamp(20px, 3vw, 38px)"
    fontWeight: 700
    lineHeight: 1.12
    textTransform: uppercase
  subhead:
    fontFamily: "'Archivo', sans-serif"
    fontSize: "clamp(16px, 2vw, 22px)"
    fontWeight: 700
    lineHeight: 1.15
    textTransform: uppercase
  numeral-xl:
    fontFamily: "'Archivo', sans-serif"
    fontSize: "clamp(40px, 6vw, 92px)"
    fontWeight: 800
    lineHeight: 0.9
  body:
    fontFamily: "'Archivo', sans-serif"
    fontSize: "clamp(14px, 1.2vw, 18px)"
    fontWeight: 400
    lineHeight: 1.65
  lede:
    fontFamily: "'Archivo', sans-serif"
    fontSize: "clamp(16px, 1.6vw, 20px)"
    fontWeight: 500
    lineHeight: 1.6
  meta:
    fontFamily: "'Archivo', sans-serif"
    fontSize: "clamp(13px, 1.2vw, 16px)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
    textTransform: uppercase
  label-stamp:
    fontFamily: "'DM Mono', monospace"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.22em"
    textTransform: uppercase
  catalog-no:
    fontFamily: "'DM Mono', monospace"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.15em"
    textTransform: uppercase
  index-mark:
    fontFamily: "'DM Mono', monospace"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.1em"
    textTransform: uppercase
  data:
    fontFamily: "'DM Mono', monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.04em"

spacing:
  unit: 8px
  margin-poster: "clamp(20px, 4vw, 56px)"
  pad-section-y: "clamp(64px, 10vh, 140px)"
  pad-panel-lg: "40px 44px"
  pad-panel-md: "28px 32px"
  pad-panel-sm: "16px 20px"
  gap-stack-sm: 8px
  gap-stack-md: 16px
  gap-stack-lg: 32px
  gap-stack-xl: 56px
  content-max-width: 1180px
  rule-hairline: 1px

canvas:
  width: 100vw
  layout: vertical-scroll
  description: "A continuous-scroll reference document, not a paged deck. Sections run full-bleed on the thermal ground; inner content caps at content-max-width and centers. The poster anatomy (cover) targets a 4:5 portrait frame to echo the source flyer."

components:
  catalog-stamp:
    fontFamily: "'Archivo', sans-serif"
    color: "{colors.flush}"
    description: "The release lockup — a small uppercase 'NO.' (Archivo 700, tracked) set beside a large flush Archivo Black numeral. The numeral may be filled flush or rendered as a flush outline (transparent fill, 1.5px flush stroke). Pure grotesque, like the source flyer — no mono on the stamp. The most recognizable small chrome in the system; reads as a record-label catalogue number, and on a poster it pairs with the marquee title to form one lockup (see Poster Anatomy)."
  meta-block:
    fontFamily: "'Archivo', sans-serif"
    color: "{colors.bone}"
    fontWeight: 700
    letterSpacing: "0.06em"
    textTransform: uppercase
    lineHeight: 1.3
    description: "A tight, right-aligned stack of event facts — date / time / venue / address — in the meta style. Bone on the thermal ground, leading kept tight (1.3) so the block reads as one dense plate. The flyer's information voice."
  lineup-list:
    fontFamily: "'Archivo', sans-serif"
    fontWeight: 700
    textTransform: uppercase
    description: "A left-aligned vertical roster of names in the lineup-name style, set tight (line-height 1.12) so the names stack like a marquee. Optional DM Mono index-marks (01 / 02 …) sit to the left only when running order actually matters."
  eyebrow:
    fontFamily: "'DM Mono', monospace"
    color: "{colors.ash}"
    fontSize: 12px
    letterSpacing: "0.22em"
    textTransform: uppercase
    description: "Standalone section tag in the label-stamp style. Default ash on dark; flush or ember variants for emphasis. Usually paired with a leading hairline rule rather than a filled pill."
  label-pill:
    background: "rgba(244, 239, 233, 0.06)"
    border: "1px solid rgba(244, 239, 233, 0.16)"
    color: "{colors.bone}"
    padding: "6px 12px"
    fontFamily: "'DM Mono', monospace"
    fontSize: 11px
    letterSpacing: "0.18em"
    textTransform: uppercase
    description: "Optional framed variant of the eyebrow — a hairline-outlined translucent chip. Used for genre/age/borough tags (e.g. TECHNO / 18+ / BUSHWICK), typically stacked along a poster's right edge. Never filled with a solid neon; the system has no solid-fill pills."
  ticket-button:
    background: "{colors.ember}"
    color: "{colors.void}"
    padding: "16px 32px"
    fontFamily: "'Archivo', sans-serif"
    fontWeight: 700
    fontSize: 15px
    letterSpacing: "0.04em"
    textTransform: uppercase
    border: none
    borderRadius: 0
    description: "Primary CTA — solid ember fill, void text, square corners. Hover lifts -2px and deepens the fill slightly; no cast shadow. Carries the grain like every other surface."
  ghost-button:
    background: transparent
    color: "{colors.bone}"
    border: "1.5px solid rgba(244, 239, 233, 0.5)"
    padding: "15px 30px"
    fontFamily: "'Archivo', sans-serif"
    fontWeight: 700
    fontSize: 15px
    letterSpacing: "0.04em"
    textTransform: uppercase
    description: "Secondary CTA — bone hairline outline on the thermal ground, no fill. Hover fills the border to solid bone and inverts text to void."
  panel:
    background: "rgba(244, 239, 233, 0.05)"
    border: "1px solid rgba(244, 239, 233, 0.12)"
    padding: "28px 32px"
    borderRadius: 0
    description: "Frosted-dark content surface — a 5% bone fill over the thermal ground with a 12% bone hairline border. The system's only 'card.' Elevation is read from translucency and grain, never from a drop shadow."
  hairline-divider:
    height: 1px
    background: "rgba(244, 239, 233, 0.16)"
    description: "A single 16%-bone rule. The default separator. Full-bleed or inset; always 1px, never thicker."
  dotted-strand:
    width: 1px
    background: "repeating-linear-gradient(to bottom, rgba(244, 239, 233, 0.55) 0 3px, transparent 3px 9px)"
    description: "A thin vertical dotted line echoing the beaded chains dangling in the source artwork. Decorative vertical separator or hanging accent; runs top-to-bottom only. The chrome counterpart to the mesh's drawn beaded chains."
  ring:
    width: 14px
    height: 14px
    border: "1px solid rgba(244, 239, 233, 0.5)"
    borderRadius: 50%
    description: "Small hollow bone circle — the floating-ring motif from the mesh. Scattered as ambient decoration or used as an unfilled list bullet. The only place a full curve appears in chrome."
  swatch:
    width: 100%
    aspectRatio: "1 / 1"
    border: "1px solid rgba(244, 239, 233, 0.12)"
    description: "Color chip for documentation surfaces — a full-bleed fill of the token color with a DM Mono caption (token name + hex) below. Carries grain so swatches preview true to surface."
  focus-ring:
    outline: "2px solid {colors.flush}"
    outlineOffset: "3px"
    description: "Keyboard focus indicator on interactive controls (`:focus-visible`) — a 2px flush outline offset 3px from the element. The single place flush appears as a UI stroke rather than as type. Because the system has no shadows, the offset flush ring is how focus reads as 'lifted' without breaking the flat-poster rule."
  mesh-field:
    stroke: "{colors.bone}"
    strokeWidth: "0.42px"
    opacity: "0.05 – 0.18 per line (density builds the gossamer)"
    description: "The white wireframe net — the system's only line work. Procedurally generated inline SVG (never a raster asset). The canopy is a warped draped-net: a grid of rings × strands mapped onto a perspective cone (apex above the frame, rim near 43% height), then perturbed with a sinusoidal drape plus random per-point jitter so the lines wobble, cross, and tangle like hanging netting rather than a clean wireframe. Three overlapping passes at decreasing density give the woven, chaotic gossamer look. Around it: dangling beaded chains on the right (dotted strands with small bone circles), scattered hollow rings clustered lower-left, a few tilted oxblood square outlines mid-frame, a draped oxblood fishnet lower-right, and a faint ember vortex at the base. Thin bone strokes (~0.42px) at low per-line opacity so overlap builds density; z-index 1 behind content. Static — only the thermal blooms animate. Built from a seeded RNG (mulberry32) so each surface is reproducible, and rebuilt on resize (see Known Gaps)."
  logo-mark:
    fill: "{colors.bone}"
    description: "Twin-flame mark — two rounded teardrop/flame forms set side by side (the venue stamp). Rendered in bone as inline SVG, bottom-corner placement. Ember fill variant for light contexts."
---

## Overview

Sweat Sessions is a **nocturnal rave-poster system**. Its foundational premise is **heat plus noise**: a thermal-bleed gradient that lifts from a warm near-black void through oxblood crimson into a hot coral ember, overlaid everywhere with a heavy film grain and threaded with thin white wireframe mesh. Surfaces are meant to look screen-printed at 2am — the gradient supplies the heat, the grain supplies the grit, and the mesh supplies the only line work. Nothing in the system is clean for its own sake; the polish lives in the discipline of the type and grid sitting on top of a deliberately rough ground.

The type is essentially **one typeface in two roles, plus a mono**. **Archivo** — a clean neo-grotesque — does the heavy lifting: at its heaviest weight and set in **italic** (Archivo Black oblique) it carries every headline, hero title, lineup name, and large numeral, always in all-caps; upright at 400–700 it carries paragraph body in sentence case and the dense uppercase metadata block (date / time / venue / address). The source flyer is a single bold-oblique grotesque, so matching it means resisting a wide, rounded, or decorative display face — a rounded display like Unbounded, a condensed like Anton, or a neutral Inter all change the character. **DM Mono** is the telemetry face — used for eyebrows, section marks, dates-as-data, and HUD-style labels in the documentation. The mono + wide-tracked uppercase combination is what makes the small chrome read like a release stamp rather than an editorial caption.

The palette is built around **the thermal bleed**. `{colors.void}` is the warm black ground; `{colors.oxblood}` is the crimson mid-field; `{colors.ember}` is the hot coral bloom and the system's primary accent. A muddy `{colors.olive}` backlight glows through the lower-left of the gradient — the system's one surprising note, a warm green-gold that keeps the heat from reading as pure red. `{colors.flush}` is the pale salmon used to tint selective letters and the catalogue numeral. `{colors.bone}` is the warm white that carries all wireframe mesh and display text. The neons of other systems do not exist here — every accent is a temperature, not a glow.

Depth is the system's quiet inversion: **there are no cast shadows**. Where an arcade or material system would drop a hard or soft shadow to lift an element, Sweat Sessions reads elevation from **atmosphere** — the gradient bloom, the always-on grain, a corner vignette, and tiers of bone translucency. A panel sits above the ground because it is a 5% bone wash with a hairline border and its own grain, not because it floats on a shadow. This is the deliberate counterpoint to hard-shadow pixel systems: the poster is flat, and the depth is in the light.

**Density philosophy: sparse type, dense atmosphere.** The system reads as broken when surfaces are flat color with no grain, no gradient, no mesh — without the texture, the type looks like generic web design dropped on a maroon background. Always layer the atmosphere. But within content, restraint rules: a poster carries one marquee moment, one catalogue stamp, one metadata plate, and one roster, with generous negative space between them. The grain and gradient do the visual work so the type can stay quiet and large.

**Key Characteristics:**
- One grotesque in two roles plus a mono: Archivo Black italic (marquee/hero/lineup/numerals), Archivo upright (body + metadata plate), DM Mono (telemetry labels) — never a wide/rounded or condensed display substitute.
- The thermal-bleed gradient (`{gradients.thermal-ground}`) is the universal surface: void → oxblood → ember with an olive backlight, fading to void at the edges.
- Heavy, coarse screenprint grain covers every surface — a layered overlay + soft-light noise (`{textures.grain}` ~0.30 on the page, `{textures.grain-poster}` ~0.55 on the posters). Clearly visible, like riso grit; it is non-negotiable.
- White wireframe mesh (`{components.mesh-field}`) — a procedurally generated bone net: a warped, draped canopy (rings × strands on a perspective cone, perturbed so it tangles) plus beaded chains, rings, and square outlines — is the only line work, layered ambiently behind hero and cover content.
- Accents are temperatures: ember (hot), oxblood (deep), flush (cooled salmon), olive (backlight). No glowing neons.
- Depth is atmospheric, not cast — gradient bloom, grain, vignette, and bone translucency replace drop shadows, which the system avoids entirely.
- The catalogue stamp (`{components.catalog-stamp}`) — a small Archivo `NO.` + a large flush Archivo numeral — is the signature small chrome, reading as a record release number.
- Squared corners throughout; the only curves are in the generative mesh, the floating rings, and the twin-flame logo.
- Hairline 1px bone rules and thin dotted strands are the separators; there are no thick bars or solid-fill pills.

## Colors

### Palette

- **Void** (`{colors.void}` — `#0E0A09`): The warm near-black ground, used on `<body>` and as the base of the thermal gradient. Reads as black with a red-brown bias under the grain — never a true neutral black.
- **Oxblood** (`{colors.oxblood}` — `#7A1C28`): The deep crimson mid-field of the gradient and the color of the darkest red mesh. Structural warmth; the band between the void and the ember.
- **Ember** (`{colors.ember}` — `#CB4A4B`): The hot coral-red bloom and the system's primary accent. Used for the gradient hotspot, the primary ticket button fill, and rare display emphasis. The brightest temperature in the palette.
- **Flush** (`{colors.flush}` — `#EEA89B`): The pale, cooled salmon. Used to tint selective display letters (the way `SESSIONS` and `008` are flushed on the source flyer), to color the catalogue numeral, and as the single UI stroke on the focus ring. The system's only light-on-dark accent for type.
- **Olive** (`{colors.olive}` — `#76783F`): The muddy chartreuse backlight glowing through the lower-left of the gradient. The system's surprise note — a warm green-gold that prevents the heat from reading as monochrome red. Primarily an atmospheric bloom, not a type color.
- **Bone** (`{colors.bone}` — `#F4EFE9`): The warm white. The system's white. Carries all wireframe mesh, all display text on the thermal ground, hairline borders (at low opacity), and panel washes. Never a pure `#FFFFFF` — the warmth keeps it married to the heat.
- **Ash** (`{colors.ash}` — `#9C8F88`): The desaturated warm taupe-gray for muted secondary text, eyebrows, and captions on dark. Softer than bone; used where bone would shout.

### Defaults

- **Default surface background**: `{gradients.thermal-ground}` over `{colors.void}`, with `{textures.grain}` layered on top. Every surface gets the grain — there are no flat-color surfaces in the system.
- **Default display color on the thermal ground**: `{colors.bone}`. Reserve `{colors.flush}` for the selective-letter tint and the catalogue numeral; reserve `{colors.ember}` for the button fill and rare emphasis.
- **Default body text color**: `{colors.bone}` for primary, `{colors.ash}` for secondary/captions. Never set long body runs in ember or flush.
- **Default eyebrow / label color**: `{colors.ash}` in DM Mono; flush or ember only when the label needs to register as a status.
- **Default accent**: `{colors.ember}`. It is the one color allowed to fill a shape (the ticket button); every other accent is type or atmosphere.
- **Default hairline / border color**: `{colors.bone}` at 12–16% opacity. Borders are warm and faint, never solid bone except on hover-inverted buttons.
- **Olive is atmosphere first**: use `{colors.olive}` as a gradient bloom, not as body or display type — on the dark ground it has too little contrast to read as text.

Contrast note: `{colors.bone}` and `{colors.flush}` clear comfortably on `{colors.void}`. `{colors.ember}` clears for large display use but **not** for small body text on the void — keep ember to headline scale or button fills. `{colors.ash}` is a secondary tone; do not use it for primary reading text at small sizes.

## Typography

### Font Family
The system runs essentially one typeface in two roles, plus a mono for telemetry.

**Archivo Black, italic** is the marquee voice — Archivo at its heaviest weight (900), set in true italic: a bold oblique neo-grotesque, fairly tight and aggressive, matching the source flyer's display type. Used for every hero title, headline, lineup name, subhead, and large numeral, always in uppercase. The character is grotesque, *not* wide-rounded — swapping in a rounded display like Unbounded, a condensed like Anton, or a neutral Inter erases the voice. Archivo ships a genuine italic, so the oblique is a real `font-style: italic`, not a manual skew.

**Archivo** (upright, 400–700) is the same family doing the quiet work — paragraph body at 14–20px in sentence case, and the all-caps, lightly tracked metadata block. Hierarchy between display and body comes from weight and italic, not from a second family. Use 400–500 for body and 700 for the metadata plate.

**DM Mono** is the telemetry face — a humanist monospace used for eyebrows, section marks, index marks, dates-as-data, and HUD-style labels in the documentation. The mono rhythm plus wide uppercase tracking is the system's "label" voice. Never set DM Mono in sentence case and never use it for display. (The catalogue stamp on the posters is pure Archivo, like the flyer — DM Mono does not appear on the poster art.)

Keep the roles separate: Archivo Black italic for display, Archivo upright for body and the meta plate, DM Mono for telemetry. That separation is the typographic structure.

### Typography Scale

| Token | Size (clamp) | Family | Weight | Use |
|---|---|---|---|---|
| `{typography.marquee-hero}` | 44–120px | Archivo | 900 italic | Cover/hero title |
| `{typography.display}` | 30–60px | Archivo | 800 | Large section opener |
| `{typography.headline}` | 22–40px | Archivo | 800 | Primary section headline |
| `{typography.lineup-name}` | 20–38px | Archivo | 800 italic | A name in the lineup roster |
| `{typography.subhead}` | 16–22px | Archivo | 800 | Region subheading or panel title |
| `{typography.numeral-xl}` | 40–92px | Archivo | 900 | The catalogue numeral (the '008') — pairs with the flush tint |
| `{typography.body}` | 14–18px | Archivo | 400 | Paragraph body, sentence case |
| `{typography.lede}` | 16–20px | Archivo | 500 | Lede paragraph below a marquee title |
| `{typography.meta}` | 13–16px | Archivo | 700 | The metadata plate (date / time / venue / address), uppercase |
| `{typography.label-stamp}` | 12px | DM Mono | 500 | Text inside an eyebrow or framed label |
| `{typography.catalog-no}` | 13px | DM Mono | 500 | The 'NO.' prefix beside the catalogue numeral |
| `{typography.index-mark}` | 11px | DM Mono | 400 | Ordinal marks (01 / 02) — only when order matters |
| `{typography.data}` | 12px | DM Mono | 400 | Dates and addresses rendered as data |

### Defaults

- **Default size for a cover/hero title**: `{typography.marquee-hero}` (44–120px clamp) — Archivo 900, italic, uppercase. (On the in-frame poster lockup the title sits smaller, ~20–32px, so the mesh and gradient stay the heroes; the full marquee-hero scale is for the standalone hero/CTA.)
- **Default size for a section headline**: `{typography.headline}` (22–40px clamp) — Archivo 800, uppercase.
- **Default size for paragraph body**: `{typography.body}` (14–18px clamp) — Archivo 400, sentence case.
- **Default size for the metadata plate**: `{typography.meta}` (13–16px clamp) — Archivo 700, uppercase, 0.06em tracking, line-height 1.3.
- **Default eyebrow**: `{typography.label-stamp}` (12px) — DM Mono 500, uppercase, 0.22em tracking, ash.
- **Default tracking for any DM Mono label**: 0.1em (index marks) to 0.22em (eyebrows). Mono without wide tracking reads as code, not stamp.
- **Default body weight**: 400 for Archivo body, 500 for ledes, 700 for the metadata plate.
- **Default display weight**: 800 for headlines and lineup names, 900 for hero scale and the catalogue numeral. Marquee, hero, and lineup are set in italic; section headlines may stay upright.

When unsure which display token to reach for, default to `{typography.headline}` — it is the section-level workhorse. Reserve `{typography.marquee-hero}` for the cover and CTA moments only.

### Signature Treatments

These treatments are **non-optional whenever the corresponding element type is used**:

- **Every marquee and lineup element is uppercase.** Archivo Black display is never set in sentence case anywhere in the system. Lowercase marquee type breaks the poster voice immediately.
- **The italic oblique is the system's display gesture.** Marquee, hero, and lineup titles are set in Archivo's true italic (`font-style: italic`) to echo the source flyer. Apply it only to short, heavy, all-caps runs — never to body, never to the metadata plate, never to DM Mono. Use it consistently within a composition (italic display throughout, or upright throughout).
- **The catalogue numeral is always flushed.** The large release number ('008') is set in `{colors.flush}` — either filled, or as a flush outline (transparent fill, 1.5px flush stroke). A catalogue numeral in plain bone reads as a generic figure and loses the record-stamp signal.
- **Selective letter flush is allowed on hero titles.** A sub-word inside the marquee may be tinted `{colors.flush}` (as `SESSIONS` is on the source). Limit to one tinted run per title; the rest stays bone.
- **Every DM Mono element is uppercase with wide tracking** — minimum 0.1em for index marks, 0.15–0.22em for catalogue numbers and eyebrows. Sentence-case mono does not exist in this system.
- **Every Archivo body block uses line-height ≥ 1.6.** The metadata plate is the one exception (1.3), because it is meant to read as a dense block, not flowing prose.
- **The metadata plate is right-aligned by default.** Date / time / venue / address stack tight and flush-right, mirroring the source flyer's information corner. Left-alignment is permitted only when the plate is the sole element in a column.

### Typography Principles

The voice contrast is **heavy oblique marquee ↔ quiet upright body ↔ wide-tracked mono telemetry**. Switching any of the three roles to a different face flattens the system into generic dark-mode design. The marquee should always feel **planted and loud** — large, uppercase, tight leading, allowed to dominate a surface. The body should feel **calm** — left-aligned, sentence case, no tracking. The stamp should feel **printed** — small, mono, wide-tracked, like ink pressed onto the poster.

Italic is the display gesture — Archivo’s true italic, applied only to short, heavy display runs (marquee, hero, lineup). Body, the metadata plate, and DM Mono stay upright. Centering is permitted on cover and CTA titles only — body-length runs are always left-aligned.

## Layout

### Canvas System
The system is a **continuous vertical-scroll document**, not a paged deck. Sections run full-bleed across the viewport on the thermal ground; the inner content column caps at `{spacing.content-max-width}` (1180px) and centers, so on wide displays the type keeps editorial measure while the gradient fills the screen. The cover/poster anatomy targets a **4:5 portrait frame** to echo the source flyer's proportions.

Default section padding is `{spacing.pad-section-y}` vertically with `{spacing.margin-poster}` as the horizontal poster margin. Sections are separated by `{components.hairline-divider}`, never by background-color changes — the thermal ground is continuous beneath everything.

### Base Unit
Measurements snap to an **8px base** (`{spacing.unit}`). Gaps resolve to 8 / 16 / 32 / 56; panel padding to multiples of 4 (16, 20, 28, 32, 40, 44). The poster margin and section padding use `clamp()` ranges so they breathe with the viewport. The 8px rhythm keeps the loose, poster-like spacing from drifting into arbitrary values.

### Poster Anatomy
The cover composition has a fixed anatomy. The information lives in the lower third, weighted to the corners, while the mesh and gradient own the upper field:

- **Marquee block** — the series title in Archivo Black, italic, uppercase, sitting on a lower band (lower-left), with one optional flush sub-word.
- **Catalogue stamp** — `{components.catalog-stamp}` set directly beside or just beneath the marquee, so title + number read as one lockup (`SWEAT SESSIONS` / `NO. 008`).
- **Metadata plate** — `{components.meta-block}`, flush-right on the **same lower band as the lockup** (lower-right). Upper-right is an accepted variant when the lower band is crowded, but the source places it beside the title.
- **Genre tags** — optional `{components.label-pill}` chips stacked along the right edge (mid-height), e.g. TECHNO / 18+ / BUSHWICK.
- **Lineup roster** — `{components.lineup-list}`, bottom-left beneath the lockup, stacked tight.
- **Logo mark** — `{components.logo-mark}`, bottom-right corner, small.
- **Mesh field** — `{components.mesh-field}`, ambient behind all of the above; a `{gradients.poster-scrim}` darkens the lower third so the type stays legible over it.

```
┌──────────────────────────────────────┐
│   ░░  draped canopy mesh  ░░          │
│        ░░░░░░░░░░░░░                  │
│   ○                ╎ ╎  beaded chains │
│      ▢  squares     ╎ ╎        [TECHNO]│
│   ○ ○  rings                    [18+]  │
│ ·········  scrim darkens lower third · │
│  SWEAT SESSIONS            FRIDAY …    │
│  NO. 008                   10PM · LATE │
│                            MOOD RING   │
│  DJ DEADNAME                           │
│  NO SIR                          ◗◗     │
│  NGUYENDOWSXP               twin-flame │
└──────────────────────────────────────┘
```

This anatomy is what makes a new poster read as part of the series. Future numbers (009, 010 …) keep the corners fixed and change only the title accent (filled vs outline stamp), the roster, the tags, and the date.

### Persistent Atmosphere
These layers appear on cover/poster surfaces, in z-order (documentation surfaces use 1, 3, and 5 only):
1. The thermal ground — `{gradients.thermal-ground}` over `{colors.void}`.
2. Mesh field at z-index 1 (hero/cover surfaces).
3. Poster scrim (`{gradients.poster-scrim}`) — a bottom-up dark gradient that protects lower-band legibility on posters.
4. Vignette (`{gradients.vignette}`) on cover surfaces to pull focus to center.
5. Grain — the page-wide `{textures.grain}` overlay (0.13), plus the heavier `{textures.grain-heavy}` pass (0.18) on the poster art beneath the content.
6. Content above the atmosphere.

This stack is the system's identity. A surface rendered without grain and gradient looks like a wireframe.

## Depth and Elevation

### Atmosphere, Not Shadow (Signature)
Sweat Sessions has **no drop shadows** — hard or soft. This is the deliberate inversion that distinguishes it from pixel and material systems. Elevation is read entirely from atmosphere:

- **The thermal bloom** lifts the center of a surface toward the viewer; corners recede into the vignette.
- **The grain** sits closest to the eye on every surface, unifying the depth and reading as a single print plane.
- **Bone translucency tiers** signal layering: the ground is opaque; a `{components.panel}` is a 5% bone wash with a 12% hairline; an active/hover panel may step to 8%. Higher tiers read as nearer.

A panel is "above" the ground because it is lighter and bordered, not because it floats. Adding a `box-shadow: 0 4px 12px` anywhere in the system is a violation — it breaks the flat-poster premise.

### Translucency Tiers
- **Ground**: opaque thermal gradient.
- **Panel rest**: `rgba(244, 239, 233, 0.05)` fill, `rgba(244, 239, 233, 0.12)` hairline.
- **Panel active / hover**: `rgba(244, 239, 233, 0.08)` fill, `rgba(244, 239, 233, 0.2)` hairline.
- **Inset / well**: `rgba(8, 6, 5, 0.35)` — a darkening wash for recessed regions (e.g. behind a swatch caption).

### The One Permitted Lift
The only "elevation" gesture is on interactive controls: the ticket button and ghost button translate `-2px` on hover. They do not gain a shadow — they simply rise and deepen/invert their fill. This keeps the single moment of motion legible without introducing a shadow language.

### Focus State
Keyboard focus uses `{components.focus-ring}` — a 2px flush outline offset 3px (`:focus-visible`). It is the one place flush is a UI stroke. Because the system forbids shadows, this offset ring is how a focused control reads as "lifted" without a glow or drop shadow. Never replace it with a `box-shadow` focus style.

### Vignette
`{gradients.vignette}` darkens the corners on cover surfaces to mimic the falloff of the source flyer's gradient. It is applied via an overlay layer, not per-element. There is no tokenized intensity beyond editing the gradient stops.

## Shapes and Treatment

### Border Radius
Effectively zero. Buttons, panels, chips, and the catalogue stamp are all square-cornered. The only curves anywhere are in the **generative mesh** (bezier nets, ellipse bundles, beaded chains), the **floating rings** (`{components.ring}`), and the **twin-flame logo**. A rounded button or rounded card breaks the screen-printed-poster aesthetic immediately.

### Border Weights
- **1px** — the universal hairline: `{components.hairline-divider}`, panel borders, swatch frames, label-pill outlines (all bone at 12–16% opacity).
- **1.5px** — the ghost button outline (bone at 50%) and the flush catalogue-numeral outline.
- **2px** — the flush focus ring (`{components.focus-ring}`), the one interaction-state stroke.
- **No static border above 1.5px exists** (the 2px ring appears only on keyboard focus). The system has no thick bars or heavy rules — separation is always thin.

Borders are solid bone (low opacity) except for `{components.dotted-strand}`, which is intentionally a dotted vertical gradient echoing the hanging beaded chains in the source artwork.

### Decorative Element Types

**Catalogue stamp** — a small Archivo `NO.` beside a large flush Archivo numeral, optionally outlined. The signature small chrome; reads as a record-label release number.

**Metadata plate** — A tight, flush-right Archivo stack of event facts (date / time / venue / address) in bone. The poster's information voice.

**Lineup roster** — A left-aligned vertical stack of Archivo Black italic names, set tight so they read as a marquee. Optional DM Mono ordinals only when order matters.

**Eyebrow / label-pill** — DM Mono uppercase tag in ash, either bare (with a leading hairline) or framed as a hairline-outlined translucent chip. Never a solid-fill pill.

**Ticket button** — Solid ember fill, void text, square corners. The only solid-fill shape in the system. Hover lifts -2px.

**Ghost button** — Bone hairline outline, no fill. Hover fills the outline to solid bone and inverts text to void.

**Panel** — A 5% bone wash with a 12% hairline border, carrying its own grain. The system's only card. Elevation from translucency, not shadow.

**Hairline divider** — A single 1px 16%-bone rule. The default separator.

**Dotted strand** — A thin vertical dotted line echoing the source artwork's beaded chains. Decorative vertical separator; runs top-to-bottom only.

**Ring** — A small hollow bone circle from the mesh motif. Scattered as ambient decoration or used as an unfilled bullet.

**Mesh field** — A procedurally generated bone net: draped canopy (ellipse bundle + strand fan), beaded chains, scattered rings, a few oxblood square outlines, an optional oxblood fishnet, and a faint ember vortex. SVG-rendered at ~0.5 opacity. The only line work; ambient behind hero/cover content.

**Twin-flame logo** — Two rounded teardrop/flame forms side by side, in bone (ember variant for light contexts). The venue stamp; bottom-corner placement.

**Swatch** — A full-bleed token-color fill with a 1px frame and a DM Mono caption (token + hex). Carries grain so it previews true to surface.

## Do's and Don'ts

### Do

- Apply the thermal ground plus grain to every surface. The atmosphere is the design system; a flat-color surface looks like a wireframe.
- Use `{colors.bone}` as the default display and body color, `{colors.flush}` for the catalogue numeral and one selective letter-flush, and `{colors.ash}` for muted captions.
- Keep the grain heavy (~0.13 opacity, overlay blend; ~0.18 on the poster art). The grit is the point; a faint grain reads as a mistake rather than a texture.
- Set all marquee, hero, and lineup type in Archivo Black, italic, uppercase, and keep that oblique consistent within a composition (or upright throughout).
- Render the catalogue stamp as a small Archivo `NO.` + a flush Archivo numeral on every poster, lockup'd to the title. It is the series' signature.
- Stack the metadata plate flush-right and tight (line-height 1.3) in Archivo 700 uppercase, on the title band.
- Separate sections with the 1px bone hairline, and keep the thermal ground continuous beneath everything.
- Use the floating rings, dotted strands, and mesh field as ambient decoration on hero/cover surfaces, and add a bottom-up scrim wherever type sits over the mesh.
- Signal elevation with bone translucency tiers and the grain — never with a shadow — and show the 2px flush focus ring on interactive controls.
- Respect `prefers-reduced-motion`: disable the gradient drift and the button hover transition; the grain and mesh are already static.
- Keep ember for the button fill and rare display emphasis; let every other accent be type or atmospheric bloom.

### Don't

- Don't swap the type. Archivo (display + body) and DM Mono (telemetry) are the voices — a rounded display like Unbounded, a condensed like Anton, or a neutral Inter changes the character.
- Don't add a drop shadow anywhere — not even for focus. The poster is flat; depth comes from atmosphere, translucency, and the offset focus ring. `box-shadow: 0 4px 12px rgba(0,0,0,0.1)` does not exist here.
- Don't run any surface without grain. Flat color is the one thing that breaks the system on sight.
- Don't set the Archivo display in sentence case, and don't set Archivo body in all-caps. Marquee is always uppercase; body is always sentence case.
- Don't fill shapes with neon or solid color beyond the ember ticket button. There are no solid-fill pills, bars, or badges.
- Don't use `{colors.ember}` for small body text — it fails contrast at body scale. Keep it to headline scale and fills.
- Don't use `{colors.olive}` as type. It is a backlight bloom; on the dark ground it has too little contrast to read as text.
- Don't thicken the hairlines. Static borders and rules are 1px (1.5px on the ghost button only) — there are no heavy bars.
- Don't round corners on chrome. Curves belong to the mesh, the rings, and the logo only.
- Don't apply the marquee lean to body, the metadata plate, or DM Mono — the lean is a short-display gesture only.
- Don't flush more than one sub-word per title, or set the entire title in flush. Bone is the default; flush is the accent.
- Don't let type sit directly on the busy mesh without a scrim — the canopy lines will fight the letters.

## Responsive Behavior

Sweat Sessions is a **viewport-fluid system** built on `vw`-based sizing and CSS `clamp()` ranges. There are no hard breakpoints for type — every display, body, and spacing value interpolates between a minimum and maximum on viewport width.

### Scaling Behavior
- Marquee hero scales 44px → 120px on viewport width.
- The catalogue numeral scales 40px → 92px.
- Body scales 14px → 18px; the metadata plate 13px → 16px.
- The grain tile, hairline weight (1px), ring size (14px), and dotted-strand stripe are fixed — they do not scale, so on larger viewports the grain and chrome read proportionally finer (intentionally — the larger the canvas, the more screen-printed the texture feels).

### Component Breakpoints
Three component-level breakpoints exist:
- `max-width: 1024px` — the poster anatomy relaxes from corner-anchored to stacked; the hero poster moves above its copy; multi-column documentation grids drop 4→2 columns.
- `max-width: 768px` — the metadata plate may move below the marquee instead of staying flush-right on the band; swatch grids go 3→2 columns.
- `max-width: 520px` — all grids collapse to a single column. (The display oblique is a real italic, so there is no skew angle to manage across breakpoints.)

### Motion
Motion is minimal and atmospheric. The mesh field and grain are static. The only animation is: a slow drift on the olive/ember gradient blooms (~26s ease-in-out) on the cover, and the -2px hover lift on buttons. The mesh is regenerated (not animated) on window resize, debounced, so it always fills its container without distortion. The `prefers-reduced-motion` media query disables the gradient drift and the hover transition; the grain, mesh, and gradient remain (they are not animated). The system is screen-first and works fully static.

### Print Behavior
The system is screen-first and has no dedicated print rule. For a physical poster, export the cover as a high-resolution raster: the grain, mesh, and gradient are all CSS/JS-rendered (grain as inline SVG data-URI, mesh as inline SVG paths), so a screenshot preserves the full atmosphere without external assets.

## CJK & International Content

When using this system for Chinese (or other CJK) content, swap the Latin typeface stack for an equivalent Chinese pairing and apply universal CJK adjustments. All recommended Chinese fonts load via CDN — no install required.

### Recommended Chinese Pairing

| Role | Latin (default) | Chinese counterpart |
|---|---|---|
| Marquee / headline / lineup / numeral | Archivo Black 900 | 思源黑体 Noto Sans SC 900 |
| Body / lede / metadata plate | Archivo 400–700 | 思源黑体 Noto Sans SC 400–700 |
| Catalogue / index / eyebrow / data | DM Mono 400–500 (uppercase + wide tracking) | 思源黑体 Noto Sans SC 500 (no transform, no tracking) — see Known CJK Gap |

### Mixed-Content Strategy

Set every text element to a single CJK family with built-in Latin coverage — `font-family: 'Noto Sans SC', sans-serif`. 思源黑体 ships clean Latin glyphs, so a string like `使用 Archivo 字体` renders in one consistent face rather than switching mid-word. The system normally runs three faces (marquee / body / stamp); collapsing to one CJK face is the right tradeoff because none of the three Latin faces have credible Chinese counterparts. Hierarchy still works through weight (900 / 700 / 500 / 400), the flush tint on numerals, and the system's atmosphere.

### Loading

Add to the page `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet">
```

### Universal CJK Adjustments

- **Line-height**: increase ~15–25% over the Latin spec. Body 1.75–1.85 (up from 1.65), display 1.1–1.2 (up from 0.98–1.05). CJK glyphs are square and crowd vertically.
- **Letter-spacing**: set to 0 on every CJK run. The system's positive tracking on DM Mono (0.1–0.22em) and the meta plate (0.06em) looks broken on square CJK glyphs.
- **Text transform**: don't apply `uppercase` — CJK has no case. Remove it from every DM Mono and meta element for CJK runs.
- **Display italic**: drop the italic for CJK display. Obliqued CJK characters distort badly; keep the CJK marquee upright and let weight 900 carry the emphasis.
- **Punctuation**: use full-width Chinese punctuation （，。：；！？「」（）).
- **No period on display headlines**: Chinese convention omits the trailing 。 on display-scale titles.
- **Space between CJK and Latin (盘古之白)**: insert an ASCII space between every Chinese character and adjacent Latin character or digit. Write `汗 SESSIONS / 第 008 期` not `汗SESSIONS/第008期`.
- **One font per sentence**: let 思源黑体 handle mixed CJK + Latin runs; don't let the browser fall back to Archivo or DM Mono mid-sentence for ASCII.

### Aesthetic Notes for This System

The system's identity rests on a heavy oblique grotesque (Archivo Black) for display, Archivo for body, and DM Mono for telemetry — and a CJK build cannot fully preserve that oblique-display character. Compensate by leaning harder on the **non-typographic** signatures: the thermal gradient, the heavy grain, the wireframe mesh, and the flush catalogue numeral all survive a face swap and carry the after-dark voice when the type itself is generic.

The catalogue numeral still works in 思源黑体 900 flushed salmon, and the metadata plate still reads as a dense flush-right block. Keep all atmosphere (gradient, grain, mesh, vignette) — it does more identity work in a CJK build than in the Latin original.

### Known CJK Gap

- **No idiomatic heavy-oblique CJK display.** The marquee voice depends on a heavy oblique grotesque. 思源黑体 (Noto Sans SC) 900 supplies the weight, but CJK type is not set obliquely, so the CJK marquee stays upright and loses the slant. The atmosphere and the flush numeral must carry the marquee voice.
- **No CDN Chinese monospace stamp face.** DM Mono's "printed release stamp" depends on monospaced rhythm + uppercase + wide tracking, none of which transfer to CJK. The catalogue stamp loses its mono character; lean on the flush numeral color and the `NO.` prefix (kept in Latin/Arabic numerals) to keep the stamp recognizable.

## Iteration Guide

1. Any new surface gets the thermal ground (`{gradients.thermal-ground}` over `{colors.void}`) plus `{textures.grain}` at 0.13 overlay. Don't skip the grain.
2. Any new display element uses Archivo Black uppercase (italic for marquee, hero, and lineup). Any new body element uses Archivo upright. Any new eyebrow, index mark, or data label uses DM Mono. Never cross the role boundaries.
3. Any new poster keeps the fixed anatomy — title + catalogue stamp lockup'd on a lower band (lower-left), metadata plate flush-right on the same band, optional genre tags on the right edge, roster bottom-left, logo bottom-right, mesh behind with a bottom scrim. Change the accent, roster, tags, and date; keep the corners.
4. Any new catalogue numeral is flushed (`{colors.flush}`), filled or 1.5px-outlined. Don't leave it plain bone.
5. Any new separator is the 1px bone hairline or a dotted strand — never a thick bar or a background-color change.
6. Any new measurement snaps to the 8px base. Gaps 8 / 16 / 32 / 56; panel padding in multiples of 4. Off-grid spacing reads as loose, not intentional.
7. Any new elevation is read from bone translucency tiers and grain; any new focus state uses the 2px flush ring. Never add a `box-shadow`.
8. Any new accent fill uses `{colors.ember}` and is limited to the ticket button. Every other accent is type or atmospheric bloom.
9. If a surface needs to feel warmer, push the ember bloom hotter or higher; if cooler, raise the olive bloom. Keep the type rules intact (bone display, ash captions).
10. Motion respects `prefers-reduced-motion` — the gradient drift and hover lift disable; grain, mesh, and gradient stay (they are not animated).

## Known Gaps

- **Archivo and DM Mono are Google Fonts** loaded via preconnect + `<link>`. The system has no fallback beyond `sans-serif` / `monospace` — in environments where Google Fonts fail (offline, restricted networks), the aesthetic falls back to system defaults; a system Arial Bold Italic is a closer stand-in for the marquee than most defaults, but DM Mono’s telemetry voice is lost.
- **The system leans on a single family.** Display and body are both Archivo, separated only by weight and italic; there is no contrasting display face, so the marquee’s distinctiveness rests on weight, the italic, scale, and the flush tint rather than on a second typeface.
- **The mesh is procedurally generated from a seeded RNG, not editable path data.** The grain is an inline SVG `feTurbulence` data-URI; the mesh is built at render time by a small seeded RNG (mulberry32) that draws the canopy, chains, rings, squares, fishnet, and vortex sized to each container, and re-runs on resize. This makes each surface reproducible and resolution-independent, but adjusting its density or composition means editing the generator's parameters in script — there is no per-path token or hand-editable SVG, and no raster fallback if the script does not run.
- **The thermal gradient is hardcoded radial stops.** Adjusting the heat (hotspot position, olive bloom strength) means editing the gradient stops directly; there is no tokenized "temperature" control beyond the named variants in `gradients`.
- **Contrast is tight on the dark ground.** `{colors.ash}` and `{colors.ember}` both sit near the lower bound of comfortable contrast at small sizes — the system reserves them for captions and large display respectively. A high-contrast accessibility mode would require lifting body text fully to `{colors.bone}` and is not provided.
- **The twin-flame logo is a single fixed SVG.** It has bone and ember variants but no responsive simplification; at very small sizes the two forms can merge visually. Provide a minimum render size of ~24px.
- **No dark/light theme toggle exists.** The system is single-surface (after-dark) by definition — there is no light-ground variant, and the `bone` translucency tiers assume a dark ground throughout.
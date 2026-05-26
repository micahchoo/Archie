# Axis 13 — Internationalization & localization

## Focused question
How do prior-art repos handle UI i18n, RTL, IIIF LanguageMap normalization / language negotiation, and — critically — multi-language annotation content via WADM `Choice` (typed in our model but, per `_FRAMING.md`, never emitted/rendered anywhere — gap E)?

Scope note: **language handling only.** Accessibility (ARIA/keyboard/reduced-motion) is axis 12 — not re-covered here.

## Sources surveyed
- `IIIF/manifesto` — IIIF-Commons model lib; PURE LanguageMap/PropertyValue normalization — **opened**
- `IIIF/mirador` — i18next setup + IIIF language-map display + the one place `Choice` is rendered — **opened**
- `IIIF/cozy-iiif` — `getLabel`/`getStringValue` label normalization helper — **opened**
- `field-studio/i18n/` — react-i18next catalog + RTL document-direction logic — **opened**
- `quire` — publication i18n (11ty plugin + CLI locale service) — **opened (locations only)**
- `IIIF/universalviewer` — UV locale handling — **NOT deep-surveyed** (redundancy guard: i18n slice = mirador; UV's locale story is thin and the language-map slice is already covered by manifesto/mirador).

## Findings by source

### IIIF/manifesto — PURE IIIF LanguageMap → display-string + language negotiation
- **`PropertyValue.getValue(locales, joinWith)`** — `IIIF/manifesto/src/PropertyValue.ts` (getValue body ~`/getValue(/`) — PURE — context: the canonical `{ "en": [...] }` → display-string reducer. Returns first matching value or joins (Mirador passes `"<br/>"`). This is the exact normalization gap-E half-needs.
- **`PropertyValue.getSuitableLocale(locales)`** — `IIIF/manifesto/src/PropertyValue.ts:152` — PURE — context: **language negotiation** per IIIF spec — exact-match pass, then inexact (`Utils.getInexactLocale`, i.e. `en-US`→`en`), else undefined → fall through to no-language values. Lift this verbatim for multi-language body selection.
- **`PropertyValue.parse` (v2+v3 normalizer)** — `IIIF/manifesto/src/PropertyValue.ts:95-145` — PURE — context: ingests every IIIF value shape (array of `{@value,@language}`, bare string, single v2 `@language`/`@value`, v3 `{ locale: [...] }` map), groups by locale, `@none`/`@language: undefined` → `"none"` bucket. Handles both Presentation API versions in one path.
- **`LanguageMap` (deprecated shim)** — `IIIF/manifesto/src/LanguageMap.ts:5-12` — PURE — context: legacy static `getValue`/`getValues` now delegate to `PropertyValue`. **Signal:** don't lift the deprecated class — lift `PropertyValue`.

### IIIF/mirador — i18next UI + IIIF label display + the ONLY real `Choice` render
- **i18next instance + 23 locale catalogs** — `IIIF/mirador/src/i18n.js:1-40` (createInstance from i18next + initReactI18next) — COUPLED(React) — context: per-language `locales/<lang>/translation.json` (ar, fa = RTL present), merged into `resources`. UI-string i18n reference; structure portable, wiring is React.
- **IIIF label display via manifesto `getValue(locale)`** — `IIIF/mirador/src/state/selectors/manifests.js:181,327,386`, `canvases.js:190`, `MiradorCanvas.js:212-214` — COUPLED(Redux selectors) — context: every IIIF label/metadata render funnels through manifesto's `getLabel().getValue(locale)`. Confirms manifesto IS the language-map layer; Mirador just wires it to a `locale` from state.
- **RTL via `getThemeDirection`** — `IIIF/mirador/src/state/selectors/config.js:101`; consumed in `CompanionArea.js:14`, `WindowSideBar.js:14`, `SearchPanelNavigation.js:19` — COUPLED(Redux/MUI theme) — context: theme-level `direction` flag drives MUI RTL. (Note: `getSequenceViewingDirection` in `GalleryView.js:15`/`viewer.js` is IIIF canvas *viewingDirection* (right-to-left page order), NOT text RTL — different concern.)
- **`Choice` rendering** — `IIIF/mirador/src/lib/MiradorCanvas.js:71-90` — COUPLED(manifesto Canvas) — context: **this is IMAGE-resource Choice, not multilingual body Choice.** It picks among multiple *image versions* on a canvas (recto/verso/multispectral) — IIIF Presentation `Choice` of painting bodies — marking the first as `preferred`. The inline `TODO` (line 71) admits manifesto gives no Choice support, so Mirador hand-reads `i.__jsonld.body.type === 'Choice'`. Handles both v3 `Choice`/`items` and v2 `oa:Choice`/`default`+`item`. **Does NOT render a `Choice` of `TextualBody` language alternates.** See Gaps.

### IIIF/cozy-iiif — compact PURE label helper
- **`getLabel(data)(locale='en')`** — `IIIF/cozy-iiif/src/core/resource.ts:28-31` — PURE-ish — context: smaller curried LanguageMap→string for any IIIF resource; delegates to `getStringValue(propertyValue, locale)` from **`@iiif/helpers`** (external dep — that's where the actual normalization lives). `getMetadata` (`:33`) maps label/value pairs the same way. Lift if we prefer cozy's tiny surface over manifesto, but note the `@iiif/helpers` dependency carries the real logic.

### field-studio/i18n — react-i18next catalog + PURE RTL switch
- **`RTL_LANGUAGES` + `isRTLLanguage`** — `field-studio/i18n/index.ts:24,39-41` — PURE — context: `['ar','he','fa','ur']` membership test. Tiny, lift-able.
- **`updateDocumentDirection(language)`** — `field-studio/i18n/index.ts:46-51` — PURE — context: sets `document.documentElement.dir = 'rtl'|'ltr'` and `.lang`. The complete RTL application primitive — DOM-only, no framework. Exactly what our Svelte SPA needs at language switch.
- **catalog shape** — `field-studio/i18n/locales/{en,ar,zh}.json`, `SUPPORTED_LANGUAGES` (`:29-33`, with `nativeName`/`isRTL`) — COUPLED(react-i18next) — context: reference for our own UI-string catalog structure + language picker metadata.

### quire — publication-level i18n (not annotation)
- **locale service / 11ty plugin** — `quire/packages/11ty/_plugins/i18n/index.js`, `quire/packages/cli/src/lib/i18n/{localeService,config,index}.js` — COUPLED(11ty/CLI) — context: multi-locale *publication* build (per-locale page output). Build-step concern, not in-browser; low reuse for our PWA but confirms the "multilingual is default" framing.

### papadam — inlang/Paraglide UI message catalog (NOT WADM Choice)
- **Compiled message-catalog i18n** — `papadam/ui/messages/` + `papadam/ui/project.inlang/` — COUPLED(SvelteKit/Paraglide) — real multi-locale UI strings via inlang Paraglide. This is *UI-chrome* localization, NOT content-level WADM `Choice` body language negotiation — manifesto `getSuitableLocale`/`PropertyValue` still owns that. Study only for the SvelteKit i18n build wiring.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| Language negotiation (exact→inexact locale match, `@none` fallback) | `IIIF/manifesto/src/PropertyValue.ts:152` (`getSuitableLocale`) | PURE | `Utils.getInexactLocale` (same lib) | Low — copy method + Utils helper | Select the right `TextualBody`/`Choice` alternate for the consumer's locale |
| LanguageMap → display string | `IIIF/manifesto/src/PropertyValue.ts` `getValue` | PURE | `getValues` (same class) | Low | Render IIIF `label`/`metadata`/body text from `{ "en": [...] }` |
| v2+v3 value normalizer | `IIIF/manifesto/src/PropertyValue.ts:95-145` (`parse`) | PURE | `LocalizedValue.parseV2Value` | Med — pulls in LocalizedValue | Ingest any IIIF manifest's labels regardless of Presentation version |
| Compact label getter | `IIIF/cozy-iiif/src/core/resource.ts:28` (`getLabel`) | PURE-ish | `@iiif/helpers` `getStringValue` (external) | Low (but dep-heavy) | Alternative thin surface if we use cozy already |
| RTL document-direction switch | `field-studio/i18n/index.ts:46-51` (`updateDocumentDirection`) + `:39` (`isRTLLanguage`) | PURE | none (DOM only) | Trivial — copy 8 lines | Set `dir`/`lang` on language change in our SPA |

## Gaps — what NO surveyed repo solves
- **Gap E CONFIRMED — multi-language `Choice` annotation body is rendered NOWHERE.** Our WADM model types `Choice` as the multi-language `TextualBody` mechanism, but no surveyed repo emits *or* renders a `Choice` whose options are language-alternate text bodies. **Mirador's `Choice` rendering (`MiradorCanvas.js:71-90`) is image-version selection only** (recto/verso/multispectral painting resources on a canvas) — same JSON-LD `type: "Choice"`, entirely different semantic use. It marks one image `preferred` and shows it; there is no language-aware option picker, no per-locale body switch, no language-tagged-Choice authoring. The negotiation logic to *drive* such a picker exists (manifesto `getSuitableLocale`) but is never wired to a body `Choice`. We must build the multi-language body `Choice` emit + render ourselves — manifesto's `getSuitableLocale` is the lift-able core to power it; everything around it is greenfield.
- **No serialize-side language-body authoring** anywhere: even Mirador only *reads*. Authoring a `Choice` of language alternates (the editor UX + WADM emit) has zero prior art in this corpus.

## Verdict for our build (lift / study / avoid, and why)
- **LIFT:** `manifesto/PropertyValue` `getSuitableLocale` + `getValue` + `parse` — the PURE, spec-correct language-map normalization and negotiation. This is the single most valuable i18n extractable and directly powers gap-E body selection. Also LIFT field-studio `updateDocumentDirection`/`isRTLLanguage` verbatim (8 lines, no deps) for RTL.
- **STUDY:** Mirador's `MiradorCanvas` Choice block as the *pattern* for hand-reading a `Choice` (`__jsonld` inspection, v2/v3 dual handling, `preferred` flag) — then repurpose it from image-version to language-body selection. Mirador's i18next catalog layout + field-studio's `SUPPORTED_LANGUAGES`/`nativeName` shape as the model for our UI-string catalog + language picker.
- **AVOID:** manifesto's deprecated `LanguageMap` class (use `PropertyValue`); cozy's `getLabel` *only if* we want to dodge the `@iiif/helpers` dep; quire's build-time i18n (wrong execution model for a PWA).
- **Build ourselves (no prior art):** multi-language `TextualBody` `Choice` emit + render + authoring UX. Gap E is real and ours to close.

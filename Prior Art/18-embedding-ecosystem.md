# Axis 18 — Embedding & ecosystem integration

## Focused question
How does a published Exhibit/viewer live *inside* another site — `<web-component>` custom element, oEmbed, iframe contracts, IIIF Content State sharing, CMS/LMS plugins — and which prior-art repo does the named-web-component embed (annomea ADR-0006, ABSENT) well enough to lift?

## Sources surveyed
- `IIIF/clover-iiif` — ships AS a custom element (THE reference) — **y**
- `IIIF/universalviewer` — iframe + embed-script + Content-State URL contract — **y**
- `annomea/EMBED-AUDIT.md` + `anvil/app/src/lib/share-url.ts` — own embed surface + Content-State — **y**
- `juncture` — Vue iframe component (host side) — **y**
- `IIIF/mirador` — config-object mount, no custom element — **y**

## Findings by source

### IIIF/clover-iiif — modern React IIIF viewer that ALSO ships as a web component (the gold)
- **Custom-element registration** — `src/web-components/clover-viewer.tsx:42` — COUPLED(React/Preact) — context: `register(CloverViewerWebComponent, "clover-viewer", ["id","iiif-content"], {shadow:false})`. The exact `<clover-viewer iiif-content="…">` contract annomea ADR-0006 lacks. Entry side-effect: `src/web-components/index.ts:1`.
- **Attribute→prop sync engine** — `src/lib/preact-custom-element/preact-custom-element.js:42-79` — **PURE** — context: for each declared attribute, defines a getter/setter on the element prototype, mirrors DOM attribute ↔ component prop, reflects primitive props back to attributes (`:75`), `observedAttributes` from propNames (`:39`). This is the framework-agnostic core of "attributes drive props." Lift-able regardless of Svelte/React.
- **`iiif-content` attribute = the single embed input** — `clover-viewer.tsx:8,21` — COUPLED(React) — context: one attribute carries a Manifest/Collection URL *or* a Content State blob — same key anvil already uses (`share-url.ts:120`). Convergent contract.
- **Imperative public-API hook** — `clover-viewer.tsx:25-31` (`__registerPublicApi`) — COUPLED — context: gives the host page a handle to call into the mounted instance; the `whenReady`/`ready` event in the register lib (`preact-custom-element.js:17-24`) is **PURE** and lift-able as a mount-lifecycle signal.

### IIIF/universalviewer — iframe-embed + embed-script generator (no top-level custom element)
- **Embed-script builder** — `…/uv-shared-module/BaseExtension.ts:830-852` (`buildEmbedScript`) — COUPLED(UV) — context: formats an iframe template with `{appUri,width,height,title}`; appends viewer state as `#?<hashParams>` (`:840`).
- **iframe template (the actual contract)** — `…/uv-openseadragon-extension/config/config.json:457` — **PURE** (it's a string) — context: `<iframe src="{0}" width="{1}" height="{2}" allowfullscreen frameborder="0" title="{3}"></iframe>`. Lift verbatim for anvil's "Embed this" snippet (annomea EmbedSnippet, ADAPT).
- **App-URI / embed-host resolution** — `BaseExtension.ts:818-828` (`getAppUri`) — COUPLED — context: `embedHost/embedPort/embedPath` (default `/uv.html`) → the standalone iframe entry. anvil's self-contained exhibit HTML is the equivalent target.
- **URL contract: `iiif-content` + `manifest`** — `src/index.html:667-669` via `UV.IIIFURLAdapter` (`:844`) — COUPLED(UV) — context: reads `iiif-content` (Content State) OR `manifest`/`iiifManifestId` from URL; deep-link + OSD `xywh`/AV `t` state in-URL (`:331`). Confirms Content-State-over-URL is the de-facto IIIF deep-link standard.
- **Parent↔iframe comms** — `BaseExtension.ts:133,271` — COUPLED — context: `data.embedded` flag toggles "embedded" CSS; injects a `#commsFrame` iframe for cross-frame messaging. postMessage layer is thin/host-specific — study, don't lift.
- **oEmbed: NOT in source.** grep for `oembed`/`oEmbed` across `src/` + `docs/` = 0 hits. UV's embed story is iframe + embed-script, not an oEmbed endpoint.

### annomea/EMBED-AUDIT.md + anvil/share-url.ts — own embed surface
- **Channel 3 split** — `annomea/EMBED-AUDIT.md:11` — inferred(audit) — context: iframe half DONE-differently (self-contained HTML, `runtime.ts:16-33`); **Web-Component half ABSENT** (0 `customElement` hits). Naming clash: architecture says `<anvil-viewer src= annotations=>`, code shipped `<annotated-image project=/annotations-url=>` (`:11`). clover resolves this: pick ONE element + ONE `iiif-content` attribute.
- **IIIF Content State encode/decode** — `anvil/app/src/lib/share-url.ts:35-82` — **PURE** — context: `encodeContentState`/`decodeContentState` → base64url of a `motivation:highlighting` Annotation; `?iiif-content=` builder (`:120`). Already lossless, zero-coupling, matches clover+UV's attribute. PORT as-is.

### juncture — Vue visual-essay framework (embed HOST, not embeddee)
- **Generic IFrame component** — `components/IFrame.vue:3` — COUPLED(Vue) — context: declarative `<iframe>` wrapper (allowfullscreen/referrerpolicy/src from item props). Models how a *host essay* embeds an external viewer — the consumer side of our contract, not the publisher side. No custom-element output.

### mirador — config-object mount (covered as embeddee only here)
- **`Mirador.viewer(config)` mount** — `src/init.js:6`, `src/index.js:13` — COUPLED(React/Redux) — context: embeds by `new MiradorViewer(config, struct)` into a target `id` — config-driven, NOT a custom element (0 `customElements` hits in `src/`). Heavier mount model than clover; not the web-component reference. (Mirador a11y/i18n covered by axes 12/13.)

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| Attribute↔prop sync + reflect engine | `clover-iiif/src/lib/preact-custom-element/preact-custom-element.js:42-79` | PURE | none (vanilla `HTMLElement` proto + `Object.defineProperty`) | Low — ~40 LOC, drop Preact `render` lines | Core of `<anvil-viewer iiif-content=…>` attribute contract |
| `whenReady`/`ready` mount-lifecycle event | `…/preact-custom-element.js:17-24` | PURE | none | Trivial | Host signal "viewer mounted" |
| IIIF Content-State encode/decode (base64url) | `anvil/app/src/lib/share-url.ts:35-82` | PURE | `btoa`/`atob` | Zero — already ours | Deep-link payload for the `iiif-content` attr |
| iframe embed template string | `universalviewer/…/uv-openseadragon-extension/config/config.json:457` | PURE | none | Zero (copy string) | "Embed this" iframe snippet (EmbedSnippet ADAPT) |
| `iiif-content`-or-`manifest` URL-init pattern | `universalviewer/src/index.html:667-669` | PURE-ish | URLSearchParams | Low | Standardize anvil's single embed input key |

## Gaps — what NO surveyed repo solves
- **oEmbed endpoint.** NEITHER clover, UV, mirador, nor juncture ships an oEmbed provider/`<link rel="alternate" type="application/json+oembed">`. A static GH-Pages exhibit can't serve a dynamic oEmbed JSON without a build-time generated endpoint — **unsolved by any surveyed repo** and the single biggest embed gap.
- **IIIF drag-and-drop / Content-State *drag* sharing** (the IIIF "drag a manifest between viewers" affordance): no repo surveyed implements the drag-source/drop-target; only Content-State *URL* sharing exists.
- **CMS/LMS plugin** (WordPress/Omeka/Canvas): zero plugin code in corpus. The web-component + iframe snippet is the universal substitute (no plugin needed if `<clover-viewer>`-style element exists).

## Verdict for our build (lift / study / avoid)
- **LIFT — clover's `preact-custom-element.js:42-79` attribute↔prop engine** as the vanilla core of the missing `<anvil-viewer>` (ADR-0006). It is the one PURE, framework-agnostic custom-element implementation in the corpus and directly closes annomea's ABSENT Web-Component half. Strip Preact-specific `render`/`hydrate` lines; keep the prototype-defineProperty + observedAttributes + reflect logic.
- **LIFT — UV's iframe template string** (`config.json:457`) verbatim for the EmbedSnippet's iframe option; **LIFT — our own `share-url.ts` Content State** as the `iiif-content` attribute payload.
- **STUDY — clover's single-`iiif-content`-attribute contract** to settle annomea's naming clash: register exactly ONE element, ONE `iiif-content` attribute (URL or Content State), matching the cross-repo de-facto standard (clover + UV converge on it).
- **AVOID — UV's `#commsFrame` postMessage layer and mirador's heavy config-mount**: more coupling than a single-image PWA needs; the web-component + self-contained iframe covers both consumer channels (P1+P2) without them.
- **FLAG (gap, not in scope to solve here):** oEmbed has no prior-art donor — greenfield, and impossible to serve dynamically on a zero-server static host without a build-step generator.

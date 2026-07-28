# Axis 20 — Security & content sanitization

## Focused question
A published Exhibit renders user/third-party annotation bodies + manifest labels = attack surface. How does prior art handle (a) XSS in HTML/markdown `TextualBody`, (b) **SVG injection via `SvgSelector`** (untrusted `<svg>` injected into the DOM — same code path as gap B's geometry corruption), (c) OAuth token handling in a backend-less SPA (GH-Pages push), (d) CORS for cross-origin IIIF?

## Sources surveyed
- `field-studio` — dompurify + isomorphic-dompurify; body + SVG + IIIF-resource sanitizers — **opened**
- `annomea` — hardened DOMPurify config for narrative + annotation bodies — **opened**
- `IIIF/annotorious` — canonical `SvgSelector` → DOM path, the only SVG defense — **opened (SVG.ts full)**
- `decap-cms` — backend-less GitHub OAuth (implicit + PKCE) — **opened (implicit), grep (pkce/netlify)**
- `anvil` — OAuth-push design + sanitizer ADR — **grep + plan docs**
- `IIIF/cozy-iiif`, `IIIF/manifesto` — manifest label/summary HTML — **grep (zero sanitization hits)**

## Findings by source

### field-studio — strongest, multi-layer sanitization at the boundary
- **Plain-text strip** — `field-studio/src/shared/lib/sanitize.ts:15-17` — PURE — context: `DOMPurify.sanitize(v,{ALLOWED_TAGS:[],KEEP_CONTENT:true})` for filenames/CSV/labels. Maps to our IIIF-label + filename hardening.
- **SVG-profile sanitizer** — `sanitize.ts:23-25` — PURE — context: `DOMPurify.sanitize(v,{USE_PROFILES:{svg:true}})` for SVG rendered via `{@html}`. This is a **stronger drop-in over annotorious's hand-rolled defense** — DOMPurify's svg profile is allowlist-based (blocks `<foreignObject>`, event handlers, scripts) vs annotorious only stripping `on*`+`<script>`. Directly the SvgSelector security gate we need.
- **Deep IIIF-resource sanitizer** — `sanitize.ts:54-125` — PURE — context: recursively sanitizes `label`/`summary`/`metadata`/`requiredStatement`/`rights` language maps across the manifest tree. The only repo-side answer to the cozy/manifesto gap below.
- **Body sanitizer in Vault normalization** — `src/entities/manifest/model/vault/normalization.ts:65-76` — PURE(config) — context: sanitizes annotation `TextualBody.value` at the normalization boundary (single choke point). `isomorphic-dompurify` → SSR/test-safe.

### annomea — hardened, config-based DOMPurify (ported from anvil app)
- **`makeSanitizer` config pattern** — `annomea/src/viewer/sanitize.ts:66-68` — PURE — context: returns a closure, NO global `DOMPurify` state mutation (can't bleed narrative config into body config). Always re-runs `stripDangerousDataUris` after — single place pairing the two steps.
- **`stripDangerousDataUris`** — `sanitize.ts:59-61` — PURE — context: post-sanitize regex strips `href="data:text/html…"` (phishing vector) while keeping `data:image/*` for inline base64 media. DOMPurify alone won't do this nuance.
- **Allowlist-shaped URI regex w/ `anvil:` scheme** — `sanitize.ts:12-13` — PURE — context: extends safe schemes with `anvil:` for `anvil://` deep-links (axis 8) while rejecting `javascript:`. Body pipeline keeps `blob`+`data` for resolved media — `src/viewer/markdown.ts:11-12`.
- **markdown body pipeline** — `markdown.ts:92-94` — PURE — context: `snarkdown → swapMediaTags → sanitizeHtml`. `renderPlain` (`:101-108`) entity-escapes titles rather than tag-stripping (robust against DOMPurify empty-allowlist void-element quirks). Regression tests: `markdown.test.ts:23,28` (data:text/html link, `<img onerror>`).

### IIIF/annotorious — the SvgSelector double-risk (corruption AND injection in ONE path)
- **`parseSVGXML`** — `IIIF/annotorious/packages/annotorious/src/model/w3c/svg/SVG.ts:37-50` — COUPLED(annotorious) — context: `DOMParser.parseFromString(value,'image/svg+xml')` then `sanitize()`. This is the SAME path that corrupts Ellipse/Path geometry (gap B). **Line 43 `doc.lookupPrefix(SVG_NAMESPACE)` is literally the lightpanda crash** (`lookupPrefix is not a function`, per `_FRAMING.md` verdict). You cannot fix the geometry without owning this gate, and owning it IS the sanitization gate.
- **`sanitize()` — the ONLY SVG-injection defense, and it has a gap** — `SVG.ts:3-21` — COUPLED → liftable-logic — context: strips attributes starting with `on` + removes `<script>`. **Does NOT block `<foreignObject>`** (can host xhtml-namespace HTML inside SVG → XSS), nor `<use href>` external refs. Weaker than DOMPurify's svg profile. Confirms: the `_FRAMING.md` "pre-parse SVG ourselves" mitigation must route through field-studio's `sanitizeSvg`, not annotorious's `sanitize`.

### decap-cms — backend-less OAuth from a SPA (the GH-Pages-push reference)
- **Implicit grant (token in URL hash)** — `decap-cms/packages/decap-cms-lib-auth/src/implicit-oauth.js:45-69` — PURE — context: reads `access_token` from `location.hash`, then **`clearHash()` so the token never persists in browser history** (`:50-51`); `state` carries a nonce validated on return (`:55-58`) — CSRF defense. Token handed to callback, not stored to localStorage by the lib.
- **PKCE (S256)** — `pkce-oauth.js` — PURE — context: `crypto.subtle.digest('SHA-256',…)` challenge (`:9`), `crypto.getRandomValues` verifier (`:19`), verifier in **`sessionStorage`** not localStorage (`:37,42,46`), `code_challenge_method=S256` (`:119`). The recommended modern flow for a backend-less SPA.
- **Popup `postMessage` origin check** — `netlify-auth.js:44,55` — PURE — context: every `message` handler asserts `e.origin === this.base_url` before trusting/relaying the token — the load-bearing guard for the popup OAuth pattern.

### anvil — design decisions (no code yet for OAuth)
- **OAuth push = v1.x opt-in, zip is universal default** — `anvil/PRD.md:52,55`, `CONTEXT.md:144`, ADR-0018 — inferred design — context: F3 OAuth explicitly OUT OF SCOPE for v1 (`docs/plans/2026-05-22-publish-system-plan.md:16`). So decap-cms is the reference for WHEN it ships, not a v1 need.
- **DOMPurify + `anvil:` allowlist via `addHook('uponSanitizeAttribute')`** — `anvil/docs/plans/2026-05-22-narrative-and-config.md:129,140` — inferred — context: the planned hook approach; annomea's regex approach (above) is the already-built precedent.
- **Editor/Reader sanitization-path divergence (a real bug class)** — `anvil/docs/architecture/subsystems/editor/behavior.md:260-262` — inferred — context: editor preview once called `snarkdown` raw, bypassing the Reader's DOMPurify path → two render paths, one unsafe. Lesson: single sanitization choke point (field-studio's Vault-normalization pattern enforces this).

### cozy-iiif / manifesto — NO manifest-label sanitization (the gap)
- `IIIF/cozy-iiif/src`, `IIIF/manifesto/src` — zero hits for dompurify/sanitize/innerHTML — **inferred (grep)** — context: these parse `label`/`summary`/`metadata` language maps but never sanitize the strings. Manifest-supplied HTML reaches the consumer untouched. Every consumer must wrap — field-studio's `sanitizeIIIFResource` is the only repo that does.

### papadam — strong multi-tier auth (server platform; not the SPA-OAuth story)
- **JWT + two static-secret service-auth classes** — `papadam/api/papadapi/crdt/views.py:35-73` (`CrdtServerTokenAuthentication`); `papadam/api/papadapi/archive/views.py:383-384` (`InternalServiceKeyAuthentication`) — PURE(auth logic) / COUPLED(DRF) — drf-simplejwt (refresh + blacklist) for users; static `CRDT_SERVER_TOKEN` / `X-Internal-Key` for server→server (never-expiring). The CRDT WS verifies JWT + group membership before doc access (`papadam/crdt/src/index.ts:77-99`). decap-cms owns OAuth-from-SPA (the serverless story); papadam owns server-to-server tiering.
- **CAVEATS (anti-patterns):** `ALLOWED_HOSTS=["*"]` (`papadam/api/papadapi/config/common.py:77`); `annotation_text` is a djrichtextfield `RichTextField` HTML body (`annotate/models.py:69`) with no visible bleach/sanitize — the same untrusted-HTML-`TextualBody` XSS surface this axis flags. Security headers (CSP/HSTS) live in Caddy, not app.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| SVG-profile sanitizer (SvgSelector gate) | `field-studio/src/shared/lib/sanitize.ts:23-25` | PURE | dompurify | trivial copy | Harden untrusted `SvgSelector` `<svg>` before DOM inject — replaces annotorious's weak `sanitize()` |
| Deep IIIF-resource sanitizer | `field-studio/.../sanitize.ts:54-125` | PURE | dompurify | low | Sanitize manifest `label`/`summary`/`metadata` (closes cozy/manifesto gap) |
| `makeSanitizer` closure (no global state) | `annomea/src/viewer/sanitize.ts:66-68` | PURE | dompurify | trivial | Per-context body vs narrative sanitizers without config bleed |
| `stripDangerousDataUris` | `annomea/src/viewer/sanitize.ts:59-61` | PURE | none | trivial | Keep `data:image/*`, kill `data:text/html` phishing in bodies |
| Allowlist URI regex (+`anvil:`, +`blob`/`data`) | `annomea/src/viewer/markdown.ts:11-12`, `sanitize.ts:12-13` | PURE | none | trivial | `anvil://` deep-links survive, `javascript:` rejected |
| markdown body pipeline (snarkdown→sanitize) | `annomea/src/viewer/markdown.ts:92-94` | PURE | snarkdown, dompurify | low | `TextualBody` markdown render, hardened |
| `renderPlain` entity-escape | `annomea/src/viewer/markdown.ts:101-108` | PURE | none | trivial | Safe annotation titles (avoids DOMPurify void-element quirk) |
| Implicit OAuth + hash-clear + nonce | `decap-cms/.../implicit-oauth.js:45-69` | PURE | none | low | GH-Pages token never persists in history (v1.x) |
| PKCE S256 (sessionStorage verifier) | `decap-cms/.../pkce-oauth.js:9,19,37,119` | PURE | Web Crypto | low | Modern backend-less GitHub OAuth (v1.x preferred over implicit) |
| Popup `postMessage` origin guard | `decap-cms/.../netlify-auth.js:44,55` | PURE | none | trivial | CSRF/token-theft defense for popup OAuth |

## Gaps — what NO surveyed repo solves
- **A safe non-rect `SvgSelector` parse-AND-sanitize gate in ONE pass.** Annotorious (`SVG.ts:37-50`) is the only SVG→DOM path and it is *both* broken on Ellipse/Path geometry (gap B) *and* a weak XSS filter (no `<foreignObject>`/`<use>` block, the `lookupPrefix` lightpanda crash). field-studio's `sanitizeSvg` hardens injection but is decoupled from the geometry parse. **No repo combines correct Ellipse/Path geometry parsing with a strong SVG sanitizer.** This is the mitigation `_FRAMING.md` recommends but nobody has built — pure greenfield, and it must own both halves.
- **CORS/CSP for cross-origin IIIF.** No surveyed repo ships a documented CSP or a CORS-failure UX for cross-origin Image API tiles / remote manifests. (anvil mentions neither in code; only OAuth.) Closest = nothing — flag as unowned for a static-host exhibit.

## Verdict for our build (lift / study / avoid)
- **LIFT (bodies + manifest):** annomea's `makeSanitizer` + `stripDangerousDataUris` + URI regex, and field-studio's `sanitizeText`/`sanitizeIIIFResource`. Both PURE, both already hardened by the anvil lineage we share. Use field-studio's `isomorphic-dompurify` choice for SSR/test parity.
- **LIFT (SvgSelector injection):** field-studio's `sanitizeSvg` (DOMPurify `USE_PROFILES:{svg:true}`) — strictly stronger than annotorious's `sanitize()`.
- **STUDY, don't trust as-is:** annotorious `SVG.ts` — it is the gap-B corruption site AND a weak filter. Our planned self-parse (`_FRAMING.md`) must replace this branch and route through `sanitizeSvg`.
- **STUDY (defer):** decap-cms OAuth — correct reference for v1.x GH-Pages push (PKCE+S256, sessionStorage, origin-checked postMessage, hash-clear). Not needed for v1 (zip default, F3 out of scope per ADR-0018).
- **AVOID assumption:** cozy-iiif/manifesto do NOT sanitize manifest labels — never render their output via `{@html}` without our own pass.

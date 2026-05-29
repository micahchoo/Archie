# Cross-package contracts — smoke-build wave (2026-05-29)

Locked signatures the parallel owners build against. Studio writes / viewer reads / render
owns the new exports. **Do not deviate** — wave-2 consumers (viewer 7e1f/1489, studio styleOf)
typecheck against these. Decisions: `.interface-design/system.md` §"Design Decisions Pending Build".

Ownership boundary = package tree (disjoint write targets):
- **RENDER** owns `packages/render-core`, `packages/render-mount`, `packages/render-svelte`.
- **VIEWER** owns `apps/viewer`.
- **STUDIO** owns `apps/studio` (main thread).

Sequence: RENDER + VIEWER-dba2 run now → wave-2 (viewer 7e1f/1489 + studio styleOf) after RENDER green.

---

## 7e1f — large-annotation coverage border (RENDER exports → VIEWER consumes)

**render-core** — NEW `packages/render-core/src/geometry/coverage.ts` (sits beside `selector.ts`;
reuses `selectorBBox`). Test-first — `coverage.test.ts` corpus written before impl.

```ts
export const WHOLE_OBJECT_THRESHOLD = 0.75;

// Image: bbox area ÷ (w·h), clamped [0,1]; 0 if selector unparseable or dims ≤ 0.
export function spatialCoverage(selector: W3CSelector, canvasWidth: number, canvasHeight: number): number;

// AV: (end−start) ÷ duration, clamped [0,1]; end undefined ⇒ point marker ⇒ 0.
export function temporalCoverage(start: number, end: number | undefined, duration: number): number;

// override===true forces ON (authored "applies to whole object"); there is NO force-OFF.
export function isWholeObject(coverage: number, override?: boolean): boolean;
```

Test corpus MUST cover: `xywh=pixel:` vs bare `xywh=`, percent units, polygon bbox (not area),
selector that exceeds canvas (clamp to 1), unparseable→0, zero dims→0, AV point marker→0,
AV end>duration (clamp), partial.

**render-core** — authored override read helper, append to `query/published.ts`:
```ts
// JSON-LD annotation property `archie:wholeObject: true` (precedent: archie:reading).
export function wholeObjectFlagOf(a: W3CAnnotation): boolean;   // a["archie:wholeObject"] === true
```

**render-mount** — NEW frame overlay on MountSurface (`surface.ts` type + `mount.ts` impl).
Annotorious is per-shape only, so this is a NEW canvas-wide SVG/CSS overlay over the OSD container,
**image/OSD only** (AV deferred — MediaPlayer is not OSD):
```ts
export interface FrameOverlay { colour: string; onActivate: () => void; }
// Draws a border framing the whole media with 4 corner hit-targets (center unobstructed).
// Clicking any corner → onActivate(). null clears. Re-call replaces.
setFrame(frame: FrameOverlay | null): void;
```

**render-svelte** — `Canvas.svelte` new prop, forwarded like `styleOf`:
```ts
frame?: FrameOverlay | null;   // → if (frame !== undefined) surface.setFrame(frame)
```

**VIEWER (wave-2)**: in `ExhibitView.svelte`, per object compute coverage of the single dominant /
flagged mark (`spatialCoverage` from published selector + canvas dims; or `wholeObjectFlagOf`).
If `isWholeObject` → pass `frame={{ colour, onActivate }}` to `Reader`; the framed mark's own
overlay rect is suppressed (don't double-draw). Colour = reading colour (1489), amber on contrast-fail (0045).

---

## 1489 — marker emphasis + reading colour (RENDER read-helpers; STUDIO write UI; STUDIO+VIEWER apply)

**Colour is reading-driven only** (ADR-0007) — no per-note hue. Per-note styling = **emphasis only**.

**render-core** — append to `query/published.ts` (pure; no render-pkg type dep — keeps core
framework-free per ADR-0002, so multipliers are plain numbers, NOT MarkerStyle):
```ts
export type Emphasis = "muted" | "normal" | "strong";
// JSON-LD annotation property `archie:emphasis`; absent ⇒ "normal".
export function emphasisOf(a: W3CAnnotation): Emphasis;
// Multipliers applied to fillOpacity/strokeOpacity (opacityMul) + strokeWidth (strokeWidthMul).
// normal {1,1} · strong {1.4,1.5} · muted {0.5,0.75}  (tunable; clamp opacity ≤ 1 at call site)
export function emphasisModifiers(e: Emphasis): { opacityMul: number; strokeWidthMul: number };
```
Tests: `emphasisOf` default + each value; `emphasisModifiers` each case.

**STUDIO + VIEWER apply** (each in its own `styleOf`/`readingStyleOf`): take the base
reading-coloured `MarkerStyle`, multiply `fillOpacity`/`strokeOpacity` by `opacityMul` (clamp ≤1)
and `strokeWidth` by `strokeWidthMul`. **Base (reading-less) notes keep the existing neutral
forest-green default** — only emphasis modulates, never hue.

**STUDIO write UI** (main thread): (a) emphasis control in the note popover/editor → writes
`archie:emphasis`; (b) reading-colour picker — `App.svelte:658` currently auto-cycles
`palette[i % palette.length]`; add an optional swatch picker on reading create/edit, palette as default.

---

## dba2 — viewer top bar (VIEWER only, no cross-package contract)

One thin three-zone persistent bar owned by `ViewerShell` (ADR-0008 one shell):
- **left** = breadcrumb / "Back to Exhibit" (today: ViewerShell `.crumbs` 119–126 + Reader `.back` 100/104)
- **center** = object carousel `‹ prev · i/n · next ›` — **lifted OUT of `Reader.svelte` 76–91** (where it
  floats top-center over the canvas, matching `.popup`/`.legend`) into the bar.
- **right** = "Open another library" (ViewerShell `.open-another` 116; quiet chrome, Empty Hall note).

State lift: `selectedObjectId` lives in `ExhibitView` (line 24); the carousel needs `siblings` +
`currentId` + `onnavigate`. Lift the carousel into ViewerShell by passing object-nav state up from
ExhibitView (or render the bar in ExhibitView's tree but styled as the persistent top bar — pick the
seam with the least state churn; ViewerShell owns route/gallery, ExhibitView owns object-within-exhibit).
Carousel must NOT occlude the canvas top-center anymore. Reuses existing `onnavigate`/`onback` callbacks.

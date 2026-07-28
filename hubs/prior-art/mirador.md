---
updated: 2026-07-27
---
# mirador
> *Does mirador dock its canvas chrome — and is the answer the same for panels and canvas controls?*

Source: `ledgers/PRIORART-chrome-placement-2026-07-26.md`, `docs/adr/0007-readings-as-annotationpages.md`.

## Verified claims (line-cited)
- **Panels dock**, via a real flex tree: `Window.jsx:96-131` (`ContentRow`/`ContentColumn`),
  `PrimaryWindow.jsx:106-115` (`WindowSideBar` + `CompanionArea` as flex siblings of the viewer).
  Sidebar is a MUI `Drawer variant="persistent"` forced `position: relative !important`
  (`WindowSideBar.jsx:13-16,26-35`) — the `!important` exists specifically to escape MUI's default
  fixed positioning.
- **The canvas's OWN control bar overlays**: zoom/nav/label is
  `position:absolute; bottom:0; width:100%; zIndex:50` at 50% alpha
  (`WindowCanvasNavigationControls.jsx:18-31`), rendered as a child of the OSD viewer section
  (`OpenSeadragonViewer.jsx:18-22`) — the alpha exists so the image shows through.
- Visibility traced past the default param to the real wiring:
  `visible: getWorkspace(state).focusedWindowId === windowId`
  (`containers/WindowCanvasNavigationControls.js:8-11`); `showZoomControls` resolves to
  `settings.js:534 showZoomControls: true`.
- Mirador's own default OPEN state is a bare canvas: `thumbnailNavigation.defaultPosition: 'off'`
  (`settings.js:521`), `window.sideBarOpen: false` (`settings.js:483`).
- ADR-0007: pure IIIF viewers (Mirador) get real toggleable Readings "for free" via the reserved
  `W3CAnnotationPage.partOf` hook.

## Stated absences
- None recorded beyond the split verdict itself.

## What citations of it may NOT support
- "Mirador docks its chrome" as one unqualified sentence — the verdict is **SPLIT**: structural
  panels dock, the canvas's own control bar overlays. Citing one half as if it covers the whole
  component tree misrepresents the system.

---
updated: 2026-07-27
---
# clover-iiif
> *Does clover dock its canvas chrome, and does it have anything like Archie's NoteMedia?*

clover-iiif (Samvera) is a React IIIF viewer, cited both for chrome placement (ADR-0019) and for
whether it has a note-attached-media feature. Two of the three citations below were wrong as first
written and corrected on re-read. Sources: `.claude/rules/prior-art-citation-discipline.md`,
`ledgers/REVIEW-canvas-chrome-dock-2026-07-26.md`.

## Verified claims (line-cited)
- `Item.tsx:182-184` — sets `imageUri` from the annotation **body's own id**.
- `Image.tsx:16-19` — a clickable captioned tile — structurally Archie's own `NoteMedia`.
- `Viewer.tsx:180-184` — `<ViewerHeader>` and `<ViewerContent>` render as flex-column siblings (this
  part of the ADR's claim survives).
- `Header.styled.ts:59` (the one under `src/components/Viewer/Viewer/…`) —
  `backgroundColor: "transparent !important"`.
- `Viewer.styled.tsx:41` — `PanelToggle` is an opaque plate over the canvas.
- Inside `Main` (`Viewer.styled.tsx:15-22`, used only at `Content.tsx:128-163`): `<Painting>` and
  `<MediaWrapper>` are flow siblings in a column — clover docks its item strip **below** the canvas.

## Stated absences
- None — every claim above resolved to a presence, once traced to the real usage site.

## What citations of it may NOT support
- "clover-iiif tabulates it at `:78-89`" is **false** — that range is a bullet list, not a table
  ([[prior-art-citation-discipline]]).
- "clover has no note-media feature" is **false** — see `Item.tsx`/`Image.tsx` above.
- ADR-0019's claim that `Main` (`Viewer.styled.tsx:15-22`) "makes the header and content column
  siblings" is **wrong** — `Main` is the header's *sibling's interior*, used only inside
  `ViewerContent`. The actual sibling-maker is `Wrapper` (`Viewer.styled.tsx:125-127`, `:138-141`).
- There are **two** `Header.styled.ts` files in this repo (the other at
  `src/components/Slider/Header/`) — always disambiguate the path before citing.
- **Correction (verified 2026-07-28): the clone IS present.** A same-day edit to this page claimed
  "no local clone... not present anywhere under `/mnt/Ghar/2TA/DevStuff/Annotators/Image/`." That is
  false — `IIIF/clover-iiif/` exists (516 files, `ls -la` dated May 24), including
  `src/components/Viewer/Viewer/Viewer.tsx`, the exact file this page already cites at `:180-184`.
  Don't trust a "no local clone" claim without running `ls`/`find` yourself — this one didn't.

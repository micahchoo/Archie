# Showroom exhibit — assembly manifest

The "Archie annotates Archie" showroom. 21 Objects (screenshots), 4 readings (feature
tracks), a narrative tour spine. Annotations live in `csv/<code>.csv`, one file per Object,
imported via Studio's CSV bulk-import (`apps/studio/src/csv-import.ts`). All notes are
**coordinate-free** (blank x/y/w/h → pending) — boxes drawn in Studio with "Set area".

Plan + inventory: [`../plans/SHOWROOM-EXHIBIT-PLAN.md`](../plans/SHOWROOM-EXHIBIT-PLAN.md).

## Readings (create these FIRST — CSV `reading` column references the name)

| name | colour | track |
|---|---|---|
| `studio` | `#d98a2b` (amber) | Authoring features (curator-facing) |
| `viewer` | `#2bb0a6` (teal) | Reading features (visitor-facing) |
| `embed` | `#7c5cff` (violet) | Web-embed + mount/tile internals |
| `power` | `#e0567a` (rose) | Keyboard / advanced / invisible-behavior callouts |

## Objects (label → source screenshot → CSV)

The `object` column in each CSV matches the **label** (case-insensitive). The canonical asset
for each object is `screenshots/<csv-stem>.png` (e.g. `screenshots/s1-library.png` pairs with
`csv/s1-library.csv`) — a self-contained snapshot. The `source` column below is the harness
origin in `../screenshots/auto/<source>.desktop.png`; `(new)` = harness flow added this session.
Refresh the snapshot after a fresh harness run with `bash sync-screenshots.sh`.

### Act 1 — Studio
| label | source | CSV |
|---|---|---|
| `S1 · Library & save status` | studio-library | `csv/s1-library.csv` |
| `S2 · Exhibit overview` | studio-overview | `csv/s2-overview.csv` |
| `S3 · Image canvas & note editor` | studio-editor-image | `csv/s3-canvas.csv` |
| `S4 · Readings rail & editor` | studio-readings (new) | `csv/s4-readings.csv` |
| `S5 · Narrative composer` | studio-narrative (new) | `csv/s5-narrative.csv` |
| `S6a · Audio annotation` | studio-editor-av | `csv/s6a-audio.csv` |
| `S6b · Video frame annotation` | studio-editor-video (new) | `csv/s6b-video.csv` |
| `S7 · Map layer` | studio-map (new) | `csv/s7-map.csv` |
| `S8 · Cite palette (Cmd-K)` | studio-cite (new) | `csv/s8-cite.csv` |
| `S9 · Exhibit metadata & rights` | studio-meta (new) | `csv/s9-meta.csv` |
| `S10 · Ingest & IIIF import` | studio-ingest (new) | `csv/s10-ingest.csv` |
| `S11 · Publish dialog` | studio-publish (new) | `csv/s11-publish.csv` |
| `S12 · Keyboard shortcuts` | studio-shortcuts (new) | `csv/s12-shortcuts.csv` |

### Act 2 — Viewer
| label | source | CSV |
|---|---|---|
| `V1 · Gallery` | viewer-home | `csv/v1-gallery.csv` |
| `V2 · Reader & sidebar` | viewer-voynich | `csv/v2-reader.csv` |
| `V3 · Narrative reader` | viewer-narrative (new) | `csv/v3-narrative.csv` |
| `V4 · AV & transcript` | viewer-av | `csv/v4-av.csv` |
| `V5 · Search finder` | viewer-search (new) | `csv/v5-search.csv` |
| `V6 · Note media lightbox` | viewer-lightbox (new) | `csv/v6-lightbox.csv` |
| `V7 · Reading sheet, legend & cites` | viewer-sheet (new) | `csv/v7-sheet.csv` |

### Act 3 — Embed
| label | source | CSV |
|---|---|---|
| `E1 · Embedded viewer` | embed-host (new) | `csv/e1-embed.csv` |

## Narrative tour (sections — the guided spine)

Each section frames one Object with prose. Ordered as a walkthrough: what Archie is → author
in Studio → read in Viewer → embed anywhere.

1. **What is Archie?** → S1 — "Archie turns images into annotated exhibits…"
2. **Arrange your objects** → S2
3. **Annotate an image** → S3
4. **Competing readings** → S4
5. **Tell a story** → S5
6. **Annotate sound & video** → S6a
7. **(continued)** → S6b
8. **Put it on a map** → S7
9. **Cite across the library** → S8
10. **Title, credit, license** → S9
11. **Bring in media** → S10
12. **Publish it** → S11
13. **Keyboard-first** → S12
14. **Browse exhibits** → V1
15. **Read an image** → V2
16. **Follow a narrative** → V3
17. **Listen along** → V4
18. **Find anything** → V5
19. **See note media full-screen** → V6
20. **Read deeply** → V7
21. **Embed it anywhere** → E1

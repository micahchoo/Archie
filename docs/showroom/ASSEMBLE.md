# Assembling the showroom exhibit

All inputs are ready: 21 screenshots in `../screenshots/auto/`, 21 verified CSVs in `csv/`,
the manifest in `exhibit.md`. This is the human-in-Studio session that turns them into a
published exhibit. Coordinate-free was chosen on purpose — you draw the boxes, which demos
"Set area" alongside the CSV import.

## 0. Decide where the exhibit lives
- **Hand-built (recommended for a one-off):** ingest the 21 PNGs in Studio, build by hand.
- **Seed fixture (if it should ship in the repo as a permanent demo):** add a `showroom.ts`
  fixture like `apps/viewer/fixtures/sampler.ts` (21 objects → the PNG paths), wired into
  seed-data the same way. Additive only; keep tests green (see HANDOFF for the sampler pattern).

## 1. Create the exhibit + ingest screenshots
New exhibit → title "Archie, annotated" (or your pick). Ingest the 21 PNGs from
`screenshots/` (named `s1-library.png` … `e1-embed.png`, paired 1:1 with `csv/`) as objects, in
the `exhibit.md` order (S1…E1). Set each object's **label to match the CSV's `object` column exactly**
(case-insensitive) — that's how the import targets the right screenshot. Labels are listed in
`exhibit.md` → "Objects".

## 2. Create the 4 readings FIRST (before import)
The CSV `reading` column references these by name — they must exist or rows skip. From
`exhibit.md`:

| name | colour |
|---|---|
| `studio` | `#d98a2b` |
| `viewer` | `#2bb0a6` |
| `embed`  | `#7c5cff` |
| `power`  | `#e0567a` |

## 3. Import the CSVs (one per object)
The `object` column is intentionally **blank** in every CSV, so each row lands on whichever
object is **open in the editor**. Therefore: open object `<code>`, run CSV import with its
matching `csv/<code>.csv` (the filenames pair 1:1 with `screenshots/<code>.png`), then move to
the next. Do NOT bulk-import all CSVs at once — that would pile all 87 notes onto one object.

Every row imports as a **pending note** (blank x/y/w/h) — text/tags/reading arrive, region waits.
The importer reports "N notes need placement". (The extra `_showoff` column is ignored by the
importer — it's your per-row hint for what to box and what extra feature to surface.)

## 4. Draw the pending regions ("Set area")
Each pending note sits in the placement tray. Draw its box over the UI element the comment
describes (the `_showoff` column says which region). This is the bulk of the manual work —
~87 boxes across 21 screenshots.

Draw-by-hand extras CSV can't carry (see `SHOWROOM-NOTES.md`):
- whole-object notes (S3, V2), emphasis (S3), geo extent (S7), AV markers (S6a/S6b).

## 5. Wire the narrative tour
Add the 21 sections from `exhibit.md` → "Narrative tour", each framing its object with the
prose hook. Optionally cross-cite sections (S3→S4, V2→V7, S8→V7) to demo live cites.

## 6. Metadata + publish
Set title / summary / attribution / license (the summary is a good place to tell the dogfood
story from `SHOWROOM-NOTES.md`). Then publish — the showroom becomes a live demo of itself, and
can be embedded via `<archie-viewer>` on the project landing page.

## Verification already done
`node --experimental-strip-types verify.mjs` → 87 rows → 87 pending, 0 skipped, all
object/reading references resolve. Re-run it any time you edit a CSV.

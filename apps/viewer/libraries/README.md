# apps/viewer/libraries/ — the drop folder

Commit a published `.archie.zip` export here and the build bakes it into the viewer's
published tree (`apps/viewer/public/published/`) in place of the bundled sample-data.

## How it works

- The build (`predev` / `prebuild`, or `pnpm --filter @archie/viewer gen`) bakes the
  **most recent** `*.archie.zip` in this folder — newest file-modification time wins, with
  the **filename (descending)** as the tiebreak. The chosen file is logged.
- Empty / absent folder → the build falls back to the bundled sample-data.
- Override explicitly with `pnpm --filter @archie/viewer gen --from <path-to.zip>`.

## Reproducible deploys

Git does **not** preserve modification times, so on a fresh clone / CI every committed zip
looks equally recent and only the **filename tiebreak** decides. For a deploy that always
bakes the library you intend, **commit a single zip** here (drop the new one, delete the old).

## Where the zip comes from

Studio → Publish & Share → save the project `.archie.zip`. The export is named after the
library title, so the file lands here with a meaningful name.

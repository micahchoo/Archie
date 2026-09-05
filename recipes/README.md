# Embed recipes

These examples put a read-only Archie library on a web page.
[EMBED.md](EMBED.md) owns the installation instructions, attributes, target routes, offline behavior, and iframe reference.

## Choose an example

| File | Use |
|---|---|
| [try.html](try.html) | Open the current local build against the generated sample library. |
| [example.html](example.html) | Start from a complete page with an object target. |
| [01-github-pages.html](01-github-pages.html) | Open a published tree from GitHub Pages. |
| [02-self-host-zip.html](02-self-host-zip.html) | Open a hosted `.archie.zip`. |
| [03-local-drop.html](03-local-drop.html) | Let the visitor choose or drop a local `.archie.zip`. |
| [04-deep-link.html](04-deep-link.html) | Open an object or note through `target`. |
| [05-offline.html](05-offline.html) | Open a local archive with the `offline` attribute. |
| [06-wordpress.md](06-wordpress.md) | Use a Custom HTML block or an iframe. |
| [07-ghost.md](07-ghost.md) | Use an HTML card or an iframe. |
| [08-multiple-on-one-page.html](08-multiple-on-one-page.html) | Put two independent viewers on one page. |
| [09-autogrow.html](09-autogrow.html) | Resize an iframe from its content height with the local build. |

The numbered examples `01`–`08` and `example.html` use the pinned `v1.1` CDN bundle.
`try.html` and `09-autogrow.html` use the local root `dist/` bundle.
Current source behavior does not establish which fixes the pinned release contains.

Before reuse, replace the sample library URLs, exhibit slugs, and object or note identifiers.
The `yourmuseum.org` URLs and `n3` note identifier are placeholders.
A missing note target opens the exhibit grid, so a visible page does not prove that the note resolved.

## Run the current build locally

Run these commands from the repository root after you install the workspace dependencies:

```bash
pnpm --filter @archie/viewer run gen
pnpm --filter @render/archie-viewer build
node scripts/sync-dist.mjs
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://localhost:8000/recipes/try.html>.
For the iframe example, open <http://localhost:8000/recipes/09-autogrow.html>.

The generator creates the sample library under `apps/viewer/public/published/`.
The build creates the package bundle.
The sync step copies that bundle and its chunks into root `dist/`, which the local recipes load.
A package build alone leaves the local recipe on the previous root bundle.

The page serves the runtime and library from the same origin.
Sample covers, thumbnails, and media can still request external servers.
For a library with bundled media, use the [offline local-drop example](EMBED.md#offline).
Adding `offline` to `try.html` blocks its URL-based library load in the current build.

## Run the browser checks

After the generation, build, and sync steps, run:

```bash
node recipes/smoke.mjs
```

The script starts its own server and drives the built embed in Playwright Chromium.
It requires the workspace dependencies and the Playwright Chromium browser.
The script checks gallery navigation, reader interactions, and the contracts in [reader-contracts.mjs](reader-contracts.mjs).
The [script header](smoke.mjs) records preconditions and a known timing flake.
If a run fails, retain its failure details before another run.

[TESTING.md](TESTING.md) provides the manual walkthrough and expected results for local variants.

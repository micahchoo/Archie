# Test the embed locally

The local recipes exercise the current build against a generated sample library.
The runtime and library use the same origin.
External covers, thumbnails, and media can still require network access.
[EMBED.md](EMBED.md) owns the attribute, target, offline, and iframe reference.

## Prepare the files

Run the generation, build, and sync commands in [the recipe index](README.md#run-the-current-build-locally).
These steps require the installed workspace dependencies.
The local pages load root `dist/`, so a package build alone is insufficient.

## Open the page

From the repository root, start the local server:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://localhost:8000/recipes/try.html>.

1. Check that the gallery shows exhibit cards.
2. Open an exhibit card.
3. Check that its object grid appears.
4. Open an image object.
5. Check that its reader opens.
6. Open a note marker.
7. Check that its note appears.

The available exhibits depend on the generated fixture.
Remote media failures can prevent a sample image from loading.
A visible gallery alone does not prove that object or note navigation works.

## Exercise the variants

The commented examples in [try.html](try.html) provide object, note, offline, and local-drop variants.
Replace the active element with one variant at a time.

| Variant | Current expected behavior |
|---|---|
| `target="#/voynich/o/o1"` | Opens sample object `o1`. |
| `target="#/voynich/a/0000000001SEBWXFTSHHP00TVY"` | Opens the matching note in the generated Voynich fixture. |
| Unknown note identifier | Opens the exhibit grid. This fallback is not a successful note arrival. |
| `offline` with the local tree URL | Blocks the URL-based library load and shows an error. Same-origin URLs are also subject to the offline policy. |
| No `src` | Shows the file picker and drop screen. |
| No `src`, with `offline` | Opens a chosen archive and permits its bundled media. External media remains unavailable. |

The generated Voynich manifest carries `archie:logicalId` for the note in this example.
A different archive or fixture can use different identifiers.

For the offline variant, choose a `.archie.zip` that includes its media.
Do not treat a tree served from localhost as an offline archive.
The runtime and imported chunks also need local availability for disconnected use.

For automatic iframe height changes, open <http://localhost:8000/recipes/09-autogrow.html>.
Navigate between the gallery and an exhibit grid.
Check that the iframe height follows the content.
The reader retains the current iframe height.

## Run the automated browser checks

After the generation, build, and sync steps, run:

```bash
node recipes/smoke.mjs
```

The script starts its own server and drives the built embed with Playwright Chromium.
It requires the workspace dependencies and the Playwright Chromium browser.
The checks cover gallery navigation, note interaction, narrative navigation, media, and required assertion coverage.
The script also runs [reader-contracts.mjs](reader-contracts.mjs) for Reading arrival, offline resources, and pending reader navigation.
Those contract checks serve the package bundle directly.
Both the root bundle and package bundle must match the current source for the full run.

Read the failure details and final result.
If a run fails, retain its failure details before another run.
The [smoke script header](smoke.mjs) records a known timing flake and the fixture and root-bundle preconditions.
A passing local run does not establish cross-browser behavior or CDN release behavior.

## Check a pinned release separately

The CDN examples use `v1.1`, while the local pages use the current build.
For a CDN comparison, use the release script from [EMBED.md](EMBED.md#install).
That section owns the optional SRI hash and its verification scope.
A current build must not reuse the hash for the pinned release.

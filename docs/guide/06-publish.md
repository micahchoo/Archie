# Publish

Publishing projects your **whole library** — every exhibit — into a static site.
This closes the loop: what you authored in the Studio becomes the public Viewer.

The published site opens on a gallery of your exhibits:

![The published Viewer: a gallery listing every exhibit](../screenshots/auto/viewer-home.desktop.png)

…and each exhibit becomes its own page — the same Bidar map and field recording
you annotated, now live for visitors:

![A published exhibit page: the Bidar map](../screenshots/auto/viewer-bidar.desktop.png)

You have two destinations, both from the **Publish…** menu:

- **Locally** — preview the published site on your machine before sharing it.
- **To GitHub Pages** — choose **Connect to GitHub**, enter your repo owner and
  name, a branch (defaults to `gh-pages`), and a fine-grained access token with
  `contents: write` scope. Archie pushes the library's data tree via the GitHub
  Contents API; the token is used once and never stored. Then point your repo's
  **Settings → Pages** at the `gh-pages` branch.

Your site goes live at `https://<owner>.github.io/<repo>/` — plain files,
standards on disk ([W3C Web Annotation](https://www.w3.org/TR/annotation-model/)
notes, [IIIF Presentation 3](https://iiif.io/api/presentation/3.0/) manifests),
readable by other IIIF tools and yours to keep.

← Back to the [guide index](README.md)

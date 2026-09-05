# Publish

Publishing writes your library as a static site. The output includes the exhibit
data, static pages, and an interactive reader. Visitors can browse the exhibits
without an application server.

## Publish a site

1. Open **Publish**.
2. Choose where the library will live.
3. If Archie asks for media quality, choose the quality for this destination.
4. Complete the steps for that destination.

Archie remembers the destination for later updates. **Preview as reader** opens
a preview from the publish surface.

A folder destination writes a site to a folder that you choose. Folder access
depends on the browser or desktop app. A static web host can serve that folder.

Desktop Studio offers GitHub sign-in with a device code. **Continue with GitHub**
starts the flow. Archie uses the OS keyring to retain the token for later visits.
If the keyring is unavailable, Archie reports that it cannot keep you signed in.
**Sign out** clears the stored credential.

The desktop flow uploads the site and attempts to enable GitHub Pages. If GitHub needs manual setup, Archie shows the remaining
steps and the site address.

Browser Studio offers an advanced **I already use GitHub** path. This form takes
a repository owner, repository name, branch, and personal access token. The default
branch is `gh-pages`. The token stays in memory for the attempt and clears after
completion, failure, or dismissal.

## Export a copy

1. Open **Publish**.
2. Select **Export a copy**.
3. Choose the copy that fits your task.

- **A working copy** produces a `.archie.zip` for backup, exchange, or later editing in Studio.
- **One `.html` file** includes a reader for direct opening, subject to the size limit in the dialog.
- **A folder with the reader built in** produces a site for static hosting.
- **A deposit copy** includes checksums in a BagIt archive layout.

Export keeps the remembered publish destination. Local assets travel with the
appropriate copy. Remote media still depends on its source. The Viewer can open
a working copy, but the archive alone does not contain the Viewer application.

## Credit the sources

Library, exhibit, and object details can include attribution and license
information. Published output carries these credits with the material.

The [delivery capabilities](../CAPABILITIES.md) describe storage, offline access,
and export limits.

← Back to the [guide index](README.md)

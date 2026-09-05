# Embed reference

`<archie-viewer>` opens an Archie library in a read-only Web Component.
One module script registers the element for the page.
Each element owns its library and navigation state.

This reference describes the source at `7661ec5a` (2026-09-05).
The CDN example uses the separate, pinned `v1.1` release.
Current source behavior does not establish which fixes that release contains.
[The recipe index](README.md) provides the current build procedure and runnable examples.

## Install

Add the module script once per page:

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js"
  crossorigin="anonymous"></script>

<archie-viewer
  src="https://micahchoo.github.io/Archie/viewer/published/"
  style="display:block;height:600px"></archie-viewer>
```

Replace the sample `src` with your published-tree base URL or hosted `.archie.zip` URL.

The script URL pins the `v1.1` git tag.
Subresource Integrity (SRI) is optional in these examples.
The script shown here has no `integrity` attribute.

For SRI, add this attribute to that script:

```html
integrity="sha384-2kT6KuVJkm08Btoug0L+OxGYjUhlH7ro/4VY4nLSB9Ysc0youBLptzrp7A4UevNl"
```

Keep `crossorigin="anonymous"` with cross-origin SRI.

This SHA-384 matches `dist/archie-viewer.js` from the local `v1.1` git tag.
The documentation check did not fetch the CDN response.
The hash applies to the entry file, not its imported chunks or library data.
A current build has different bytes and needs its own hash.

For a self-hosted build, deploy all files from `packages/archie-viewer/dist/` together.
When a reader opens, the entry module imports adjacent chunks.
The [local procedure](README.md#run-the-current-build-locally) copies those files into root `dist/` for the recipes.

## Attributes

[ADR-0021](../docs/adr/0021-archie-viewer-target-contract.md) established `src`, `target`, and `offline` as the original stable attributes.
It permits additive attributes.
The [current element](../packages/archie-viewer/src/element.ts) observes five attributes:

| Attribute | Current behavior |
|---|---|
| `src` | Opens a hosted `.archie.zip` or a published-tree base URL. An absent value shows the local file picker and drop screen. |
| `target` | Opens a native route within the loaded library. A nonempty value takes precedence over `iiif-content`. |
| `offline` | Restricts resources to embedded bytes. See [Offline](#offline) for library-load and media limits. |
| `show-unlisted` | Includes unlisted exhibits in the gallery. Without it, direct targets can still open those exhibits. |
| `iiif-content` | Accepts an encoded IIIF Content State as an alternative to `target`. |

`offline` and `show-unlisted` are boolean attributes.
Their presence enables them, including values such as `offline="false"`.
To disable them, remove the attribute.

A local file opens without a library download.
After the library opens, external media can still require network requests unless `offline` blocks them.
The loader checks the Archie format marker and reports invalid archives or unsupported versions.
A published-tree base URL identifies the directory that contains `exhibits.json`.

## Targets

Set `target` to the native route hash from a Viewer link.
Use the hash beginning with `#/`, not the full page URL.

| Destination | Route form |
|---|---|
| Exhibit | `#/{slug}` |
| Object | `#/{slug}/o/<objectId>` |
| Note | `#/{slug}/a/<logicalId>` |
| Note with an explicit image region | `#/{slug}/a/<logicalId>?xywh=x,y,w,h` |
| Note with an audio or video time | `#/{slug}/a/<logicalId>?t=12.5` |
| Narrative section | `#/{slug}/s/<sectionId>` |

```html
<archie-viewer
  src="/apps/viewer/public/published/"
  target="#/voynich/o/o1"
  style="display:block;height:600px"></archie-viewer>
```

This example uses the local generated sample tree.
For another library, replace both the source URL and the target identifiers.

The current [target resolver](../packages/archie-viewer/src/target-resolve.ts) matches a note by its annotation ID or published `archie:logicalId`.
It also searches Reading-specific notes and activates the Reading that owns a matching note.
A target can precede the library load, including a local file open.
New navigation cancels pending reader work in the current build.

Missing objects, notes, and sections open the exhibit grid.
A missing exhibit opens the gallery.
An unsupported image region can leave the object view unchanged.
These fallbacks concern unresolved addresses.
A library download failure or unreadable media can still show an error or notice.

## Offline

In the current build, `offline` permits only `blob:` and `data:` resources.
It suppresses remote covers, thumbnails, primary media, and media inside notes.
It also blocks URL-based library loads, including same-origin HTTP URLs and relative paths.
A locally served tree does not become an offline library through this attribute.

Use the local file picker with a `.archie.zip` that includes its media:

```html
<script type="module" src="/dist/archie-viewer.js"></script>
<archie-viewer offline style="display:block;height:600px"></archie-viewer>
```

The visitor chooses or drops the archive into the element.
Bundled assets become local blob URLs.
Media that only references an external server remains unavailable.
Changing `offline` refreshes the resource view in the current build.

The attribute does not cache missing media or control requests from the surrounding page.
The runtime and its module chunks must also be available locally for disconnected use.
The [resource policy](../packages/archie-viewer/src/resource-policy.ts) defines the current restrictions.
The [capability matrix](../docs/CAPABILITIES.md) compares delivery modes and verification limits.

## IIIF Content State

`iiif-content` accepts a base64url-encoded IIIF Content State.
The element resolves its resource IRI against the loaded library.
A nonempty native `target` takes precedence.
Malformed or unmatched Content State values open the gallery.

For an open object with a Canvas IRI, `currentContentState()` returns its encoded Content State.
It returns `null` without an addressable object.
The returned state identifies the whole Canvas, not the live zoom region.

The JavaScript properties `src`, `target`, `offline`, `showUnlisted`, and `iiifContent` reflect the attributes.
The element also exposes `openFile(blob)` and `openLibraryFs(filesystem)` for JavaScript callers.
The latter accepts an Archie filesystem and checks its format marker.
These methods extend the HTML attribute reference.
[The element source](../packages/archie-viewer/src/element.ts) defines their current signatures.

## Iframe fallback

Some CMS configurations remove scripts or custom elements from page content.
If your host permits iframes, host an HTML page that contains the module script and viewer element.
Then embed that page:

```html
<iframe
  src="https://yourmuseum.org/embed-codex.html"
  style="width:100%;height:600px;border:0"
  loading="lazy"
  title="Codex — Archie viewer"></iframe>
```

Replace the iframe URL with your hosted page.
Use a fixed height for a host that cannot run a parent-page script.
Host permissions and framing policies determine whether the iframe can load.

### Auto-grow the iframe to its content

The element posts `archie-embed:height` messages to its parent frame.
For a parent page that permits scripts, add this listener:

```html
<script>
  addEventListener("message", (e) => {
    if (e.data?.type !== "archie-embed:height") return;
    const h = Number(e.data.height);
    if (!Number.isFinite(h) || h < 0 || h > 16000) return;
    for (const f of document.querySelectorAll("iframe")) {
      if (f.contentWindow === e.source) {
        f.style.height = h + "px";
        break;
      }
    }
  });
</script>
```

The listener matches each message to its iframe window and limits the accepted height.
Automatic height changes apply to gallery and exhibit grids.
The reader keeps the current iframe height to avoid a resize loop.
A direct reader link therefore needs a suitable initial height.
[09-autogrow.html](09-autogrow.html) demonstrates this behavior with the local build.

## Hosting requirements

For public deployment, use HTTPS for the page, runtime, library, and media.
An HTTPS page cannot load blocked HTTP resources as mixed content.
Cross-origin library reads require CORS headers from the archive or published-tree server.
Same-origin reads do not require CORS permission.

Configure the host page's Content Security Policy to permit the runtime and the resources your library needs.
An iframe also requires the parent and embedded page to permit that framing arrangement.

# Recipe 06 — WordPress

This recipe embeds an Archie library through a Custom HTML block or an iframe.
Host permissions determine whether scripts, custom elements, and iframes remain in the published page.
The examples use the pinned `v1.1` CDN bundle.
[EMBED.md](EMBED.md) owns the attributes, offline policy, SRI, and hosting requirements.

## Direct element

If your site permits scripts and custom elements, use the Custom HTML block.

1. Add a Custom HTML block to the post.
2. Paste this example into it:

   ```html
   <script
     type="module"
     src="https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js"
     crossorigin="anonymous"></script>

   <!-- replace with your own published-tree base URL if you fork -->
   <archie-viewer
     src="https://micahchoo.github.io/Archie/viewer/published/"
     style="display:block;width:100%;height:600px"></archie-viewer>
   ```

3. Replace the sample library URL with your published-tree or archive URL.
4. Open the post preview.
5. Check that the library appears and its objects open.

The editor view and published page can apply different restrictions.
A blank viewer can also indicate a source, CORS, or Content Security Policy error.

For a local file picker, remove `src`.
For a direct arrival, add a `target` from [the target reference](EMBED.md#targets).
Keep a suitable height for the reader.
For offline reading, use [the local archive instructions](EMBED.md#offline).
Adding `offline` to a hosted-tree example blocks its library URL in the current build.

## Iframe alternative

If your site removes scripts or custom elements but permits iframes, use a hosted wrapper page.

1. Create `embed-codex.html` on your static hosting with this content:

```html
<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;height:100%}archie-viewer{display:block;height:100%}</style>
<script type="module"
  src="https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js"
  crossorigin="anonymous"></script>
<archie-viewer src="https://yourmuseum.org/libraries/codex.archie.zip"></archie-viewer>
```

2. Replace the archive URL with your library URL.
3. Add this iframe to the Custom HTML block:

```html
<iframe src="https://yourmuseum.org/embed-codex.html"
        style="width:100%;height:600px;border:0"
        loading="lazy"
        title="Codex — Archie viewer"></iframe>
```

4. Replace the iframe URL with your hosted wrapper URL.
5. Open the post preview.
6. Check that the library appears inside the frame.

An iframe requires permission from the host and the embedded page's framing policy.
A host that removes iframes cannot use this fallback.

The fixed height works without a script on the parent page.
[Automatic iframe height changes](EMBED.md#auto-grow-the-iframe-to-its-content) require a parent-page script.
The reader retains the current iframe height.

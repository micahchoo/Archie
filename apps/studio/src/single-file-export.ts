// The self-contained export's index.html (archie-linkability Q-3): one file that opens the library in
// any browser with no server, no hosted Archie, and no network.
//
// Everything is INLINE, and that is forced rather than chosen. A file:// page has an opaque origin, so
// `fetch()` of a sibling `.archie.zip` is refused ("blocked by CORS policy … only supported for
// protocol schemes: chrome, data, http, https" — measured in Chromium). The library therefore travels
// as a base64 payload in the document, not as a neighbouring file the page loads.
//
// The bundle is the IIFE build (packages/archie-viewer/dist-single), NOT the shipped ESM one, for the
// same reason at the script level: browsers refuse ES **module** scripts from file://. See
// packages/archie-viewer/build.mjs `buildSingleFile` for the red-green proof of both halves.

/** HTML-escape a value destined for text content or an attribute. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Neutralize `</script` inside inlined JS.
 *
 * The HTML tokenizer ends a `<script>` element at the first `</script` in the raw text — it does NOT
 * understand JS string literals. Minified code that happens to contain that sequence in a string would
 * therefore truncate the document mid-bundle and produce a syntax error nowhere near the cause. `<\/`
 * is the standard escape: identical to `</` for the JS parser, invisible to the HTML tokenizer.
 */
function inlineSafe(js: string): string {
  return js.replace(/<\/script/gi, String.raw`<\/script`);
}

/** Base64-encode bytes in chunks — String.fromCharCode(...bytes) blows the call stack on a real library. */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export interface SingleFileExportInput {
  /** The IIFE viewer bundle's source text (packages/archie-viewer/dist-single). */
  bundle: string;
  /** The library as `.archie.zip` bytes — the portable format the element's openFile already reads. */
  libraryBytes: Uint8Array;
  /** Document title. The library's own title; falls back to a neutral one. */
  title?: string;
}

/**
 * Build the whole export as one HTML string.
 *
 * Ordering matters: the payload `<script>` carries a non-JS `type`, so the browser stores its text
 * without executing it, and it is placed BEFORE the bundle so the boot code can read it synchronously
 * once the element is defined. Base64 contains no `<`, so the payload needs no escaping of its own —
 * only the bundle and the title do.
 */
export function buildSingleFileHtml({ bundle, libraryBytes, title }: SingleFileExportInput): string {
  const docTitle = esc(title?.trim() || "Archie library");
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${docTitle}</title>
<style>
  html, body { margin: 0; height: 100%; background: #f6efe9; }
  archie-viewer { display: block; height: 100vh; }
  .boot-error { font: 16px/1.5 system-ui, sans-serif; color: #8a2f22; padding: 2rem; }
</style>
<archie-viewer offline></archie-viewer>
<script id="archie-library" type="application/vnd.archie.library+base64">${toBase64(libraryBytes)}</script>
<script>${inlineSafe(bundle)}</script>
<script>
(function () {
  var el = document.querySelector("archie-viewer");
  try {
    var b64 = document.getElementById("archie-library").textContent.trim();
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    el.openFile(new Blob([u8]));
  } catch (e) {
    // A boot failure here is silent otherwise — the element would sit on its drop zone as though the
    // reader simply had not been given anything, which reads as "empty library", not "broken file".
    var p = document.createElement("p");
    p.className = "boot-error";
    p.textContent = "This archive couldn't be opened: " + (e && e.message ? e.message : String(e));
    document.body.insertBefore(p, el);
  }
})();
</script>
</html>
`;
}

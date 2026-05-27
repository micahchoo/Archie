// Split a note body's MEDIA (image / audio / video) from its prose — for the Viewer's note media
// strip + lightbox (CONTEXT §"Local view loop"). Note media render as sized-down clickable tiles
// (image thumbnail · audio waveform · video poster) that open a modal carousel of ALL the note's
// media with the prose beside it. Pure: classifies by URL extension across markdown image syntax
// `![](url)`, markdown links `[label](url)`, and inline `<img|audio|video src>`. Non-media links
// (web pages) stay in the prose.

export type NoteMediaKind = "image" | "audio" | "video";
export interface NoteMediaItem { kind: NoteMediaKind; url: string; }
export interface NoteContent {
  /** Media items in (roughly) document order. */
  media: NoteMediaItem[];
  /** The body with media references removed — the note's prose for the strip's text / the modal. */
  text: string;
}

const EXT: Record<NoteMediaKind, RegExp> = {
  image: /\.(?:jpe?g|png|gif|webp|avif|svg|bmp)(?:[?#]|$)/i,
  audio: /\.(?:mp3|wav|m4a|ogg|oga|aac|flac)(?:[?#]|$)/i,
  video: /\.(?:mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i,
};

/** Classify a URL by its file extension; null if it isn't a known media file (e.g. a web page). */
function kindOf(url: string): NoteMediaKind | null {
  if (EXT.image.test(url)) return "image";
  if (EXT.audio.test(url)) return "audio";
  if (EXT.video.test(url)) return "video";
  return null;
}

/** Only safe schemes may become a live media `src` (security S3): http(s)/blob, a TYPED
 *  data:image|audio|video URL, or a relative path. Any other explicit scheme (javascript:, vbscript:,
 *  file:, data:text/html, …) is rejected so a crafted note body can't turn into a live element src.
 *  Rejected URLs stay in the prose (then sanitized by DOMPurify on render) rather than becoming a tile. */
function isSafeMediaUrl(url: string): boolean {
  const u = url.trim();
  if (/^(?:https?:|blob:)/i.test(u)) return true;
  if (/^data:(?:image|audio|video)\//i.test(u)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return false; // any other explicit scheme
  return true; // relative path / fragment / bare filename
}

const HTML_MEDIA = /<(?:img|audio|video|source)\b[^>]*?\ssrc=["']([^"']+)["'][^>]*>/gi;
const MD_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const MD_LINK = /\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

export function splitNoteMedia(markdown: string): NoteContent {
  const src = markdown ?? "";
  const media: NoteMediaItem[] = [];

  // HTML media tags first (they'd otherwise be left as raw text).
  let text = src.replace(HTML_MEDIA, (m, url: string) => {
    const k = kindOf(url);
    if (!k || !isSafeMediaUrl(url)) return m;
    media.push({ kind: k, url });
    return "";
  });
  // Markdown image embeds — media (default to image when the extension is unknown), unless an unsafe scheme.
  text = text.replace(MD_IMAGE, (_m, url: string) => {
    if (!isSafeMediaUrl(url)) return _m;
    media.push({ kind: kindOf(url) ?? "image", url });
    return "";
  });
  // Markdown links — only those pointing at a (safe) media file (others, e.g. web pages, stay as prose).
  text = text.replace(MD_LINK, (m, url: string) => {
    const k = kindOf(url);
    if (!k || !isSafeMediaUrl(url)) return m;
    media.push({ kind: k, url });
    return "";
  });

  return { media, text: text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim() };
}

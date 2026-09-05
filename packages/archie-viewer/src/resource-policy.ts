/** Resource permission is independent of markup sanitization. Offline permits embedded bytes only. */
export class ResourcePolicy {
  constructor(readonly offline = false) {}

  allows(url: string): boolean {
    const value = url.trim();
    if (this.offline) return /^(blob:|data:)/i.test(value);
    const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase();
    return value.length > 0 && (!scheme || ["http", "https", "blob", "data"].includes(scheme));
  }

  /** Filter sanitized prose in an inert template, BEFORE any resource reaches a live DOM sink. */
  html(doc: Document, html: string): DocumentFragment {
    const template = doc.createElement("template");
    template.innerHTML = html;
    if (this.offline) {
      for (const node of template.content.querySelectorAll("*")) {
        if (node.matches("style, link, iframe, object, embed")) { node.remove(); continue; }
        for (const attr of [...node.attributes]) {
          const name = attr.name.toLowerCase();
          if (["style", "srcset", "imagesrcset", "ping", "background"].includes(name) ||
              (["src", "poster", "data", "xlink:href"].includes(name) && !this.allows(attr.value)) ||
              (name === "href" && node.localName !== "a" && !attr.value.startsWith("#") && !this.allows(attr.value))) {
            node.removeAttribute(attr.name);
          }
        }
      }
    }
    return template.content;
  }
}

/** Removing a media node alone does not stop playback or cancel its download. */
export function releaseMedia(host: ParentNode): void {
  for (const image of host.querySelectorAll("img")) {
    image.removeAttribute("src");
    image.removeAttribute("srcset");
  }
  for (const media of host.querySelectorAll<HTMLMediaElement>("audio, video")) {
    media.pause();
    media.removeAttribute("src");
    media.removeAttribute("poster");
    for (const source of media.querySelectorAll("source")) source.removeAttribute("src");
    media.load();
  }
}

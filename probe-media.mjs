// Probe: what does the embed's CURRENT pipeline do with a media-bearing note body?
import { renderMarkdown, splitNoteMedia } from "@render/core";
const body = "The wheels on this sheet are usually read beside the herbal pages that open the book — the same hand, a different subject. That comparison page is held here beside them. ![f1r — the opening herbal leaf, for comparison](https://collections.library.yale.edu/iiif/2/1006076/full/400,/0/default.jpg)";
console.log("=== renderMarkdown (what note-card.ts does TODAY) ===");
console.log(renderMarkdown(body));
console.log("\n=== splitNoteMedia ===");
console.log(JSON.stringify(splitNoteMedia(body), null, 1));

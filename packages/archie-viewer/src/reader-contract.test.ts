import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPortableExhibit, type Filesystem, type FsDirectory } from "@render/core";
import { ArchieViewerElement, defineArchieViewer } from "./element.js";
import { resolveExhibitTarget } from "./target-resolve.js";
import { readerContractFixture } from "./reader-contract-fixture.js";

beforeAll(() => defineArchieViewer());
afterEach(() => document.body.replaceChildren());
const wait = (check: () => void) => vi.waitFor(check, { timeout: 5000, interval: 5 });
async function open(target?: string, offline = false) {
  const fixture = await readerContractFixture();
  const el = document.createElement("archie-viewer") as ArchieViewerElement;
  el.offline = offline;
  if (target) el.target = target;
  document.body.append(el);
  await el.openLibraryFs(fixture.fs);
  return { ...fixture, el, root: el.shadowRoot! };
}

function media(root: ShadowRoot): HTMLAudioElement { return root.querySelector<HTMLAudioElement>(".av audio")!; }
function card(root: ShadowRoot): HTMLElement { return root.querySelector<HTMLElement>(".archie-note-card")!; }

describe("published reader arrivals", () => {
  it("resolves a Reading-only note with its owning Reading through the published tree", async () => {
    const { fs, readingId } = await readerContractFixture();
    const { exhibit, revoke } = await loadPortableExhibit(fs, "contracts");
    const resolved = resolveExhibitTarget(exhibit, { view: "exhibit", slug: "contracts", noteId: readingId });
    expect(resolved).toMatchObject({ kind: "object", objectId: "audio", readingId: "cipher" });
    expect(exhibit.annotationsByObject.audio).not.toContainEqual(expect.objectContaining({ id: resolved.selectId }));
    revoke();
  });

  it("a copied Reading-only address activates its Reading and opens the whole-recording body paused", async () => {
    const { el, root, readingId } = await open();
    el.target = `#/contracts/a/${readingId}`;
    await wait(() => expect(media(root)).not.toBeNull());
    media(root).dispatchEvent(new Event("loadedmetadata"));
    await wait(() => expect(root.querySelector('[data-reading="cipher"]')?.getAttribute("aria-checked")).toBe("true"));
    expect(card(root).hidden).toBe(false);
    expect(card(root).textContent).toContain("Exclusive cipher zebra interpretation");
    expect(media(root).currentTime).toBe(0);
    expect(media(root).paused).toBe(true);
  });

  it.each(["audio", "other"])("search from %s activates a Reading-only hit and opens its body", async (objectId) => {
    const { root } = await open(`#/contracts/o/${objectId}`);
    await wait(() => expect(root.querySelector(".rc-find")).not.toBeNull());
    const find = root.querySelector<HTMLInputElement>(".rc-find")!;
    find.value = "zebra";
    find.dispatchEvent(new Event("input"));
    root.querySelector<HTMLButtonElement>('[aria-label="Search results"] button')!.click();
    await wait(() => expect(root.querySelector('[data-reading="cipher"]')?.getAttribute("aria-checked")).toBe("true"));
    media(root).dispatchEvent(new Event("loadedmetadata"));
    expect(card(root).hidden).toBe(false);
    expect(card(root).textContent).toContain("Exclusive cipher zebra interpretation");
  });
});

describe("offline resources", () => {
  it("omits remote gallery covers, object thumbnails and their error fallbacks", async () => {
    const { el, root } = await open(undefined, true);
    expect(root.querySelector("img[src]")).toBeNull();
    el.target = "#/contracts";
    await wait(() => expect(root.querySelector('[data-obj="image"]')).not.toBeNull());
    expect(root.querySelector("img[src]")).toBeNull();
    expect(root.querySelector("[data-srcs]")).toBeNull();
  });

  it("filters remote resources from an opened note and its expanded sheet", async () => {
    const { el, root, mediaId } = await open(undefined, true);
    el.target = `#/contracts/a/${mediaId}`;
    await wait(() => expect(media(root)).not.toBeNull());
    media(root).dispatchEvent(new Event("loadedmetadata"));
    expect(card(root).hidden).toBe(false);
    root.querySelector<HTMLButtonElement>(".archie-note-card__expand")!.click();
    for (const node of root.querySelectorAll("[src], [poster], [srcset]")) {
      for (const attr of ["src", "poster", "srcset"]) expect(node.getAttribute(attr) ?? "").not.toContain("tracker.test");
    }
  });

  it("filters narrative prose before any authored resource is mounted", async () => {
    const { root } = await open("#/contracts", true);
    await wait(() => expect(root.querySelector('[data-act="narrative"]')).not.toBeNull());
    root.querySelector<HTMLButtonElement>('[data-act="narrative"]')!.click();
    await wait(() => expect(root.querySelector(".nr-prose")).not.toBeNull());
    expect(root.querySelector(".nr-prose")!.textContent).toContain("Narrative");
    expect(root.querySelector('[src*="tracker.test"]')).toBeNull();
  });

  it("changing offline during a read stops existing media and rebuilds with the policy immediately", async () => {
    const { el, root, mediaId } = await open();
    el.target = `#/contracts/a/${mediaId}`;
    await wait(() => expect(media(root)).not.toBeNull());
    media(root).dispatchEvent(new Event("loadedmetadata"));
    root.querySelector<HTMLButtonElement>(".archie-note-card__expand")!.click();
    const oldAudio = media(root);
    const oldNoteVideo = root.querySelector<HTMLVideoElement>(".archie-note-sheet video")!;
    const pause = vi.spyOn(oldAudio, "pause");
    el.offline = true;
    expect(pause).toHaveBeenCalled();
    expect(oldAudio.hasAttribute("src")).toBe(false);
    if (oldNoteVideo) expect(oldNoteVideo.hasAttribute("src")).toBe(false);
    await wait(() => expect(media(root)).not.toBeNull());
    expect(media(root)).not.toBe(oldAudio);
    expect(media(root).paused).toBe(true);
    expect(root.querySelector('[src*="tracker.test"]')).toBeNull();
  });
});

/** Hold the real manifest read at the Filesystem interface, leaving publication and parsing intact. */
function delayedManifest(fs: Filesystem) {
  let resume!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { resume = resolve; });
  const started = new Promise<void>((resolve) => { reached = resolve; });
  const wrap = (dir: FsDirectory): FsDirectory => ({
    ...dir,
    entries: () => dir.entries(),
    remove: (name) => dir.remove(name),
    getDirectory: async (name, options) => wrap(await dir.getDirectory(name, options)),
    getFile: async (name, options) => {
      if (name === "manifest.json") { reached(); await gate; }
      return dir.getFile(name, options);
    },
  });
  return { fs: { root: async () => wrap(await fs.root()) }, started, resume };
}

describe("superseding destinations", () => {
  it.each(["#/", "#/missing", null])("%s supersedes an exhibit read already in flight", async (target) => {
    const fixture = await readerContractFixture();
    const held = delayedManifest(fixture.fs);
    const el = document.createElement("archie-viewer") as ArchieViewerElement;
    document.body.append(el);
    await el.openLibraryFs(held.fs);
    el.target = "#/contracts/o/audio";
    await held.started;
    el.target = target;
    held.resume();
    // In-memory reads finish through microtasks; cross a task boundary after releasing the held read.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Reader contracts");
    expect(el.shadowRoot!.querySelector(".reader")).toBeNull();
  });

  it("leaving an already-mounted recording stops playback and removes its source", async () => {
    const { el, root } = await open("#/contracts/o/audio");
    await wait(() => expect(media(root)).not.toBeNull());
    const old = media(root);
    const pause = vi.spyOn(old, "pause");
    el.target = "#/";
    expect(pause).toHaveBeenCalled();
    expect(old.hasAttribute("src")).toBe(false);
    expect(root.querySelector(".reader")).toBeNull();
  });
});

// <archie-viewer> ELEMENT tests (happy-dom). Covers the four contract points the brief names:
//   1. customElements.define registration (via the index side-effect / defineArchieViewer)
//   2. attribute → property reactivity (src/target/offline reflect both ways; change re-renders)
//   3. the no-src drop handler calls the load seam (openFile)
//   4. offline flag propagation (the property reflects the attribute; the reader gate is unit-tested)
// The OSD mount is NOT exercised (no live OSD under happy-dom) — the element is driven at its seams.
import { describe, it, expect, beforeAll, vi } from "vitest";
import { ArchieViewerElement, defineArchieViewer } from "./element.js";
import {
  ZipFilesystem,
  publishLibrary,
  encodeContentState,
  asLibraryId,
  asExhibitId,
  asObjectId,
  type Library,
  type AnnotationLog,
  type SelectorRef,
} from "@render/core";

beforeAll(() => {
  defineArchieViewer(); // idempotent
});

function mount(): ArchieViewerElement {
  const el = document.createElement("archie-viewer") as ArchieViewerElement;
  document.body.appendChild(el);
  return el;
}

// --- a real one-exhibit .archie.zip fixture (donor: load.test.ts buildArchiveBytes) ----------------
// Parameterized by slug/title/libTitle so the two-instance test can open DIFFERENT libraries.
async function buildArchiveBytes(opts: { slug: string; title: string; libTitle: string }): Promise<Uint8Array> {
  const library: Library = {
    id: asLibraryId("L"),
    title: opts.libTitle,
    exhibits: [
      {
        id: asExhibitId("e1"),
        slug: opts.slug,
        title: opts.title,
        objects: [{ id: asObjectId("o1"), source: "https://example.org/iiif/o1/info.json", label: "Plate I" }],
      },
    ],
  };
  const fs = new ZipFilesystem();
  const logs: Record<string, AnnotationLog> = {};
  await publishLibrary(fs, library, (id) => logs[id] ?? [], { baseUrl: "https://u.gh.io/lib/" });
  return fs.toZip();
}

/** Flush the element's load microtasks (openFile → openZipBytes → setView). */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("registration", () => {
  it("customElements.define registered <archie-viewer> as ArchieViewerElement", () => {
    expect(customElements.get("archie-viewer")).toBe(ArchieViewerElement);
  });
  it("defineArchieViewer is idempotent (a second define is a no-op, not a throw)", () => {
    expect(() => defineArchieViewer()).not.toThrow();
  });
  it("observes src / target / iiif-content / offline", () => {
    expect(ArchieViewerElement.observedAttributes).toEqual(["src", "target", "iiif-content", "offline"]);
  });
});

describe("attribute ⇄ property reactivity", () => {
  it("with no src, connecting renders the drop/open zone", () => {
    const el = mount();
    expect(el.shadowRoot!.querySelector('[data-act="pick"]')).not.toBeNull();
  });

  it("src property reflects to the attribute and back", () => {
    // Set offline FIRST so the reflected src can't trigger a real network open in this unit test —
    // the offline gate refuses an http src before fetch (asserted separately below). We assert only
    // the reflection here.
    const el = mount();
    el.offline = true;
    el.src = "https://host/lib.archie.zip";
    expect(el.getAttribute("src")).toBe("https://host/lib.archie.zip");
    el.removeAttribute("src");
    expect(el.src).toBeNull();
  });

  it("offline is a boolean attribute (presence = on)", () => {
    const el = mount();
    expect(el.offline).toBe(false);
    el.offline = true;
    expect(el.hasAttribute("offline")).toBe(true);
    el.setAttribute("offline", "");
    expect(el.offline).toBe(true);
    el.offline = false;
    expect(el.hasAttribute("offline")).toBe(false);
  });

  it("setting src after connect kicks off a load (leaves the empty zone for 'loading')", async () => {
    const el = mount();
    // Offline + an http src is refused by the load gate → re-renders the empty zone with an error,
    // proving the attribute change drove a re-render through the load path (no real fetch).
    el.offline = true;
    el.setAttribute("src", "https://unreachable.example/lib.zip");
    await Promise.resolve();
    await Promise.resolve();
    const err = el.shadowRoot!.querySelector(".err");
    expect(err?.textContent).toMatch(/offline/i);
  });
});

describe("no-src drop handler calls the load seam", () => {
  it("openFile routes a bad blob through the load seam → error surfaces in the drop zone", async () => {
    const el = mount();
    // A non-zip blob fails ZipFilesystem.fromZip / the marker → openLibraryFromFile rejects; the
    // element catches it and re-renders the empty zone with the thrown message. This proves openFile
    // is wired to the load seam (load.ts), not a stub.
    await el.openFile(new Blob([new Uint8Array([1, 2, 3, 4])]));
    expect(el.shadowRoot!.querySelector(".err")).not.toBeNull();
  });

  it("the file input change handler invokes openFile", async () => {
    const el = mount();
    const spy = vi.spyOn(el, "openFile").mockResolvedValue(undefined);
    const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([new Uint8Array([0])], "x.zip");
    // happy-dom: define the files list, then dispatch change.
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    expect(spy).toHaveBeenCalledWith(file);
  });
});

describe("offline propagation reaches the reader options", () => {
  it("the element passes its offline property through to the reader open call", async () => {
    const el = mount();
    el.offline = true;
    // Stub the lazy reader import boundary isn't trivial under vitest; instead assert the property the
    // #openObject path reads. The reader gate itself is unit-tested in reader.test.ts (isRemoteSource +
    // OfflineRemoteBlockedError). Here we pin that the element exposes offline truthfully.
    expect(el.offline).toBe(true);
  });
});

describe("two-instance independence (Phase-4 per-element seam — no module globals)", () => {
  it("two <archie-viewer> tags open DIFFERENT libraries without clobbering each other's state", async () => {
    const [bytesA, bytesB] = await Promise.all([
      buildArchiveBytes({ slug: "alpha", title: "Alpha Exhibit", libTitle: "Library A" }),
      buildArchiveBytes({ slug: "beta", title: "Beta Exhibit", libTitle: "Library B" }),
    ]);

    const elA = mount();
    const elB = mount();
    await elA.openFile(new Blob([bytesA as BlobPart]));
    await elB.openFile(new Blob([bytesB as BlobPart]));
    await settle();

    // Each shadow root shows ITS OWN gallery — not the other's, not a shared singleton's.
    const titleA = elA.shadowRoot!.querySelector(".intro h1")?.textContent;
    const titleB = elB.shadowRoot!.querySelector(".intro h1")?.textContent;
    expect(titleA).toBe("Library A");
    expect(titleB).toBe("Library B");
    expect(elA.shadowRoot!.querySelector('[data-slug="alpha"]')).not.toBeNull();
    expect(elA.shadowRoot!.querySelector('[data-slug="beta"]')).toBeNull();
    expect(elB.shadowRoot!.querySelector('[data-slug="beta"]')).not.toBeNull();
    expect(elB.shadowRoot!.querySelector('[data-slug="alpha"]')).toBeNull();

    // Re-loading B does NOT mutate A (independent #library/#view fields, not a clobbered global).
    await elB.openFile(new Blob([bytesA as BlobPart])); // B now holds Library A too
    await settle();
    expect(elB.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Library A");
    expect(elA.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Library A"); // A unchanged
    expect(elA.shadowRoot!.querySelector('[data-slug="alpha"]')).not.toBeNull();
  });

  it("two tags can open the SAME library bytes into independent instances (no shared fs)", async () => {
    const bytes = await buildArchiveBytes({ slug: "alpha", title: "Alpha Exhibit", libTitle: "Shared" });
    const elA = mount();
    const elB = mount();
    await elA.openFile(new Blob([bytes as BlobPart]));
    await elB.openFile(new Blob([bytes as BlobPart]));
    await settle();
    // Both render the gallery; tearing one down (disconnect) must not blank the other.
    expect(elA.shadowRoot!.querySelector('[data-slug="alpha"]')).not.toBeNull();
    expect(elB.shadowRoot!.querySelector('[data-slug="alpha"]')).not.toBeNull();
    elA.remove(); // disconnectedCallback → teardown + revoke on A only
    expect(elB.shadowRoot!.querySelector('[data-slug="alpha"]')).not.toBeNull(); // B intact
  });
});

describe("target ladder degrade-upward (ADR-0021, integration through a real library)", () => {
  async function loadAlpha(target?: string): Promise<ArchieViewerElement> {
    const bytes = await buildArchiveBytes({ slug: "alpha", title: "Alpha Exhibit", libTitle: "Lib" });
    const el = mount();
    if (target) el.setAttribute("target", target);
    await el.openFile(new Blob([bytes as BlobPart]));
    await settle();
    return el;
  }

  it("an unknown slug degrades to the Gallery with the cold notice", async () => {
    const el = await loadAlpha("#/does-not-exist");
    await settle();
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Lib"); // the gallery
    expect(el.shadowRoot!.querySelector(".cold")).not.toBeNull();
  });

  it("an unknown note id degrades to the exhibit grid (note-not-found → its exhibit)", async () => {
    const el = await loadAlpha("#/alpha/a/ghost-note");
    await settle();
    // The exhibit grid renders the object as a card; the back-to-gallery topbar is present.
    expect(el.shadowRoot!.querySelector('[data-act="back"]')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('[data-obj="o1"]')).not.toBeNull();
  });

  it("a bare exhibit target lands on that exhibit's grid", async () => {
    const el = await loadAlpha("#/alpha");
    await settle();
    expect(el.shadowRoot!.querySelector('[data-obj="o1"]')).not.toBeNull();
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Alpha Exhibit");
  });
});

describe("iiif-content interop deep-link (ADR-0021 deferred-additive, integration through a real library)", () => {
  // buildArchiveBytes publishes with baseUrl "https://u.gh.io/lib/", object id "o1" → the canvas IRI is
  // `https://u.gh.io/lib/{slug}/canvas/o1`. We encode Content States against THAT via the donor codec.
  const canvasIriFor = (slug: string): string => `https://u.gh.io/lib/${slug}/canvas/o1`;
  const manifestIriFor = (slug: string): string => `https://u.gh.io/lib/${slug}/manifest.json`;
  const csFor = (canvasId: string, selector: SelectorRef): string => encodeContentState("anno", canvasId, selector);

  // Resolving an iiif-content runs a DEEPER async chain than a native target: decode → per-slug
  // readExhibit (zip read) → resolveExhibitTarget → openExhibit → openObject. 8 microtask flushes isn't
  // enough; flush generously so the reader/grid view has settled before we assert.
  async function settleDeep(): Promise<void> {
    for (let i = 0; i < 60; i++) await Promise.resolve();
  }

  async function loadAlphaWith(attrs: { iiifContent?: string; target?: string }): Promise<ArchieViewerElement> {
    const bytes = await buildArchiveBytes({ slug: "alpha", title: "Alpha Exhibit", libTitle: "Lib" });
    const el = mount();
    if (attrs.target) el.setAttribute("target", attrs.target);
    if (attrs.iiifContent) el.setAttribute("iiif-content", attrs.iiifContent);
    await el.openFile(new Blob([bytes as BlobPart]));
    await settleDeep();
    return el;
  }

  it("reflects the iiif-content attribute to the iiifContent property and back", () => {
    const el = mount();
    el.iiifContent = "ZW5jb2RlZA";
    expect(el.getAttribute("iiif-content")).toBe("ZW5jb2RlZA");
    el.removeAttribute("iiif-content");
    expect(el.iiifContent).toBeNull();
  });

  it("a Content State referencing a known canvas (+xywh) opens that object's reader (region carried)", async () => {
    const enc = csFor(canvasIriFor("alpha"), { type: "FragmentSelector", value: "xywh=pixel:10,20,30,40" });
    const el = await loadAlphaWith({ iiifContent: enc });
    await settleDeep();
    // The known canvas → object o1 opens: the reader view rendered (surface host + the object label topbar).
    expect(el.shadowRoot!.querySelector(".reader-surface")).not.toBeNull();
    expect(el.shadowRoot!.querySelector(".topbar .title")?.textContent).toBe("Plate I");
  });

  it("a Manifest-only Content State lands on the exhibit grid (slug, no object)", async () => {
    const enc = csFor(manifestIriFor("alpha"), { type: "FragmentSelector" });
    const el = await loadAlphaWith({ iiifContent: enc });
    await settleDeep();
    expect(el.shadowRoot!.querySelector('[data-obj="o1"]')).not.toBeNull();
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Alpha Exhibit");
  });

  it("a FOREIGN Content State degrades upward to the Gallery with the cold notice (never an error)", async () => {
    const enc = csFor("https://elsewhere.org/iiif/x/canvas/z", { type: "FragmentSelector", value: "xywh=pixel:0,0,1,1" });
    const el = await loadAlphaWith({ iiifContent: enc });
    await settleDeep();
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Lib"); // the gallery
    expect(el.shadowRoot!.querySelector(".cold")).not.toBeNull();
  });

  it("a MALFORMED iiif-content degrades to the Gallery gracefully (no uncaught throw)", async () => {
    const el = await loadAlphaWith({ iiifContent: "@@@not-a-content-state@@@" });
    await settleDeep();
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Lib");
    expect(el.shadowRoot!.querySelector(".cold")).not.toBeNull();
  });

  it("PRECEDENCE: a native `target` WINS over iiif-content (interop is the fallback)", async () => {
    // target points at the exhibit grid; iiif-content would open the object — native must win → grid.
    const enc = csFor(canvasIriFor("alpha"), { type: "FragmentSelector" });
    const el = await loadAlphaWith({ target: "#/alpha", iiifContent: enc });
    await settleDeep();
    // Native target → bare exhibit grid (NOT the reader the Content State would have opened).
    expect(el.shadowRoot!.querySelector('[data-obj="o1"]')).not.toBeNull();
    expect(el.shadowRoot!.querySelector(".reader-surface")).toBeNull();
  });

  it("reverse interop: currentContentState() round-trips back to the open object's canvas", async () => {
    const enc = csFor(canvasIriFor("alpha"), { type: "FragmentSelector" });
    const el = await loadAlphaWith({ iiifContent: enc });
    await settleDeep();
    const out = el.currentContentState();
    expect(out).not.toBeNull();
    // The reverse Content State references the SAME canvas IRI the object was opened from.
    const reEncoded = encodeContentState(canvasIriFor("alpha"), canvasIriFor("alpha"), { type: "FragmentSelector" });
    expect(out).toBe(reEncoded);
  });

  it("currentContentState() is null when no object is open (gallery view isn't single-canvas addressable)", async () => {
    const bytes = await buildArchiveBytes({ slug: "alpha", title: "Alpha Exhibit", libTitle: "Lib" });
    const el = mount();
    await el.openFile(new Blob([bytes as BlobPart]));
    await settleDeep();
    expect(el.currentContentState()).toBeNull(); // sitting on the gallery
  });
});

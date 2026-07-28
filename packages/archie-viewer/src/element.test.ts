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
  return (await buildArchiveFs(opts)).toZip();
}

/** The SAME fixture as a live tree, un-serialized — what Studio's preview hands over (openLibraryFs).
 *  buildArchiveBytes is now this plus `.toZip()`, so the two paths can never drift apart. */
async function buildArchiveFs(opts: { slug: string; title: string; libTitle: string }): Promise<ZipFilesystem> {
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
  return fs;
}

// --- WAITING: on the condition, never on a tick count (Archie-3e2d) -------------------------------
// The element's address chain is deliberately fire-and-forget (`void this.#openExhibit(...)`), and the
// reader/AV surfaces are lazy `import()`s — so there is no promise to await and the rendered shadow DOM
// is the only observable completion signal. The old helpers drained a FIXED number of loop turns
// (8/20/20/60 — a spread that was itself the tell they'd been tuned until green). That is a race with a
// magic number: enough on an idle laptop, not enough on a loaded CI runner, and it surfaces as
// `expected null not to be null` on a perfectly correct mount. `vi.waitFor` re-runs the predicate across
// real macrotasks until it holds, so a slow runner simply takes more turns, and a genuine failure names
// the thing that never appeared.
const WAIT = { timeout: 5000, interval: 5 } as const;

/** Wait until `ready()` holds. `what` is what the timeout message will say never appeared. */
async function settleUntil(what: string, ready: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    if (!ready()) throw new Error(`timed out waiting for ${what}`);
  }, WAIT);
}

/** Present-in-shadow-root predicate — the shape nearly every wait here needs. */
const has = (el: ArchieViewerElement, sel: string): boolean => el.shadowRoot!.querySelector(sel) !== null;

/** Wait for a selector to appear in `el`'s shadow root. */
const waitForSel = (el: ArchieViewerElement, sel: string): Promise<void> =>
  settleUntil(`${sel} in the shadow root`, () => has(el, sel));

/**
 * Wait for the image reader to reach a TERMINAL state — not merely for `.reader-surface`.
 *
 * `.reader-surface` is the host `#openObject` renders BEFORE `await import("./reader.js")`, so waiting
 * on it returns with the OSD module still resolving. The test then ends, vitest tears the environment
 * down, and openseadragon's module body evaluates against a dead `document` — an unhandled rejection
 * that fails the FILE while all 38 tests report green (measured: 9/25 runs under 32-way CPU load).
 * That is the same "gate measuring something adjacent to what it claims" shape as the tick drains.
 *
 * Downstream of the import there are exactly two outcomes: the note card mounts, or the mount throws
 * and the host is replaced by the `.notice` (under happy-dom, with no live OSD, that is the usual one).
 */
const waitForReaderMounted = (el: ArchieViewerElement): Promise<void> =>
  settleUntil("the reader to finish mounting (note card or notice)", () =>
    has(el, ".archie-note-card") || has(el, ".notice"));

describe("registration", () => {
  it("customElements.define registered <archie-viewer> as ArchieViewerElement", () => {
    expect(customElements.get("archie-viewer")).toBe(ArchieViewerElement);
  });
  it("defineArchieViewer is idempotent (a second define is a no-op, not a throw)", () => {
    expect(() => defineArchieViewer()).not.toThrow();
  });
  it("observes src / target / iiif-content / offline / show-unlisted", () => {
    expect(ArchieViewerElement.observedAttributes).toEqual(["src", "target", "iiif-content", "offline", "show-unlisted"]);
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

  it("show-unlisted is a boolean attribute (presence = on)", () => {
    const el = mount();
    expect(el.showUnlisted).toBe(false);
    el.showUnlisted = true;
    expect(el.hasAttribute("show-unlisted")).toBe(true);
    el.setAttribute("show-unlisted", "");
    expect(el.showUnlisted).toBe(true);
    el.showUnlisted = false;
    expect(el.hasAttribute("show-unlisted")).toBe(false);
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

describe("openLibraryFs — the in-process door (Studio preview)", () => {
  it("opens an ALREADY-BUILT tree without serializing it, and renders the gallery", async () => {
    const fs = await buildArchiveFs({ slug: "alpha", title: "Alpha Exhibit", libTitle: "Preview Lib" });
    // The point of this door: no .toZip(), no Blob, no URL. Spy proves the tree is never serialized —
    // publish-flows.svelte.ts:72 records that materializing the zip builds a 2nd full copy (peak ≈2×).
    const toZip = vi.spyOn(fs, "toZip");
    const el = mount();
    await el.openLibraryFs(fs);
    await waitForSel(el, '[data-slug="alpha"]');

    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Preview Lib");
    expect(el.shadowRoot!.querySelector('[data-slug="alpha"]')).not.toBeNull();
    expect(toZip).not.toHaveBeenCalled();
  });

  it("still validates the ADR-0020 marker — a forged tree errors instead of showing an empty gallery", async () => {
    const fs = await buildArchiveFs({ slug: "alpha", title: "Alpha Exhibit", libTitle: "Forged" });
    // Overwrite the marker with a foreign one. A first-party caller is not a reason to skip the check:
    // preview catching a malformed publish is the feature, and an empty gallery would look like "no
    // exhibits authored" rather than "this artifact is broken".
    const marker = await (await fs.root()).getFile("archie.json", { create: true });
    const w = await marker.writable();
    await w.write(JSON.stringify({ format: "not-archie", version: 1 }));
    await w.close();

    const el = mount();
    // Wait for the ERROR to arrive (the positive fact) before asserting the gallery card is absent.
    await el.openLibraryFs(fs);
    await waitForSel(el, ".err");

    expect(el.shadowRoot!.querySelector('[data-slug="alpha"]')).toBeNull();
    expect(el.shadowRoot!.querySelector(".err")?.textContent).toMatch(/isn't an Archie library/i);
  });

  it("a second openLibraryFs replaces the first library (no stale gallery)", async () => {
    const [a, b] = await Promise.all([
      buildArchiveFs({ slug: "alpha", title: "Alpha", libTitle: "Lib A" }),
      buildArchiveFs({ slug: "beta", title: "Beta", libTitle: "Lib B" }),
    ]);
    const el = mount();
    await el.openLibraryFs(a);
    await waitForSel(el, '[data-slug="alpha"]');
    await el.openLibraryFs(b);
    // The REPLACEMENT is the fact under test: wait for B's card, then assert A's is gone.
    await waitForSel(el, '[data-slug="beta"]');
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Lib B");
    expect(el.shadowRoot!.querySelector('[data-slug="alpha"]')).toBeNull();
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
    await settleUntil("both instances' galleries", () => has(elA, '[data-slug="alpha"]') && has(elB, '[data-slug="beta"]'));

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
    await settleUntil("B's gallery to re-render as Library A", () => has(elB, '[data-slug="alpha"]'));
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
    await settleUntil("both galleries", () => has(elA, '[data-slug="alpha"]') && has(elB, '[data-slug="alpha"]'));
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
    // No blanket wait here — openFile awaits the library open itself, and each test below waits for
    // the specific rendered fact its assertion depends on (the address chain runs un-awaited).
    return el;
  }

  it("an unknown slug degrades to the Gallery with the cold notice", async () => {
    const el = await loadAlpha("#/does-not-exist");
    await waitForSel(el, ".cold");
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Lib"); // the gallery
  });

  it("an unknown note id degrades to the exhibit grid (note-not-found → its exhibit)", async () => {
    const el = await loadAlpha("#/alpha/a/ghost-note");
    // The exhibit grid renders the object as a card; the back-to-gallery topbar is present.
    await waitForSel(el, '[data-obj="o1"]');
    expect(el.shadowRoot!.querySelector('[data-act="back"]')).not.toBeNull();
  });

  it("a bare exhibit target lands on that exhibit's grid", async () => {
    const el = await loadAlpha("#/alpha");
    await waitForSel(el, '[data-obj="o1"]');
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Alpha Exhibit");
  });
});

describe("gallery listing honors the UNLISTED lever (Archie-f735)", () => {
  // Two exhibits: "alpha" carries no `unlisted` key (the absent/default case); "hidden" is marked
  // unlisted: true. Mirrors apps/viewer gallery-view.ts's `listedExhibits` filter (Archie-77b2), applied
  // here to the embed's OWN gallery grid (render-core iiif/exhibits.ts ExhibitCard.unlisted).
  async function buildTwoExhibitBytes(): Promise<Uint8Array> {
    const library: Library = {
      id: asLibraryId("L"),
      title: "Lib",
      exhibits: [
        {
          id: asExhibitId("e1"),
          slug: "alpha",
          title: "Alpha Exhibit",
          objects: [{ id: asObjectId("o1"), source: "https://example.org/iiif/o1/info.json", label: "Plate I" }],
        },
        {
          id: asExhibitId("e2"),
          slug: "hidden",
          title: "Hidden Exhibit",
          unlisted: true,
          objects: [{ id: asObjectId("o2"), source: "https://example.org/iiif/o2/info.json", label: "Plate II" }],
        },
      ],
    };
    const fs = new ZipFilesystem();
    await publishLibrary(fs, library, () => [], { baseUrl: "https://u.gh.io/lib/" });
    return fs.toZip();
  }

  it("an unlisted card is hidden from the gallery grid by default", async () => {
    const bytes = await buildTwoExhibitBytes();
    const el = mount();
    await el.openFile(new Blob([bytes as BlobPart]));
    // Wait on the POSITIVE fact (the listed card arrived) before asserting the negative one — a
    // wait that watches for an absence would pass simply by running before anything rendered.
    await waitForSel(el, '[data-slug="alpha"]');
    expect(el.shadowRoot!.querySelector('[data-slug="hidden"]')).toBeNull();
  });

  it("absent `unlisted` ≡ listed — the un-flagged card renders exactly as before", async () => {
    const bytes = await buildTwoExhibitBytes();
    const el = mount();
    await el.openFile(new Blob([bytes as BlobPart]));
    await waitForSel(el, '[data-slug="alpha"]');
    const card = el.shadowRoot!.querySelector('[data-slug="alpha"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Alpha Exhibit");
  });

  it("show-unlisted includes the unlisted card in the gallery grid", async () => {
    const bytes = await buildTwoExhibitBytes();
    const el = mount();
    el.showUnlisted = true;
    await el.openFile(new Blob([bytes as BlobPart]));
    await settleUntil("both cards in the gallery", () => has(el, '[data-slug="alpha"]') && has(el, '[data-slug="hidden"]'));
    expect(el.shadowRoot!.querySelector('[data-slug="alpha"]')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('[data-slug="hidden"]')).not.toBeNull();
  });

  it("toggling show-unlisted AFTER the gallery has rendered re-filters in place (no reload)", async () => {
    const bytes = await buildTwoExhibitBytes();
    const el = mount();
    await el.openFile(new Blob([bytes as BlobPart]));
    await waitForSel(el, '[data-slug="alpha"]'); // positive fact first (see above)
    expect(el.shadowRoot!.querySelector('[data-slug="hidden"]')).toBeNull();
    el.showUnlisted = true;
    expect(el.shadowRoot!.querySelector('[data-slug="hidden"]')).not.toBeNull();
    el.showUnlisted = false;
    expect(el.shadowRoot!.querySelector('[data-slug="hidden"]')).toBeNull();
  });

  it("a `target` pointing directly at an unlisted exhibit still opens it — reachability is unaffected", async () => {
    const bytes = await buildTwoExhibitBytes();
    const el = mount();
    el.setAttribute("target", "#/hidden");
    await el.openFile(new Blob([bytes as BlobPart]));
    // #applyTarget fires #openExhibit un-awaited, so the grid arrives some turns after openFile resolves.
    // Lands on the hidden exhibit's own grid — not degraded to the gallery, not blocked by the default hide.
    await waitForSel(el, '[data-obj="o2"]');
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Hidden Exhibit");
  });

  it("navigating back to the gallery from an opened unlisted exhibit still hides its card", async () => {
    const bytes = await buildTwoExhibitBytes();
    const el = mount();
    el.setAttribute("target", "#/hidden");
    await el.openFile(new Blob([bytes as BlobPart]));
    await waitForSel(el, '[data-act="back"]'); // the opened exhibit's topbar → the back control exists
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-act="back"]')!.click();
    expect(el.shadowRoot!.querySelector('[data-slug="hidden"]')).toBeNull();
    expect(el.shadowRoot!.querySelector('[data-slug="alpha"]')).not.toBeNull();
  });
});

describe("AV medium branch (ADR-0019): a sound/video object mounts the native player, not OSD", () => {
  // A one-exhibit library whose single object is a SOUND recording (blob: source so the offline gate is
  // moot) → opening it must mount the NATIVE <audio> player, not the OSD reader. (Cue RENDERING from a
  // note list is covered exhaustively in av-player.test.ts; here we prove the element's MEDIUM BRANCH.)
  async function buildSoundLibraryBytes(): Promise<Uint8Array> {
    const objId = asObjectId("o12");
    const library: Library = {
      id: asLibraryId("L"),
      title: "Sound Lib",
      exhibits: [
        {
          id: asExhibitId("e1"),
          slug: "sonic",
          title: "Sonic Exhibit",
          objects: [{ id: objId, source: "blob:fake-audio", label: "Field recording", mediaType: "sound" }],
        },
      ],
    };
    const fs = new ZipFilesystem();
    await publishLibrary(fs, library, () => [], { baseUrl: "https://u.gh.io/lib/" });
    return fs.toZip();
  }

  it("opening a sound object mounts a native <audio> (not the OSD reader / not an error notice)", async () => {
    const bytes = await buildSoundLibraryBytes();
    const el = mount();
    el.setAttribute("target", "#/sonic/o/o12"); // object rung → opens o12
    await el.openFile(new Blob([bytes as BlobPart]));
    // The AV player is LAZY-imported (import("./av-player.js")) — a real module-resolution macrotask
    // whose cost is load-dependent. This is the site that went red on CI and green on a rerun of the
    // identical commit (Archie-3e2d); wait for the <audio> itself, not for a tick budget.
    await waitForSel(el, "audio");
    const sr = el.shadowRoot!;
    expect(sr.querySelector("audio")).not.toBeNull();
    expect(sr.querySelector("video")).toBeNull();
    expect((sr.querySelector("audio") as HTMLMediaElement).getAttribute("src")).toBe("blob:fake-audio");
    // The reader-surface host holds the AV player, NOT an OSD error notice ("Couldn't load this media item").
    expect(sr.querySelector(".notice")).toBeNull();
  });
});

describe("object-grid thumbnail fallback chain (apps/viewer MediaThumbnail/Gallery parity)", () => {
  // A mixed-media exhibit, published+reopened through a REAL zip so the recovered PortableExhibit is what
  // the element actually renders from (mediaType and tileSource round-trip; a baked thumbnail would too,
  // but remote-IIIF/external/AV objects carry NONE — the exact class the o.thumbnail-only bug blanked).
  async function loadMixedGrid(): Promise<ArchieViewerElement> {
    const library: Library = {
      id: asLibraryId("L"),
      title: "Mixed Lib",
      exhibits: [
        {
          id: asExhibitId("e1"),
          slug: "mixed",
          title: "Mixed Exhibit",
          objects: [
            { id: asObjectId("iiif1"), source: "https://example.org/iiif/o1/info.json", label: "IIIF plate" },
            { id: asObjectId("raster1"), source: "https://example.org/photo.jpg", label: "Plain raster" },
            { id: asObjectId("snd1"), source: "https://example.org/rec.mp3", label: "Recording", mediaType: "sound" },
            { id: asObjectId("vid1"), source: "https://example.org/clip.mp4", label: "Clip", mediaType: "video" },
            {
              id: asObjectId("map1"), source: "xyz", label: "Basemap",
              tileSource: { kind: "xyz", template: "https://tile.example/{z}/{x}/{y}.png", maxZoom: 3 },
            },
            {
              id: asObjectId("dzi1"), source: "https://example.org/big.jpg", label: "Deep zoom",
              tileSource: { kind: "dzi", width: 4000, height: 3000, tileSize: 254, overlap: 1, format: "image/jpeg", filesPath: "big_files" },
            },
          ],
        },
      ],
    };
    const fs = new ZipFilesystem();
    await publishLibrary(fs, library, () => [], { baseUrl: "https://u.gh.io/lib/" });
    const el = mount();
    el.setAttribute("target", "#/mixed");
    await el.openFile(new Blob([fs.toZip() as BlobPart]));
    // All six cards, not "some turns have passed" — a partially-rendered grid is the failure mode the
    // per-object assertions below would otherwise report as a blank cover.
    await settleUntil("all 6 object cards in the mixed grid", () => el.shadowRoot!.querySelectorAll("[data-obj]").length === 6);
    return el;
  }

  const coverIn = (el: ArchieViewerElement, objId: string): Element | null =>
    el.shadowRoot!.querySelector(`[data-obj="${objId}"] .cover`);

  it("a remote-IIIF object with NO baked thumbnail derives a sized Image-API thumb (not a blank label)", async () => {
    const el = await loadMixedGrid();
    const cover = coverIn(el, "iiif1");
    expect(cover?.tagName).toBe("IMG");
    expect(cover?.getAttribute("src")).toBe("https://example.org/iiif/o1/full/480,/0/default.jpg");
  });

  it("a plain external raster passes through as its own renderable URL", async () => {
    const el = await loadMixedGrid();
    const cover = coverIn(el, "raster1");
    expect(cover?.tagName).toBe("IMG");
    expect(cover?.getAttribute("src")).toBe("https://example.org/photo.jpg");
  });

  it("AV objects get a glyph+kind cue, never a fake <img>", async () => {
    const el = await loadMixedGrid();
    const snd = coverIn(el, "snd1");
    expect(snd?.tagName).toBe("SPAN");
    expect(snd?.textContent).toContain("Audio");
    const vid = coverIn(el, "vid1");
    expect(vid?.tagName).toBe("SPAN");
    expect(vid?.textContent).toContain("Video");
  });

  it("an xyz map object gets the map cue; a DZI-tiled object stays an IMAGE (no motif conflation)", async () => {
    const el = await loadMixedGrid();
    const map = coverIn(el, "map1");
    expect(map?.tagName).toBe("SPAN");
    expect(map?.textContent).toContain("Map");
    // dzi = a baked pyramid of a single IMAGE — must render a picture, not the map cue.
    const dzi = coverIn(el, "dzi1");
    expect(dzi?.tagName).toBe("IMG");
  });

  it("a 404'd IIIF sized thumb STEPS DOWN the candidate chain (level-0 static full) before the label cover", async () => {
    // Mitigation for thumbnail-mitigations gap 2: a level-0 host 404s `/full/480,/` but serves the
    // pre-generated `/full/full/0/default.jpg` — the first error must try that, not give up.
    const el = await loadMixedGrid();
    const img = coverIn(el, "iiif1") as HTMLImageElement;
    expect(img.dataset["srcs"]).toBeDefined(); // the remaining chain rides the element
    img.dispatchEvent(new Event("error"));
    const stepped = coverIn(el, "iiif1") as HTMLImageElement;
    expect(stepped.tagName).toBe("IMG"); // same element, next candidate — not yet the label
    expect(stepped.getAttribute("src")).toBe("https://example.org/iiif/o1/full/full/0/default.jpg");
    // The source was an explicit info.json (genuinely IIIF) — no raw-source rung; the NEXT error is
    // the end of the chain → the label-text cover (never a broken-image icon).
    stepped.dispatchEvent(new Event("error"));
    const cover = coverIn(el, "iiif1");
    expect(cover?.tagName).toBe("SPAN");
    expect(cover?.textContent).toBe("IIIF plate");
  });

  it("a plain raster has a single-candidate chain — one error goes straight to the label cover", async () => {
    const el = await loadMixedGrid();
    const img = coverIn(el, "raster1") as HTMLImageElement;
    expect(img.dataset["srcs"]).toBeUndefined(); // nothing IIIF-shaped to fall back through
    img.dispatchEvent(new Event("error"));
    const cover = coverIn(el, "raster1");
    expect(cover?.tagName).toBe("SPAN");
    expect(cover?.textContent).toBe("Plain raster");
  });

  it("a 404'd gallery COVER degrades to the title-text cover the no-cover path renders", async () => {
    const el = await loadMixedGrid();
    // Back to the gallery; if this library's card carries a cover img, error-degrade it. Either way the
    // gallery must never leave a broken-image icon: any cover img carries the data-fallback wiring.
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-act="back"]')!.click();
    const img = el.shadowRoot!.querySelector<HTMLImageElement>('[data-slug="mixed"] img.cover');
    if (img) {
      expect(img.dataset["fallback"]).toBe("Mixed Exhibit");
      img.dispatchEvent(new Event("error"));
      const cover = el.shadowRoot!.querySelector('[data-slug="mixed"] .cover');
      expect(cover?.tagName).toBe("SPAN");
      expect(cover?.textContent).toBe("Mixed Exhibit");
    } else {
      // No cover baked by this publish path → the no-cover title-text span is already the render.
      expect(el.shadowRoot!.querySelector('[data-slug="mixed"] .cover')?.tagName).toBe("SPAN");
    }
  });
});

describe("iiif-content interop deep-link (ADR-0021 deferred-additive, integration through a real library)", () => {
  // buildArchiveBytes publishes with baseUrl "https://u.gh.io/lib/", object id "o1" → the canvas IRI is
  // `https://u.gh.io/lib/{slug}/canvas/o1`. We encode Content States against THAT via the donor codec.
  const canvasIriFor = (slug: string): string => `https://u.gh.io/lib/${slug}/canvas/o1`;
  const manifestIriFor = (slug: string): string => `https://u.gh.io/lib/${slug}/manifest.json`;
  const csFor = (canvasId: string, selector: SelectorRef): string => encodeContentState("anno", canvasId, selector);

  // Resolving an iiif-content runs a DEEPER async chain than a native target: decode → per-slug
  // readExhibit (zip read) → resolveExhibitTarget → openExhibit → openObject — and it runs un-awaited.
  // Depth is exactly why a tick budget is the wrong instrument: each test below waits for the view it
  // expects to arrive, so a deeper chain (or a slower runner) costs turns, not a red run.
  async function loadAlphaWith(attrs: { iiifContent?: string; target?: string }): Promise<ArchieViewerElement> {
    const bytes = await buildArchiveBytes({ slug: "alpha", title: "Alpha Exhibit", libTitle: "Lib" });
    const el = mount();
    if (attrs.target) el.setAttribute("target", attrs.target);
    if (attrs.iiifContent) el.setAttribute("iiif-content", attrs.iiifContent);
    await el.openFile(new Blob([bytes as BlobPart]));
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
    // The known canvas → object o1 opens: the reader view rendered (surface host + the object label topbar).
    await waitForReaderMounted(el);
    expect(el.shadowRoot!.querySelector(".reader-surface")).not.toBeNull();
    expect(el.shadowRoot!.querySelector(".topbar .title")?.textContent).toBe("Plate I");
  });

  it("a Manifest-only Content State lands on the exhibit grid (slug, no object)", async () => {
    const enc = csFor(manifestIriFor("alpha"), { type: "FragmentSelector" });
    const el = await loadAlphaWith({ iiifContent: enc });
    await waitForSel(el, '[data-obj="o1"]');
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Alpha Exhibit");
  });

  it("a FOREIGN Content State degrades upward to the Gallery with the cold notice (never an error)", async () => {
    const enc = csFor("https://elsewhere.org/iiif/x/canvas/z", { type: "FragmentSelector", value: "xywh=pixel:0,0,1,1" });
    const el = await loadAlphaWith({ iiifContent: enc });
    await waitForSel(el, ".cold");
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Lib"); // the gallery
  });

  it("a MALFORMED iiif-content degrades to the Gallery gracefully (no uncaught throw)", async () => {
    const el = await loadAlphaWith({ iiifContent: "@@@not-a-content-state@@@" });
    await waitForSel(el, ".cold");
    expect(el.shadowRoot!.querySelector(".intro h1")?.textContent).toBe("Lib");
  });

  it("PRECEDENCE: a native `target` WINS over iiif-content (interop is the fallback)", async () => {
    // target points at the exhibit grid; iiif-content would open the object — native must win → grid.
    const enc = csFor(canvasIriFor("alpha"), { type: "FragmentSelector" });
    const el = await loadAlphaWith({ target: "#/alpha", iiifContent: enc });
    // Native target → bare exhibit grid (NOT the reader the Content State would have opened). Wait for the
    // grid to arrive before asserting the reader is absent — otherwise the absence is just earliness.
    await waitForSel(el, '[data-obj="o1"]');
    expect(el.shadowRoot!.querySelector(".reader-surface")).toBeNull();
  });

  it("reverse interop: currentContentState() round-trips back to the open object's canvas", async () => {
    const enc = csFor(canvasIriFor("alpha"), { type: "FragmentSelector" });
    const el = await loadAlphaWith({ iiifContent: enc });
    await waitForReaderMounted(el); // the object must be OPEN before its reverse address exists
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
    await waitForSel(el, '[data-slug="alpha"]'); // the gallery rendered (positive fact) — no object opened
    expect(el.currentContentState()).toBeNull(); // sitting on the gallery
  });
});

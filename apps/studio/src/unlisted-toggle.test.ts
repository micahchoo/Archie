import { describe, it, expect, vi } from "vitest";
import { MemoryFilesystem, workingToLibrary, loadLibrary, libraryToWorking, publishLibrary } from "@render/core";

// Flow-level proof of the "Hide from the public gallery" toggle (Archie-bdc0), end to end through the
// STUDIO's own seams: the store write the DetailsEditor checkbox drives (`lib.patchExhibit(slug, { unlisted })`)
// → buildFullLibrary (`workingToLibrary`) → publish → the published exhibits.json card → import back
// (`loadLibrary` + `libraryToWorking`, the ingest-flows replaceProjectFrom path) → the working store the
// toggle re-reads. Before the ticket, libraryToWorking named-dropped `unlisted`, so this republished a hidden
// exhibit as LISTED and the re-imported toggle showed unchecked. Mock ./store so the rune store's persist is a
// no-op spy (as library-meta.svelte.test.ts does) and store.ts's OPFS code never loads.
const saveLibraryMeta = vi.fn(async () => {});
vi.mock("./store.js", () => ({ saveLibraryMeta }));

const { createLibraryStore } = await import("./library-meta.svelte.js");
type LibraryMeta = import("./store.js").LibraryMeta;

const BASE = "https://h.example/lib/";
const flush = () => new Promise<void>((r) => setTimeout(r, 600)); // past the patch* debounce, then settle

const twoExhibits = (): LibraryMeta => ({
  title: "L",
  exhibits: [
    { id: "e-shown", slug: "shown", title: "Shown", objects: [] },
    { id: "e-hidden", slug: "hidden", title: "Hidden", objects: [] },
  ],
});

/** Read the published exhibits.json off a MemoryFilesystem the way the viewer's hall does. */
async function readCards(fs: MemoryFilesystem): Promise<Array<{ slug: string; unlisted?: boolean }>> {
  const file = await (await fs.root()).getFile("exhibits.json");
  const json = JSON.parse(new TextDecoder().decode(await file.readable())) as { exhibits: Array<{ slug: string; unlisted?: boolean }> };
  return json.exhibits;
}

describe("unlist toggle — working store round trip (Archie-bdc0)", () => {
  it("patchExhibit(unlisted) → publish → exhibits.json card → import → working store stays hidden", async () => {
    const lib = createLibraryStore(twoExhibits(), {});

    // 1. The toggle's write: the DetailsEditor checkbox calls exactly this on the working store.
    lib.patchExhibit("hidden", { unlisted: true });
    expect(lib.meta.exhibits.find((e) => e.slug === "hidden")!.unlisted).toBe(true); // live, synchronous

    // 2. Publish: buildFullLibrary === workingToLibrary(meta); publishLibrary writes the site data tree.
    const library = workingToLibrary(lib.meta);
    const published = new MemoryFilesystem();
    await publishLibrary(published, library, () => [], { baseUrl: BASE });

    // 3. The published card carries the lever — the viewer hall/sitemap read this to hide it.
    const cards = await readCards(published);
    const bySlug = Object.fromEntries(cards.map((c) => [c.slug, c]));
    expect("unlisted" in bySlug["shown"]!).toBe(false); // default LISTED — no flag emitted
    expect(bySlug["hidden"]!.unlisted).toBe(true);

    // 4. Import that published tree back (loadLibrary + libraryToWorking = the studio import path) and the
    //    flag survives into a FRESH working store — so the re-opened toggle shows checked, not re-listed.
    const loaded = await loadLibrary(published);
    const reimported = libraryToWorking(loaded.library);
    const reBySlug = Object.fromEntries(reimported.exhibits.map((e) => [e.slug, e]));
    expect("unlisted" in reBySlug["shown"]!).toBe(false); // listed exhibit imports unchecked
    expect(reBySlug["hidden"]!.unlisted).toBe(true); // the re-list bug is closed — stays checked

    await flush(); // settle the store's fire-and-forget debounced persist
  });

  it("re-listing (patchExhibit unlisted:false) republishes with NO card flag", async () => {
    const lib = createLibraryStore(twoExhibits(), {});
    lib.patchExhibit("hidden", { unlisted: true });
    lib.patchExhibit("hidden", { unlisted: false }); // un-check the box again

    const published = new MemoryFilesystem();
    await publishLibrary(published, workingToLibrary(lib.meta), () => [], { baseUrl: BASE });
    const cards = await readCards(published);
    // A re-listed exhibit publishes as a plain card — workingToLibrary drops the falsy value.
    expect(cards.every((c) => !("unlisted" in c))).toBe(true);

    await flush();
  });
});

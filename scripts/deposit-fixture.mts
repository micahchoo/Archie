// Archie-039e — materialize a published tree (with fixity) and a BagIt deposit bag on DISK, so the
// two external gates can run against real files: `scripts/verify-publish.mjs` over the tree, and
// `bagit.py --validate` over the bag.
//
// Run via `scripts/bag-validate.mjs`, which spawns this under vite-node (render-core is a TS-source
// workspace package — see verify-publish.mjs's header for the full reason).
//
//   vite-node scripts/deposit-fixture.mts <outdir>
//     <outdir>/tree/   publishLibrary(..., { fixity: true })
//     <outdir>/bag/    writeBag(...)
//
// render-core has no node:fs Filesystem backend (every backend is FSA/OPFS/Zip/Tauri/Memory/Http), so
// this publishes into a MemoryFilesystem and dumps the finished tree to disk — the same unavoidable
// hand-roll verify-publish-run.mts documents on the read side.
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  MemoryFilesystem,
  publishLibrary,
  writeBag,
  asClientId,
  asExhibitId,
  asLibraryId,
  asObjectId,
  appendNew,
  type AnnotationLog,
  type Filesystem,
  type FsDirectory,
  type Library,
} from "@render/core";

const out = process.argv[2];
if (!out) {
  console.error("usage: deposit-fixture.mts <outdir>");
  process.exit(2);
}

const alice = asClientId("alice");

/** Deliberately awkward content: a UTF-8 title, an asset name with a space, two exhibits, a real
 *  annotation log. A bag validator that only ever sees `a.json` proves less than one that sees a
 *  path a naive manifest writer would mangle. */
const library: Library = {
  id: asLibraryId("deposit-fixture"),
  title: "Deposit Fixture — Quire I",
  summary: "A two-exhibit library used to gate the BagIt deposit export.",
  requiredStatement: { label: "Attribution", value: "Beinecke Rare Book & Manuscript Library" },
  metadata: [
    { property: "dcterms:publisher", value: "Yale University Library" },
    { property: "dcterms:creator", value: "M. Alexander" },
  ],
  exhibits: [
    {
      id: asExhibitId("exA"),
      slug: "quire-1",
      title: "Quire 1",
      objects: [{ id: asObjectId("o1"), source: "/assets/folio 1r.jpg", label: "f1r", width: 64, height: 64 }],
    },
    {
      id: asExhibitId("exB"),
      slug: "quire-2",
      title: "Quire 2",
      objects: [{ id: asObjectId("o2"), source: "/assets/folio2v.jpg", label: "f2v", width: 64, height: 64 }],
    },
  ],
};

const logA: AnnotationLog = appendNew([], {
  target: "https://example.invalid/deposit/quire-1/canvas/o1",
  body: { type: "TextualBody", value: "A note on the first folio." },
  lastEditor: alice,
  modifiedAt: "2026-07-27T00:00:00.000Z",
  now: 1,
}).log;
const getLog = (id: string): AnnotationLog => (id === "exA" ? logA : []);

// A few kB of deterministic pseudo-random bytes per asset — big enough that a truncation is a real
// byte change and not a coincidence, small enough to stay a fixture.
function assetBytes(seed: number): ArrayBuffer {
  const b = new Uint8Array(4096);
  for (let i = 0; i < b.length; i++) b[i] = (i * 2654435761 + seed) & 0xff;
  return b.buffer;
}

const publishOpts = {
  baseUrl: "https://example.invalid/deposit/",
  publishedAt: "2026-07-27T00:00:00.000Z",
  getAsset: async (_slug: string, name: string): Promise<ArrayBuffer> => assetBytes(name.length),
  getViewerBundle: async () =>
    new Map<string, string>([
      ["archie-viewer.js", "/* stand-in for the embed bundle */\n"],
      ["chunk-osd.js", "/* stand-in for the lazy canvas chunk */\n"],
    ]),
};

/** Dump a finished Filesystem tree to a real directory. */
async function dump(fs: Filesystem, dir: string): Promise<number> {
  let files = 0;
  const walk = async (d: FsDirectory, at: string): Promise<void> => {
    await mkdir(at, { recursive: true });
    const entries: { name: string; kind: "file" | "directory" }[] = [];
    for await (const e of d.entries()) entries.push(e);
    for (const e of entries) {
      if (e.kind === "directory") await walk(await d.getDirectory(e.name), join(at, e.name));
      else {
        await writeFile(join(at, e.name), new Uint8Array(await (await d.getFile(e.name)).readable()));
        files++;
      }
    }
  };
  await walk(await fs.root(), dir);
  return files;
}

await rm(out, { recursive: true, force: true });

const treeFs = new MemoryFilesystem();
const publishResult = await publishLibrary(treeFs, library, getLog, { ...publishOpts, fixity: true });
const treeFiles = await dump(treeFs, join(out, "tree"));

const bagFs = new MemoryFilesystem();
const bagResult = await writeBag(bagFs, library, getLog, publishOpts, { baggingDate: "2026-07-27" });
const bagFiles = await dump(bagFs, join(out, "bag"));

console.log(
  JSON.stringify(
    {
      tree: { files: treeFiles, manifestLines: publishResult.fixity?.length ?? 0 },
      bag: { files: bagFiles, payloadFiles: bagResult.payloadFiles, payloadBytes: bagResult.payloadBytes, oxum: bagResult.oxum },
    },
    null,
    2,
  ),
);

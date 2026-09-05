/** Published bytes for reader contract tests: base and Reading-only notes, AV, and remote resources. */
import {
  MemoryFilesystem, publishLibrary, appendNew, asClientId, asLibraryId, asExhibitId, asObjectId,
  type AnnotationLog, type Library,
} from "@render/core";

export async function readerContractFixture() {
  // A real one-second WAV gives browser metadata/paused assertions a decodable source.
  const wav = new Uint8Array(8044);
  const header = new DataView(wav.buffer);
  for (const [offset, text] of [[0, "RIFF"], [8, "WAVEfmt "], [36, "data"]] as const) {
    [...text].forEach((char, i) => { wav[offset + i] = char.charCodeAt(0); });
  }
  header.setUint32(4, 8036, true); header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, 8000, true); header.setUint32(28, 8000, true);
  header.setUint16(32, 1, true); header.setUint16(34, 8, true); header.setUint32(40, 8000, true);
  wav.fill(128, 44);
  const audioSource = `data:audio/wav;base64,${btoa(String.fromCharCode(...wav))}`;
  const baseUrl = "https://library.test/";
  const canvas = `${baseUrl}contracts/canvas/audio`;
  let log: AnnotationLog = [];
  const add = (value: string, reading?: string) => {
    const result = appendNew(log, {
      target: canvas, body: { type: "TextualBody", purpose: "commenting", value },
      lastEditor: asClientId("author"), modifiedAt: "2026-09-05", now: log.length + 1,
      ...(reading ? { reading } : {}),
    });
    log = result.log;
    return result.record.logicalId;
  };
  const wholeId = add("Whole recording context");
  const readingId = add("Exclusive cipher zebra interpretation", "cipher");
  const mediaId = add('Remote media ![Photo](https://tracker.test/note.png)\n\n<video src="https://tracker.test/note.mp4" poster="https://tracker.test/poster.png"></video>\n\n<audio src="https://tracker.test/note.wav"></audio>\n\n<img src="https://tracker.test/raw.png" srcset="https://tracker.test/large.png 2x">');
  const library: Library = {
    id: asLibraryId("contracts"), title: "Reader contracts",
    exhibits: [{
      id: asExhibitId("contracts"), slug: "contracts", title: "Contract exhibit",
      objects: [
        { id: asObjectId("audio"), label: "Audio", mediaType: "sound", source: audioSource, duration: 60 },
        { id: asObjectId("other"), label: "Other recording", mediaType: "sound", source: audioSource, duration: 60 },
        { id: asObjectId("image"), label: "Remote image", source: "https://tracker.test/image.jpg", thumbnail: "https://tracker.test/thumb.png" },
      ],
      readings: [{ id: "cipher", name: "Cipher", colour: "#336633" }],
      sections: [{ id: "opening", objectId: asObjectId("audio"), title: "Opening", prose: "Narrative ![Remote](https://tracker.test/prose.png)" }],
    }],
  };
  const fs = new MemoryFilesystem();
  await publishLibrary(fs, library, () => log, { baseUrl });
  const root = await fs.root();
  const galleryFile = await root.getFile("exhibits.json");
  const gallery = JSON.parse(new TextDecoder().decode(await galleryFile.readable()));
  gallery.exhibits[0].cover = "https://tracker.test/cover.png";
  const writer = await galleryFile.writable();
  await writer.write(JSON.stringify(gallery));
  await writer.close();
  return { fs, wholeId, readingId, mediaId };
}

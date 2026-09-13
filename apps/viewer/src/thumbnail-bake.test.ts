import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { asExhibitId, asObjectId, type Library } from "@render/core";
import { bakePngThumbnail, prepareCuratedThumbnails } from "./thumbnail-bake.js";

async function sourcePng(): Promise<ArrayBuffer> {
  const bytes = await sharp({
    create: { width: 1280, height: 800, channels: 4, background: { r: 31, g: 85, b: 63, alpha: 1 } },
  }).png().toBuffer();
  return Uint8Array.from(bytes).buffer;
}

describe("published screenshot thumbnails", () => {
  it("makes a 640px PNG without changing the source bytes", async () => {
    const source = await sourcePng();
    const before = new Uint8Array(source).slice();
    const thumbnail = await bakePngThumbnail(source);
    const metadata = await sharp(Buffer.from(thumbnail)).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(400);
    expect(thumbnail.byteLength).toBeLessThan(source.byteLength);
    expect(new Uint8Array(source)).toEqual(before);
  });

  it("adds only successfully encoded local PNGs to the curated exhibit", async () => {
    const good = await sourcePng();
    const library = {
      id: "thumbnail-test",
      title: "Thumbnail test",
      exhibits: [{
        id: asExhibitId("screenshots"), slug: "screenshots", title: "Screenshots",
        objects: [
          { id: asObjectId("good"), label: "Good", source: "/assets/good.png" },
          { id: asObjectId("bad"), label: "Bad", source: "/assets/bad.png" },
        ],
      }],
    } as Library;

    const prepared = await prepareCuratedThumbnails(library, async (_slug, name) =>
      name === "good.png" ? good : new Uint8Array([1, 2, 3]).buffer,
    );

    expect(prepared.count).toBe(1);
    expect(prepared.library.exhibits[0]?.objects[0]?.thumbnail).toBe("/assets-thumb/good.png");
    expect(prepared.library.exhibits[0]?.objects[1]?.thumbnail).toBeUndefined();
    expect(await prepared.getThumbnail("screenshots", "good.png")).not.toBeNull();
    expect(await prepared.getThumbnail("screenshots", "bad.png")).toBeNull();
  });
});

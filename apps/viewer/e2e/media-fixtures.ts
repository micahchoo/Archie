import type { Page } from "@playwright/test";

/** Serve the seed recording with real bytes and Range support so Chromium can seek it. */
export async function withRecording(page: Page, seconds = 296): Promise<void> {
  const rate = 8000;
  const samples = rate * seconds;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + samples, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32); header.writeUInt16LE(8, 34); header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  const body = Buffer.concat([header, Buffer.alloc(samples, 0x80)]);
  await page.route("https://archive.org/download/kryptogramm/**", (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()["range"] ?? "");
    if (!range) return route.fulfill({ status: 200, body, headers: { "content-type": "audio/wav", "accept-ranges": "bytes", "content-length": String(body.length) } });
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : body.length - 1;
    const slice = body.subarray(start, end + 1);
    return route.fulfill({ status: 206, body: slice, headers: { "content-type": "audio/wav", "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${body.length}`, "content-length": String(slice.length) } });
  });
}

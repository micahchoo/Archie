// READER seam tests. A live OSD can't run under happy-dom (read-mount.test.ts idiom), so we test the
// OFFLINE GATE and source classification — the parts that decide whether `createReadOnlyMount` is even
// reached. The mount itself (OSD construction) is covered at render-mount's seam, not re-tested here.
import { describe, it, expect } from "vitest";
import { isRemoteSource, openObject, OfflineRemoteBlockedError } from "./reader.js";
import type { AObject } from "@render/core";

const obj = (over: Partial<AObject>): AObject =>
  ({ id: "o1", source: "blob:fake", label: "Plate", ...over } as AObject);

describe("isRemoteSource — embedded (blob/data) is local, everything else is remote", () => {
  it("blob: source is local", () => {
    expect(isRemoteSource(obj({ source: "blob:abc" }))).toBe(false);
  });
  it("data: source is local", () => {
    expect(isRemoteSource(obj({ source: "data:image/png;base64,AAAA" }))).toBe(false);
  });
  it("https IIIF info.json is remote", () => {
    expect(isRemoteSource(obj({ source: "https://iiif.example.org/o1/info.json" }))).toBe(true);
  });
  it("a structured tileSource pointing at https is remote", () => {
    expect(isRemoteSource(obj({ source: "blob:abc", tileSource: { url: "https://t/0/0/0.png" } as never }))).toBe(true);
  });
  it("a structured tileSource of only blob URLs is local", () => {
    expect(isRemoteSource(obj({ source: "ignored", tileSource: { url: "blob:tiles" } as never }))).toBe(false);
  });
});

describe("openObject — offline gate refuses a remote source BEFORE touching OSD", () => {
  it("offline + remote source throws OfflineRemoteBlockedError (no mount attempted)", async () => {
    const container = document.createElement("div");
    await expect(
      openObject(container, { object: obj({ source: "https://iiif.example.org/o1/info.json" }), annotations: [], offline: true }),
    ).rejects.toBeInstanceOf(OfflineRemoteBlockedError);
  });
});

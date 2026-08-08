import { describe, it, expect } from "vitest";
import { createGenerationGuard } from "./generation-guard.js";
import { MIRROR_STAMP_FILE } from "./mirror-stamp.js";

/** A minimal in-memory Filesystem that actually STORES root files, so the generation stamp
 *  (.archie-mirror.json) round-trips and a test can simulate an EXTERNAL writer changing the token. */
function makeStampFs() {
  const files = new Map<string, string>();
  const root = {
    async getFile(name: string, opts?: { create?: boolean }) {
      if (!files.has(name) && !opts?.create) throw new Error("ENOENT");
      return {
        async readable() { return new TextEncoder().encode(files.get(name) ?? "").buffer; },
        async writable() { let buf = ""; return { async write(d: string) { buf += d; }, async close() { files.set(name, buf); } }; },
        async getFile() { return new File([files.get(name) ?? ""], name); },
      };
    },
    async getDirectory() { return root; },
    async remove() {},
    async *entries() {},
  };
  const fs = { root: async () => root } as never;
  return {
    fs,
    /** Simulate a second Archie window / sync tool writing a DIFFERENT token into the folder. */
    externalWrite(token = "external-writer-token") { files.set(MIRROR_STAMP_FILE, JSON.stringify({ v: 1, token })); },
    /** Corrupt the stamp file (unreadable) — the guard must treat this as "can't verify", not "changed". */
    corruptStamp() { files.set(MIRROR_STAMP_FILE, "not-json"); },
    currentToken() {
      const raw = files.get(MIRROR_STAMP_FILE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { token: string }; // our own stamp shape, written by writeMirrorToken
      return parsed.token;
    },
  };
}

describe("generation guard — adopt / verify / restamp protocol (Issue 25 row c)", () => {
  it("ADOPTS an existing on-disk token at mount, leaving it untouched", async () => {
    const stamp = makeStampFs();
    stamp.externalWrite("t0"); // a previous session's stamp is already on disk
    const guard = createGenerationGuard();

    await guard.adoptBaseline(stamp.fs);

    expect(stamp.currentToken()).toBe("t0"); // no fresh stamp written over the adopted one
    expect(await guard.verify(stamp.fs)).toBe(false); // folder is still "the one Archie adopted"
  });

  it("stamps a fresh token when the folder has none, and verifies clean", async () => {
    const stamp = makeStampFs();
    const guard = createGenerationGuard();

    await guard.adoptBaseline(stamp.fs);

    expect(stamp.currentToken()).not.toBeNull(); // Archie now owns the folder
    expect(await guard.verify(stamp.fs)).toBe(false);
  });

  it("detects an external token change mid-stream, then RESTAMPS after the write that reclaims the folder", async () => {
    const stamp = makeStampFs();
    const guard = createGenerationGuard();
    await guard.adoptBaseline(stamp.fs);

    // A second writer / sync tool rewrites the token between commits.
    stamp.externalWrite();
    expect(await guard.verify(stamp.fs)).toBe(true); // refuse before a blind incremental commit

    // Archie's successful write reclaims the folder: fresh token + adopted baseline.
    await guard.restamp(stamp.fs);
    expect(stamp.currentToken()).not.toBe("external-writer-token");
    expect(await guard.verify(stamp.fs)).toBe(false); // the next commit's check passes
  });

  it("opts out (never false-positives) with no baseline, a corrupt stamp, or after reset", async () => {
    const stamp = makeStampFs();
    const guard = createGenerationGuard();

    expect(await guard.verify(stamp.fs)).toBe(false); // no baseline yet (fresh session / just rebound)

    await guard.adoptBaseline(stamp.fs);
    stamp.corruptStamp();
    expect(await guard.verify(stamp.fs)).toBe(false); // unreadable token = "can't verify", not "changed"

    stamp.externalWrite();
    guard.reset(); // fresh binding — no baseline, verification off
    expect(await guard.verify(stamp.fs)).toBe(false);
  });
});

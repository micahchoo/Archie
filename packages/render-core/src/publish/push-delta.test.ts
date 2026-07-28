import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planPush, gitBlobSha, localBlobShas, EMPTY_REMOTE_TREE, UNKNOWN_REMOTE_TREE, type RemoteTreeIndex } from "./push-delta.js";
import type { FileContent } from "./ghpages.js";

// The incremental-push delta (Archie-53e3). Two independent things are proven here:
//   1. `gitBlobSha` really computes GIT's blob id — checked against `git hash-object` itself, not
//      against a constant this file made up. If it drifts, the push stops recognizing its own
//      previous uploads (slow, not wrong) — but the reference direction has to be right to be worth
//      anything at all.
//   2. `planPush` splits paths the way the transport needs, and every uncertain case lands on
//      toUpload. The dangerous direction is a wrong REFERENCE (skipping an upload the tree needed);
//      the truncation cases below are the ones that guard it.

/** The authority for a git blob id is git. Ask it. */
function gitHashObject(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "archie-blobsha-"));
  try {
    const f = join(dir, "probe.bin");
    writeFileSync(f, bytes);
    return execFileSync("git", ["hash-object", f], { encoding: "utf8" }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("gitBlobSha — the same object id git itself computes", () => {
  it("matches `git hash-object` for text, empty, unicode and binary content", async () => {
    const cases: { name: string; fc: FileContent; bytes: Uint8Array }[] = [
      { name: "ascii", fc: { text: "hello world" }, bytes: new TextEncoder().encode("hello world") },
      { name: "empty", fc: { text: "" }, bytes: new Uint8Array() },
      { name: "unicode (multi-byte — a char count would be wrong here)", fc: { text: "café ☕\n" }, bytes: new TextEncoder().encode("café ☕\n") },
      { name: "json page", fc: { text: '{"type":"Collection"}' }, bytes: new TextEncoder().encode('{"type":"Collection"}') },
      { name: "binary (non-utf8 bytes)", fc: { base64: Buffer.from([0, 1, 254, 255, 0]).toString("base64") }, bytes: new Uint8Array([0, 1, 254, 255, 0]) },
    ];
    for (const c of cases) {
      expect(await gitBlobSha(c.fc), c.name).toBe(gitHashObject(c.bytes));
    }
  });

  it("a one-byte change moves the sha (this is the whole basis of the skip decision)", async () => {
    const a = await gitBlobSha({ text: '{"title":"Herbal"}' });
    const b = await gitBlobSha({ text: '{"title":"Herbai"}' });
    expect(a).not.toBe(b);
  });

  it("localBlobShas keys every path and agrees with the single-file function", async () => {
    const files: Record<string, FileContent> = {
      "collection.json": { text: "{}" },
      "a/assets/pic.png": { base64: Buffer.from([1, 2, 3]).toString("base64") },
    };
    const shas = await localBlobShas(files);
    expect(Object.keys(shas).sort()).toEqual(["a/assets/pic.png", "collection.json"]);
    expect(shas["collection.json"]).toBe(await gitBlobSha({ text: "{}" }));
  });
});

describe("planPush — which files carry bytes, which name a sha, which drop out", () => {
  const remoteOf = (blobs: Record<string, string>): RemoteTreeIndex => ({ blobs, truncated: false });

  it("an UNCHANGED tree uploads nothing — every path references its existing blob", () => {
    const local = { "a.json": "sha-a", "b/pic.png": "sha-b", "c/tile.jpg": "sha-c" };
    const plan = planPush(local, remoteOf({ ...local }));
    expect(plan.toUpload).toEqual([]);
    expect(plan.toReference).toEqual(["a.json", "b/pic.png", "c/tile.jpg"]);
    expect(plan.toDelete).toEqual([]);
    expect(plan.truncated).toBe(false);
  });

  it("a ONE-OBJECT edit uploads only that object's files, out of a tile-heavy tree", () => {
    // 200 tiles for object one, 200 for object two; one tile of object two is re-rendered.
    const local: Record<string, string> = {};
    for (let i = 0; i < 200; i++) local[`one/tiles/${i}.jpg`] = `one-${i}`;
    for (let i = 0; i < 200; i++) local[`two/tiles/${i}.jpg`] = `two-${i}`;
    const remote = { ...local, "two/tiles/7.jpg": "two-7-OLD" };
    const plan = planPush(local, remoteOf(remote));
    expect(plan.toUpload).toEqual(["two/tiles/7.jpg"]);
    expect(plan.toReference).toHaveLength(399);
    expect(plan.toUpload.length + plan.toReference.length).toBe(Object.keys(local).length);
  });

  it("a NEW file is an upload, not a reference (absence is not a match)", () => {
    const plan = planPush({ "a.json": "sha-a", "new.json": "sha-new" }, remoteOf({ "a.json": "sha-a" }));
    expect(plan.toUpload).toEqual(["new.json"]);
    expect(plan.toReference).toEqual(["a.json"]);
  });

  it("a REMOVED exhibit's files show up as deletions — a stale exhibit must not survive republish", () => {
    const plan = planPush(
      { "kept/manifest.json": "sha-k" },
      remoteOf({ "kept/manifest.json": "sha-k", "gone/manifest.json": "sha-g", "gone/tiles/0.jpg": "sha-g0" }),
    );
    expect(plan.toDelete).toEqual(["gone/manifest.json", "gone/tiles/0.jpg"]);
    // Deletion is STRUCTURAL: the transport emits the complete tree, so a path outside `local` is
    // outside the pushed tree. Nothing in the plan instructs a delete, and nothing needs to.
    expect(plan.toUpload).toEqual([]);
    expect(plan.toReference).toEqual(["kept/manifest.json"]);
  });

  it("a RENAMED path uploads under the new name and reports the old one gone", () => {
    const plan = planPush({ "new-slug/manifest.json": "sha-m" }, remoteOf({ "old-slug/manifest.json": "sha-m" }));
    expect(plan.toUpload).toEqual(["new-slug/manifest.json"]);
    expect(plan.toDelete).toEqual(["old-slug/manifest.json"]);
  });

  it("a matching sha at a DIFFERENT path is not a match — the pairing is path-keyed", () => {
    const plan = planPush({ "a.json": "same-sha" }, remoteOf({ "b.json": "same-sha" }));
    expect(plan.toUpload).toEqual(["a.json"]);
    expect(plan.toReference).toEqual([]);
  });

  // --- the safe-direction guards ------------------------------------------------------------------
  // GitHub caps a recursive tree read at 100,000 entries / 7 MB and sets `truncated: true`. A cut
  // listing says what IS there and nothing about what is not, so reading an absence out of it would
  // SKIP an upload the tree needed. These pin the degradation.

  it("a TRUNCATED listing uploads everything, references nothing, and refuses to report deletions", () => {
    const local = { "a.json": "sha-a", "b.json": "sha-b" };
    const plan = planPush(local, { blobs: { "a.json": "sha-a", "stale.json": "sha-s" }, truncated: true });
    expect(plan.toUpload).toEqual(["a.json", "b.json"]);
    expect(plan.toReference).toEqual([]);
    // NOT ["stale.json"] — a partial listing under-reports deletions, and a plausible wrong number is
    // worse than none. The caller reads `truncated` instead.
    expect(plan.toDelete).toEqual([]);
    expect(plan.truncated).toBe(true);
  });

  it("UNKNOWN_REMOTE_TREE (an unreadable listing) behaves exactly like truncation", () => {
    const plan = planPush({ "a.json": "sha-a" }, UNKNOWN_REMOTE_TREE);
    expect(plan.toUpload).toEqual(["a.json"]);
    expect(plan.truncated).toBe(true);
  });

  it("EMPTY_REMOTE_TREE (a fresh branch) is a TRUSTWORTHY nothing — full upload, not truncated", () => {
    const plan = planPush({ "a.json": "sha-a" }, EMPTY_REMOTE_TREE);
    expect(plan.toUpload).toEqual(["a.json"]);
    expect(plan.truncated).toBe(false); // the distinction matters: nothing was hidden from us
  });

  it("an empty local tree is not a crash — everything remote is a deletion", () => {
    const plan = planPush({}, remoteOf({ "a.json": "sha-a" }));
    expect(plan.toUpload).toEqual([]);
    expect(plan.toReference).toEqual([]);
    expect(plan.toDelete).toEqual(["a.json"]);
  });

  it("every local path lands in exactly one of toUpload / toReference, always", () => {
    const local = { "a": "1", "b": "2", "c": "3", "d": "4" };
    for (const remote of [remoteOf({}), remoteOf({ a: "1" }), remoteOf({ a: "1", b: "x", z: "9" }), remoteOf(local)]) {
      const plan = planPush(local, remote);
      const covered = [...plan.toUpload, ...plan.toReference].sort();
      expect(covered).toEqual(Object.keys(local).sort());
      expect(new Set(covered).size).toBe(covered.length); // no path in both sets
    }
  });
});

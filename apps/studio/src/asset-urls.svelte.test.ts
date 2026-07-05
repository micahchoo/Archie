import { describe, it, expect } from "vitest";
import { createAssetUrls, type AssetUrlDeps, type AssetObject } from "./asset-urls.svelte.js";

// Masters-on-demand (SCALE-GALLERY Phase 1.2). The OPFS/blob-URL side effects are injected, so the
// mint/revoke lifecycle is exercised with fakes: `live` tracks un-revoked URLs (a leak = a URL that
// stays in `live` after it should have been freed).

/** A fake OPFS+URL layer. Assets whose "slug/name" is in `thumbs` have a baked thumbnail. readMaster
 *  always succeeds (the asset bytes exist). Every minted URL enters `live`; revoke removes it. */
function makeDeps(thumbs: Set<string> = new Set()): { deps: AssetUrlDeps; live: Set<string> } {
  const live = new Set<string>();
  let n = 0;
  const deps: AssetUrlDeps = {
    readMaster: async (slug, name) => { const u = `m:${slug}/${name}#${++n}`; live.add(u); return u; },
    readThumb: async (slug, name) => {
      if (!thumbs.has(`${slug}/${name}`)) return null;
      const u = `t:${slug}/${name}#${++n}`; live.add(u); return u;
    },
    revoke: (u) => { live.delete(u); },
    assetName: (src) => (src.startsWith("/assets/") ? src.slice("/assets/".length) : null),
  };
  return { deps, live };
}

const asset = (id: string, name: string, mediaType?: string): AssetObject =>
  ({ id, source: `/assets/${name}`, ...(mediaType ? { mediaType } : {}) });
const remote = (id: string, url: string): AssetObject => ({ id, source: url });

describe("asset-urls — eager thumb wave (resolveThumbs)", () => {
  it("resolves baked thumbs, falls back to the master for no-thumb assets, ignores non-assets", async () => {
    const { deps } = makeDeps(new Set(["s/a"])); // only o1's asset has a baked thumb
    const a = createAssetUrls(deps);
    await a.resolveThumbs("s", [asset("o1", "a"), asset("o2", "b"), remote("o3", "https://iiif/x")]);
    expect(a.ready).toBe(true);
    expect(a.thumbFor("o1")).toMatch(/^t:s\/a/); // baked thumb
    expect(a.thumbFor("o2")).toMatch(/^m:s\/b/); // no thumb → master fallback (rail plate)
    expect(a.thumbFor("o3")).toBe(""); // non-asset: not in the maps
  });

  it("does NOT mint a fallback master for a no-thumb AV asset (nothing paints its plate)", async () => {
    const { deps, live } = makeDeps(); // no baked thumbs at all
    const a = createAssetUrls(deps);
    await a.resolveThumbs("s", [asset("v1", "clip.mp4", "video"), asset("a1", "song.mp3", "sound")]);
    expect(a.thumbFor("v1")).toBe("");
    expect(a.thumbFor("a1")).toBe("");
    expect(live.size).toBe(0); // no wasted master reads for AV
  });

  it("revokes the previous exhibit's plate URLs on the next resolve (no leak)", async () => {
    const { deps, live } = makeDeps(new Set(["s1/a"]));
    const a = createAssetUrls(deps);
    await a.resolveThumbs("s1", [asset("o1", "a"), asset("o2", "b")]);
    const first = new Set(live);
    expect(first.size).toBe(2); // one thumb + one fallback master
    await a.resolveThumbs("s2", []);
    for (const u of first) expect(live.has(u)).toBe(false); // all previous URLs freed
  });
});

describe("asset-urls — on-demand master (ensureMaster / canvasSource / sourceReadyFor)", () => {
  it("mints the current asset's master; canvasSource + sourceReadyFor reflect the slot", async () => {
    const { deps } = makeDeps();
    const a = createAssetUrls(deps);
    const o1 = asset("o1", "a");
    await a.ensureMaster("s", o1);
    expect(a.masterReady).toBe(true);
    expect(a.canvasSource("s", o1)).toMatch(/^m:s\/a/);
    expect(a.sourceReadyFor("s", o1)).toBe(true);
  });

  it("a non-asset object needs no mint — source used directly, ready at once", async () => {
    const { deps, live } = makeDeps();
    const a = createAssetUrls(deps);
    const o = remote("o3", "https://iiif/x");
    await a.ensureMaster("s", o);
    expect(live.size).toBe(0); // nothing minted
    expect(a.canvasSource("s", o)).toBe("https://iiif/x");
    expect(a.sourceReadyFor("s", o)).toBe(true);
  });

  it("switching objects revokes the outgoing master and swaps the slot", async () => {
    const { deps, live } = makeDeps();
    const a = createAssetUrls(deps);
    const o1 = asset("o1", "a"), o2 = asset("o2", "b");
    await a.ensureMaster("s", o1);
    const firstMaster = a.canvasSource("s", o1);
    await a.ensureMaster("s", o2);
    expect(live.has(firstMaster)).toBe(false); // o1's master freed
    expect(a.canvasSource("s", o2)).toMatch(/^m:s\/b/);
    expect(a.sourceReadyFor("s", o1)).toBe(false); // slot no longer matches o1
    expect(a.sourceReadyFor("s", o2)).toBe(true);
    expect(live.size).toBe(1); // exactly one master alive
  });

  it("re-ensuring the object already in the slot is a no-op (no re-mint)", async () => {
    const { deps, live } = makeDeps();
    const a = createAssetUrls(deps);
    const o1 = asset("o1", "a");
    await a.ensureMaster("s", o1);
    const url = a.canvasSource("s", o1);
    await a.ensureMaster("s", o1);
    expect(a.canvasSource("s", o1)).toBe(url); // same URL
    expect(live.size).toBe(1);
  });

  it("MINTS for a same-id object in a different exhibit (ids repeat across exhibits — slug keys the slot)", async () => {
    const { deps } = makeDeps();
    const a = createAssetUrls(deps);
    await a.ensureMaster("A", asset("o1", "a")); // exhibit A, object o1 → slot A/o1
    const aMaster = a.canvasSource("A", asset("o1", "a"));
    await a.ensureMaster("B", asset("o1", "b")); // exhibit B ALSO has an "o1" — must MINT, not no-op
    expect(a.canvasSource("B", asset("o1", "b"))).toMatch(/^m:B\/b/);
    expect(a.canvasSource("B", asset("o1", "b"))).not.toBe(aMaster);
    expect(a.sourceReadyFor("A", asset("o1", "a"))).toBe(false); // A's slot is gone
  });
});

describe("asset-urls — an in-flight mint never clobbers a settled slot", () => {
  /** Deferred readMaster: each call parks a resolver; the test settles them in a controlled order. */
  function deferredDeps() {
    const live = new Set<string>();
    let n = 0;
    const pending: Array<(u: string) => void> = [];
    const deps: AssetUrlDeps = {
      readMaster: () => new Promise<string | null>((resolve) => {
        pending.push((u) => { live.add(u); resolve(u); });
      }),
      readThumb: async () => null,
      revoke: (u) => { live.delete(u); },
      assetName: (src) => (src.startsWith("/assets/") ? src.slice("/assets/".length) : null),
    };
    return { deps, live, pending, mk: () => `m#${++n}` };
  }

  it("a superseded switch drops its URL; only the last switch commits", async () => {
    const { deps, live, pending, mk } = deferredDeps();
    const a = createAssetUrls(deps);
    const o1 = asset("o1", "a"), o2 = asset("o2", "b");
    const p1 = a.ensureMaster("s", o1); // seq 1
    const p2 = a.ensureMaster("s", o2); // seq 2 — supersedes 1
    const u1 = mk(), u2 = mk();
    pending[0]!(u1); await p1; // o1 resolves late → superseded → its URL is revoked
    pending[1]!(u2); await p2; // o2 commits
    expect(live.has(u1)).toBe(false); // no leak from the abandoned mint
    expect(a.canvasSource("s", o2)).toBe(u2);
    expect(a.sourceReadyFor("s", o1)).toBe(false);
    expect(a.sourceReadyFor("s", o2)).toBe(true);
  });

  it("seedMaster (an import mid-mint) invalidates the in-flight mint — the seed survives", async () => {
    const { deps, live, pending, mk } = deferredDeps();
    const a = createAssetUrls(deps);
    const o = asset("o1", "a");
    const p = a.ensureMaster("s", o); // seq 1 — parks a mint
    a.seedMaster("s", "o1", "blob:seeded"); // an import lands mid-mint → bumps the token, fills the slot
    const stale = mk();
    pending[0]!(stale); await p; // the parked mint resolves LATE → must be dropped, not committed
    expect(a.canvasSource("s", o)).toBe("blob:seeded"); // the seed was NOT clobbered
    expect(live.has(stale)).toBe(false); // the abandoned mint's URL was revoked
  });
});

describe("asset-urls — ingest seams (seedMaster / setPlate) and teardown (revokeAll)", () => {
  it("seedMaster fills the slot so a just-imported object mounts against the blob", () => {
    const { deps } = makeDeps();
    const a = createAssetUrls(deps);
    const o = asset("o9", "new");
    a.seedMaster("s", "o9", "blob:master");
    expect(a.canvasSource("s", o)).toBe("blob:master");
    expect(a.sourceReadyFor("s", o)).toBe(true);
  });

  it("setPlate registers the rail plate and revokes a replaced one", () => {
    const { deps, live } = makeDeps();
    live.add("blob:old"); live.add("blob:newthumb");
    const a = createAssetUrls(deps);
    a.setPlate("o9", "blob:old");
    a.setPlate("o9", "blob:newthumb");
    expect(a.thumbFor("o9")).toBe("blob:newthumb");
    expect(live.has("blob:old")).toBe(false); // the replaced plate URL was freed
  });

  it("revokeAll frees thumbs, fallbacks, and the master slot", async () => {
    const { deps, live } = makeDeps(new Set(["s/a"]));
    const a = createAssetUrls(deps);
    await a.resolveThumbs("s", [asset("o1", "a"), asset("o2", "b")]);
    await a.ensureMaster("s", asset("o1", "a"));
    expect(live.size).toBeGreaterThan(0);
    a.revokeAll();
    expect(live.size).toBe(0);
    expect(a.ready).toBe(false);
    expect(a.thumbFor("o1")).toBe("");
  });
});

// Studio editor asset-URL resolution — the masters-on-demand cut out of App.svelte (SCALE-GALLERY
// Phase 1.2). Owns the OPFS `/assets/{name}` → blob: URL machinery the canvas + rail + overview read:
//
//   thumbUrls        — objId → baked THUMBNAIL blob (rail/overview plate). Resolved EAGERLY for the
//                      whole exhibit at open — the grid needs every plate.
//   railFallbackUrls — objId → MASTER blob standing in for a missing thumbnail (a legacy import that
//                      predates thumb-baking, or an image already smaller than THUMB_DIM). The eager
//                      wave mints these only for the no-thumb subset — normally EMPTY, since modern
//                      ingest always bakes (`ingest-flows.ts`).
//   masterUrl/Id     — a SINGLE-SLOT cache: the full-res MASTER (canvas/OSD source) for the object in
//                      view, minted ON DEMAND. The old open path minted a master blob per object though
//                      only one is ever shown — N never-viewed URLs pinning OPFS Files. Now the master
//                      is read only on `current` change, id-guarded so a rapid A→B→C switch commits only
//                      C's mint and revokes any superseded one.
//
// A `.svelte.ts` rune module (cf. exhibit-session.svelte.ts): the $state container `s` is never
// reassigned, so getters stay live across the module boundary. All OPFS/blob-URL access is injected
// (deps) so the mint/revoke lifecycle is unit-testable with fakes — the real readers hit OPFS +
// createObjectURL, browser-only.

/** An object as far as URL resolution cares — its id, `source` (`/assets/{name}` or a remote URL), and
 *  `mediaType` (absent/"image" for images; "sound"/"video" for AV, which have no rail plate to paint). */
export interface AssetObject {
  id: string;
  source: string;
  mediaType?: string;
}

export interface AssetUrlDeps {
  /** Resolve an OPFS master to a fresh blob: URL (caller revokes). Null if absent. (store.readAssetUrl) */
  readMaster: (slug: string, name: string) => Promise<string | null>;
  /** Resolve a baked thumbnail to a fresh blob: URL (caller revokes). Null if none baked. (store.readThumbUrl) */
  readThumb: (slug: string, name: string) => Promise<string | null>;
  /** Release a blob: URL (URL.revokeObjectURL). */
  revoke: (url: string) => void;
  /** The OPFS asset name for a source, or null for a non-asset (remote/IIIF) source. (store.isAsset slice) */
  assetName: (source: string) => string | null;
}

export function createAssetUrls(deps: AssetUrlDeps) {
  const s = $state<{
    thumbUrls: Record<string, string>;
    railFallbackUrls: Record<string, string>;
    ready: boolean; // the eager thumb wave completed for the open exhibit
    masterSlug: string | null; // which EXHIBIT the slot's object belongs to (object ids repeat across exhibits)
    masterId: string | null; // which object's master fills the slot
    masterUrl: string | null; // the current object's canvas/OSD master blob
    masterReady: boolean; // the current object's source is resolved (the canvas mount gate)
  }>({ thumbUrls: {}, railFallbackUrls: {}, ready: false, masterSlug: null, masterId: null, masterUrl: null, masterReady: false });
  // Monotonic mint token: ensureMaster stamps each call, and a resolve commits only if still current —
  // a rapid switch bumps the token, so an in-flight older mint drops its URL instead of clobbering.
  let mintSeq = 0;

  const revokeAll = (m: Record<string, string>) => { for (const u of Object.values(m)) deps.revoke(u); };
  function revokeThumbs() {
    revokeAll(s.thumbUrls);
    revokeAll(s.railFallbackUrls);
    s.thumbUrls = {};
    s.railFallbackUrls = {};
  }
  function revokeMaster() {
    if (s.masterUrl) deps.revoke(s.masterUrl);
    s.masterUrl = null;
    s.masterId = null;
    s.masterSlug = null;
    s.masterReady = false;
  }
  /** True when the slot holds THIS exhibit's THIS object (ids repeat across exhibits, so slug matters). */
  const slotMatches = (slug: string, obj: AssetObject) => s.masterSlug === slug && s.masterId === obj.id;
  /** An asset that paints a rail/overview plate — AV (sound/video) objects have none, so skip their mint. */
  const paintsPlate = (o: AssetObject) => !o.mediaType || o.mediaType === "image";

  return {
    // — reactive reads (live getters) —
    /** The eager thumb wave finished for the open exhibit. */
    get ready(): boolean { return s.ready; },
    /** The current object's canvas/OSD source is resolved — the raw mint flag (tests / debugging). */
    get masterReady(): boolean { return s.masterReady; },
    /** Is `obj`'s canvas/OSD source ready to mount? The gate the Canvas/AvEditor `{#key}` mounts behind:
     *  a non-asset is ready at once; an asset is ready only when its master is minted AND in the slot for
     *  THIS exhibit (so a switch away — or a same-id object in another exhibit — can't mount against the
     *  outgoing object's still-present master). */
    sourceReadyFor(slug: string, obj: AssetObject | undefined): boolean {
      if (!obj) return false;
      if (deps.assetName(obj.source) === null) return true;
      return s.masterReady && slotMatches(slug, obj);
    },
    /** The rail/overview plate URL for an object (baked thumb, else a master fallback). "" until resolved. */
    thumbFor(id: string): string { return s.thumbUrls[id] ?? s.railFallbackUrls[id] ?? ""; },
    /** The canvas/OSD source for the (current) object: a non-asset's own URL, or the minted master slot. */
    canvasSource(slug: string, obj: AssetObject | undefined): string {
      if (!obj) return "";
      if (deps.assetName(obj.source) === null) return obj.source; // non-asset (IIIF/remote) — used directly
      return slotMatches(slug, obj) ? (s.masterUrl ?? obj.source) : obj.source; // asset — the slot when it matches
    },

    /**
     * EAGER thumb wave at exhibit open. Resolves every asset's rail/overview plate — baked thumbnails
     * for the common case, plus a master fallback for the no-thumb subset (legacy imports; normally
     * empty). Masters for VIEWING are NOT minted here anymore — that's ensureMaster's job, per object.
     * Injected into exhibit-session's atomic `open` (awaited before the swap, so plates resolve with it).
     */
    async resolveThumbs(slug: string, objs: ReadonlyArray<AssetObject>): Promise<void> {
      revokeThumbs();
      // Also drop the master slot on exhibit open (belt-and-braces vs. object-id reuse across exhibits, and
      // it restores the blank-during-open canvas; the current object's master re-mints via ensureMaster).
      revokeMaster();
      s.ready = false;
      const assets = objs
        .map((o) => ({ o, name: deps.assetName(o.source) }))
        .filter((a): a is { o: AssetObject; name: string } => a.name !== null);
      const thumbs = await Promise.all(assets.map(async (a) => ({ a, url: await deps.readThumb(slug, a.name) })));
      // No baked thumb → fall back to the master AS the plate, but only for objects that HAVE a plate
      // (images); AV objects paint no plate, so minting their master here is pure waste.
      const need = thumbs.filter((t) => !t.url && paintsPlate(t.a.o));
      const fallbacks = await Promise.all(need.map(async (t) => ({ id: t.a.o.id, url: await deps.readMaster(slug, t.a.name) })));
      const thumbMap: Record<string, string> = {};
      for (const t of thumbs) if (t.url) thumbMap[t.a.o.id] = t.url;
      const fbMap: Record<string, string> = {};
      for (const f of fallbacks) if (f.url) fbMap[f.id] = f.url;
      s.thumbUrls = thumbMap;
      s.railFallbackUrls = fbMap;
      s.ready = true;
    },

    /**
     * Mint the CURRENT object's master ON DEMAND. Non-asset objects (IIIF/remote) need no mint — their
     * source is used directly, so `masterReady` flips true at once. An object already in the slot is a
     * no-op. Otherwise: stamp the mint, read the master, and commit only if a newer switch hasn't
     * superseded this one (else revoke the just-read URL — no leak, no stale canvas source).
     */
    async ensureMaster(slug: string, obj: AssetObject | undefined): Promise<void> {
      const name = obj ? deps.assetName(obj.source) : null;
      if (!obj || !name) { revokeMaster(); s.masterReady = true; return; }
      // Already in the slot for THIS exhibit — no re-mint. Bump the token so any older in-flight mint
      // (from a switch this call cancels) drops its result instead of clobbering the settled slot.
      if (slotMatches(slug, obj) && s.masterUrl) { ++mintSeq; s.masterReady = true; return; }
      const seq = ++mintSeq;
      s.masterReady = false;
      let url: string | null = null;
      try { url = await deps.readMaster(slug, name); } catch { url = null; } // an unexpected reject must not stick "Loading"
      if (seq !== mintSeq) { if (url) deps.revoke(url); return; } // superseded by a newer switch / seed
      revokeMaster(); // free the outgoing object's master before installing this one
      s.masterUrl = url; // null → canvasSource falls back to the raw source (a broken read fails visibly, not forever)
      s.masterId = obj.id;
      s.masterSlug = slug;
      s.masterReady = true;
    },

    /**
     * INGEST: seed a just-imported object's master into the slot BEFORE it becomes current, so the canvas
     * mounts against the blob (not the unresolved `/assets/` path) — closes the first-import OSD race
     * (`ingest-flows.ts`). The subsequent ensureMaster for this object no-ops (the slot already matches).
     * Bumps the mint token so an in-flight ensureMaster (an import fired mid-mint) can't overwrite the seed.
     */
    seedMaster(slug: string, id: string, url: string): void {
      revokeMaster();
      ++mintSeq;
      s.masterUrl = url;
      s.masterId = id;
      s.masterSlug = slug;
      s.masterReady = true;
    },

    /**
     * INGEST: register a just-imported object's rail/overview plate (its baked thumb, or its master when
     * no thumb was baked) so the plate shows before the next exhibit reopen re-runs resolveThumbs. A
     * SEPARATE URL from the master slot (the caller mints its own) — the slot is revoked on object switch
     * while the plate must persist for the exhibit.
     */
    setPlate(id: string, url: string): void {
      const prev = s.thumbUrls[id];
      if (prev && prev !== url) deps.revoke(prev);
      s.thumbUrls = { ...s.thumbUrls, [id]: url };
    },

    /** Free every blob: URL and reset — leaving an exhibit (backToLibrary) or deleting the loaded one. */
    revokeAll(): void {
      revokeThumbs();
      revokeMaster();
      s.ready = false;
    },
  };
}
export type AssetUrls = ReturnType<typeof createAssetUrls>;

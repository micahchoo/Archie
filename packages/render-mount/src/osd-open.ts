// osd-open — the ONE OpenSeadragon construction + open-await shared by both mounts (Phase 6 of the
// architecture deepening).
//
// Donor: mount.ts:74-221 (the OSD-construction half — tile-source building, crossOriginPolicy, the
// open/open-failed promise, showNavigationControl:false) and read-mount.ts's IDENTICAL block with
// its two differentiators. Both mounts now call `openOsdViewer` and keep only their wiring: the
// editor adds the Annotorious annotator after the open; the read-only path (ADR-0019) wires the
// DOM-SVG overlays instead. The mounts' parity is by construction: the options policy, the
// a11y naming and the open-await live here, once.
//
// `resolveOsdTileSources` (the native-fetch escape hatch, Archie-fada) moved here too — it was
// extracted from createMount and is the tile-source building this module needs; mount.ts re-exports
// it so existing importers (index.ts, mount-fetch.test.ts) keep resolving from "./mount.js".

import OpenSeadragon from "openseadragon";
import { xyzTileSource } from "./xyz.js";
import { dziOsdSource } from "./dzi.js";
import { applyCanvasA11y, type A11yViewerLike } from "./canvas-a11y.js";
import type { TileSource } from "@render/core";

/** The tileSources shape OpenSeadragon accepts (string URL, a `{type}`/custom config, or a parsed
 *  info.json object). Captured from OSD's own option type so the resolver stays byte-compatible. */
type OsdTileSourceInput = NonNullable<Parameters<typeof OpenSeadragon>[0]["tileSources"]>;

/**
 * The native-fetch escape hatch the packaged desktop app (Tauri) injects. The webview's own fetch fails
 * on CORS-restricted / cross-origin-redirecting hosts; these two calls route through Tauri's native http
 * instead. Absent on the web (and in every unit test) — the mount then uses the plain webview loader,
 * byte-identical to before. The mount NEVER imports `@tauri-apps/*`; the studio supplies the concrete
 * implementation (apps/studio/src/tauri-fs.ts) and passes it down as an option.
 */
export interface NativeFetch {
  /** Pull remote image bytes natively → a same-origin `blob:` URL (caller owns revoking it). */
  toBlobUrl(url: string): Promise<string>;
  /** Fetch + parse a remote JSON document natively (a IIIF `info.json`). */
  json(url: string): Promise<unknown>;
}

/** What resolveOsdTileSources hands back: the OSD input, plus any `blob:` URL it minted (so the caller
 *  revokes it on destroy — null when nothing was minted). */
export interface ResolvedTileSources {
  tileSources: OsdTileSourceInput;
  ownedBlobUrl: string | null;
}

/**
 * Resolve the OSD `tileSources` input for a classified source, routing remote images + IIIF info.json
 * through the injected native fetcher when present (desktop). Extracted from createMount so it's unit
 * testable without a real OSD/DOM (mount-fetch.test.ts).
 *
 * - `image` (a plain remote http(s) image): fetch the bytes natively → a same-origin `blob:` URL, so OSD
 *   `<img>`-loads same-origin bytes — no webview CORS, no WebGL taint. The minted URL is returned to revoke.
 * - `iiif`: fetch + parse `info.json` natively and hand OSD the parsed object as a DATA tile source
 *   (OSD's determineType → IIIFTileSource). This restores the OPEN of an info.json a webview XHR can't
 *   reach (302 / CORS). IIIF **tiles** deliberately stay on the webview `<img>` loader: a native per-tile
 *   fetch would cost one Tauri IPC round-trip per tile — dozens per deep-zoom viewport — for bytes the
 *   webview already fetches from any CORS-open tile host. A host that also blocks tile `<img>` CORS is a
 *   documented gap, not a regression (the pre-existing crossOriginPolicy behavior is unchanged).
 * - `xyz` / `dzi`: unchanged — a template slippy-map / a local baked pyramid, neither has the webview-CORS
 *   problem the native fetcher solves.
 *
 * A native-fetch throw is swallowed to the webview path, so the desktop result is never WORSE than web.
 */
export async function resolveOsdTileSources(
  ts: TileSource,
  nativeFetch?: NativeFetch,
): Promise<ResolvedTileSources> {
  if (nativeFetch) {
    try {
      if (ts.kind === "image" && /^https?:\/\//i.test(ts.url)) {
        const blob = await nativeFetch.toBlobUrl(ts.url);
        return { tileSources: { type: "image", url: blob }, ownedBlobUrl: blob };
      }
      if (ts.kind === "iiif" && /^https?:\/\//i.test(ts.infoUrl)) {
        const info = (await nativeFetch.json(ts.infoUrl)) as OsdTileSourceInput;
        return { tileSources: info, ownedBlobUrl: null };
      }
    } catch (e) {
      console.warn("[@render/mount] native fetch failed; falling back to the webview loader", e);
    }
  }
  const tileSources: OsdTileSourceInput =
    ts.kind === "image" ? { type: "image", url: ts.url }
    : ts.kind === "xyz" ? xyzTileSource(ts)
    : ts.kind === "dzi" ? dziOsdSource(ts) // a baked Deep Zoom pyramid (Q-9) — OSD reads it natively
    : ts.infoUrl;
  return { tileSources, ownedBlobUrl: null };
}

/** The opened OSD surface the open hook + failure cleanup need (minimal; the real Viewer satisfies it). */
export interface OpenOsdViewerLike {
  world: { getItemAt(i: number): unknown };
  destroy(): void;
}

export interface OpenOsdOptions {
  /** Cancel a pending open and destroy its viewer before it can continue loading tiles. */
  signal?: AbortSignal;
  /** OSD drawer choice. The read-only path forces `"canvas"` (the 2D canvas drawer): each WebGL
   *  drawer holds a scarce WebGL context, and several embeds on one page exhaust the browser's
   *  context cap ("WebGL context lost" on recipes/08). The editor keeps OSD's default WebGL drawer. */
  drawer?: "canvas" | "webgl";
  /** Desktop-only (Tauri) native-fetch escape hatch — see NativeFetch. Present on the editor mount
   *  only (the read-only path has no Tauri fetcher; resolveOsdTileSources degrades to the webview
   *  loader, byte-identical to before). */
  nativeFetch?: NativeFetch;
  /** Show the OSD locator mini-map (worklist 1.1). */
  locator?: boolean;
  /** Prefix for the open-failed log line ("[@render/mount]" vs "…read-only"). */
  logPrefix?: string;
  /** Optional post-open check running inside the open handler before the await resolves: call
   *  `reject` to fail the open (the read-only decode-cap guard), or return normally to resolve.
   *  A throw degrades upward — warn + let the open succeed. */
  onOpen?: (viewer: OpenOsdViewerLike, reject: (error: Error) => void) => void;
}

/**
 * Construct an OSD deep-zoom viewer over `container` and resolve once the image has opened — the
 * ONE construction + open-await both mounts share. Builds the tile source from the classified
 * `tileSource` (native-fetch resolution when present), applies the shared options policy
 * (crossOriginPolicy/timeout/maxZoomPixelRatio/gestureSettings — the true common block, differing
 * only by the drawer), names the canvas BEFORE the open await (V90), awaits open/open-failed, and
 * on failure releases what was minted before the open (the native-fetched image blob) and destroys
 * the viewer (the pre-existing leak on open-fail, closed in the same breath). Returns the opened
 * viewer + any blob URL the caller must revoke on destroy.
 */
export async function openOsdViewer(
  container: HTMLElement,
  tileSource: TileSource,
  opts: OpenOsdOptions = {},
): Promise<{ viewer: OpenSeadragon.Viewer; ownedBlobUrl: string | null }> {
  opts.signal?.throwIfAborted();
  const { tileSources, ownedBlobUrl } = await resolveOsdTileSources(tileSource, opts.nativeFetch);
  if (opts.signal?.aborted) {
    if (ownedBlobUrl) URL.revokeObjectURL(ownedBlobUrl);
    opts.signal.throwIfAborted();
  }
  const logPrefix = opts.logPrefix ?? "[@render/mount]";

  const viewer = OpenSeadragon({
    element: container,
    tileSources,
    ...(opts.drawer ? { drawer: opts.drawer } : {}),
    // Remote IIIF (e.g. iiif.archive.org) is cross-origin: without a crossOrigin request the tile images
    // taint the canvas and OSD's WebGL drawer refuses to paint them ("WebGL cannot be used to draw this
    // TiledImage because it has tainted data"). 'Anonymous' makes the requests CORS so WebGL can draw —
    // same-origin/blob: sources are unaffected; a (rare) non-CORS server then fails to load rather than
    // load-but-taint, which is no worse than the silent blank it produced before.
    crossOriginPolicy: "Anonymous",
    // Slow institutional IIIF backends were hitting the 30s default and dropping tiles — give them longer.
    timeout: 60000,
    showNavigationControl: false,
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
    immediateRender: true,
    maxZoomPixelRatio: 16, // fine-mark placement (anvil viewer.ts:94)
    minZoomImageRatio: 0.5,
    // RESIZE BEHAVIOUR IS OSD'S DEFAULT, AND THAT IS NOW A CHOICE RATHER THAN AN OVERSIGHT
    // (human ruling, 2026-07-26 — ADR-0019's layout row). We set no `autoResize` and no
    // `preserveImageSizeOnResize`, and nothing in either mount re-fits on a container change (the
    // editor's one `resize` handler only repositions navigator dots). So when the docked note row
    // opens or closes, the canvas changes height and OSD re-centres: the image TRANSLATES by half
    // the delta and its on-screen size is unchanged.
    //
    // That is deliberate. Dismissing a note gives its height back to the image, because the reader
    // dismissed it in order to see more image; the alternative — reserving the row permanently — is a
    // flat ~141px (25% of the canvas at 1280x720) paid in the common case where no note is open.
    //
    // `preserveImageSizeOnResize: true` was measured and REJECTED: it preserves size, not anchor, so
    // holding the scale across the growth forces a zoom change and moves the mark further. Over 20
    // runs of `selection.spec.ts`'s real-click assertion it took 17/20 passing to 9/20. If you are
    // here to stop the image moving, an ANCHOR-preserving resize (pin the top-left, extend downward)
    // is the unexplored option — not this one. `selection.spec.ts` pins the current behaviour.

    // Worklist 1.1: the locator mini-map (verified openseadragon@5.0.1 options — showNavigator/
    // navigatorPosition/navigatorSizeRatio/navigatorAutoFade).
    ...(opts.locator ? { showNavigator: true, navigatorPosition: "BOTTOM_RIGHT", navigatorSizeRatio: 0.15, navigatorAutoFade: true } : {}),
  });

  // V90 (Archie-3d55) — name the canvas IMMEDIATELY, before the open await below. OSD builds its
  // canvas div in the constructor, so there is nothing to wait for; and doing it here means the stop
  // is named even when the open later FAILS, which is the state a reader is most likely to be stuck
  // tabbing through. (The Annotorious layer is a separate call after the annotator exists — it isn't
  // in the DOM yet; that one is the editor mount's, applied post-annotator.)
  applyCanvasA11y(viewer as unknown as A11yViewerLike);

  let cancelOpen: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      cancelOpen = () => reject(opts.signal?.reason ?? new DOMException("Open cancelled", "AbortError"));
      opts.signal?.addEventListener("abort", cancelOpen, { once: true });
      if (opts.signal?.aborted) { cancelOpen(); return; }
      viewer.addOnceHandler("open", () => {
        if (!opts.onOpen) {
          resolve();
          return;
        }
        try {
          opts.onOpen(viewer as unknown as OpenOsdViewerLike, reject);
        } catch (err) {
          // A missing world item / API shape is non-fatal — degrade upward, let the open succeed.
          console.warn(`${logPrefix} open guard failed; opening anyway:`, err);
        }
        resolve(); // a no-op when onOpen already rejected
      });
      viewer.addOnceHandler("open-failed", (e: { message?: string }) => {
        console.error(`${logPrefix} OpenSeadragon open-failed:`, e.message ?? "unknown");
        reject(new Error("Couldn't load this media item."));
      });
    });
  } catch (e) {
    // Open failed: the mount rejects and the caller never gets a surface to destroy(), so release
    // the resources minted BEFORE the open here — the native-fetched image blob (else it orphans the
    // full remote bytes) and the viewer itself (pre-existing leak on open-fail, closed in the same
    // breath; both mounts now fail clean instead of leaving a dead viewer in the container).
    if (ownedBlobUrl) URL.revokeObjectURL(ownedBlobUrl);
    viewer.destroy();
    throw e;
  } finally {
    if (cancelOpen) opts.signal?.removeEventListener("abort", cancelOpen);
  }

  return { viewer, ownedBlobUrl };
}

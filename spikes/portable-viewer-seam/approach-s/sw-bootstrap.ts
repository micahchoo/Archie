// APPROACH S — registration + bytes-handoff bootstrap.  ⚠️ BROWSER-VERIFY-OWED ⚠️
//
// NONE of this is node-verifiable (no real ServiceWorkerContainer, no real Cache, no real
// cross-context messaging in happy-dom). It is implemented to expose the SHAPE of the problem and
// the cost, NOT to be trusted until a human runs it in a real browser on a real GH project site.
//
// THE TWO HARD FACTS this file makes concrete (these drive the ADR-0010 recommendation):
//
// 1. SCOPE on a GH PROJECT base path. A project site serves under `/repo/`. The SW file must be
//    served from a path whose scope COVERS `/repo/published/...`. A SW's default scope is its own
//    directory, so `sw.js` must sit at `/repo/sw.js` (or send `Service-Worker-Allowed`). On GH Pages
//    you cannot set that header, so the SW file MUST be emitted at the site root of the project,
//    i.e. `/<repo>/sw.js`, and registered with `{ scope: import.meta.env.BASE_URL }`.
//
// 2. "SW must be ACTIVE before the first fetch" + "SW CANNOT read OPFS/the opened File cross-context".
//    The recipient opens a `.archie.zip` via <input type=file> or `?src=`. Those bytes live in the
//    PAGE context. The SW runs in a SEPARATE worker context and has no handle to them. So the page
//    must (a) await `navigator.serviceWorker.ready`, THEN (b) postMessage the zip bytes (or an
//    OPFS path the SW can itself open) to the worker, and (c) only THEN render — because the very
//    first `fetch('published/<lib>/manifest.json')` must already hit a registry the SW has populated.
//    This is a genuine ordering hazard: render-before-handoff = blank exhibit on first paint.

import type { LibraryRegistry } from "./sw-handler.js";
import { ZipFilesystem } from "../../../packages/render-core/src/fs/zip.js";

/** A mutable registry the SW populates from postMessage handoffs (node-testable shape; the wiring
 *  around it is not). The real SW holds ONE of these in worker global scope. */
export class MutableRegistry implements LibraryRegistry {
  private readonly map = new Map<string, ZipFilesystem>();
  get(libraryId: string): ZipFilesystem | undefined {
    return this.map.get(libraryId);
  }
  /** Called from the SW `message` handler when the page hands over freshly-opened zip bytes. */
  register(libraryId: string, bytes: Uint8Array): void {
    this.map.set(libraryId, ZipFilesystem.fromZip(bytes));
  }
  /** Page closed the library / opened another → drop it so its cache namespace can't be reused. */
  unregister(libraryId: string): void {
    this.map.delete(libraryId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Everything below references `navigator`, `self`, `caches` — present only in a real browser/SW.
// Left as reference implementations the human runs in the browser-verify step. NOT imported by tests.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** PAGE side: register the SW, wait until it controls the page, then hand over the opened zip. */
export async function bootstrapPage(libraryId: string, zipBytes: Uint8Array): Promise<void> {
  // @ts-expect-error browser-only
  const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    // @ts-expect-error browser-only
    scope: import.meta.env.BASE_URL, // MUST cover /repo/published/* — fact #1
  });
  // @ts-expect-error browser-only
  await navigator.serviceWorker.ready; // fact #2: do NOT render before this resolves
  const worker = reg.active;
  // Transfer the bytes' buffer to the worker (zero-copy) so the SW can build its ZipFilesystem.
  worker?.postMessage({ kind: "archie:open", libraryId, zipBytes }, [zipBytes.buffer]);
  // The page must also await an ack here before first render — omitted; part of the browser-verify.
}

/** SW side: install the message + fetch listeners. Pseudo — `self` is the SW global. */
export function installServiceWorker(registry: MutableRegistry): void {
  // @ts-expect-error browser-only
  self.addEventListener("message", (e: MessageEvent) => {
    const d = e.data as { kind: string; libraryId: string; zipBytes: Uint8Array };
    if (d.kind === "archie:open") registry.register(d.libraryId, new Uint8Array(d.zipBytes));
  });
  // fetch listener wires handleArchiveFetch — see sw-handler.ts. (Also browser-verify-owed.)
}

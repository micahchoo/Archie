// Turn an OPEN LIBRARY into the probe's input (Archie-c367, feeding Archie-7280).
//
// `archive-probe.ts` was written for a folder PICK — the caller hands it names, sizes and whatever
// dimensions it could cheaply sample. The publish surface has a different, and better, source: the
// library is already ingested, so every object carries the width/height/duration that ingest measured.
// So the inventory this builds is FULLY SAMPLED (`confidence.imagesSampledFraction` comes back at 1 for
// an imported library) and the probe's byte model is grounded in real pixels rather than inferred ones.
//
// WHAT IT COSTS, and why it is chunked. The probe itself is cheap — measured 13–23 ms over a synthetic
// 10,000-entry inventory (see `archive-inventory.test.ts`'s header for the numbers), one frame's worth
// of jank at the very top of the range. The expensive half is THIS module: one OPFS stat per stored
// asset (`assetSize` → `getFileHandle` + `getFile().size`), which at library scale is thousands of
// round trips. `estimateLibraryBytes` in publish-flows already does exactly that pass, serially, on
// every size guard — this one runs it with bounded concurrency and yields the main thread between
// chunks, so a 10,000-object library cannot wedge the UI while the surface is opening.

import { mapLimit } from "@render/core";
import type { ProbedFile } from "./archive-probe.js";
import { assetSize, isAsset, ASSET_PREFIX } from "./store.js";
import type { ExhibitMeta } from "./store.js";

/** Objects statted per chunk before the scheduler hands the main thread back. 200 keeps a chunk's own
 *  work well inside a frame at the observed stat cost while keeping the number of yields (and so the
 *  wall-clock overhead of yielding) small on a big library. */
export const INVENTORY_CHUNK = 200;
/** Concurrent stats in flight. `PUBLISH_CONCURRENCY` (6) is the repo's fan-out width for exactly this
 *  kind of fs read; matching it means the probe cannot flood a backend the publish engine is sized for. */
export const INVENTORY_CONCURRENCY = 6;

/** Hand the main thread back so a paint (and any pending input) can happen between chunks. `setTimeout`
 *  rather than `queueMicrotask` deliberately: a microtask does NOT yield to the renderer, so a
 *  microtask-chunked loop is exactly as janky as an unchunked one while looking cooperative. */
const yieldToBrowser = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** One inventory entry before its size is known. */
interface Pending {
  slug: string;
  /** The stored asset file name, or null for a source Archie does not hold bytes for (remote/IIIF). */
  assetName: string | null;
  file: ProbedFile;
}

/** Bytes attributed to an object whose pixels Archie holds no local file for — a remote image or IIIF
 *  service. At publish these are fetched and (over the tiling threshold) sliced locally, so they are NOT
 *  free; modelling them at the archival WebP rate is the same arithmetic `archive-probe.ts` applies to a
 *  re-encoded master, and it is the honest direction: a remote-heavy library that would blow past a
 *  destination's ceiling says so, rather than reading as weightless. */
const REMOTE_BYTES_PER_PIXEL = 0.2971;

/** MIME for an object, preferring what ingest recorded. `probedKind` classifies on this, so an object
 *  whose `format` never made it into the model still lands in the right bucket via its media type. */
function mimeOf(o: { format?: string; mediaType?: string }): string {
  if (o.format) return o.format;
  if (o.mediaType === "sound") return "audio/mpeg";
  if (o.mediaType === "video") return "video/mp4";
  return "image/jpeg";
}

/** The file NAME the probe should see. For a stored asset that is the real one (its extension is what
 *  `inferredMime` falls back to); for a remote source it is synthesized from the object id so the entry
 *  is still classifiable and still uniquely named. */
function nameOf(o: { id: string; source: string }, assetName: string | null, mime: string): string {
  if (assetName) return assetName;
  const ext = mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
  return `${o.id}.${ext}`;
}

/**
 * The library as `ProbedFile[]`, ready for `probeArchive`.
 *
 * `onProgress` reports objects statted so far / total, once per chunk, so the surface can say
 * "checking your library…" with a number rather than an indeterminate spinner on a big library.
 */
export async function libraryInventory(
  exhibits: readonly ExhibitMeta[],
  onProgress?: (done: number, total: number) => void,
): Promise<ProbedFile[]> {
  const pending: Pending[] = [];
  for (const ex of exhibits) {
    for (const o of ex.objects) {
      const stored = isAsset(o.source) ? o.source.slice(ASSET_PREFIX.length) : null;
      const mime = mimeOf(o);
      const name = nameOf(o, stored, mime);
      pending.push({
        slug: ex.slug,
        assetName: stored,
        file: {
          name,
          // The probe rejects any path with a hidden segment; exhibit slugs never start with a dot, so
          // prefixing the slug is safe AND makes `folderNameFrom` return something meaningful.
          relativePath: `${ex.slug}/${name}`,
          type: mime,
          bytes: 0, // filled below
          ...(typeof o.width === "number" && typeof o.height === "number" ? { width: o.width, height: o.height } : {}),
          ...(typeof o.duration === "number" ? { durationSec: o.duration } : {}),
        },
      });
    }
  }

  const total = pending.length;
  for (let i = 0; i < total; i += INVENTORY_CHUNK) {
    const chunk = pending.slice(i, i + INVENTORY_CHUNK);
    await mapLimit(chunk, INVENTORY_CONCURRENCY, async (p) => {
      if (p.assetName !== null) {
        p.file.bytes = await assetSize(p.slug, p.assetName);
        return;
      }
      // No local file. Model it from the pixels ingest recorded; an object with no dimensions either
      // contributes nothing to bytes (it still counts as an object, so the file counts stay right).
      const px = (p.file.width ?? 0) * (p.file.height ?? 0);
      p.file.bytes = Math.round(px * REMOTE_BYTES_PER_PIXEL);
    });
    onProgress?.(Math.min(i + INVENTORY_CHUNK, total), total);
    // Yield AFTER the progress report so the caller's update is what gets painted in the gap.
    if (i + INVENTORY_CHUNK < total) await yieldToBrowser();
  }
  onProgress?.(total, total);
  return pending.map((p) => p.file);
}

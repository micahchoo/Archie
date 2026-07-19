// Bounded-concurrency map (SCALE-GALLERY): run `fn` over `items` with at most `limit` promises in
// flight, resolving to results in INPUT order. A single unbounded `Promise.all` over a large library
// floods the backend — hundreds of concurrent fs handles on FSA/OPFS, or the GH Contents-API secondary
// rate limit (see publish/ghpages.ts, which kept a private copy of this worker-pool before this module).
// The publish engine (publish/site.ts, iiif/image-index.ts, publish/working.ts) shares this one scheduler.

/** The publish/read fan-out width. Chosen in the ~6–8 band: enough to hide per-exhibit await latency
 *  across a 100-exhibit library, low enough to cap concurrent fs handles (each exhibit still fans its
 *  own objects out internally, so effective width is `limit × objects`). */
export const PUBLISH_CONCURRENCY = 6;

/** Map `items` through `fn` with at most `limit` concurrent invocations, preserving input order in the
 *  result. Order-preserving: `out[i]` is always `fn(items[i], i)`, regardless of completion order.
 *  A rejection propagates (the first to reject wins, mirroring `Promise.all`). */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

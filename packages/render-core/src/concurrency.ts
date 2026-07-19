// Bounded-concurrency map (SCALE-GALLERY): run `fn` over `items` with at most `limit` promises in
// flight, resolving to results in INPUT order. A single unbounded `Promise.all` over a large library
// floods the backend — hundreds of concurrent fs handles on FSA/OPFS, or the GH Contents-API secondary
// rate limit (see publish/ghpages.ts, which kept a private copy of this worker-pool before this module).
// The publish engine (publish/site.ts, iiif/image-index.ts, publish/working.ts) shares this one scheduler.

/** The publish/read fan-out width. Chosen in the ~6–8 band: enough to hide per-exhibit await latency
 *  across a 100-exhibit library, low enough to cap concurrent fs handles. NOTE the effective ceiling is
 *  MULTIPLIED where pools nest: publish/site.ts runs the inner history/readings `mapLimit` (6) INSIDE the
 *  outer per-exhibit pool (6) → ≈36 concurrent fs ops, ON TOP of the pre-existing uncapped per-object
 *  `Promise.all` inside each exhibit. Bumping this constant scales that product, not a single lane. */
export const PUBLISH_CONCURRENCY = 6;

/**
 * Map `items` through `fn` with at most `limit` concurrent invocations, preserving input order in the
 * result (`out[i]` is always `fn(items[i], i)`, regardless of completion order).
 *
 * FAILURE SEMANTICS (bail-fast, verified by the concurrency.test.ts regression): the FIRST rejection is
 * re-thrown to the caller, and once any item has failed the pool stops pulling UNSTARTED items — so a
 * failed publish cannot leave background workers writing into exhibit subtrees after the caller has moved
 * on (that straggler-vs-retry interleave is exactly the torn-write the render-core-data-integrity rule
 * guards). Items already IN FLIGHT at the moment of failure still run to completion — this is cooperative
 * bail, NOT cancellation; `fn` is never aborted mid-await, there is no AbortSignal. A caller that must
 * guarantee no residual writes has to await this call before retrying (publishLibrary does: the exhibit
 * pool is a single awaited `mapLimit`).
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let failure: unknown;
  let failed = false;
  const worker = async (): Promise<void> => {
    // Stop pulling new items the instant a sibling has failed — in-flight awaits finish naturally.
    while (next < items.length && !failed) {
      const i = next++;
      try {
        out[i] = await fn(items[i]!, i);
      } catch (e) {
        if (!failed) { failed = true; failure = e; }
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw failure;
  return out;
}

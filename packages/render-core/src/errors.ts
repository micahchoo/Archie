// Layer-zero shared errors (ticket C2). FailedReadError is the read stack's absent-vs-failed
// vocabulary (data-integrity contract #2): thrown by publish/read.ts's JsonSources AND fs/http.ts's
// HttpFilesystem — fs/ importing it from publish/ was a layering inversion, so the definition lives
// here, below both. publish/read.ts re-exports it (the reader's documented surface).

/**
 * A read that FAILED — as distinct from a resource that is genuinely ABSENT (Issue 23). `getOptional`'s
 * contract is: **`null` = absent (404 / file-not-found), THROW = failed (5xx / network error / torn JSON)**.
 * A failed optional read must never be silently read as "no data" — `readExhibitTree` catches this to flag
 * a partially-loaded exhibit instead of rendering it as complete. Carries the offending `path` + `cause`.
 */
export class FailedReadError extends Error {
  /** The HTTP status when the failure IS a non-OK response (an HTTP-shaped source sets it; a
   *  transport fault or torn body leaves it unset). Lets a caller preserve "server said no" vs
   *  "the network broke" without sniffing `cause` messages. */
  readonly status?: number;
  constructor(
    public readonly path: string,
    public override readonly cause?: unknown,
    opts?: { status?: number },
  ) {
    super(`failed to read ${path}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "FailedReadError";
    if (opts?.status !== undefined) this.status = opts.status;
  }
}

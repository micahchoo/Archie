/**
 * Contract types for the desktop "Publish to the web" flow.
 *
 * These shapes are the Wave-0 skeleton every later task consumes — the Rust
 * `#[tauri::command]`s (device flow, keyring, pack push), the JS orchestration
 * in `deploy-flows.svelte.ts`, and the `Publish.svelte` state machine all speak
 * in terms of the types declared here. They carry no runtime behavior.
 *
 * Two ratified decisions shape them (see `docs/decisions/archie.md`):
 *  - **Q-12** — the desktop GitHub session token persists in the OS keyring
 *    (`keyring` crate via a Tauri command), NOT plaintext on disk. Web posture
 *    is unchanged: nothing persisted.
 *  - **Q-13** — the desktop upload is a single git pack push (`git2` in
 *    `src-tauri`); per-blob REST survives only as the legacy browser-PAT path.
 *
 * BEHAVIORAL INVARIANT — the token never appears in a persisted or logged
 * structure. It lives only in {@link DeploySession} (in memory, for the life of
 * a publish) and in the OS keyring (Q-12). It is deliberately absent from
 * {@link DeployTarget}, {@link DeployProgress}, and {@link DeployError}: those
 * shapes are safe to serialize, log, and surface in the UI. A `token` field
 * must never be added to them.
 */

/**
 * The GitHub device-flow start response: a code the scholar types into GitHub,
 * plus the polling parameters. `deviceCode` is the opaque handle used to poll
 * for the token — it is not the human-visible `userCode`.
 */
export type DeviceStart = {
  /** The 6-digit code the scholar enters at `verificationUri`. */
  userCode: string;
  /** Where the scholar enters `userCode` (e.g. `https://github.com/login/device`). */
  verificationUri: string;
  /** Opaque handle passed back to poll for the token; never shown to the user. */
  deviceCode: string;
  /** Seconds to wait between polls (GitHub's floor; `slow-down` bumps it). */
  interval: number;
  /** Seconds until `deviceCode` expires and polling must stop. */
  expiresIn: number;
};

/**
 * A successful device-flow poll. The token is returned exactly once, here, and
 * is never logged (Q-12). Poll failures do NOT use this shape — they arrive as
 * a typed {@link DeployError}.
 */
export type DevicePollResult = { token: string };

/**
 * A typed deploy failure the author (or caller) can act on. `kind` distinguishes
 * the recoverable poll states (`auth-pending`, `slow-down`) from terminal auth
 * outcomes (`expired`, `denied`, `device-flow-disabled`), transport problems
 * (`network`, `rate-limited`), and the two deploy-stage failures (`push` for the
 * git2 pack push, `gh` for a GitHub REST call). No token field — safe to log.
 */
export type DeployError = {
  kind:
    | "auth-pending"
    | "slow-down"
    | "expired"
    | "denied"
    | "device-flow-disabled"
    | "network"
    | "rate-limited"
    | "push"
    | "gh";
  message: string;
  /** HTTP status when the failure originated from a GitHub response. */
  status?: number;
};

/**
 * An authenticated GitHub session, in memory for the life of a publish. Holds
 * the token (Q-12) — so this type is never persisted or logged as-is. Whether
 * the token also reached the OS keyring is deliberately NOT carried here: the
 * publish machine's `persistFailed` status reports a keyring miss at publish
 * time (the "sign in again next time" note), so a field here would be an
 * unread duplicate (Archie-b53d).
 */
export type DeploySession = {
  login: string;
  token: string;
};

/**
 * Where a publish lands. `branch` is fixed to `gh-pages` to match the engine
 * default (`ghpages.ts:57-64` `GitHubTarget`). Deliberately the `GitHubTarget`
 * shape **minus its token** — a `DeployTarget` is safe to persist as a
 * remembered target and to log; the token lives only in {@link DeploySession}.
 */
export type DeployTarget = {
  owner: string;
  repo: string;
  branch: "gh-pages";
};

/**
 * Coarse deploy progress for the UI. `staging`/`pushing` are the git2 pack-push
 * phases (Q-13); `creating-repo`/`enabling-pages` are the token-agnostic REST
 * steps; `pages-building` is GitHub's own build after the push lands. `detail`
 * carries a short human label (e.g. a filename or count) — never a token.
 */
export type DeployProgress = {
  phase:
    | "creating-repo"
    | "staging"
    | "pushing"
    | "enabling-pages"
    | "pages-building";
  detail?: string;
};

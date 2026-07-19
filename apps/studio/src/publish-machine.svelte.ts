// The "Publish to the web" dialog state machine (plan Task 10). The user-visible states + copy come
// STRAIGHT from docs/plans/GHPAGES-PUBLISH-UX.md §"Every dialog state" — this module OWNS the machine;
// Publish.svelte is a thin view over it.
//
// WHY a `.svelte.ts` and not just the component (deviates from Task 10's "Publish.svelte + its test"
// pathspec, flagged to main): studio tests run headless in the node env with NO DOM and no component-
// mounting library (vitest.config.ts `environment: "node"`), so a state machine trapped inside a
// `.svelte` template can't be driven in a test. The proven house pattern is logic-in-`.svelte.ts` +
// thin `.svelte` view (cf. library-meta.svelte.ts / .svelte.test.ts). It's also strictly SAFER per
// `.claude/rules/svelte-no-typecheck-net.md`: `tsc --noEmit` skips `.svelte` but DOES typecheck a
// `.svelte.ts`, so the copy-heavy transition logic gets a type net the template can't have.
//
// The machine takes its platform seams as injected deps (signIn / deploy / openUrl / copy / now) so the
// view wires the real deploy-flows (Task 13) while tests pass fakes. TOKEN SAFETY (Q-12): the token
// lives only inside the in-memory DeploySession this machine holds; it is never read into any copy,
// preview, or persisted target.

import { pagesUrlFor } from "@render/core";
import type { DeploySession, DeployTarget, DeployProgress, DeployError } from "./deploy/types.js";
import type { DeployResult } from "./deploy/deploy-flows.svelte.js";

/** Every screen the dialog can show. `name-taken` / `repo-picker` are the existing-repo paths (Task 11);
 *  `update-confirm` is the return-visit one-click re-publish and `manual-pages` the org-policy fallback
 *  (Task 12). `pages-building` is folded into the `publishing` checklist, not its own screen. */
export type PublishState =
  | "intro-desktop"
  | "device-code"
  | "auth-expired"
  | "auth-cancelled"
  | "auth-config-error"
  | "update-confirm"
  | "name-site"
  | "name-taken"
  | "repo-picker"
  | "publishing"
  | "success"
  | "manual-pages"
  | "error"
  | "advanced"
  | "web-intro";

/** States that represent real progress a close (Esc / scrim-click / the surface's own destination-chooser
 *  "‹ Back") must NOT discard (Archie-7d9b): a pending device code, an in-flight publish, or one that
 *  finished/failed while the surface was closed. `open()` resumes into these rather than recomputing the
 *  entry screen; the merged Publish surface reads this set too, to decide whether reopening should skip
 *  straight past the destination chooser into the wizard. */
const RESUMABLE_STATES: ReadonlySet<PublishState> = new Set<PublishState>([
  "device-code", "auth-expired", "publishing", "success", "manual-pages", "error",
]);
export function isResumableState(state: PublishState): boolean {
  return RESUMABLE_STATES.has(state);
}

/** Publish intent: `new` creates a fresh site (and must NOT clobber an existing repo — so it's pre-flight
 *  checked); `update` deliberately re-publishes into a repo the author already picked. */
export type PublishIntent = "new" | "update";

/** The platform seams the machine drives, injected so the view wires real deploy-flows and tests fake. */
export interface PublishMachineDeps {
  /** Running inside the Tauri desktop webview — the device flow only works here (CORS + keyring). */
  isTauriEnv: boolean;
  /** This build ships an OAuth client id — false hides "Continue with GitHub" (fork-safety, Q-12). */
  deviceFlowAvailable: boolean;
  /** Stable library identity: `title` seeds the default site name, `id` keys the remembered target. */
  library: { id: string; title: string };
  /** Where this library last deployed (Task 8 store) — prefills the return-visit target. */
  remembered?: { target: DeployTarget; url: string } | null;
  /** A session restored at startup (Task 13 wiring) — present ⇒ skip the intro straight to naming. */
  initialSession?: DeploySession | null;
  /** Device-flow sign-in: fires `onCode` before blocking on the poll, resolves the session or rejects
   *  a typed DeployError. Bound from `signInWithGitHub`. */
  signIn: (onCode: (c: { userCode: string; verificationUri: string; expiresIn: number }) => void) => Promise<DeploySession>;
  /** "Stay signed in" — save the token to the OS keyring; false = store unavailable (non-fatal, honest). */
  persistSession: (s: DeploySession) => Promise<boolean>;
  /** Sign out — forget the stored token (keyring clear). Bound from `signOut`; the return-visit
   *  "Sign out" affordance calls it, then the machine drops the in-memory session and shows the intro. */
  signOut: () => Promise<void>;
  /** The one-motion deploy (Task 8) — staging → repo → push → Pages, emitting progress. */
  deploy: (session: DeploySession, target: DeployTarget, onProgress: (p: DeployProgress) => void) => Promise<DeployResult>;
  /** Open a URL in the system browser (opener plugin on desktop). */
  openUrl: (url: string) => Promise<void>;
  /** Copy text to the clipboard (pre-copies the device code, copies the live URL). */
  copy: (text: string) => Promise<void>;
  /** Pre-flight: does this repo already exist under the account? Called ONLY for a `new` publish, so we
   *  never force-overwrite a repo the author didn't mean to (deploy force-replaces gh-pages). Optional —
   *  unwired, a `new` publish proceeds without the guard (Task 10's behavior). Wired in Task 13.
   *  `| undefined` is explicit (not just `?`) so the view can bind it through a live getter under
   *  `exactOptionalPropertyTypes` — a getter is always "present", so its value type must admit undefined. */
  checkRepoExists?: ((session: DeploySession, target: DeployTarget) => Promise<boolean>) | undefined;
  /** The author's existing repos (names), for the "update an existing site" picker
   *  (`GET /user/repos?per_page=100`, filtered client-side). Optional — unwired, the picker is unreachable.
   *  `| undefined` explicit for the same live-getter reason as `checkRepoExists` above. */
  listRepos?: ((session: DeploySession) => Promise<string[]>) | undefined;
  /** Re-attempt the Pages enable for the `manual-pages` fallback ([I did it — recheck]) — resolves true
   *  once GitHub reports the site enabled. Optional — unwired, the recheck button is hidden (the manual
   *  steps still stand). `| undefined` explicit for the same live-getter reason as `checkRepoExists`.
   *  Wired in Task 13. */
  recheckPages?: ((session: DeploySession, target: DeployTarget) => Promise<boolean>) | undefined;
  /** Clock seam so the countdown is testable. Defaults to `Date.now`. */
  now?: () => number;
}

/** The ordered publish checklist. Maps `DeployProgress` phases to the design's stepped copy
 *  (GHPAGES-PUBLISH-UX §click-by-click step 6). `pages-building` is a terminal "all done, GitHub is
 *  building" state handled separately. */
const PUBLISH_STEPS: ReadonlyArray<{ phase: DeployProgress["phase"]; label: string }> = [
  { phase: "staging", label: "Getting your library ready…" },
  { phase: "creating-repo", label: "Creating your site's home on GitHub…" },
  { phase: "pushing", label: "Uploading your library…" },
  { phase: "enabling-pages", label: "Switching your site on…" },
];

export type PublishStep = { label: string; status: "done" | "active" | "pending" };

/** Slugify a library title into a default GitHub repo / site name: lowercase, non-alphanumerics to
 *  single dashes, trimmed. Falls back to `my-library` for an all-symbol title. Task 11 hardens the
 *  in-field validation; this is only the prefill seed. */
export function slugifyTitle(title: string): string {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "my-library";
}

/** In-field validation for the site name: it's a bare GitHub repo name, so reject anything a pasted URL
 *  or `owner/repo` would carry (slashes, spaces, colons). GitHub repo names allow letters, numbers, and
 *  `. _ -` only. Empty is not an error here (the Publish button is separately disabled) — this only
 *  surfaces a message once the author has typed something wrong. */
export function validateSiteName(name: string): string {
  const n = name.trim();
  if (n === "") return "";
  if (!/^[A-Za-z0-9._-]+$/.test(n)) return "Enter just the name — no slashes, spaces, or full web addresses.";
  return "";
}

/** Plain-language copy for a deploy failure (GHPAGES-PUBLISH-UX §error-publish). `offerSignInAgain` is
 *  true only when GitHub rejected the token (401) — the recovery is a fresh sign-in, not a retry. */
export function errorCopyFor(err: DeployError): { message: string; offerSignInAgain: boolean } {
  switch (err.kind) {
    case "gh":
      if (err.status === 401)
        return { message: "GitHub didn't accept your sign-in — it may have expired or been signed out. Sign in again to keep going.", offerSignInAgain: true };
      if (err.status === 403)
        return { message: "GitHub turned this down. Your account may not have permission for this, or you've hit a rate limit — wait a moment and try again.", offerSignInAgain: false };
      if (err.status === 404)
        return { message: "GitHub couldn't find that repository. Check the name and try again.", offerSignInAgain: false };
      return { message: err.message || "GitHub couldn't finish the request. Try again in a moment.", offerSignInAgain: false };
    case "network":
      return { message: "Couldn't reach GitHub. Check your internet connection, then try again.", offerSignInAgain: false };
    case "rate-limited":
      return { message: "GitHub is asking us to slow down. Wait a minute, then try again.", offerSignInAgain: false };
    case "push":
      return { message: err.message || "Something went wrong while uploading your library. Try publishing again.", offerSignInAgain: false };
    case "device-flow-disabled":
      return { message: "This build isn't set up for GitHub sign-in. Open “I already use GitHub” to publish with a token instead.", offerSignInAgain: false };
    default:
      return { message: err.message || "Something went wrong. Try again.", offerSignInAgain: false };
  }
}

/** Normalize any thrown value to a typed DeployError (deploy-flows already rejects typed; this guards
 *  the fake/unknown case in tests and defensive paths). */
function asDeployError(e: unknown): DeployError {
  if (typeof e === "object" && e !== null && typeof (e as { kind?: unknown }).kind === "string")
    return e as DeployError;
  return { kind: "push", message: e instanceof Error ? e.message : String(e) };
}

export function createPublishMachine(deps: PublishMachineDeps) {
  const now = deps.now ?? (() => Date.now());

  // The single $state container is never reassigned (only its fields), so cross-module reads stay live
  // through the getters below (the library-meta.svelte.ts rune rule).
  const s = $state<{
    state: PublishState;
    session: DeploySession | null;
    code: { userCode: string; verificationUri: string; expiresIn: number } | null;
    expiresAt: number;
    tick: number; // bumped by the view's 1s interval so `remainingSeconds` recomputes reactively
    owner: string;
    repo: string;
    intent: PublishIntent;
    updateTargetRepo: string; // the repo an explicit "update existing" locked onto — editing away from it reverts to `new`
    repoList: string[]; // the author's repos, loaded for the picker
    repoFilter: string; // client-side filter over repoList
    staySignedIn: boolean;
    progress: DeployProgress | null;
    result: DeployResult | null;
    error: DeployError | null;
    persistFailed: boolean; // "couldn't stay signed in" — surfaced on success, non-fatal
    recheckPending: boolean; // manual-pages: a [recheck] round-trip is in flight
    recheckSaysOff: boolean; // manual-pages: the last recheck came back "still not on" (honest, non-fatal)
  }>({
    state: "intro-desktop",
    session: null,
    code: null,
    expiresAt: 0,
    tick: 0,
    owner: "",
    repo: "",
    intent: "new",
    updateTargetRepo: "",
    repoList: [],
    repoFilter: "",
    staySignedIn: true,
    progress: null,
    result: null,
    error: null,
    persistFailed: false,
    recheckPending: false,
    recheckSaysOff: false,
  });

  /** Compute the opening screen from the runtime + any restored session (GHPAGES-PUBLISH-UX §states). A
   *  signed-in return visit to a library that has published before opens straight on the one-click
   *  `update-confirm`; a signed-in first publish opens on naming; signed-out opens the intro. */
  function computeInitial(): PublishState {
    if (!deps.isTauriEnv) return "web-intro"; // device flow is CORS-impossible in a browser tab
    if (deps.initialSession) return deps.remembered ? "update-confirm" : "name-site";
    return "intro-desktop";
  }

  function seedTarget(): void {
    s.owner = s.session?.login ?? deps.remembered?.target.owner ?? "";
    s.repo = deps.remembered?.target.repo ?? slugifyTitle(deps.library.title);
    // A remembered target is a repo the author has already published to — updating it is the intent, so
    // don't pre-flight it as "name taken". A fresh library slugs to a `new` site.
    if (deps.remembered) { s.intent = "update"; s.updateTargetRepo = s.repo; }
    else { s.intent = "new"; s.updateTargetRepo = ""; }
  }

  function targetOf(): DeployTarget {
    return { owner: s.owner.trim(), repo: s.repo.trim(), branch: "gh-pages" };
  }

  function goToNameSite(): void {
    seedTarget();
    s.state = "name-site";
  }

  /** (Re)compute the opening state — call when the dialog opens. Session-resumable (Archie-7d9b): if
   *  we're sitting on real progress (a pending device code, an in-flight publish, or one that finished or
   *  failed while the surface was closed), stay there instead of recomputing the entry screen — a close
   *  mid-auth is a clean, non-destructive cancel, not a reset. An expired device code is the one resumable
   *  state that itself transitions, to the plain start-again sentinel. */
  function open(): void {
    if (isResumableState(s.state)) {
      if (s.state === "device-code" && s.code && now() >= s.expiresAt) s.state = "auth-expired";
      if (deps.initialSession) s.session = deps.initialSession;
      return;
    }
    s.error = null;
    s.progress = null;
    s.result = null;
    s.recheckPending = false;
    s.recheckSaysOff = false;
    if (deps.initialSession) s.session = deps.initialSession;
    s.state = computeInitial();
    if (s.state === "name-site" || s.state === "update-confirm") seedTarget();
  }

  /** Acknowledge a finished attempt (success / manual-pages / error) and return to the normal entry screen
   *  for the next visit — called when the author explicitly dismisses the result (Done / Cancel on a
   *  terminal screen), as opposed to an Esc/close mid-flight, which must never clear anything. */
  function dismissResult(): void {
    s.result = null;
    s.error = null;
    s.state = computeInitial();
    if (s.state === "name-site" || s.state === "update-confirm") seedTarget();
  }

  /** Start (or restart) the device flow: surface the code, pre-copy it, then block on the poll and
   *  auto-advance to naming on success. Typed rejections route to the right recovery screen. */
  async function continueWithGitHub(): Promise<void> {
    s.error = null;
    try {
      const session = await deps.signIn((c) => {
        s.code = c;
        s.expiresAt = now() + c.expiresIn * 1000;
        s.tick = 0;
        s.state = "device-code";
        void deps.copy(c.userCode).catch(() => {}); // pre-copy is a courtesy — a clipboard denial is silent
      });
      s.session = session;
      goToNameSite();
    } catch (e) {
      const err = asDeployError(e);
      if (err.kind === "denied") s.state = "auth-cancelled";
      // The code died — show the plain start-again sentinel (Archie-7d9b), never silently re-mint. A
      // silent restart here (the old behavior) swaps the visible code out from under an author who's
      // still looking at it, AND — worse — turns a closed surface into a background re-mint loop: since
      // this poll runs independently of the component's lifecycle, an abandoned auth attempt would keep
      // calling deps.signIn() again every ~15min for as long as the app stays open (an unbounded
      // gh_device_start rate-limit risk), and because each re-mint refreshes `expiresAt`, open()'s own
      // client-side expiry check could never fire — the code always LOOKED fresh, never actually was.
      else if (err.kind === "expired") { s.code = null; s.state = "auth-expired"; }
      else if (err.kind === "device-flow-disabled") { s.error = err; s.state = "auth-config-error"; }
      else { s.error = err; s.state = "error"; }
    }
  }

  /** Open github.com/login/device in the system browser for the user to enter the code. */
  async function openDevicePage(): Promise<void> {
    if (s.code) await deps.openUrl(s.code.verificationUri).catch(() => {});
  }

  /** Copy the device code again (the [Copy code] button; it was already pre-copied on entry). */
  async function copyCode(): Promise<void> {
    if (s.code) await deps.copy(s.code.userCode).catch(() => {});
  }

  /** From auth-cancelled: the old code is dead and non-reusable, so this is a full restart. */
  function retryAuth(): void {
    s.code = null;
    void continueWithGitHub();
  }

  function openAdvanced(): void { s.state = "advanced"; }
  function backToIntro(): void { s.state = computeInitial(); }

  /** Publish from the name step. A `new` site is pre-flight checked so we never force-overwrite an
   *  existing repo (deploy replaces gh-pages wholesale) — a hit routes to `name-taken`. An `update`
   *  goes straight through (the author already chose that repo). */
  async function publish(): Promise<void> {
    if (!s.session || validateSiteName(s.repo) !== "" || s.repo.trim() === "") return;
    if (s.intent === "new" && deps.checkRepoExists) {
      s.error = null;
      let exists: boolean;
      try {
        exists = await deps.checkRepoExists(s.session, targetOf());
      } catch (e) {
        // Can't verify the name is free → don't risk clobbering. Surface it instead of pushing blind.
        s.error = asDeployError(e);
        s.state = "error";
        return;
      }
      if (exists) { s.state = "name-taken"; return; }
    }
    await runDeploy();
  }

  /** Persist (if opted in), then run the one-motion deploy. Assumes the name is settled + safe to write. */
  async function runDeploy(): Promise<void> {
    if (!s.session) return;
    const session = s.session;
    s.state = "publishing";
    s.progress = null;
    s.error = null;
    s.persistFailed = false;
    if (s.staySignedIn) {
      // Best-effort, non-fatal: a keyring miss just means re-auth next launch (deploy-flows contract).
      const ok = await deps.persistSession(session).catch(() => false);
      s.session = { ...session, persisted: ok };
      s.persistFailed = !ok;
    }
    try {
      const res = await deps.deploy(s.session, targetOf(), (p) => (s.progress = p));
      s.result = res;
      // The commit landed. If GitHub couldn't auto-enable Pages (org policy / private repo), the author
      // flips one switch themselves — a full `manual-pages` screen, not a footnote on success.
      s.state = res.manualPagesNeeded ? "manual-pages" : "success";
    } catch (e) {
      s.error = asDeployError(e);
      s.state = "error";
    }
  }

  // --- existing-repo paths (name-taken + picker) ---

  /** From name-taken: keep creating a new site — go back to the name field to pick another. */
  function useNewName(): void {
    s.intent = "new";
    s.updateTargetRepo = "";
    s.state = "name-site";
  }

  /** From name-taken: publish into the repo of that name after all (deliberate update). */
  function updateExisting(): void {
    s.intent = "update";
    s.updateTargetRepo = s.repo.trim();
    void runDeploy();
  }

  /** Open the "update a different existing site" picker — load the author's repos, then show the list. */
  async function openPicker(): Promise<void> {
    if (!s.session || !deps.listRepos) return;
    s.repoFilter = "";
    try {
      s.repoList = await deps.listRepos(s.session);
    } catch {
      s.repoList = []; // an empty list is honest; the author can still go back and type a name
    }
    s.state = "repo-picker";
  }

  /** Choose an existing repo from the picker → update it (back to the name step to confirm + preview). */
  function chooseRepo(name: string): void {
    s.repo = name;
    s.intent = "update";
    s.updateTargetRepo = name;
    s.state = "name-site";
  }

  // --- return visit: update-confirm (Task 12) ---

  /** [Publish update] on the return visit: the author already published this library here, so update the
   *  remembered repo directly — no name-taken pre-flight (that guard exists only to protect a NEW site
   *  from clobbering a stranger's repo; here the author owns this one and means to overwrite it). */
  function publishUpdate(): void {
    s.intent = "update";
    s.updateTargetRepo = s.repo.trim();
    void runDeploy();
  }

  /** "Publish somewhere else…" — leave the one-click confirm for the full naming step (where they can type
   *  a new name or open the picker to update a different existing site). Editing the name away from the
   *  remembered repo reverts intent to `new` via the `repo` setter, so a fresh name is re-checked. */
  function publishElsewhere(): void {
    s.state = "name-site";
  }

  /** "Sign out" — forget the stored token, drop the in-memory session, and return to the signed-out intro.
   *  The keyring clear is best-effort (a failure still signs the author out of this session). */
  async function doSignOut(): Promise<void> {
    await deps.signOut().catch(() => {});
    s.session = null;
    s.code = null;
    s.state = "intro-desktop"; // signed out ⇒ the intro, regardless of a stale live `initialSession` dep
  }

  // --- fallback: manual-pages (Task 12) ---

  /** [I did it — recheck] on the manual-pages fallback: re-attempt the Pages enable. Success promotes to
   *  the live-site screen; "still not on" is surfaced honestly (the author may need another moment) rather
   *  than thrown. A no-op if the recheck seam is unwired. */
  async function recheck(): Promise<void> {
    if (!s.session || !deps.recheckPages) return;
    s.recheckPending = true;
    s.recheckSaysOff = false;
    try {
      const enabled = await deps.recheckPages(s.session, targetOf());
      if (enabled) {
        if (s.result) s.result = { ...s.result, manualPagesNeeded: false };
        s.state = "success";
      } else {
        s.recheckSaysOff = true;
      }
    } catch {
      s.recheckSaysOff = true; // a transient recheck failure is not the author's problem to debug
    } finally {
      s.recheckPending = false;
    }
  }

  /** From an error screen: retry the deploy (or, after a 401, this is wired to sign-in-again in the view). */
  function retryPublish(): void {
    if (s.session) void publish();
    else s.state = "intro-desktop";
  }

  /** After a 401: the token was rejected — restart the device flow. */
  function signInAgain(): void {
    s.session = null;
    s.code = null;
    void continueWithGitHub();
  }

  async function openSite(): Promise<void> {
    if (s.result) await deps.openUrl(s.result.url).catch(() => {});
  }
  async function copyLink(): Promise<void> {
    if (s.result) await deps.copy(s.result.url).catch(() => {});
  }

  /** Advance the countdown clock (the view calls this once a second while on device-code). */
  function tick(): void { s.tick++; }

  return {
    // --- reactive reads (live through getters, per the cross-module rune rule) ---
    get state(): PublishState { return s.state; },
    get code() { return s.code; },
    get session(): DeploySession | null { return s.session; },
    get owner(): string { return s.owner; },
    set owner(v: string) { s.owner = v; },
    get repo(): string { return s.repo; },
    // Editing the name away from an explicitly-chosen update target reverts intent to `new` (so it's
    // re-checked before we'd overwrite a different repo).
    set repo(v: string) { s.repo = v; if (v.trim() !== s.updateTargetRepo) s.intent = "new"; },
    get intent(): PublishIntent { return s.intent; },
    get staySignedIn(): boolean { return s.staySignedIn; },
    set staySignedIn(v: boolean) { s.staySignedIn = v; },
    get repoFilter(): string { return s.repoFilter; },
    set repoFilter(v: string) { s.repoFilter = v; },
    get progress(): DeployProgress | null { return s.progress; },
    get result(): DeployResult | null { return s.result; },
    get error(): DeployError | null { return s.error; },
    get persistFailed(): boolean { return s.persistFailed; },
    get recheckPending(): boolean { return s.recheckPending; },
    get recheckSaysOff(): boolean { return s.recheckSaysOff; },

    /** The remembered live URL for the return-visit confirm ("Update {url}…"). */
    get updateUrl(): string { return deps.remembered?.url ?? ""; },
    /** GitHub's per-repo Pages settings deep link — the manual-pages fallback sends the author here. */
    get pagesSettingsUrl(): string { return `https://github.com/${s.owner.trim()}/${s.repo.trim()}/settings/pages`; },
    /** Whether the [I did it — recheck] button is offered (the recheck seam is wired). */
    get canRecheck(): boolean { return !!deps.recheckPages; },

    /** Whether the "Continue with GitHub" affordance is offered at all (desktop + configured). */
    get canContinueWithGitHub(): boolean { return deps.isTauriEnv && deps.deviceFlowAvailable; },

    /** Seconds left on the device code, mm:ss-ready. Reads `s.tick` so the view's interval refreshes it. */
    get remainingSeconds(): number {
      s.tick; // reactive dependency — recompute each tick
      return Math.max(0, Math.ceil((s.expiresAt - now()) / 1000));
    },
    get countdownLabel(): string {
      const total = this.remainingSeconds;
      const m = Math.floor(total / 60);
      const sec = total % 60;
      return `${m}:${sec.toString().padStart(2, "0")}`;
    },

    /** The publish checklist with per-step status, for the stepped `publishing` UI. */
    get steps(): PublishStep[] {
      const phase = s.progress?.phase ?? "staging";
      // pages-building = every push step done, GitHub now building.
      const idx = phase === "pages-building" ? PUBLISH_STEPS.length : PUBLISH_STEPS.findIndex((x) => x.phase === phase);
      const cur = idx < 0 ? 0 : idx;
      return PUBLISH_STEPS.map((step, i) => {
        const status: PublishStep["status"] = i < cur ? "done" : i === cur ? "active" : "pending";
        const label = i === cur && s.progress?.detail ? `${step.label.replace(/…$/, "")} — ${s.progress.detail}…` : step.label;
        return { label, status };
      });
    },
    get buildingPages(): boolean { return s.progress?.phase === "pages-building"; },

    /** Plain-language error copy + whether to offer "Sign in again" (401 only). */
    get errorCopy(): { message: string; offerSignInAgain: boolean } {
      return s.error ? errorCopyFor(s.error) : { message: "", offerSignInAgain: false };
    },

    // --- name-site (Task 11) ---

    /** Validation message for the current site name ("" when valid or still empty). */
    get nameError(): string { return validateSiteName(s.repo); },
    /** Whether the name is publishable (non-empty + valid). */
    get canPublish(): boolean { return s.repo.trim() !== "" && this.nameError === ""; },

    /** The live "Your site will live at ___" preview (GHPAGES-PUBLISH-UX §name-site). `isUserSite` is the
     *  `{login}.github.io` root-site case; otherwise it's a project site at `/{repo}/` and `userSiteName`
     *  is the tip ("name it {login}.github.io to publish to your top-level address"). Null until both the
     *  owner and a valid name are known. */
    get sitePreview(): { url: string; isUserSite: boolean; userSiteName: string } | null {
      const owner = (s.owner.trim() || s.session?.login || "").trim();
      const repo = s.repo.trim();
      if (owner === "" || repo === "" || this.nameError !== "") return null;
      return {
        url: pagesUrlFor(owner, repo),
        isUserSite: repo.toLowerCase() === `${owner.toLowerCase()}.github.io`,
        userSiteName: `${owner}.github.io`,
      };
    },

    // --- picker (Task 11) ---

    /** The author's repos filtered by the picker's search box. */
    get filteredRepos(): string[] {
      const q = s.repoFilter.trim().toLowerCase();
      return q === "" ? s.repoList : s.repoList.filter((r) => r.toLowerCase().includes(q));
    },

    // --- transitions ---
    open,
    continueWithGitHub,
    openDevicePage,
    copyCode,
    retryAuth,
    openAdvanced,
    backToIntro,
    publish,
    retryPublish,
    signInAgain,
    openSite,
    copyLink,
    tick,
    useNewName,
    updateExisting,
    openPicker,
    chooseRepo,
    publishUpdate,
    publishElsewhere,
    signOut: doSignOut,
    recheck,
    dismissResult,
  };
}

export type PublishMachine = ReturnType<typeof createPublishMachine>;

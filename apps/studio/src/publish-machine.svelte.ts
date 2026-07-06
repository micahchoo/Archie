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

import type { DeploySession, DeployTarget, DeployProgress, DeployError } from "./deploy/types.js";
import type { DeployResult } from "./deploy/deploy-flows.svelte.js";

/** Every screen the dialog can show. `name-site` is the minimal target-entry seam Task 11 fleshes out
 *  (slug preview / public toggle / name-taken); `update-confirm` / `manual-pages` / `pages-building`
 *  are Task 11/12 and intentionally absent here. */
export type PublishState =
  | "intro-desktop"
  | "device-code"
  | "auth-cancelled"
  | "auth-config-error"
  | "name-site"
  | "publishing"
  | "success"
  | "error"
  | "advanced"
  | "web-intro";

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
  /** The one-motion deploy (Task 8) — staging → repo → push → Pages, emitting progress. */
  deploy: (session: DeploySession, target: DeployTarget, onProgress: (p: DeployProgress) => void) => Promise<DeployResult>;
  /** Open a URL in the system browser (opener plugin on desktop). */
  openUrl: (url: string) => Promise<void>;
  /** Copy text to the clipboard (pre-copies the device code, copies the live URL). */
  copy: (text: string) => Promise<void>;
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
    staySignedIn: boolean;
    progress: DeployProgress | null;
    result: DeployResult | null;
    error: DeployError | null;
    persistFailed: boolean; // "couldn't stay signed in" — surfaced on success, non-fatal
  }>({
    state: "intro-desktop",
    session: null,
    code: null,
    expiresAt: 0,
    tick: 0,
    owner: "",
    repo: "",
    staySignedIn: true,
    progress: null,
    result: null,
    error: null,
    persistFailed: false,
  });

  /** Compute the opening screen from the runtime + any restored session (GHPAGES-PUBLISH-UX §states). */
  function computeInitial(): PublishState {
    if (!deps.isTauriEnv) return "web-intro"; // device flow is CORS-impossible in a browser tab
    if (deps.initialSession) return "name-site"; // Task 12 turns this into update-confirm
    return "intro-desktop";
  }

  function seedTarget(): void {
    s.owner = s.session?.login ?? deps.remembered?.target.owner ?? "";
    s.repo = deps.remembered?.target.repo ?? slugifyTitle(deps.library.title);
  }

  function goToNameSite(): void {
    seedTarget();
    s.state = "name-site";
  }

  /** (Re)compute the opening state — call when the dialog opens. */
  function open(): void {
    s.error = null;
    s.progress = null;
    s.result = null;
    if (deps.initialSession) s.session = deps.initialSession;
    s.state = computeInitial();
    if (s.state === "name-site") seedTarget();
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
      else if (err.kind === "expired") { void continueWithGitHub(); } // the code died — quietly fetch a fresh one
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

  /** Publish from the name step: honor "stay signed in", then run the one-motion deploy. */
  async function publish(): Promise<void> {
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
    const target: DeployTarget = { owner: s.owner.trim(), repo: s.repo.trim(), branch: "gh-pages" };
    try {
      const res = await deps.deploy(s.session, target, (p) => (s.progress = p));
      s.result = res;
      s.state = "success";
    } catch (e) {
      s.error = asDeployError(e);
      s.state = "error";
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
    set repo(v: string) { s.repo = v; },
    get staySignedIn(): boolean { return s.staySignedIn; },
    set staySignedIn(v: boolean) { s.staySignedIn = v; },
    get progress(): DeployProgress | null { return s.progress; },
    get result(): DeployResult | null { return s.result; },
    get error(): DeployError | null { return s.error; },
    get persistFailed(): boolean { return s.persistFailed; },

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
  };
}

export type PublishMachine = ReturnType<typeof createPublishMachine>;

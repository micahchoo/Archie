import { describe, it, expect } from "vitest";

// State-machine tests for the "Publish to the web" dialog (plan Task 10). The machine lives in
// publish-machine.svelte.ts so it's drivable headlessly in the node test env (the studio suite has no
// DOM / component-mount harness — cf. library-meta.svelte.test.ts). We drive it with fake platform
// seams and assert the transitions GHPAGES-PUBLISH-UX §"Every dialog state" specifies.
const { createPublishMachine, slugifyTitle, errorCopyFor, validateSiteName, isResumableState } = await import("./publish-machine.svelte.js");
type DeploySession = import("./deploy/types.js").DeploySession;
type DeployProgress = import("./deploy/types.js").DeployProgress;
type DeployTarget = import("./deploy/types.js").DeployTarget;
type Deps = Parameters<typeof createPublishMachine>[0];

const SESSION: DeploySession = { login: "micah", token: "gho_secret", persisted: false };
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function makeDeps(over: Partial<Deps> = {}): Deps {
  return {
    isTauriEnv: true,
    deviceFlowAvailable: true,
    library: { id: "lib1", title: "Voynich Folios" },
    remembered: null,
    initialSession: null,
    signIn: async (onCode) => {
      onCode({ userCode: "WDJB-MJHT", verificationUri: "https://github.com/login/device", expiresIn: 900 });
      return SESSION;
    },
    persistSession: async () => true,
    signOut: async () => {},
    deploy: async () => ({ url: "https://micah.github.io/voynich-folios/", commitSha: "abc123" }),
    openUrl: async () => {},
    copy: async () => {},
    now: () => 1_000_000,
    ...over,
  };
}

/** A signIn whose resolution the test controls, so `device-code` is observable before it settles. */
function deferredSignIn() {
  let resolve!: (s: DeploySession) => void;
  let reject!: (e: unknown) => void;
  const signIn: Deps["signIn"] = (onCode) =>
    new Promise<DeploySession>((res, rej) => {
      resolve = res;
      reject = rej;
      onCode({ userCode: "WDJB-MJHT", verificationUri: "https://github.com/login/device", expiresIn: 900 });
    });
  return { signIn, resolve: (s: DeploySession) => resolve(s), reject: (e: unknown) => reject(e) };
}

/** A deploy whose progress + resolution the test controls, to inspect the stepped checklist. */
function deferredDeploy() {
  let onP!: (p: DeployProgress) => void;
  let resolve!: (r: { url: string; commitSha: string; manualPagesNeeded?: boolean }) => void;
  let reject!: (e: unknown) => void;
  const deploy: Deps["deploy"] = (_s, _t, onProgress) =>
    new Promise((res, rej) => {
      onP = onProgress;
      resolve = res;
      reject = rej;
    });
  return { deploy, progress: (p: DeployProgress) => onP(p), resolve: (r: Parameters<typeof resolve>[0]) => resolve(r), reject: (e: unknown) => reject(e) };
}

describe("publish machine — opening state", () => {
  it("web (!isTauri) opens on web-intro with no GitHub sign-in offered", () => {
    const m = createPublishMachine(makeDeps({ isTauriEnv: false }));
    m.open();
    expect(m.state).toBe("web-intro");
    expect(m.canContinueWithGitHub).toBe(false);
  });

  it("desktop without an OAuth client id opens on intro-desktop but hides Continue-with-GitHub (advanced-only)", () => {
    const m = createPublishMachine(makeDeps({ deviceFlowAvailable: false }));
    m.open();
    expect(m.state).toBe("intro-desktop");
    expect(m.canContinueWithGitHub).toBe(false);
  });

  it("desktop, configured, signed out → intro-desktop with Continue-with-GitHub", () => {
    const m = createPublishMachine(makeDeps());
    m.open();
    expect(m.state).toBe("intro-desktop");
    expect(m.canContinueWithGitHub).toBe(true);
  });

  it("a restored session skips the intro straight to naming (Task 12 seam)", () => {
    const m = createPublishMachine(makeDeps({ initialSession: SESSION }));
    m.open();
    expect(m.state).toBe("name-site");
    expect(m.owner).toBe("micah");
  });

  it("a session restored AFTER construction routes to name-site on reopen (live-getter deps)", () => {
    // The dialog is mounted for the app's lifetime, so the machine is built ONCE — but restoreSession
    // resolves late, so `initialSession` starts null and fills in after mount. Publish.svelte reads the
    // dep through a getter; a snapshot captured at construction would leave a late-signed-in author stuck
    // on intro-desktop (the Q-12 "stay signed in" regression the Task-10 review flagged). Mirror that
    // getter here to pin the machine reads `deps.initialSession` live on every open().
    let initialSession: DeploySession | null = null;
    const deps = makeDeps();
    Object.defineProperty(deps, "initialSession", { get: () => initialSession });
    const m = createPublishMachine(deps);

    m.open();
    expect(m.state).toBe("intro-desktop"); // nothing restored yet at first open

    initialSession = SESSION; // restoreSession resolves after mount
    m.open(); // reopening must now see the session and skip the intro
    expect(m.state).toBe("name-site");
    expect(m.owner).toBe("micah");
  });
});

describe("publish machine — device flow", () => {
  it("intro → device-code (code shown + countdown) → poll success → name-site prefilled", async () => {
    const d = deferredSignIn();
    const m = createPublishMachine(makeDeps({ signIn: d.signIn }));
    m.open();
    const p = m.continueWithGitHub();
    await flush();
    expect(m.state).toBe("device-code");
    expect(m.code?.userCode).toBe("WDJB-MJHT");
    expect(m.remainingSeconds).toBe(900);
    expect(m.countdownLabel).toBe("15:00");

    d.resolve(SESSION);
    await p;
    expect(m.state).toBe("name-site");
    expect(m.owner).toBe("micah");
    expect(m.repo).toBe("voynich-folios"); // slugified library title
  });

  it("poll 'denied' → auth-cancelled, and Try again restarts a fresh device flow", async () => {
    const d = deferredSignIn();
    const m = createPublishMachine(makeDeps({ signIn: d.signIn }));
    m.open();
    const p = m.continueWithGitHub();
    await flush();
    d.reject({ kind: "denied", message: "cancelled" });
    await p;
    expect(m.state).toBe("auth-cancelled");

    // Try again must restart from scratch (the old code is dead) — a new signIn re-shows device-code.
    let calls = 0;
    const m2 = createPublishMachine(makeDeps({
      signIn: async (onCode) => { calls++; onCode({ userCode: "AAAA-BBBB", verificationUri: "u", expiresIn: 900 }); return SESSION; },
    }));
    m2.open();
    m2.retryAuth();
    await flush();
    expect(calls).toBe(1);
    expect(m2.state).toBe("name-site");
  });

  // Archie-7d9b: the OLD behavior silently re-minted a fresh code on expiry — that swaps the visible code
  // out from under an author mid-look, and since this poll runs independent of the component's lifecycle,
  // an abandoned auth attempt would loop re-minting in the background for as long as the app stayed open.
  it("poll 'expired' sets auth-expired directly — never silently re-mints a fresh code", async () => {
    let calls = 0;
    const m = createPublishMachine(makeDeps({
      signIn: async (onCode) => {
        calls++;
        onCode({ userCode: "CODE", verificationUri: "u", expiresIn: 900 });
        return Promise.reject({ kind: "expired", message: "code expired" });
      },
    }));
    m.open();
    await m.continueWithGitHub();
    expect(calls).toBe(1); // no auto-restart — one poll, one rejection, done
    expect(m.state).toBe("auth-expired");
    expect(m.code).toBeNull();
  });

  it("'device-flow-disabled' → auth-config-error (developer-facing, not a normal-user screen)", async () => {
    const m = createPublishMachine(makeDeps({
      signIn: async () => Promise.reject({ kind: "device-flow-disabled", message: "not configured" }),
    }));
    m.open();
    await m.continueWithGitHub();
    expect(m.state).toBe("auth-config-error");
  });

  it("countdown ticks down as the clock advances", async () => {
    let t = 1_000_000;
    const d = deferredSignIn();
    const m = createPublishMachine(makeDeps({ signIn: d.signIn, now: () => t }));
    m.open();
    void m.continueWithGitHub();
    await flush();
    expect(m.countdownLabel).toBe("15:00");
    t += 65_000; // 1m05s later
    m.tick();
    expect(m.remainingSeconds).toBe(835);
    expect(m.countdownLabel).toBe("13:55");
  });
});

describe("publish machine — publishing checklist + success", () => {
  it("maps DeployProgress phases to the ordered stepped checklist, then lands on success", async () => {
    const dd = deferredDeploy();
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, deploy: dd.deploy }));
    m.open();
    expect(m.state).toBe("name-site");
    const p = m.publish();
    await flush(); // let the (fake) persistSession await settle so deploy is running
    expect(m.state).toBe("publishing");

    dd.progress({ phase: "creating-repo" });
    let steps = m.steps;
    expect(steps[0]!.status).toBe("done"); // staging behind us
    expect(steps[1]!.status).toBe("active");
    expect(steps[1]!.label).toContain("Creating your site's home on GitHub");
    expect(steps[3]!.status).toBe("pending");

    dd.progress({ phase: "pushing", detail: "12 of 40 images" });
    steps = m.steps;
    expect(steps[2]!.status).toBe("active");
    expect(steps[2]!.label).toContain("12 of 40 images");

    dd.resolve({ url: "https://micah.github.io/voynich-folios/", commitSha: "abc123" });
    await p;
    expect(m.state).toBe("success");
    expect(m.result?.url).toBe("https://micah.github.io/voynich-folios/");
  });

  it("a deploy failure lands on error; a 401 offers Sign in again", async () => {
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      deploy: async () => Promise.reject({ kind: "gh", status: 401, message: "bad token" }),
    }));
    m.open();
    await m.publish();
    expect(m.state).toBe("error");
    expect(m.errorCopy.offerSignInAgain).toBe(true);
  });

  it('"stay signed in" persists at publish time; a keyring miss is surfaced, non-fatal', async () => {
    let saved = 0;
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, persistSession: async () => { saved++; return false; } }));
    m.open();
    await m.publish();
    expect(saved).toBe(1);
    expect(m.persistFailed).toBe(true);
    expect(m.state).toBe("success"); // persist failure never blocks the deploy
  });
});

describe("publish machine — helpers", () => {
  it("slugifyTitle produces a safe default site name", () => {
    expect(slugifyTitle("Voynich Folios")).toBe("voynich-folios");
    expect(slugifyTitle("  My Cool Exhibit!! ")).toBe("my-cool-exhibit");
    expect(slugifyTitle("###")).toBe("my-library");
  });

  it("errorCopyFor maps GitHub status codes to plain language", () => {
    expect(errorCopyFor({ kind: "gh", status: 401, message: "" }).offerSignInAgain).toBe(true);
    expect(errorCopyFor({ kind: "gh", status: 404, message: "" }).message).toContain("couldn't find");
    expect(errorCopyFor({ kind: "gh", status: 403, message: "" }).offerSignInAgain).toBe(false);
    expect(errorCopyFor({ kind: "network", message: "" }).message).toContain("internet");
  });

  it("openAdvanced and backToIntro move between the recommended path and the token form", () => {
    const m = createPublishMachine(makeDeps());
    m.open();
    m.openAdvanced();
    expect(m.state).toBe("advanced");
    m.backToIntro();
    expect(m.state).toBe("intro-desktop");
  });

  it("remembered target prefills owner/repo (return visit)", () => {
    const remembered = { target: { owner: "micah", repo: "old-site", branch: "gh-pages" } as DeployTarget, url: "https://micah.github.io/old-site/" };
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, remembered }));
    m.open();
    expect(m.repo).toBe("old-site");
  });
});

describe("publish machine — name-site (Task 11)", () => {
  it("validateSiteName rejects slashes, spaces and pasted URLs; accepts a bare name", () => {
    expect(validateSiteName("voynich-folios")).toBe("");
    expect(validateSiteName("my.cool_site-2")).toBe("");
    expect(validateSiteName("")).toBe(""); // empty isn't an error (Publish stays disabled separately)
    expect(validateSiteName("micah/voynich")).not.toBe("");
    expect(validateSiteName("has space")).not.toBe("");
    expect(validateSiteName("https://github.com/micah/x")).not.toBe("");
  });

  it("canPublish tracks the name's validity", () => {
    const m = createPublishMachine(makeDeps({ initialSession: SESSION }));
    m.open();
    expect(m.canPublish).toBe(true); // seeded voynich-folios
    m.repo = "bad name";
    expect(m.nameError).not.toBe("");
    expect(m.canPublish).toBe(false);
    m.repo = "";
    expect(m.canPublish).toBe(false);
  });

  it("live preview is project-site by default and switches to the root user-site at {login}.github.io", () => {
    const m = createPublishMachine(makeDeps({ initialSession: SESSION }));
    m.open();
    // default: project site under the login
    expect(m.sitePreview).toEqual({ url: "https://micah.github.io/voynich-folios/", isUserSite: false, userSiteName: "micah.github.io" });
    // naming it exactly {login}.github.io flips to the top-level user site served at root
    m.repo = "micah.github.io";
    expect(m.sitePreview).toEqual({ url: "https://micah.github.io/", isUserSite: true, userSiteName: "micah.github.io" });
    // an invalid name has no preview
    m.repo = "no slashes/here";
    expect(m.sitePreview).toBeNull();
  });
});

describe("publish machine — existing-repo paths (Task 11)", () => {
  it("a 'new' publish whose name is already taken routes to name-taken and does NOT deploy", async () => {
    let deployed = 0;
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      checkRepoExists: async () => true,
      deploy: async () => { deployed++; return { url: "x", commitSha: "y" }; },
    }));
    m.open();
    await m.publish();
    expect(m.state).toBe("name-taken");
    expect(deployed).toBe(0);
  });

  it("name-taken → Update the existing site deploys into that repo; → Use a new name returns to naming", async () => {
    let deployed = 0;
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      checkRepoExists: async () => true,
      deploy: async () => { deployed++; return { url: "https://micah.github.io/voynich-folios/", commitSha: "y" }; },
    }));
    m.open();
    await m.publish();
    expect(m.state).toBe("name-taken");

    m.useNewName();
    expect(m.state).toBe("name-site");
    expect(m.intent).toBe("new");

    // Back to name-taken, then commit to updating the existing repo.
    await m.publish();
    expect(m.state).toBe("name-taken");
    m.updateExisting();
    await flush();
    expect(m.intent).toBe("update");
    expect(deployed).toBe(1);
    expect(m.state).toBe("success");
  });

  it("a 'new' publish with a free name deploys without the name-taken detour", async () => {
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, checkRepoExists: async () => false }));
    m.open();
    await m.publish();
    expect(m.state).toBe("success");
  });

  it("an existence-check failure surfaces an error rather than risking an overwrite", async () => {
    let deployed = 0;
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      checkRepoExists: async () => { throw { kind: "network", message: "offline" }; },
      deploy: async () => { deployed++; return { url: "x", commitSha: "y" }; },
    }));
    m.open();
    await m.publish();
    expect(m.state).toBe("error");
    expect(deployed).toBe(0);
  });

  it("editing the name after choosing an existing repo reverts intent to 'new' (re-checked before overwrite)", () => {
    const m = createPublishMachine(makeDeps({ initialSession: SESSION }));
    m.open();
    m.chooseRepo("existing-site");
    expect(m.intent).toBe("update");
    expect(m.repo).toBe("existing-site");
    m.repo = "existing-site-renamed";
    expect(m.intent).toBe("new");
  });

  it("the picker loads the author's repos and filters them client-side", async () => {
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      listRepos: async () => ["voynich-folios", "recipes", "voynich-notes"],
    }));
    m.open();
    await m.openPicker();
    expect(m.state).toBe("repo-picker");
    expect(m.filteredRepos).toEqual(["voynich-folios", "recipes", "voynich-notes"]);
    m.repoFilter = "voyn";
    expect(m.filteredRepos).toEqual(["voynich-folios", "voynich-notes"]);
    m.chooseRepo("recipes");
    expect(m.state).toBe("name-site");
    expect(m.intent).toBe("update");
    expect(m.repo).toBe("recipes");
  });
});

describe("publish machine — return visit + fallbacks (Task 12)", () => {
  const REMEMBERED = { target: { owner: "micah", repo: "voynich-folios", branch: "gh-pages" } as DeployTarget, url: "https://micah.github.io/voynich-folios/" };

  it("a signed-in return visit (session + remembered target) opens on update-confirm, not naming", () => {
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, remembered: REMEMBERED }));
    m.open();
    expect(m.state).toBe("update-confirm");
    expect(m.updateUrl).toBe("https://micah.github.io/voynich-folios/");
    expect(m.intent).toBe("update"); // seeded from the remembered target
    expect(m.repo).toBe("voynich-folios");
  });

  it("a signed-in FIRST publish (session, no remembered target) still opens on naming", () => {
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, remembered: null }));
    m.open();
    expect(m.state).toBe("name-site");
  });

  it("[Publish update] deploys straight into the remembered repo, skipping the name-taken guard", async () => {
    let checked = 0;
    let deployedTarget: DeployTarget | null = null;
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      remembered: REMEMBERED,
      checkRepoExists: async () => { checked++; return true; }, // would trip name-taken on a `new` publish
      deploy: async (_s, target) => { deployedTarget = target; return { url: REMEMBERED.url, commitSha: "abc123" }; },
    }));
    m.open();
    expect(m.state).toBe("update-confirm");
    m.publishUpdate();
    await flush();
    expect(checked).toBe(0); // the pre-flight name check is NOT run for an update
    expect(m.intent).toBe("update");
    expect(deployedTarget).toEqual({ owner: "micah", repo: "voynich-folios", branch: "gh-pages" });
    expect(m.state).toBe("success");
  });

  it('"Publish somewhere else…" leaves the confirm for the full naming step', () => {
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, remembered: REMEMBERED }));
    m.open();
    m.publishElsewhere();
    expect(m.state).toBe("name-site");
  });

  it("Sign out clears the session, calls the signOut seam, and returns to the intro", async () => {
    let cleared = 0;
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, remembered: REMEMBERED, signOut: async () => { cleared++; } }));
    m.open();
    expect(m.state).toBe("update-confirm");
    await m.signOut();
    expect(cleared).toBe(1);
    expect(m.session).toBeNull();
    expect(m.state).toBe("intro-desktop");
  });

  it("a deploy that couldn't auto-enable Pages lands on manual-pages, not success", async () => {
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      deploy: async () => ({ url: "https://micah.github.io/voynich-folios/", commitSha: "abc123", manualPagesNeeded: true }),
    }));
    m.open();
    await m.publish();
    expect(m.state).toBe("manual-pages");
    expect(m.pagesSettingsUrl).toBe("https://github.com/micah/voynich-folios/settings/pages");
    expect(m.result?.url).toBe("https://micah.github.io/voynich-folios/");
  });

  it("[recheck] re-invokes the Pages enable — success promotes to the live-site screen", async () => {
    let rechecks = 0;
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      deploy: async () => ({ url: "https://micah.github.io/voynich-folios/", commitSha: "abc123", manualPagesNeeded: true }),
      recheckPages: async () => { rechecks++; return true; },
    }));
    m.open();
    await m.publish();
    expect(m.state).toBe("manual-pages");
    expect(m.canRecheck).toBe(true);
    await m.recheck();
    expect(rechecks).toBe(1);
    expect(m.state).toBe("success");
    expect(m.result?.manualPagesNeeded).toBe(false); // cleared once GitHub reports it enabled
  });

  it("[recheck] that comes back still-off stays on manual-pages and says so, honestly", async () => {
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      deploy: async () => ({ url: "https://micah.github.io/voynich-folios/", commitSha: "abc123", manualPagesNeeded: true }),
      recheckPages: async () => false,
    }));
    m.open();
    await m.publish();
    await m.recheck();
    expect(m.state).toBe("manual-pages");
    expect(m.recheckSaysOff).toBe(true);
  });

  it("the recheck affordance is hidden when the seam is unwired (manual steps still stand)", async () => {
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      recheckPages: undefined,
      deploy: async () => ({ url: "https://micah.github.io/voynich-folios/", commitSha: "abc123", manualPagesNeeded: true }),
    }));
    m.open();
    await m.publish();
    expect(m.state).toBe("manual-pages");
    expect(m.canRecheck).toBe(false);
  });
});

// Archie-1921 / decision Archie-7d9b: PublishDialog + the Publish wizard merged into one scrimmed surface,
// and Esc/scrim-click mid-device-code-auth must be a clean, SESSION-RESUMABLE cancel — the machine keeps
// the pending device code (valid ~15min); reopening resumes at the same waiting state/code; an expired
// code shows a plain start-again sentence. `open()` is the merge point: it's called every time the (now
// single) surface opens, so these tests drive it directly rather than through a component mount.
describe("publish machine — session-resumable auth & progress (Archie-7d9b)", () => {
  it("isResumableState marks device-code / auth-expired / publishing / success / manual-pages / error, and nothing else", () => {
    const resumable = ["device-code", "auth-expired", "publishing", "success", "manual-pages", "error"] as const;
    const cold = ["intro-desktop", "web-intro", "auth-cancelled", "auth-config-error", "update-confirm", "name-site", "name-taken", "repo-picker", "advanced"] as const;
    for (const s of resumable) expect(isResumableState(s)).toBe(true);
    for (const s of cold) expect(isResumableState(s)).toBe(false);
  });

  it("a close mid-device-code (no machine transition) then reopen() resumes on the SAME code, not a fresh intro", async () => {
    const d = deferredSignIn();
    const m = createPublishMachine(makeDeps({ signIn: d.signIn }));
    m.open();
    void m.continueWithGitHub();
    await flush();
    expect(m.state).toBe("device-code");
    const code = m.code?.userCode;

    // Esc/scrim-click never calls a machine transition (the view's close() only touches its own local
    // state) — simulate the surface reopening later by calling open() again, same as the view does.
    m.open();
    expect(m.state).toBe("device-code");
    expect(m.code?.userCode).toBe(code);
    // The in-flight signIn() promise is untouched — it's still the same pending poll, not restarted.
    expect(m.remainingSeconds).toBe(900);
  });

  it("reopening after the device code's expiry shows the plain start-again sentinel, not the live code", async () => {
    let t = 1_000_000;
    const d = deferredSignIn();
    const m = createPublishMachine(makeDeps({ signIn: d.signIn, now: () => t }));
    m.open();
    void m.continueWithGitHub();
    await flush();
    expect(m.state).toBe("device-code");

    t += 901_000; // past the 900s (~15min) expiry
    m.open(); // reopening the surface — no ticking interval runs while it was closed
    expect(m.state).toBe("auth-expired");
  });

  it("'start again' from auth-expired restarts the device flow with a fresh code and expiry", async () => {
    let t = 1_000_000;
    let calls = 0;
    const codes = ["CODE-1", "CODE-2"];
    const resolvers: Array<(s: DeploySession) => void> = [];
    const signIn: Deps["signIn"] = (onCode) =>
      new Promise<DeploySession>((res) => {
        const code = codes[calls]!;
        calls++;
        resolvers.push(res);
        onCode({ userCode: code, verificationUri: "https://github.com/login/device", expiresIn: 900 });
      });
    const m = createPublishMachine(makeDeps({ now: () => t, signIn }));
    m.open();
    void m.continueWithGitHub();
    await flush();
    expect(m.state).toBe("device-code");
    expect(m.code?.userCode).toBe("CODE-1");

    t += 901_000; // past expiry
    m.open();
    expect(m.state).toBe("auth-expired");

    m.retryAuth(); // "Start again" — the old (dead) code is dropped, a fresh device flow starts
    await flush();
    expect(calls).toBe(2);
    expect(m.state).toBe("device-code");
    expect(m.code?.userCode).toBe("CODE-2");
    expect(m.remainingSeconds).toBe(900); // fresh expiry off the CURRENT clock, not the dead one

    resolvers[1]!(SESSION); // the fresh poll succeeds
    await flush();
    expect(m.state).toBe("name-site");
  });

  it("a close mid-publish never stops the deploy — reopen() reflects live progress, then the finished result", async () => {
    const dd = deferredDeploy();
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, deploy: dd.deploy }));
    m.open();
    void m.publish();
    await flush();
    expect(m.state).toBe("publishing");

    dd.progress({ phase: "pushing", detail: "3 of 10 images" });
    // Reopen mid-flight: the checklist must show the SAME live progress, not reset to the first step.
    m.open();
    expect(m.state).toBe("publishing");
    expect(m.steps[2]!.label).toContain("3 of 10 images");

    // The publish completes while the surface is (hypothetically) still closed — nothing in the machine
    // depends on the component being mounted to finish the deploy.
    dd.resolve({ url: "https://micah.github.io/voynich-folios/", commitSha: "deadbeef" });
    await flush();
    expect(m.state).toBe("success");

    // Reopening again must show the finished result, not silently drop it (requirement 3).
    m.open();
    expect(m.state).toBe("success");
    expect(m.result?.url).toBe("https://micah.github.io/voynich-folios/");
  });

  it("a publish that fails while closed is reflected as 'error' on reopen, not lost", async () => {
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      deploy: async () => Promise.reject({ kind: "network", message: "offline" }),
    }));
    m.open();
    await m.publish();
    expect(m.state).toBe("error");
    m.open(); // reopen — the error must still be there to show
    expect(m.state).toBe("error");
    expect(m.errorCopy.message).toContain("internet");
  });

  it("dismissResult acknowledges a finished attempt: the NEXT open computes a fresh entry screen instead of re-showing it", async () => {
    const REMEMBERED = { target: { owner: "micah", repo: "voynich-folios", branch: "gh-pages" } as DeployTarget, url: "https://micah.github.io/voynich-folios/" };
    const m = createPublishMachine(makeDeps({ initialSession: SESSION, remembered: REMEMBERED, deploy: async () => ({ url: REMEMBERED.url, commitSha: "abc123" }) }));
    m.open();
    m.publishUpdate();
    await flush();
    expect(m.state).toBe("success");

    // "Done" (the merged component's finishWizard) calls dismissResult, THEN the view calls close().
    m.dismissResult();
    expect(m.result).toBeNull();

    // The next open (a genuine return visit) now recomputes normally — update-confirm, per the remembered
    // target — rather than showing the stale success screen forever.
    m.open();
    expect(m.state).toBe("update-confirm");
  });

  it("manual-pages 'I'll do it later' (a plain close, no dismissResult) stays resumable on reopen", async () => {
    const m = createPublishMachine(makeDeps({
      initialSession: SESSION,
      deploy: async () => ({ url: "https://micah.github.io/voynich-folios/", commitSha: "abc123", manualPagesNeeded: true }),
    }));
    m.open();
    await m.publish();
    expect(m.state).toBe("manual-pages");

    // No dismissResult call here — just a reopen, mirroring the "I'll do it later" ghost close().
    m.open();
    expect(m.state).toBe("manual-pages");
    expect(m.result?.url).toBe("https://micah.github.io/voynich-folios/");
  });
});

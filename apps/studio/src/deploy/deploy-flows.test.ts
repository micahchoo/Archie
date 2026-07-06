import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryFilesystem } from "@render/core";
import type { DeploySession, DeployTarget, DeployProgress } from "./types.js";

// deployToPages orchestration (plan Task 8). The unit under test stitches four platform seams —
// the injected site projection, the GitHub REST calls (ensureRepo / enablePagesFor via `fetch`), the
// Tauri temp-dir staging (@tauri-apps/api/path + plugin-fs), and the single-pack push (`invoke`).
// All four are mocked here: no network, no Tauri, no disk. What we pin is the ORCHESTRATION —
// phase order, the exists/manual-pages branches, temp cleanup on both exits, and the token never
// reaching the remembered-target store.

// --- Tauri seam mocks -------------------------------------------------------------------------------
// isTauri() → true so the desktop guard passes (the node test env has no __TAURI_INTERNALS__).
vi.mock("../tauri-fs.js", () => ({ isTauri: () => true }));

const invoke = vi.fn((_cmd: string, _args?: unknown): Promise<unknown> => Promise.resolve({ commitSha: "deadbeef" }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a: unknown) => invoke(c, a) }));

const mkdir = vi.fn(async (_p: string, _o?: unknown) => {});
const writeTextFile = vi.fn(async (_p: string, _d: string) => {});
const writeFile = vi.fn(async (_p: string, _d: Uint8Array) => {});
const remove = vi.fn(async (_p: string, _o?: unknown) => {});
vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: (p: string, o?: unknown) => mkdir(p, o),
  writeTextFile: (p: string, d: string) => writeTextFile(p, d),
  writeFile: (p: string, d: Uint8Array) => writeFile(p, d),
  remove: (p: string, o?: unknown) => remove(p, o),
}));

vi.mock("@tauri-apps/api/path", () => ({
  tempDir: async () => "/tmp",
  join: async (...parts: string[]) => parts.join("/"),
}));

// The session half reads the build's OAuth client id from archie.config.json at module eval. Mock it
// with a non-empty id so `deviceFlowAvailable` is true for the sign-in tests; the empty-id (fork-safe)
// case re-imports under a doMock at the bottom.
vi.mock("../../../../archie.config.json", () => ({ default: { githubOAuthClientId: "Iv1.testclientid", deployToPages: true } }));

/** Route the shared `invoke` mock per command name (session tests speak to several Rust commands). */
function routeInvoke(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  invoke.mockImplementation(async (cmd: string, args: unknown) => {
    const h = handlers[cmd];
    if (!h) throw new Error(`unrouted invoke ${cmd}`);
    return h((args ?? {}) as Record<string, unknown>);
  });
}

// --- fetch mock (ensureRepo + enablePagesFor) -------------------------------------------------------
type Route = { method?: string; match: string; status: number; json?: unknown };
function stubFetch(routes: Route[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      const r = routes.find((x) => u.includes(x.match) && (x.method ?? "GET") === method);
      if (!r) throw new Error(`unrouted fetch ${method} ${u}`);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json ?? {} } as Response;
    }),
  );
}
// The REST steps of a fully-successful deploy: repo created (201), Pages absent (404) then created (201).
const repoCreated: Route = { method: "POST", match: "/user/repos", status: 201, json: { id: 1 } };
const pagesFresh: Route[] = [
  { method: "GET", match: "/pages", status: 404 },
  { method: "POST", match: "/pages", status: 201 },
];

// --- localStorage stub (node env has none) ----------------------------------------------------------
// Re-applied in beforeEach: afterEach's vi.unstubAllGlobals() (which also resets the fetch stub) would
// otherwise wipe it for every test after the first.
const store = new Map<string, string>();
function stubLocalStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
}

// --- fixtures ---------------------------------------------------------------------------------------
const session: DeploySession = { login: "alice", token: "gho_secret_xyz", persisted: true };
const target: DeployTarget = { owner: "alice", repo: "my-exhibit", branch: "gh-pages" };

/** A minimal projected site: one text page + one binary asset, so both write paths are exercised. */
async function sampleSite(): Promise<MemoryFilesystem> {
  const fs = new MemoryFilesystem();
  const root = await fs.root();
  const coll = await root.getFile("collection.json", { create: true });
  const cw = await coll.writable();
  await cw.write('{"type":"Collection"}');
  await cw.close();
  const dir = await root.getDirectory("a", { create: true });
  const pic = await dir.getFile("pic.png", { create: true });
  const pw = await pic.writable();
  await pw.write(new Uint8Array([0, 1, 254, 255]).buffer);
  await pw.close();
  return fs;
}

async function makeFlows(overrides: { projectSite?: () => Promise<MemoryFilesystem> } = {}) {
  const { createDeployFlows } = await import("./deploy-flows.svelte.js");
  return createDeployFlows({
    library: { id: "lib-1", title: "My Exhibit" },
    projectSite: overrides.projectSite ?? sampleSite,
  });
}

beforeEach(() => {
  store.clear();
  stubLocalStorage();
  invoke.mockClear();
  mkdir.mockClear();
  writeTextFile.mockClear();
  writeFile.mockClear();
  remove.mockClear();
  invoke.mockResolvedValue({ commitSha: "deadbeef" });
});
afterEach(() => vi.unstubAllGlobals());

describe("deployToPages — orchestration", () => {
  it("emits progress phases in order: staging → creating-repo → pushing → enabling-pages", async () => {
    stubFetch([repoCreated, ...pagesFresh]);
    const flows = await makeFlows();
    const phases: DeployProgress["phase"][] = [];
    const result = await flows.deployToPages(session, target, (p) => phases.push(p.phase));
    expect(phases).toEqual(["staging", "creating-repo", "pushing", "enabling-pages"]);
    expect(result).toEqual({ url: "https://alice.github.io/my-exhibit/", commitSha: "deadbeef" });
  });

  it("stages the projected tree to a fresh temp dir (text + binary), then pushes it via gh_push_tree", async () => {
    stubFetch([repoCreated, ...pagesFresh]);
    const flows = await makeFlows();
    await flows.deployToPages(session, target, () => {});
    // collection.json → text write; a/pic.png → binary write.
    expect(writeTextFile).toHaveBeenCalledWith(expect.stringContaining("collection.json"), '{"type":"Collection"}');
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining("pic.png"), expect.any(Uint8Array));
    // the push targets the staged dir with the contract args (incl. the token as a push credential only).
    const [cmd, args] = invoke.mock.calls[0]!;
    expect(cmd).toBe("gh_push_tree");
    expect(args).toMatchObject({ owner: "alice", repo: "my-exhibit", branch: "gh-pages", token: "gho_secret_xyz" });
    expect((args as { dir: string }).dir).toContain("/tmp/archie-deploy-");
  });

  it("treats an already-existing repo (422) as fine and proceeds", async () => {
    stubFetch([{ method: "POST", match: "/user/repos", status: 422, json: { message: "name already exists on this account" } }, ...pagesFresh]);
    const flows = await makeFlows();
    const result = await flows.deployToPages(session, target, () => {});
    expect(invoke).toHaveBeenCalledOnce();
    expect(result.commitSha).toBe("deadbeef");
  });

  it("sets manualPagesNeeded when Pages could not be enabled (never throws for that)", async () => {
    // Pages already serves a DIFFERENT branch (main) → enablePagesFor returns false, commit still landed.
    stubFetch([repoCreated, { method: "GET", match: "/pages", status: 200, json: { source: { branch: "main" } } }]);
    const flows = await makeFlows();
    const result = await flows.deployToPages(session, target, () => {});
    expect(result).toEqual({ url: "https://alice.github.io/my-exhibit/", commitSha: "deadbeef", manualPagesNeeded: true });
  });

  it("cleans up the temp dir on success", async () => {
    stubFetch([repoCreated, ...pagesFresh]);
    const flows = await makeFlows();
    await flows.deployToPages(session, target, () => {});
    expect(remove).toHaveBeenCalledWith(expect.stringContaining("/tmp/archie-deploy-"), { recursive: true });
  });

  it("cleans up the temp dir on failure (push rejects)", async () => {
    stubFetch([repoCreated]);
    invoke.mockRejectedValueOnce({ kind: "push", message: "GitHub rejected the upload." });
    const flows = await makeFlows();
    await expect(flows.deployToPages(session, target, () => {})).rejects.toMatchObject({ kind: "push" });
    expect(remove).toHaveBeenCalledWith(expect.stringContaining("/tmp/archie-deploy-"), { recursive: true });
  });

  it("wraps a GitHub REST failure (repo creation 500) into a typed 'gh' DeployError", async () => {
    stubFetch([{ method: "POST", match: "/user/repos", status: 500, json: { message: "boom" } }]);
    const flows = await makeFlows();
    await expect(flows.deployToPages(session, target, () => {})).rejects.toMatchObject({ kind: "gh", status: 500 });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("remembers the target + url per library but never the token or session", async () => {
    stubFetch([repoCreated, ...pagesFresh]);
    const flows = await makeFlows();
    await flows.deployToPages(session, target, () => {});
    const raw = store.get("archie:deploy:lib-1")!;
    expect(JSON.parse(raw)).toEqual({ target, url: "https://alice.github.io/my-exhibit/" });
    expect(raw).not.toContain("gho_secret_xyz");
    expect(raw).not.toContain("token");
  });
});

describe("rememberedTarget — return-visit lookup for update-confirm", () => {
  it("reads back what a prior deploy wrote, and returns null when absent", async () => {
    const { rememberedTarget } = await import("./deploy-flows.svelte.js");
    expect(rememberedTarget("lib-1")).toBeNull();
    store.set("archie:deploy:lib-1", JSON.stringify({ target, url: "https://alice.github.io/my-exhibit/" }));
    expect(rememberedTarget("lib-1")).toEqual({ target, url: "https://alice.github.io/my-exhibit/" });
  });
});

describe("deployToPages — desktop-only guard", () => {
  it("throws a 'push' DeployError early when not running under Tauri", async () => {
    vi.resetModules();
    vi.doMock("../tauri-fs.js", () => ({ isTauri: () => false }));
    const { createDeployFlows } = await import("./deploy-flows.svelte.js");
    const flows = createDeployFlows({ library: { id: "lib-1", title: "My Exhibit" }, projectSite: sampleSite });
    await expect(flows.deployToPages(session, target, () => {})).rejects.toMatchObject({ kind: "push" });
    // Restore isTauri → true (not doUnmock, which would drop the mock and let the real, node-false
    // isTauri leak into the session tests below that need the desktop guard to pass).
    vi.doMock("../tauri-fs.js", () => ({ isTauri: () => true }));
    vi.resetModules();
  });
});

// --- Task 9: sign-in flow + session state -----------------------------------------------------------

/** GitHub's `GET /user` (login lookup after auth). */
const userOk = (login: string): Route => ({ method: "GET", match: "api.github.com/user", status: 200, json: { login } });

describe("signInWithGitHub — device flow → session", () => {
  it("starts the device flow, surfaces the code, polls, and resolves a session with the fetched login", async () => {
    routeInvoke({
      gh_device_start: () => ({ userCode: "WDJB-MJHT", verificationUri: "https://github.com/login/device", deviceCode: "dc-1", interval: 5, expiresIn: 900 }),
      gh_device_poll: () => ({ token: "gho_signed_in" }),
    });
    stubFetch([userOk("alice")]);
    const { signInWithGitHub } = await import("./deploy-flows.svelte.js");
    const codes: { userCode: string; verificationUri: string; expiresIn: number }[] = [];
    const result = await signInWithGitHub((c) => codes.push(c));

    // the user-facing code (userCode + verificationUri + expiresIn) is surfaced BEFORE the poll resolves.
    expect(codes).toEqual([{ userCode: "WDJB-MJHT", verificationUri: "https://github.com/login/device", expiresIn: 900 }]);
    // a fresh session carries the token in memory and is NOT yet persisted (persistSession is separate).
    expect(result).toEqual({ login: "alice", token: "gho_signed_in", persisted: false });

    // invoke arg shapes: camelCase clientId for start; deviceCode/interval/expiresIn threaded to poll (Q — the
    // Rust deadline guard needs expiresIn).
    const startArgs = invoke.mock.calls.find(([c]) => c === "gh_device_start")![1];
    expect(startArgs).toEqual({ clientId: "Iv1.testclientid" });
    const pollArgs = invoke.mock.calls.find(([c]) => c === "gh_device_poll")![1];
    expect(pollArgs).toEqual({ clientId: "Iv1.testclientid", deviceCode: "dc-1", interval: 5, expiresIn: 900 });
  });

  it("surfaces a poll rejection as-is (typed DeployError from Rust)", async () => {
    routeInvoke({
      gh_device_start: () => ({ userCode: "X", verificationUri: "u", deviceCode: "dc", interval: 5, expiresIn: 900 }),
      gh_device_poll: () => { throw { kind: "expired", message: "The sign-in code expired." }; },
    });
    const { signInWithGitHub } = await import("./deploy-flows.svelte.js");
    await expect(signInWithGitHub(() => {})).rejects.toMatchObject({ kind: "expired" });
  });
});

describe("persistSession — stay signed in (Q-12)", () => {
  it("saves the token to the keyring and reports the outcome honestly", async () => {
    routeInvoke({ gh_token_save: () => true });
    const { persistSession } = await import("./deploy-flows.svelte.js");
    expect(await persistSession({ login: "alice", token: "gho_x", persisted: false })).toBe(true);
    expect(invoke).toHaveBeenCalledWith("gh_token_save", { token: "gho_x" });
  });

  it("returns false (never throws) when the keyring is unavailable", async () => {
    routeInvoke({ gh_token_save: () => false });
    const { persistSession } = await import("./deploy-flows.svelte.js");
    expect(await persistSession({ login: "alice", token: "gho_x", persisted: false })).toBe(false);
  });
});

describe("restoreSession — startup 'stay signed in' (Q-12)", () => {
  it("loads a stored token, validates it, and returns a persisted session", async () => {
    routeInvoke({ gh_token_load: () => "gho_stored" });
    stubFetch([userOk("alice")]);
    const { restoreSession } = await import("./deploy-flows.svelte.js");
    expect(await restoreSession()).toEqual({ login: "alice", token: "gho_stored", persisted: true });
  });

  it("returns null (and never fetches) when no token is stored", async () => {
    routeInvoke({ gh_token_load: () => null });
    stubFetch([]); // any fetch is unrouted → would throw; asserts none happens
    const { restoreSession } = await import("./deploy-flows.svelte.js");
    expect(await restoreSession()).toBeNull();
  });

  it("clears a revoked token (401) and returns null, never throwing", async () => {
    const cleared: number[] = [];
    routeInvoke({ gh_token_load: () => "gho_revoked", gh_token_clear: () => void cleared.push(1) });
    stubFetch([{ method: "GET", match: "api.github.com/user", status: 401, json: { message: "Bad credentials" } }]);
    const { restoreSession } = await import("./deploy-flows.svelte.js");
    expect(await restoreSession()).toBeNull();
    expect(cleared).toHaveLength(1); // the stale token is forgotten
  });

  it("returns null WITHOUT clearing on a transient validation failure (token may still be good)", async () => {
    const cleared: number[] = [];
    routeInvoke({ gh_token_load: () => "gho_maybe", gh_token_clear: () => void cleared.push(1) });
    stubFetch([{ method: "GET", match: "api.github.com/user", status: 500, json: {} }]);
    const { restoreSession } = await import("./deploy-flows.svelte.js");
    expect(await restoreSession()).toBeNull();
    expect(cleared).toHaveLength(0); // a 5xx is not "revoked" — keep the token for next launch
  });
});

describe("signOut — forget the token", () => {
  it("clears the keyring token", async () => {
    const cleared: number[] = [];
    routeInvoke({ gh_token_clear: () => void cleared.push(1) });
    const { signOut } = await import("./deploy-flows.svelte.js");
    await signOut();
    expect(cleared).toHaveLength(1);
  });
});

describe("deviceFlowAvailable — fork-safe gate", () => {
  it("is true when the build ships an OAuth client id", async () => {
    const { deviceFlowAvailable } = await import("./deploy-flows.svelte.js");
    expect(deviceFlowAvailable).toBe(true);
  });

  it("is false — and signInWithGitHub refuses — when githubOAuthClientId is empty", async () => {
    vi.resetModules();
    vi.doMock("../../../../archie.config.json", () => ({ default: { githubOAuthClientId: "", deployToPages: true } }));
    const mod = await import("./deploy-flows.svelte.js");
    expect(mod.deviceFlowAvailable).toBe(false);
    await expect(mod.signInWithGitHub(() => {})).rejects.toMatchObject({ kind: "device-flow-disabled" });
    vi.doUnmock("../../../../archie.config.json");
    vi.resetModules();
  });
});

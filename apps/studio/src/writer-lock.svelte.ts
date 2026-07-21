// Cross-tab single-writer discipline (ISSUES.md Issue 22 / ledgers/TABS.md). OPFS is origin-shared, so
// two Studio tabs on the same library interleave writes over the same files — last-writer-wins, silent.
// The browser ships the primitive to stop this: navigator.locks. The FIRST tab to open the library takes
// an EXCLUSIVE Web Lock held for the tab's lifetime and becomes the WRITER; a second tab that can't get
// the lock is a READER (read-only) until it explicitly TAKES OVER (steals the lock) or the writer closes
// (the reader auto-promotes). Every persist routes through the save-queue, which consults `canWrite` — so
// a reader tab physically cannot overwrite the writer's edits.
//
// Where navigator.locks is absent (an older WebKitGTK / Tauri webview), a BroadcastChannel claim protocol
// stands in: a newcomer asks "who holds it?"; a live holder answers, so the newcomer is a reader; the
// holder heartbeats and, on close, goes silent so a survivor's next claim wins. Same read-only/take-over
// shape, weaker guarantee (a lost heartbeat window), but far better than no coordination.
//
// A `.svelte.ts` rune module: the $state container is never reassigned, so `canWrite` reads live across
// modules (cf. save-queue.svelte.ts). The lock providers are injected so the logic is headless-testable.

// The one downward dependency (writer-lock → save-queue, acyclic — the queue never imports this module;
// its gate is injected by App): becoming the writer must clear a lingering read-only refusal, or the
// header shows a stale "⚠ Retry save" until the next write (UX-CRITIQUE O2 follow-up).
import { clearReadOnlyRefusal } from "./save-queue.svelte.js";
import { safeGet } from "./persisted.js";

/** The subset of the Web Locks API this module uses (injected so tests can supply a fake or the real one). */
export interface LocksLike {
  request(
    name: string,
    options: { mode?: "exclusive" | "shared"; ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    callback: (lock: unknown | null) => Promise<void> | void,
  ): Promise<void>;
}

export interface WriterLockOptions {
  /** Defaults to `navigator.locks` when present. Pass `null` to force the BroadcastChannel fallback. */
  locks?: LocksLike | null;
  /** BroadcastChannel factory (fallback path). Defaults to the global `BroadcastChannel`. */
  makeChannel?: (name: string) => BroadcastChannelLike | null;
  /** Heartbeat / claim-wait interval for the fallback, ms. Small in tests. */
  fallbackIntervalMs?: number;
}

/** The BroadcastChannel surface the fallback needs (injectable for tests). */
export interface BroadcastChannelLike {
  postMessage(msg: unknown): void;
  close(): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

const LOCK_PREFIX = "archie.writer.";

// Same key App.svelte's identity code reads/writes (Archie-198c). Read lazily at message-send time
// (never captured once at module init) so a rename in Library Details reaches the next heartbeat
// without a reload — cheap here, unlike the session-identity capture lag documented for Archie-7e5b S4.
const DISPLAY_NAME_KEY = "archie.displayName.v1";
// Names cross a same-origin BroadcastChannel/localStorage boundary — still untrusted text (devtools,
// a stale/hostile script could write the key). Cap defensively; render via plain Svelte interpolation
// at the call site, never {@html}.
const MAX_NAME_LEN = 60;

/** The current tab's display name, or null for anonymous (absent/blank/unreadable — private mode etc). */
function readDisplayName(): string | null {
  const trimmed = safeGet(DISPLAY_NAME_KEY)?.trim();
  return trimmed ? trimmed.slice(0, MAX_NAME_LEN) : null;
}

function defaultLocks(): LocksLike | null {
  const nav = (globalThis as { navigator?: { locks?: LocksLike } }).navigator;
  return nav?.locks ?? null;
}
function defaultChannel(name: string): BroadcastChannelLike | null {
  const BC = (globalThis as { BroadcastChannel?: new (n: string) => BroadcastChannelLike }).BroadcastChannel;
  return BC ? new BC(name) : null;
}

export function createWriterLock(libraryId: string, opts: WriterLockOptions = {}) {
  const name = `${LOCK_PREFIX}${libraryId}`;
  const locks = opts.locks === undefined ? defaultLocks() : opts.locks;
  const makeChannel = opts.makeChannel ?? defaultChannel;
  const beat = opts.fallbackIntervalMs ?? 3000;

  const s = $state<{
    canWrite: boolean;
    otherTabActive: boolean;
    ready: boolean;
    usingFallback: boolean;
    otherName: string | null;
  }>({
    canWrite: false, // this tab may persist
    otherTabActive: false, // another tab holds the writer role
    ready: false, // a claim has resolved (writer or reader determined)
    usingFallback: false, // true when coordinating via BroadcastChannel (no Web Locks)
    otherName: null, // display name of the tab holding the writer role; null = unknown/anonymous
  });

  // — Web Locks path state —
  let releaseHeld: (() => void) | null = null; // resolves the held-promise → frees our lock
  let readerWatch: AbortController | null = null; // the queued blocking request that auto-promotes a reader

  function becomeWriter() { s.canWrite = true; s.otherTabActive = false; s.otherName = null; s.ready = true; clearReadOnlyRefusal(); startPresenceHeartbeat(); }
  function becomeReader() { s.canWrite = false; s.otherTabActive = true; s.ready = true; stopPresenceHeartbeat(); }
  /** Flip to read-only AND queue for the writer's release, so if the current writer later closes this
   *  tab auto-promotes to writer (only one tab left → it should be able to save). */
  function demoteToReader() { becomeReader(); watchForRelease(); }

  /** Hold the lock (options decide ifAvailable / steal / queued). The returned promise resolves TRUE the
   *  moment this tab holds the lock (writer), FALSE if `ifAvailable` and another tab holds it. `onLost`
   *  fires if we were holding and the lock was then stolen by another tab (steal). */
  function requestHold(
    options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    onAcquired: () => void,
    onLost: () => void,
  ): Promise<boolean> {
    if (!locks) return Promise.resolve(false);
    let acquired = false;
    let resolveAcq: (v: boolean) => void = () => {};
    const acq = new Promise<boolean>((r) => { resolveAcq = r; });
    void locks
      .request(name, { mode: "exclusive", ...options }, async (lock) => {
        if (!lock) { resolveAcq(false); return; } // ifAvailable and someone else holds it
        acquired = true;
        onAcquired();
        resolveAcq(true);
        await new Promise<void>((resolve) => { releaseHeld = resolve; });
      })
      .catch(() => { if (acquired) onLost(); else resolveAcq(false); }); // stolen while holding → onLost; aborted before acquiring → not acquired
    return acq;
  }

  /** Reader auto-promotion: queue a blocking exclusive request; when the writer releases/closes, we get
   *  the lock and become the writer. Aborted on take-over (we steal instead) or release. */
  function watchForRelease() {
    readerWatch?.abort();
    readerWatch = new AbortController();
    void requestHold({ signal: readerWatch.signal }, becomeWriter, demoteToReader);
  }

  // — BroadcastChannel fallback path —
  const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let ch: BroadcastChannelLike | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let claimTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHolderBeat = 0;

  function fallbackClaim() {
    s.usingFallback = true;
    ch = makeChannel(name);
    if (!ch) { becomeWriter(); return; } // no channel either → optimistic solo writer (single-tab floor)
    ch.onmessage = (ev) => {
      const m = ev.data as { t?: string; from?: string; name?: string | null };
      if (!m || m.from === tabId) return;
      if (m.t === "who") { if (s.canWrite) ch!.postMessage({ t: "held", from: tabId, name: readDisplayName() }); return; }
      if (m.t === "held" || m.t === "beat") {
        lastHolderBeat = Date.now();
        if (s.canWrite) return;
        becomeReader();
        s.otherName = m.name ?? null;
        return;
      }
      if (m.t === "takeover") { if (s.canWrite) { stopHeartbeat(); becomeReader(); s.otherName = m.name ?? null; } return; }
      if (m.t === "bye") { lastHolderBeat = 0; s.otherName = null; } // holder left — a reader will win the next claim window
    };
    // Ask who holds it; if nobody answers within a claim window, we become the writer.
    lastHolderBeat = 0;
    ch.postMessage({ t: "who", from: tabId });
    claimTimer = setTimeout(() => {
      if (lastHolderBeat === 0) startWritingFallback();
      else becomeReader();
    }, beat);
  }
  function startWritingFallback() {
    if (claimTimer) { clearTimeout(claimTimer); claimTimer = null; } // a resolved writer must not be demoted by a stale claim timer
    becomeWriter();
    startHeartbeat();
  }
  function startHeartbeat() {
    stopHeartbeat();
    heartbeat = setInterval(() => ch?.postMessage({ t: "beat", from: tabId, name: readDisplayName() }), beat);
  }
  function stopHeartbeat() { if (heartbeat) { clearInterval(heartbeat); heartbeat = null; } }

  // — Presence channel (name-only; carries the display name where the lock mechanism itself can't) —
  // Web Locks (navigator.locks) hands back an opaque lock object — no payload travels with it, so a
  // reader that wins the claim purely via Web Locks has no way to learn WHO the writer is. A lightweight
  // BroadcastChannel, used ONLY to announce a name (never for canWrite/otherTabActive — Web Locks still
  // decides those), fills the gap. The BroadcastChannel fallback path doesn't need this: its own
  // "held"/"beat"/"takeover" messages above already carry `name` directly.
  let presenceCh: BroadcastChannelLike | null = null;
  let presenceHeartbeat: ReturnType<typeof setInterval> | null = null;

  function setupPresenceListener() {
    if (!locks) return; // fallback path already carries names on its coordination messages
    presenceCh = makeChannel(`${name}.presence`);
    if (!presenceCh) return; // no BroadcastChannel either → otherName stays unknown, banner falls back to impersonal copy
    presenceCh.onmessage = (ev) => {
      const m = ev.data as { t?: string; from?: string; name?: string | null };
      if (!m || m.from === tabId || m.t !== "iam") return;
      s.otherName = m.name ?? null;
    };
  }
  function announcePresence() { presenceCh?.postMessage({ t: "iam", from: tabId, name: readDisplayName() }); }
  function startPresenceHeartbeat() {
    if (!presenceCh) return;
    stopPresenceHeartbeat();
    announcePresence();
    presenceHeartbeat = setInterval(announcePresence, beat);
  }
  function stopPresenceHeartbeat() { if (presenceHeartbeat) { clearInterval(presenceHeartbeat); presenceHeartbeat = null; } }
  setupPresenceListener();

  return {
    /** This tab may persist (it is the writer). The save-queue gate reads this. */
    get canWrite(): boolean { return s.canWrite; },
    /** Another tab holds the writer role → this tab is read-only. Drives the banner. */
    get otherTabActive(): boolean { return s.otherTabActive; },
    /** A claim has resolved (writer/reader decided). */
    get ready(): boolean { return s.ready; },
    /** True when coordinating via the BroadcastChannel fallback (no Web Locks). */
    get usingFallback(): boolean { return s.usingFallback; },
    /** Display name of the tab holding the writer role (Archie-198c), or null when unknown/anonymous —
     *  callers fall back to impersonal copy in that case. Only meaningful while `otherTabActive`. */
    get otherName(): string | null { return s.otherName; },

    /** Acquire the writer role if free, else become a read-only reader (auto-promoting if the writer
     *  later closes). Idempotent-ish: call once at library open. */
    claim(): void {
      if (!locks) { fallbackClaim(); return; }
      // ifAvailable: got it → writer; not got → reader, then queue for the writer's release. Awaiting the
      // resolved boolean makes the writer/reader decision deterministic (no microtask race).
      void requestHold({ ifAvailable: true }, becomeWriter, demoteToReader).then((got) => {
        if (!got) demoteToReader();
      });
    },

    /** Take over editing from the current writer: steal the lock (Web Locks) or broadcast a takeover
     *  (fallback). The former writer flips to read-only. */
    takeOver(): void {
      if (!locks) {
        if (!ch) { becomeWriter(); return; }
        ch.postMessage({ t: "takeover", from: tabId, name: readDisplayName() });
        startWritingFallback();
        return;
      }
      readerWatch?.abort(); // drop the queued auto-promote; we're forcing it now
      releaseHeld?.(); // release any hold we somehow have before re-holding
      void requestHold({ steal: true }, becomeWriter, demoteToReader);
    },

    /** Give up the writer role (tab close / project close). */
    release(): void {
      readerWatch?.abort();
      releaseHeld?.();
      releaseHeld = null;
      stopPresenceHeartbeat();
      presenceCh?.close();
      presenceCh = null;
      if (s.usingFallback) { stopHeartbeat(); if (claimTimer) clearTimeout(claimTimer); ch?.postMessage({ t: "bye", from: tabId }); ch?.close(); ch = null; }
      s.canWrite = false;
      s.otherTabActive = false;
      s.otherName = null;
    },
  };
}
export type WriterLock = ReturnType<typeof createWriterLock>;

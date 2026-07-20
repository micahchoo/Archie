// Issue 22 / ledgers/TABS.md — cross-tab single-writer. The Web Locks path is exercised against the REAL
// navigator.locks (Node implements it, process-scoped — so two createWriterLock instances on the same id
// contend exactly like two tabs). The BroadcastChannel fallback is exercised with an in-memory bus.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createWriterLock } from "./writer-lock.svelte.js";
import { enqueueSave, saveStatus, setWriterGate, resetSaveQueueForTests } from "./save-queue.svelte.js";

const settle = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms));

// Archie-198c: the display-name payload reads `archie.displayName.v1` from `localStorage` lazily at
// send time. `localStorage` isn't a Node global (vitest environment: "node"), so stub it — same idiom
// as view-prefs.svelte.test.ts / binding.test.ts.
const identityStore = new Map<string, string>();
const DISPLAY_NAME_KEY = "archie.displayName.v1";
vi.stubGlobal("localStorage", {
  getItem: (k: string) => identityStore.get(k) ?? null,
  setItem: (k: string, v: string) => void identityStore.set(k, v),
  removeItem: (k: string) => void identityStore.delete(k),
});
beforeEach(() => { identityStore.clear(); });

/** An in-memory BroadcastChannel bus so two fallback "tabs" can talk without a browser. */
function makeBus() {
  const chans = new Set<{ onmessage: ((e: { data: unknown }) => void) | null }>();
  return (_name: string) => {
    const c = {
      onmessage: null as ((e: { data: unknown }) => void) | null,
      postMessage(msg: unknown) { for (const o of chans) if (o !== c && o.onmessage) o.onmessage({ data: msg }); },
      close() { chans.delete(c); },
    };
    chans.add(c);
    return c;
  };
}

describe("writer-lock — Web Locks path (real navigator.locks)", () => {
  it("first tab is the writer, a second tab is read-only", async () => {
    const id = `lib-${Math.random()}`;
    const a = createWriterLock(id);
    const b = createWriterLock(id);
    try {
      a.claim(); await settle();
      expect(a.canWrite).toBe(true);
      expect(a.otherTabActive).toBe(false);

      b.claim(); await settle();
      expect(b.canWrite).toBe(false); // read-only — a holds the lock
      expect(b.otherTabActive).toBe(true);
    } finally { a.release(); b.release(); await settle(); }
  });

  it("take-over steals the lock: the taker writes, the former writer flips to read-only", async () => {
    const id = `lib-${Math.random()}`;
    const a = createWriterLock(id);
    const b = createWriterLock(id);
    try {
      a.claim(); await settle();
      b.claim(); await settle();
      expect(a.canWrite).toBe(true);
      expect(b.canWrite).toBe(false);

      b.takeOver(); await settle();
      expect(b.canWrite).toBe(true); // the taker now writes
      expect(a.canWrite).toBe(false); // the former writer lost the lock (stolen)
    } finally { a.release(); b.release(); await settle(); }
  });

  it("becoming the writer clears a recorded read-only refusal at once — no stale Retry save (UX-CRITIQUE O2)", async () => {
    const id = `lib-${Math.random()}`;
    const a = createWriterLock(id);
    const b = createWriterLock(id);
    try {
      a.claim(); await settle();
      b.claim(); await settle();
      // Tab b is read-only; a persist routed through the queue is refused and records the refusal.
      setWriterGate(() => b.canWrite);
      expect(await enqueueSave("k", "K", async () => {})).toBe(false);
      expect(saveStatus.health).toBe("error");
      // Take over: becomeWriter must clear the refusal IMMEDIATELY, before any next write happens by.
      b.takeOver(); await settle();
      expect(b.canWrite).toBe(true);
      expect(saveStatus.health).not.toBe("error");
      expect(saveStatus.error).toBeNull();
    } finally { a.release(); b.release(); resetSaveQueueForTests(); await settle(); }
  });

  it("a reader auto-promotes to writer when the writer releases (tab close)", async () => {
    const id = `lib-${Math.random()}`;
    const a = createWriterLock(id);
    const b = createWriterLock(id);
    try {
      a.claim(); await settle();
      b.claim(); await settle();
      expect(b.canWrite).toBe(false);

      a.release(); await settle(); // the writer tab closes
      expect(b.canWrite).toBe(true); // the survivor is promoted — a single tab must be able to save
    } finally { a.release(); b.release(); await settle(); }
  });
});

describe("writer-lock — BroadcastChannel fallback (no Web Locks)", () => {
  it("first tab writes after the claim window, a second becomes read-only, take-over flips them", async () => {
    const makeChannel = makeBus();
    const a = createWriterLock("x", { locks: null, makeChannel, fallbackIntervalMs: 10 });
    const b = createWriterLock("x", { locks: null, makeChannel, fallbackIntervalMs: 10 });
    try {
      a.claim();
      await settle(25); // nobody answered "who" → a becomes writer + heartbeats
      expect(a.usingFallback).toBe(true);
      expect(a.canWrite).toBe(true);

      b.claim();
      await settle(5); // a answers "held" synchronously on the bus → b is a reader
      expect(b.canWrite).toBe(false);
      expect(b.otherTabActive).toBe(true);

      b.takeOver();
      await settle(5);
      expect(b.canWrite).toBe(true);
      expect(a.canWrite).toBe(false); // a saw the takeover broadcast
    } finally { a.release(); b.release(); await settle(); }
  });
});

describe("writer-lock — display name in the payload (Archie-198c)", () => {
  it("Web Locks path: a reader learns the writer's name via the presence channel", async () => {
    const id = `lib-${Math.random()}`;
    identityStore.set(DISPLAY_NAME_KEY, "Meera");
    const a = createWriterLock(id, { fallbackIntervalMs: 10 });
    const b = createWriterLock(id, { fallbackIntervalMs: 10 });
    try {
      a.claim(); await settle();
      b.claim(); await settle(30);
      expect(b.otherTabActive).toBe(true);
      expect(b.otherName).toBe("Meera");
    } finally { a.release(); b.release(); await settle(); }
  });

  it("Web Locks path: blank/absent name → otherName is null (impersonal-copy fallback)", async () => {
    const id = `lib-${Math.random()}`;
    identityStore.set(DISPLAY_NAME_KEY, "   "); // blank after trim, same as "never named" semantics
    const a = createWriterLock(id, { fallbackIntervalMs: 10 });
    const b = createWriterLock(id, { fallbackIntervalMs: 10 });
    try {
      a.claim(); await settle();
      b.claim(); await settle(30);
      expect(b.otherTabActive).toBe(true);
      expect(b.otherName).toBeNull();
    } finally { a.release(); b.release(); await settle(); }
  });

  it("Web Locks path: a rename reaches the reader on the next heartbeat, no reload needed", async () => {
    const id = `lib-${Math.random()}`;
    identityStore.set(DISPLAY_NAME_KEY, "Alex");
    const a = createWriterLock(id, { fallbackIntervalMs: 10 });
    const b = createWriterLock(id, { fallbackIntervalMs: 10 });
    try {
      a.claim(); await settle();
      b.claim(); await settle(30);
      expect(b.otherName).toBe("Alex");

      identityStore.set(DISPLAY_NAME_KEY, "Alexandra"); // simulates a Library Details edit, same tab `a`
      await settle(30); // next presence heartbeat picks it up — proves the read is lazy, not captured once
      expect(b.otherName).toBe("Alexandra");
    } finally { a.release(); b.release(); await settle(); }
  });

  it("BroadcastChannel fallback: heartbeats carry the writer's name", async () => {
    const makeChannel = makeBus();
    identityStore.set(DISPLAY_NAME_KEY, "Sam");
    const a = createWriterLock("fallback-name-1", { locks: null, makeChannel, fallbackIntervalMs: 10 });
    const b = createWriterLock("fallback-name-1", { locks: null, makeChannel, fallbackIntervalMs: 10 });
    try {
      a.claim();
      await settle(25);
      b.claim();
      await settle(5);
      expect(b.otherTabActive).toBe(true);
      expect(b.otherName).toBe("Sam");
    } finally { a.release(); b.release(); await settle(); }
  });

  it("BroadcastChannel fallback: absent name → otherName is null", async () => {
    const makeChannel = makeBus();
    const a = createWriterLock("fallback-name-2", { locks: null, makeChannel, fallbackIntervalMs: 10 });
    const b = createWriterLock("fallback-name-2", { locks: null, makeChannel, fallbackIntervalMs: 10 });
    try {
      a.claim();
      await settle(25);
      b.claim();
      await settle(5);
      expect(b.otherTabActive).toBe(true);
      expect(b.otherName).toBeNull();
    } finally { a.release(); b.release(); await settle(); }
  });

  it("BroadcastChannel fallback: take-over carries the taker's name to the former writer", async () => {
    const makeChannel = makeBus();
    identityStore.set(DISPLAY_NAME_KEY, "Sam");
    const a = createWriterLock("fallback-name-3", { locks: null, makeChannel, fallbackIntervalMs: 10 });
    const b = createWriterLock("fallback-name-3", { locks: null, makeChannel, fallbackIntervalMs: 10 });
    try {
      a.claim(); await settle(25); // a writes as "Sam"
      identityStore.set(DISPLAY_NAME_KEY, "Priya"); // b names itself before taking over
      b.claim(); await settle(5);

      b.takeOver(); await settle(5);
      expect(a.canWrite).toBe(false);
      expect(a.otherTabActive).toBe(true);
      expect(a.otherName).toBe("Priya"); // the former writer now sees the taker's name
    } finally { a.release(); b.release(); await settle(); }
  });

  it("name is capped defensively at 60 chars", async () => {
    const id = `lib-${Math.random()}`;
    identityStore.set(DISPLAY_NAME_KEY, "x".repeat(500));
    const a = createWriterLock(id, { fallbackIntervalMs: 10 });
    const b = createWriterLock(id, { fallbackIntervalMs: 10 });
    try {
      a.claim(); await settle();
      b.claim(); await settle(30);
      expect(b.otherName).not.toBeNull();
      expect(b.otherName?.length).toBe(60);
    } finally { a.release(); b.release(); await settle(); }
  });
});

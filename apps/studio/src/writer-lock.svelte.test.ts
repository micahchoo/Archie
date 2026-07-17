// Issue 22 / ledgers/TABS.md — cross-tab single-writer. The Web Locks path is exercised against the REAL
// navigator.locks (Node implements it, process-scoped — so two createWriterLock instances on the same id
// contend exactly like two tabs). The BroadcastChannel fallback is exercised with an in-memory bus.
import { describe, it, expect } from "vitest";
import { createWriterLock } from "./writer-lock.svelte.js";

const settle = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms));

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

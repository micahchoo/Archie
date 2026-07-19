import { describe, it, expect, beforeEach } from "vitest";
import { enqueueSave, saveStatus, resetSaveQueueForTests, setWriterGate, setWriterOtherName } from "./save-queue.svelte";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("save-queue", () => {
  beforeEach(() => resetSaveQueueForTests());

  it("starts idle, transitions saving → saved", async () => {
    expect(saveStatus.health).toBe("idle");
    const p = enqueueSave("a", "A", async () => {});
    expect(saveStatus.health).toBe("saving");
    expect(await p).toBe(true);
    expect(saveStatus.health).toBe("saved");
    expect(saveStatus.error).toBeNull();
  });

  it("serializes jobs on the same key in order", async () => {
    const order: number[] = [];
    let release1!: () => void;
    const gate = new Promise<void>((r) => (release1 = r));
    const p1 = enqueueSave("k", "K", async () => { await gate; order.push(1); });
    const p2 = enqueueSave("k", "K", async () => { order.push(2); });
    await tick();
    expect(order).toEqual([]); // 2 must not start before 1 finishes
    release1();
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it("keeps different keys concurrent", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const order: string[] = [];
    const slow = enqueueSave("k1", "K1", async () => { await gate; order.push("slow"); });
    const fast = enqueueSave("k2", "K2", async () => { order.push("fast"); });
    expect(await fast).toBe(true);
    expect(order).toEqual(["fast"]); // k2 did not wait behind k1
    release();
    await slow;
    expect(order).toEqual(["fast", "slow"]);
  });

  it("records a failure (false, error message) and never rejects", async () => {
    const ok = await enqueueSave("k", "Notes", async () => { throw new Error("disk full"); });
    expect(ok).toBe(false);
    expect(saveStatus.health).toBe("error");
    expect(saveStatus.error).toContain("Notes couldn't be stored");
  });

  it("continues the chain after a failure and clears the error on the next success", async () => {
    await enqueueSave("k", "K", async () => { throw new Error("boom"); });
    expect(saveStatus.health).toBe("error");
    const ok = await enqueueSave("k", "K", async () => {});
    expect(ok).toBe(true);
    expect(saveStatus.health).toBe("saved");
    expect(saveStatus.error).toBeNull();
  });

  it("an error on one key survives a success on another (per-destination honesty)", async () => {
    await enqueueSave("library", "Library details", async () => { throw new Error("quota"); });
    await enqueueSave("annotations", "Notes", async () => {});
    expect(saveStatus.health).toBe("error");
    expect(saveStatus.error).toContain("Library details");
  });

  it("single-writer gate: a non-writer tab is refused (read-only) and the job never runs (Issue 22)", async () => {
    let ran = false;
    setWriterGate(() => false); // this tab is NOT the writer
    const ok = await enqueueSave("annotations", "Notes", async () => { ran = true; });
    expect(ok).toBe(false); // refused
    expect(ran).toBe(false); // the OPFS write never happened — the writer tab is not overwritten
    expect(saveStatus.health).toBe("error");
    expect(saveStatus.error).toContain("read-only");
  });

  it("single-writer gate: once this tab is the writer, writes run and the read-only status clears", async () => {
    setWriterGate(() => false);
    await enqueueSave("k", "K", async () => {});
    expect(saveStatus.error).toContain("read-only");
    setWriterGate(() => true); // took over editing
    const ok = await enqueueSave("k", "K", async () => {});
    expect(ok).toBe(true);
    expect(saveStatus.error).toBeNull(); // stale read-only status cleared
  });

  it("single-writer gate: names the other tab in the refusal message when known (Archie-198c)", async () => {
    setWriterGate(() => false);
    setWriterOtherName(() => "Meera");
    const ok = await enqueueSave("annotations", "Notes", async () => {});
    expect(ok).toBe(false);
    expect(saveStatus.error).toContain("Meera is editing this library in another tab");
  });

  it("single-writer gate: falls back to the impersonal message when the other tab is anonymous", async () => {
    setWriterGate(() => false);
    setWriterOtherName(() => null);
    const ok = await enqueueSave("annotations", "Notes", async () => {});
    expect(ok).toBe(false);
    expect(saveStatus.error).toBe(
      "This tab is read-only — another tab is editing this library. Choose “Take over editing” to make changes here.",
    );
  });

  it("single-writer gate: no otherName getter installed behaves exactly as before (impersonal message)", async () => {
    setWriterGate(() => false);
    const ok = await enqueueSave("annotations", "Notes", async () => {});
    expect(ok).toBe(false);
    expect(saveStatus.error).toContain("another tab is editing this library");
  });

  it("pending counts across keys while writes are in flight", async () => {
    let r1!: () => void, r2!: () => void;
    const p1 = enqueueSave("a", "A", () => new Promise<void>((r) => (r1 = r)));
    const p2 = enqueueSave("b", "B", () => new Promise<void>((r) => (r2 = r)));
    await tick();
    expect(saveStatus.pending).toBe(2);
    expect(saveStatus.health).toBe("saving");
    r1(); r2();
    await Promise.all([p1, p2]);
    expect(saveStatus.pending).toBe(0);
  });
});

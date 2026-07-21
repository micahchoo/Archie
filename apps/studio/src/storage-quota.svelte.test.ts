import { describe, it, expect, vi, afterEach } from "vitest";
import { storageQuota, refreshQuota, reportStorageFailure, reportStorageOk, formatBytes } from "./storage-quota.svelte.js";

// The store is module-level rune state shared across tests — put it back to a known shape after each.
afterEach(async () => {
  reportStorageOk();
  vi.unstubAllGlobals(); // also removes any stubbed `window` (the Tauri-marker case below)
  await refreshQuota(); // navigator restored → usage returns to whatever the real env reports (null here)
});

function stubEstimate(usage: number | undefined): void {
  vi.stubGlobal("navigator", {
    storage: { estimate: async () => (usage === undefined ? {} : { usage, quota: usage + 10 * 1024 ** 3 }) },
  });
}

describe("level", () => {
  it("is unknown (chip hidden) when there is no estimate — never a fabricated zero", async () => {
    stubEstimate(undefined);
    await refreshQuota();
    expect(storageQuota.usage).toBeNull();
    expect(storageQuota.level).toBe("unknown");
  });

  it("is calm with a reading, regardless of how large usage is — there is no honest percentage", async () => {
    // 30 GB stored: the old fraction-of-quota framing called this 75% "warn". With the reported
    // quota being usage+10GiB (a privacy constant), no usage level is itself alarming.
    stubEstimate(30 * 1024 ** 3);
    await refreshQuota();
    expect(storageQuota.level).toBe("calm");
  });

  it("goes critical on a witnessed write failure — the only true 'storage full' signal", async () => {
    stubEstimate(5 * 1024 ** 3);
    await refreshQuota();
    reportStorageFailure();
    expect(storageQuota.level).toBe("critical");
  });

  it("a witnessed failure outranks a missing estimate", async () => {
    stubEstimate(undefined);
    await refreshQuota();
    reportStorageFailure();
    expect(storageQuota.level).toBe("critical"); // the chip must not hide the one state that matters
  });
});

describe("recovery", () => {
  it("clears on a successful write (persistAsset reports both directions)", async () => {
    stubEstimate(5 * 1024 ** 3);
    await refreshQuota();
    reportStorageFailure();
    reportStorageOk();
    expect(storageQuota.level).toBe("calm");
  });

  it("clears when usage drops below the at-failure mark — in-app deletion with no write after it", async () => {
    stubEstimate(5 * 1024 ** 3);
    await refreshQuota();
    reportStorageFailure(); // marked at 5 GB
    stubEstimate(3 * 1024 ** 3); // user deleted exhibits
    await refreshQuota();
    expect(storageQuota.level).toBe("calm");
  });

  it("stays critical while usage has not dropped — polling alone must not talk the warning down", async () => {
    stubEstimate(5 * 1024 ** 3);
    await refreshQuota();
    reportStorageFailure();
    await refreshQuota(); // same usage re-read
    expect(storageQuota.level).toBe("critical");
  });
});

describe("native (Tauri) inertness (Archie-623e Phase 3)", () => {
  it("refreshQuota leaves usage null and a write failure never raises the critical chip", async () => {
    stubEstimate(5 * 1024 ** 3); // even with a real estimate available...
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} }); // ...isTauri() short-circuits the chip subsystem
    await refreshQuota();
    expect(storageQuota.usage).toBeNull(); // native folder → no quota reading; the chip hides (unknown)
    reportStorageFailure();
    expect(storageQuota.level).toBe("unknown"); // NOT critical — native ENOSPC uses the save-error path
  });
});

describe("formatBytes", () => {
  it("keeps one decimal under 10 units and drops it above", () => {
    expect(formatBytes(9.3 * 1024 ** 3)).toBe("9.3 GB");
    expect(formatBytes(47 * 1024 ** 3)).toBe("47 GB");
    expect(formatBytes(1.5 * 1024 ** 2)).toBe("1.5 MB");
  });

  it("steps down through MB, KB, and B", () => {
    expect(formatBytes(512 * 1024 ** 2)).toBe("512 MB");
    expect(formatBytes(4 * 1024)).toBe("4 KB");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(0)).toBe("0 B");
  });
});

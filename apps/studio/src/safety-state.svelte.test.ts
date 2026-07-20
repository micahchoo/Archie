import { describe, it, expect } from "vitest";
import { computeSafetyState, hasRealWorkIn, type SafetyStateInputs } from "./safety-state.svelte.js";

// Everything clean: no dirt anywhere, unbound, no real content yet — the fresh-boot baseline.
const CLEAN: SafetyStateInputs = {
  sessDirty: false,
  saveHealth: "idle",
  bindingKind: "unbound",
  bindingDirty: false,
  bindingBusy: false,
  bindingError: null,
  hasRealWork: false,
};

describe("computeSafetyState", () => {
  it("is Saved when nothing is dirty, in flight, or failed", () => {
    expect(computeSafetyState(CLEAN)).toBe("saved");
  });

  it("is Saved for an untouched seed/template library even though unbound (never Action needed)", () => {
    expect(computeSafetyState({ ...CLEAN, bindingKind: "unbound", hasRealWork: false })).toBe("saved");
  });

  describe("Saving", () => {
    it("is Saving on an immediate session edit not yet enqueued (sessDirty)", () => {
      expect(computeSafetyState({ ...CLEAN, sessDirty: true })).toBe("saving");
    });

    it("is Saving while the app-wide save queue is draining", () => {
      expect(computeSafetyState({ ...CLEAN, saveHealth: "saving" })).toBe("saving");
    });

    it("is Saving while an explicit Save/Open is in flight", () => {
      expect(computeSafetyState({ ...CLEAN, bindingBusy: true })).toBe("saving");
    });

    it("is Saving for a folder binding whose mirror hasn't caught up yet", () => {
      expect(computeSafetyState({ ...CLEAN, bindingKind: "folder", bindingDirty: true })).toBe("saving");
    });

    it("a folder binding that IS current (not dirty) stays Saved — folder auto-completes", () => {
      expect(computeSafetyState({ ...CLEAN, bindingKind: "folder", bindingDirty: false })).toBe("saved");
    });
  });

  describe("Action needed", () => {
    it("is Action needed for a stale file binding (flush needed)", () => {
      expect(computeSafetyState({ ...CLEAN, bindingKind: "file", bindingDirty: true })).toBe("action-needed");
    });

    it("a file binding that is current (not dirty) stays Saved", () => {
      expect(computeSafetyState({ ...CLEAN, bindingKind: "file", bindingDirty: false })).toBe("saved");
    });

    it("is Action needed for an unbound library with real user work", () => {
      expect(computeSafetyState({ ...CLEAN, bindingKind: "unbound", hasRealWork: true })).toBe("action-needed");
    });

    it("a folder binding never reaches Action needed — it auto-mirrors", () => {
      // Even a stale-looking folder binding just reads as Saving, never Action needed (CONTEXT.md: binding
      // kind determines whether the mirror stage can auto-complete; folder always can).
      expect(computeSafetyState({ ...CLEAN, bindingKind: "folder", bindingDirty: true, hasRealWork: true })).toBe("saving");
    });

    it("a flush already in flight (busy) reads as Saving, not stuck Action needed", () => {
      expect(computeSafetyState({ ...CLEAN, bindingKind: "file", bindingDirty: true, bindingBusy: true })).toBe("saving");
      expect(computeSafetyState({ ...CLEAN, bindingKind: "unbound", hasRealWork: true, bindingBusy: true })).toBe("saving");
    });
  });

  describe("Failed", () => {
    it("is Failed when the app-wide save queue has an error", () => {
      expect(computeSafetyState({ ...CLEAN, saveHealth: "error" })).toBe("failed");
    });

    it("is Failed when the mirror stage has a sticky error (lost binding / write failure)", () => {
      expect(computeSafetyState({ ...CLEAN, bindingError: "Couldn't save to \"Notes\"." })).toBe("failed");
    });
  });

  describe("Read-only (UX-CRITIQUE O2: the writer lock trumps every save-health state)", () => {
    it("is Read-only over a clean pipeline (never a misleading Saved)", () => {
      expect(computeSafetyState({ ...CLEAN, readOnly: true })).toBe("read-only");
    });

    it("is Read-only over a queue error — the exact O2 case: a refused write must not offer Retry", () => {
      expect(computeSafetyState({ ...CLEAN, readOnly: true, saveHealth: "error" })).toBe("read-only");
    });

    it("is Read-only over a sticky mirror error", () => {
      expect(computeSafetyState({ ...CLEAN, readOnly: true, bindingError: "nope" })).toBe("read-only");
    });

    it("is Read-only over Action needed and Saving (no save churn in a tab that doesn't save)", () => {
      expect(computeSafetyState({ ...CLEAN, readOnly: true, bindingKind: "file", bindingDirty: true })).toBe("read-only");
      expect(computeSafetyState({ ...CLEAN, readOnly: true, sessDirty: true })).toBe("read-only");
    });

    it("omitting readOnly keeps the original decision (pre-writer-lock callers stay valid)", () => {
      expect(computeSafetyState({ ...CLEAN, saveHealth: "error" })).toBe("failed");
    });
  });

  describe("precedence: Failed > Action needed > Saving > Saved", () => {
    it("Failed wins over a simultaneous Action needed", () => {
      expect(
        computeSafetyState({ ...CLEAN, bindingKind: "file", bindingDirty: true, bindingError: "nope" }),
      ).toBe("failed");
    });

    it("Failed wins over a simultaneous Saving", () => {
      expect(computeSafetyState({ ...CLEAN, saveHealth: "error", sessDirty: true })).toBe("failed");
    });

    it("Action needed wins over a simultaneous (unrelated) Saving", () => {
      // The file binding is stale (action needed) while some OTHER exhibit's autosave happens to be
      // mid-flight (saveHealth "saving") — the more persistent, more urgent claim wins.
      expect(
        computeSafetyState({ ...CLEAN, bindingKind: "file", bindingDirty: true, saveHealth: "saving" }),
      ).toBe("action-needed");
    });
  });
});

describe("hasRealWorkIn", () => {
  const isTemplate = (slug: string) => slug.startsWith("seed-");

  it("is false when every exhibit is still a template/seed slug", () => {
    expect(hasRealWorkIn([{ slug: "seed-a" }, { slug: "seed-b" }], isTemplate)).toBe(false);
  });

  it("is false for an empty library", () => {
    expect(hasRealWorkIn([], isTemplate)).toBe(false);
  });

  it("is true once any exhibit has left template status", () => {
    expect(hasRealWorkIn([{ slug: "seed-a" }, { slug: "my-exhibit" }], isTemplate)).toBe(true);
  });

  it("is true for a library made entirely of user-created exhibits", () => {
    expect(hasRealWorkIn([{ slug: "my-exhibit" }], isTemplate)).toBe(true);
  });
});

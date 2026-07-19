import { describe, it, expect } from "vitest";
import { asClientId, type AnnotationRecord, type ClientId } from "@render/core";
import { distinctEditors, hasMultipleEditors, editorLabel, relativeTime, attributionChip } from "./collab-attribution.js";

// Fixture shape matches what every call site needs (Pick<AnnotationRecord, "lastEditor" | "modifiedAt">,
// both fields non-optional on the real model). Individual tests still pass `undefined` at the call site
// to exercise collab-attribution.ts's defensive fallbacks (an absent stamp/time) — real AnnotationRecords
// always carry both, but legacy/imported data is not guaranteed to, which is exactly what those fallbacks
// are for. The casts below are type-only; the runtime value stays `undefined` for those cases.
const rec = (lastEditor?: string, modifiedAt?: string): Pick<AnnotationRecord, "lastEditor" | "modifiedAt"> =>
  ({ lastEditor: lastEditor as unknown as ClientId, modifiedAt: modifiedAt as unknown as string });

describe("distinctEditors / hasMultipleEditors — the ≥2 gate for all attribution chrome", () => {
  it("folds an absent stamp to one 'unknown' bucket", () => {
    expect(distinctEditors([rec("meera"), rec(undefined), rec(undefined)])).toEqual(new Set(["meera", "unknown"]));
  });
  it("a solo library (one editor) is NOT multi-editor", () => {
    expect(hasMultipleEditors([rec("meera"), rec("meera")])).toBe(false);
  });
  it("two distinct editors flips the gate on", () => {
    expect(hasMultipleEditors([rec("meera"), rec("priya")])).toBe(true);
  });
  it("empty set is not multi-editor", () => {
    expect(hasMultipleEditors([])).toBe(false);
  });
});

describe("editorLabel — the stamp IS the chosen name", () => {
  const you = asClientId("me");
  it("your own edits read 'You'", () => {
    expect(editorLabel("me", you)).toBe("You");
  });
  it("a chosen name shows verbatim", () => {
    expect(editorLabel("Meera", you)).toBe("Meera");
  });
  it("anonymous / unset reads 'A collaborator'", () => {
    expect(editorLabel("anonymous", you)).toBe("A collaborator");
    expect(editorLabel(undefined, you)).toBe("A collaborator");
  });
  it("a long opaque id falls back to a short prefix", () => {
    expect(editorLabel("01hzzk9q8r7m4v2b3n5x6y7z8w", you)).toBe("01hzzk…");
  });
});

describe("relativeTime — coarse 'N ago' buckets", () => {
  const now = Date.parse("2026-07-19T12:00:00Z");
  it("just now under 45s", () => { expect(relativeTime("2026-07-19T11:59:30Z", now)).toBe("just now"); });
  it("minutes", () => { expect(relativeTime("2026-07-19T11:30:00Z", now)).toBe("30m ago"); });
  it("hours", () => { expect(relativeTime("2026-07-19T09:00:00Z", now)).toBe("3h ago"); });
  it("days", () => { expect(relativeTime("2026-07-17T12:00:00Z", now)).toBe("2d ago"); });
  it("weeks", () => { expect(relativeTime("2026-06-14T12:00:00Z", now)).toBe("5w ago"); });
  it("absent / unparseable → empty", () => {
    expect(relativeTime(undefined, now)).toBe("");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("attributionChip — 'Meera · 2d ago'", () => {
  const now = Date.parse("2026-07-19T12:00:00Z");
  const you = asClientId("me");
  it("name + relative time", () => {
    expect(attributionChip(rec("Meera", "2026-07-17T12:00:00Z"), you, now)).toBe("Meera · 2d ago");
  });
  it("collapses to just the name when time is unknown", () => {
    expect(attributionChip(rec("Meera", undefined), you, now)).toBe("Meera");
  });
});

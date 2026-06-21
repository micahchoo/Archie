// QA(studio-keyboard-navigation): the keyboard REGISTRY is the single source of truth driving both the
// `?` cheat-sheet and the handlers. These tests pin the `matches`/`typingInField` matcher vocabulary so the
// two can never silently drift. Node env (no DOM): KeyboardEvent/target are fabricated as plain objects,
// which is all the pure matcher reads.
import { describe, it, expect } from "vitest";
import { matches, typingInField, SHORTCUTS, SHORTCUT_GROUPS } from "./shortcuts.js";

const ev = (key: string, mod: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, ...mod }) as KeyboardEvent;

describe("shortcuts registry", () => {
  it("every shortcut declares a group the cheat-sheet knows", () => {
    for (const s of SHORTCUTS) expect(SHORTCUT_GROUPS).toContain(s.group);
  });
  it("keys are unique in the registry", () => {
    const keys = SHORTCUTS.map((s) => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("matches — modified shortcuts", () => {
  it("⌘S fires on meta+s AND ctrl+s (cross-platform), not bare s", () => {
    expect(matches(ev("s", { metaKey: true }), "⌘S")).toBe(true);
    expect(matches(ev("s", { ctrlKey: true }), "⌘S")).toBe(true);
    expect(matches(ev("s"), "⌘S")).toBe(false);
  });
  it("⌘K requires a modifier so it never collides with bare K", () => {
    expect(matches(ev("k", { metaKey: true }), "⌘K")).toBe(true);
    expect(matches(ev("k"), "⌘K")).toBe(false);
  });
});

describe("matches — bare keys require NO modifier (⌘K ≠ K)", () => {
  it("a single letter fires only without meta/ctrl/alt", () => {
    expect(matches(ev("n"), "N")).toBe(true);
    expect(matches(ev("N"), "N")).toBe(true); // case-insensitive
    expect(matches(ev("n", { metaKey: true }), "N")).toBe(false);
    expect(matches(ev("b", { ctrlKey: true }), "B")).toBe(false);
    expect(matches(ev("i", { altKey: true }), "I")).toBe(false);
  });
});

describe("matches — named keys", () => {
  it.each([
    ["Escape", "Esc"],
    ["ArrowLeft", "←"],
    ["ArrowRight", "→"],
    ["?", "?"],
    ["[", "["],
    ["]", "]"],
  ])("%s maps to %s", (key, descriptor) => {
    expect(matches(ev(key), descriptor)).toBe(true);
  });
  it("Space accepts both ' ' and legacy 'Spacebar'", () => {
    expect(matches(ev(" "), "Space")).toBe(true);
    expect(matches(ev("Spacebar"), "Space")).toBe(true);
  });
  it("⌫ accepts Backspace and Delete", () => {
    expect(matches(ev("Backspace"), "⌫")).toBe(true);
    expect(matches(ev("Delete"), "⌫")).toBe(true);
  });
});

describe("typingInField — bare-letter shortcuts must not fire while typing", () => {
  const withTarget = (t: unknown) => ({ target: t }) as unknown as KeyboardEvent;
  it.each(["INPUT", "TEXTAREA", "SELECT"])("true inside <%s>", (tagName) => {
    expect(typingInField(withTarget({ tagName }))).toBe(true);
  });
  it("true inside a contenteditable element", () => {
    expect(typingInField(withTarget({ tagName: "DIV", isContentEditable: true }))).toBe(true);
  });
  it("false on a plain element and on a null target", () => {
    expect(typingInField(withTarget({ tagName: "DIV", isContentEditable: false }))).toBe(false);
    expect(typingInField(withTarget(null))).toBe(false);
  });
});

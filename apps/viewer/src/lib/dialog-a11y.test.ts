/**
 * @vitest-environment happy-dom
 */
// Archie-81fa: the dialog a11y action (the focus trap shared by NoteLightbox + SearchOverlay) had zero
// tests. This suite pins its keyboard contract in a real DOM — happy-dom PER-FILE (this docblock), so
// the rest of the viewer suite keeps running in plain node. No visibility stubbing is needed: happy-dom
// gives every attached element one client rect (measured), so the action's `getClientRects().length > 0`
// filter sees the fixture elements as visible.
import { describe, it, expect, vi, afterEach } from "vitest";
import { dialog } from "./dialog-a11y.js";

let active: ReturnType<typeof dialog> | null = null;

afterEach(() => {
  active?.destroy();
  active = null;
  document.body.innerHTML = "";
});

/** Build the open-a-dialog moment: a TRIGGER button outside the dialog holds focus (the action snapshots
 *  `document.activeElement` at mount), then the action mounts on a root containing `html`. */
function mount(html: string) {
  const trigger = document.createElement("button");
  trigger.textContent = "open dialog";
  document.body.appendChild(trigger);
  trigger.focus();
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  const onclose = vi.fn();
  active = dialog(root, { onclose });
  return { root, trigger, onclose };
}

/** Dispatch a bubbling, cancelable keydown from the currently-focused element (as a real key would). */
function press(key: string, shiftKey = false): KeyboardEvent {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  const e = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

describe("initial focus moves INTO the dialog, by priority", () => {
  it("prefers [data-dialog-autofocus] — even when it is not the first focusable", () => {
    const { root } = mount('<button id="first">a</button><input id="auto" data-dialog-autofocus />');
    expect(document.activeElement).toBe(root.querySelector("#auto"));
  });

  it("falls back to the first focusable when nothing is marked autofocus", () => {
    const { root } = mount('<a href="#x" id="first">link</a><button id="second">b</button>');
    expect(document.activeElement).toBe(root.querySelector("#first"));
  });

  it("falls back to the root (made programmatically focusable) when nothing inside is focusable", () => {
    const { root } = mount("<p>plain text only</p>");
    expect(root.tabIndex).toBe(-1); // the action minted the focusability itself
    expect(document.activeElement).toBe(root);
  });
});

describe("Tab trap — wraps at both ends, never reaching the page behind the scrim", () => {
  const THREE = '<button id="b1">1</button><button id="b2">2</button><button id="b3">3</button>';

  it("Tab from the last focusable wraps to the first", () => {
    const { root } = mount(THREE);
    root.querySelector<HTMLElement>("#b3")!.focus();
    const e = press("Tab");
    expect(document.activeElement).toBe(root.querySelector("#b1"));
    expect(e.defaultPrevented).toBe(true); // the action moved focus itself
  });

  it("Shift-Tab from the first focusable wraps to the last", () => {
    const { root } = mount(THREE);
    expect(document.activeElement).toBe(root.querySelector("#b1")); // initial focus = first
    const e = press("Tab", true);
    expect(document.activeElement).toBe(root.querySelector("#b3"));
    expect(e.defaultPrevented).toBe(true);
  });

  it("mid-list Tab is NOT intercepted (native order runs while it stays inside the dialog)", () => {
    const { root } = mount(THREE);
    root.querySelector<HTMLElement>("#b2")!.focus();
    const e = press("Tab");
    expect(e.defaultPrevented).toBe(false);
  });
});

describe("ESC delegates the close to the caller", () => {
  it("calls onclose (the caller owns its own teardown/route)", () => {
    const { onclose } = mount("<button>x</button>");
    press("Escape");
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("update() swaps the onclose handler in place", () => {
    const { onclose } = mount("<button>x</button>");
    const next = vi.fn();
    active!.update({ onclose: next });
    press("Escape");
    expect(onclose).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("destroy closes the loop", () => {
  it("returns focus to the trigger when it is still in the DOM", () => {
    const { trigger } = mount("<button>x</button>");
    expect(document.activeElement).not.toBe(trigger); // focus went into the dialog at mount
    active!.destroy();
    active = null;
    expect(document.activeElement).toBe(trigger);
  });

  it("leaves focus alone when the trigger has left the DOM (guarded — no throw)", () => {
    const { trigger } = mount("<button>x</button>");
    trigger.remove();
    expect(() => active!.destroy()).not.toThrow();
    active = null;
    expect(document.activeElement).not.toBe(trigger);
  });
});

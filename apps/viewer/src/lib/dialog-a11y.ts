// Dialog a11y action (Q-5): one source of truth for modal-dialog keyboard behaviour, shared by the
// NoteLightbox and the SearchOverlay. Wires the three things a `role="dialog" aria-modal="true"` owes a
// keyboard user: a focus TRAP (Tab/Shift-Tab cycle within the dialog, never escaping to the page behind
// the scrim), initial focus moved INTO the dialog on open, and focus RETURNED to the trigger on close.
// ESC is delegated back to the caller via `onclose` so each dialog keeps its own close semantics.
//
// Use: `<div use:dialog={{ onclose }}>` on the dialog's root element. The action snapshots the
// previously-focused element at mount and restores it on destroy.

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface DialogOptions {
  /** ESC was pressed inside the dialog — the caller closes (so it owns its own teardown/route). */
  onclose: () => void;
}

export function dialog(node: HTMLElement, opts: DialogOptions) {
  let onclose = opts.onclose;
  // Snapshot the trigger so focus can return to it on close (only restore if it's still in the document).
  const trigger = document.activeElement as HTMLElement | null;

  const focusables = (): HTMLElement[] =>
    Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (e) => e.offsetParent !== null || e === document.activeElement,
    );

  // Move focus INTO the dialog: prefer an explicit `[data-dialog-autofocus]` (e.g. a search input), else
  // the first focusable, else the dialog root (made programmatically focusable) so a screen reader lands
  // inside the modal rather than on the page behind it.
  const initial =
    node.querySelector<HTMLElement>("[data-dialog-autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE);
  if (initial) initial.focus();
  else {
    node.tabIndex = -1;
    node.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onclose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const firstItem = items[0]!;
    const lastItem = items[items.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    // Wrap at both ends so Tab can't reach the page behind the scrim.
    if (e.shiftKey && (active === firstItem || !node.contains(active))) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && active === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  }

  node.addEventListener("keydown", onkeydown);

  return {
    update(next: DialogOptions) {
      onclose = next.onclose;
    },
    destroy() {
      node.removeEventListener("keydown", onkeydown);
      // Return focus to the trigger (close-the-loop) — guard against a trigger that left the DOM.
      if (trigger && document.contains(trigger)) trigger.focus();
    },
  };
}

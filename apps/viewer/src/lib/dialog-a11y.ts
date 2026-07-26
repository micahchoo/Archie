// Dialog a11y action (Q-5): one source of truth for modal-dialog keyboard behaviour, shared by the
// NoteLightbox and the SearchOverlay. Wires the three things a `role="dialog" aria-modal="true"` owes a
// keyboard user: a focus TRAP (Tab/Shift-Tab cycle within the dialog, never escaping to the page behind
// the scrim), initial focus moved INTO the dialog on open, and focus RETURNED to the trigger on close.
// ESC is delegated back to the caller via `onclose` so each dialog keeps its own close semantics.
//
// Use: `<div use:dialog={{ onclose }}>` on the dialog's root element. The action snapshots the
// previously-focused element at mount and restores it on destroy.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CONTRACT FOR CALLERS: **do not unmount the trigger's container while the dialog is open.**
// (Measured 2026-07-25, Archie-dbbc. Recorded here because this bit once and nothing caught it.)
//
// The restore target is captured from `document.activeElement` at ACTION MOUNT (`const trigger`
// below) and restored in `destroy()` under `if (trigger && document.contains(trigger))`. Two
// consequences that are not obvious from the call site:
//
//   1. There is NO restore-target parameter. `DialogOptions` carries `onclose` and nothing else, so a
//      caller cannot tell the action where to send focus. Adding one would not help either: a caller
//      that unmounts and remounts its trigger produces a DIFFERENT NODE, so no node reference
//      survives the round trip. Only restore-by-RE-QUERY (an `onrestore` callback that re-finds the
//      element after a `tick()`) could work, and nothing needs it yet.
//   2. Unmounting the trigger therefore breaks focus return SILENTLY — no throw, no type error, no
//      unit-test failure. `document.contains(trigger)` is simply false and `destroy()` does nothing;
//      the reader is left on `<body>` behind a closed dialog.
//
// The failure is ORDER-INDEPENDENT, so "we'll sequence the effects correctly" is not a fix. Measured
// in both flush orders: unmount-first captures `BODY` (nothing useful to restore), action-first
// captures the right node and then finds it detached at destroy. Both strand the reader.
//
// Only a DRIVEN BROWSER catches this — jsdom has no focus model worth the name and svelte-check
// cannot see mount order. `apps/viewer/e2e/note.spec.ts`'s V62/V63 guards are the enforcement.
// The live instance of this contract is `Reader.svelte` / `NarrativeReader.svelte`'s `.note-slot`:
// the note card is hidden with `display: none` rather than unmounted while the reading sheet is
// open, specifically so its ⤢ stays in the document for this restore. See the comment there.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

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
      // getClientRects() covers position:fixed focusables too (offsetParent is null for those) — review
      (e) => e.getClientRects().length > 0 || e === document.activeElement,
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
      e.stopPropagation(); // own the close — don't co-fire an ancestor window ESC handler (review)
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

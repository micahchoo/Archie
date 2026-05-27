// Keyboard-shortcut REGISTRY — the single source of truth (CONTEXT §79 keyboard-registry intent). The data
// here drives BOTH the `?` cheat-sheet overlay (ShortcutsHelp.svelte) AND the handlers (App / AvEditor, via
// `matches`), so the help can never go stale. Pure, no DOM imports.

export interface Shortcut {
  /** Display string for the cheat-sheet (e.g. "⌘S", "[ ]", "← →"). */
  keys: string;
  /** Plain-language description (curator voice — see memory archie-ui-copy-curator-voice). */
  label: string;
  /** Cheat-sheet grouping. */
  group: "Anywhere" | "Image" | "Audio & video";
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "?", label: "Show or hide this shortcuts help", group: "Anywhere" },
  { keys: "⌘S", label: "Save the library", group: "Anywhere" },
  { keys: "Esc", label: "Close what's open — palette, then the note, then framing, then step back out", group: "Anywhere" },
  { keys: "V", label: "Select / move", group: "Image" },
  { keys: "R", label: "Draw a rectangle", group: "Image" },
  { keys: "P", label: "Draw a polygon", group: "Image" },
  { keys: "⌫", label: "Delete the selected note", group: "Image" },
  { keys: "[ ]", label: "Previous / next object on the rail", group: "Image" },
  { keys: "⌘K", label: "Cite a note or exhibit (while editing a note or section)", group: "Image" },
  { keys: "Space", label: "Play / pause", group: "Audio & video" },
  { keys: "I", label: "Mark the start of a moment", group: "Audio & video" },
  { keys: "N", label: "Add a note here", group: "Audio & video" },
  { keys: "← →", label: "Previous / next note", group: "Audio & video" },
  { keys: "B", label: "Draw a box on the video", group: "Audio & video" },
];

export const SHORTCUT_GROUPS: Shortcut["group"][] = ["Anywhere", "Image", "Audio & video"];

/**
 * Does a keydown match a shortcut key descriptor? One matcher for every key in the registry, so handlers
 * and the cheat-sheet speak the same vocabulary. Single letters require NO modifier (so ⌘K ≠ K).
 */
export function matches(e: KeyboardEvent, keys: string): boolean {
  const k = e.key;
  switch (keys) {
    case "⌘S": return (e.metaKey || e.ctrlKey) && k.toLowerCase() === "s";
    case "⌘K": return (e.metaKey || e.ctrlKey) && k.toLowerCase() === "k";
    case "?": return k === "?";
    case "Esc": return k === "Escape";
    case "Space": return k === " " || k === "Spacebar";
    case "←": return k === "ArrowLeft";
    case "→": return k === "ArrowRight";
    case "⌫": return k === "Backspace" || k === "Delete";
    case "[": return k === "[";
    case "]": return k === "]";
    default: return keys.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && k.toLowerCase() === keys.toLowerCase();
  }
}

/** True when focus is in a text field — bare-letter shortcuts (V/R/N/I/B…) must NOT fire while typing. */
export function typingInField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

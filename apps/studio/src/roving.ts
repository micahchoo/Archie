// Shared roving-tabindex index math (Archie-f260) — the one place arrow/Home/End map to a next index, so
// the notes listbox (§4) and the filmstrip rail (§2) don't each hand-roll clamp logic. Both axes fold to
// one forward/backward pair (Down/Right advance, Up/Left retreat) so a vertical list and a horizontal rail
// share it, matching how ExhibitOverview's grid roving already treats Down/Right as "forward". Pure +
// headless-testable (cf. reorder-state.ts).

/** The next roving index for a nav key, or null when `key` isn't a navigation key (leave focus put). */
export function roveIndex(current: number, count: number, key: string): number | null {
  if (count === 0) return null;
  const cur = current < 0 ? 0 : Math.min(current, count - 1);
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(count - 1, cur + 1);
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(0, cur - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

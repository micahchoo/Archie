// Grid landing density (SCALE-GALLERY Phase 4) — a 2-step audience preference (Comfortable / Compact)
// for the exhibit object grid, persisted per-device in localStorage. NOT per-exhibit (the preference is
// cross-exhibit) and NOT a URL param (not worth a shareable-link slot) — spike-0005 §3.
//
// The metrics couple the grid's min column width AND its `contain-intrinsic-size` estimate: they MUST
// move together, or the content-visibility virtualization (ObjectGrid `.grid > li`) mis-reserves height
// and scrolling janks (same coupling spike-0003 §3 flags for the Studio slider). One function returns
// both so a caller can't set one and forget the other.

export type Density = "comfortable" | "compact";

const KEY = "archie:gridDensity";

/** The grid metrics for a density: `minCol` feeds `minmax(<minCol>, 1fr)`, `intrinsic` feeds
 *  `contain-intrinsic-size: auto <intrinsic>`. Compact packs more, smaller cards; comfortable is the
 *  established default (matches ObjectGrid's prior 280px / 360px). */
export function densityMetrics(d: Density): { minCol: string; intrinsic: string } {
  return d === "compact"
    ? { minCol: "180px", intrinsic: "260px" }
    : { minCol: "280px", intrinsic: "360px" };
}

/** Read the persisted density. Default Comfortable when unset, unrecognized, or localStorage is
 *  unavailable (SSR / private mode). */
export function loadGridDensity(): Density {
  try {
    return localStorage.getItem(KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

/** Persist the density. Private-mode / SSR throws are swallowed — the choice simply resets next load. */
export function saveGridDensity(d: Density): void {
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* no localStorage — harmless */
  }
}

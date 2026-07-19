// App-local attribution helpers (Archie-90f1). Attribution is APP-LOCAL chrome — it reads ONLY the
// `lastEditor` stamp already on each AnnotationRecord (populated + serialized per the identity audit)
// and the local display name; it never adds a model/schema field (carry-sentinel territory stays
// untouched). Pure + DOM-free so the ≥2-editor gate, the editor label, and the relative-time chip are
// unit-tested here rather than smoke-tested in the Svelte shell.
import type { AnnotationRecord, ClientId } from "@render/core";

/** The distinct editors (lastEditor stamp) across a note set. Undefined/empty stamps fold to "unknown"
 *  — a note with no recorded editor is still ONE bucket, so it can't inflate the count past a real
 *  second author. This set's size is the ≥2 gate every attribution surface consults. */
export function distinctEditors(notes: readonly Pick<AnnotationRecord, "lastEditor">[]): Set<string> {
  const s = new Set<string>();
  for (const r of notes) s.add(String(r.lastEditor ?? "unknown"));
  return s;
}

/** True once ≥2 distinct editors have authored in the set. The single gate for ALL attribution chrome:
 *  a solo library (one editor, or none) renders zero chips and no filter lens (decision Archie-d71c). */
export function hasMultipleEditors(notes: readonly Pick<AnnotationRecord, "lastEditor">[]): boolean {
  return distinctEditors(notes).size >= 2;
}

/** Human label for an editor stamp. The stamp IS the chosen display name (author = asClientId(name), so
 *  a note authored by "Meera" carries lastEditor "Meera") — show it verbatim. Your own edits read "You";
 *  an unset / anonymous stamp reads "A collaborator"; an opaque machine id (long, no spaces) falls back
 *  to a short prefix so a raw ClientId never leaks a wall of characters into a chip. */
export function editorLabel(editor: string | undefined, you: ClientId): string {
  const e = String(editor ?? "unknown");
  if (e === String(you)) return "You";
  if (e === "unknown" || e === "anonymous") return "A collaborator";
  if (e.length > 16 && !/\s/.test(e)) return `${e.slice(0, 6)}…`;
  return e;
}

/** Coarse relative time from an ISO timestamp ("just now" / "2m ago" / "3h ago" / "2d ago" / "5w ago").
 *  Empty string for an absent/unparseable stamp so a chip degrades to just the name. */
export function relativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}

/** The chip text — "Meera · 2d ago" (name + relative time), collapsing to just the name when the time is
 *  unknown. Matches the decision's attribution copy exactly. */
export function attributionChip(
  rec: Pick<AnnotationRecord, "lastEditor" | "modifiedAt">,
  you: ClientId,
  now?: number,
): string {
  const who = editorLabel(rec.lastEditor, you);
  const when = relativeTime(rec.modifiedAt, now);
  return when ? `${who} · ${when}` : who;
}

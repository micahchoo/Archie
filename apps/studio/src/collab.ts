// Who-wrote-what breakdown for an opened .archie.zip (⑧, Archie-59a8). The summary panel this
// powers is ALSO live co-editing's entire serverless approximation (synthesis: async-zip DAG +
// Readings-as-isolated-passes + a "N notes since your last import" indicator). Pure + DOM-free.
import { AnnotationSession, type AnnotationLog, type ClientId } from "@render/core";

export interface CollabBreakdown {
  /** Live note counts by everyone who isn't `you`, descending. */
  others: { editor: string; count: number }[];
  /** Live notes attributed to `you`. */
  yours: number;
}

/** Count LIVE notes (heads projection — edits don't double-count, deletions drop out) per editor
 *  across all exhibits' logs. */
export function collabBreakdown(logs: Record<string, AnnotationLog>, you: ClientId): CollabBreakdown {
  const counts = new Map<string, number>();
  for (const log of Object.values(logs)) {
    for (const note of new AnnotationSession(you, log).notes()) {
      const editor = String(note.lastEditor ?? "unknown");
      counts.set(editor, (counts.get(editor) ?? 0) + 1);
    }
  }
  const yours = counts.get(String(you)) ?? 0;
  counts.delete(String(you));
  const others = [...counts.entries()]
    .map(([editor, count]) => ({ editor, count }))
    .sort((a, b) => b.count - a.count);
  return { others, yours };
}

/** The banner copy (draft — wording is human-gated, Archie-59a8). Null when there's nothing
 *  collaborative to say (no notes by anyone else). */
export function collabSummaryText(name: string, b: CollabBreakdown): string | null {
  if (b.others.length === 0) return null;
  const who = b.others.map((o) => `${o.count} note${o.count === 1 ? "" : "s"} by ${o.editor === "unknown" ? "a collaborator" : o.editor}`).join(", ");
  const yours = b.yours > 0 ? ` alongside ${b.yours} of yours` : "";
  return `Opened “${name}” — it carries ${who}${yours}. Annotate your pass and send the zip back to keep the exchange going.`;
}

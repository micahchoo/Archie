// AV transcript adapter (CONTEXT AV decision). Import: author supplies WebVTT/SRT; each cue becomes
// a Note with motivation:supplementing targeting the AV object's time range (FragmentSelector
// `t=start,end`). Export (Archie-bd0a): the inverse — those notes reconstructed as a WebVTT/SRT
// string, so an imported-then-corrected transcript can leave as a caption file again. No client-side
// ASR (Whisper is server-side). Pure.

import { appendNew } from "../spine/log.js";
import { projectHeads } from "../spine/heads.js";
import { timeFragmentValue } from "./time.js";
import { fragmentSelector, parseMediaFragment } from "../geometry/mediafragment.js";
import type { ClientId } from "../wadm/brand.js";
import type { AnnotationLog, W3CBody, W3CSpecificResource, W3CTarget, W3CTextualBody } from "../wadm/types.js";

export interface VttCue {
  /** seconds */
  start: number;
  /** seconds */
  end: number;
  text: string;
}

/** Parse `HH:MM:SS.mmm` / `MM:SS.mmm` (also accepts `,` decimal for SRT) into seconds. */
function parseTimestamp(s: string): number {
  const parts = s.trim().replace(",", ".").split(":");
  let h = 0, m = 0, sec = 0;
  if (parts.length === 3) [h, m, sec] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  else if (parts.length === 2) [m, sec] = [Number(parts[0]), Number(parts[1])];
  else return NaN;
  return h * 3600 + m * 60 + sec;
}

/** Parse WebVTT or SRT cues (the timestamp parser handles both decimal styles + index lines). */
function parseCues(input: string): VttCue[] {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cues: VttCue[] = [];
  for (const block of normalized.split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const arrowIdx = lines.findIndex((l) => l.includes("-->"));
    if (arrowIdx === -1) continue; // WEBVTT header, NOTE/comment, or empty block
    const arrowLine = lines[arrowIdx]!;
    const [startRaw, restRaw] = arrowLine.split("-->");
    const endRaw = (restRaw ?? "").trim().split(/\s+/)[0] ?? ""; // drop VTT cue settings after the end time
    const start = parseTimestamp(startRaw ?? "");
    const end = parseTimestamp(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const text = lines.slice(arrowIdx + 1).join("\n").trim();
    cues.push({ start, end, text });
  }
  return cues;
}

export function parseVtt(input: string): VttCue[] {
  return parseCues(input);
}

export function parseSrt(input: string): VttCue[] {
  return parseCues(input);
}

export interface TranscriptNote {
  motivation: "supplementing";
  body: W3CTextualBody;
  target: W3CSpecificResource;
}

/** Map cues to supplementing Notes targeting `source` at each cue's time range. */
export function cuesToNotes(cues: VttCue[], source: string): TranscriptNote[] {
  return cues.map((c) => ({
    motivation: "supplementing",
    body: { type: "TextualBody", value: c.text, format: "text/plain", purpose: "supplementing" },
    target: {
      type: "SpecificResource",
      source,
      selector: fragmentSelector(timeFragmentValue(c.start, c.end)),
    },
  }));
}

export interface ImportTranscriptOptions {
  source: string;
  lastEditor: ClientId;
  /** `vtt` | `srt`; the parser handles both regardless, so this is informational. */
  format?: "vtt" | "srt";
  now?: number;
  rng?: () => number;
}

/** Import a transcript file's cues as supplementing Notes appended to the log. */
export function importTranscript(log: AnnotationLog, input: string, opts: ImportTranscriptOptions): AnnotationLog {
  const notes = cuesToNotes(parseCues(input), opts.source);
  let current = log;
  let now = opts.now;
  for (const note of notes) {
    const res = appendNew(current, {
      target: note.target,
      body: note.body,
      motivation: note.motivation,
      lastEditor: opts.lastEditor,
      ...(now !== undefined ? { now } : {}),
      ...(opts.rng !== undefined ? { rng: opts.rng } : {}),
    });
    current = res.log;
    if (now !== undefined) now += 1; // distinct, time-ordered ids per cue
  }
  return current;
}

// ---- Export (Archie-bd0a): the inverse — supplementing time-range Notes back to WebVTT/SRT ----

/**
 * The structural subset the export reads. Both `TranscriptNote` (what cuesToNotes mints) and
 * `AnnotationRecord` (what the log holds) satisfy it, so `notesToCues` can be the exact inverse of
 * `cuesToNotes` AND accept `projectHeads(log)` directly.
 */
export interface TranscriptNoteLike {
  motivation?: string | string[];
  body?: W3CBody | W3CBody[];
  target: W3CTarget;
}

function isSupplementing(motivation: string | string[] | undefined): boolean {
  return motivation === "supplementing" || (Array.isArray(motivation) && motivation.includes("supplementing"));
}

/**
 * The cue time range of a note's target on `source`, or null when there is none: bare-IRI target,
 * other source, no FragmentSelector, no `t=` dimension, a point marker (a caption needs a duration),
 * or a malformed value. Delegates to parseMediaFragment — the one tolerant reader for `t=` /
 * combined `t=…&xywh=…` values — which returns empty on garbage instead of throwing, so a corrupt
 * selector skips this note without poisoning the rest (corrupt ≠ empty, per-item tolerance).
 */
function cueRangeOf(target: W3CTarget, source: string): { start: number; end: number } | null {
  if (typeof target !== "object" || target === null) return null;
  if (target.source !== source) return null;
  const selectors = target.selector === undefined ? [] : Array.isArray(target.selector) ? target.selector : [target.selector];
  for (const sel of selectors) {
    if (typeof sel !== "object" || sel === null || sel.type !== "FragmentSelector") continue;
    const time = parseMediaFragment(sel.value).time;
    if (time !== undefined && time.end !== undefined) return { start: time.start, end: time.end };
  }
  return null;
}

/** First TextualBody's text, or null when the note has none (nothing to caption). */
function textOf(body: W3CBody | W3CBody[] | undefined): string | null {
  const bodies = body === undefined ? [] : Array.isArray(body) ? body : [body];
  for (const b of bodies) {
    if (typeof b !== "object" || b === null) continue;
    if (b.type === "TextualBody" && "value" in b && typeof b.value === "string") return b.value;
  }
  return null;
}

/**
 * The exact inverse of cuesToNotes: collect the notes that are cues — motivation:supplementing, a
 * TextualBody, and a FragmentSelector `t=start,end` on `source` — back into VttCues, sorted by time
 * (a caption file is chronological; head order after edits is not). Anything else — other sources,
 * other motivations, point markers, malformed selectors — is skipped per-item, never thrown on.
 */
export function notesToCues(notes: readonly TranscriptNoteLike[], source: string): VttCue[] {
  const cues: VttCue[] = [];
  for (const note of notes) {
    if (!isSupplementing(note.motivation)) continue;
    const range = cueRangeOf(note.target, source);
    if (range === null) continue;
    const text = textOf(note.body);
    if (text === null) continue;
    cues.push({ start: range.start, end: range.end, text });
  }
  return cues.sort((a, b) => a.start - b.start || a.end - b.end); // stable: ties keep input order
}

/** Format seconds as a caption timestamp `HH:MM:SS<sep>mmm` (VTT `.` / SRT `,`), rounded to ms. */
function formatTimestamp(seconds: number, decimal: "." | ","): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = (totalMs - ms) / 1000;
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${decimal}${pad(ms, 3)}`;
}

/** A blank line ends a cue block (parseCues splits on it), so a hand-authored note whose text
 *  contains one would corrupt the file — collapse blank lines inside cue text. */
function cueText(text: string): string {
  return text.replace(/\n\s*\n/g, "\n");
}

/** Serialize cues as WebVTT — the write-side inverse of parseVtt. */
export function serializeVtt(cues: readonly VttCue[]): string {
  const blocks = cues.map((c) => `${formatTimestamp(c.start, ".")} --> ${formatTimestamp(c.end, ".")}\n${cueText(c.text)}`);
  return ["WEBVTT", ...blocks].join("\n\n") + "\n";
}

/** Serialize cues as SRT (numeric index lines, comma decimal) — the write-side inverse of parseSrt. */
export function serializeSrt(cues: readonly VttCue[]): string {
  if (cues.length === 0) return "";
  const blocks = cues.map((c, i) => `${i + 1}\n${formatTimestamp(c.start, ",")} --> ${formatTimestamp(c.end, ",")}\n${cueText(c.text)}`);
  return blocks.join("\n\n") + "\n";
}

export interface ExportTranscriptOptions {
  source: string;
  /** Output format; defaults to `vtt`. */
  format?: "vtt" | "srt";
}

/**
 * Export the log's transcript for an AV source as a caption-file string — the inverse of
 * importTranscript. Reads the LIVE heads (projectHeads), so corrected cues export their corrected
 * text and deleted cues drop out. render-core produces only the string; saving it is the caller's job.
 */
export function exportTranscript(log: AnnotationLog, opts: ExportTranscriptOptions): string {
  const cues = notesToCues(projectHeads(log), opts.source);
  return opts.format === "srt" ? serializeSrt(cues) : serializeVtt(cues);
}

// AV transcript adapter (CONTEXT AV decision): import-only v1. Author supplies WebVTT/SRT;
// each cue becomes a Note with motivation:supplementing targeting the AV object's time range
// (FragmentSelector `t=start,end`). No client-side ASR (Whisper is server-side). Pure.

import { appendNew } from "../spine/log.js";
import { timeFragmentValue } from "./time.js";
import type { ClientId } from "../wadm/brand.js";
import type { AnnotationLog, W3CSpecificResource, W3CTextualBody } from "../wadm/types.js";

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
      selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: timeFragmentValue(c.start, c.end) },
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

/** Import a transcript file's cues as supplementing Notes appended to the log (import-only v1). */
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

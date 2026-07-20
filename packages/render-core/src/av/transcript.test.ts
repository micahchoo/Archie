import { describe, it, expect } from "vitest";
import {
  parseVtt,
  parseSrt,
  cuesToNotes,
  importTranscript,
  notesToCues,
  serializeVtt,
  serializeSrt,
  exportTranscript,
  type TranscriptNoteLike,
} from "./transcript.js";
import { appendDelete, appendEdit } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import { projectHeads } from "../spine/heads.js";

// AV transcript adapter (CONTEXT AV decision): author supplies WebVTT/SRT; each cue -> a Note
// with motivation:supplementing targeting the AV object's time range (FragmentSelector t=s,e).
// Export (Archie-bd0a) is the inverse: those notes back out as a WebVTT/SRT string.

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:01:05.500 --> 00:01:09.000
Second cue
spanning two lines
`;

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:06,500
Bye
`;

describe("parseVtt", () => {
  it("parses cues with start/end seconds and text (ignoring the WEBVTT header)", () => {
    const cues = parseVtt(VTT);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 4, text: "Hello world" });
    expect(cues[1]!.start).toBe(65.5); // 00:01:05.500
    expect(cues[1]!.end).toBe(69);
    expect(cues[1]!.text).toBe("Second cue\nspanning two lines");
  });
});

describe("parseSrt", () => {
  it("parses SRT (comma decimal, numeric index lines)", () => {
    const cues = parseSrt(SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 4, text: "Hello world" });
    expect(cues[1]).toEqual({ start: 5, end: 6.5, text: "Bye" });
  });
});

describe("cuesToNotes", () => {
  it("maps each cue to a supplementing Note with a t=start,end FragmentSelector", () => {
    const notes = cuesToNotes(parseVtt(VTT), "https://ex.org/canvas/audio");
    expect(notes).toHaveLength(2);
    expect(notes[0]!.motivation).toBe("supplementing");
    expect(notes[0]!.body).toEqual({ type: "TextualBody", value: "Hello world", format: "text/plain", purpose: "supplementing" });
    const target = notes[0]!.target as { source: string; selector: { type: string; value: string } };
    expect(target.source).toBe("https://ex.org/canvas/audio");
    expect(target.selector).toEqual({ type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "t=1,4" });
  });
});

describe("importTranscript", () => {
  it("appends one note per cue into the log", () => {
    const log = importTranscript([], VTT, { source: "https://ex.org/canvas/audio", lastEditor: asClientId("importer"), format: "vtt", now: 1 });
    expect(log).toHaveLength(2);
    expect(projectHeads(log)).toHaveLength(2); // both are live heads
    expect(log.every((r) => r.motivation === "supplementing")).toBe(true);
  });

  it("auto-detects SRT vs VTT from content when format is omitted", () => {
    const log = importTranscript([], SRT, { source: "c", lastEditor: asClientId("i"), now: 1 });
    expect(log).toHaveLength(2);
  });
});

// ---- Export (Archie-bd0a): the inverse ----

const SOURCE = "https://ex.org/canvas/audio";
const FRAG = "http://www.w3.org/TR/media-frags/";

/** A well-formed supplementing cue-note, for the selection/tolerance tests. */
function cueNote(value: string, text: string, over: Partial<TranscriptNoteLike> = {}): TranscriptNoteLike {
  return {
    motivation: "supplementing",
    body: { type: "TextualBody", value: text, format: "text/plain", purpose: "supplementing" },
    target: { type: "SpecificResource", source: SOURCE, selector: { type: "FragmentSelector", conformsTo: FRAG, value } },
    ...over,
  };
}

describe("notesToCues", () => {
  it("is the exact inverse of cuesToNotes (parse → cuesToNotes → notesToCues ≈ original cues)", () => {
    const cues = parseVtt(VTT);
    expect(notesToCues(cuesToNotes(cues, SOURCE), SOURCE)).toEqual(cues);
  });

  it("selects only supplementing notes with a t=start,end selector on the given source", () => {
    const notes: TranscriptNoteLike[] = [
      cueNote("t=1,2", "keep"),
      cueNote("t=3,4&xywh=percent:0,0,50,50", "keep spatiotemporal"), // video region cue still has t=s,e
      { ...cueNote("t=5,6", "keep array motivation"), motivation: ["supplementing", "commenting"] },
      { ...cueNote("t=7,8", "wrong motivation"), motivation: "commenting" },
      { ...cueNote("t=9,10", "no motivation"), motivation: undefined as unknown as string },
      { motivation: "supplementing", body: { type: "TextualBody", value: "bare IRI" }, target: SOURCE },
      cueNote("t=11,12", "other source", { target: { type: "SpecificResource", source: "https://ex.org/other", selector: { type: "FragmentSelector", conformsTo: FRAG, value: "t=11,12" } } }),
      cueNote("xywh=pixel:1,2,3,4", "space-only, no time"),
      cueNote("t=13", "point marker — a caption needs a duration"),
      { motivation: "supplementing", target: { type: "SpecificResource", source: SOURCE, selector: { type: "FragmentSelector", conformsTo: FRAG, value: "t=14,15" } } }, // no body
      { motivation: "supplementing", body: { id: "https://ex.org/doc", type: "Text" }, target: { type: "SpecificResource", source: SOURCE, selector: { type: "FragmentSelector", conformsTo: FRAG, value: "t=16,17" } } }, // external body only
    ];
    expect(notesToCues(notes, SOURCE)).toEqual([
      { start: 1, end: 2, text: "keep" },
      { start: 3, end: 4, text: "keep spatiotemporal" },
      { start: 5, end: 6, text: "keep array motivation" },
    ]);
  });

  it("skips a malformed selector per-item without throwing (corrupt ≠ empty)", () => {
    const notes: TranscriptNoteLike[] = [
      cueNote("t=oops", "unparsable time"),
      cueNote("t=9,2", "end before start"),
      cueNote("t=-3,4", "negative start"),
      { ...cueNote("", "svg selector"), target: { type: "SpecificResource", source: SOURCE, selector: { type: "SvgSelector", value: "<svg><polygon points='0,0 1,1'/></svg>" } } },
      { ...cueNote("", "no selector"), target: { type: "SpecificResource", source: SOURCE } },
      cueNote("t=1,2", "survivor"),
    ];
    expect(notesToCues(notes, SOURCE)).toEqual([{ start: 1, end: 2, text: "survivor" }]);
  });

  it("sorts cues by start time — a caption file is chronological, head order is not", () => {
    const notes = [cueNote("t=65.5,69", "second"), cueNote("t=1,4", "first")];
    expect(notesToCues(notes, SOURCE).map((c) => c.text)).toEqual(["first", "second"]);
  });
});

describe("serializeVtt / serializeSrt", () => {
  it("round-trips VTT: parse(serialize(cues)) equals the original cues", () => {
    const cues = parseVtt(VTT);
    const out = serializeVtt(cues);
    expect(out.startsWith("WEBVTT\n\n")).toBe(true);
    expect(out).toContain("00:00:01.000 --> 00:00:04.000");
    expect(out).toContain("00:01:05.500 --> 00:01:09.000");
    expect(parseVtt(out)).toEqual(cues);
  });

  it("round-trips SRT: comma decimal, numeric index lines", () => {
    const cues = parseSrt(SRT);
    const out = serializeSrt(cues);
    expect(out.startsWith("1\n00:00:01,000 --> 00:00:04,000")).toBe(true);
    expect(out).toContain("\n2\n00:00:05,000 --> 00:00:06,500");
    expect(parseSrt(out)).toEqual(cues);
  });

  it("keeps a multi-line cue as one cue, collapsing an interior blank line (it would end the block)", () => {
    const out = serializeVtt([{ start: 1, end: 2, text: "para one\n\npara two" }]);
    expect(parseVtt(out)).toEqual([{ start: 1, end: 2, text: "para one\npara two" }]);
  });

  it("serializes an empty cue list as a bare header (VTT) / empty string (SRT)", () => {
    expect(serializeVtt([])).toBe("WEBVTT\n");
    expect(serializeSrt([])).toBe("");
  });
});

describe("exportTranscript", () => {
  it("round-trips an import: parse(exportTranscript(importTranscript(vtt))) equals the original cues", () => {
    const log = importTranscript([], VTT, { source: SOURCE, lastEditor: asClientId("importer"), now: 1 });
    expect(parseVtt(exportTranscript(log, { source: SOURCE }))).toEqual(parseVtt(VTT));
    expect(parseSrt(exportTranscript(log, { source: SOURCE, format: "srt" }))).toEqual(parseVtt(VTT));
  });

  it("exports the LIVE heads: a corrected cue exports its correction, a deleted cue drops out", () => {
    let log = importTranscript([], VTT, { source: SOURCE, lastEditor: asClientId("importer"), now: 1 });
    const heads = projectHeads(log);
    const first = heads.find((h) => (h.body as { value: string }).value === "Hello world")!;
    const second = heads.find((h) => h !== first)!;
    log = appendEdit(log, first.logicalId, {
      body: { type: "TextualBody", value: "Hello, corrected", format: "text/plain", purpose: "supplementing" },
      lastEditor: asClientId("editor"),
      now: 10,
    }).log;
    log = appendDelete(log, second.logicalId, { lastEditor: asClientId("editor"), now: 11 }).log;
    expect(parseVtt(exportTranscript(log, { source: SOURCE }))).toEqual([{ start: 1, end: 4, text: "Hello, corrected" }]);
  });

  it("exports only the requested source from a mixed log", () => {
    let log = importTranscript([], VTT, { source: SOURCE, lastEditor: asClientId("i"), now: 1 });
    log = importTranscript(log, SRT, { source: "https://ex.org/canvas/video", lastEditor: asClientId("i"), now: 10 });
    expect(parseVtt(exportTranscript(log, { source: "https://ex.org/canvas/video" }))).toEqual(parseSrt(SRT));
    expect(parseVtt(exportTranscript(log, { source: SOURCE }))).toEqual(parseVtt(VTT));
  });
});

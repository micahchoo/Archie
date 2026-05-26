import { describe, it, expect } from "vitest";
import { parseVtt, parseSrt, cuesToNotes, importTranscript } from "./transcript.js";
import { asClientId } from "../wadm/brand.js";
import { projectHeads } from "../spine/heads.js";

// AV transcript adapter (CONTEXT AV decision): author supplies WebVTT/SRT; each cue -> a Note
// with motivation:supplementing targeting the AV object's time range (FragmentSelector t=s,e).
// Import-only v1 (no client-side ASR).

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
  it("appends one note per cue into the log (import-only v1)", () => {
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

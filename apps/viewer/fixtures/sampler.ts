// The Showroom Sampler — a SMALL, additive demo exhibit that exercises Archie's AV + note-media
// surfaces the three Voynich/atlas/geo seeds don't reach: a VIDEO object (frame annotation), an AUDIO
// object with a transcript (time-ranged notes → MediaPlayer), and a NOTE carrying attached media
// (a markdown image → NoteMedia `.tile` → NoteLightbox).
//
// SOURCE OF TRUTH for both the Viewer (sample-data.ts) and the Studio (seed-data.ts) — like voynich.ts.
// Added as a NEW exhibit (slug "sampler"), never mutating the shared voynich fixture, so no existing
// exhibit's object/note counts change (project rule: never edit a shared fixture to satisfy one test).
//
// Rights: the sample media are openly licensed third-party works (template-content rule — never the
// author's personal work). Audio reuses the same openly-licensed Kryptogramm master as o12; video is
// Blender's "Big Buck Bunny" (CC BY 3.0); the note-media image is a public-domain Beinecke folio
// derivative already used as a Voynich cover.
import { asObjectId, type AObject } from "@render/core";

export const samplerTitle = "Showroom Sampler";
export const samplerSummary =
  "A tiny demo exhibit: a video to annotate frame-by-frame, an audio recording with a transcript, " +
  "and a note that carries its own picture.";
export const samplerCredits =
  "Video: “Big Buck Bunny” © Blender Foundation, CC BY 3.0 (peach.blender.org). " +
  "Audio: Kryptogramm — “04-f18v” (Elias Schwerdtfeger), CC BY-NC-SA 3.0. " +
  "Image: Beinecke Rare Book & Manuscript Library, Yale University — MS 408 (public domain).";

// Openly-licensed sample sources. The video is a small (1 MB) MP4 that loads headlessly; the audio
// reuses the Internet-Archive Kryptogramm master (the same file o12 links); the note image is a Yale
// IIIF 400px derivative (public domain).
const VIDEO_SOURCE = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";
const AUDIO_SOURCE = "https://archive.org/download/kryptogramm/04-f18v.mp3";
const NOTE_IMAGE = "https://collections.library.yale.edu/iiif/2/1006076/full/400,/0/default.jpg";

const IMAGE_SOURCE = "https://collections.library.yale.edu/iiif/2/1006076";
const IMAGE_RIGHTS = "http://creativecommons.org/publicdomain/mark/1.0/";

const VIDEO_RIGHTS = "https://creativecommons.org/licenses/by/3.0/";
const AUDIO_RIGHTS = "http://creativecommons.org/licenses/by-nc-sa/3.0/";

// sv1 = the VIDEO object (mediaType "video" → Studio AvEditor opens its <video> + frame-draw overlay,
// Viewer renders MediaPlayer). sa1 = the AUDIO object (mediaType "sound" → waveform + transcript).
// si1 = an IMAGE object whose note carries attached media — the grid Reader renders its NoteMedia tile
// (the AV MediaPlayer reader shows transcript prose only, never tiles), opening NoteLightbox on click.
export const samplerObjects: AObject[] = [
  {
    id: asObjectId("sv1"),
    source: VIDEO_SOURCE,
    label: "Big Buck Bunny (10s clip) — annotate a frame",
    mediaType: "video",
    format: "video/mp4",
    duration: 10,
    width: 640,
    height: 360,
    rights: VIDEO_RIGHTS,
    requiredStatement: { label: "Video", value: "“Big Buck Bunny” © Blender Foundation, CC BY 3.0" },
  },
  {
    id: asObjectId("sa1"),
    source: AUDIO_SOURCE,
    label: "Kryptogramm recording — listen with a transcript",
    mediaType: "sound",
    format: "audio/mpeg",
    duration: 296,
    rights: AUDIO_RIGHTS,
    requiredStatement: { label: "Audio", value: "Kryptogramm — Elias Schwerdtfeger, CC BY-NC-SA 3.0" },
  },
  {
    id: asObjectId("si1"),
    source: IMAGE_SOURCE,
    label: "A page with a note that carries a picture",
    mediaType: "image",
    width: 2972,
    height: 3766,
    rights: IMAGE_RIGHTS,
    requiredStatement: { label: "Source", value: "Beinecke Rare Book & Manuscript Library, Yale University — MS 408 (public domain)" },
  },
];

// Frame-region notes on the VIDEO object (spatiotemporal: a `t=` time window the curator can pair with
// a frame box). xywh here is provisional — the Viewer renders them on the timeline; the Studio editor
// lets a curator draw the frame box.
export interface SamplerTimeNote {
  objectId: string;
  t: string; // "start,end" in seconds
  comment: string;
}
export const samplerVideoNotes: SamplerTimeNote[] = [
  { objectId: "sv1", t: "0,3", comment: "The title card fades in — the moment to frame for a cover still." },
  { objectId: "sv1", t: "4,8", comment: "The first character appears; a frame box here would isolate the subject." },
];

// Transcript notes on the AUDIO object — the time-ranged spans that make the Viewer render the
// MediaPlayer's transcript track (one row per span).
export const samplerAudioNotes: SamplerTimeNote[] = [
  { objectId: "sa1", t: "0,30", comment: "The recording opens: the page is read aloud, letter by letter." },
  { objectId: "sa1", t: "45,80", comment: "A repeated cadence surfaces — a rhythm under the spoken marks." },
  { objectId: "sa1", t: "120,160", comment: "Here the sounds cluster like labels, as if naming the drawings." },
];

// A WHOLE-OBJECT note that CARRIES MEDIA: the markdown image embed makes render-core's splitNoteMedia
// extract the picture, so NoteMedia renders a clickable `.tile` thumbnail → NoteLightbox. (The prose
// survives alongside the stripped image.)
export interface SamplerMediaNote {
  objectId: string;
  comment: string;
}
export const samplerMediaNotes: SamplerMediaNote[] = [
  {
    objectId: "si1",
    comment:
      "This note carries its own picture — a detail held beside the page. " +
      `Click the thumbnail to see it full-screen. ![f1r — a related folio](${NOTE_IMAGE})`,
  },
];

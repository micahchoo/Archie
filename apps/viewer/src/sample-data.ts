// The Viewer's published Library — TWO real exhibits: the Voynich manuscript (Beinecke MS 408,
// generated ./voynich.ts) and "Techno-Futures from Bidar" (the COMPOST annotated map, ./bidar.ts).
// `published.ts` runs this through publishLibrary and reads it back per-exhibit, exactly as a static
// consumer would. One log per exhibit; each note targets its object's canvas.
import { appendNew, asClientId, importTranscript, type AObject, type AnnotationLog, type Library, type Section } from "@render/core";
import { voynichObjects, voynichNotes, voynichTitle, voynichCredits } from "./voynich.js";
import { bidarObject, bidarNotes, bidarTitle } from "./bidar.js";

export const BASE = "https://archie.demo/";
const author = asClientId("curator");
/** Canvas IRI grammar — MUST match publishLibrary's `${baseUrl}${slug}/canvas/${objId}`. */
export const canvasIdFor = (slug: string, objectId: string) => `${BASE}${slug}/canvas/${objectId}`;

interface SeedNote { objectId: string; region: [number, number, number, number]; comment: string }

function buildLog(slug: string, notes: SeedNote[]): AnnotationLog {
  let l: AnnotationLog = [];
  notes.forEach((n, i) => {
    const [x, y, w, h] = n.region;
    ({ log: l } = appendNew(l, {
      target: {
        type: "SpecificResource",
        source: canvasIdFor(slug, n.objectId),
        selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${x},${y},${w},${h}` },
      },
      body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }],
      lastEditor: author,
      now: i + 1,
    }));
  });
  return l;
}

const voynichLog = buildLog("voynich", voynichNotes);
const bidarLog = buildLog("bidar", bidarNotes.map((n) => ({ objectId: "o1", region: n.region, comment: n.comment })));

const voynichObjs: AObject[] = voynichObjects.map((o) => ({ id: o.id, source: o.source, label: o.label, width: o.width, height: o.height }));
const bidarObjs: AObject[] = [{ id: bidarObject.id, source: bidarObject.source, label: bidarObject.label, width: bidarObject.width, height: bidarObject.height }];
// Bidar's narrative spine — authored ON the Library exhibit so it PUBLISHES as IIIF Ranges and round-trips
// back via sectionsFromManifest (the Viewer no longer leans on the sample-data sectionsFor crutch).
const bidarSections: Section[] = bidarNotes.map((n, i) => {
  const [x, y, w, h] = n.region; // each reflection's map region → the section's camera target (ADR-0005 start)
  return { id: `s${i + 1}`, title: `${i + 1}`, objectId: "o1", start: `xywh=pixel:${x},${y},${w},${h}`, prose: n.comment };
});

// AV fixture (CONTEXT §81): a REAL Bidar field recording (a dholak geet recorded ON the PiZ mesh
// network at Faizpura — already referenced as a media link in the Bidar exhibit's notes) + descriptive
// time-anchored Notes built via the REAL importTranscript adapter. Kept a SEPARATE exhibit so it
// doesn't restructure Voynich/Bidar. Source is the COMPOST CDN (the Bidar map + media already depend
// on it). AV INGEST (upload/codec/size) stays gated (§152) — this is a published-source object.
// NB: the cue text is a descriptive LISTENING GUIDE (supplementing notes), not a verbatim transcript;
// times are approximate markers — tune them to the recording on browser-verify.
const avSource = "https://one.compost.digital/micah/annotation-assets/8/DholakGeet_Recording_on_the_PiZ_Network_recorder_by_Woman_Singer_at_Faizpura-_02.mp3";
const avObjs: AObject[] = [{ id: "o1", source: avSource, label: "Dholak Geet — recorded on the mesh, Faizpura", mediaType: "sound", format: "audio/mpeg" }];
const avVtt = `WEBVTT

00:00:00.000 --> 00:00:20.000
A dholak sets the pulse; a woman's voice enters over the drum — a geet carried on the mesh from Faizpura.

00:00:20.000 --> 00:00:50.000
The melody settles into its refrain; you can hear the room — the recorder is a Raspberry Pi node on the network.

00:00:50.000 --> 00:01:30.000
Other voices answer around her; the song is communal, sung with the room rather than performed for the mic.

00:01:30.000 --> 00:03:00.000
It loosens into talk and ambient sound — the field recording keeps running past the song.`;
const avLog = importTranscript([], avVtt, { source: canvasIdFor("av", "o1"), lastEditor: author, now: 1 });

export const library: Library = {
  id: "archie-lib",
  title: "The Archie Library",
  summary: voynichCredits,
  exhibits: [
    { id: "ex-voynich", slug: "voynich", title: voynichTitle, summary: "Five folios of MS 408 — herbal, cosmological, balneological, and script quires — closely read.", cover: voynichObjs[0]?.source ?? "", objects: voynichObjs, layout: "grid" },
    { id: "ex-bidar", slug: "bidar", title: bidarTitle, summary: "A condensed map of the Bidar mesh network — places, people, songs, and reflections from the field.", cover: bidarObject.source, objects: bidarObjs, layout: "narrative", sections: bidarSections },
    { id: "ex-av", slug: "av", title: "A Field Recording from Bidar", summary: "One sound from the mesh, read against its transcript — click a line to travel the audio.", objects: avObjs, layout: "single" },
  ],
};

const logsById: Record<string, AnnotationLog> = { "ex-voynich": voynichLog, "ex-bidar": bidarLog, "ex-av": avLog };
/** Log lookup for publishLibrary, by exhibit id. */
export const getLog = (exhibitId: string): AnnotationLog => logsById[exhibitId] ?? [];

/** Narrative sections (prose-spine) for an exhibit, order-bound to its annotations: section i
 *  activates annotation i. Bidar's field reflections read as a narrative over the map (§92). */
export const sectionsFor = (slug: string): Section[] =>
  slug === "bidar" ? bidarSections : [];

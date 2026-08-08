// Headless tests for the ONE Reading concept (reading-session.svelte.ts, Phase 5). The wall-text
// threshold machine (raise on activation / record on dismiss / ignore-seen reopen) is tested next to
// the pure gating rules it uses (reading-walltext.test.ts), with an injected store so the
// sessionStorage I/O seam is replaced — the machine itself is what's under test. The style minting
// (readingColourById / readingStyleOf / frameFor) is pinned here too.
//
// The `.svelte.test.ts` extension is load-bearing: `$state` here needs the Svelte compiler (the
// svelte plugin in vitest.config.ts, studio's library-meta.svelte.ts precedent).
import { describe, it, expect } from "vitest";
import { createReadingSession, type ReadingSessionData, type WallTextStore } from "./reading-session.svelte.js";
import type { Reading, W3CAnnotation } from "@render/core";

const R = (id: string, extra: Partial<Reading> = {}): Reading => ({ id, name: id, ...extra });

const ann = (id: string): W3CAnnotation => ({ id, type: "Annotation", motivation: "commenting", target: "" });

function memStore(): WallTextStore & { recorded: string[] } {
  const seen = new Set<string>();
  const recorded: string[] = [];
  return {
    seen: (rid) => seen.has(rid),
    record: (rid) => {
      seen.add(rid);
      recorded.push(rid);
    },
    recorded,
  };
}

function make(store?: WallTextStore) {
  // A $state data holder so the session's derivations track the exhibit filling in on mount.
  let data = $state<ReadingSessionData | null>(null);
  const session = createReadingSession({ slug: "voynich", data: () => data, ...(store ? { store } : {}) });
  const load = (d: ReadingSessionData) => (data = d);
  return { session, load };
}

const EXHIBIT: ReadingSessionData = {
  readings: [
    R("cipher", { colour: "#B3562C", prose: "The **full** voice of the cipher reading." }),
    R("hoax", { description: "One line." }),
    R("mute"),
  ],
  objects: [{ id: "o1" }, { id: "o2" }],
  annotationsByObject: {
    o1: [ann("base-1"), ann("base-2")],
    o2: [],
  },
  readingAnnotationsByObject: {
    o1: { cipher: [ann("c-1")], hoax: [] },
    o2: { cipher: [ann("c-2"), ann("c-3")] },
  },
};

describe("the wall-text threshold machine", () => {
  it("raise on activation: first entry to an unseen reading with prose raises its wall text", () => {
    // An injected store is REQUIRED here: the default store degrades to "seen" when sessionStorage
    // is absent (node), which is the privacy-mode contract — a test without a store could never see
    // a raise, exactly as a privacy-mode reader never sees a dialog.
    const { session, load } = make(memStore());
    load(EXHIBIT);
    session.openReading("cipher");
    expect(session.activeReading).toBe("cipher");
    expect(session.wallReading?.id).toBe("cipher");
  });

  it("record on dismiss: closing the dialog marks the reading seen this visit", () => {
    const store = memStore();
    const { session, load } = make(store);
    load(EXHIBIT);
    session.openReading("cipher");
    session.dismissWallText();
    expect(session.wallReading).toBeNull();
    expect(store.recorded).toEqual(["cipher"]);
  });

  it("seen-ignore: re-activating a seen reading is instant — no dialog (switching back is silent)", () => {
    const store = memStore();
    const { session, load } = make(store);
    load(EXHIBIT);
    session.openReading("cipher");
    session.dismissWallText(); // records seen
    session.openReading("cipher");
    expect(session.wallReading).toBeNull(); // seen this visit → silent
  });

  it("reopen on demand: the legend's (i) ignores seen", () => {
    const store = memStore();
    const { session, load } = make(store);
    load(EXHIBIT);
    session.openReading("cipher");
    session.dismissWallText();
    session.reopenWallText();
    expect(session.wallReading?.id).toBe("cipher"); // seen or not — the reader asked for it
  });

  it("General notes (null) is never wall-texted — it is not a Reading (amendment 2)", () => {
    const { session, load } = make();
    load(EXHIBIT);
    session.openReading(null);
    expect(session.activeReading).toBeNull();
    expect(session.wallReading).toBeNull();
  });

  it("a reading with nothing to say (no prose, no description) raises nothing", () => {
    const { session, load } = make();
    load(EXHIBIT);
    session.openReading("mute");
    expect(session.wallReading).toBeNull();
  });

  it("an unknown id degrades to silence, never an error", () => {
    const { session, load } = make();
    load(EXHIBIT);
    session.openReading("gone");
    expect(session.wallReading).toBeNull();
  });

  it("the A0 note-arrival seam assigns activeReading DIRECTLY — never raises the wall text (by design)", () => {
    const { session, load } = make();
    load(EXHIBIT);
    session.activeReading = "cipher"; // arriveAtNote's assignment, not the legend's radio
    expect(session.wallReading).toBeNull();
  });

  it("raises nothing before the exhibit loads (data null → empty readings)", () => {
    const { session } = make();
    session.openReading("cipher");
    expect(session.wallReading).toBeNull();
  });

  it("wallStats counts the reading's notes and the objects carrying them", () => {
    const { session, load } = make(memStore()); // stats describe the dialog UP — which needs a raise
    load(EXHIBIT);
    session.openReading("cipher");
    expect(session.wallStats).toEqual({ notes: 3, sources: 2 }); // c-1 on o1, c-2+c-3 on o2
  });

  it("wallStats is zero when no dialog is up", () => {
    const { session, load } = make();
    load(EXHIBIT);
    expect(session.wallStats).toEqual({ notes: 0, sources: 0 });
  });
});

describe("the reading projections", () => {
  it("annotationsOf returns the base page by default; overlays the active reading on top (Q16)", () => {
    const { session, load } = make();
    load(EXHIBIT);
    expect(session.annotationsOf("o1").map((a) => a.id)).toEqual(["base-1", "base-2"]);
    session.activeReading = "cipher";
    expect(session.annotationsOf("o1").map((a) => a.id)).toEqual(["base-1", "base-2", "c-1"]);
    session.activeReading = null;
    expect(session.annotationsOf("o1").map((a) => a.id)).toEqual(["base-1", "base-2"]);
  });

  it("readingCountOf counts per object, attachment not activity (id=null → base)", () => {
    const { session, load } = make();
    load(EXHIBIT);
    const countO1 = session.readingCountOf("o1");
    expect(countO1(null)).toBe(2);
    expect(countO1("cipher")).toBe(1);
    expect(countO1("hoax")).toBe(0);
    expect(session.readingCountOf("o2")("cipher")).toBe(2);
  });

  it("readingColourById maps each reading note to its reading's colour", () => {
    const { session, load } = make();
    load(EXHIBIT);
    expect(session.readingColourById("o1")).toEqual({ "c-1": "#B3562C" });
    expect(session.readingColourById("o2")).toEqual({ "c-2": "#B3562C", "c-3": "#B3562C" });
    expect(session.readingColourById("o1")["base-1"]).toBeUndefined(); // base notes never take a hue
  });
});

describe("style minting", () => {
  it("readingStyleOf colours a reading note by its layer and keeps the base green default", () => {
    const { session, load } = make();
    load(EXHIBIT);
    const style = session.readingStyleOf("o1");
    const readingStyle = style("c-1");
    expect(readingStyle).toBeDefined();
    // The marker's colour comes from the reading's own hue (the stroke is the identity channel).
    expect(JSON.stringify(readingStyle)).toContain("#B3562C");
    const baseStyle = style("base-1");
    expect(JSON.stringify(baseStyle)).toContain("#3A8C5D"); // the emerald base mark (--accent)
  });

  it("folds the hover solo into the minted style — the read that re-mints identity (Canvas re-applies)", () => {
    // The minted CLOSURE identity re-mints on every call (each `styleOf={readingStyleOf(o)}`
    // template read creates one — same as the original ExhibitView code, and why the template
    // expression depends on `hoverNote`). What is a contract is the STYLE OUTPUT: hovering a note
    // adds the highlighted channel to that note's mark.
    const { session, load } = make();
    load(EXHIBIT);
    const before = session.readingStyleOf("o1")("c-1");
    // Resting weight: fill 0.18 / stroke 0.95 / width 2 (readingMarkerStyle's authored numbers).
    expect(before).toMatchObject({ fillOpacity: 0.18, strokeOpacity: 0.95, strokeWidth: 2 });
    session.hoverNote = "c-1";
    const after = session.readingStyleOf("o1")("c-1");
    // The hovered mark is momentarily the brightest thing: fill 0.32 / stroke 1.0 / width 3.
    expect(after).toMatchObject({ fillOpacity: 0.32, strokeOpacity: 1, strokeWidth: 3 });
  });

  it("frameFor picks a selectorless (bare-IRI, ADR-0018) whole-object note as THE frame", () => {
    const data: ReadingSessionData = {
      readings: [],
      objects: [{ id: "o1" }],
      annotationsByObject: {
        o1: [ann("whole-object"), ann("region")],
      },
      readingAnnotationsByObject: {},
    };
    const { session, load } = make();
    load(data);
    // `ann` has a bare-string target (no selector) → isWholeObjectFor(null) is true by construction.
    const frame = session.frameFor("o1", 1000, 800);
    expect(frame?.markId).toBe("whole-object");
  });
});

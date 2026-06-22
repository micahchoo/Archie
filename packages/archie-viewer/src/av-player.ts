// AV PLAYER for the <archie-viewer> embed (ADR-0019 read-only) — the plain-DOM analogue of the full
// viewer's MediaPlayer.svelte (apps/viewer/src/components/MediaPlayer.svelte). The embed carries NO
// Svelte runtime, so this is a hand-rolled rewrite over the SAME render-core helpers:
//   • parseMediaFragment  — read a note's `t=start,end` (+optional xywh) selector value back
//   • activeNoteIndex     — which cue is "now playing" (highlight on timeupdate)
//   • transcriptTextOf    — a cue's / whole-track note's prose
//   • parseTimeFragment   — the landing `t=` offset (clamped here, mirroring apps/viewer av-landing.ts)
//   • createNoteCard / noteBodyHtml (./note-card) — the SANITIZED note body, reused verbatim
//
// LAZY-loaded: element.ts `await import("./av-player.js")` only when an AV object opens, so the
// gallery / image-reader bundles never pull this in (mirrors the ./reader.js lazy boundary).
//
// MEDIUM BRANCH: element.ts reads `object.mediaType` — "sound"|"video" route HERE; "image" (and
// unknown) stay on the OSD reader. This module mounts a NATIVE <audio>/<video controls> (NOT OSD, NOT
// wavesurfer) — no `new Function()`, so the strict-CSP keystone (ADR-0019, no unsafe-eval) holds.
//
// OFFLINE: a remote (http/https) AV source is BLOCKED by the offline gate (mirrors reader.ts
// isRemoteSource) BEFORE the <audio>/<video> src is set — an offline embed shows the same notice as a
// blocked image, never a silently-failing media element.
//
// SECURITY: note bodies reach innerHTML ONLY through `noteBodyHtml` (renderMarkdown → DOMPurify), the
// same sanitized pipeline the image note-card uses. Cue/whole-track LABELS use textContent, never HTML.

import {
  parseMediaFragment,
  activeNoteIndex,
  transcriptTextOf,
  parseTimeFragment,
  type AObject,
  type W3CAnnotation,
  type TimeRange,
} from "@render/core";
import { createNoteCard, noteBodyHtml, type NoteCard } from "./note-card.js";

/** A time-anchored note: its id (overlay/resolver selection key), its prose, and its `t=` window. */
export interface AvCue {
  id: string;
  text: string;
  range: TimeRange;
}

/** A whole-track note (no `t=`): about the WHOLE recording — the AV analogue of the image frame-border. */
export interface WholeTrackNote {
  id: string;
  text: string;
}

/** What the element hands the AV player to open one sound/video object. */
export interface AvPlayerOptions {
  object: AObject;
  /** Published head notes for this object — time-region cues + whole-track notes (read-overlay parity). */
  annotations: W3CAnnotation[];
  /** Deep-link `t=` offset (the resolved cite-ladder fragment): on loadedmetadata seek-to-offset PAUSED
   *  (section-142 — landing seeks but must NOT auto-play). Garbage / absent → head (0). */
  initialSeek?: string;
  /** When true, refuse a REMOTE (http/https) source — offline embeds show only embedded (blob:/data:)
   *  media, the same boundary the image reader enforces (reader.ts isRemoteSource). */
  offline?: boolean;
}

/** The element's handle to the mounted player: torn down on object change / back / disconnect. */
export interface AvPlayerSurface {
  destroy(): void;
}

/** Thrown when an offline embed is asked to open a remote-sourced AV object — element.ts catches this
 *  and renders the "this lives online; this embed is offline" notice (same shape as the image path). */
export class OfflineAvBlockedError extends Error {
  constructor() {
    super("This recording is hosted online and can't be played while the viewer is offline.");
    this.name = "OfflineAvBlockedError";
  }
}

/** A source is REMOTE if it fetches over the network; blob:/data: are in-document (allowed offline).
 *  AV objects carry a plain `source` string (no structured tileSource), so this is the string test. */
function isRemoteAvSource(object: AObject): boolean {
  const u = object.source;
  return !(u.startsWith("blob:") || u.startsWith("data:"));
}

/**
 * Time-region notes → cues, sorted by start (the transcript band order). PURE — happy-dom testable.
 * A note is a cue iff its target selector value parses to a `t=` time range (parseMediaFragment).
 */
export function cuesOf(annotations: readonly W3CAnnotation[]): AvCue[] {
  const out: AvCue[] = [];
  for (const a of annotations) {
    if (!a.id) continue;
    const v = (a.target as { selector?: { value?: string } } | undefined)?.selector?.value;
    const f = v ? parseMediaFragment(v) : {};
    if (f.time) out.push({ id: String(a.id), text: transcriptTextOf(a), range: f.time });
  }
  return out.sort((x, y) => x.range.start - y.range.start);
}

/**
 * Whole-track notes → bare-target / non-time notes (no `t=`): they apply to the WHOLE recording.
 * PURE. Mirrors MediaPlayer's `wholeTrackNotes` derivation. Empty-text notes are dropped.
 */
export function wholeTrackNotesOf(annotations: readonly W3CAnnotation[]): WholeTrackNote[] {
  const out: WholeTrackNote[] = [];
  for (const a of annotations) {
    if (!a.id) continue;
    const v = (a.target as { selector?: { value?: string } } | undefined)?.selector?.value;
    const f = v ? parseMediaFragment(v) : {};
    if (!f.time) {
      const text = transcriptTextOf(a);
      if (text) out.push({ id: String(a.id), text });
    }
  }
  return out;
}

/** Clamp a route `t=` offset to a safe paused-seek start in `[0, dur]`. Mirrors apps/viewer
 *  av-landing.ts clampSeekStart (which lives in the Svelte app, not a shared dep) over the SAME
 *  render-core parseTimeFragment — garbage / absent → 0; dur≤0 → floor at 0 only. Never NaN/negative. */
function clampSeekStart(t: string | null | undefined, dur: number): number {
  if (!t) return 0;
  const parsed = parseTimeFragment(t);
  if (!parsed) return 0;
  const start = parsed.start;
  if (!Number.isFinite(dur) || dur <= 0) return Math.max(0, start);
  return Math.max(0, Math.min(dur, start));
}

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const STYLE = `
  .av { display: flex; flex-direction: column; height: 100%; background: #1c1714; color: #f0e9e2; }
  .av-stage { flex: 1 1 auto; min-height: 0; display: grid; place-items: center; padding: 1.5rem; gap: 1rem; }
  .av-stage h1 { font-weight: 300; font-size: 1.6rem; margin: 0; text-align: center; }
  .av-stage .now { font-size: .72rem; letter-spacing: .2em; text-transform: uppercase; color: #b8a795; }
  .av audio { width: min(32rem, 100%); }
  .av video { display: block; max-width: 100%; max-height: 70%; border-radius: 8px; }
  .av-failed { max-width: 28rem; text-align: center; color: #e7ded7; line-height: 1.55; }
  .av-notes { flex: 0 0 auto; max-height: 42%; overflow: auto; background: #fffdfb; color: #2a2320; padding: 1rem 1.25rem; }
  .av-notes .eyebrow { margin: 0 0 .5rem; font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; color: #6b5d52; }
  .whole-track { margin: 0 0 1rem; padding: .25rem 0 .25rem .75rem; border-left: 3px solid #d2641e; }
  .whole-track p { margin: .25rem 0 0; font-size: .9rem; line-height: 1.5; color: #4a4038; }
  .cues { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; }
  .cues button { display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: .75rem; width: 100%; text-align: left; cursor: pointer; padding: .5rem .75rem; background: #f6efe9; color: #2a2320; border: none; border-left: 3px solid transparent; border-radius: 6px; font: inherit; }
  .cues button:hover { background: #efe4da; }
  .cues button.active { border-left-color: #d2641e; background: #f3e3d6; }
  .cues .t { font-variant-numeric: tabular-nums; font-size: .72rem; letter-spacing: .06em; color: #8a7a6c; }
  .cues .line { font-size: .95rem; line-height: 1.45; }
  .av-empty { font-size: .9rem; color: #6b5d52; }
`;

/**
 * Mount the read-only AV player into `host` (a positioned shadow-root child — the reader-surface). The
 * media element is native (controls); the cue band travels the playhead on click + drives the shared
 * note-card; the active cue lights on timeupdate. A `t=` landing seeks PAUSED on loadedmetadata.
 *
 * Returns the element's teardown handle. Throws OfflineAvBlockedError (BEFORE setting src) when the
 * embed is offline and the source is remote — the element renders the offline notice for that.
 */
export function mountAvPlayer(host: HTMLElement, opts: AvPlayerOptions): AvPlayerSurface {
  if (opts.offline && isRemoteAvSource(opts.object)) {
    throw new OfflineAvBlockedError();
  }

  const { object, annotations } = opts;
  const isVideo = object.mediaType === "video";
  const cues = cuesOf(annotations);
  const wholeNotes = wholeTrackNotesOf(annotations);
  const doc = host.ownerDocument;

  // ---- structure: media stage (dark) over the notes panel (paper) -------------------------------
  const root = doc.createElement("div");
  root.className = "av";
  const style = doc.createElement("style");
  style.textContent = STYLE;

  const stage = doc.createElement("div");
  stage.className = "av-stage";

  const media = doc.createElement(isVideo ? "video" : "audio") as HTMLMediaElement;
  media.setAttribute("controls", "");
  media.setAttribute("preload", "metadata");
  if (!isVideo) {
    const now = doc.createElement("span");
    now.className = "now";
    now.textContent = "Now playing";
    const h1 = doc.createElement("h1");
    h1.textContent = object.label;
    stage.append(now, h1);
  }
  stage.appendChild(media);

  const notes = doc.createElement("div");
  notes.className = "av-notes";

  root.append(style, stage, notes);
  host.appendChild(root);

  // The shared note-card (sanitized bodies) — the host is the positioned ancestor it anchors to.
  const card: NoteCard = createNoteCard(host);

  // ---- whole-track notes (no t=): the persistent band above the cues -----------------------------
  if (wholeNotes.length > 0) {
    const band = doc.createElement("div");
    band.className = "whole-track";
    const eyebrow = doc.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "About the whole recording";
    band.appendChild(eyebrow);
    for (const n of wholeNotes) {
      const p = doc.createElement("p");
      p.dataset["wholeNote"] = n.id;
      p.textContent = n.text;
      band.appendChild(p);
    }
    notes.appendChild(band);
  }

  // ---- the cue band: clickable time-region notes (seek + show body) ------------------------------
  const eyebrow = doc.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `Notes · ${cues.length} ${cues.length === 1 ? "moment" : "moments"}`;
  notes.appendChild(eyebrow);

  const cueButtons: HTMLButtonElement[] = [];
  if (cues.length === 0) {
    const empty = doc.createElement("p");
    empty.className = "av-empty";
    empty.textContent = "No timed notes for this recording.";
    notes.appendChild(empty);
  } else {
    const list = doc.createElement("ol");
    list.className = "cues";
    for (const c of cues) {
      const li = doc.createElement("li");
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.dataset["cue"] = c.id;
      const t = doc.createElement("span");
      t.className = "t";
      t.textContent = fmt(c.range.start);
      const line = doc.createElement("span");
      line.className = "line";
      line.textContent = c.text;
      btn.append(t, line);
      // Click a cue → travel the recording to its start (seek) AND show its body in the note-card.
      // Seek-only (no play()) keeps parity with the section-142 read posture; the visitor presses play.
      btn.addEventListener("click", () => {
        media.currentTime = c.range.start;
        card.show(noteBodyHtml(annotations, c.id));
      });
      li.appendChild(btn);
      list.appendChild(li);
      cueButtons.push(btn);
    }
    notes.appendChild(list);
  }

  // ---- active-cue highlight on timeupdate (the "now playing" line) --------------------------------
  const onTimeUpdate = (): void => {
    const idx = activeNoteIndex(cues.map((c) => c.range), media.currentTime || 0);
    for (let i = 0; i < cueButtons.length; i++) cueButtons[i]!.classList.toggle("active", i === idx);
  };
  media.addEventListener("timeupdate", onTimeUpdate);

  // ---- broken-media fallback (missing file / unsupported codec) -----------------------------------
  const onError = (): void => {
    media.remove();
    const failed = doc.createElement("p");
    failed.className = "av-failed";
    failed.textContent =
      "This recording couldn't be loaded. The file may be missing, or its format isn't supported by this browser.";
    stage.appendChild(failed);
  };
  media.addEventListener("error", onError);

  // ---- t= landing: clamped PAUSED seek on loadedmetadata (section-142 — seek, do NOT auto-play) ---
  let didLandSeek = false;
  const onMeta = (): void => {
    if (didLandSeek) return;
    didLandSeek = true;
    if (!opts.initialSeek) return; // ordinary landing — leave the playhead at the head (0), paused
    const at = clampSeekStart(opts.initialSeek, media.duration);
    if (at > 0) media.currentTime = at; // paused: no play() (the AV-landing rule)
  };
  media.addEventListener("loadedmetadata", onMeta);

  // Set the source LAST — after listeners are wired, so a fast-failing (cached) source still reports.
  media.src = object.source;

  return {
    destroy(): void {
      media.removeEventListener("timeupdate", onTimeUpdate);
      media.removeEventListener("error", onError);
      media.removeEventListener("loadedmetadata", onMeta);
      card.destroy();
      root.remove();
    },
  };
}

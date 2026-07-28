// The export surface's option set (Archie-c367) — ONE FLOW, the probe's recommendation pre-selected.
//
// This module is the whole decision layer of the publish surface, kept OUT of Publish.svelte so it can
// be driven headlessly: given an `ArchiveProbe` (Archie-7280) and the tier the author currently has
// selected, it returns the rows to draw, which one is pre-selected, and what each unavailable row says
// about itself.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, from the ticket's DECIDED block:
//
//   "An unavailable destination is GREYED WITH ITS REASON, never silently swapped."
//
// The defect that decided it: "To a local folder" silently downloaded a .zip when the browser could not
// pick a folder, so on Firefox and Safari two buttons produced the identical file and the author was
// never told why. So `rowsFor` returns EVERY destination, always, in a stable order — an unavailable one
// comes back with `available: false` and the verdict's own reason string, and there is no code path
// anywhere in this module that substitutes one destination for another. `chooseInitial` will not
// pre-select an unavailable row, and `isPublishable` refuses rather than falling back.
//
// PURE — no DOM, no fs, no probe. The caller (Publish.svelte) owns the probing; `archive-inventory.ts`
// owns turning a library into the probe's input.

import {
  humanBytes,
  OBJECT_STORAGE_PRICING,
  type ArchiveProbe,
  type DestinationId,
  type DestinationVerdict,
  type QualityTier,
} from "./archive-probe.js";

// ---------------------------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------------------------

/** The destination names, in the reader's words. Deliberately concrete nouns rather than verbs: the
 *  row answers "where does it go", and the single Publish button below carries the action. */
export const DESTINATION_LABEL: Readonly<Record<DestinationId, string>> = {
  "github-pages": "GitHub Pages",
  "object-storage": "Object storage",
  folder: "A folder on this computer",
  zip: "One .zip file",
};

/** What each destination IS, one line, stated as a fact rather than a pitch. Shown under the label on
 *  every row — available or not — because a greyed row still has to explain what the author is missing. */
export const DESTINATION_BLURB: Readonly<Record<DestinationId, string>> = {
  "github-pages": "A free website at your own address. Archie puts it there for you.",
  "object-storage": `Rented storage with no size limit. Archie writes the files and hands you the command to upload them — ${OBJECT_STORAGE_PRICING.label} charges nothing to serve them.`,
  folder: "The finished website, written to a folder you pick. Upload it wherever you like.",
  zip: "One file holding the whole library, plus your original files. Keep it, or send it to someone.",
};

/** The quality tiers, as a fact about the bytes rather than a quality judgement. Archie-4b0a decided the
 *  tier is chosen at publish time; this is the copy for the control. */
export const TIER_LABEL: Readonly<Record<QualityTier, string>> = {
  archival: "Archival",
  web: "Web",
};
export const TIER_BLURB: Readonly<Record<QualityTier, string>> = {
  archival: "Every image at the size you scanned it, every recording as you recorded it.",
  web: "Images resized to 2,400 px across and audio compressed. Notes stay on the right spot. Your original files stay on your disk either way.",
};

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

/** One destination as the surface draws it: a radio, a name, a blurb, the numbers, and — when the
 *  destination cannot be reached — the reason, in the author's own numbers. */
export interface DestinationRow {
  id: DestinationId;
  label: string;
  blurb: string;
  /** False ⇒ greyed. The row is STILL RETURNED and still drawn; see this file's header. */
  available: boolean;
  /** The verdict's own sentence. When `available` is false this is the refusal; when true it is the
   *  fact to state beside the option. Never empty. */
  reason: string;
  /** "900 MB · 2,780 files", plus an upload estimate where the destination has a known write rate. */
  facts: string;
  /** Present for object storage only — what the author will pay, monthly. */
  monthlyCostUsd?: number;
  /** True when this destination also carries `assets-original/` (the .zip, by decision 3 on Archie-34a2). */
  carriesOriginals: boolean;
  /** True on the one row the probe recommends at THIS tier. */
  recommended: boolean;
}

/** Stable draw order — the probe's own preference order, so the recommended row is normally first and
 *  the list reads best-first. Fixed rather than sorted by fit: a list that re-orders itself when the
 *  tier changes makes the author re-find the row they were looking at. */
export const ROW_ORDER: readonly DestinationId[] = ["github-pages", "object-storage", "folder", "zip"];

const plural = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? "" : "s"}`;

/** "900 MB · 2,780 files · about 35 minutes to upload" — the numbers the ticket's mock puts beside each
 *  option. Upload time appears only where the probe computed one (GitHub Pages), and only when it is
 *  long enough to be worth saying; a 20-second upload does not need a warning. */
export function factsFor(v: DestinationVerdict): string {
  const parts = [humanBytes(v.estimatedBytes), plural(v.estimatedFiles, "file")];
  if (typeof v.estimatedUploadMinutes === "number" && v.estimatedUploadMinutes >= 2) {
    parts.push(`about ${Math.round(v.estimatedUploadMinutes)} minutes to upload`);
  }
  return parts.join(" · ");
}

/**
 * Every destination row for the given tier, in `ROW_ORDER`.
 *
 * The probe emits one verdict per (destination × tier); this picks the column the quality control is on.
 * A tier switch therefore re-states every number on every row — which is the ticket's "differences
 * between destinations are stated as FACTS, not offered as choices", applied to the tier as well.
 */
export function rowsFor(probe: ArchiveProbe, tier: QualityTier): DestinationRow[] {
  const recommended = probe.recommendation;
  return ROW_ORDER.map((id) => {
    const v = probe.destinations.find((d) => d.destination === id && d.tier === tier);
    if (!v) {
      // Unreachable against `probeArchive`, which emits all four × both tiers. Stated rather than
      // silently dropping the row: a missing row is exactly the disappearance this ticket forbids.
      return {
        id,
        label: DESTINATION_LABEL[id],
        blurb: DESTINATION_BLURB[id],
        available: false,
        reason: "Archie could not work out whether this one fits.",
        facts: "",
        carriesOriginals: false,
        recommended: false,
      };
    }
    return {
      id,
      label: DESTINATION_LABEL[id],
      blurb: DESTINATION_BLURB[id],
      available: v.fits,
      reason: v.reason,
      facts: factsFor(v),
      ...(typeof v.estimatedMonthlyCostUsd === "number" ? { monthlyCostUsd: v.estimatedMonthlyCostUsd } : {}),
      carriesOriginals: v.carriesOriginals,
      recommended: recommended?.destination === id && recommended.tier === tier,
    };
  });
}

/**
 * The (destination, tier) pair the surface opens on — the probe's recommendation, confirmed rather than
 * re-posed.
 *
 * Falls back to the first AVAILABLE destination at the default tier when the probe declines to
 * recommend (it returns null only when nothing fits at all, in which case this returns null too and the
 * surface shows `probe.blockers` instead of a menu). It never falls back to an UNAVAILABLE row — that is
 * the swap this ticket exists to kill, and pre-selecting a greyed row is the same error wearing a
 * different hat.
 */
export function chooseInitial(probe: ArchiveProbe): { destination: DestinationId; tier: QualityTier } | null {
  if (probe.recommendation) {
    return { destination: probe.recommendation.destination, tier: probe.recommendation.tier };
  }
  for (const tier of ["archival", "web"] as const) {
    const first = ROW_ORDER.map((id) => probe.destinations.find((d) => d.destination === id && d.tier === tier)).find((v) => v?.fits);
    if (first) return { destination: first.destination, tier: first.tier };
  }
  return null;
}

/** Can the author press Publish on this pair? A refusal, never a redirect — the greyed row's own reason
 *  is already on screen saying why. */
export function isPublishable(probe: ArchiveProbe, destination: DestinationId, tier: QualityTier): boolean {
  return probe.destinations.some((d) => d.destination === destination && d.tier === tier && d.fits);
}

// ---------------------------------------------------------------------------------------------
// Object storage: the hand-off command
// ---------------------------------------------------------------------------------------------

/** Where Archie writes the tree before rclone sends it. A placeholder in the copy — the real path comes
 *  from the folder the author picks. */
export const RCLONE_LOCAL_PLACEHOLDER = "./my-library";
/** The remote:bucket the author types. `r2:` is the rclone remote name they configured; the default
 *  names Cloudflare R2 because that is the pricing the surface quotes (Archie-c85f pinned it). */
export const RCLONE_REMOTE_PLACEHOLDER = "r2:my-archive";

/**
 * The TWO-PASS upload command (Archie-c85f), and it is two passes for a measured reason.
 *
 * A plain `rclone sync` runs several transfers concurrently with no ordering guarantee, and in the
 * prototype run it uploaded `archie.json` FIRST. `archie.json` is the tree's commit marker
 * (`.claude/rules/render-core-data-integrity.md` contract 1: content first, marker LAST), so a reader
 * fetching mid-sync would see a valid-looking marker over a half-uploaded tree — it fails OPEN, which is
 * worse than the local torn-write case that discipline was written for. Excluding the marker from the
 * sync and copying it alone afterwards restores marker-last across a tool that has never heard of it.
 *
 * `local` is the folder Archie wrote; `remote` is the author's own `remote:bucket`.
 */
export function rcloneCommands(local: string, remote: string): [string, string] {
  const l = local.trim() || RCLONE_LOCAL_PLACEHOLDER;
  const r = remote.trim() || RCLONE_REMOTE_PLACEHOLDER;
  return [`rclone sync ${l} ${r} --exclude archie.json`, `rclone copyto ${l}/archie.json ${r}/archie.json`];
}

/** The bucket setting a reader's browser needs, stated as a fact beside the command rather than as
 *  something Archie configures — Archie never holds the author's credentials (Archie-c85f). */
export const BUCKET_CORS_NOTE =
  "One setting on the bucket: allow GET and HEAD from any origin. Without it a browser refuses to read the library's own files, and the site opens empty.";

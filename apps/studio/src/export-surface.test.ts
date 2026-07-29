import { describe, it, expect } from "vitest";
import { probeArchive, type ProbedFile } from "./archive-probe.js";
import {
  ROW_ORDER, SITE_DESTINATIONS, chooseInitial, factsFor, isPublishable, qualityMatters, rcloneCommands, rowsFor,
} from "./export-surface.js";

// The export surface's decision layer (Archie-c367). The claim under test is the ticket's own rule:
//
//   "An unavailable destination is GREYED WITH ITS REASON, never silently swapped."
//
// Every test below is aimed at one of the two halves of that — the row survives, and the reason
// survives with it — plus the pre-selection the ticket's mock specifies.

/** A library of `n` images at `long`×0.75, sampled (dimensions known), each `bytes` on disk. */
function images(n: number, long: number, bytes: number): ProbedFile[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `plate-${i}.jpg`,
    relativePath: `folios/plate-${i}.jpg`,
    type: "image/jpeg",
    bytes,
    width: long,
    height: Math.round(long * 0.75),
  }));
}

const SMALL = images(20, 2000, 900_000); // comfortably free everywhere
const HUGE = images(4000, 8000, 90_000_000); // past GitHub's ceilings at both tiers

describe("rowsFor — every destination is drawn, always", () => {
  it("returns all four destinations in a fixed order, whatever fits", () => {
    for (const files of [SMALL, HUGE]) {
      for (const tier of ["archival", "web"] as const) {
        const rows = rowsFor(probeArchive(files, { capabilities: { folderSink: true } }), tier);
        expect(rows.map((r) => r.id)).toEqual([...ROW_ORDER]);
      }
    }
  });

  it("a browser with no folder sink still shows the folder row — greyed, with the reason", () => {
    // Firefox / Safari. Before this ticket, "to a local folder" quietly became a .zip download here.
    const probe = probeArchive(SMALL, { capabilities: { folderSink: false } });
    const rows = rowsFor(probe, "archival");

    const folder = rows.find((r) => r.id === "folder")!;
    expect(folder.available).toBe(false);
    expect(folder.reason).toMatch(/desktop app or Chrome/i);
    // The row is still IN the list, at its usual place — not dropped, not moved to the bottom.
    expect(rows.indexOf(folder)).toBe(ROW_ORDER.indexOf("folder"));

    // Object storage goes with it: Archie's route there is "write a folder, then rclone it", so no
    // folder sink is no object-storage route either (Archie-c85f).
    const object = rows.find((r) => r.id === "object-storage")!;
    expect(object.available).toBe(false);
    expect(object.reason).toMatch(/desktop app or Chrome/i);
  });

  it("a refusal always carries a reason — no blank greyed rows", () => {
    for (const folderSink of [true, false]) {
      for (const files of [SMALL, HUGE]) {
        for (const tier of ["archival", "web"] as const) {
          for (const row of rowsFor(probeArchive(files, { capabilities: { folderSink } }), tier)) {
            expect(row.reason.trim(), `${row.id} @ ${tier} folderSink=${folderSink}`).not.toBe("");
          }
        }
      }
    }
  });

  it("switching tier re-states the numbers rather than re-ordering the list", () => {
    const probe = probeArchive(images(600, 6000, 40_000_000), { capabilities: { folderSink: true } });
    const archival = rowsFor(probe, "archival");
    const web = rowsFor(probe, "web");
    expect(web.map((r) => r.id)).toEqual(archival.map((r) => r.id));
    // The web tier re-encodes at 2400px, so the same destination reports fewer bytes.
    const byId = (rs: ReturnType<typeof rowsFor>, id: string) => rs.find((r) => r.id === id)!;
    expect(byId(web, "github-pages").facts).not.toBe(byId(archival, "github-pages").facts);
    expect(probe.tiers.web.publishedBytes).toBeLessThan(probe.tiers.archival.publishedBytes);
  });

  it("exactly one row is marked recommended, and only at the recommended tier", () => {
    const probe = probeArchive(SMALL, { capabilities: { folderSink: true } });
    const rec = probe.recommendation!;
    const other = rec.tier === "archival" ? "web" : "archival";
    expect(rowsFor(probe, rec.tier).filter((r) => r.recommended).map((r) => r.id)).toEqual([rec.destination]);
    expect(rowsFor(probe, other).filter((r) => r.recommended)).toHaveLength(0);
  });
});

describe("chooseInitial — the surface confirms a decision", () => {
  it("pre-selects the probe's recommendation", () => {
    const probe = probeArchive(SMALL, { capabilities: { folderSink: true } });
    expect(chooseInitial(probe)).toEqual({ destination: probe.recommendation!.destination, tier: probe.recommendation!.tier });
  });

  it("never pre-selects an unavailable destination", () => {
    // Pre-selecting a greyed row is the silent swap wearing a different hat: the author presses
    // Publish on a row whose own text says it does not fit.
    for (const folderSink of [true, false]) {
      for (const files of [SMALL, HUGE, images(3000, 6000, 60_000_000)]) {
        const probe = probeArchive(files, { capabilities: { folderSink } });
        const initial = chooseInitial(probe);
        if (initial === null) {
          expect(probe.destinations.every((d) => !d.fits)).toBe(true);
          continue;
        }
        expect(isPublishable(probe, initial.destination, initial.tier)).toBe(true);
      }
    }
  });

  it("returns null exactly when nothing fits, so the surface can show the dead end instead of a menu", () => {
    // A library too big for every route AND a browser with no folder sink: GitHub refuses on size,
    // zip refuses on size, and the two folder-backed routes refuse on capability.
    const probe = probeArchive(HUGE, { capabilities: { folderSink: false } });
    expect(probe.destinations.some((d) => d.fits)).toBe(false);
    expect(chooseInitial(probe)).toBeNull();
    expect(probe.blockers.length).toBeGreaterThan(0);
  });
});

describe("isPublishable — a refusal, never a redirect", () => {
  it("is false for every unavailable pair and true for every available one", () => {
    const probe = probeArchive(SMALL, { capabilities: { folderSink: false } });
    for (const v of probe.destinations) {
      expect(isPublishable(probe, v.destination, v.tier), `${v.destination}@${v.tier}`).toBe(v.fits);
    }
    // And specifically: the folder being unpublishable does NOT make the zip publishable in its place.
    // The two answers are independent; nothing in this module maps one destination onto another.
    expect(isPublishable(probe, "folder", "archival")).toBe(false);
    const zipVerdict = probe.destinations.find((d) => d.destination === "zip" && d.tier === "archival")!;
    expect(isPublishable(probe, "zip", "archival")).toBe(zipVerdict.fits);
  });
});

describe("factsFor", () => {
  it("states bytes and file count, and an upload time only where one is worth saying", () => {
    const probe = probeArchive(SMALL, { capabilities: { folderSink: true } });
    const gh = probe.destinations.find((d) => d.destination === "github-pages" && d.tier === "archival")!;
    expect(factsFor(gh)).toMatch(/\d.*·.*file/);
    // 20 files is seconds of upload — no "about 0 minutes".
    expect(factsFor(gh)).not.toMatch(/minutes/);

    const big = probeArchive(images(1500, 3000, 5_000_000), { capabilities: { folderSink: true } });
    const ghBig = big.destinations.find((d) => d.destination === "github-pages" && d.tier === "web")!;
    expect(factsFor(ghBig)).toMatch(/about \d+ minutes to upload/);
  });
});

describe("rcloneCommands — the marker lands last (Archie-c85f)", () => {
  it("is two passes: everything but the marker, then the marker alone", () => {
    const [sync, marker] = rcloneCommands("./out", "r2:my-archive");
    expect(sync).toBe("rclone sync ./out r2:my-archive --exclude archie.json");
    expect(marker).toBe("rclone copyto ./out/archie.json r2:my-archive/archie.json");
    // The whole point: the first pass must NOT carry archie.json, and the second must carry only it.
    expect(sync).toContain("--exclude archie.json");
    expect(marker.startsWith("rclone copyto")).toBe(true);
  });

  it("falls back to placeholders rather than emitting a command with a hole in it", () => {
    const [sync, marker] = rcloneCommands("  ", "");
    expect(sync).toBe("rclone sync ./my-library r2:my-archive --exclude archie.json");
    expect(marker).toBe("rclone copyto ./my-library/archie.json r2:my-archive/archie.json");
  });
});

// ---------------------------------------------------------------------------------------------
// The setup flow's two questions (Q-15)
// ---------------------------------------------------------------------------------------------

describe("SITE_DESTINATIONS — where a library can LIVE", () => {
  it("is the destination list minus the zip, which is an artifact and not a home", () => {
    // A `.archie.zip` is opened BY a viewer; it is not a place that stays updated. It keeps its row
    // in `rowsFor` (the wall and any caller that wants all four still get all four) but the setup
    // flow must not offer it as a home, or "where does this live?" has a file in the answer set.
    expect(SITE_DESTINATIONS).toEqual(["github-pages", "object-storage", "folder"]);
    expect(SITE_DESTINATIONS).not.toContain("zip");
    // And it stays a SUBSET of the draw order, so the setup flow inherits best-first ordering rather
    // than inventing a second one.
    expect(ROW_ORDER.filter((id) => SITE_DESTINATIONS.includes(id))).toEqual([...SITE_DESTINATIONS]);
  });
});

describe("qualityMatters — the setup flow asks about quality only where it changes something", () => {
  const SMALL_LIB = probeArchive(SMALL);
  const MID = probeArchive(images(600, 4000, 9_000_000)); // past GitHub at archival, fits at web
  const BIG = probeArchive(HUGE);

  it("is FALSE when both tiers fit and neither costs anything — the question would be noise", () => {
    // A small library on GitHub Pages fits either way and is free either way. Asking the author to
    // choose is asking them to pick between two identical outcomes.
    expect(qualityMatters(SMALL_LIB, "github-pages")).toBe(false);
  });

  it("is TRUE when the tier decides whether the destination FITS AT ALL", () => {
    // The case the control exists for: archival is refused, web is accepted. Skipping the question
    // here would leave the author on a destination that cannot take their library.
    expect(qualityMatters(MID, "github-pages")).toBe(true);
  });

  it("is TRUE when the tier changes what the destination COSTS", () => {
    // Object storage fits at both tiers whatever the size, so fit alone would say "don't ask" — but
    // the bill differs, and a monthly charge the author never chose is worse than one more screen.
    expect(qualityMatters(BIG, "object-storage")).toBe(true);
    expect(qualityMatters(SMALL_LIB, "object-storage")).toBe(false); // both $0 — nothing to decide
  });

  it("is FALSE for a folder on your own disk at any size — no cap, no bill", () => {
    expect(qualityMatters(BIG, "folder")).toBe(false);
    expect(qualityMatters(SMALL_LIB, "folder")).toBe(false);
  });

  it("is TRUE when a destination has no verdict at all, so the author is never silently defaulted", () => {
    // Missing verdicts are unreachable against `probeArchive`; if one ever appears, ASK. Defaulting a
    // tier on evidence we do not have is the same error as pre-selecting a greyed row.
    const stripped = { ...BIG, destinations: BIG.destinations.filter((d) => d.destination !== "folder") };
    expect(qualityMatters(stripped, "folder")).toBe(true);
  });
});

describe("rowsFor re-states every number when the tier changes", () => {
  // Moved here from `e2e/export-surface.spec.ts` when the tier stopped being a permanent control on
  // the surface (Q-15: it is asked only where it changes something, and the e2e fixture is small
  // enough that it never does). The claim is unchanged and is worth keeping: the web tier re-encodes
  // every image at 2,400 px, so the same destination reports different bytes at each tier. A tier
  // that moves nothing here is a tier the projection never heard — publish-flows keys its site cache
  // on it (`cachedSiteTier`).
  const probe = probeArchive(images(600, 4000, 9_000_000));

  it("gives a destination different facts at archival and at web", () => {
    const factsAt = (tier: "archival" | "web") =>
      Object.fromEntries(rowsFor(probe, tier).map((r) => [r.id, r.facts]));
    const archival = factsAt("archival");
    const web = factsAt("web");
    expect(archival["github-pages"]).not.toBe("");
    expect(web["github-pages"]).not.toBe(archival["github-pages"]);
    expect(web["object-storage"]).not.toBe(archival["object-storage"]);
  });

  it("and it is a two-way door — asking for archival again returns the archival numbers", () => {
    const first = rowsFor(probe, "archival").map((r) => r.facts);
    rowsFor(probe, "web");
    expect(rowsFor(probe, "archival").map((r) => r.facts)).toEqual(first);
  });
});

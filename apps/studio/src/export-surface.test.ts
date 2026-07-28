import { describe, it, expect } from "vitest";
import { probeArchive, type ProbedFile } from "./archive-probe.js";
import {
  ROW_ORDER, chooseInitial, factsFor, isPublishable, rcloneCommands, rowsFor,
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

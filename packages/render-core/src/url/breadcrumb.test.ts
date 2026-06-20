import { describe, it, expect } from "vitest";
import { breadcrumbFor } from "./breadcrumb.js";

// CONTEXT §125: Project›Exhibit›Section›Object, Project = the Gallery (#/), always clickable.

describe("breadcrumbFor", () => {
  it("gallery route → just the Gallery crumb", () => {
    expect(breadcrumbFor({ view: "gallery" }, { libraryLabel: "My Library" })).toEqual([
      { label: "My Library", hash: "#/", level: "library" },
    ]);
  });

  it("exhibit route → Gallery › Exhibit, with navigable hashes", () => {
    expect(breadcrumbFor({ view: "exhibit", slug: "voynich" }, { exhibitTitle: "Voynich" })).toEqual([
      { label: "Gallery", hash: "#/", level: "library" },
      { label: "Voynich", hash: "#/voynich", level: "exhibit" },
    ]);
  });

  it("falls back to the slug when no exhibit title is resolved", () => {
    expect(breadcrumbFor({ view: "exhibit", slug: "voynich" })[1]).toEqual({ label: "voynich", hash: "#/voynich", level: "exhibit" });
  });

  it("tags each level so the shell can special-case the exhibit crumb (overview vs item)", () => {
    const trail = breadcrumbFor({ view: "exhibit", slug: "voynich", noteId: "n7" }, { sectionLabel: "Folio 3" });
    expect(trail.map((c) => c.level)).toEqual(["library", "exhibit", "section"]);
  });

  it("adds the section/note crumb only when a label is provided", () => {
    const withLabel = breadcrumbFor({ view: "exhibit", slug: "voynich", noteId: "n7" }, { sectionLabel: "Folio 3" });
    expect(withLabel).toHaveLength(3);
    expect(withLabel[2]).toEqual({ label: "Folio 3", hash: "#/voynich/a/n7", level: "section" });

    const noLabel = breadcrumbFor({ view: "exhibit", slug: "voynich", noteId: "n7" });
    expect(noLabel).toHaveLength(2); // no section label → no third crumb
  });
});

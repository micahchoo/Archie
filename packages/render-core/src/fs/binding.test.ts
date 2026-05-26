import { describe, it, expect } from "vitest";
import {
  bindingLabel,
  recentFromBinding,
  addRecent,
  touchRecent,
  removeRecent,
  serializeRecents,
  parseRecents,
  RECENTS_CAP,
  type Binding,
  type RecentProject,
} from "./binding.js";

const r = (id: string, lastOpened: number, kind: "folder" | "file" = "folder"): RecentProject =>
  ({ id, name: id, kind, lastOpened, reopenable: kind === "folder" });

describe("bindingLabel — capability stays hidden; only the place shows (CONTEXT principle #5)", () => {
  it("an unbound library reads as this-browser-only", () => {
    expect(bindingLabel({ kind: "unbound" })).toBe("This browser only");
    expect(bindingLabel({ kind: "folder" })).toBe("This browser only"); // no name yet
  });
  it("a bound library shows its place, not its mechanism", () => {
    expect(bindingLabel({ kind: "folder", name: "MyLibrary" })).toBe("MyLibrary");
    expect(bindingLabel({ kind: "file", name: "show.archie.zip" })).toBe("show.archie.zip");
  });
});

describe("recentFromBinding — only bound libraries become recents; reopenable iff a handle is stored", () => {
  it("returns null for unbound", () => {
    expect(recentFromBinding({ kind: "unbound" }, 100)).toBeNull();
    expect(recentFromBinding({ kind: "folder" }, 100)).toBeNull(); // bound-kind but no name
  });
  it("a folder with an FSA handleKey is reopenable", () => {
    const got = recentFromBinding({ kind: "folder", name: "Lib", handleKey: "h1" }, 100);
    expect(got).toEqual({ id: "h1", name: "Lib", kind: "folder", lastOpened: 100, reopenable: true });
  });
  it("a file without a handle (non-FSA) is a re-pick hint, id synthesized from kind+name", () => {
    const got = recentFromBinding({ kind: "file", name: "show.archie.zip" }, 100);
    expect(got).toEqual({ id: "file:show.archie.zip", name: "show.archie.zip", kind: "file", lastOpened: 100, reopenable: false });
  });
});

describe("addRecent — front-insert, dedupe by id, cap", () => {
  it("puts the newest first and dedupes the same id", () => {
    let list: RecentProject[] = [];
    list = addRecent(list, r("a", 1));
    list = addRecent(list, r("b", 2));
    list = addRecent(list, r("a", 3)); // re-add a → moves to front, no dup
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
    expect(list[0].lastOpened).toBe(3);
  });
  it("caps the list, dropping the oldest", () => {
    let list: RecentProject[] = [];
    for (let i = 0; i < RECENTS_CAP + 3; i++) list = addRecent(list, r(`p${i}`, i));
    expect(list).toHaveLength(RECENTS_CAP);
    expect(list[0].id).toBe(`p${RECENTS_CAP + 2}`); // newest
  });
});

describe("touchRecent / removeRecent", () => {
  it("touch updates lastOpened and moves to front; absent id is a no-op", () => {
    const list = [r("a", 1), r("b", 2)];
    const touched = touchRecent(list, "a", 9);
    expect(touched.map((x) => x.id)).toEqual(["a", "b"]);
    expect(touched[0].lastOpened).toBe(9);
    expect(touchRecent(list, "zzz", 9)).toBe(list); // unchanged reference
  });
  it("remove drops the entry", () => {
    expect(removeRecent([r("a", 1), r("b", 2)], "a").map((x) => x.id)).toEqual(["b"]);
  });
});

describe("parseRecents — tolerant of junk (the store is user-visible; never throw)", () => {
  it("round-trips a valid list, sorted most-recent-first", () => {
    const list = [r("a", 1), r("b", 5), r("c", 3)];
    expect(parseRecents(serializeRecents(list)).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("returns [] for absent / non-JSON / non-array input", () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents("")).toEqual([]);
    expect(parseRecents("{not json")).toEqual([]);
    expect(parseRecents('{"x":1}')).toEqual([]);
  });
  it("drops malformed entries but keeps well-shaped ones", () => {
    const raw = JSON.stringify([
      { id: "ok", name: "Ok", kind: "folder", lastOpened: 2, reopenable: true },
      { id: "bad-kind", name: "X", kind: "drive", lastOpened: 1 },
      { name: "no-id", kind: "file", lastOpened: 1 },
      { id: "no-time", name: "Y", kind: "file" },
    ]);
    expect(parseRecents(raw).map((x) => x.id)).toEqual(["ok"]);
  });
  it("coerces a missing reopenable to false", () => {
    const raw = JSON.stringify([{ id: "f", name: "F", kind: "file", lastOpened: 1 }]);
    expect(parseRecents(raw)[0].reopenable).toBe(false);
  });
});

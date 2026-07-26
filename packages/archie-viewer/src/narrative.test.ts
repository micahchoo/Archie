// V88 — the narrative spine's pane. Same epistemic caveat as reader-chrome.test.ts: this proves the
// DOM the module builds, never that the module is reached. The "only for exhibits that HAVE sections"
// half of the contract is a dynamic-import decision in element.ts and is asserted by recipes/smoke.mjs
// (and by build.mjs's eagerGzKB, which would see it if the import went static).
import { describe, it, expect } from "vitest";
import type { PortableExhibit, Section } from "@render/core";
import { mountNarrative, sectionsOf } from "./narrative.js";

const section = (i: number, over: Partial<Section> = {}): Section => ({
  id: `s${i}`,
  title: `Section ${i}`,
  objectId: "o1",
  prose: `Prose for section ${i}.`,
  ...over,
});

const exhibit = (sections: Section[]): PortableExhibit =>
  ({ slug: "e1", title: "Reading the Unreadable", objects: [], sections } as unknown as PortableExhibit);

function mount(sections: Section[], index = 0) {
  const aside = document.createElement("div");
  document.body.append(aside);
  const calls = { activate: [] as number[], index: 0 };
  const nr = mountNarrative(aside, {
    exhibit: exhibit(sections),
    index,
    onactivate: (i) => calls.activate.push(i),
    onindex: () => { calls.index += 1; },
  });
  return { aside, nr, calls };
}

describe("the spine renders", () => {
  it("one row per section, each carrying its title AND its prose", () => {
    const { aside } = mount([section(1), section(2), section(3)]);
    const rows = [...aside.querySelectorAll(".nr-sections button")];
    expect(rows.map((r) => r.querySelector(".nr-num")!.textContent)).toEqual(["Section 1", "Section 2", "Section 3"]);
    // The regression this names: `voynich-reading` rendered 12 thumbnails and ZERO prose.
    expect(rows.map((r) => r.querySelector(".nr-prose")!.textContent!.trim()))
      .toEqual(["Prose for section 1.", "Prose for section 2.", "Prose for section 3."]);
  });

  it("names the exhibit and counts the spine", () => {
    const { aside } = mount([section(1), section(2)]);
    expect(aside.querySelector(".nr-title")!.textContent).toBe("Reading the Unreadable");
    expect(aside.querySelector(".nr-eyebrow")!.textContent).toBe("Narrative · 2 sections · Section 1 of 2");
  });

  it("a one-section spine says 'section', not 'sections', and offers no stepper", () => {
    const { aside } = mount([section(1)]);
    expect(aside.querySelector(".nr-eyebrow")!.textContent).toBe("Narrative · 1 section");
    expect(aside.querySelector(".nr-stepper")).toBeNull();
  });
});

describe("the spine navigates", () => {
  it("marks the active section and reports a row click", () => {
    const { aside, calls } = mount([section(1), section(2), section(3)], 1);
    const rows = [...aside.querySelectorAll(".nr-sections button")];
    expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([null, "true", null]);
    (rows[2] as HTMLButtonElement).click();
    expect(calls.activate).toEqual([2]);
  });

  it("the stepper steps, and its ends are disabled rather than absent", () => {
    const { aside, calls } = mount([section(1), section(2)], 0);
    const prev = aside.querySelector<HTMLButtonElement>('[data-act="prev-section"]')!;
    const next = aside.querySelector<HTMLButtonElement>('[data-act="next-section"]')!;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    next.click();
    expect(calls.activate).toEqual([1]);
    expect(aside.querySelector(".nr-pos")!.textContent).toBe("Section 1 of 2");
  });

  it("offers the way out to the object grid", () => {
    const { aside, calls } = mount([section(1)]);
    aside.querySelector<HTMLButtonElement>('[data-act="index"]')!.click();
    expect(calls.index).toBe(1);
  });

  it("an out-of-range index clamps rather than rendering nothing active", () => {
    const { aside } = mount([section(1), section(2)], 99);
    expect(aside.querySelectorAll('[aria-current="true"]').length).toBe(1);
    expect(aside.querySelector(".nr-pos")!.textContent).toBe("Section 2 of 2");
  });
});

describe("prose goes through the sanitized pipeline", () => {
  it("markdown renders as markup", () => {
    const { aside } = mount([section(1, { prose: "A **bold** claim." })]);
    expect(aside.querySelector(".nr-prose strong")!.textContent).toBe("bold");
  });

  it("a hostile body is sanitized, not injected (renderMarkdown = snarkdown → DOMPurify)", () => {
    const { aside } = mount([section(1, { prose: '<img src=x onerror="alert(1)">safe' })]);
    const img = aside.querySelector(".nr-prose img");
    expect(img?.getAttribute("onerror") ?? null).toBeNull();
    expect(aside.querySelector(".nr-prose")!.textContent).toContain("safe");
  });

  it("a section with no prose renders an empty pane, not 'undefined'", () => {
    // Built by OMISSION, not `prose: undefined` — `exactOptionalPropertyTypes` (the studio/embed .ts
    // gate, .claude/rules/studio-ts-typecheck-gate.md) treats those as different types, and the real
    // absent-prose section is the omitted one.
    const bare: Section = { id: "s1", title: "Section 1", objectId: "o1" };
    const { aside } = mount([bare]);
    expect(aside.querySelector(".nr-prose")!.textContent!.trim()).toBe("");
  });
});

describe("sectionsOf / teardown", () => {
  it("reads the published spine, tolerating an exhibit with none", () => {
    expect(sectionsOf(exhibit([section(1)])).length).toBe(1);
    expect(sectionsOf({} as PortableExhibit)).toEqual([]);
  });

  it("destroy removes the pane and its stylesheet", () => {
    const { aside, nr } = mount([section(1)]);
    const root = aside.getRootNode() as Document;
    const before = root.querySelectorAll("style[data-archie-narrative]").length;
    nr.destroy();
    expect(aside.querySelector(".nr-aside")).toBeNull();
    expect(root.querySelectorAll("style[data-archie-narrative]").length).toBe(before - 1);
  });
});

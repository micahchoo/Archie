import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The committed published tree must AGREE WITH ITS OWN MANIFESTS (2026-07-25).
//
// WHY THIS IS A VITEST TEST AND NOT AN E2E SPEC — it was written as one, and was worthless there.
// `apps/viewer`'s `prebuild` runs `gen`, and the e2e harness's webServer runs `pnpm build`, so the
// tree is REGENERATED before any spec executes. Measured: restoring the known-stale `index.html`
// from git and running the guard under Playwright passed all five assertions, because the harness
// had already overwritten it. A guard over CHECKED-IN output must run in a context that does not
// rebuild that output first — which is exactly the trap this file exists to prevent, sprung on the
// guard itself. `vitest run` has no `pretest` hook; it reads what is committed.
//
// The class: `apps/viewer/public/published/` is generated output that is CHECKED IN, and nothing
// compared it to its generator. From the moment a zip was committed to `apps/viewer/libraries/`,
// `pnpm gen` stopped owning the six bundled seed exhibits and merely CARRIED them — so they froze,
// across three separate model changes, while every unit test stayed green:
//
//   - `exhibitPageHtml` learned to emit narrative sections → `voynich-reading` shipped a manifest
//     with 6 Ranges and an archival page with ZERO. The one seed exhibit whose whole subject is the
//     narrative, publishing the durable artifact without it.
//   - `publishLibrary` began embedding annotations inline in the manifest → the carried exhibits
//     kept the old sidecar-only shape.
//   - Archie-9ea8 introduced the composed `ex-<exhibit>.<object>` id grammar → carried canvas dirs
//     kept bare `o1`/`m1` ids, so the published canvas IRIs disagreed with the seed that defines them.
//
// Each is invisible to `tsc`, to svelte-check, and to `static-pages.test.ts` — that suite proves
// `exhibitPageHtml` emits sections when handed them, which was true the entire time.
//
// What is asserted is the RELATIONSHIP, not any particular count: whatever the manifest says the
// exhibit contains, the page beside it must contain too. That survives content edits and fails on
// staleness, which is the only useful shape for a guard over generated output.

const PUBLISHED = join(fileURLToPath(new URL("..", import.meta.url)), "public", "published");

const exhibitSlugs = (): string[] =>
  readdirSync(PUBLISHED, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(PUBLISHED, d.name, "manifest.json")))
    .map((d) => d.name);

const read = (slug: string, file: string): string => readFileSync(join(PUBLISHED, slug, file), "utf8");

describe("the committed published tree is not stale", () => {
  it("every exhibit has both a manifest and an archival page", () => {
    const slugs = exhibitSlugs();
    expect(slugs.length).toBeGreaterThan(1);
    for (const slug of slugs) {
      expect(existsSync(join(PUBLISHED, slug, "index.html")), `${slug} has no index.html`).toBe(true);
    }
  });

  it("an exhibit's page carries every section its manifest declares", () => {
    // The exact defect that shipped. A Range in the manifest with no `section-` anchor in the page
    // means the generator moved on and the output did not.
    for (const slug of exhibitSlugs()) {
      const manifest = JSON.parse(read(slug, "manifest.json")) as { structures?: unknown[] };
      const declared = (manifest.structures ?? []).length;
      const rendered = (read(slug, "index.html").match(/id="section-/g) ?? []).length;
      expect(rendered, `${slug}: manifest declares ${declared} section(s), page renders ${rendered}`).toBe(declared);
    }
  });

  it("an exhibit with sections names them in the page", () => {
    // The heading is what makes the sections findable in a page read without CSS or JS — the whole
    // point of the archival artifact (ADR-0014).
    for (const slug of exhibitSlugs()) {
      const manifest = JSON.parse(read(slug, "manifest.json")) as { structures?: unknown[] };
      if ((manifest.structures ?? []).length === 0) continue;
      expect(read(slug, "index.html"), `${slug} has sections but no narrative heading`).toContain("The narrative");
    }
  });

  it("canvas directories use the composed id grammar the seed mints (Archie-9ea8)", () => {
    // Carried exhibits kept bare `o1`/`m1` dirs long after the grammar changed, so the published
    // canvas IRIs disagreed with the ids in the fixture that generates them — a silent break for
    // anything citing a canvas (ADR-0021's ladder).
    for (const slug of exhibitSlugs()) {
      const canvasDir = join(PUBLISHED, slug, "canvas");
      if (!existsSync(canvasDir)) continue;
      const manifest = JSON.parse(read(slug, "manifest.json")) as { items?: { id?: string }[] };
      const fromManifest = new Set((manifest.items ?? []).map((c) => (c.id ?? "").split("/").pop()));
      for (const dir of readdirSync(canvasDir)) {
        expect(fromManifest.has(dir), `${slug}/canvas/${dir} is not a canvas the manifest declares`).toBe(true);
      }
    }
  });

  it("every note the manifest carries inline is in the page", () => {
    // The inline-annotation shape landed in the generator and never reached the carried exhibits.
    for (const slug of exhibitSlugs()) {
      const manifest = JSON.parse(read(slug, "manifest.json")) as {
        items?: { annotations?: { items?: unknown[] }[] }[];
      };
      let inline = 0;
      for (const c of manifest.items ?? []) for (const ap of c.annotations ?? []) inline += (ap.items ?? []).length;
      if (inline === 0) continue;
      const rendered = (read(slug, "index.html").match(/id="note-/g) ?? []).length;
      expect(rendered, `${slug}: ${inline} inline annotation(s), page renders ${rendered} note(s)`).toBeGreaterThanOrEqual(inline);
    }
  });
});

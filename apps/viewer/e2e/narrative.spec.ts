import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-f08e (V86/V91) — the narrative journey: the spine's labels, and the door between the
// authored read and the object index.
//
// Both fixes are COPY, which is exactly why they need a guard: nothing in the toolchain can tell
// that a label repeats itself or that two controls name the same place differently, and copy is the
// first thing to drift when a component is edited for some other reason.
//
// Offline: the spine, its section labels and both seam controls all render from the local manifest.

test.describe("the spine's section labels (V86)", () => {
  test.beforeEach(async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    await expect(page.locator(".num").first()).toBeVisible();
  });

  test("a section never says its own name twice", async ({ page }) => {
    // Rendered before the fix: `HERBAL· F1R — HERBAL (OPENING PAGE)`. The section title and the
    // object label both carried the division name, so the reader was told "Herbal" twice in eleven
    // words — at `letter-spacing: 0.16em`, where repetition is loudest.
    // Read the two PARTS and join them with a space, rather than splitting the raw string. Two
    // earlier drafts of this assertion were defeated by the label itself: `allInnerTexts()` omits
    // the `.obj` span (layout-aware), and `textContent` concatenates the parts with no separator —
    // so "Herbal" + "f1r — Herbal" fused into the single token `Herbalf1r`, and a naive word split
    // saw no repetition. Both drafts passed against a deliberately reintroduced echo.
    const parts = await page.locator(".num").evaluateAll((els) =>
      els.map((n) => [(n.childNodes[0]?.textContent ?? "").trim(), (n.querySelector(".obj")?.textContent ?? "").trim()]));
    expect(parts.length).toBeGreaterThan(1);
    for (const [title, obj] of parts) {
      const words = `${title} ${obj}`.toLowerCase().replace(/[·—|()]/g, " ").split(/\s+/).filter((w) => w.length > 3);
      expect(new Set(words).size, `"${title} ${obj}" repeats a word`).toBe(words.length);
    }
  });

  test("when an object label IS shown it adds information, not an echo", async ({ page }) => {
    // The rule the fix encodes: carry the object label only when it does NOT already contain the
    // section title. A single-object narrative shows none at all, which is the case here.
    const pairs = await page.locator(".num").evaluateAll((els) =>
      els.map((n) => ({
        title: (n.childNodes[0]?.textContent ?? "").trim().toLowerCase(),
        obj: (n.querySelector(".obj")?.textContent ?? "").trim().toLowerCase(),
      })));
    for (const p of pairs) {
      if (!p.obj) continue;
      expect(p.obj.includes(p.title), `object label "${p.obj}" echoes section title "${p.title}"`).toBe(false);
    }
  });

  test("no label collides with its separator", async ({ page }) => {
    // Defect (a) of the same finding: the leading space inside `<span class="obj">` was trimmed at
    // compile time, rendering `Herbal· f1r`. If a separator is present it must have room around it.
    // Read the SEPARATOR too: it is a CSS `::before` on `.obj`, so neither innerText nor textContent
    // sees it. Ask the computed style directly, or this asserts nothing at all.
    const seps = await page.locator(".num .obj").evaluateAll((els) =>
      els.map((e) => ({
        before: getComputedStyle(e, "::before").content,
        text: e.textContent ?? "",
      })));
    for (const s of seps) {
      // Whatever the separator is, it must carry its own whitespace — the leading space inside the
      // span was being trimmed at compile time, rendering `Herbal· f1r` at 0.16em letter-spacing.
      expect(s.before, `separator ${s.before} before "${s.text}" has no leading space`).toMatch(/^"\s|^"[^"]*\s"$|none/);
    }
  });
});

test.describe("the door between the reading and the index (V91)", () => {
  test("the way out and the place it leads share a word", async ({ page }) => {
    // Four labels for two places, none using the other's word: the spine said "Narrative", leaving
    // said "▦ All objects", returning said "‹ Back to the reading", and the destination called
    // itself "EXHIBIT · 12 ITEMS". A first-time visitor had no way to know "All objects" and "Back
    // to the reading" were two directions of one door. Assert the SHARED NOUN, not the exact string.
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    const out = page.locator("button.to-index");
    await expect(out).toBeVisible();
    expect((await out.innerText()).toLowerCase()).toContain("items");

    await out.click();
    const heading = page.locator("text=/EXHIBIT · \\d+ ITEMS/i").first();
    await expect(heading).toBeVisible();
  });

  test("the way back names the reading, and actually returns to it", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    await expect(page.locator(".num").first()).toBeVisible(); // hydrate before counting
    const sectionsBefore = await page.locator(".num").count();
    expect(sectionsBefore).toBeGreaterThan(1);

    await page.locator("button.to-index").click();
    const back = page.locator("button.to-read");
    await expect(back).toBeVisible();
    expect((await back.innerText()).toLowerCase()).toContain("reading");

    // The round trip is the part copy alone can't promise: one quiet step back to where you were.
    await back.click();
    await expect(page.locator(".num")).toHaveCount(sectionsBefore);
  });
});

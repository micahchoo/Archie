import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// V100 / Archie-67b6 — the cite ladder's NOTE rung.
//
// It had never resolved, once. `route.ts` parses `#/<slug>/a/<id>` into ONE path segment; a published
// annotation id is the full IRI `{base}{slug}/annotations/{ULID}/v{n}`; `note-arrival.ts` compared the
// two with `===`. Nothing could satisfy it, and both halves were individually correct — the defect
// lived only in the seam, which is why it survived a green unit suite (whose fixture used the same
// string on both sides) and five hand-driven spellings in the audit.
//
// SO THIS DRIVES A REAL PUBLISHED ID, taken from the committed manifest at runtime rather than
// hard-coded. A literal would rot silently the next time the tree is regenerated, and would then
// assert the degrade path while looking like it asserts the happy one.
//
// `screenshots` deliberately: it is the only seed exhibit whose images are LOCAL, so this runs in the
// hermetic offline suite. Its notes also live only on READING pages, which makes the test stronger —
// arrival must flip the reading on, not merely find the object.

type Probe = { ulid: string; text: string };

/** A real note id + its body text, read from the published tree the app is about to serve. */
async function pickNote(baseURL: string): Promise<Probe> {
  const res = await fetch(new URL("published/screenshots/manifest.json", baseURL));
  const manifest = (await res.json()) as {
    items: Array<{ annotations?: Array<{ items?: Array<{ id: string; body?: unknown }> }> }>;
  };
  for (const canvas of manifest.items) {
    for (const page of canvas.annotations ?? []) {
      for (const a of page.items ?? []) {
        const tail = a.id.split("/annotations/")[1];
        const ulid = tail?.split("/")[0];
        const body = Array.isArray(a.body) ? a.body[0] : a.body;
        const text = (body as { value?: string } | undefined)?.value ?? "";
        if (ulid && text.length > 12) return { ulid, text };
      }
    }
  }
  throw new Error("no annotated note found in the published screenshots manifest");
}

test.describe("a cited note resolves from its address (V100)", () => {
  test("#/<slug>/a/<ULID> opens that exact note", async ({ page, baseURL }) => {
    const note = await pickNote(baseURL!);
    await goOffline(page);
    await page.goto(`./#/screenshots/a/${note.ulid}`);

    // The note card carries the cited note's OWN body — not merely "a note is open". Asserting that
    // some card appeared would pass against a resolver that landed on the first note of the exhibit,
    // which is exactly the plausible-looking wrong answer this bug produced.
    const card = page.locator(".note-pop, .note-card, aside li button.active").first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(page.locator("body")).toContainText(note.text.slice(0, 40), { timeout: 20000 });
  });

  test("the address survives a reload — the same note is still open", async ({ page, baseURL }) => {
    const note = await pickNote(baseURL!);
    await goOffline(page);
    await page.goto(`./#/screenshots/a/${note.ulid}`);
    await expect(page.locator("body")).toContainText(note.text.slice(0, 40), { timeout: 20000 });
    await page.reload();
    await expect(page.locator("body")).toContainText(note.text.slice(0, 40), { timeout: 20000 });
  });

  test("an unknown note id degrades honestly instead of throwing (ADR-0003)", async ({ page }) => {
    // Notes are append-only/tombstoned, so citations outlive their targets. A dead cite must land the
    // reader on the exhibit with a word about it — never a blank page or an uncaught error.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goOffline(page);
    await page.goto("./#/screenshots/a/01KVPQ3WXQ4PJ0614J4BEAC2XN"); // well-formed ULID, no such note
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 20000 });
    expect(errors, `uncaught: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("a malformed note id degrades too", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goOffline(page);
    await page.goto("./#/screenshots/a/not-a-real-id");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 20000 });
    expect(errors, `uncaught: ${errors.join(" | ")}`).toHaveLength(0);
  });
});

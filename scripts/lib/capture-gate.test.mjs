// Unit proof for the capture gate (Archie-b975) — node's built-in runner, no deps:
//   node --test scripts/lib/
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCaptureGate, MIN_SHOT_BYTES } from "./capture-gate.mjs";

const VP = ["desktop"];
const captured = (name) => ({ name, viewport: "desktop", status: "captured" });
const skipped = (name, detail) => ({ name, viewport: "desktop", status: "skipped", detail });
const sizes = (names, bytes = MIN_SHOT_BYTES + 1) => Object.fromEntries(names.map((n) => [`${n}.desktop.png`, bytes]));

test("all expected shots captured, on disk, above the floor → ok", () => {
  const expected = ["a", "b"];
  const r = evaluateCaptureGate({ manifest: expected.map(captured), expected, viewports: VP, fileSizes: sizes(expected) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test("one skipped entry fails, even when every expected shot captured (skip count must be 0)", () => {
  const expected = ["a"];
  const manifest = [captured("a"), skipped("extra-flow", "selector not found")];
  const r = evaluateCaptureGate({ manifest, expected, viewports: VP, fileSizes: sizes(expected) });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /skipped: extra-flow\.desktop — selector not found/);
});

test("an expected shot recorded skipped fails (the broken-selector path)", () => {
  const expected = ["a", "b"];
  const manifest = [captured("a"), skipped("b", "exhibit card not found")];
  const r = evaluateCaptureGate({ manifest, expected, viewports: VP, fileSizes: sizes(["a"]) });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /skipped: b\.desktop/);
});

test("an expected shot absent from the manifest entirely fails", () => {
  const expected = ["a", "b"];
  const r = evaluateCaptureGate({ manifest: [captured("a")], expected, viewports: VP, fileSizes: sizes(["a"]) });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /missing from manifest: b\.desktop/);
});

test("captured but no file on disk fails", () => {
  const expected = ["a"];
  const r = evaluateCaptureGate({ manifest: [captured("a")], expected, viewports: VP, fileSizes: {} });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /no file on disk: a\.desktop\.png/);
});

test("captured but below the size floor fails; at the floor passes", () => {
  const expected = ["a"];
  const below = evaluateCaptureGate({ manifest: [captured("a")], expected, viewports: VP, fileSizes: sizes(expected, MIN_SHOT_BYTES - 1) });
  assert.equal(below.ok, false);
  assert.match(below.problems.join("\n"), /below the \d+-byte floor/);
  const at = evaluateCaptureGate({ manifest: [captured("a")], expected, viewports: VP, fileSizes: sizes(expected, MIN_SHOT_BYTES) });
  assert.equal(at.ok, true);
});

test("100% skips (the historical silent-green run) fails loudly", () => {
  const expected = ["a", "b", "c"];
  const manifest = expected.map((n) => skipped(n, "net::ERR_CONNECTION_REFUSED"));
  const r = evaluateCaptureGate({ manifest, expected, viewports: VP, fileSizes: {} });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 3); // one per skip; nothing double-reported
});

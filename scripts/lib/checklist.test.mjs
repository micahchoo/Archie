import { test } from "node:test";
import assert from "node:assert/strict";
import { createChecklist } from "./checklist.mjs";

// Per-item tolerance is the module's reason to exist: a gate must not stop at the first failure —
// one broken check hides nothing behind it. That is asserted on the recorded results, not the
// printed lines (a PASS/FAIL line is only as good as the check that produced it).

test("every check runs and is recorded regardless of earlier failures", async () => {
  const seen = [];
  const checks = createChecklist({ onExit: (ctx) => seen.push(ctx) });
  checks.check(false, "first fails", "detail a");
  checks.check(true, "second passes", "detail b");
  checks.check(false, "third fails", "detail c");
  assert.equal(checks.results.length, 3);
  assert.deepEqual(checks.results.map((r) => r.pass), [false, true, false]);
  await checks.finish();
  assert.equal(seen.length, 1, "finish ran the gate's onExit exactly once");
});

test("finish hands onExit a summary context with correct counts", async () => {
  let ctx;
  const checks = createChecklist({ onExit: (c) => { ctx = c; } });
  checks.check(true, "a", "d");
  checks.check(true, "b", "d");
  checks.check(false, "c", "d");
  await checks.finish();
  assert.equal(ctx.total, 3);
  assert.equal(ctx.passed, 2);
  assert.deepEqual(ctx.failed.map((f) => f.label), ["c"]);
  assert.equal(ctx.results, checks.results);
});

test("check prints PASS/FAIL with the subject-carrying detail; indent prefixes the line", () => {
  const lines = [];
  const origLog = console.log;
  console.log = (s) => lines.push(s);
  try {
    const checks = createChecklist({ indent: "  " });
    checks.check(true, "label", "detail");
    checks.check(false, "label2", "detail2");
  } finally {
    console.log = origLog;
  }
  assert.deepEqual(lines, ["  PASS  label — detail", "  FAIL  label2 — detail2"]);
});

test("check returns its pass value", () => {
  const checks = createChecklist();
  assert.equal(checks.check(true, "x", "d"), true);
  assert.equal(checks.check(false, "y", "d"), false);
});

test("the default tail exits 0 when every check passed, 1 otherwise", async () => {
  const origExit = process.exit;
  let code;
  process.exit = (c) => { code = c; };
  try {
    let checks = createChecklist();
    checks.check(true, "a", "d");
    await checks.finish();
    assert.equal(code, 0);

    checks = createChecklist();
    checks.check(true, "a", "d");
    checks.check(false, "b", "d");
    await checks.finish();
    assert.equal(code, 1);
  } finally {
    process.exit = origExit;
  }
});

test("a gate's onExit fully replaces the default tail", async () => {
  const calls = [];
  const checks = createChecklist({
    onExit: (ctx) => { calls.push(ctx.failed.length); },
  });
  checks.check(false, "x", "d");
  await checks.finish();
  assert.deepEqual(calls, [1]);
});

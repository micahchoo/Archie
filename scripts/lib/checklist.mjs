// The ONE per-item-tolerant gate checklist (Archie Phase 9, Slice B).
//
// The four gate scripts (verify-publish-run.mts, bag-validate.mjs, export-fidelity.mjs,
// drive-published-tree.mjs) each re-implemented the same loop: a results array, a `check()` that
// prints PASS/FAIL with a subject-carrying DETAIL and NEVER stops at an earlier failure, a summary
// count, and an exit code. This module owns that loop once; the gates keep their check lists and
// pass their per-gate tail (summary text, exit-policy mapping) as parameters.
//
//   const checks = createChecklist({ indent, onExit });
//   checks.check(pass, label, detail); // tolerant: every check runs and prints, whatever came before
//   await checks.finish();             // summary + exit, via the gate's onExit or the default
//
// `finish()` computes { results, failed, passed, total } and hands it to `onExit` when given;
// otherwise it prints the default "\nN/M checks passed" line and exits 0 on all-pass, else 1.
// `onExit` may be async (export-fidelity's interleaves cleanup of its temp tree between its
// summary line and its RESULT line) and MUST exit or throw — the process must not fall through
// past the gate. `indent` prefixes every check line (export-fidelity's lines are indented two
// spaces to sit under its harness banner).
export function createChecklist({ indent = "", onExit } = {}) {
  const results = [];
  const check = (pass, label, detail) => {
    results.push({ pass, label, detail });
    console.log(`${indent}${pass ? "PASS" : "FAIL"}  ${label} — ${detail}`);
    return pass;
  };
  const finish = async () => {
    const failed = results.filter((r) => !r.pass);
    const ctx = { results, failed, passed: results.length - failed.length, total: results.length };
    if (onExit) return onExit(ctx);
    console.log(`\n${ctx.passed}/${ctx.total} checks passed`);
    process.exit(ctx.failed.length === 0 ? 0 : 1);
  };
  return { check, finish, results };
}

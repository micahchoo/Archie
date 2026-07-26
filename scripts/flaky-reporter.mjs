// A Playwright reporter that makes a RETRIED-BUT-PASSED test visible instead of letting it fold into
// the green tally.
//
// WHY THIS EXISTS. `retries: 1` in CI is deliberate — these suites drive a real browser under variable
// runner load, and a build that reds on infrastructure noise gets ignored, which is its own silent
// failure. But the retry is also how a real defect nearly shipped on 2026-07-26: the narrative scroll
// guard ended its suppression on a wall-clock "column went quiet" heuristic, which a single 160ms
// frame stall could fire mid-animation. That is a LOAD-SENSITIVE bug — it reproduces when the machine
// is busy and not otherwise — so it presented exactly like runner noise. It was caught only because a
// reviewer's first run happened to be under contention and they read the FAILURE rather than the final
// tally. See `.claude/rules/wall-clock-quiet-is-a-load-sensitive-gate.md`.
//
// So the ruling (human, 2026-07-26): keep the retry, surface the flake. Not silent, not fatal.
//
// Playwright already counts these as `flaky` in its own summary line, and that is precisely the
// problem — one word at the end of a 130-line log, below a large green number. This reporter raises it
// to a GitHub annotation (visible on the PR without opening the log) and to the job summary, carrying
// the FIRST run's error, which is the thing worth reading.
//
// Deliberately NOT here: failing the build on a flake. That was considered and declined — see the
// options recorded in `ledgers/HANDOFF-viewer-ux-2026-07-26.md`. If that changes, the change is
// `process.exitCode` in `onEnd`, and it should be a stated decision rather than a quiet tightening.

import { appendFileSync } from "node:fs";

/** GitHub Actions eats newlines in annotations; `%0A` is the documented escape. */
const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

/** First line of the first attempt's error — the diagnostic the retry threw away. */
function firstFailure(result) {
  const err = result.errors?.[0] ?? result.error;
  if (!err) return "no error recorded on the first attempt";
  const msg = String(err.message ?? err).split("\n").slice(0, 3).join("\n");
  // Playwright colourises messages even in non-tty capture; strip so the annotation is readable.
  return msg.replace(/\[[0-9;]*m/g, "").trim();
}

export default class FlakyReporter {
  constructor() {
    /** @type {{ title: string, location: string, attempts: number, first: string }[]} */
    this.flaky = [];
  }

  onTestEnd(test, result) {
    // `status === "passed"` on a result whose `retry > 0` is the retried-but-passed case. Guard on the
    // TEST's outcome too: a test that failed every attempt is a plain failure and already loud.
    if (result.retry > 0 && result.status === "passed" && test.outcome() === "flaky") {
      const first = test.results.find((r) => r.retry === 0);
      this.flaky.push({
        title: test.titlePath().filter(Boolean).join(" › "),
        location: `${test.location.file.split("/").slice(-2).join("/")}:${test.location.line}`,
        attempts: result.retry + 1,
        first: first ? firstFailure(first) : "first attempt not retained",
      });
    }
  }

  onEnd() {
    if (this.flaky.length === 0) return;

    for (const f of this.flaky) {
      // `::warning::` rather than `::error::` — the build is green and should look green; this is a
      // thing to read, not a thing that blocks.
      process.stdout.write(
        `::warning file=${f.location.split(":")[0]},line=${f.location.split(":")[1]}::` +
          `PASSED ON RETRY (${f.attempts} attempts) — ${esc(f.title)}%0A%0Afirst run:%0A${esc(f.first)}\n`,
      );
    }

    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      const lines = [
        `### ⚠ ${this.flaky.length} test${this.flaky.length === 1 ? "" : "s"} passed only on retry`,
        "",
        "The build is green. These are recorded because a load-sensitive DEFECT looks exactly like",
        "runner noise — read the first-run failure before assuming infrastructure.",
        "",
      ];
      for (const f of this.flaky) {
        lines.push(`- **${f.title}**  \n  \`${f.location}\` · ${f.attempts} attempts`, "", "  ```", ...f.first.split("\n").map((l) => `  ${l}`), "  ```", "");
      }
      appendFileSync(summary, lines.join("\n") + "\n");
    }

    // Also to stdout, because a local `CI=1` run has neither annotations nor a step summary.
    process.stdout.write(`\n  ⚠ ${this.flaky.length} passed ON RETRY — see the annotations above.\n`);
  }
}

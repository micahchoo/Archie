#!/usr/bin/env node
// qa/gate.mjs — computes the /goal completion verdict from the canonical QA ledger.
//
//   node qa/gate.mjs         → print the verdict line (the /goal evaluator reads this)
//   node qa/gate.mjs --csv   → emit the derived spreadsheet view to stdout
//
// qa/features.jsonl is canonical. For a persisted CSV file use qa/sync-csv.mjs.
import { readFeatures, readState, toCsv } from './lib.mjs';

const features = readFeatures();

if (process.argv.includes('--csv')) {
  process.stdout.write(toCsv(features));
  process.exit(0);
}

const state = readState();
const HIGH = new Set(['high', 'critical']);
const PASSED = new Set(['pass', 'waived']);

const browser = features.filter((f) => f.harness === 'browser');
const browserDone = browser.filter((f) => PASSED.has(f.status));
const openHigh = features.filter((f) => f.status === 'fail' && HIGH.has(f.severity));
const flaky = features.filter((f) => f.status === 'flaky');
const waived = features.filter((f) => f.status === 'waived');

const dryOK = state.discoveryDryStreak >= 2;
const browserOK = browser.length > 0 && browserDone.length === browser.length;
const highOK = openHigh.length === 0;
const complete = dryOK && browserOK && highOK;

const tag = complete ? 'COMPLETE' : 'INCOMPLETE';

console.log(
  `GOAL: ${tag} — discovery-dry ${state.discoveryDryStreak}/2 · ` +
  `browser-pass ${browserDone.length}/${browser.length} · ` +
  `open Sev≥High ${openHigh.length} · flaky ${flaky.length} · ` +
  `waived ${waived.length} · turn ${state.turn}`
);

// exit 0 = complete; 1 = keep going (for CI callers). The /goal evaluator keys on
// the printed "GOAL: COMPLETE" string, not this code.
process.exit(complete ? 0 : 1);

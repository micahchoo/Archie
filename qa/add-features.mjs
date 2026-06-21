#!/usr/bin/env node
// qa/add-features.mjs — record a discovery pass. Appends ONLY features whose id is
// not already in the ledger (dedupe by id), then updates the discovery dry-streak.
// This makes termination mechanical: the loop can't keep re-finding the same
// features and resetting the streak, because duplicates are dropped here.
//
//   node qa/add-features.mjs candidates.jsonl   # file: one feature per line
//   node qa/add-features.mjs < candidates.jsonl  # or stdin
//   node qa/add-features.mjs                     # empty pass (0 new) — bumps the streak
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { readFeatures, readState } from './lib.mjs';

const FEATURES = new URL('features.jsonl', import.meta.url);
const STATE = new URL('state.json', import.meta.url);

// candidates: file arg, or stdin if piped, or none (an empty/dry pass)
const fileArg = process.argv[2];
let raw = '';
if (fileArg) raw = readFileSync(fileArg, 'utf8');
else if (!process.stdin.isTTY) { try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ } }

const candidates = raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
  try { return JSON.parse(l); }
  catch (e) { console.error(`candidate line ${i + 1}: ${e.message}`); process.exit(2); }
});

const existing = new Set(readFeatures().map((f) => f.id)); // throws on pre-existing dup
const seen = new Set();
const fresh = [];
let dupes = 0;
for (const c of candidates) {
  if (!c.id) { console.error('candidate missing required "id" field'); process.exit(2); }
  if (existing.has(c.id) || seen.has(c.id)) { dupes++; continue; }
  seen.add(c.id);
  fresh.push(c);
}

if (fresh.length) {
  appendFileSync(FEATURES, fresh.map((f) => JSON.stringify(f)).join('\n') + '\n');
}

const state = readState();
state.lastFeatureCount = existing.size + fresh.length;
state.discoveryDryStreak = fresh.length === 0 ? state.discoveryDryStreak + 1 : 0;
writeFileSync(STATE, JSON.stringify(state) + '\n');

console.log(`discovery: ${fresh.length} new, ${dupes} duplicate(s) skipped — dry-streak ${state.discoveryDryStreak}/2`);

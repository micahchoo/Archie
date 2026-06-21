#!/usr/bin/env node
// qa/sync-csv.mjs — regenerate qa/features.csv from the canonical qa/features.jsonl.
// features.csv is a DERIVED, read-only view for human reading; never hand-edit it.
//
//   node qa/sync-csv.mjs          write qa/features.csv
//   node qa/sync-csv.mjs --check  exit 1 if features.csv is stale (CI / pre-commit)
//   node qa/sync-csv.mjs --watch  rewrite on every change to features.jsonl
import { readFileSync, writeFileSync, watch } from 'node:fs';
import { readFeatures, toCsv } from './lib.mjs';

const CSV = new URL('features.csv', import.meta.url);
const JSONL = new URL('features.jsonl', import.meta.url);

const current = () => toCsv(readFeatures());
const write = () => { const csv = current(); writeFileSync(CSV, csv); return csv; };

const arg = process.argv[2];

if (arg === '--check') {
  let onDisk = '';
  try { onDisk = readFileSync(CSV, 'utf8'); } catch { /* missing == stale */ }
  if (onDisk !== current()) {
    console.error('qa/features.csv is stale — run: node qa/sync-csv.mjs');
    process.exit(1);
  }
  console.log('qa/features.csv is in sync.');
} else if (arg === '--watch') {
  write();
  console.log('watching qa/features.jsonl -> qa/features.csv (Ctrl+C to stop)');
  let t;
  watch(JSONL, () => {
    clearTimeout(t);
    t = setTimeout(() => { try { write(); console.log('synced'); } catch (e) { console.error(e.message); } }, 50);
  });
} else {
  write();
  console.log('wrote qa/features.csv');
}

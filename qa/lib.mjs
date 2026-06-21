// qa/lib.mjs — shared QA-ledger helpers. One source of truth for reading the
// canonical store and for the CSV format, so gate.mjs and sync-csv.mjs can't drift.
import { readFileSync } from 'node:fs';

const here = new URL('./', import.meta.url);

export function readFeatures() {
  const txt = readFileSync(new URL('features.jsonl', here), 'utf8');
  const feats = txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); }
    catch (e) { throw new Error(`features.jsonl line ${i + 1}: ${e.message}`); }
  });
  // ids must be unique — a duplicate would inflate the feature count and keep the
  // dry-streak from ever converging (the loop's only termination guard).
  const seen = new Set();
  for (const f of feats) {
    if (seen.has(f.id)) throw new Error(`duplicate feature id: ${f.id} — ids must be unique`);
    seen.add(f.id);
  }
  return feats;
}

export function readState() {
  return JSON.parse(readFileSync(new URL('state.json', here), 'utf8'));
}

// Column order of the derived spreadsheet view.
export const CSV_COLS = ['id', 'name', 'harness', 'status', 'severity', 'defects',
  'story', 'expected', 'edges', 'tests', 'lastTested', 'notes'];

export function toCsv(features) {
  const cell = (v) => {
    const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLS.join(',')];
  for (const f of features) lines.push(CSV_COLS.map((c) => cell(f[c])).join(','));
  return lines.join('\n') + '\n';
}

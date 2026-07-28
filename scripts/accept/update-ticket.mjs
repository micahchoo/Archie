// Write a findings file back onto an `sd` ticket's description, safely.
//
// TWO GUARDS, both of which this repo has been bitten by:
//   1. `sd show --json` wraps the issue — the description is at `.issue.description`, and the wrong
//      path yields `null` SILENTLY. A read-modify-write over `null` erases the ticket.
//   2. `sd list` truncates at `--limit 50` without saying so. Not used here; noted because any count
//      taken from `sd` needs `sd stats` to reconcile against.
//
// So: read, assert non-empty, assert the new text CONTAINS the old (this is an append, never a
// replace), write, then read back and assert the marker landed.
//
// Usage: node scripts/accept/update-ticket.mjs <id> <file> <marker>
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [id, file, marker] = process.argv.slice(2);
if (!id || !file || !marker) { console.error("usage: update-ticket.mjs <id> <file> <marker>"); process.exit(2); }

const read = () => {
  const raw = execFileSync("sd", ["show", id, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const d = JSON.parse(raw)?.issue?.description;
  if (typeof d !== "string" || d.length === 0) throw new Error(`refusing: .issue.description is ${typeof d} (len ${d?.length ?? 0}) — a read-modify-write over that would erase the ticket`);
  return d;
};

const before = read();
const next = fs.readFileSync(file, "utf8");
if (next.length < before.length) throw new Error(`refusing: new description (${next.length}) is SHORTER than the current one (${before.length}) — this is an append, not a replace`);
if (!next.startsWith(before.slice(0, 200))) throw new Error("refusing: the new description does not begin with the current one — not an append");
console.log(`current ${before.length} chars -> new ${next.length} chars`);

execFileSync("sd", ["update", id, "--description", next], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const after = read();
if (after.length !== next.length) throw new Error(`round trip mismatch: wrote ${next.length}, read back ${after.length}`);
if (!after.includes(marker)) throw new Error(`round trip missing marker ${JSON.stringify(marker)}`);
console.log(`OK — ${id} description is ${after.length} chars and carries ${JSON.stringify(marker)}`);

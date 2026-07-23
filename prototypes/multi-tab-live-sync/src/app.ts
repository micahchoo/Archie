// THROWAWAY PROTOTYPE (ticket Archie-a66d / D1). Delete once the D1 ledger is written.
//
// The visible surface. Crude on purpose — this is a LOGIC demo, not design work. It proves the
// REAL render-core spine (appendNew / appendEdit / projectHeads / headsOf / resolveConflict,
// imported verbatim below) reconciles concurrent multi-tab annotation edits over the Model B
// Yjs rev-log transport. Nothing about the merge is reimplemented here.

// ---- REAL render-core machinery (NOT stubbed) ------------------------------------------------
import { appendNew, appendEdit } from "../../../packages/render-core/src/spine/log.js";
import { headsOf, resolveConflict } from "../../../packages/render-core/src/spine/merge.js";
import { projectHeads } from "../../../packages/render-core/src/spine/heads.js";
import type { AnnotationLog, AnnotationRecord, W3CBody } from "../../../packages/render-core/src/wadm/types.js";
import type { LogicalId, ClientId } from "../../../packages/render-core/src/wadm/brand.js";
// ----------------------------------------------------------------------------------------------

import { RevLogTransport } from "./rev-log.js";
import { SEED_RECORDS, bodyText } from "./seed.js";

const mkBody = (value: string): W3CBody => ({
  type: "TextualBody",
  value,
  format: "text/plain",
  purpose: "commenting",
});

// Each tab is its own author. This is Archie's real author identity field (lastEditor: ClientId).
const CLIENT_ID = `tab-${Math.random().toString(36).slice(2, 7)}` as ClientId;

const transport = new RevLogTransport();
transport.seed(SEED_RECORDS);

const $ = (id: string) => document.getElementById(id)!;

function setStatus(msg: string, isError = false): void {
  const el = $("status");
  el.textContent = msg;
  el.style.color = isError ? "#b00" : "#060";
}

// ---- actions ---------------------------------------------------------------------------------

function addAnnotation(): void {
  const text = (($("new-body") as HTMLInputElement).value || "").trim();
  if (!text) return setStatus("enter body text first", true);
  const { record } = appendNew(transport.log(), {
    target: `local://prototype/canvas/1#xywh=0,0,100,100`,
    body: mkBody(text),
    lastEditor: CLIENT_ID,
  });
  transport.commit([record]);
  ($("new-body") as HTMLInputElement).value = "";
  setStatus(`added ${record.logicalId} (rev ${short(record.rev)})`);
}

function editAnnotation(lid: LogicalId, text: string): void {
  try {
    const { record } = appendEdit(transport.log(), lid, {
      body: mkBody(text),
      lastEditor: CLIENT_ID,
    });
    transport.commit([record]);
    setStatus(`edited ${lid} -> rev ${short(record.rev)} by ${CLIENT_ID}`);
  } catch (e) {
    // appendEdit throws on plural heads — expected when a conflict is open; resolve first.
    setStatus(`edit refused: ${(e as Error).message}`, true);
  }
}

function resolveWith(lid: LogicalId, chosen: AnnotationRecord): void {
  const nextLog = resolveConflict(transport.log(), lid, {
    body: chosen.body,
    target: chosen.target,
    lastEditor: CLIENT_ID,
  });
  transport.commit(nextLog);
  setStatus(`resolved ${lid}: kept "${bodyText(chosen.body)}" (merge node by ${CLIENT_ID})`);
}

// ---- render ----------------------------------------------------------------------------------

const short = (id: string) => id.slice(-6);

function render(): void {
  const log: AnnotationLog = transport.log();
  const lids: LogicalId[] = [...new Set(log.map((r) => r.logicalId))];

  const container = $("annotations");
  container.innerHTML = "";

  for (const lid of lids) {
    const heads = headsOf(log, lid);
    const revCount = log.filter((r) => r.logicalId === lid).length;

    const card = document.createElement("div");
    card.className = heads.length > 1 ? "card conflict" : "card";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${lid}  ·  revs: ${revCount}  ·  heads: ${heads.length}`;
    card.appendChild(meta);

    if (heads.length > 1) {
      // CONFLICT panel — two+ heads, each a branch to review. This is exactly what Archie's async
      // MergeReview surfaces; here it appeared live from a concurrent two-tab edit.
      const banner = document.createElement("div");
      banner.className = "banner";
      banner.textContent = `CONFLICT — ${heads.length} concurrent heads. Pick one to resolve (appends a real merge node):`;
      card.appendChild(banner);

      for (const h of heads) {
        const branch = document.createElement("div");
        branch.className = "branch";
        branch.innerHTML =
          `<span class="branch-body">"${escapeHtml(bodyText(h.body))}"</span>` +
          `<span class="branch-meta">lastEditor=${h.lastEditor} · rev=${short(h.rev)}</span>`;
        const pick = document.createElement("button");
        pick.textContent = "pick this one";
        pick.onclick = () => resolveWith(lid, h);
        branch.appendChild(pick);
        card.appendChild(branch);
      }
    } else {
      // Single resolved head — show body + an edit box.
      const head = heads[0]!;
      const body = document.createElement("div");
      body.className = "body";
      body.textContent = bodyText(head.body) || "(no body)";
      card.appendChild(body);

      const row = document.createElement("div");
      row.className = "editrow";
      const input = document.createElement("input");
      input.value = bodyText(head.body);
      input.className = "editbox";
      const btn = document.createElement("button");
      btn.textContent = "edit body";
      btn.onclick = () => editAnnotation(lid, input.value.trim());
      row.appendChild(input);
      row.appendChild(btn);
      card.appendChild(row);
    }

    container.appendChild(card);
  }

  // Whole-log state surface: total revs + a projected-heads count (tombstones excluded).
  const live = projectHeads(log);
  $("logstate").textContent =
    `client: ${CLIENT_ID}  ·  total revs in log: ${log.length}  ·  live annotations (projectHeads): ${live.length}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// ---- wire up ---------------------------------------------------------------------------------

transport.subscribe(render);
($("add-btn") as HTMLButtonElement).onclick = addAnnotation;
render();
setStatus(`ready — open this URL in a second tab to test live sync. You are ${CLIENT_ID}.`);

// Debug hook for manual "go offline" testing and automated two-tab verification. Pausing both
// tabs, editing the same annotation in each, then resuming produces the 2-head conflict.
(window as unknown as { __d1: unknown }).__d1 = {
  clientId: CLIENT_ID,
  transport,
  edit: (lid: string, text: string) => editAnnotation(lid as LogicalId, text),
  log: () => transport.log(),
};

// THROWAWAY PROTOTYPE (ticket Archie-a66d / D1). Delete once the D1 ledger is written.
//
// The Model B transport (ledgers/PROBE-collab-crdt-mapping.md). Yjs holds the append-only
// annotation rev-log as a GROW-ONLY `Y.Map<rev, AnnotationRecord>` — pure transport. Archie's
// own DAG merge (heads / resolveConflict, imported REAL from render-core) does all reconciliation.
// Model A (mapping annotation FIELDS into a Y.Map) is rejected by the probe and NOT built here.
//
// Cross-tab sync rides BroadcastChannel: every local Yjs update rebroadcasts the whole doc state
// (grow-only + tiny, so full-state applyUpdate is idempotent and needs no delta protocol — the
// production path would send deltas / use y-webrtc, but full-state is bulletproof for the demo).

import * as Y from "yjs";
import type { AnnotationLog, AnnotationRecord } from "../../../packages/render-core/src/wadm/types.js";

const CHANNEL = "archie-d1-multi-tab-live-sync";
const LOG_KEY = "revlog";

type WireMessage =
  | { kind: "state"; state: Uint8Array }
  | { kind: "sync-request" };

export class RevLogTransport {
  readonly doc = new Y.Doc();
  private readonly yLog: Y.Map<AnnotationRecord>;
  private readonly bc: BroadcastChannel;
  private onChange: () => void = () => {};
  // Sync gate — simulates a tab briefly going offline. Lets two tabs each append an edit off the
  // SAME head without seeing each other (true concurrency), then converge on resume to 2 heads.
  private paused = false;

  constructor() {
    this.yLog = this.doc.getMap<AnnotationRecord>(LOG_KEY);
    this.bc = new BroadcastChannel(CHANNEL);

    // A local mutation -> broadcast full doc state to peer tabs. Guard the "remote" origin so an
    // applied peer update never echoes back (no ping-pong).
    this.doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      this.post({ kind: "state", state: Y.encodeStateAsUpdate(this.doc) });
    });

    this.bc.onmessage = (ev: MessageEvent<WireMessage>) => {
      if (this.paused) return; // offline: ignore peer traffic
      const msg = ev.data;
      if (msg.kind === "state") {
        Y.applyUpdate(this.doc, msg.state, "remote");
      } else if (msg.kind === "sync-request") {
        this.post({ kind: "state", state: Y.encodeStateAsUpdate(this.doc) });
      }
    };

    // Re-render on ANY rev-log change — local set or a converged remote update.
    this.yLog.observe(() => this.onChange());

    // Ask any already-open tab for its state so a late joiner catches up.
    this.post({ kind: "sync-request" });
  }

  private post(msg: WireMessage): void {
    if (this.paused) return; // offline: hold outgoing traffic
    this.bc.postMessage(msg);
  }

  /** Simulate this tab going offline (buffers nothing — just stops exchanging). */
  pause(): void {
    this.paused = true;
  }

  /** Come back online: broadcast full state and ask peers for theirs, converging both directions. */
  resume(): void {
    this.paused = false;
    this.bc.postMessage({ kind: "state", state: Y.encodeStateAsUpdate(this.doc) });
    this.bc.postMessage({ kind: "sync-request" });
  }

  /** The grow-only rev-log projected as an Archie AnnotationLog (the exact input the REAL
   *  heads / resolveConflict machinery consumes). */
  log(): AnnotationLog {
    return [...this.yLog.values()];
  }

  /** Insert every record in `next` not already transported (keyed by rev). Handles both a single
   *  appended record and a whole new log returned by resolveConflict (diffed by rev). Idempotent:
   *  the same rev landing from two tabs converges to ONE entry. */
  commit(next: AnnotationLog): void {
    this.doc.transact(() => {
      for (const r of next) {
        if (!this.yLog.has(r.rev)) this.yLog.set(r.rev, r);
      }
    });
  }

  /** Seed the shared starting point once (idempotent — keyed by the fixed seed revs). */
  seed(records: AnnotationRecord[]): void {
    this.commit(records);
  }

  subscribe(fn: () => void): void {
    this.onChange = fn;
  }
}

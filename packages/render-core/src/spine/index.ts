// @render/core/spine — the annotation spine (ADR-0003 / Q-3): the append-only log (source)
// and its projections (version-DAG merge, heads, history/WADM serialization).
export * from "./log.js";
export * from "./merge.js";
export * from "./heads.js";
// The section structure family (Archie-08af): SectionRecord + its append family ride the same
// generic DAG primitives; content helpers are parallel to (not shared with) the annotation ones.
export * from "./structure.js";
export * from "./serialize.js";
export * from "./deserialize.js";
export * from "./persist.js";

// Brand-id constructors + their types (wadm/brand.js) — re-exported so a spine consumer can
// construct branded ids (transport/CRDT mapping, server tier) without reaching through the heavy
// root barrel or `as`-casting. Costs nothing: brand.js is ALREADY in this entry's module graph
// as a value import (log.ts mints, deserialize.ts brands) — measured 11 modules before and after.
export {
  asClientId,
  asLogicalId,
  asRevId,
  type ClientId,
  type LogicalId,
  type RevId,
} from "../wadm/brand.js";

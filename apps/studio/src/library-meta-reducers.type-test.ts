// Type-level guard for ExhibitMetaPatch (Archie-d2cc, reviewer FIX 1). This file is checked ONLY by the
// `tsc --noEmit` gate (tsconfig.json), where `exactOptionalPropertyTypes` is ON — it is excluded from
// svelte-check (tsconfig.svelte-check.json), which relaxes that flag and would therefore see the
// `@ts-expect-error` pins below as "unused". No runtime tests here; the compile IS the assertion (vitest's
// `*.test.ts` glob does not pick this file up).
//
// The load-bearing property: a present-`undefined` on an OPTIONAL key is a legal CLEAR, but a present-
// `undefined` on a REQUIRED key must be a compile error — applyExhibitPatch DELETES any undefined-valued
// key, so allowing `{ title: undefined }` would let a caller corrupt an exhibit's identity.
import type { ExhibitMetaPatch } from "./library-meta-reducers.js";

// Optional fields: SET and CLEAR both legal.
const okClearRights: ExhibitMetaPatch = { rights: undefined };
const okSetRights: ExhibitMetaPatch = { rights: "http://cc/by" };
const okClearSummary: ExhibitMetaPatch = { summary: undefined };

// Required fields: SET legal…
const okSetTitle: ExhibitMetaPatch = { title: "still settable" };

// …CLEAR illegal (would delete the key and corrupt the exhibit).
// @ts-expect-error — `title` is required; present-`undefined` must not typecheck.
const badClearTitle: ExhibitMetaPatch = { title: undefined };
// @ts-expect-error — `objects` is required; present-`undefined` must not typecheck.
const badClearObjects: ExhibitMetaPatch = { objects: undefined };
// @ts-expect-error — `id` is required; present-`undefined` must not typecheck.
const badClearId: ExhibitMetaPatch = { id: undefined };

void okClearRights;
void okSetRights;
void okClearSummary;
void okSetTitle;
void badClearTitle;
void badClearObjects;
void badClearId;

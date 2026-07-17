// The carry-boundary guard idiom (ISSUES.md Issue 21).
//
// Every place that hand-spreads model fields from one shape to another —
// `...(x !== undefined ? {x} : {})` chains — is a DENYLIST pretending to be an allowlist: a field
// ADDED to the source type compiles clean at the boundary while silently not carrying. This class of
// bug already bit four times (sections/readings dropped by loadLibrary; note-copy dropping
// emphasis/wholeObject/geo). The fix is to make the COMPILER own the field inventory: a new field
// must fail loudly at every boundary until it is classified carry-or-drop.
//
// Two tools, used together:
//   • `CarryDisposition` + a `satisfies Record<keyof Source, CarryDisposition>` SENTINEL co-located
//     with a boundary — zero-runtime, it just fails to compile when Source grows an unclassified field.
//     Used at CROSS-type boundaries (serialize/deserialize/manifest/working↔library) where the output
//     shape differs from the input, so the mapping stays hand-written but every field is now forced to
//     be considered.
//   • `carryDefined<T>` — for SAME-type carries (an edit/merge that copies unchanged fields forward):
//     the plan IS the runtime source of truth for what carries, so a forgotten field is impossible
//     (the plan is `keyof`-exhaustive). Respects `exactOptionalPropertyTypes` (absent = omitted).

/** A field's disposition at a carry boundary: `"carry"` (copy it when present) or a NAMED deliberate
 *  exclusion. Value type of a `satisfies Record<keyof Source, CarryDisposition>` sentinel — the sentinel
 *  fails to compile when Source grows a field nobody classified. */
export type CarryDisposition = "carry" | { readonly drop: string };

/** An exhaustive per-field plan for a value of type `T` (every field of `T`, optionality stripped, must
 *  appear — that exhaustiveness IS the guard). */
export type CarryPlan<T> = { readonly [K in keyof Required<T>]-?: CarryDisposition };

/**
 * Copy the `"carry"`-dispositioned, DEFINED fields of `src` per `plan` — a SAME-type carry whose result
 * the boundary spreads into a fresh record. Structural, not hand-spread: `plan` (which is `keyof`-
 * exhaustive by its type) is the single source of truth for what carries, so a new field can't be
 * silently forgotten — it must be added to the plan, which forces a carry-or-drop decision. Respects
 * `exactOptionalPropertyTypes`: an absent (undefined) field is omitted, never set to `undefined`.
 */
export function carryDefined<T extends object>(src: T, plan: CarryPlan<T>): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(plan) as (keyof T)[]) {
    if (plan[key] === "carry") {
      const v = src[key];
      if (v !== undefined) out[key as string] = v;
    }
  }
  return out as Partial<T>;
}

# ADR-0022 — `<archie-viewer>` IIIF Content State interop: the `iiif-content` attribute

**Status:** accepted (2026-06-21, grill — user-gated)

## Context

ADR-0021 froze the `<archie-viewer>` target contract around a **native-route address** (`target=`),
carrying the full cite ladder, and explicitly **deferred** IIIF Content State to "an additive interop
layer" — noting the codec already existed in `@render/core` (its rejected-alternative §3 and the
`target` bullet both say `iiif-content` MAY be accepted later). This ADR realizes that deferred note.

The codec was never speculative: `encodeContentState` / `decodeContentState` live in `@render/core`
`url/deeplink.ts` (a CLEAN-LIFT from anvil `share-url.ts`, spike-0001 module 4). They serialize an
annotation reference + Canvas as a **IIIF Presentation 3 Content State** — a `SpecificResource`
`Annotation` with `motivation: "highlighting"`, base64url-encoded. This is the field-standard,
cross-tool deep-link payload: the only addressing in this lineage that **other IIIF viewers can
consume** (`.scratch/Prior Art/08-linkable-navigable.md:27`).

Institutions that publish IIIF already run IIIF viewers — Mirador, Universal Viewer, clover. They share
and embed locations as Content State, not as Archie native routes. If an Archie embed accepts Content
State, those institutions can target it with the deep-link format they already produce, and hand the
embed's current location back to that ecosystem. Without it, Archie is an interop island: addressable
only by its own route grammar, invisible to the viewers a IIIF-publishing institution actually uses.

## Decision

The `<archie-viewer>` element accepts an **`iiif-content`** attribute carrying a base64url IIIF
Presentation 3 Content State. The interop pipeline (`packages/archie-viewer/src/content-state.ts`,
pure + headless-testable):

- **Decode via the existing codec.** `decodeContentState` (deeplink.ts) is the **validity gate** —
  it rejects non-`Annotation` / wrong-motivation / bad-base64 / bad-JSON payloads, returning null.
  `content-state.ts` additionally recovers the referenced resource IRI (`target.source`, the Canvas
  IRI) that the gate's return value drops, re-reading the same base64url JSON in lock-step.
- **Resolve IRI → internal target.** A **Canvas IRI** is matched directly against
  `exhibit.canvasIdByObject` (the authoritative per-object map) → `(slug, objectId)`. A **Manifest
  IRI** (or any IRI under an exhibit's `{base}{slug}/` canvas prefix) → `(slug)` only. The match
  becomes an internal `ViewerRoute`, carrying any `xywh=` / `t=` media fragment.
- **Apply via the existing target path.** The resolved route feeds the SAME
  `resolveExhibitTarget` / `#applyTarget` machinery a native `target` uses — so a region/time fragment
  rides the same surface-fit logic and degrades identically.
- **Degrade upward, never throw** (per ADR-0021). Malformed Content State → gallery. A valid Content
  State whose IRI no loaded exhibit owns (foreign / unknown) → gallery. No blank/error screen.
- **Native `target` wins precedence.** `iiif-content` is the interop fallback, consulted only when
  `target` is absent. The native route stays the primary contract.
- **Reverse interop.** `currentContentState()` encodes the currently-open object's Canvas as a Content
  State (whole-Canvas `SpecificResource`), so a host can hand the embed's location back to the IIIF
  ecosystem (share / embed-elsewhere). Returns null outside the reader view (gallery / exhibit-grid
  have no single Canvas) or for a Canvas-less object.

## Consequences

- **`iiif-content` is now part of the frozen embed public API**, extending ADR-0021's `src` / `target`
  / `offline` surface. Adding is allowed; renaming / removing is not. The attribute name and its
  degrade-upward semantics are the hard-to-reverse part once embedders use them.
- **Archie interoperates with the IIIF viewer ecosystem.** A Mirador / UV / clover Content State deep
  link can target an Archie embed; an Archie embed can emit one back. The institutional IIIF-interop
  lever ADR-0021 deferred is now realized.
- **The pre-existing `deeplink.ts` ADR-0022 reference (deeplink.ts:4) is now valid.** The codec, its
  consumers (`content-state.ts`, `element.ts`), and the prior-art note all cite a real ADR.
- **Bundle rule held** (ADR-0019): `content-state.ts` depends on `@render/core` only — no `apps/viewer`
  import — so the interop layer adds no Svelte-runtime weight to the embed.

## Alternatives rejected

- **Making `iiif-content` the *primary* target:** rejected — the native route is free (already the
  viewer's address-bar string, copied verbatim), covers the full cite ladder, and addresses Section /
  region / note rungs Content State cannot express cleanly. Content State is the interop **fallback**,
  not the primary contract; native `target` keeps precedence.
- **Not supporting Content State at all:** rejected — it would forfeit the institutional IIIF-interop
  lever. IIIF-publishing institutions run IIIF viewers and share locations as Content State; declining
  it makes an Archie embed unreachable by the field-standard deep-link format and untargetable by the
  very tools its host institution already operates.

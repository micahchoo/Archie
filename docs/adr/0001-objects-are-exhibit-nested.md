---
status: accepted
date: 2026-05-24
---

# Objects and their Notes are owned by the Exhibit (exhibit-nested), not a shared project pool

**Context & decision.** Objects (media items) and the Notes (annotations) on them are owned by the Exhibit that contains them and live inside it on disk; an Exhibit is self-contained and independently portable. They are **not** a Library-level shared pool that multiple Exhibits reference. Consequently "project-level annotation" (a locked frame) means a Note targeting the Library (`Collection` URI) or an Exhibit (`Manifest` URI) — curatorial/about prose — never a reusable Object.

**Read this before proposing a shared object pool.** We did not arrive here by default. Our own earlier design (the "shaky-ideas" notes) stated the *opposite* principle, and stated it as load-bearing: *"annotations don't belong to exhibits, they belong to objects (or the project); exhibits reference them; one annotation can appear in multiple exhibits; exhibits are views over the data, not the data itself."* That principle is correct in the abstract — reuse, single-source-of-truth for the scholarly record, no Omeka/Scalar conflation of data with narrative. We started there.

We moved off it deliberately, in favor of **self-contained, independently-portable Exhibits**: one Exhibit = one IIIF Manifest that owns its Canvases (IIIF's natural grain), one zippable/publishable unit, no resolver needed to assemble an Exhibit from scattered pools. The abstract reuse benefit was judged to be outweighed by that portability and simplicity for v1.

## Considered options

- **Shared project pool (rejected):** `objects/` + `annotations/` at Library level, Exhibits reference by URI; IIIF-legal (a Canvas URI can be referenced by multiple Manifests). Rejected: Exhibits stop being self-contained; you need a resolver and the Library (not the Exhibit) becomes the portability unit.
- **Hybrid (rejected):** shared pool + exhibit-local objects. Rejected: two homes for one kind of thing → permanent ambiguity in the merge/resolver code.

## Consequences

- **No cross-Exhibit reuse:** the same painting annotated in two Exhibits is two copies that drift independently. This is the price paid for self-containment, accepted knowingly.
- A future contributor who proposes "add a shared object pool to enable reuse" is re-opening *this* decision — the conversation already happened here; weigh against portability before reversing.
- "Linkable" across Exhibits is handled separately (see ADR on linkability / the source+projection arch doc), not by shared ownership.

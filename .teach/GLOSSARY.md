# Archie codebase glossary

The vocabulary this workspace uses. Product terms are seeded (the learner built the product);
**architecture terms are promoted here only once a lesson has landed and the learner can use
the term correctly** — this file is a record of compressed knowledge, not a dictionary to read.

## Product model

**Library**:
The top-level container — one authored body of work, and the unit that gets published.
_Avoid_: Project, collection, workspace

**Exhibit**:
A curated grouping inside a library, holding many objects and the prose that threads them.
_Avoid_: Album, gallery, chapter

**Object**:
One piece of media in an exhibit — a deep-zoom image, map, audio, or video file.
_Avoid_: Item, asset, media

**Note**:
A single annotation. Anchored at library, exhibit, object, region, time-range, or geographic
level, and stored as a W3C Web Annotation.
_Avoid_: Comment, label, tag

**Studio**:
The authoring app (`apps/studio`) — a Svelte SPA where the work is made.
_Avoid_: Editor, admin, CMS

**Viewer**:
The read-only published site (`apps/viewer`) — an Astro static build a visitor browses.
_Avoid_: Frontend, reader app, public site

## Architecture

**The layer rule**:
Dependencies flow one direction only — `core → mount → svelte → apps` — and the two apps never
import each other. Taught in [lesson 0001](lessons/0001-the-shape-of-the-repo.html).
_Avoid_: The architecture, the monorepo structure

_(More promoted as lessons land.)_
